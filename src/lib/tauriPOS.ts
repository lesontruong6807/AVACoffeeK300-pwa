// Bridge giao tiếp giữa Next.js Frontend và Tauri v2 Rust Backend (Windows POS Desktop)

export interface CustomerDisplayItem {
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CustomerDisplayPayload {
  tableName?: string;
  staffName?: string;
  items: CustomerDisplayItem[];
  discount?: number;
  totalAmount: number;
  paymentMethod?: 'Tiền mặt' | 'Chuyển khoản';
  qrCodeUrl?: string;
  customerPaid?: number;
  changeAmount?: number;
  orderStatus?: 'ordering' | 'paid' | 'idle';
}

/**
 * Kiểm tra xem ứng dụng có đang chạy bên trong môi trường Desktop Tauri v2 hay không
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/**
 * Lấy danh sách máy in được cài đặt trên hệ điều hành Windows
 */
export async function getWindowsPrinters(): Promise<string[]> {
  if (!isTauriEnvironment()) {
    return [];
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string[]>('get_printers');
  } catch (error) {
    console.error('[TauriPOS] Lỗi khi lấy danh sách máy in Windows:', error);
    return [];
  }
}

/**
 * In ngầm trực tiếp hóa đơn dạng mã nhị phân ESC/POS qua máy in nhiệt USB K80 (Không mở hộp thoại Print)
 */
export async function silentPrintEscPos(
  escPosBytes: Uint8Array | number[],
  printerName?: string
): Promise<{ success: boolean; message?: string }> {
  if (!isTauriEnvironment()) {
    return { success: false, message: 'Chỉ hỗ trợ in ngầm trên ứng dụng Desktop Windows' };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const bytesArray = Array.from(escPosBytes);
    await invoke('silent_print_escpos', {
      data: bytesArray,
      printerName: printerName || null
    });
    return { success: true };
  } catch (error: any) {
    console.error('[TauriPOS] Lỗi in ngầm ESC/POS:', error);
    return { success: false, message: error?.toString() || 'Lỗi gửi lệnh in' };
  }
}

/**
 * Kích mở két tiền tự động (Cash Drawer Kick qua cổng RJ11 trên máy in K80)
 */
export async function kickCashDrawer(
  printerName?: string
): Promise<{ success: boolean; message?: string }> {
  if (!isTauriEnvironment()) {
    return { success: false, message: 'Chỉ hỗ trợ trên ứng dụng Desktop Windows' };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('kick_cash_drawer', {
      printerName: printerName || null
    });
    return { success: true };
  } catch (error: any) {
    console.error('[TauriPOS] Lỗi kích mở két tiền:', error);
    return { success: false, message: error?.toString() || 'Lỗi mở két tiền' };
  }
}

/**
 * Mở và định vị cửa sổ màn hình phụ 11.6 inch hiển thị thông tin cho khách
 */
export async function openCustomerDisplayWindow(): Promise<boolean> {
  if (!isTauriEnvironment()) {
    // Môi trường trình duyệt: mở tab mới
    if (typeof window !== 'undefined') {
      window.open('/customer-display', 'CustomerDisplay', 'width=1024,height=600');
    }
    return true;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_customer_display');
    return true;
  } catch (error) {
    console.error('[TauriPOS] Lỗi mở cửa sổ màn hình phụ:', error);
    return false;
  }
}

/**
 * Đồng bộ giỏ hàng và thanh toán sang màn hình phụ của khách hàng
 */
export async function syncCustomerDisplay(payload: CustomerDisplayPayload): Promise<void> {
  // 1. Gửi qua BroadcastChannel (Hỗ trợ trình duyệt và đa tab)
  try {
    if (typeof window !== 'undefined') {
      const channel = new BroadcastChannel('ava_customer_display');
      channel.postMessage(payload);
      channel.close();
      localStorage.setItem('ava_customer_display_data', JSON.stringify(payload));
    }
  } catch (e) {}

  // 2. Gửi qua Tauri IPC Event (Hỗ trợ app Desktop Windows đa cửa sổ)
  if (isTauriEnvironment()) {
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('customer-display-update', payload);
    } catch (error) {
      console.error('[TauriPOS] Lỗi emit sự kiện sang màn hình phụ:', error);
    }
  }
}

/**
 * Bật/tắt chế độ toàn màn hình (Fullscreen / Thu nhỏ cửa sổ) cho Desktop POS
 */
export async function toggleTauriFullscreen(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const isFull = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!isFull);
      return !isFull;
    } catch (e) {
      console.warn('[TauriPOS] Lỗi toggle fullscreen:', e);
    }
  }

  if (typeof document !== 'undefined') {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
      return true;
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
        return false;
      }
    }
  }
  return false;
}

/**
 * Kiểm tra trạng thái Toàn màn hình hiện tại
 */
export async function isTauriFullscreen(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      return await getCurrentWindow().isFullscreen();
    } catch (e) {}
  }
  if (typeof document !== 'undefined') {
    return !!document.fullscreenElement;
  }
  return false;
}
