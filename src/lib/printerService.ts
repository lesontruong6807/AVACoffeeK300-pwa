import { Capacitor } from '@capacitor/core';
import { db, StoreSettings } from '@/lib/database';

// Helper to remove Vietnamese diacritics (accents) to ensure correct printing on any device
export function removeDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đđ]/g, 'd')
    .replace(/[ĐĐ]/g, 'D')
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/[^ -~]/g, ''); // Keep only basic printable ASCII characters (space to tilde)
}

// Cấu hình chiều rộng chuẩn cho máy in nhiệt K80/K58 (40 ký tự giúp không bị tràn lề)
export const RECEIPT_WIDTH = 40;

// Helper to format receipt time in short format (e.g. "19:30 19/09")
export function formatShortReceiptTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${h}:${min} ${d}/${m}`;
}

// Helper to format a single line row with left-aligned and right-aligned text
export function formatRow(left: string, right: string, totalWidth: number = RECEIPT_WIDTH): string {
  const leftClean = removeDiacritics(left);
  const rightClean = removeDiacritics(right);
  const leftLen = leftClean.length;
  const rightLen = rightClean.length;
  const spacesNeeded = totalWidth - leftLen - rightLen;
  if (spacesNeeded <= 0) {
    // If the content is too long, truncate left part to fit
    const truncatedLeft = leftClean.slice(0, Math.max(5, totalWidth - rightLen - 1));
    const newSpaces = totalWidth - truncatedLeft.length - rightLen;
    return truncatedLeft + ' '.repeat(Math.max(1, newSpaces)) + rightClean;
  }
  return leftClean + ' '.repeat(spacesNeeded) + rightClean;
}

// Helper to format 3 columns: Tên món | Số lượng | Thành tiền (Chuẩn máy in K80 40 ký tự)
export function formatThreeColumns(
  col1: string,
  col2: string,
  col3: string,
  col1Width: number = 24,
  col2Width: number = 4,
  col3Width: number = 10
): string {
  const c1 = removeDiacritics(col1).slice(0, col1Width).padEnd(col1Width, ' ');
  const c2 = removeDiacritics(col2).slice(0, col2Width).padStart(col2Width, ' ');
  const c3 = removeDiacritics(col3).slice(0, col3Width).padStart(col3Width, ' ');
  return `${c1} ${c2} ${c3}`;
}

// ESC/POS Command Builder Class
class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  init() {
    this.buffer.push(0x1B, 0x40); // Initialize printer (ESC @)
    return this;
  }

  alignCenter() {
    this.buffer.push(0x1B, 0x61, 0x01); // Align center (ESC a 1)
    return this;
  }

  alignLeft() {
    this.buffer.push(0x1B, 0x61, 0x00); // Align left (ESC a 0)
    return this;
  }

  alignRight() {
    this.buffer.push(0x1B, 0x61, 0x02); // Align right (ESC a 2)
    return this;
  }

  bold(on: boolean) {
    this.buffer.push(0x1B, 0x45, on ? 0x01 : 0x00); // Bold on/off (ESC E n)
    return this;
  }

  fontSizeDouble() {
    this.buffer.push(0x1D, 0x21, 0x11); // Double width + Double height (GS ! 17)
    return this;
  }

  fontSizeNormal() {
    this.buffer.push(0x1D, 0x21, 0x00); // Normal font size (GS ! 0)
    return this;
  }

  text(str: string) {
    const cleanStr = removeDiacritics(str);
    for (let i = 0; i < cleanStr.length; i++) {
      this.buffer.push(cleanStr.charCodeAt(i));
    }
    return this;
  }

  line(str: string = '') {
    this.text(str);
    this.buffer.push(0x0A); // Line feed (LF)
    return this;
  }

  feed(lines: number = 1) {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  cut() {
    this.buffer.push(0x1D, 0x56, 0x00); // Cut paper (GS V 0)
    return this;
  }

  getBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderData {
  tableName: string;
  staffName: string;
  items: OrderItem[];
  discount: number;
  totalAmount: number;
  orderId: string;
  notes?: string;
}

// Build compact, paper-saving ESC/POS receipt data (Tiết kiệm tối đa giấy in, bố cục chuẩn)
export function buildReceiptBytes(orderData: OrderData, settings?: Partial<StoreSettings>): Uint8Array {
  const builder = new EscPosBuilder();
  const timeFormatted = formatShortReceiptTime(new Date());
  const storeName = settings?.store_name || 'AVA COFFEE';
  const divider = '-'.repeat(RECEIPT_WIDTH);

  // 1. Header quán (Chỉ in tên quán, bỏ địa chỉ & hotline để bill ngắn gọn tiết kiệm giấy)
  builder.alignCenter()
    .fontSizeDouble()
    .bold(true)
    .line(storeName)
    .fontSizeNormal()
    .bold(false)
    .line(divider);

  // 2. Thông tin Bàn & Giờ (Gộp chung 1 dòng để tiết kiệm giấy)
  builder.alignLeft()
    .bold(true)
    .line(formatRow(`BAN: ${orderData.tableName.toUpperCase()}`, timeFormatted, RECEIPT_WIDTH))
    .bold(false);

  if (orderData.notes && orderData.notes.trim()) {
    builder.line(`Ghi chu: ${removeDiacritics(orderData.notes.trim())}`);
  }

  builder.line(divider);

  // 3. Danh sách món (3 cột: TÊN MÓN - SL - T.TIỀN thay vì x2 x3)
  builder.bold(true)
    .line(formatThreeColumns('TEN MON', 'SL', 'T.TIEN', 24, 4, 10))
    .bold(false)
    .line(divider);

  orderData.items.forEach((item, index) => {
    const itemName = `${index + 1}. ${item.name}`;
    const cleanName = removeDiacritics(itemName);
    const qtyStr = String(item.quantity);
    const subtotalStr = `${item.subtotal.toLocaleString('vi-VN')}d`;

    // Nếu tên món vừa vặn trong 24 ký tự
    if (cleanName.length <= 24) {
      const lineStr = cleanName.padEnd(24, ' ') + ' ' + qtyStr.padStart(4, ' ') + ' ' + subtotalStr.padStart(10, ' ');
      builder.line(lineStr);
    } else {
      // Tên món dài: In tên món trước, dòng sau in số lượng và thành tiền canh đúng cột
      builder.line(cleanName);
      const line2 = ' '.repeat(25) + qtyStr.padStart(4, ' ') + ' ' + subtotalStr.padStart(10, ' ');
      builder.line(line2);
    }
  });

  builder.line(divider);

  // 4. Tổng tiền (Chỉ in các dòng thực sự cần thiết)
  if (orderData.discount > 0) {
    const totalItemsAmount = orderData.items.reduce((sum, item) => sum + item.subtotal, 0);
    builder.line(formatRow('Tien mon:', `${totalItemsAmount.toLocaleString('vi-VN')}d`, RECEIPT_WIDTH));
    builder.line(formatRow('Giam gia:', `-${orderData.discount.toLocaleString('vi-VN')}d`, RECEIPT_WIDTH));
  }

  // Dòng Tổng cộng in đậm nổi bật
  builder.bold(true)
    .line(formatRow('TONG CONG:', `${orderData.totalAmount.toLocaleString('vi-VN')}d`, RECEIPT_WIDTH))
    .bold(false)
    .line(divider);

  // 5. Chân trang
  builder.alignCenter();
  if (settings?.bill_footer && settings.bill_footer.trim()) {
    const lines = settings.bill_footer.split('\n');
    lines.forEach(l => {
      if (l.trim()) builder.line(removeDiacritics(l.trim()));
    });
  } else {
    builder.line('AVA COFFEE XIN CAM ON QUY KHACH !');
    builder.line('CHUC QUY KHACH NGON MIENG');
  }

  // Feed 5 dòng chuẩn cơ học để đẩy toàn bộ chữ qua khỏi lưỡi dao trước khi cắt (chống chém ngang chữ)
  builder.feed(5)
    .cut();

  return builder.getBuffer();
}

// =========================================================================
// BỘ NHỚ ĐỆM CHỐNG IN TRÙNG LẶP TOÀN CỤC (GLOBAL PRINT LOCK ENGINE)
// NGUYÊN TẮC VÀNG: Mỗi bill in ĐÚNG 1 LẦN. Chống in trùng lặp tuyệt đối!
// =========================================================================
export interface PrintedOrderRecord {
  printedAt: number;
  itemCount: number;
  itemIds: string[];
  totalAmount?: number;
  isPaid?: boolean;
}

const printedOrderHistory = new Map<string, PrintedOrderRecord>();

// Cooldown 15 giây chống mọi trường hợp in lặp (network duplicate, race condition, double click)
const RECENT_PRINT_COOLDOWN_MS = 15000;
const recentPrintTimestamps = new Map<string, number>();
const inFlightPrintKeys = new Set<string>();

/**
 * Tạo dấu vân tay (Fingerprint) duy nhất đại diện cho nội dung bill
 * Giúp phát hiện in trùng ngay cả khi mã đơn hàng tạm thời khác nhau
 */
export function getOrderFingerprint(orderData: Partial<OrderData>): string {
  const tablePart = (orderData.tableName || '').trim().toLowerCase();
  const totalPart = Math.round(orderData.totalAmount || 0);
  const itemsPart = (orderData.items || [])
    .map(i => `${removeDiacritics(i.name || '').trim().toLowerCase()}:${i.quantity}`)
    .sort()
    .join('|');
  return `${tablePart}__${totalPart}__${itemsPart}`;
}

// Khôi phục từ sessionStorage nếu người dùng tải lại trang trong cùng phiên bán hàng
if (typeof window !== 'undefined') {
  try {
    const raw = sessionStorage.getItem('ava_printed_orders_cache');
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        printedOrderHistory.set(k, v as PrintedOrderRecord);
      }
    }
  } catch (_) {}
}

function persistPrintedOrders() {
  if (typeof window !== 'undefined') {
    try {
      const obj: Record<string, PrintedOrderRecord> = {};
      const now = Date.now();
      let count = 0;
      for (const [k, v] of printedOrderHistory.entries()) {
        if (now - v.printedAt < 24 * 60 * 60 * 1000 && count < 300) {
          obj[k] = v;
          count++;
        }
      }
      sessionStorage.setItem('ava_printed_orders_cache', JSON.stringify(obj));
    } catch (_) {}
  }
}

/**
 * Kiểm tra xem đơn hàng đã từng được in chưa hoặc vừa in trong 15s gần đây
 * @param orderId Mã đơn hàng
 * @param currentItemCount Số lượng món hiện tại
 * @param orderData Dữ liệu đơn để kiểm tra vân tay nội dung bill
 */
export function isOrderAlreadyPrinted(
  orderId?: string, 
  currentItemCount?: number, 
  orderData?: Partial<OrderData>
): boolean {
  const now = Date.now();

  // 1. Kiểm tra Cooldown 15 giây theo orderId
  if (orderId && recentPrintTimestamps.has(`id:${orderId}`)) {
    const lastTime = recentPrintTimestamps.get(`id:${orderId}`)!;
    if (now - lastTime < RECENT_PRINT_COOLDOWN_MS) {
      return true;
    }
  }

  // 2. Kiểm tra Cooldown 15 giây theo vân tay nội dung bill
  if (orderData) {
    const fp = getOrderFingerprint(orderData);
    if (recentPrintTimestamps.has(`fp:${fp}`)) {
      const lastTime = recentPrintTimestamps.get(`fp:${fp}`)!;
      if (now - lastTime < RECENT_PRINT_COOLDOWN_MS) {
        return true;
      }
    }
  }

  // 3. Kiểm tra theo sổ lưu vết printedOrderHistory
  if (orderId) {
    const record = printedOrderHistory.get(orderId);
    if (record) {
      // Nếu số lượng món hiện tại nhiều hơn số món đã in -> có món mới bổ sung
      if (typeof currentItemCount === 'number' && currentItemCount > record.itemCount) {
        return false;
      }
      return true;
    }
  }

  return false;
}

export function getPrintedOrderInfo(orderId: string): PrintedOrderRecord | undefined {
  if (!orderId) return undefined;
  return printedOrderHistory.get(orderId);
}

/**
 * Đánh dấu đơn hàng đã được in vào sổ lưu vết toàn cục
 */
export function markOrderAsPrinted(
  orderId: string,
  detailsOrAction?: {
    itemCount?: number;
    itemIds?: string[];
    totalAmount?: number;
    isPaid?: boolean;
  } | 'create' | 'pay'
) {
  if (!orderId) return;
  const now = Date.now();
  recentPrintTimestamps.set(`id:${orderId}`, now);

  const existing = printedOrderHistory.get(orderId);

  let details: Partial<PrintedOrderRecord> = {};
  if (typeof detailsOrAction === 'object' && detailsOrAction !== null) {
    details = detailsOrAction;
  } else if (typeof detailsOrAction === 'string') {
    details = { isPaid: detailsOrAction === 'pay' };
  }

  const updated: PrintedOrderRecord = {
    printedAt: now,
    itemCount: details.itemCount ?? existing?.itemCount ?? 0,
    itemIds: details.itemIds ?? existing?.itemIds ?? [],
    totalAmount: details.totalAmount ?? existing?.totalAmount,
    isPaid: details.isPaid ?? existing?.isPaid ?? false
  };

  printedOrderHistory.set(orderId, updated);
  persistPrintedOrders();
}

/**
 * Xóa trạng thái đã in (khi hủy đơn)
 */
export function clearPrintLock(orderId: string) {
  if (!orderId) return;
  printedOrderHistory.delete(orderId);
  recentPrintTimestamps.delete(`id:${orderId}`);
  persistPrintedOrders();
}

/**
 * Kiểm tra quyền in nhanh
 */
export function tryAcquirePrintLock(orderId: string, action: 'create' | 'pay' | 'any' = 'any'): boolean {
  if (!orderId) return true;
  return !isOrderAlreadyPrinted(orderId);
}

// In hóa đơn trực tiếp (Tự động chuyển đổi giữa POS Desktop USB và Mobile Wi-Fi Print)
export async function printOrderDirect(
  orderData: OrderData,
  printerIP?: string,
  port?: number,
  options?: { force?: boolean; isManualUserReprint?: boolean }
): Promise<void> {
  const orderId = orderData.orderId;
  const itemCount = orderData.items?.length || 0;
  const fingerprint = getOrderFingerprint(orderData);
  const now = Date.now();
  const isExplicitManual = options?.isManualUserReprint === true;

  const orderLockKey = orderId ? `id:${orderId}` : `fp:${fingerprint}`;
  const fpLockKey = `fp:${fingerprint}`;

  // NGUYÊN TẮC: Chống in trùng lặp tuyệt đối trừ khi người dùng chủ động bấm 'In lại hóa đơn' trong modal
  if (!isExplicitManual) {
    // 1. Kiểm tra In-Flight Mutex (Đang có lệnh in đang thực thi dở)
    if (inFlightPrintKeys.has(orderLockKey) || inFlightPrintKeys.has(fpLockKey)) {
      console.log(`[printOrderDirect] BỎ QUA: Đơn ${orderId || fingerprint} đang trong tiến trình in. Không in đè!`);
      return;
    }

    // 2. Kiểm tra Cooldown 15 giây theo mã đơn
    if (orderId && recentPrintTimestamps.has(orderLockKey)) {
      const elapsed = now - recentPrintTimestamps.get(orderLockKey)!;
      if (elapsed < RECENT_PRINT_COOLDOWN_MS) {
        console.log(`[printOrderDirect] BỎ QUA IN TRÙNG: Đơn ${orderId} vừa được in cách đây ${elapsed}ms (< 15s).`);
        return;
      }
    }

    // 3. Kiểm tra Cooldown 15 giây theo nội dung vân tay bill
    if (recentPrintTimestamps.has(fpLockKey)) {
      const elapsed = now - recentPrintTimestamps.get(fpLockKey)!;
      if (elapsed < RECENT_PRINT_COOLDOWN_MS) {
        console.log(`[printOrderDirect] BỎ QUA IN TRÙNG: Nội dung bill (${orderData.tableName}) vừa được in cách đây ${elapsed}ms (< 15s).`);
        return;
      }
    }

    // 4. Kiểm tra lịch sử printedOrderHistory
    if (orderId && isOrderAlreadyPrinted(orderId, itemCount, orderData)) {
      console.log(`[printOrderDirect] Bỏ qua vì đơn ${orderId} đã được in trước đó (${itemCount} món). Không in trùng.`);
      return;
    }
  }

  // Khóa In-Flight và cập nhật Cooldown ngay tức thì
  inFlightPrintKeys.add(orderLockKey);
  inFlightPrintKeys.add(fpLockKey);
  recentPrintTimestamps.set(orderLockKey, now);
  recentPrintTimestamps.set(fpLockKey, now);

  // Đánh dấu ngay lập tức trước khi in để chặn đứng mọi race-condition từ Supabase Realtime / Postgres Changes
  if (orderId) {
    markOrderAsPrinted(orderId, {
      itemCount: itemCount,
      itemIds: (orderData.items || []).map((i: any) => i.product_id || i.id || i.name),
      totalAmount: orderData.totalAmount,
      isPaid: orderData.notes?.includes('ĐÃ THANH TOÁN') || orderData.notes?.includes('(ĐÃ THANH TOÁN)')
    });
  }

  try {
    const storeSettings = db.getStoreSettingsSync();
    const targetIP = printerIP || storeSettings.printer_ip || '192.168.1.167';
    const targetPort = port || storeSettings.printer_port || 9100;
    const receiptBytes = buildReceiptBytes(orderData, storeSettings);

    // 1. Kiểm tra môi trường Desktop Tauri (Windows POS cắm dây máy in USB / Spooler)
    try {
      const { isTauriEnvironment, silentPrintEscPos } = await import('@/lib/tauriPOS');
      if (isTauriEnvironment()) {
        console.log('[Tauri Desktop Mode] Initiating Silent ESC/POS printing...');
        const res = await silentPrintEscPos(receiptBytes, (storeSettings as any).printer_name);
        if (!res.success) {
          throw new Error(res.message || 'Lỗi in ngầm máy in Windows POS');
        }
        console.log('[Tauri Desktop Mode] Print sent successfully.');
        return;
      }
    } catch (tauriErr) {
      if ((tauriErr as any)?.message?.includes('Lỗi in ngầm')) {
        throw tauriErr;
      }
    }

    // 2. Môi trường Web App / Điện thoại nhân viên kết nối chung Wi-Fi với máy POS:
    // GỬI LỆNH QUA HTTP BRIDGE TRƯỚC TIÊN (Nhanh nhất & Trực tiếp qua mạng nội bộ)
    let isPrintedViaBridge = false;
    if (typeof window !== 'undefined') {
      const hostCandidates = [
        (storeSettings as any).pos_bridge_ip,
        typeof localStorage !== 'undefined' ? localStorage.getItem('pos_bridge_ip') : null,
        '192.168.1.212',
        window.location.hostname !== 'localhost' ? window.location.hostname : null,
        '127.0.0.1'
      ].filter(Boolean) as string[];

      const uniqueHosts = Array.from(new Set(hostCandidates));
      for (const host of uniqueHosts) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1800);
          const resp = await fetch(`http://${host}:3333/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: Array.from(receiptBytes),
              printerName: (storeSettings as any).printer_name || null
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (resp.ok) {
            console.log(`[Web Wi-Fi Print] Đã in bill thành công qua máy POS ${host}:3333`);
            isPrintedViaBridge = true;
            return; // ĐÃ IN THÀNH CÔNG QUA MẠNG NỘI BỘ -> KẾT THÚC, TUYỆT ĐỐI KHÔNG BROADCAST TRÁNH IN LẶP!
          }
        } catch (_) {
          // Tiếp tục thử host tiếp theo
        }
      }
    }

    // 3. NẾU VÀ CHỈ NẾU HTTP Bridge không thể kết nối (ví dụ dùng 4G ngoài vùng Wi-Fi quán):
    // Fallback phát sóng lệnh in qua Supabase Realtime Broadcast để máy POS tại quầy nhận diện và in
    if (!isPrintedViaBridge) {
      try {
        console.log('[Web Fallback] HTTP Wi-Fi không phản hồi, gửi lệnh in qua Supabase Cloud Realtime...');
        const { broadcastRealtimeEvent } = await import('@/lib/database');
        broadcastRealtimeEvent('order_update', {
          action: 'PRINT_RECEIPT',
          orderData,
          timestamp: Date.now()
        });
      } catch (bcErr) {
        console.warn('Lỗi broadcast lệnh in:', bcErr);
      }
    }

    // 4. Nếu chạy trong ứng dụng di động Capacitor native kết nối máy in IP mạng
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    console.log(`[Native Mode] Initiating TCP printing to ${targetIP}:${targetPort}`);
    
    let connection: any = null;
    try {
      const { TCPClient } = await import('@devioarts/capacitor-tcpclient');
      const connectionId = `printer-${Date.now()}`;
      connection = TCPClient.createConnection({
        connectionId,
        host: targetIP,
        port: targetPort
      });

      await connection.connect();
      await connection.write({ data: receiptBytes });
    } catch (error) {
      console.error('[TCP Print Error] Failed to print order:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          await connection.destroy();
        } catch (_) {}
      }
    }
  } finally {
    // Luôn giải phóng in-flight lock
    inFlightPrintKeys.delete(orderLockKey);
    inFlightPrintKeys.delete(fpLockKey);
  }
}

// In thử kết nối máy in (Test Ticket)
export async function printTestTicket(settings?: Partial<StoreSettings>): Promise<{ success: boolean; isWeb?: boolean; message: string }> {
  // Kiểm tra môi trường Desktop Tauri
  try {
    const { isTauriEnvironment, silentPrintEscPos } = await import('@/lib/tauriPOS');
    if (isTauriEnvironment()) {
      const currentSettings = { ...db.getStoreSettingsSync(), ...settings };
      const builder = new EscPosBuilder();
      const divider = '-'.repeat(RECEIPT_WIDTH);
      builder.alignCenter()
        .fontSizeDouble()
        .bold(true)
        .line(removeDiacritics(currentSettings.store_name || 'AVA COFFEE K300'))
        .fontSizeNormal()
        .bold(false)
        .line(divider)
        .bold(true)
        .line('*** TEST MAY IN WINDOWS POS (TAURI) ***')
        .bold(false)
        .line(`May in: USB / Windows Spooler`)
        .line(`Gio: ${formatShortReceiptTime(new Date())}`)
        .line(divider)
        .bold(true)
        .line('IN NGAM THANH CONG 100%!')
        .bold(false)
        .line(divider)
        .feed(4)
        .cut();

      const res = await silentPrintEscPos(builder.getBuffer());
      if (res.success) {
        return {
          success: true,
          message: 'In test thành công trên máy in Windows POS (Tauri Silent Print)!'
        };
      } else {
        return {
          success: false,
          message: res.message || 'Lỗi in test máy in'
        };
      }
    }
  } catch (e) {}

  // Kiểm tra in qua HTTP Print Bridge từ Web App / Điện thoại
  const currentSettings = { ...db.getStoreSettingsSync(), ...settings };
  const builder = new EscPosBuilder();
  const divider = '-'.repeat(RECEIPT_WIDTH);
  builder.alignCenter()
    .fontSizeDouble()
    .bold(true)
    .line(removeDiacritics(currentSettings.store_name || 'AVA COFFEE K300'))
    .fontSizeNormal()
    .bold(false)
    .line(divider)
    .bold(true)
    .line('*** TEST IN QUA WI-FI (WEB APP) ***')
    .bold(false)
    .line(`Kenh in: HTTP Print Bridge (Port 3333)`)
    .line(`Gio: ${formatShortReceiptTime(new Date())}`)
    .line(divider)
    .bold(true)
    .line('KET NOI MAY IN THANH CONG!')
    .bold(false)
    .line(divider)
    .feed(4)
    .cut();

  const testBytes = builder.getBuffer();

  // Phát sóng lệnh in test qua Supabase Realtime nếu máy POS đang mở
  try {
    const { broadcastRealtimeEvent } = await import('@/lib/database');
    broadcastRealtimeEvent('order_update', {
      action: 'PRINT_TEST',
      timestamp: Date.now()
    });
  } catch (_) {}

  const hostCandidates = [
    (currentSettings as any).pos_bridge_ip,
    typeof localStorage !== 'undefined' ? localStorage.getItem('pos_bridge_ip') : null,
    '192.168.1.212',
    typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? window.location.hostname : null,
    '127.0.0.1'
  ].filter(Boolean) as string[];

  const uniqueHosts = Array.from(new Set(hostCandidates));
  for (const host of uniqueHosts) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`http://${host}:3333/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: Array.from(testBytes),
          printerName: (currentSettings as any).printer_name || null
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        return {
          success: true,
          message: `In test thành công qua máy POS (${host}:3333)!`
        };
      }
    } catch (_) {}
  }

  // Kiểm tra môi trường Web: Trình duyệt web không thể mở TCP socket trực tiếp
  if (!Capacitor.isNativePlatform()) {
    return {
      success: false,
      isWeb: true,
      message: 'Không tìm thấy máy in quầy POS trên cổng 3333. Vui lòng đảm bảo máy POS đang bật ứng dụng AVA Coffee hoặc chạy dịch vụ in ngầm và chung Wi-Fi!'
    };
  }

  const targetIP = currentSettings.printer_ip || '192.168.1.167';
  const targetPort = Number(currentSettings.printer_port || 9100);

  const nativeBuilder = new EscPosBuilder();
  nativeBuilder.alignCenter()
    .fontSizeDouble()
    .bold(true)
    .line(removeDiacritics(currentSettings.store_name || 'AVA COFFEE'))
    .fontSizeNormal()
    .bold(false)
    .line(divider)
    .bold(true)
    .line('*** TEST KET NOI MAY IN ***')
    .bold(false)
    .line(`IP: ${targetIP}  Port: ${targetPort}`)
    .line(`Gio: ${formatShortReceiptTime(new Date())}`)
    .line(divider)
    .bold(true)
    .line('KET NOI THANH CONG 100%!')
    .bold(false)
    .line(divider)
    .feed(4)
    .cut();

  const payload = nativeBuilder.getBuffer();
  let connection: any = null;

  try {
    const { TCPClient } = await import('@devioarts/capacitor-tcpclient');
    const connectionId = `printer-test-${Date.now()}`;
    connection = TCPClient.createConnection({
      connectionId,
      host: targetIP,
      port: targetPort
    });

    await connection.connect();
    await connection.write({ data: payload });
    return {
      success: true,
      message: `In test thành công tới máy in ${targetIP}:${targetPort}!`
    };
  } catch (err: any) {
    console.error('[TCP Test Print Error]:', err);
    return {
      success: false,
      message: `Không thể kết nối máy in ${targetIP}:${targetPort}: ${err?.message || 'Vui lòng kiểm tra IP máy in và kết nối Wi-Fi/LAN!'}`
    };
  } finally {
    if (connection) {
      try {
        await connection.destroy();
      } catch (e) {
        console.error('[TCP Test Close Error]:', e);
      }
    }
  }
}
