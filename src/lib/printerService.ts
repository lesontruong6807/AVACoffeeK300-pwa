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
// Đảm bảo 1 đơn hàng khi lưu hay thanh toán chỉ in đúng 1 lần duy nhất
// =========================================================================
const printedOrderHistory = new Map<string, number>();

/**
 * Kiểm tra và giành quyền in cho một đơn hàng (Deduplication Lock)
 * @param orderId Mã đơn hàng (ord_..., OD-..., hoặc ID database)
 * @param action Loại hành động ('create' | 'pay' | 'any')
 * @returns boolean true nếu được phép in, false nếu đơn đã in gần đây
 */
export function tryAcquirePrintLock(orderId: string, action: 'create' | 'pay' | 'any' = 'any'): boolean {
  if (!orderId) return true;
  const now = Date.now();

  // 1. Khóa chống in lặp theo từng hành động cụ thể ('create' hoặc 'pay') trong vòng 8 giây
  const actionKey = `${orderId}_${action}`;
  const lastAction = printedOrderHistory.get(actionKey);
  if (lastAction && (now - lastAction) < 8000) {
    console.log(`[PrintLock] Đơn ${orderId} (${action}) vừa in cách đây ${now - lastAction}ms. Bỏ qua.`);
    return false;
  }

  // 2. Khóa tức thì chống race-condition (ví dụ Broadcast và Postgres Changes cùng đến cách nhau < 2.5s)
  // Chỉ áp dụng cho 'create', TUYỆT ĐỐI không dùng khóa này để chặn hành động 'pay' của khách!
  if (action !== 'pay') {
    const anyKey = `any_${orderId}`;
    const lastAny = printedOrderHistory.get(anyKey);
    if (lastAny && (now - lastAny) < 2500) {
      console.log(`[PrintLock] Đơn ${orderId} vừa in qua kênh khác cách đây ${now - lastAny}ms. Bỏ qua.`);
      return false;
    }
    printedOrderHistory.set(anyKey, now);
  }

  // Giành khóa in thành công
  printedOrderHistory.set(actionKey, now);

  // Tự động dọn dẹp các mục cũ hơn 2 phút
  if (printedOrderHistory.size > 200) {
    const cutoff = now - 120000;
    for (const [k, v] of printedOrderHistory.entries()) {
      if (v < cutoff) printedOrderHistory.delete(k);
    }
  }

  return true;
}

/**
 * Xóa khóa in của đơn hàng (dùng khi hủy đơn hoặc muốn cho phép in lại)
 */
export function clearPrintLock(orderId: string) {
  if (!orderId) return;
  printedOrderHistory.delete(`any_${orderId}`);
  printedOrderHistory.delete(`${orderId}_create`);
  printedOrderHistory.delete(`${orderId}_pay`);
  printedOrderHistory.delete(`${orderId}_any`);
}

export function markOrderAsPrinted(orderId: string, action: 'create' | 'pay' = 'create') {
  // Để printOrderDirect tự động quản lý khóa an toàn, tránh deadlock tự chặn chính mình
}

// In hóa đơn trực tiếp (Tự động chuyển đổi giữa POS Desktop USB và Mobile Wi-Fi Print)
export async function printOrderDirect(
  orderData: OrderData,
  printerIP?: string,
  port?: number,
  options?: { force?: boolean }
): Promise<void> {
  const orderId = orderData.orderId;
  const action: 'create' | 'pay' = (orderData.notes?.includes('ĐÃ THANH TOÁN') || orderData.notes?.includes('(ĐÃ THANH TOÁN)'))
    ? 'pay'
    : 'create';

  // Khóa chống in trùng lặp: Nếu không ép buộc in (re-print), chỉ in đúng 1 lần
  if (!options?.force && orderId) {
    if (!tryAcquirePrintLock(orderId, action)) {
      console.log(`[printOrderDirect] Bỏ qua vì đơn ${orderId} (${action}) đã được in trước đó.`);
      return;
    }
  }

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

  // 2. Phát sóng lệnh in qua Supabase Realtime Broadcast:
  // Giúp máy POS tại quầy nhận diện và tự động in ngay lập tức mà KHÔNG bị chặn Mixed Content trên trình duyệt điện thoại!
  try {
    const { broadcastRealtimeEvent } = await import('@/lib/database');
    broadcastRealtimeEvent('order_update', {
      action: 'PRINT_RECEIPT',
      orderData,
      timestamp: Date.now()
    });
  } catch (bcErr) {
    console.warn('Lỗi broadcast lệnh in:', bcErr);
  }

  // 3. Môi trường Web App / Điện thoại nhân viên kết nối chung Wi-Fi với máy POS:
  // Gửi lệnh in trực tiếp tới HTTP Print Bridge chạy ngầm trên máy POS (Port 3333)
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
        const timeoutId = setTimeout(() => controller.abort(), 2000);
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
          return;
        }
      } catch (_) {
        // Tiếp tục thử host tiếp theo
      }
    }
  }

  // 3. Nếu chạy trong ứng dụng di động Capacitor native kết nối máy in IP mạng
  if (!Capacitor.isNativePlatform()) {
    console.log('[Web Mode] Không tìm thấy máy in POS Wi-Fi nội bộ. Dữ liệu đơn:', orderData);
    return;
  }

  console.log(`[Native Mode] Initiating TCP printing to ${targetIP}:${targetPort}`);
  
  let connection: any = null;
  try {
    // Dynamic import of the plugin to ensure it's not resolved during web SSR builds
    const { TCPClient } = await import('@devioarts/capacitor-tcpclient');

    const receiptBytes = buildReceiptBytes(orderData, storeSettings);
    
    // Create socket connection
    const connectionId = `printer-${Date.now()}`;
    connection = TCPClient.createConnection({
      connectionId,
      host: targetIP,
      port: targetPort
    });

    console.log('[TCP] Connecting to printer...');
    await connection.connect();
    
    console.log('[TCP] Connected. Sending ESC/POS payload...');
    await connection.write({ data: receiptBytes });
    
    console.log('[TCP] Print payload sent successfully.');
  } catch (error) {
    console.error('[TCP Print Error] Failed to print order:', error);
    throw error;
  } finally {
    if (connection) {
      try {
        console.log('[TCP] Closing connection...');
        await connection.destroy();
      } catch (err) {
        console.error('[TCP Close Error] Failed to destroy connection:', err);
      }
    }
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
