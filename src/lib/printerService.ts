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

// Build compact, paper-saving ESC/POS receipt data (Tiết kiệm tối đa giấy in)
export function buildReceiptBytes(orderData: OrderData, settings?: Partial<StoreSettings>): Uint8Array {
  const builder = new EscPosBuilder();
  const timeFormatted = formatShortReceiptTime(new Date());
  const storeName = settings?.store_name || 'AVA COFFEE';
  const divider = '-'.repeat(RECEIPT_WIDTH);

  // 1. Header quán (Gọn gàng, không feed dòng trống)
  builder.alignCenter()
    .fontSizeDouble()
    .bold(true)
    .line(storeName)
    .fontSizeNormal()
    .bold(false);

  const contactList: string[] = [];
  if (settings?.store_address) contactList.push(removeDiacritics(settings.store_address));
  if (settings?.store_phone) contactList.push(`Hotline: ${settings.store_phone}`);
  if (contactList.length > 0) {
    builder.line(contactList.join(' - '));
  }

  builder.line(divider);

  // 2. Thông tin Bàn & Giờ (Gộp chung 1 dòng để tiết kiệm giấy)
  builder.alignLeft()
    .bold(true)
    .line(formatRow(`BAN: ${orderData.tableName.toUpperCase()}`, timeFormatted, RECEIPT_WIDTH))
    .bold(false);

  if (orderData.notes && orderData.notes.trim()) {
    builder.line(`Ghi chu: ${removeDiacritics(orderData.notes.trim())}`);
  }

  builder.line(divider);

  // 3. Danh sách món (Gộp 1 dòng cho mỗi món để tiết kiệm 50% giấy)
  orderData.items.forEach((item, index) => {
    const qtyStr = item.quantity > 1 ? ` x${item.quantity}` : '';
    const nameWithQty = `${index + 1}. ${item.name}${qtyStr}`;
    const subtotalStr = `${item.subtotal.toLocaleString('vi-VN')}d`;

    // Nếu tên món vừa vặn trên 1 dòng
    if (removeDiacritics(nameWithQty).length + subtotalStr.length + 1 <= RECEIPT_WIDTH) {
      builder.line(formatRow(nameWithQty, subtotalStr, RECEIPT_WIDTH));
    } else {
      // Tên món quá dài: Dòng 1 tên món, Dòng 2 số lượng + thành tiền
      builder.line(`${index + 1}. ${item.name}`);
      const detailLeft = item.quantity > 1 
        ? `   x${item.quantity} (${Math.round(item.price / 1000)}k)`
        : `   x1`;
      builder.line(formatRow(detailLeft, subtotalStr, RECEIPT_WIDTH));
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

  // 5. Chân trang (1 dòng ngắn gọn, feed 2 dòng vừa khít dao cắt)
  builder.alignCenter();
  if (settings?.bill_footer && settings.bill_footer.trim()) {
    const lines = settings.bill_footer.split('\n');
    lines.forEach(l => {
      if (l.trim()) builder.line(removeDiacritics(l.trim()));
    });
  } else {
    builder.line('XIN CAM ON VA HEN GAP LAI!');
  }

  builder.feed(2) // Chỉ feed 2 dòng vừa tới lưỡi dao cắt thay vì 4 dòng
    .cut();

  return builder.getBuffer();
}

// Print order directly via TCP Socket
export async function printOrderDirect(
  orderData: OrderData,
  printerIP?: string,
  port?: number
): Promise<void> {
  const storeSettings = db.getStoreSettingsSync();
  const targetIP = printerIP || storeSettings.printer_ip || '192.168.1.232';
  const targetPort = port || storeSettings.printer_port || 9100;

  // 1. Kiểm tra môi trường Desktop Tauri (Windows POS máy in USB / Spooler)
  try {
    const { isTauriEnvironment, silentPrintEscPos } = await import('@/lib/tauriPOS');
    if (isTauriEnvironment()) {
      console.log('[Tauri Desktop Mode] Initiating Silent ESC/POS printing...');
      const receiptBytes = buildReceiptBytes(orderData, storeSettings);
      const res = await silentPrintEscPos(receiptBytes);
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

  // 2. If not running in native Capacitor platform, do not try to open TCP connection
  if (!Capacitor.isNativePlatform()) {
    console.log('[Web/Browser Dev Mode] Skipping TCP socket print. Order data:', orderData);
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
        .feed(2)
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

  // Kiểm tra môi trường Web: Trình duyệt web không thể mở TCP socket trực tiếp
  if (!Capacitor.isNativePlatform()) {
    return {
      success: false,
      isWeb: true,
      message: 'Tính năng in trực tiếp qua mạng LAN chỉ hoạt động trên App Android (APK/máy POS). Cấu hình này đã được lưu để máy POS sử dụng!'
    };
  }

  const currentSettings = { ...db.getStoreSettingsSync(), ...settings };
  const targetIP = currentSettings.printer_ip || '192.168.1.232';
  const targetPort = Number(currentSettings.printer_port || 9100);

  const builder = new EscPosBuilder();
  const divider = '-'.repeat(RECEIPT_WIDTH);
  builder.alignCenter()
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
    .feed(2)
    .cut();

  const payload = builder.getBuffer();
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
