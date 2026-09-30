import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Kiểm tra xem Supabase đã được cấu hình hay chưa
export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseUrl !== 'https://your-project-id.supabase.co' && 
  supabaseAnonKey && 
  supabaseAnonKey !== 'your-anon-key';

// Tự động quét và dọn sạch token xác thực Supabase cũ bị lưu trong localStorage (nguyên nhân gây 401 Unauthorized trên mobile)
if (typeof window !== 'undefined') {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    // Nếu thiết bị bị dính cache kho cũ 200 ly: xóa cache để nạp số tồn thực tế từ Supabase
    const cachedIng = localStorage.getItem('ava_ingredients');
    if (cachedIng && cachedIng.includes('"stock_quantity":200') && cachedIng.includes('ing_lyden')) {
      localStorage.removeItem('ava_ingredients');
    }

    // Xóa cache danh sách nhân viên cũ nếu còn dính 'Nguyễn Văn Minh' hoặc 'Trần Thị Thuỷ'
    const cachedUsers = localStorage.getItem('ava_users');
    if (cachedUsers && (cachedUsers.includes('Nguyễn Văn Minh') || cachedUsers.includes('Trần Thị Thuỷ'))) {
      localStorage.removeItem('ava_users');
    }

    // Nếu current_user cũ đang là 'Nguyễn Văn Minh' hoặc 'Trần Thị Thuỷ': xóa để người dùng đăng nhập lại
    const currentUserStr = localStorage.getItem('ava_current_user');
    if (currentUserStr && (currentUserStr.includes('Nguyễn Văn Minh') || currentUserStr.includes('Trần Thị Thuỷ'))) {
      localStorage.removeItem('ava_current_user');
    }

    // Dọn cache POS cũ khi có đợt cập nhật menu mới (2 bảng giá mang về / ngồi lại)
    const menuVersion = 'v3_k300_dual_pricing';
    if (localStorage.getItem('ava_menu_version') !== menuVersion) {
      localStorage.removeItem('ava_products');
      localStorage.removeItem('ava_pos_cache_products');
      localStorage.removeItem('ava_pos_cache_categories');
      localStorage.removeItem('ava_categories');
      localStorage.removeItem('ava_recipes');
      localStorage.setItem('ava_menu_version', menuVersion);
    }
  } catch (e) {}
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'ava_none'
      }
    })
  : null;

// Cache variables for performance optimization
let cachedTables: any[] | null = null;
let cachedCategories: any[] | null = null;
let cachedProducts: any[] | null = null;
let cachedRecipes: any[] | null = null;

// Shared Realtime Sync Channel & Event Listeners
let sharedRealtimeChannel: any = null;
const realtimeListeners: { [event: string]: Set<(payload: any) => void> } = {
  table_update: new Set(),
  order_update: new Set(),
  report_update: new Set(),
  inventory_update: new Set(),
  attendance_update: new Set()
};

function getSharedRealtimeChannel() {
  if (!isSupabaseConfigured || !supabase) return null;
  if (!sharedRealtimeChannel) {
    sharedRealtimeChannel = supabase.channel('ava-coffee-live-sync');

    // 1. Lắng nghe phát sóng từ các thiết bị khác (Broadcast - siêu nhanh ~20ms, không phụ thuộc Postgres publication)
    sharedRealtimeChannel
      .on('broadcast', { event: 'table_update' }, (msg: any) => {
        cachedTables = null;
        const payload = msg?.payload || msg;
        realtimeListeners['table_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('broadcast', { event: 'order_update' }, (msg: any) => {
        const payload = msg?.payload || msg;
        realtimeListeners['order_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('broadcast', { event: 'report_update' }, (msg: any) => {
        const payload = msg?.payload || msg;
        realtimeListeners['report_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('broadcast', { event: 'inventory_update' }, (msg: any) => {
        const payload = msg?.payload || msg;
        realtimeListeners['inventory_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('broadcast', { event: 'attendance_update' }, (msg: any) => {
        const payload = msg?.payload || msg;
        realtimeListeners['attendance_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      // 2. Lắng nghe thay đổi trực tiếp từ Postgres DB (Postgres Changes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nguyenlieu' }, (payload: any) => {
        realtimeListeners['inventory_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      // 2. Lắng nghe thay đổi trực tiếp từ Postgres DB (Postgres Changes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'danhsachban' }, (payload: any) => {
        cachedTables = null;
        realtimeListeners['table_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoadon' }, (payload: any) => {
        realtimeListeners['order_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
        realtimeListeners['report_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoadondetail' }, (payload: any) => {
        realtimeListeners['order_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
        realtimeListeners['report_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chiphivanhang' }, (payload: any) => {
        realtimeListeners['report_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lichsukho' }, (payload: any) => {
        realtimeListeners['report_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
        realtimeListeners['inventory_update']?.forEach(fn => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      })
      .subscribe();
  }
  return sharedRealtimeChannel;
}

export function broadcastRealtimeEvent(event: 'table_update' | 'order_update' | 'report_update' | 'inventory_update' | 'attendance_update', payload?: any) {
  try {
    const ch = getSharedRealtimeChannel();
    if (ch) {
      ch.send({
        type: 'broadcast',
        event,
        payload: payload || { timestamp: Date.now() }
      });
    }
  } catch (err) {
    console.warn('Lỗi gửi broadcast realtime:', err);
  }
}

export function onRealtimeEvent(
  event: 'table_update' | 'order_update' | 'report_update' | 'inventory_update' | 'attendance_update',
  callback: (payload: any) => void
): () => void {
  getSharedRealtimeChannel();
  realtimeListeners[event]?.add(callback);
  return () => {
    realtimeListeners[event]?.delete(callback);
  };
}

// Helper tạo ID ngắn giống trên database khi offline (ví dụ: p_3a4b5c)
export const generateShortId = (prefix: string): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = prefix;
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Dữ liệu mẫu khởi tạo cho Mock DB
const MOCK_CATEGORIES = [
  { id: 'c_caphe', name: 'Cà phê' },
  { id: 'c_douongkhac', name: 'Thức uống khác' },
  { id: 'c_tra', name: 'Trà' },
  { id: 'c_yaourt', name: 'Yaourt' },
  { id: 'c_soda', name: 'Soda' },
  { id: 'c_nuocep', name: 'Nước ép' },
  { id: 'c_nuocngot', name: 'Nước ngọt/suối' },
  { id: 'c_topping', name: 'Topping' }
];

const MOCK_PRODUCTS = [
  // Cà phê (CP)
  {
    id: 'CP001',
    category_id: 'c_caphe',
    name: 'Cà phê đá',
    price: 18000,
    takeaway_price: 18000,
    dinein_price: 25000,
    cost_price: 6432,
    image_url: '/products/CP001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP002',
    category_id: 'c_caphe',
    name: 'Cà phê sữa',
    price: 20000,
    takeaway_price: 20000,
    dinein_price: 28000,
    cost_price: 7421,
    image_url: '/products/CP002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP003',
    category_id: 'c_caphe',
    name: 'Cà phê sữa tươi',
    price: 25000,
    takeaway_price: 25000,
    dinein_price: 33000,
    cost_price: 9715,
    image_url: '/products/CP003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP004',
    category_id: 'c_caphe',
    name: 'Cà phê muối',
    price: 25000,
    takeaway_price: 25000,
    dinein_price: 33000,
    cost_price: 9691,
    image_url: '/products/CP004.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP005',
    category_id: 'c_caphe',
    name: 'Bạc xỉu',
    price: 25000,
    takeaway_price: 25000,
    dinein_price: 33000,
    cost_price: 9148,
    image_url: '/products/CP005.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP006',
    category_id: 'c_caphe',
    name: 'Bạc xỉu kem muối',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 11418,
    image_url: '/products/CP006.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP007',
    category_id: 'c_caphe',
    name: 'Americano',
    price: 20000,
    takeaway_price: 20000,
    dinein_price: 28000,
    cost_price: 5000,
    image_url: '/products/CP007.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP008',
    category_id: 'c_caphe',
    name: 'Đen đá lớn',
    price: 40000,
    takeaway_price: 30000,
    dinein_price: 40000,
    cost_price: 8000,
    image_url: '/products/CP001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'CP009',
    category_id: 'c_caphe',
    name: 'Sữa đá lớn',
    price: 48000,
    takeaway_price: 35000,
    dinein_price: 48000,
    cost_price: 10000,
    image_url: '/products/CP002.png',
    status: 'Còn hàng' as const
  },
  // Thức uống khác (TUK)
  {
    id: 'TUK001',
    category_id: 'c_douongkhac',
    name: 'Cacao sữa',
    price: 25000,
    takeaway_price: 25000,
    dinein_price: 33000,
    cost_price: 7048,
    image_url: '/products/TUK001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK002',
    category_id: 'c_douongkhac',
    name: 'Cacao kem muối',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 9317,
    image_url: '/products/TUK002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK003',
    category_id: 'c_douongkhac',
    name: 'Matcha Latte',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 7198,
    image_url: '/products/TUK003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK004',
    category_id: 'c_douongkhac',
    name: 'Matcha Latte kem muối',
    price: 35000,
    takeaway_price: 35000,
    dinein_price: 43000,
    cost_price: 8646,
    image_url: '/products/TUK004.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK007',
    category_id: 'c_douongkhac',
    name: 'Khoai môn Latte',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 7500,
    image_url: '/products/TUK007.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK008',
    category_id: 'c_douongkhac',
    name: 'Khoai môn Latte kem muối',
    price: 35000,
    takeaway_price: 35000,
    dinein_price: 43000,
    cost_price: 9500,
    image_url: '/products/TUK008.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK005',
    category_id: 'c_douongkhac',
    name: 'Chanh đá',
    price: 18000,
    takeaway_price: 18000,
    dinein_price: 25000,
    cost_price: 1618,
    image_url: '/products/TUK005.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TUK006',
    category_id: 'c_douongkhac',
    name: 'Chanh nóng',
    price: 18000,
    takeaway_price: 18000,
    dinein_price: 25000,
    cost_price: 2237,
    image_url: '/products/TUK006.png',
    status: 'Còn hàng' as const
  },
  // Trà (T)
  {
    id: 'T001',
    category_id: 'c_tra',
    name: 'Trà tắc',
    price: 18000,
    takeaway_price: 18000,
    dinein_price: 25000,
    cost_price: 1618,
    image_url: '/products/T001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T006',
    category_id: 'c_tra',
    name: 'Trà Lipton',
    price: 18000,
    takeaway_price: 18000,
    dinein_price: 25000,
    cost_price: 2500,
    image_url: '/products/T006.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T002',
    category_id: 'c_tra',
    name: 'Trà dâu',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 5607,
    image_url: '/products/T002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T003',
    category_id: 'c_tra',
    name: 'Trà đào',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 5745,
    image_url: '/products/T003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T007',
    category_id: 'c_tra',
    name: 'Trà nhiệt đới',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T007.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T008',
    category_id: 'c_tra',
    name: 'Trà xoài chanh dây',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T008.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T009',
    category_id: 'c_tra',
    name: 'Trà ổi hồng',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T009.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T010',
    category_id: 'c_tra',
    name: 'Trà dưa lưới',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T010.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T011',
    category_id: 'c_tra',
    name: 'Trà mãng cầu',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T011.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'T012',
    category_id: 'c_tra',
    name: 'Trà nhãn',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 6000,
    image_url: '/products/T012.png',
    status: 'Còn hàng' as const
  },
  // Yaourt (Y)
  {
    id: 'Y001',
    category_id: 'c_yaourt',
    name: 'Yaourt đá',
    price: 25000,
    takeaway_price: 25000,
    dinein_price: 33000,
    cost_price: 7826,
    image_url: '/products/Y001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'Y002',
    category_id: 'c_yaourt',
    name: 'Yaourt dâu',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 10176,
    image_url: '/products/Y002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'Y003',
    category_id: 'c_yaourt',
    name: 'Yaourt việt quất',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 11131,
    image_url: '/products/Y003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'Y004',
    category_id: 'c_yaourt',
    name: 'Yaourt đào',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 10294,
    image_url: '/products/Y004.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'Y005',
    category_id: 'c_yaourt',
    name: 'Yaourt chanh dây',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 11148,
    image_url: '/products/Y005.png',
    status: 'Còn hàng' as const
  },
  // Soda (S)
  {
    id: 'S001',
    category_id: 'c_soda',
    name: 'Soda dâu',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 7996,
    image_url: '/products/S001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'S002',
    category_id: 'c_soda',
    name: 'Soda đào',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8097,
    image_url: '/products/S002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'S003',
    category_id: 'c_soda',
    name: 'Soda việt quất',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8084,
    image_url: '/products/S003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'S005',
    category_id: 'c_soda',
    name: 'Soda chanh dây',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 7272,
    image_url: '/products/S005.png',
    status: 'Còn hàng' as const
  },
  // Nước ép tươi (NE)
  {
    id: 'NE001',
    category_id: 'c_nuocep',
    name: 'Nước ép ổi',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8000,
    image_url: '/products/NE001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'NE002',
    category_id: 'c_nuocep',
    name: 'Nước ép táo',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8000,
    image_url: '/products/NE002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'NE003',
    category_id: 'c_nuocep',
    name: 'Nước ép cam',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8000,
    image_url: '/products/NE003.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'NE004',
    category_id: 'c_nuocep',
    name: 'Nước ép dưa hấu',
    price: 30000,
    takeaway_price: 30000,
    dinein_price: 38000,
    cost_price: 8000,
    image_url: '/products/NE004.png',
    status: 'Còn hàng' as const
  },
  // Nước đóng chai
  {
    id: 'N002',
    category_id: 'c_nuocngot',
    name: 'Bò Húc',
    price: 22000,
    takeaway_price: 22000,
    dinein_price: 30000,
    cost_price: 12295,
    image_url: '/products/N002.jpg',
    status: 'Còn hàng' as const
  },
  {
    id: 'N005',
    category_id: 'c_nuocngot',
    name: 'Nước suối',
    price: 12000,
    takeaway_price: 12000,
    dinein_price: 20000,
    cost_price: 4200,
    image_url: '/products/N005.jpg',
    status: 'Còn hàng' as const
  },
  // Topping
  {
    id: 'TP001',
    category_id: 'c_topping',
    name: 'Kem muối',
    price: 8000,
    takeaway_price: 8000,
    dinein_price: 8000,
    cost_price: 2270,
    image_url: '/products/TP001.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TP002',
    category_id: 'c_topping',
    name: 'Trân châu trắng',
    price: 8000,
    takeaway_price: 8000,
    dinein_price: 8000,
    cost_price: 0,
    image_url: '/products/TP002.png',
    status: 'Còn hàng' as const
  },
  {
    id: 'TP003',
    category_id: 'c_topping',
    name: 'Hạt đác',
    price: 8000,
    takeaway_price: 8000,
    dinein_price: 8000,
    cost_price: 0,
    image_url: '/products/TP003.png',
    status: 'Còn hàng' as const
  }
];

const MOCK_TABLES: Array<{ id: string; table_name: string; capacity: number; status: 'Trống' | 'Đang phục vụ' }> = [
  { id: 'tb1', table_name: 'Bàn 1', capacity: 4, status: 'Trống' },
  { id: 'tb2', table_name: 'Bàn 2', capacity: 4, status: 'Trống' },
  { id: 'tb3', table_name: 'Bàn 3', capacity: 2, status: 'Trống' },
  { id: 'tb4', table_name: 'Bàn 4', capacity: 2, status: 'Trống' },
  { id: 'tb5', table_name: 'Bàn 5', capacity: 6, status: 'Trống' },
  { id: 'tb6', table_name: 'Bàn 6', capacity: 6, status: 'Trống' },
  { id: 'tb7', table_name: 'Bàn 7', capacity: 4, status: 'Trống' },
  { id: 'tb8', table_name: 'Bàn 8', capacity: 4, status: 'Trống' },
  { id: 'tb_mangve', table_name: 'Khách mang về', capacity: 99, status: 'Trống' }
];

export const MOCK_USERS = [
  { id: 'admin', username: 'admin', password: '123456', email: 'admin@avacoffee.com', full_name: 'Trương Lê Sơn', role: 'Admin' as const, created_at: '2026-07-30T14:42:21.179681+00:00' },
  { id: 'nv001', username: 'admin2', password: '123456', email: 'nhanvien1@avacoffee.com', full_name: 'Lê Thị Quỳnh Châu', role: 'Admin' as const, created_at: '2026-07-30T14:42:21.179681+00:00' },
  { id: 'nv002', username: 'admin3', password: '123456', email: 'nhanvien2@avacoffee.com', full_name: 'Trương Hoàng Minh Hải', role: 'Admin' as const, created_at: '2026-07-30T14:42:21.179681+00:00' },
  { id: 'u_1786145575045', username: 'nv001', password: '123456', email: 'long@gmail.com', full_name: 'Lê Phước Long', role: 'User' as const, created_at: '2026-08-07T23:32:55.046+00:00' },
  { id: 'u_1786158337441', username: 'nv002', password: '123456', email: 'tien@gmail.com', full_name: 'Nguyễn Minh Tiến', role: 'User' as const, created_at: '2026-08-08T03:05:37.443+00:00' },
  { id: 'u_1786317471359', username: 'maybanhang', password: '123456', email: 'banhang@gmail.com', full_name: 'Máy bán hàng', role: 'User' as const, created_at: '2026-08-09T23:17:51.36+00:00' },
  { id: 'u_1786661651607', username: 'nv005', password: '123456', email: 'kien@gmail.com', full_name: 'Nguyễn Trung Kiên', role: 'User' as const, created_at: '2026-08-13T22:54:11.607+00:00' },
  { id: 'u_1786767308125', username: 'nv006', password: '123456', email: 'thuc@gmail.com', full_name: 'Dương Thiện Thức', role: 'User' as const, created_at: '2026-08-15T04:15:08.126+00:00' }
];

export const MOCK_INGREDIENTS = [
  { id: 'ing_7up', name: '7-Up', unit: 'ml', stock_quantity: 10315, opening_stock: 10315, min_stock: 2, quy_cach: '390ml', don_gia_nhap: 13.88888888888889, gia_von_trung_binh: 14.023122033397607 },
  { id: 'ing_cacao', name: 'Cacao AVA', unit: 'g', stock_quantity: 920, opening_stock: 920, min_stock: 200, quy_cach: '1kg', don_gia_nhap: 340, gia_von_trung_binh: 340 },
  { id: 'ing_caphe', name: 'Cà phê hạt AVA', unit: 'g', stock_quantity: 5768, opening_stock: 5768, min_stock: 1000, quy_cach: '1kg', don_gia_nhap: 247.61904761904762, gia_von_trung_binh: 247.61904761904762 },
  { id: 'ing_duong', name: 'Đường', unit: 'g', stock_quantity: 6059.200000000019, opening_stock: 6059.200000000019, min_stock: 1000, quy_cach: '1kg', don_gia_nhap: 23, gia_von_trung_binh: 22.51836094995933 },
  { id: 'ing_hongtra', name: 'Hồng trà', unit: 'g', stock_quantity: 435.9375, opening_stock: 435.9375, min_stock: 60, quy_cach: '30g', don_gia_nhap: 100, gia_von_trung_binh: 114.3738719938099 },
  { id: 'ing_kembeo', name: 'Kem RICH\'S', unit: 'g', stock_quantity: 2518.1500000000024, opening_stock: 2518.1500000000024, min_stock: 1, quy_cach: '454g', don_gia_nhap: 68.28193832599119, gia_von_trung_binh: 68.28193832599119 },
  { id: 'ing_lyden', name: 'Ly đen AVA', unit: 'cái', stock_quantity: 78, opening_stock: 78, min_stock: 50, quy_cach: 'cái', don_gia_nhap: 1300, gia_von_trung_binh: 1292.3853157803167 },
  { id: 'ing_lyhoavan', name: 'Ly trắng hoa văn AVA', unit: 'cái', stock_quantity: 178, opening_stock: 178, min_stock: 50, quy_cach: 'cái', don_gia_nhap: 1500, gia_von_trung_binh: 1500 },
  { id: 'ing_lytrang', name: 'Ly trắng AVA', unit: 'cái', stock_quantity: 117, opening_stock: 117, min_stock: 50, quy_cach: 'cái', don_gia_nhap: 1400, gia_von_trung_binh: 1398.0662983425414 },
  { id: 'ing_matcha', name: 'Bột Matcha', unit: 'g', stock_quantity: 354.5, opening_stock: 354.5, min_stock: 50, quy_cach: '200g', don_gia_nhap: 725, gia_von_trung_binh: 725 },
  { id: 'ing_muoibien', name: 'Topping Muối biển', unit: 'g', stock_quantity: 304.089999999997, opening_stock: 304.089999999997, min_stock: null, quy_cach: '500g', don_gia_nhap: 150, gia_von_trung_binh: 150 },
  { id: 'ing_muong', name: 'Muỗng', unit: 'bịch', stock_quantity: 5, opening_stock: 5, min_stock: null, quy_cach: 'bịch', don_gia_nhap: 333.3333333333333, gia_von_trung_binh: 333.3333333333333 },
  { id: 'ing_mutchanhday', name: 'Mứt chanh dây', unit: 'ml', stock_quantity: 450, opening_stock: 450, min_stock: 200, quy_cach: '1000ml', don_gia_nhap: 95, gia_von_trung_binh: 95 },
  { id: 'ing_mutdao', name: 'Mứt đào', unit: 'ml', stock_quantity: 1840, opening_stock: 1840, min_stock: 200, quy_cach: '1000ml', don_gia_nhap: 94, gia_von_trung_binh: 94.1651376146789 },
  { id: 'ing_mutdau', name: 'Mứt dâu', unit: 'ml', stock_quantity: 2020, opening_stock: 2020, min_stock: 200, quy_cach: '1000ml', don_gia_nhap: 90, gia_von_trung_binh: 90.24854856960896 },
  { id: 'ing_mutvietquat', name: 'Mứt việt quất', unit: 'ml', stock_quantity: 1980, opening_stock: 1980, min_stock: 200, quy_cach: '1000ml', don_gia_nhap: 122, gia_von_trung_binh: 122.05575842389521 },
  { id: 'ing_n002', name: 'Bò Húc (lon)', unit: 'lon', stock_quantity: 16, opening_stock: 16, min_stock: 2, quy_cach: 'lon', don_gia_nhap: 12500, gia_von_trung_binh: 12294.917967186875 },
  { id: 'ing_n005', name: 'Nước suối (chai)', unit: 'chai', stock_quantity: 24, opening_stock: 24, min_stock: 2, quy_cach: 'chai', don_gia_nhap: 4166.666666666667, gia_von_trung_binh: 4199.73544973545 },
  { id: 'ing_sirodao', name: 'Siro đào', unit: 'ml', stock_quantity: 1110, opening_stock: 1110, min_stock: 200, quy_cach: '730ml', don_gia_nhap: 89.04109589041096, gia_von_trung_binh: 91.09607443197126 },
  { id: 'ing_sirodau', name: 'Siro dâu', unit: 'ml', stock_quantity: 1280, opening_stock: 1280, min_stock: 200, quy_cach: '730ml', don_gia_nhap: 89.04109589041096, gia_von_trung_binh: 89.04109589041096 },
  { id: 'ing_suachua', name: 'Sữa chua', unit: 'hộp', stock_quantity: 41, opening_stock: 41, min_stock: 4, quy_cach: 'hộp', don_gia_nhap: 5000, gia_von_trung_binh: 5000.012525293424 },
  { id: 'ing_suadac', name: 'Sữa đặc', unit: 'g', stock_quantity: 25574.34999999998, opening_stock: 25574.34999999998, min_stock: 1284, quy_cach: '1284g', don_gia_nhap: 35.6957424714434, gia_von_trung_binh: 35.6957424714434 },
  { id: 'ing_suatuoi', name: 'Sữa tươi', unit: 'ml', stock_quantity: 8140, opening_stock: 8140, min_stock: 2000, quy_cach: '1000ml', don_gia_nhap: 27.333333333333332, gia_von_trung_binh: 27.393165749348576 },
  { id: 'ing_tuimangdi', name: 'Túi mang đi', unit: 'kg', stock_quantity: 0, opening_stock: 0, min_stock: null, quy_cach: '1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  // Nguyên liệu mới bổ sung cho Menu K300 (tồn tạm thời = 0, giá vốn = 0)
  { id: 'ing_tralai', name: 'Trà lài', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 500, quy_cach: 'Bịch 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_lipton', name: 'Trà túi lọc Lipton', unit: 'gói', stock_quantity: 0, opening_stock: 0, min_stock: 10, quy_cach: 'Hộp 100 gói', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_khoaimon', name: 'Bột khoai môn', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Gói 500g', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_sirochanhday', name: 'Siro chanh dây', unit: 'ml', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Chai 730ml', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutnhietdoi', name: 'Mứt nhiệt đới', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutxoai', name: 'Mứt xoài', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_sirooihong', name: 'Siro ổi hồng', unit: 'ml', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Chai 730ml', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutoihong', name: 'Mứt ổi hồng', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_sirodualuoi', name: 'Siro dưa lưới', unit: 'ml', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Chai 730ml', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutdualuoi', name: 'Mứt dưa lưới', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_siromangcau', name: 'Siro mãng cầu', unit: 'ml', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Chai 730ml', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutmangcau', name: 'Mứt mãng cầu', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_mutnhan', name: 'Mứt nhãn', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 200, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 },
  { id: 'ing_hatdac', name: 'Hạt đác', unit: 'g', stock_quantity: 0, opening_stock: 0, min_stock: 100, quy_cach: 'Hũ 1kg', don_gia_nhap: 0, gia_von_trung_binh: 0 }
];

export const MOCK_RECIPES = [
  // 1. Cà phê đá
  { id: 'rec_cp1_1', product_id: 'CP001', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp1_duong', product_id: 'CP001', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_cp1_3', product_id: 'CP001', ingredient_id: 'ing_lyden', quantity_needed: 1, unit: 'cái' },

  // 2. Cà phê sữa
  { id: 'rec_cp2_1', product_id: 'CP002', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp2_2', product_id: 'CP002', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_cp2_3', product_id: 'CP002', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 3. Cà phê sữa tươi
  { id: 'rec_cp3_1', product_id: 'CP003', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp3_2', product_id: 'CP003', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_cp3_3', product_id: 'CP003', ingredient_id: 'ing_suatuoi', quantity_needed: 80, unit: 'ml' },
  { id: 'rec_cp3_4', product_id: 'CP003', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 4. Cà phê muối
  { id: 'rec_cp4_1', product_id: 'CP004', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp4_2', product_id: 'CP004', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_cp4_kembeo', product_id: 'CP004', ingredient_id: 'ing_kembeo', quantity_needed: 0.0667, unit: 'hộp' },
  { id: 'rec_cp4_suadac_km', product_id: 'CP004', ingredient_id: 'ing_suadac', quantity_needed: 1.33, unit: 'g' },
  { id: 'rec_cp4_suatuoi_km', product_id: 'CP004', ingredient_id: 'ing_suatuoi', quantity_needed: 2, unit: 'ml' },
  { id: 'rec_cp4_4', product_id: 'CP004', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 5. Bạc xỉu
  { id: 'rec_cp5_1', product_id: 'CP005', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp5_2', product_id: 'CP005', ingredient_id: 'ing_suadac', quantity_needed: 40, unit: 'g' },
  { id: 'rec_cp5_3', product_id: 'CP005', ingredient_id: 'ing_suatuoi', quantity_needed: 50, unit: 'ml' },
  { id: 'rec_cp5_4', product_id: 'CP005', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 6. Bạc xỉu kem muối
  { id: 'rec_cp6_1', product_id: 'CP006', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp6_2', product_id: 'CP006', ingredient_id: 'ing_suadac', quantity_needed: 41.33, unit: 'g' },
  { id: 'rec_cp6_3', product_id: 'CP006', ingredient_id: 'ing_suatuoi', quantity_needed: 52, unit: 'ml' },
  { id: 'rec_cp6_kembeo', product_id: 'CP006', ingredient_id: 'ing_kembeo', quantity_needed: 30.27, unit: 'g' },
  { id: 'rec_cp6_muoibien', product_id: 'CP006', ingredient_id: 'ing_muoibien', quantity_needed: 0.67, unit: 'g' },
  { id: 'rec_cp6_4', product_id: 'CP006', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 7. Americano (CP007)
  { id: 'rec_cp7_1', product_id: 'CP007', ingredient_id: 'ing_caphe', quantity_needed: 20, unit: 'g' },
  { id: 'rec_cp7_2', product_id: 'CP007', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 7.1 Đen đá lớn (CP008)
  { id: 'rec_cp8_1', product_id: 'CP008', ingredient_id: 'ing_caphe', quantity_needed: 25, unit: 'g' },
  { id: 'rec_cp8_2', product_id: 'CP008', ingredient_id: 'ing_duong', quantity_needed: 12, unit: 'g' },
  { id: 'rec_cp8_3', product_id: 'CP008', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 7.2 Sữa đá lớn (CP009)
  { id: 'rec_cp9_1', product_id: 'CP009', ingredient_id: 'ing_caphe', quantity_needed: 25, unit: 'g' },
  { id: 'rec_cp9_2', product_id: 'CP009', ingredient_id: 'ing_suadac', quantity_needed: 45, unit: 'g' },
  { id: 'rec_cp9_3', product_id: 'CP009', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 8. Cacao sữa
  { id: 'rec_tuk1_1', product_id: 'TUK001', ingredient_id: 'ing_cacao', quantity_needed: 10, unit: 'g' },
  { id: 'rec_tuk1_2', product_id: 'TUK001', ingredient_id: 'ing_suadac', quantity_needed: 40, unit: 'g' },
  { id: 'rec_tuk1_3', product_id: 'TUK001', ingredient_id: 'ing_suatuoi', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_tuk1_4', product_id: 'TUK001', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 9. Cacao kem muối
  { id: 'rec_tuk2_1', product_id: 'TUK002', ingredient_id: 'ing_cacao', quantity_needed: 10, unit: 'g' },
  { id: 'rec_tuk2_2', product_id: 'TUK002', ingredient_id: 'ing_suadac', quantity_needed: 40, unit: 'g' },
  { id: 'rec_tuk2_3', product_id: 'TUK002', ingredient_id: 'ing_suatuoi', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_tuk2_kembeo', product_id: 'TUK002', ingredient_id: 'ing_kembeo', quantity_needed: 30.27, unit: 'g' },
  { id: 'rec_tuk2_muoibien', product_id: 'TUK002', ingredient_id: 'ing_muoibien', quantity_needed: 0.67, unit: 'g' },
  { id: 'rec_tuk2_5', product_id: 'TUK002', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 10. Matcha Latte
  { id: 'rec_tuk3_1', product_id: 'TUK003', ingredient_id: 'ing_matcha', quantity_needed: 3.5, unit: 'g' },
  { id: 'rec_tuk3_2', product_id: 'TUK003', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_tuk3_3', product_id: 'TUK003', ingredient_id: 'ing_suatuoi', quantity_needed: 80, unit: 'ml' },
  { id: 'rec_tuk3_4', product_id: 'TUK003', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 11. Matcha Latte kem muối
  { id: 'rec_tuk4_1', product_id: 'TUK004', ingredient_id: 'ing_matcha', quantity_needed: 3.5, unit: 'g' },
  { id: 'rec_tuk4_2', product_id: 'TUK004', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_tuk4_3', product_id: 'TUK004', ingredient_id: 'ing_suatuoi', quantity_needed: 50, unit: 'ml' },
  { id: 'rec_tuk4_kembeo', product_id: 'TUK004', ingredient_id: 'ing_kembeo', quantity_needed: 30.27, unit: 'g' },
  { id: 'rec_tuk4_muoibien', product_id: 'TUK004', ingredient_id: 'ing_muoibien', quantity_needed: 0.67, unit: 'g' },
  { id: 'rec_tuk4_5', product_id: 'TUK004', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 12. Khoai môn Latte (TUK007)
  { id: 'rec_tuk7_1', product_id: 'TUK007', ingredient_id: 'ing_khoaimon', quantity_needed: 10, unit: 'g' },
  { id: 'rec_tuk7_2', product_id: 'TUK007', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_tuk7_3', product_id: 'TUK007', ingredient_id: 'ing_suatuoi', quantity_needed: 80, unit: 'ml' },
  { id: 'rec_tuk7_4', product_id: 'TUK007', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 13. Khoai môn Latte kem muối (TUK008)
  { id: 'rec_tuk8_1', product_id: 'TUK008', ingredient_id: 'ing_khoaimon', quantity_needed: 10, unit: 'g' },
  { id: 'rec_tuk8_2', product_id: 'TUK008', ingredient_id: 'ing_suadac', quantity_needed: 31.73, unit: 'g' },
  { id: 'rec_tuk8_3', product_id: 'TUK008', ingredient_id: 'ing_suatuoi', quantity_needed: 52, unit: 'ml' },
  { id: 'rec_tuk8_4', product_id: 'TUK008', ingredient_id: 'ing_kembeo', quantity_needed: 30.27, unit: 'g' },
  { id: 'rec_tuk8_5', product_id: 'TUK008', ingredient_id: 'ing_muoibien', quantity_needed: 0.67, unit: 'g' },
  { id: 'rec_tuk8_6', product_id: 'TUK008', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 14. Chanh đá (TUK005)
  { id: 'rec_tuk5_duong', product_id: 'TUK005', ingredient_id: 'ing_duong', quantity_needed: 41.67, unit: 'g' },
  { id: 'rec_tuk5_ly', product_id: 'TUK005', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 15. Chanh nóng (TUK006)
  { id: 'rec_tuk6_duong', product_id: 'TUK006', ingredient_id: 'ing_duong', quantity_needed: 41.67, unit: 'g' },
  { id: 'rec_tuk6_ly', product_id: 'TUK006', ingredient_id: 'ing_lyden', quantity_needed: 1, unit: 'cái' },

  // 16. Trà tắc (T001 - 4 trái tắc)
  { id: 'rec_t1_lytrang', product_id: 'T001', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },
  { id: 'rec_t1_duong', product_id: 'T001', ingredient_id: 'ing_duong', quantity_needed: 41.67, unit: 'g' },

  // 17. Trà Lipton (T006)
  { id: 'rec_t6_1', product_id: 'T006', ingredient_id: 'ing_lipton', quantity_needed: 1, unit: 'gói' },
  { id: 'rec_t6_2', product_id: 'T006', ingredient_id: 'ing_duong', quantity_needed: 41.67, unit: 'g' },
  { id: 'rec_t6_3', product_id: 'T006', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 18. Trà dâu (T002)
  { id: 'rec_t2_tralai', product_id: 'T002', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t2_sirodau', product_id: 'T002', ingredient_id: 'ing_sirodau', quantity_needed: 10, unit: 'ml' },
  { id: 'rec_t2_mutdau', product_id: 'T002', ingredient_id: 'ing_mutdau', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_t2_duong', product_id: 'T002', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_t2_ly', product_id: 'T002', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 19. Trà đào (T003)
  { id: 'rec_t3_tralai', product_id: 'T003', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t3_sirodao', product_id: 'T003', ingredient_id: 'ing_sirodao', quantity_needed: 10, unit: 'ml' },
  { id: 'rec_t3_mutdao', product_id: 'T003', ingredient_id: 'ing_mutdao', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_t3_duong', product_id: 'T003', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_t3_ly', product_id: 'T003', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 20. Trà nhiệt đới (T007)
  { id: 'rec_t7_1', product_id: 'T007', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t7_2', product_id: 'T007', ingredient_id: 'ing_sirochanhday', quantity_needed: 20, unit: 'ml' },
  { id: 'rec_t7_3', product_id: 'T007', ingredient_id: 'ing_mutnhietdoi', quantity_needed: 50, unit: 'g' },
  { id: 'rec_t7_4', product_id: 'T007', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t7_5', product_id: 'T007', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 21. Trà xoài chanh dây (T008)
  { id: 'rec_t8_1', product_id: 'T008', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t8_2', product_id: 'T008', ingredient_id: 'ing_sirochanhday', quantity_needed: 20, unit: 'ml' },
  { id: 'rec_t8_3', product_id: 'T008', ingredient_id: 'ing_mutxoai', quantity_needed: 50, unit: 'g' },
  { id: 'rec_t8_4', product_id: 'T008', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t8_5', product_id: 'T008', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 22. Trà ổi hồng (T009)
  { id: 'rec_t9_1', product_id: 'T009', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t9_2', product_id: 'T009', ingredient_id: 'ing_sirooihong', quantity_needed: 20, unit: 'ml' },
  { id: 'rec_t9_3', product_id: 'T009', ingredient_id: 'ing_mutoihong', quantity_needed: 50, unit: 'g' },
  { id: 'rec_t9_4', product_id: 'T009', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t9_5', product_id: 'T009', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 23. Trà dưa lưới (T010)
  { id: 'rec_t10_1', product_id: 'T010', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t10_2', product_id: 'T010', ingredient_id: 'ing_sirodualuoi', quantity_needed: 20, unit: 'ml' },
  { id: 'rec_t10_3', product_id: 'T010', ingredient_id: 'ing_mutdualuoi', quantity_needed: 50, unit: 'g' },
  { id: 'rec_t10_4', product_id: 'T010', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t10_5', product_id: 'T010', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 24. Trà mãng cầu (T011)
  { id: 'rec_t11_1', product_id: 'T011', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t11_2', product_id: 'T011', ingredient_id: 'ing_siromangcau', quantity_needed: 20, unit: 'ml' },
  { id: 'rec_t11_3', product_id: 'T011', ingredient_id: 'ing_mutmangcau', quantity_needed: 40, unit: 'g' },
  { id: 'rec_t11_4', product_id: 'T011', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t11_5', product_id: 'T011', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 25. Trà nhãn (T012)
  { id: 'rec_t12_1', product_id: 'T012', ingredient_id: 'ing_tralai', quantity_needed: 2.77, unit: 'g' },
  { id: 'rec_t12_2', product_id: 'T012', ingredient_id: 'ing_mutnhan', quantity_needed: 40, unit: 'g' },
  { id: 'rec_t12_3', product_id: 'T012', ingredient_id: 'ing_duong', quantity_needed: 16.67, unit: 'g' },
  { id: 'rec_t12_4', product_id: 'T012', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 26. Yaourt đá (Y001)
  { id: 'rec_y1_1', product_id: 'Y001', ingredient_id: 'ing_suachua', quantity_needed: 1, unit: 'hộp' },
  { id: 'rec_y1_2', product_id: 'Y001', ingredient_id: 'ing_suadac', quantity_needed: 40, unit: 'g' },
  { id: 'rec_y1_3', product_id: 'Y001', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 27. Yaourt dâu (Y002)
  { id: 'rec_y2_1', product_id: 'Y002', ingredient_id: 'ing_suachua', quantity_needed: 1, unit: 'hộp' },
  { id: 'rec_y2_2', product_id: 'Y002', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_y2_3', product_id: 'Y002', ingredient_id: 'ing_mutdau', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_y2_4', product_id: 'Y002', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 28. Yaourt việt quất (Y003)
  { id: 'rec_y3_1', product_id: 'Y003', ingredient_id: 'ing_suachua', quantity_needed: 1, unit: 'hộp' },
  { id: 'rec_y3_2', product_id: 'Y003', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_y3_3', product_id: 'Y003', ingredient_id: 'ing_mutvietquat', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_y3_4', product_id: 'Y003', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 29. Yaourt đào (Y004)
  { id: 'rec_y4_1', product_id: 'Y004', ingredient_id: 'ing_suachua', quantity_needed: 1, unit: 'hộp' },
  { id: 'rec_y4_2', product_id: 'Y004', ingredient_id: 'ing_suadac', quantity_needed: 30, unit: 'g' },
  { id: 'rec_y4_3', product_id: 'Y004', ingredient_id: 'ing_mutdao', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_y4_4', product_id: 'Y004', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 30. Yaourt chanh dây (Y005)
  { id: 'rec_y5_suachua', product_id: 'Y005', ingredient_id: 'ing_suachua', quantity_needed: 1, unit: 'hộp' },
  { id: 'rec_y5_mut', product_id: 'Y005', ingredient_id: 'ing_mutchanhday', quantity_needed: 50, unit: 'ml' },
  { id: 'rec_y5_ly', product_id: 'Y005', ingredient_id: 'ing_lytrang', quantity_needed: 1, unit: 'cái' },

  // 31. Soda dâu (S001)
  { id: 'rec_s1_1', product_id: 'S001', ingredient_id: 'ing_7up', quantity_needed: 195, unit: 'ml' },
  { id: 'rec_s1_2', product_id: 'S001', ingredient_id: 'ing_sirodau', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_s1_3', product_id: 'S001', ingredient_id: 'ing_mutdau', quantity_needed: 10, unit: 'ml' },
  { id: 'rec_s1_duong', product_id: 'S001', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_s1_5', product_id: 'S001', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 32. Soda đào (S002)
  { id: 'rec_s2_1', product_id: 'S002', ingredient_id: 'ing_7up', quantity_needed: 195, unit: 'ml' },
  { id: 'rec_s2_2', product_id: 'S002', ingredient_id: 'ing_sirodao', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_s2_3', product_id: 'S002', ingredient_id: 'ing_mutdao', quantity_needed: 10, unit: 'ml' },
  { id: 'rec_s2_duong', product_id: 'S002', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_s2_5', product_id: 'S002', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 33. Soda việt quất (S003)
  { id: 'rec_s3_1', product_id: 'S003', ingredient_id: 'ing_7up', quantity_needed: 195, unit: 'ml' },
  { id: 'rec_s3_2', product_id: 'S003', ingredient_id: 'ing_mutvietquat', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_s3_duong', product_id: 'S003', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_s3_4', product_id: 'S003', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 34. Soda chanh dây (S005)
  { id: 'rec_s5_7up', product_id: 'S005', ingredient_id: 'ing_7up', quantity_needed: 195, unit: 'ml' },
  { id: 'rec_s5_mut', product_id: 'S005', ingredient_id: 'ing_mutchanhday', quantity_needed: 30, unit: 'ml' },
  { id: 'rec_s5_duong', product_id: 'S005', ingredient_id: 'ing_duong', quantity_needed: 8.33, unit: 'g' },
  { id: 'rec_s5_ly', product_id: 'S005', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 35. Nước ép ổi (NE001)
  { id: 'rec_ne1_1', product_id: 'NE001', ingredient_id: 'ing_duong', quantity_needed: 25, unit: 'g' },
  { id: 'rec_ne1_2', product_id: 'NE001', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 36. Nước ép táo (NE002)
  { id: 'rec_ne2_1', product_id: 'NE002', ingredient_id: 'ing_duong', quantity_needed: 25, unit: 'g' },
  { id: 'rec_ne2_2', product_id: 'NE002', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 37. Nước ép cam (NE003)
  { id: 'rec_ne3_1', product_id: 'NE003', ingredient_id: 'ing_duong', quantity_needed: 25, unit: 'g' },
  { id: 'rec_ne3_2', product_id: 'NE003', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // 38. Nước ép dưa hấu (NE004)
  { id: 'rec_ne4_1', product_id: 'NE004', ingredient_id: 'ing_duong', quantity_needed: 25, unit: 'g' },
  { id: 'rec_ne4_2', product_id: 'NE004', ingredient_id: 'ing_lyhoavan', quantity_needed: 1, unit: 'cái' },

  // Nước đóng chai
  { id: 'rec_n2', product_id: 'N002', ingredient_id: 'ing_n002', quantity_needed: 1, unit: 'lon' },
  { id: 'rec_n5', product_id: 'N005', ingredient_id: 'ing_n005', quantity_needed: 1, unit: 'chai' },

  // Topping Kem muối (trừ 60ml kem muối, không trừ ly)
  { id: 'rec_tp1_kembeo', product_id: 'TP001', ingredient_id: 'ing_kembeo', quantity_needed: 30.27, unit: 'g' },
  { id: 'rec_tp1_suadac', product_id: 'TP001', ingredient_id: 'ing_suadac', quantity_needed: 1.33, unit: 'g' },
  { id: 'rec_tp1_suatuoi', product_id: 'TP001', ingredient_id: 'ing_suatuoi', quantity_needed: 2, unit: 'ml' },
  { id: 'rec_tp1_muoibien', product_id: 'TP001', ingredient_id: 'ing_muoibien', quantity_needed: 0.67, unit: 'g' }
];

export function getIngredientPackageInfo(unit: string, quyCach?: string): { inputUnit: string; multiplier: number } {
  const u = (unit || '').toLowerCase().trim();
  const qc = (quyCach || '').toLowerCase().trim();

  // 1. Đơn vị cơ sở là các đơn vị nguyên vẹn (bịch, gói, cái, lon, chai, hộp, kg) -> Không quy đổi nhân hệ số
  if (u === 'bịch' || u === 'gói' || u === 'cái' || u === 'lon' || u === 'kg') {
    return { inputUnit: u, multiplier: 1 };
  }
  if (u === 'hộp' && !qc.includes('1000ml')) {
    return { inputUnit: 'hộp', multiplier: 1 };
  }
  if (u === 'chai' && !qc.includes('390') && !qc.includes('730') && !qc.includes('1000')) {
    return { inputUnit: 'chai', multiplier: 1 };
  }

  // 2. Đơn vị cơ sở là gram ('g') -> Quy đổi từ bao bì đóng gói sang gram
  if (u === 'g') {
    if (qc.includes('454')) return { inputUnit: 'hộp', multiplier: 454 }; // Kem RICH'S
    if (qc.includes('1284')) return { inputUnit: 'hộp', multiplier: 1284 }; // Sữa đặc
    if (qc === '1kg' || qc === '1000g') return { inputUnit: 'kg', multiplier: 1000 }; // Cà phê hạt, Cacao, Đường
    if (qc === '500g') return { inputUnit: 'bịch', multiplier: 500 }; // Topping Muối biển
    if (qc === '300g') return { inputUnit: 'bịch', multiplier: 300 };
    if (qc === '200g') return { inputUnit: 'bịch', multiplier: 200 }; // Matcha
    if (qc === '150g') return { inputUnit: 'bịch', multiplier: 150 };
    if (qc === '100g') return { inputUnit: 'bịch', multiplier: 100 };
    if (qc === '30g' || qc.includes('30')) return { inputUnit: 'bịch', multiplier: 30 }; // Hồng trà 30g
  }

  // 3. Đơn vị cơ sở là mililit ('ml') -> Quy đổi từ bao bì đóng gói sang ml
  if (u === 'ml') {
    if (qc.includes('390')) return { inputUnit: 'chai', multiplier: 390 }; // 7-Up chai
    if (qc.includes('730')) return { inputUnit: 'chai', multiplier: 730 }; // Siro đào, dâu, vải
    if (qc === '1000ml' || qc === '1l' || qc === '1l') return { inputUnit: 'hộp', multiplier: 1000 }; // Sữa tươi, Mứt
  }

  return { inputUnit: unit, multiplier: 1 };
}

// Helper hiển thị tồn kho dạng ghép đơn vị (VD: 1kg + 982g, 1 hộp + 50g, 1 chai + 195ml, 10 bịch)
export function formatIngredientStock(quantity: number, unit: string, quyCach?: string): string {
  const qty = Math.max(0, quantity);
  const u = (unit || '').toLowerCase().trim();

  // Đơn vị đã là bịch / gói / cái / lon / hộp / kg -> Hiển thị trực tiếp
  if (u === 'bịch' || u === 'gói' || u === 'cái' || u === 'lon' || u === 'kg' || (u === 'hộp' && !quyCach?.includes('1000ml'))) {
    const rounded = Number.isInteger(qty) ? qty : Math.round(qty * 1000) / 1000;
    return `${rounded} ${unit}`;
  }

  // Đơn vị là gram ('g')
  if (u === 'g') {
    if (quyCach === '1kg' || quyCach === '1000g') {
      const kg = Math.floor(qty / 1000);
      const g = Math.round(qty % 1000);
      if (kg > 0) return g > 0 ? `${kg}kg + ${g}g` : `${kg}kg`;
      return `${g}g`;
    }
    if (quyCach === '500g') {
      const bich = Math.floor(qty / 500);
      const g = Math.round(qty % 500);
      if (bich > 0) return g > 0 ? `${bich} bịch + ${g}g` : `${bich} bịch`;
      return `${g}g`;
    }
    if (quyCach === '454g' || quyCach?.includes('454')) {
      const hop = Math.floor(qty / 454);
      const g = Math.round(qty % 454);
      if (hop > 0) return g > 0 ? `${hop} hộp + ${g}g` : `${hop} hộp`;
      return `${g}g`;
    }
    if (quyCach === '300g') {
      const bich = Math.floor(qty / 300);
      const g = Math.round(qty % 300);
      if (bich > 0) return g > 0 ? `${bich} bịch + ${g}g` : `${bich} bịch`;
      return `${g}g`;
    }
    if (quyCach === '200g') {
      const bich = Math.floor(qty / 200);
      const g = Math.round(qty % 200);
      if (bich > 0) return g > 0 ? `${bich} bịch + ${g}g` : `${bich} bịch`;
      return `${g}g`;
    }
    if (quyCach === '1284g') {
      const hop = Math.floor(qty / 1284);
      const g = Math.round(qty % 1284);
      if (hop > 0) return g > 0 ? `${hop} hộp + ${g}g` : `${hop} hộp`;
      return `${g}g`;
    }
    if (quyCach === '30g' || quyCach?.includes('30')) {
      const bich = Math.floor(qty / 30);
      const g = Math.round(qty % 30);
      if (bich > 0) return g > 0 ? `${bich} bịch + ${g}g` : `${bich} bịch`;
      return `${g}g`;
    }
    const rounded = Number.isInteger(qty) ? qty : Math.round(qty * 100) / 100;
    return `${rounded}g`;
  }

  // Đơn vị là mililit ('ml')
  if (u === 'ml') {
    if (quyCach === '390ml' || quyCach?.includes('390')) {
      const chai = Math.floor(qty / 390);
      const ml = Math.round(qty % 390);
      if (chai > 0) return ml > 0 ? `${chai} chai + ${ml}ml` : `${chai} chai`;
      return `${ml}ml`;
    }
    if (quyCach?.includes('730')) {
      const chai = Math.floor(qty / 730);
      const ml = Math.round(qty % 730);
      if (chai > 0) return ml > 0 ? `${chai} chai + ${ml}ml` : `${chai} chai`;
      return `${ml}ml`;
    }
    if (quyCach === '1000ml' || quyCach === '1L' || quyCach === '1l') {
      const l = Math.floor(qty / 1000);
      const ml = Math.round(qty % 1000);
      if (l > 0) return ml > 0 ? `${l}L + ${ml}ml` : `${l}L`;
      return `${ml}ml`;
    }
    const rounded = Number.isInteger(qty) ? qty : Math.round(qty * 100) / 100;
    return `${rounded}ml`;
  }

  const rounded = Number.isInteger(qty) ? qty : Math.round(qty * 100) / 100;
  return `${rounded} ${unit}`;
}

export function formatIngredientRefill(quantity: number, unit: string, quyCach?: string): string {
  const qty = Math.max(0, quantity);
  const pkg = getIngredientPackageInfo(unit, quyCach);

  if (pkg.multiplier > 1) {
    const pkgs = qty / pkg.multiplier;
    if (Number.isInteger(pkgs)) {
      return `+${pkgs} ${pkg.inputUnit}`;
    }
    const intPkgs = Math.floor(pkgs);
    const rem = Math.round(qty % pkg.multiplier);
    if (intPkgs > 0) {
      return `+${intPkgs} ${pkg.inputUnit} + ${rem}${unit}`;
    }
    return `+${rem}${unit}`;
  }
  const rounded = Number.isInteger(qty) ? qty : Math.round(qty * 1000) / 1000;
  return `+${rounded} ${unit}`;
}

// Helper lấy/ghi LocalStorage
const getStorageItem = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const item = localStorage.getItem(key);
  if (!item) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(item);
  } catch (e) {
    return defaultValue;
  }
};

const setStorageItem = <T>(key: string, value: T): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export interface StoreSettings {
  store_name: string;
  store_address: string;
  store_phone: string;
  bill_footer: string;
  printer_ip: string;
  printer_port: number;
  pos_bridge_ip?: string;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: 'AVA COFFEE',
  store_address: 'K300, Tân Bình, TP. Hồ Chí Minh',
  store_phone: '0909 123 456',
  bill_footer: 'AVA COFFEE XIN CẢM ƠN QUÝ KHÁCH !\nCHÚC QUÝ KHÁCH NGON MIỆNG',
  printer_ip: '192.168.1.167',
  printer_port: 9100,
  pos_bridge_ip: '192.168.1.212'
};

// Lớp Mock Database lưu trữ qua LocalStorage
export const mockDb = {
  getUsers: () => getStorageItem('ava_users', MOCK_USERS),
  setUsers: (users: typeof MOCK_USERS) => setStorageItem('ava_users', users),

  getTables: () => getStorageItem('ava_tables', MOCK_TABLES),
  setTables: (tables: typeof MOCK_TABLES) => setStorageItem('ava_tables', tables),

  getCategories: () => getStorageItem('ava_categories', MOCK_CATEGORIES),
  setCategories: (categories: typeof MOCK_CATEGORIES) => setStorageItem('ava_categories', categories),

  getProducts: () => getStorageItem('ava_products', MOCK_PRODUCTS),
  setProducts: (products: typeof MOCK_PRODUCTS) => setStorageItem('ava_products', products),

  getOrders: () => getStorageItem<any[]>('ava_orders', []),
  setOrders: (orders: any[]) => setStorageItem('ava_orders', orders),

  getOrderItems: () => getStorageItem<any[]>('ava_order_items', []),
  setOrderItems: (items: any[]) => setStorageItem('ava_order_items', items),

  getTimeLogs: () => getStorageItem<any[]>('ava_time_logs', []),
  setTimeLogs: (logs: any[]) => setStorageItem('ava_time_logs', logs),

  getLeaveRequests: () => getStorageItem<any[]>('ava_leave_requests', []),
  setLeaveRequests: (requests: any[]) => setStorageItem('ava_leave_requests', requests),

  getIngredients: () => getStorageItem('ava_ingredients', MOCK_INGREDIENTS),
  setIngredients: (ingredients: typeof MOCK_INGREDIENTS) => setStorageItem('ava_ingredients', ingredients),

  getRecipes: () => getStorageItem('ava_recipes', MOCK_RECIPES),
  setRecipes: (recipes: typeof MOCK_RECIPES) => setStorageItem('ava_recipes', recipes),

  getInventoryLogs: () => getStorageItem<any[]>('ava_inventory_logs', []),
  setInventoryLogs: (logs: any[]) => setStorageItem('ava_inventory_logs', logs),

  getStoreSettings: () => getStorageItem<StoreSettings>('ava_store_settings', DEFAULT_STORE_SETTINGS),
  setStoreSettings: (settings: StoreSettings) => setStorageItem('ava_store_settings', settings)
};

export const getCurrentUser = (): typeof MOCK_USERS[0] | null => {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('ava_current_user');
  if (!user) {
    return null; 
  }
  try {
    return JSON.parse(user);
  } catch (e) {
    return null;
  }
};

export const setCurrentUser = (user: typeof MOCK_USERS[0] | null) => {
  if (typeof window !== 'undefined') {
    if (user === null) {
      localStorage.removeItem('ava_current_user');
    } else {
      localStorage.setItem('ava_current_user', JSON.stringify(user));
    }
  }
};

// --- DATA MAPPER FUNCTIONS (MAPPING BETWEEN FRONTEND AND VIETNAMESE DB COLUMNS) ---
const mapUserToClient = (u: any) => u ? {
  id: u.id,
  username: u.username,
  password: u.password,
  email: u.email,
  full_name: u.ho_ten,
  role: u.vai_tro,
  created_at: u.ngay_tao
} : null;

const mapTableToClient = (t: any) => t ? {
  id: t.id,
  table_name: t.ten_ban,
  capacity: t.suc_chua,
  status: t.trang_thai
} : null;

const mapCategoryToClient = (c: any) => c ? {
  id: c.id,
  name: c.ten_danh_muc
} : null;

const mapProductToClient = (p: any) => p ? {
  id: p.id,
  category_id: p.id_danh_muc,
  name: p.ten_san_pham,
  price: Number(p.don_gia),
  takeaway_price: p.gia_mang_ve !== null && p.gia_mang_ve !== undefined ? Number(p.gia_mang_ve) : Number(p.don_gia),
  dinein_price: p.gia_ngoi_lai !== null && p.gia_ngoi_lai !== undefined ? Number(p.gia_ngoi_lai) : Number(p.don_gia),
  cost_price: Number(p.gia_von),
  image_url: p.hinh_anh,
  status: p.trang_thai,
  don_vi_tinh: p.don_vi_tinh || 'Ly',
  mo_ta: p.mo_ta || ''
} : null;

const mapOrderToClient = (o: any) => {
  if (!o) return null;
  let orderNote = o.ghi_chu || o.notes || '';
  if (!orderNote && o.hoadondetail && Array.isArray(o.hoadondetail)) {
    for (const d of o.hoadondetail) {
      if (d.ghi_chu && typeof d.ghi_chu === 'string' && d.ghi_chu.includes('[Ghi chú đơn: ')) {
        const m = d.ghi_chu.match(/\[Ghi chú đơn:\s*([^\]]+)\]/);
        if (m) {
          orderNote = m[1].trim();
          break;
        }
      }
    }
  }

  return {
    id: o.id,
    table_id: o.id_ban,
    staff_id: o.id_nhan_vien,
    total_amount: Number(o.tong_tien),
    discount: Number(o.giam_gia || 0),
    payment_status: o.trang_thai_thanh_toan,
    payment_method: o.phuong_thuc_thanh_toan,
    created_at: o.ngay_tao,
    paid_at: o.ngay_thanh_toan,
    notes: orderNote,
    tables: o.danhsachban ? { table_name: o.danhsachban.ten_ban } : null,
    users: o.nguoidung ? { full_name: o.nguoidung.ho_ten } : null,
    order_items: o.hoadondetail && Array.isArray(o.hoadondetail) ? o.hoadondetail.map((d: any) => {
      const unitPrice = Number(d.don_gia || d.unit_price || d.price || 0);
      const qty = Number(d.so_luong || d.quantity || 1);
      const sub = Number(d.thanh_tien || d.subtotal || (qty * unitPrice));
      return {
        id: d.id,
        order_id: d.idhoadon || o.id,
        product_id: d.idsp || d.product_id,
        name: d.ten_san_pham || d.name || d.sanpham?.ten_san_pham || 'Món',
        ten_san_pham: d.ten_san_pham || d.name || d.sanpham?.ten_san_pham || 'Món',
        quantity: qty,
        so_luong: qty,
        unit_price: unitPrice,
        price: unitPrice,
        don_gia: unitPrice,
        subtotal: sub,
        thanh_tien: sub,
        notes: d.ghi_chu || d.notes || '',
        ghi_chu: d.ghi_chu || d.notes || '',
        cup_id: d.cup_id || (d.ghi_chu && d.ghi_chu.match(/\[Ly:\s*(ing_ly[a-z]+)\]/)?.[1]) || null,
        products: {
          name: d.ten_san_pham || d.name || d.sanpham?.ten_san_pham || 'Món',
          image_url: d.sanpham?.hinh_anh || ''
        }
      };
    }) : []
  };
};

const mapOrderItemToClient = (oi: any) => oi ? {
  id: oi.id,
  order_id: oi.idhoadon,
  product_id: oi.idsp,
  name: oi.ten_san_pham || oi.sanpham?.ten_san_pham || 'Món',
  ten_san_pham: oi.ten_san_pham || oi.sanpham?.ten_san_pham || 'Món',
  quantity: oi.so_luong,
  unit_price: Number(oi.don_gia),
  subtotal: Number(oi.thanh_tien),
  ghi_chu: oi.ghi_chu || '',
  cost_price: Number(oi.gia_von || 0),
  products: {
    name: oi.ten_san_pham || oi.sanpham?.ten_san_pham || 'Món',
    image_url: oi.sanpham?.hinh_anh || ''
  }
} : null;

const mapTimeLogToClient = (tl: any) => tl ? {
  id: tl.id,
  user_id: tl.id_nhan_vien,
  shift: tl.ca_lam,
  check_in_time: tl.gio_vao,
  check_out_time: tl.gio_ra,
  submitted_at: tl.thoi_gian_thuc_vao,
  real_check_out_time: tl.thoi_gian_thuc_ra,
  latitude: Number(tl.vi_do),
  longitude: Number(tl.kinh_do),
  location_address: tl.dia_chi,
  ghi_chu_vao: tl.ghi_chu_vao || '',
  ghi_chu_ra: tl.ghi_chu_ra || '',
  status: tl.trang_thai,
  is_edited: tl.sua_lai || false,
  users: tl.nguoidung ? { full_name: tl.nguoidung.ho_ten, email: tl.nguoidung.email } : null
} : null;

const mapLeaveRequestToClient = (lr: any) => lr ? {
  id: lr.id,
  user_id: lr.id_nhan_vien,
  start_date: lr.ngay_bat_dau,
  end_date: lr.ngay_ket_thuc,
  reason: lr.ly_do,
  submitted_at: lr.ngay_nop,
  status: lr.trang_thai,
  users: lr.nguoidung ? { full_name: lr.nguoidung.ho_ten, email: lr.nguoidung.email } : null
} : null;

// UNIFIED DATABASE SERVICE
export const db = {
  // --- USERS (nguoidung) ---
    async validateUserSession(loggedUser: any): Promise<{ valid: boolean; user?: any; reason?: string }> {
    if (!loggedUser || (!loggedUser.id && !loggedUser.username)) return { valid: false, reason: 'no_user' };

    // Tự động giải cứu nếu session dính tài khoản test cũ 'Nguyễn Văn Minh' hoặc 'Trần Thị Thuỷ'
    if (loggedUser.full_name === 'Nguyễn Văn Minh' || loggedUser.full_name === 'Trần Thị Thuỷ') {
      const realUser = MOCK_USERS.find(u => u.username === loggedUser.username);
      if (realUser) {
        return { valid: true, user: realUser };
      }
    }

    // Nếu có Supabase: chỉ kiểm tra khi Supabase kết nối THÀNH CÔNG VÀ CÓ DỮ LIỆU
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('nguoidung').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          const remoteUsers = data.map(mapUserToClient).filter(Boolean) as any[];
          // Cập nhật lại cache offline cho thiết bị
          mockDb.setUsers(remoteUsers);

          // Tìm user theo id hoặc username
          const validUser = remoteUsers.find(u => 
            u.id === loggedUser.id || (u.username === loggedUser.username && loggedUser.username !== 'admin')
          );

          if (!validUser) {
            // Tài khoản THỰC SỰ đã bị xóa khỏi Supabase
            return { valid: false, reason: 'deleted' };
          }

          if (validUser.password && loggedUser.password && validUser.password !== loggedUser.password) {
            // Mật khẩu THỰC SỰ đã bị Admin đổi trên Supabase
            return { valid: false, reason: 'password_changed' };
          }

          // Hợp lệ, trả về user mới nhất từ Supabase (nếu có thông tin mới hơn)
          return { valid: true, user: validUser };
        }
        // Nếu Supabase trả về lỗi hoặc mạng chập chờn: KHÔNG KICK!
        return { valid: true };
      } catch (err) {
        // Mất mạng: KHÔNG KICK!
        return { valid: true };
      }
    }

    return { valid: true };
  },

  async login(username: string, password: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('nguoidung')
        .select('*')
        .eq('username', username)
        .eq('password', password);
      
      if (!error && data && data.length > 0) {
        return mapUserToClient(data[0]);
      }
    }
    const users = mockDb.getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    return user || null;
  },

  async getUsers() {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('nguoidung').select('*');
      if (!error && data) {
        const mapped = data.map(mapUserToClient).filter(Boolean) as any[];
        mockDb.setUsers(mapped);
        return mapped;
      }
    }
    return mockDb.getUsers();
  },

  async createUser(user: any) {
    const newUser = { id: user.id || generateShortId('u_'), ...user };
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('nguoidung').insert([{
        id: newUser.id,
        username: newUser.username,
        password: newUser.password,
        email: newUser.email,
        ho_ten: newUser.full_name,
        vai_tro: newUser.role,
        ngay_tao: newUser.created_at || new Date().toISOString()
      }]).select();
      if (!error && data) return mapUserToClient(data[0]);
    }
    const users = mockDb.getUsers();
    users.push(newUser);
    mockDb.setUsers(users);
    return newUser;
  },

  async updateUser(id: string, updates: any) {
    if (isSupabaseConfigured && supabase) {
      const dbUpdates: any = {};
      if (updates.username !== undefined) dbUpdates.username = updates.username;
      if (updates.password !== undefined) dbUpdates.password = updates.password;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.full_name !== undefined) dbUpdates.ho_ten = updates.full_name;
      if (updates.role !== undefined) dbUpdates.vai_tro = updates.role;

      const { data, error } = await supabase.from('nguoidung').update(dbUpdates).eq('id', id).select();
      if (!error && data) return mapUserToClient(data[0]);
    }
    const users = mockDb.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      mockDb.setUsers(users);
      return users[index];
    }
    return null;
  },

  async deleteUser(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('nguoidung').delete().eq('id', id);
      if (!error) return true;
    }
    const users = mockDb.getUsers();
    const filtered = users.filter(u => u.id !== id);
    mockDb.setUsers(filtered);
    return true;
  },

  // --- TABLES (danhsachban) ---
  async getTables(forceFresh = false) {
    if (cachedTables && !forceFresh) return cachedTables;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('danhsachban').select('*');
      if (!error && data) {
        cachedTables = data.map(mapTableToClient).filter(Boolean).sort((a: any, b: any) => a.table_name.localeCompare(b.table_name)) as any[];
        mockDb.setTables(cachedTables);
        return cachedTables;
      }
    }
    return mockDb.getTables().sort((a, b) => a.table_name.localeCompare(b.table_name));
  },

  async updateTableStatus(id: string, status: 'Trống' | 'Đang phục vụ') {
    cachedTables = null;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('danhsachban').update({ trang_thai: status }).eq('id', id).select();
      if (!error && data) return mapTableToClient(data[0]);
    }
    const tables = mockDb.getTables();
    const idx = tables.findIndex(t => t.id === id);
    if (idx !== -1) {
      tables[idx].status = status;
      mockDb.setTables(tables);
      return tables[idx];
    }
    return null;
  },

  async createTable(table: { table_name: string; capacity?: number; status?: 'Trống' | 'Đang phục vụ' }) {
    const defaultCapacity = Number(table.capacity) || 4;
    const defaultStatus = table.status || 'Trống';
    cachedTables = null;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('danhsachban').insert([{
        ten_ban: table.table_name.trim(),
        suc_chua: defaultCapacity,
        trang_thai: defaultStatus
      }]).select();
      if (!error && data) {
        broadcastRealtimeEvent('table_update');
        return mapTableToClient(data[0]);
      }
    }
    const tables = mockDb.getTables();
    const newTable = {
      id: generateShortId('tb_'),
      table_name: table.table_name.trim(),
      capacity: defaultCapacity,
      status: defaultStatus
    };
    tables.push(newTable);
    mockDb.setTables(tables);
    broadcastRealtimeEvent('table_update');
    return newTable;
  },

  async updateTable(id: string, data: { table_name?: string; capacity?: number; status?: 'Trống' | 'Đang phục vụ' }) {
    cachedTables = null;
    if (isSupabaseConfigured && supabase) {
      const updatePayload: any = {};
      if (data.table_name !== undefined) updatePayload.ten_ban = data.table_name.trim();
      if (data.capacity !== undefined) updatePayload.suc_chua = Number(data.capacity);
      if (data.status !== undefined) updatePayload.trang_thai = data.status;

      const { data: updated, error } = await supabase.from('danhsachban').update(updatePayload).eq('id', id).select();
      if (!error && updated && updated.length > 0) {
        broadcastRealtimeEvent('table_update');
        return mapTableToClient(updated[0]);
      }
    }
    const tables = mockDb.getTables();
    const idx = tables.findIndex(t => t.id === id);
    if (idx !== -1) {
      tables[idx] = {
        ...tables[idx],
        ...(data.table_name !== undefined ? { table_name: data.table_name.trim() } : {}),
        ...(data.capacity !== undefined ? { capacity: Number(data.capacity) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {})
      };
      mockDb.setTables(tables);
      broadcastRealtimeEvent('table_update');
      return tables[idx];
    }
    return null;
  },

  async deleteTable(id: string): Promise<{ success: boolean; message?: string }> {
    const tables = await this.getTables();
    const currentTable = tables.find(t => t.id === id);
    if (!currentTable) {
      return { success: false, message: 'Bàn không tồn tại!' };
    }

    const lowerName = currentTable.table_name.toLowerCase();
    if (lowerName.includes('mang về') || lowerName.includes('takeaway')) {
      return { success: false, message: 'Bàn "Khách mang về" là mặc định bắt buộc của hệ thống, không thể xóa!' };
    }

    if (currentTable.status === 'Đang phục vụ') {
      return { success: false, message: 'Bàn này đang ở trạng thái "Đang phục vụ". Vui lòng thanh toán hoặc đổi bàn trước khi xóa!' };
    }

    if (isSupabaseConfigured && supabase) {
      // 1. Kiểm tra xem bàn có đơn hàng chưa thanh toán không
      const { data: unpaidOrders } = await supabase
        .from('hoadon')
        .select('id')
        .eq('id_ban', id)
        .eq('trang_thai_thanh_toan', 'Chưa thanh toán')
        .limit(1);

      if (unpaidOrders && unpaidOrders.length > 0) {
        return { success: false, message: `Bàn này đang có đơn hàng chưa thanh toán (#${unpaidOrders[0].id}). Vui lòng thanh toán hoặc chuyển bàn trước khi xóa!` };
      }

      // 2. Kiểm tra xem bàn đã từng có hóa đơn lịch sử chưa (tránh vỡ lịch sử hoặc lỗi foreign key)
      const { data: pastOrders } = await supabase
        .from('hoadon')
        .select('id')
        .eq('id_ban', id)
        .limit(1);

      if (pastOrders && pastOrders.length > 0) {
        return { success: false, message: 'Bàn này đã từng có hóa đơn thanh toán trong quá khứ. Để bảo toàn lịch sử doanh thu và đối soát kho, không thể xóa vĩnh viễn bàn đã có đơn hàng!' };
      }

      const { error } = await supabase.from('danhsachban').delete().eq('id', id);
      if (error) {
        console.error('Lỗi khi xóa bàn:', error);
        return { success: false, message: `Lỗi CSDL: ${error.message}` };
      }
    }

    cachedTables = null;
    const localTables = mockDb.getTables();
    mockDb.setTables(localTables.filter(t => t.id !== id));
    broadcastRealtimeEvent('table_update');
    return { success: true };
  },

  // --- CATEGORIES (danhmuc) ---
  async getCategories() {
    if (cachedCategories) return cachedCategories;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('danhmuc').select('*');
      if (!error && data) {
        cachedCategories = data.map(mapCategoryToClient).filter(Boolean).sort((a: any, b: any) => a.name.localeCompare(b.name)) as any[];
        mockDb.setCategories(cachedCategories);
        return cachedCategories;
      }
    }
    return mockDb.getCategories().sort((a, b) => a.name.localeCompare(b.name));
  },

  async createCategory(name: string) {
    cachedCategories = null;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('danhmuc').insert([{ ten_danh_muc: name }]).select();
      if (!error && data) return mapCategoryToClient(data[0]);
    }
    const categories = mockDb.getCategories();
    const newCat = { id: generateShortId('c_'), name };
    categories.push(newCat);
    mockDb.setCategories(categories);
    return newCat;
  },

  async deleteCategory(id: string) {
    cachedCategories = null;
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('danhmuc').delete().eq('id', id);
      if (!error) return true;
    }
    const categories = mockDb.getCategories();
    mockDb.setCategories(categories.filter(c => c.id !== id));
    return true;
  },

  // --- PRODUCTS (sanpham) ---
  async getProducts() {
    if (cachedProducts) return cachedProducts;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('sanpham').select('*');
      if (!error && data) {
        cachedProducts = data.map(mapProductToClient).filter(Boolean) as any[];
        mockDb.setProducts(cachedProducts);
        return cachedProducts;
      }
    }
    return mockDb.getProducts();
  },

  async createProduct(product: any) {
    cachedProducts = null;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('sanpham').insert([{
        id: product.id || generateShortId('p_'),
        id_danh_muc: product.category_id,
        ten_san_pham: product.name,
        don_vi_tinh: product.don_vi_tinh || 'Ly',
        don_gia: product.price,
        gia_mang_ve: product.takeaway_price ?? product.price,
        gia_ngoi_lai: product.dinein_price ?? product.price,
        gia_von: product.cost_price,
        hinh_anh: product.image_url,
        mo_ta: product.mo_ta || '',
        trang_thai: product.status
      }]).select();
      if (!error && data) return mapProductToClient(data[0]);
    }
    const products = mockDb.getProducts();
    const newProd = { id: generateShortId('p_'), ...product };
    products.push(newProd);
    mockDb.setProducts(products);
    return newProd;
  },

  async updateProduct(id: string, updates: any) {
    cachedProducts = null;
    if (isSupabaseConfigured && supabase) {
      const dbUpdates: any = {};
      if (updates.category_id !== undefined) dbUpdates.id_danh_muc = updates.category_id;
      if (updates.name !== undefined) dbUpdates.ten_san_pham = updates.name;
      if (updates.don_vi_tinh !== undefined) dbUpdates.don_vi_tinh = updates.don_vi_tinh;
      if (updates.price !== undefined) dbUpdates.don_gia = updates.price;
      if (updates.takeaway_price !== undefined) dbUpdates.gia_mang_ve = updates.takeaway_price;
      if (updates.dinein_price !== undefined) dbUpdates.gia_ngoi_lai = updates.dinein_price;
      if (updates.cost_price !== undefined) dbUpdates.gia_von = updates.cost_price;
      if (updates.image_url !== undefined) dbUpdates.hinh_anh = updates.image_url;
      if (updates.mo_ta !== undefined) dbUpdates.mo_ta = updates.mo_ta;
      if (updates.status !== undefined) dbUpdates.trang_thai = updates.status;

      const { data, error } = await supabase.from('sanpham').update(dbUpdates).eq('id', id).select();
      if (!error && data) return mapProductToClient(data[0]);
    }
    const products = mockDb.getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) {
      products[idx] = { ...products[idx], ...updates };
      mockDb.setProducts(products);
      return products[idx];
    }
    return null;
  },

  async deleteProduct(id: string) {
    cachedProducts = null;
    cachedRecipes = null;
    if (isSupabaseConfigured && supabase) {
      // Kiểm tra xem sản phẩm đã từng phát sinh trong hóa đơn bán hàng nào chưa
      const { data: pastOrders } = await supabase
        .from('hoadondetail')
        .select('id')
        .eq('idsp', id)
        .limit(1);

      if (pastOrders && pastOrders.length > 0) {
        throw new Error('Món ăn này đã từng có hóa đơn bán hàng trong lịch sử. Để bảo toàn dữ liệu báo cáo và hóa đơn cũ, vui lòng chuyển trạng thái sang "Hết hàng" thay vì xóa vĩnh viễn món!');
      }

      const { error } = await supabase.from('sanpham').delete().eq('id', id);
      if (error) {
        throw new Error(`Lỗi khi xóa món ăn: ${error.message}`);
      }
      broadcastRealtimeEvent('order_update');
      return true;
    }
    const products = mockDb.getProducts();
    mockDb.setProducts(products.filter(p => p.id !== id));
    broadcastRealtimeEvent('order_update');
    return true;
  },

  // Tạo sản phẩm kèm công thức định lượng và chi phí phụ liệu cố định (Base Cost)
  async createProductWithRecipe(
    productData: {
      name: string;
      price: number;
      category_id: string;
      image_url?: string;
      status: 'Còn hàng' | 'Hết hàng';
      base_cost?: number;
    },
    recipes: Array<{ ingredient_id: string; quantity_needed: number }>
  ) {
    cachedProducts = null;
    const prodId = generateShortId('p_');
    const baseCost = Number(productData.base_cost || 0);

    // Tính tổng giá vốn dự tính (giá nguyên liệu kho theo định lượng + chi phí cứng)
    const ingredients = await this.getIngredients();
    let calculatedCost = baseCost;
    for (const r of recipes) {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      const unitCost = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
      calculatedCost += r.quantity_needed * unitCost;
    }
    calculatedCost = Math.round(calculatedCost);

    if (isSupabaseConfigured && supabase) {
      // 1. Tạo sản phẩm (dùng chính xác cột don_gia trong schema CSDL)
      const { data: newProd, error: prodErr } = await supabase
        .from('sanpham')
        .insert([{
          id: prodId,
          ten_san_pham: productData.name.trim(),
          don_gia: Number(productData.price),
          gia_von: calculatedCost,
          id_danh_muc: productData.category_id,
          hinh_anh: productData.image_url || '/logo.jpg',
          trang_thai: productData.status
        }])
        .select()
        .single();

      if (prodErr) throw prodErr;

      // 2. Chèn công thức định lượng nếu có
      if (recipes.length > 0) {
        const recipeRows = recipes.map(r => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          return {
            id: generateShortId('rec_'),
            id_san_pham: prodId,
            id_nguyen_lieu: r.ingredient_id,
            so_luong_can: r.quantity_needed,
            don_vi_tinh: (ing as any)?.unit || (ing as any)?.don_vi_tinh || 'g'
          };
        });
        await supabase.from('congthuc').insert(recipeRows);
      }
      cachedProducts = null;
      cachedRecipes = null;

      broadcastRealtimeEvent('order_update');
      return mapProductToClient(newProd);
    } else {
      const products = mockDb.getProducts();
      const newProd = {
        id: prodId,
        name: productData.name.trim(),
        price: Number(productData.price),
        cost_price: calculatedCost,
        category_id: productData.category_id,
        image_url: productData.image_url || '/logo.jpg',
        status: productData.status
      };
      (products as any[]).push(newProd);
      mockDb.setProducts(products);

      if (recipes.length > 0) {
        const mockRecipes = mockDb.getRecipes();
        recipes.forEach(r => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          mockRecipes.push({
            id: generateShortId('rec_'),
            product_id: prodId,
            ingredient_id: r.ingredient_id,
            quantity_needed: r.quantity_needed,
            unit: (ing as any)?.unit || 'g'
          });
        });
        mockDb.setRecipes(mockRecipes);
      }

      broadcastRealtimeEvent('order_update');
      return newProd;
    }
  },

  // Cập nhật sản phẩm kèm làm mới công thức định lượng
  async updateProductWithRecipe(
    productId: string,
    productData: {
      name: string;
      price: number;
      category_id: string;
      image_url?: string;
      status: 'Còn hàng' | 'Hết hàng';
      base_cost?: number;
    },
    recipes: Array<{ ingredient_id: string; quantity_needed: number }>
  ) {
    cachedProducts = null;
    cachedRecipes = null;
    const baseCost = Number(productData.base_cost || 0);
    const ingredients = await this.getIngredients();
    let calculatedCost = baseCost;
    for (const r of recipes) {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      const unitCost = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
      calculatedCost += r.quantity_needed * unitCost;
    }
    calculatedCost = Math.round(calculatedCost);

    if (isSupabaseConfigured && supabase) {
      // 1. Cập nhật thông tin món (dùng chính xác cột don_gia trong schema CSDL)
      const { data: updatedProd, error: prodErr } = await supabase
        .from('sanpham')
        .update({
          ten_san_pham: productData.name.trim(),
          don_gia: Number(productData.price),
          gia_von: calculatedCost,
          id_danh_muc: productData.category_id,
          hinh_anh: productData.image_url || '/logo.jpg',
          trang_thai: productData.status
        })
        .eq('id', productId)
        .select()
        .single();

      if (prodErr) throw prodErr;

      // 2. Xóa công thức cũ và chèn công thức mới vào bảng congthuc
      await supabase.from('congthuc').delete().eq('id_san_pham', productId);
      if (recipes.length > 0) {
        const recipeRows = recipes.map(r => {
          const ing = ingredients.find(i => i.id === r.ingredient_id);
          return {
            id: generateShortId('rec_'),
            id_san_pham: productId,
            id_nguyen_lieu: r.ingredient_id,
            so_luong_can: r.quantity_needed,
            don_vi_tinh: (ing as any)?.unit || (ing as any)?.don_vi_tinh || 'g'
          };
        });
        await supabase.from('congthuc').insert(recipeRows);
      }

      broadcastRealtimeEvent('order_update');
      return mapProductToClient(updatedProd);
    } else {
      const products = mockDb.getProducts();
      const pIdx = products.findIndex(p => p.id === productId);
      if (pIdx !== -1) {
        products[pIdx] = {
          ...products[pIdx],
          name: productData.name.trim(),
          price: Number(productData.price),
          cost_price: calculatedCost,
          category_id: productData.category_id,
          image_url: productData.image_url || '/logo.jpg',
          status: productData.status
        } as any;
        mockDb.setProducts(products);
      }

      const allRecipes = mockDb.getRecipes().filter(r => r.product_id !== productId);
      recipes.forEach(r => {
        const ing = ingredients.find(i => i.id === r.ingredient_id);
        allRecipes.push({
          id: generateShortId('rec_'),
          product_id: productId,
          ingredient_id: r.ingredient_id,
          quantity_needed: r.quantity_needed,
          unit: (ing as any)?.unit || 'g'
        });
      });
      mockDb.setRecipes(allRecipes);

      broadcastRealtimeEvent('order_update');
      return products[pIdx];
    }
  },

  // --- ORDERS & ORDER ITEMS (hoadon & hoadondetail) ---
  // Tải nhanh danh sách hóa đơn CHƯA THANH TOÁN (tối ưu hóa tốc độ cực nhanh cho POS & Thanh toán)
  async getUnpaidOrders() {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('hoadon')
        .select(`
          *,
          danhsachban (ten_ban),
          nguoidung (ho_ten),
          hoadondetail (id, idsp, ten_san_pham, so_luong, don_gia, thanh_tien, ghi_chu)
        `)
        .eq('trang_thai_thanh_toan', 'Chưa thanh toán')
        .order('ngay_tao', { ascending: false });

      if (!error && data) {
        return data.map(mapOrderToClient).filter(Boolean) as any[];
      }
    }
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const users = mockDb.getUsers();
    return orders
      .filter(o => o.payment_status === 'Chưa thanh toán')
      .map(order => ({
        ...order,
        tables: tables.find(t => t.id === order.table_id) || null,
        users: users.find(u => u.id === order.staff_id) || null
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // Tải danh sách đơn hàng gần đây (cả đã thanh toán & chưa thanh toán) cho Bếp / Barista (Loại bỏ các đơn đã hủy)
  async getRecentOrders(limit = 40) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('hoadon')
        .select(`
          *,
          danhsachban (ten_ban),
          nguoidung (ho_ten),
          hoadondetail (id, idsp, ten_san_pham, so_luong, don_gia, thanh_tien, ghi_chu)
        `)
        .neq('trang_thai_thanh_toan', 'Đã hủy')
        .neq('trang_thai_thanh_toan', 'Chờ duyệt hủy')
        .order('ngay_tao', { ascending: false })
        .limit(limit);

      if (!error && data) {
        return data.map(mapOrderToClient).filter(Boolean) as any[];
      }
    }
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const users = mockDb.getUsers();
    return orders
      .filter(o => o.payment_status !== 'Đã hủy' && (o as any).payment_status !== 'Chờ duyệt hủy')
      .slice(0, limit)
      .map(order => ({
        ...order,
        tables: tables.find(t => t.id === order.table_id) || null,
        users: users.find(u => u.id === order.staff_id) || null
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // Chuyển bàn: Chuyển toàn bộ đơn hàng từ bàn nguồn sang bàn đích (bàn đích phải đang trống)
  async transferTable(fromTableId: string, toTableId: string, orderId: string) {
    if (isSupabaseConfigured && supabase) {
      // 1. Cập nhật id_ban của hóa đơn sang bàn mới
      const { error: orderErr } = await supabase
        .from('hoadon')
        .update({ id_ban: toTableId })
        .eq('id', orderId);
      if (orderErr) throw orderErr;

      // 2. Chuyển bàn cũ về 'Trống' (nếu không phải Khách mang về)
      const { data: fromTable } = await supabase.from('danhsachban').select('ten_ban').eq('id', fromTableId).maybeSingle();
      if (fromTable?.ten_ban !== 'Khách mang về') {
        await supabase.from('danhsachban').update({ trang_thai: 'Trống' }).eq('id', fromTableId);
      }

      // 3. Chuyển bàn mới thành 'Đang phục vụ' (nếu không phải Khách mang về)
      const { data: toTable } = await supabase.from('danhsachban').select('ten_ban').eq('id', toTableId).maybeSingle();
      if (toTable?.ten_ban !== 'Khách mang về') {
        await supabase.from('danhsachban').update({ trang_thai: 'Đang phục vụ' }).eq('id', toTableId);
      }

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      return true;
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.table_id = toTableId;
      mockDb.setOrders(orders);
    }
    const fromT = tables.find(t => t.id === fromTableId);
    if (fromT && fromT.table_name !== 'Khách mang về') {
      fromT.status = 'Trống';
    }
    const toT = tables.find(t => t.id === toTableId);
    if (toT && toT.table_name !== 'Khách mang về') {
      toT.status = 'Đang phục vụ';
    }
    mockDb.setTables(tables);
    broadcastRealtimeEvent('order_update');
    broadcastRealtimeEvent('table_update');
    return true;
  },

  // Đồng bộ/Cập nhật toàn bộ món ăn trong đơn chưa thanh toán (khi thêm món/xóa món của bàn đang phục vụ)
  async syncUnpaidOrder(orderId: string, orderData: { total_amount: number; discount?: number; notes?: string; items: any[] }) {
    const { total_amount, discount = 0, notes = '', items } = orderData;
    if (isSupabaseConfigured && supabase) {
      // 1. Cập nhật thông tin tổng tiền, giảm giá, ghi chú của hóa đơn
      await supabase
        .from('hoadon')
        .update({
          tong_tien: total_amount,
          giam_gia: discount,
          ghi_chu: notes
        })
        .eq('id', orderId);

      // 2. Xóa các chi tiết cũ của hóa đơn
      await supabase.from('hoadondetail').delete().eq('idhoadon', orderId);

      // 3. Chèn lại danh sách chi tiết mới
      if (items.length > 0) {
        const productIds = items.map(i => i.product_id);
        const { data: dbProds } = await supabase.from('sanpham').select('id, gia_von').in('id', productIds);
        const dbProducts = dbProds || [];

        const orderItemsToInsert = items.map((item, idx) => {
          const dbProd = dbProducts.find(p => p.id === item.product_id);
          const costPrice = dbProd ? Number(dbProd.gia_von || 0) : 0;
          return {
            id: generateShortId('item_'),
            idhoadon: orderId,
            idsp: item.product_id,
            ten_san_pham: item.name || 'Sản phẩm',
            don_vi_tinh: item.don_vi_tinh || 'Ly',
            don_gia: item.price || item.unit_price || 0,
            so_luong: item.quantity,
            thanh_tien: item.subtotal,
            ghi_chu: item.notes || '',
            gia_von: costPrice
          };
        });

        await supabase.from('hoadondetail').insert(orderItemsToInsert);
      }

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      return true;
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.total_amount = total_amount;
      order.giam_gia = discount;
      order.notes = notes;
      mockDb.setOrders(orders);
    }
    const orderItems = mockDb.getOrderItems().filter(oi => oi.order_id !== orderId);
    const newItems = items.map(item => ({
      id: generateShortId('item_'),
      order_id: orderId,
      product_id: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.price || item.unit_price,
      subtotal: item.subtotal,
      notes: item.notes || ''
    }));
    mockDb.setOrderItems([...orderItems, ...newItems]);
    broadcastRealtimeEvent('order_update');
    return true;
  },

  // Gộp Bàn: Gộp một hoặc nhiều bàn đang phục vụ vào bàn đích
  async mergeTables(targetTableId: string, sourceTableIds: string[], targetOrderId: string) {
    if (isSupabaseConfigured && supabase) {
      // 1. Lấy thông tin các món hiện tại của bàn đích
      const { data: targetDetail } = await supabase
        .from('hoadondetail')
        .select('*')
        .eq('idhoadon', targetOrderId);
      
      const targetItems = (targetDetail || []).map((i: any) => ({
        product_id: i.idsp,
        name: i.ten_san_pham,
        don_vi_tinh: i.don_vi_tinh,
        price: Number(i.don_gia || 0),
        quantity: Number(i.so_luong || 1),
        subtotal: Number(i.thanh_tien || 0),
        notes: i.ghi_chu || ''
      }));

      // 2. Với mỗi bàn nguồn, tìm đơn chưa thanh toán và lấy chi tiết
      for (const sourceId of sourceTableIds) {
        const { data: sourceOrders } = await supabase
          .from('hoadon')
          .select('id')
          .eq('id_ban', sourceId)
          .neq('trang_thai_thanh_toan', 'Đã thanh toán')
          .neq('trang_thai_thanh_toan', 'Đã hủy')
          .order('ngay_tao', { ascending: false });

        if (sourceOrders && sourceOrders.length > 0) {
          for (const sOrder of sourceOrders) {
            const { data: sDetails } = await supabase
              .from('hoadondetail')
              .select('*')
              .eq('idhoadon', sOrder.id);

            if (sDetails) {
              for (const sItem of sDetails) {
                const existing = targetItems.find(
                  (ti: any) => ti.product_id === sItem.idsp && (ti.notes || '') === (sItem.ghi_chu || '')
                );
                if (existing) {
                  existing.quantity += Number(sItem.so_luong || 1);
                  existing.subtotal += Number(sItem.thanh_tien || 0);
                } else {
                  targetItems.push({
                    product_id: sItem.idsp,
                    name: sItem.ten_san_pham,
                    don_vi_tinh: sItem.don_vi_tinh,
                    price: Number(sItem.don_gia || 0),
                    quantity: Number(sItem.so_luong || 1),
                    subtotal: Number(sItem.thanh_tien || 0),
                    notes: sItem.ghi_chu || ''
                  });
                }
              }
            }

            // Đóng đơn nguồn vì đã gộp vào bàn đích
            await supabase
              .from('hoadon')
              .update({
                trang_thai_thanh_toan: 'Đã hủy',
                ghi_chu: `Đã gộp vào đơn #${targetOrderId.slice(0, 8)}`
              })
              .eq('id', sOrder.id);
          }
        }

        // Trả bàn nguồn về Trống
        await supabase
          .from('danhsachban')
          .update({ trang_thai: 'Trống' })
          .eq('id', sourceId);
      }

      // 3. Tính lại tổng tiền và cập nhật lại bàn đích
      const totalAmount = targetItems.reduce((sum: number, i: any) => sum + (Number(i.subtotal) || 0), 0);
      await this.syncUnpaidOrder(targetOrderId, {
        total_amount: totalAmount,
        items: targetItems
      });

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      return { totalAmount, items: targetItems };
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const targetOrder = orders.find(o => o.id === targetOrderId);
    const allOrderItems = mockDb.getOrderItems();

    let targetItems = allOrderItems.filter(i => i.order_id === targetOrderId).map(i => ({
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal,
      notes: i.notes || ''
    }));

    for (const sourceId of sourceTableIds) {
      const sourceOrder = orders.find(o => o.table_id === sourceId && o.payment_status !== 'Đã thanh toán' && o.payment_status !== 'Đã hủy');
      if (sourceOrder) {
        const sourceItems = allOrderItems.filter(i => i.order_id === sourceOrder.id);
        for (const sItem of sourceItems) {
          const existing = targetItems.find(ti => ti.product_id === sItem.product_id && (ti.notes || '') === (sItem.notes || ''));
          if (existing) {
            existing.quantity += sItem.quantity;
            existing.subtotal += sItem.subtotal;
          } else {
            targetItems.push({ ...sItem });
          }
        }
        sourceOrder.payment_status = 'Đã hủy';
        sourceOrder.notes = `Đã gộp vào đơn #${targetOrderId.slice(0, 8)}`;
      }
      const sT = tables.find(t => t.id === sourceId);
      if (sT && sT.table_name !== 'Khách mang về') {
        sT.status = 'Trống';
      }
    }

    const totalAmount = targetItems.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);
    if (targetOrder) {
      targetOrder.total_amount = totalAmount;
    }
    mockDb.setOrders(orders);
    mockDb.setTables(tables);
    broadcastRealtimeEvent('order_update');
    broadcastRealtimeEvent('table_update');
    return { totalAmount, items: targetItems };
  },

  async getOrders() {
    if (isSupabaseConfigured && supabase) {
      let allOrders: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('hoadon')
          .select(`
            *,
            danhsachban (ten_ban),
            nguoidung (ho_ten),
            hoadondetail (id, ghi_chu)
          `)
          .order('ngay_tao', { ascending: false })
          .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allOrders = allOrders.concat(data);
        if (data.length < step) break;
        from += step;
      }
      if (allOrders.length > 0) return allOrders.map(mapOrderToClient).filter(Boolean) as any[];
    }
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const users = mockDb.getUsers();
    return orders.map(order => ({
      ...order,
      tables: tables.find(t => t.id === order.table_id) || null,
      users: users.find(u => u.id === order.staff_id) || null
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async getOrderItems(orderId: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('hoadondetail')
        .select(`
          *,
          sanpham (hinh_anh)
        `)
        .eq('idhoadon', orderId);
      if (!error && data) return data.map(mapOrderItemToClient).filter(Boolean) as any[];
    }
    const items = mockDb.getOrderItems();
    const products = mockDb.getProducts();
    return items
      .filter(item => item.order_id === orderId)
      .map(item => {
        const product = products.find(p => p.id === item.product_id);
        return {
          ...item,
          products: product ? {
            name: product.name,
            image_url: product.image_url
          } : null
        };
      });
  },

  async getUnpaidOrderByTableId(tableId: string) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('hoadon')
        .select(`
          *,
          danhsachban (ten_ban),
          nguoidung (ho_ten),
          hoadondetail (id, idsp, ten_san_pham, so_luong, don_gia, thanh_tien, ghi_chu)
        `)
        .eq('id_ban', tableId)
        .eq('trang_thai_thanh_toan', 'Chưa thanh toán')
        .order('ngay_tao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      const mappedOrder = mapOrderToClient(data);
      if (!mappedOrder) return null;
      const items = await this.getOrderItems(mappedOrder.id);
      return { order: mappedOrder, items };
    }

    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const users = mockDb.getUsers();
    const found = orders.find(o => o.table_id === tableId && o.payment_status === 'Chưa thanh toán');
    if (!found) return null;

    const fullOrder = {
      ...found,
      tables: tables.find(t => t.id === found.table_id) || null,
      users: users.find(u => u.id === found.staff_id) || null
    };
    const items = await this.getOrderItems(found.id);
    return { order: fullOrder, items };
  },

  async getAllOrderItems() {
    if (isSupabaseConfigured && supabase) {
      let allItems: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('hoadondetail')
          .select(`
            *,
            sanpham (ten_san_pham, hinh_anh)
          `)
          .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < step) break;
        from += step;
      }

      if (allItems.length > 0) {
        return allItems.map(oi => ({
          ...mapOrderItemToClient(oi),
          products: {
            name: oi.sanpham?.ten_san_pham || oi.ten_san_pham || '',
            image_url: oi.sanpham?.hinh_anh || ''
          }
        })).filter(Boolean) as any[];
      }
    }
    return mockDb.getOrderItems();
  },

  async createOrder(orderData: { table_id: string; staff_id: string; total_amount: number; discount?: number; notes?: string; items: any[] }) {
    const { table_id, staff_id, total_amount, discount = 0, notes = '', items } = orderData;
    const createdAt = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      const productIds = items.map(item => item.product_id);

      const [productsResult, tableResult, unpaidResult] = await Promise.all([
        supabase.from('sanpham').select('id, gia_von').in('id', productIds),
        supabase.from('danhsachban').select('ten_ban').eq('id', table_id).maybeSingle(),
        supabase.from('hoadon')
          .select('*')
          .eq('id_ban', table_id)
          .eq('trang_thai_thanh_toan', 'Chưa thanh toán')
          .order('ngay_tao', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      const dbProducts = productsResult.data || [];
      const tableData = tableResult.data;
      const existingUnpaidOrder = unpaidResult.data;
      const isTakeaway = tableData?.ten_ban === 'Khách mang về' || table_id === 'tb_mangve';

      if (!isTakeaway && existingUnpaidOrder) {
        const existingOrderId = existingUnpaidOrder.id;
        const newTotalAmount = Number(existingUnpaidOrder.tong_tien || 0) + total_amount;
        const newDiscount = Number(existingUnpaidOrder.giam_gia || 0) + discount;

        const [updateOrderResult, detailsResult] = await Promise.all([
          supabase
            .from('hoadon')
            .update({
              tong_tien: newTotalAmount,
              giam_gia: newDiscount
            })
            .eq('id', existingOrderId)
            .select(`
              *,
              danhsachban (ten_ban),
              nguoidung (ho_ten)
            `)
            .single(),
          supabase
            .from('hoadondetail')
            .select('*')
            .eq('idhoadon', existingOrderId)
        ]);

        if (updateOrderResult.error) {
          console.error('Lỗi cập nhật hóa đơn cộng dồn:', updateOrderResult.error);
          throw updateOrderResult.error;
        }

        const updatedOrder = updateOrderResult.data;
        const existingDetails = detailsResult.data || [];
        const dbInserts: any[] = [];
        const dbUpdates: any[] = [];

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const matchedDetail = existingDetails.find(d => d.idsp === item.product_id);
          const dbProd = dbProducts.find(p => p.id === item.product_id);
          const costPrice = dbProd ? Number(dbProd.gia_von || 0) : 0;

          let itemNote = item.notes || '';
          if (idx === 0 && notes && !itemNote.includes('[Ghi chú đơn: ')) {
            itemNote = itemNote ? `${itemNote} [Ghi chú đơn: ${notes}]` : `[Ghi chú đơn: ${notes}]`;
          }

          if (matchedDetail) {
            const newQty = Number(matchedDetail.so_luong || 0) + item.quantity;
            const newSubtotal = Number(matchedDetail.thanh_tien || 0) + item.subtotal;
            dbUpdates.push(
              supabase
                .from('hoadondetail')
                .update({
                  so_luong: newQty,
                  thanh_tien: newSubtotal,
                  ghi_chu: itemNote || matchedDetail.ghi_chu
                })
                .eq('id', matchedDetail.id)
            );
          } else {
            dbInserts.push({
              id: generateShortId('item_'),
              idhoadon: existingOrderId,
              idsp: item.product_id,
              ten_san_pham: item.name || 'Sản phẩm',
              don_vi_tinh: item.don_vi_tinh || 'Ly',
              don_gia: item.unit_price || item.price,
              so_luong: item.quantity,
              thanh_tien: item.subtotal,
              ghi_chu: itemNote,
              gia_von: costPrice
            });
          }
        }

        const promises: any[] = [...dbUpdates];
        if (dbInserts.length > 0) {
          promises.push(supabase.from('hoadondetail').insert(dbInserts));
        }
        if (promises.length > 0) {
          await Promise.all(promises);
        }

        return mapOrderToClient(updatedOrder);
      }

      const orderId = generateShortId('ord_');
      const validStaffId = (staff_id && staff_id !== 'u1') ? staff_id : 'admin';

      const insertPayload: any = {
        id: orderId,
        id_ban: table_id,
        id_nhan_vien: validStaffId,
        tong_tien: total_amount,
        giam_gia: discount,
        trang_thai_thanh_toan: 'Chưa thanh toán',
        ngay_tao: createdAt
      };
      if (notes) {
        insertPayload.ghi_chu = notes;
      }

      let { data: order, error: orderErr } = await supabase
        .from('hoadon')
        .insert([insertPayload])
        .select(`
          *,
          danhsachban (ten_ban),
          nguoidung (ho_ten)
        `)
        .single();

      if (orderErr) {
        console.warn('Thử lại lưu hóa đơn với tài khoản admin:', orderErr);
        const retryResult = await supabase
          .from('hoadon')
          .insert([{
            id: orderId,
            id_ban: table_id,
            id_nhan_vien: 'admin',
            tong_tien: total_amount,
            giam_gia: discount,
            trang_thai_thanh_toan: 'Chưa thanh toán',
            ngay_tao: createdAt
          }])
          .select()
          .single();
        
        order = retryResult.data;
        orderErr = retryResult.error;
      }

      if (orderErr || !order) {
        console.error('Lỗi không thể tạo hóa đơn trên Supabase:', orderErr);
        throw new Error(orderErr?.message || 'Không thể tạo đơn hàng trên máy chủ.');
      }

      const orderItemsToInsert = items.map((item, idx) => {
        const dbProd = dbProducts.find(p => p.id === item.product_id);
        const costPrice = dbProd ? Number(dbProd.gia_von || 0) : 0;
        let itemNote = item.notes || '';
        if (idx === 0 && notes && !itemNote.includes('[Ghi chú đơn: ')) {
          itemNote = itemNote ? `${itemNote} [Ghi chú đơn: ${notes}]` : `[Ghi chú đơn: ${notes}]`;
        }

        return {
          id: generateShortId('item_'),
          idhoadon: orderId,
          idsp: item.product_id,
          ten_san_pham: item.name || 'Sản phẩm',
          don_vi_tinh: item.don_vi_tinh || 'Ly',
          don_gia: item.unit_price || item.price,
          so_luong: item.quantity,
          thanh_tien: item.subtotal,
          ghi_chu: itemNote,
          gia_von: costPrice
        };
      });

      const detailPromises: any[] = [
        supabase.from('hoadondetail').insert(orderItemsToInsert)
      ];
      if (!isTakeaway) {
        detailPromises.push(
          supabase.from('danhsachban').update({ trang_thai: 'Đang phục vụ' }).eq('id', table_id)
        );
      }

      await Promise.all(detailPromises);
      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return mapOrderToClient(order);
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const tables = mockDb.getTables();
    const targetTable = tables.find(t => t.id === table_id);
    const isTakeaway = targetTable?.table_name === 'Khách mang về' || table_id === 'tb_mangve';

    if (!isTakeaway) {
      const existingUnpaidOrder = orders.find(o => o.table_id === table_id && o.payment_status === 'Chưa thanh toán');

      if (existingUnpaidOrder) {
        const existingOrderId = existingUnpaidOrder.id;
        existingUnpaidOrder.total_amount = Number(existingUnpaidOrder.total_amount || 0) + total_amount;
        existingUnpaidOrder.giam_gia = Number(existingUnpaidOrder.giam_gia || 0) + discount;
        if (notes) {
          existingUnpaidOrder.notes = existingUnpaidOrder.notes ? `${existingUnpaidOrder.notes}; ${notes}` : notes;
        }

        mockDb.setOrders(orders);

        const orderItems = mockDb.getOrderItems();
        const products = mockDb.getProducts();

        items.forEach((item, idx) => {
          const matchedItem = orderItems.find(
            oi => oi.order_id === existingOrderId && oi.product_id === item.product_id
          );
          let itemNote = item.notes || '';
          if (idx === 0 && notes && !itemNote.includes('[Ghi chú đơn: ')) {
            itemNote = itemNote ? `${itemNote} [Ghi chú đơn: ${notes}]` : `[Ghi chú đơn: ${notes}]`;
          }

          if (matchedItem) {
            matchedItem.quantity = Number(matchedItem.quantity || 0) + item.quantity;
            matchedItem.subtotal = Number(matchedItem.subtotal || 0) + item.subtotal;
          } else {
            const prod = products.find(p => p.id === item.product_id);
            orderItems.push({
              id: generateShortId('item_'),
              order_id: existingOrderId,
              product_id: item.product_id,
              ten_san_pham: prod ? prod.name : 'Sản phẩm',
              don_vi_tinh: prod ? (prod as any).don_vi_tinh : 'Ly',
              quantity: item.quantity,
              unit_price: item.unit_price || item.price,
              subtotal: item.subtotal,
              ghi_chu: itemNote,
              gia_von: prod ? Number(prod.cost_price || 0) : 0
            });
          }
        });
        mockDb.setOrderItems(orderItems);
        broadcastRealtimeEvent('order_update');
        broadcastRealtimeEvent('table_update');
        broadcastRealtimeEvent('report_update');
        return existingUnpaidOrder;
      }
    }

    const orderId = generateShortId('ord_');
    const newOrder = {
      id: orderId,
      table_id,
      staff_id,
      total_amount,
      giam_gia: discount,
      notes: notes || '',
      payment_status: 'Chưa thanh toán' as const,
      payment_method: null,
      created_at: createdAt,
      paid_at: null
    };
    orders.push(newOrder);
    mockDb.setOrders(orders);

    const tIdx = tables.findIndex(t => t.id === table_id);
    if (tIdx !== -1) {
      tables[tIdx].status = 'Đang phục vụ';
      mockDb.setTables(tables);
    }

    const orderItems = mockDb.getOrderItems();
    const products = mockDb.getProducts();
    const newItems = items.map((item, idx) => {
      const prod = products.find(p => p.id === item.product_id);
      let itemNote = item.notes || '';
      if (idx === 0 && notes && !itemNote.includes('[Ghi chú đơn: ')) {
        itemNote = itemNote ? `${itemNote} [Ghi chú đơn: ${notes}]` : `[Ghi chú đơn: ${notes}]`;
      }
      return {
        id: generateShortId('item_'),
        order_id: orderId,
        product_id: item.product_id,
        ten_san_pham: prod ? prod.name : 'Sản phẩm',
        don_vi_tinh: prod ? (prod as any).don_vi_tinh : 'Ly',
        quantity: item.quantity,
        unit_price: item.unit_price || item.price,
        subtotal: item.subtotal,
        ghi_chu: itemNote,
        gia_von: prod ? Number(prod.cost_price || 0) : 0
      };
    });
    mockDb.setOrderItems([...orderItems, ...newItems]);
    broadcastRealtimeEvent('order_update');
    broadcastRealtimeEvent('table_update');
    broadcastRealtimeEvent('report_update');

    return newOrder;
  },

  async payOrder(orderId: string, paymentMethod: 'Tiền mặt' | 'Chuyển khoản') {
    const paidAt = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      // 1. Lấy thông tin bàn & chi tiết items cùng lúc
      const [orderResult, itemsResult] = await Promise.all([
        supabase.from('hoadon').select('id, id_ban, trang_thai_thanh_toan, tong_tien, giam_gia, ngay_tao, ngay_thanh_toan, id_nhan_vien').eq('id', orderId).single(),
        supabase.from('hoadondetail').select('idsp, so_luong, ghi_chu').eq('idhoadon', orderId)
      ]);
      const order = orderResult.data;
      const items = itemsResult.data;

      // Bảo vệ chống thanh toán trùng lặp (Idempotency Guard)
      if (order?.trang_thai_thanh_toan === 'Đã thanh toán') {
        console.warn(`Hóa đơn ${orderId} đã được thanh toán trước đó, bỏ qua trừ kho lặp.`);
        return mapOrderToClient(order);
      }

      // 2. Tối ưu siêu tốc: Chạy song song cập nhật hóa đơn, trả bàn và khấu trừ kho cùng một lúc
      cachedTables = null;
      const stockDeductionPromise = (items && items.length > 0)
        ? this.deductStockFromOrder(items.map(item => ({
            product_id: item.idsp,
            quantity: item.so_luong,
            notes: item.ghi_chu || ''
          })))
            .catch(err => console.error('Lỗi khấu trừ kho khi thanh toán:', err))
        : Promise.resolve();

      const updatePromises: any[] = [
        supabase
          .from('hoadon')
          .update({
            trang_thai_thanh_toan: 'Đã thanh toán',
            phuong_thuc_thanh_toan: paymentMethod,
            ngay_thanh_toan: paidAt
          })
          .eq('id', orderId)
          .select()
          .single(),
        order?.id_ban
          ? supabase.from('danhsachban').update({ trang_thai: 'Trống' }).eq('id', order.id_ban)
          : Promise.resolve(),
        stockDeductionPromise
      ];
      const [payResult] = await Promise.all(updatePromises);
      if (!payResult.error && payResult.data) {
        broadcastRealtimeEvent('order_update');
        broadcastRealtimeEvent('table_update');
        broadcastRealtimeEvent('report_update');
        return mapOrderToClient(payResult.data);
      }
    }

    const orders = mockDb.getOrders();
    const oIdx = orders.findIndex(o => o.id === orderId);
    if (oIdx !== -1) {
      // Trừ kho nguyên liệu trong Mock DB khi thanh toán
      const items = mockDb.getOrderItems().filter(item => item.order_id === orderId);
      if (items && items.length > 0) {
        const cartItems = items.map(item => ({ product_id: item.product_id, quantity: item.quantity }));
        await this.deductStockFromOrder(cartItems);
      }

      orders[oIdx].payment_status = 'Đã thanh toán';
      orders[oIdx].payment_method = paymentMethod;
      orders[oIdx].paid_at = paidAt;
      mockDb.setOrders(orders);

      const tableId = orders[oIdx].table_id;
      const tables = mockDb.getTables();
      const tIdx = tables.findIndex(t => t.id === tableId);
      if (tIdx !== -1) {
        tables[tIdx].status = 'Trống';
        mockDb.setTables(tables);
      }
      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return orders[oIdx];
    }
    return null;
  },

  async cancelOrder(orderId: string) {
    if (isSupabaseConfigured && supabase) {
      const { data: order } = await supabase.from('hoadon').select('id_ban').eq('id', orderId).single();
      
      // 1. Delete details
      await supabase.from('hoadondetail').delete().eq('idhoadon', orderId);
      
      // 2. Delete main order
      const { error } = await supabase.from('hoadon').delete().eq('id', orderId);
      
      if (!error && order?.id_ban) {
        // 3. Reset table status
        await supabase.from('danhsachban').update({ trang_thai: 'Trống' }).eq('id', order.id_ban);
        broadcastRealtimeEvent('order_update');
        broadcastRealtimeEvent('table_update');
        broadcastRealtimeEvent('report_update');
        return true;
      }
      return false;
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const oIdx = orders.findIndex(o => o.id === orderId);
    if (oIdx !== -1) {
      const tableId = orders[oIdx].table_id;
      
      // Xóa hóa đơn
      orders.splice(oIdx, 1);
      mockDb.setOrders(orders);
      
      // Xóa chi tiết hóa đơn
      const allItems = mockDb.getOrderItems();
      const filteredItems = allItems.filter(item => item.order_id !== orderId);
      mockDb.setOrderItems(filteredItems);
      
      // Giải phóng bàn
      const tables = mockDb.getTables();
      const tIdx = tables.findIndex(t => t.id === tableId);
      if (tIdx !== -1) {
        tables[tIdx].status = 'Trống';
        mockDb.setTables(tables);
      }
      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return true;
    }
    return false;
  },

  async cancelPaidOrder(orderId: string, staffId: string = 'system', reason: string = 'Nhân viên hủy đơn tại ca trực') {
    // Tương thích ngược: tự động chuyển thành yêu cầu duyệt hủy
    return await this.requestCancelPaidOrder(orderId, staffId, reason);
  },

  // 1. Nhân viên gửi yêu cầu hủy đơn đã thanh toán:
  // - Kho được hoàn trả ngay lập tức (ghi log Đã duyệt để không nhảy vào duyệt kho lẻ tẻ)
  // - Tiền và đơn được trừ ngay lập tức khỏi doanh thu để nhân viên kiểm két & kho khớp 100%
  // - Hóa đơn được đưa vào danh sách chờ Admin duyệt hủy
  async requestCancelPaidOrder(orderId: string, staffId: string = 'system', reason: string = '') {
    try {
      let items: any[] = [];
      const cleanReason = reason.trim() || 'Hủy đơn tại ca trực';

      if (isSupabaseConfigured && supabase) {
        // Kiểm tra hóa đơn
        const { data: orderData } = await supabase
          .from('hoadon')
          .select('id, trang_thai_thanh_toan, ghi_chu, id_ban')
          .eq('id', orderId)
          .single();

        if (!orderData) throw new Error('Không tìm thấy hóa đơn cần hủy.');
        
        const existingNote = orderData.ghi_chu || '';
        const isAlreadyPending = orderData.trang_thai_thanh_toan === 'Chờ duyệt hủy' || 
          (existingNote.includes('[Chờ duyệt hủy]') && !existingNote.includes('[Admin từ chối hủy]') && !existingNote.includes('[Admin đã duyệt hủy]'));
        
        if (isAlreadyPending) {
          throw new Error('Hóa đơn này đang trong danh sách chờ Admin phê duyệt hủy.');
        }
        if (orderData.trang_thai_thanh_toan === 'Đã hủy' && !existingNote.includes('[Chờ duyệt hủy]')) {
          throw new Error('Hóa đơn này đã bị hủy trước đó.');
        }

        // Nếu đơn chưa thanh toán -> chỉ xóa đơn và giải phóng bàn
        if (orderData.trang_thai_thanh_toan !== 'Đã thanh toán') {
          return await this.cancelOrder(orderId);
        }

        // Lấy chi tiết món để hoàn kho ngay lập tức
        const { data: dbItems } = await supabase
          .from('hoadondetail')
          .select('idsp, so_luong')
          .eq('idhoadon', orderId);

        if (dbItems && dbItems.length > 0) {
          items = dbItems.map(item => ({
            product_id: item.idsp,
            quantity: item.so_luong
          }));
        }

        const updatedNote = [orderData.ghi_chu, `[Chờ duyệt hủy] Lý do: ${cleanReason}`].filter(Boolean).join(' | ');

        // Cập nhật trạng thái hóa đơn:
        // Cố gắng cập nhật 'Chờ duyệt hủy'. Nếu DB có check constraint cũ thì fallback sang 'Đã hủy'
        // Cả 2 trạng thái đều loại bỏ đơn khỏi 'Đã thanh toán' giúp tiền và hóa đơn thành công lập tức trừ khỏi ca
        const { error: updateErr } = await supabase
          .from('hoadon')
          .update({
            trang_thai_thanh_toan: 'Chờ duyệt hủy',
            ghi_chu: updatedNote
          })
          .eq('id', orderId);

        if (updateErr) {
          await supabase
            .from('hoadon')
            .update({
              trang_thai_thanh_toan: 'Đã hủy',
              ghi_chu: updatedNote
            })
            .eq('id', orderId);
        }

      } else {
        // Mock DB Fallback
        const orders = mockDb.getOrders();
        const targetOrder = orders.find(o => o.id === orderId);
        if (!targetOrder) throw new Error('Không tìm thấy hóa đơn.');
        
        const existingNote = targetOrder.notes || '';
        const isAlreadyPending = (targetOrder.payment_status as any) === 'Chờ duyệt hủy' || 
          (existingNote.includes('[Chờ duyệt hủy]') && !existingNote.includes('[Admin từ chối hủy]') && !existingNote.includes('[Admin đã duyệt hủy]'));

        if (isAlreadyPending) {
          throw new Error('Hóa đơn này đang chờ Admin phê duyệt hủy.');
        }
        if (targetOrder.payment_status !== 'Đã thanh toán') {
          return await this.cancelOrder(orderId);
        }

        const mockItems = mockDb.getOrderItems().filter(item => item.order_id === orderId);
        items = mockItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }));

        targetOrder.payment_status = 'Chờ duyệt hủy' as any;
        targetOrder.notes = [targetOrder.notes, `[Chờ duyệt hủy] Lý do: ${cleanReason}`].filter(Boolean).join(' | ');
        mockDb.setOrders(orders);
      }

      // Hoàn trả nguyên liệu kho ngay lập tức để nhân viên kiểm kho khớp 100%
      // Đặt status: 'Đã duyệt' để không rơi vào tab "Duyệt Kho & Kiểm Kho" lẻ tẻ
      if (items.length > 0) {
        await this.restoreStockFromOrder(items, {
          orderId,
          staffId,
          status: 'Đã duyệt',
          reason: `[Hoàn kho đơn hủy #${orderId}] ${cleanReason}`
        });
      }

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('inventory_update');
      broadcastRealtimeEvent('report_update');
      return true;
    } catch (e: any) {
      console.error('Lỗi khi gửi yêu cầu hủy hóa đơn đã thanh toán:', e);
      throw e;
    }
  },

  // 2. Admin Phê duyệt / Từ chối hủy hóa đơn:
  // - Admin chấp nhận hủy: Giữ nguyên như vậy (kho đã cộng, tiền đã trừ), hóa đơn chuyển hẳn sang 'Đã hủy'.
  // - Admin từ chối hủy: Khôi phục đơn về 'Đã thanh toán' (tiền cộng lại vào ca),
  //   đồng thời thu hồi kho (trừ kho trở lại) để nguyên liệu trở về như lúc vừa thanh toán xong.
  async approveOrderCancellation(orderId: string, adminId: string, approved: boolean) {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: orderData } = await supabase
          .from('hoadon')
          .select('id, trang_thai_thanh_toan, ghi_chu, id_ban')
          .eq('id', orderId)
          .single();

        if (!orderData) throw new Error('Không tìm thấy hóa đơn cần duyệt.');

        if (approved) {
          // ADMIN ĐỒNG Ý HỦY:
          // Giữ nguyên (kho đã hoàn và tiền đã trừ), gắn cờ đã duyệt hủy
          const updatedNote = [orderData.ghi_chu, `[Admin đã duyệt hủy]`].filter(Boolean).join(' | ');
          await supabase
            .from('hoadon')
            .update({
              trang_thai_thanh_toan: 'Đã hủy',
              ghi_chu: updatedNote
            })
            .eq('id', orderId);

          // Cập nhật tất cả log kho liên quan sang 'Đã duyệt'
          await supabase
            .from('lichsukho')
            .update({ trang_thai: 'Đã duyệt' })
            .ilike('ghi_chu', `%hủy đơn #${orderId}%`)
            .eq('trang_thai', 'Chờ duyệt');

        } else {
          // ADMIN TỪ CHỐI HỦY:
          // 1. Khôi phục đơn về 'Đã thanh toán' (Doanh thu & tiền két tự động cộng lại đúng như ban đầu)
          const updatedNote = [orderData.ghi_chu, `[Admin từ chối hủy - Khôi phục đơn]`].filter(Boolean).join(' | ');
          await supabase
            .from('hoadon')
            .update({
              trang_thai_thanh_toan: 'Đã thanh toán',
              ghi_chu: updatedNote
            })
            .eq('id', orderId);

          // 2. Thu hồi kho: Trừ ngược lại số lượng nguyên liệu đã hoàn
          const { data: dbItems } = await supabase
            .from('hoadondetail')
            .select('idsp, so_luong')
            .eq('idhoadon', orderId);

          if (dbItems && dbItems.length > 0) {
            const recipes = await this.getRecipes();
            const ingredients = await this.getIngredients();
            const ingDeductions: { [id: string]: number } = {};

            for (const item of dbItems) {
              const itemRecipes = recipes.filter(r => r.product_id === item.idsp);
              for (const rec of itemRecipes) {
                const qty = Number(rec.quantity_needed || 0) * Number(item.so_luong || 0);
                ingDeductions[rec.ingredient_id] = (ingDeductions[rec.ingredient_id] || 0) + qty;
              }
            }

            const revokeLogs: any[] = [];
            for (const ingId in ingDeductions) {
              const ing = ingredients.find(i => i.id === ingId);
              const deductQty = ingDeductions[ingId];
              if (ing && deductQty > 0) {
                const currentStock = Number(ing.stock_quantity ?? (ing as any).so_luong_ton ?? 0) || 0;
                const newStock = Math.max(0, currentStock - deductQty);
                await supabase
                  .from('nguyenlieu')
                  .update({ so_luong_ton: newStock })
                  .eq('id', ing.id);

                revokeLogs.push({
                  id: generateShortId('inv_'),
                  id_nguyen_lieu: ing.id,
                  so_luong_thay_doi: -deductQty,
                  loai_giao_dich: 'Khác',
                  chi_phi: 0,
                  ghi_chu: `[Từ chối hủy đơn #${orderId}] Thu hồi kho về trạng thái đã bán`,
                  id_nhan_vien: adminId,
                  trang_thai: 'Đã duyệt'
                });
              }
            }

            if (revokeLogs.length > 0) {
              await supabase.from('lichsukho').insert(revokeLogs);
            }
          }
        }
      } else {
        // Mock DB Fallback
        const orders = mockDb.getOrders();
        const targetOrder = orders.find(o => o.id === orderId);
        if (!targetOrder) throw new Error('Không tìm thấy hóa đơn.');

        if (approved) {
          targetOrder.payment_status = 'Đã hủy' as any;
          targetOrder.notes = [targetOrder.notes, `[Admin đã duyệt hủy]`].filter(Boolean).join(' | ');

          const logs = mockDb.getInventoryLogs();
          logs.forEach(l => {
            if (l.note?.includes(`hủy đơn #${orderId}`) && l.status === 'Chờ duyệt') {
              l.status = 'Đã duyệt';
            }
          });
          mockDb.setInventoryLogs(logs);
          mockDb.setOrders(orders);
        } else {
          targetOrder.payment_status = 'Đã thanh toán';
          targetOrder.notes = [targetOrder.notes, `[Admin từ chối hủy - Khôi phục đơn]`].filter(Boolean).join(' | ');

          const mockItems = mockDb.getOrderItems().filter(item => item.order_id === orderId);
          const recipes = mockDb.getRecipes();
          const ingredients = mockDb.getIngredients();
          const logs = mockDb.getInventoryLogs();

          mockItems.forEach(item => {
            const itemRecipes = recipes.filter(r => r.product_id === item.product_id);
            itemRecipes.forEach(rec => {
              const ing = ingredients.find(i => i.id === rec.ingredient_id);
              const deductQty = rec.quantity_needed * item.quantity;
              if (ing && deductQty > 0) {
                ing.stock_quantity = Math.max(0, Number(ing.stock_quantity || 0) - deductQty);
              }
            });
          });

          logs.push({
            id: generateShortId('inv_'),
            ingredient_id: '',
            custom_ingredient_name: 'Thu hồi tồn kho đơn hủy',
            change_amount: 0,
            type: 'Khác' as const,
            cost: 0,
            note: `[Từ chối hủy đơn #${orderId}] Thu hồi kho về trạng thái đã bán`,
            staff_id: adminId,
            created_at: new Date().toISOString(),
            status: 'Đã duyệt' as const
          });

          mockDb.setIngredients(ingredients);
          mockDb.setInventoryLogs(logs);
          mockDb.setOrders(orders);
        }
      }

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('inventory_update');
      broadcastRealtimeEvent('report_update');
      return true;
    } catch (e: any) {
      console.error('Lỗi khi duyệt hủy đơn hàng:', e);
      throw e;
    }
  },

  // 3. Lấy danh sách hóa đơn đang chờ Admin duyệt hủy
  async getPendingCancelOrders() {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data: allOrders } = await supabase
          .from('hoadon')
          .select('*, danhsachban(ten_ban), nguoidung(ho_ten), hoadondetail(*)')
          .order('ngay_tao', { ascending: false })
          .limit(100);

        const pending = (allOrders || []).filter(o => {
          const status = o.trang_thai_thanh_toan;
          const note = o.ghi_chu || '';
          if (status === 'Chờ duyệt hủy') return true;
          if (note.includes('[Chờ duyệt hủy]') && !note.includes('[Admin đã duyệt hủy]') && !note.includes('[Admin từ chối hủy]')) {
            return true;
          }
          return false;
        });

        return pending.map(o => mapOrderToClient(o));
      } else {
        const orders = mockDb.getOrders().filter(o => {
          const status = (o.payment_status as any);
          const note = o.notes || '';
          if (status === 'Chờ duyệt hủy') return true;
          if (note.includes('[Chờ duyệt hủy]') && !note.includes('[Admin đã duyệt hủy]') && !note.includes('[Admin từ chối hủy]')) {
            return true;
          }
          return false;
        });
        return orders;
      }
    } catch (e) {
      console.error('Lỗi khi lấy danh sách đơn chờ duyệt hủy:', e);
      return [];
    }
  },

  async getYesterdayProductSales(): Promise<{ [productId: string]: number }> {
    const yesterdaySales: { [productId: string]: number } = {};
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();

      if (isSupabaseConfigured && supabase) {
        const yest = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yestStr = yest.toISOString().split('T')[0];
        const startOfYest = `${yestStr}T00:00:00+07:00`;
        const endOfYest = `${yestStr}T23:59:59+07:00`;

        const { data: orders } = await supabase
          .from('hoadon')
          .select('id')
          .eq('trang_thai_thanh_toan', 'Đã thanh toán')
          .gte('ngay_thanh_toan', startOfYest)
          .lte('ngay_thanh_toan', endOfYest);

        if (orders && orders.length > 0) {
          const orderIds = orders.map(o => o.id);
          const { data: items } = await supabase
            .from('hoadondetail')
            .select('idsp, so_luong')
            .in('idhoadon', orderIds);

          if (items) {
            items.forEach(item => {
              yesterdaySales[item.idsp] = (yesterdaySales[item.idsp] || 0) + Number(item.so_luong || 0);
            });
          }
        }
        return yesterdaySales;
      }

      // Mock DB Fallback
      const orders = mockDb.getOrders().filter(o => {
        if (o.payment_status !== 'Đã thanh toán') return false;
        const date = new Date(o.created_at || o.paid_at);
        return date.toDateString() === yesterdayStr;
      });

      const orderItems = mockDb.getOrderItems();
      orders.forEach(order => {
        const items = orderItems.filter(item => item.order_id === order.id);
        items.forEach(item => {
          yesterdaySales[item.product_id] = (yesterdaySales[item.product_id] || 0) + Number(item.quantity || 0);
        });
      });
    } catch (e) {
      console.error('Lỗi khi lấy doanh số hôm qua:', e);
    }
    return yesterdaySales;
  },

  async deleteOrderItem(orderId: string, itemId: string, quantityToRemove?: number) {
    if (isSupabaseConfigured && supabase) {
      if (quantityToRemove && quantityToRemove > 0) {
        // Lấy chi tiết món ăn hiện tại
        const { data: detail } = await supabase
          .from('hoadondetail')
          .select('so_luong, don_gia')
          .eq('id', itemId)
          .single();

        if (detail) {
          const currentQty = Number(detail.so_luong || 0);
          if (currentQty > quantityToRemove) {
            // Cập nhật giảm bớt số lượng
            const newQty = currentQty - quantityToRemove;
            const newSubtotal = newQty * Number(detail.don_gia || 0);
            await supabase
              .from('hoadondetail')
              .update({
                so_luong: newQty,
                thanh_tien: newSubtotal
              })
              .eq('id', itemId);
          } else {
            // Xóa luôn
            await supabase.from('hoadondetail').delete().eq('id', itemId);
          }
        }
      } else {
        // Xóa hoàn toàn món ăn khỏi chi tiết
        await supabase.from('hoadondetail').delete().eq('id', itemId);
      }

      // 2. Lấy danh sách món ăn còn lại
      const { data: remaining } = await supabase
        .from('hoadondetail')
        .select('thanh_tien')
        .eq('idhoadon', orderId);

      if (!remaining || remaining.length === 0) {
        // Hóa đơn không còn món nào -> Hủy/Xóa luôn hóa đơn
        await this.cancelOrder(orderId);
        return { orderDeleted: true };
      }

      // 3. Tính toán lại tổng tiền và giảm giá
      const sumRemaining = remaining.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);
      const { data: order } = await supabase.from('hoadon').select('giam_gia').eq('id', orderId).single();
      const newDiscount = Math.min(sumRemaining, Number(order?.giam_gia || 0));
      const newTotal = Math.max(0, sumRemaining - newDiscount);

      // 4. Cập nhật hóa đơn
      await supabase
        .from('hoadon')
        .update({
          tong_tien: newTotal,
          giam_gia: newDiscount
        })
        .eq('id', orderId);

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return { orderDeleted: false, newTotal, newDiscount };
    }

    // Mock DB Fallback
    const orderItems = mockDb.getOrderItems();
    const itemIdx = orderItems.findIndex(item => item.id === itemId);
    if (itemIdx !== -1) {
      const item = orderItems[itemIdx];
      const currentQty = Number(item.quantity || 0);
      if (quantityToRemove && quantityToRemove > 0 && currentQty > quantityToRemove) {
        item.quantity = currentQty - quantityToRemove;
        item.subtotal = item.quantity * Number(item.unit_price || 0);
      } else {
        orderItems.splice(itemIdx, 1);
      }
      mockDb.setOrderItems(orderItems);
    }

    const remaining = orderItems.filter(item => item.order_id === orderId);
    if (remaining.length === 0) {
      await this.cancelOrder(orderId);
      return { orderDeleted: true };
    }

    const sumRemaining = remaining.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const orders = mockDb.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const newDiscount = Math.min(sumRemaining, Number(order.giam_gia || 0));
      order.giam_gia = newDiscount;
      order.total_amount = Math.max(0, sumRemaining - newDiscount);
      mockDb.setOrders(orders);
      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return { orderDeleted: false, newTotal: order.total_amount, newDiscount };
    }

    return { orderDeleted: false, newTotal: 0, newDiscount: 0 };
  },

  async splitOrder(orderId: string, itemSplitRequests: Array<{ itemId: string, splitQuantity: number }>) {
    if (isSupabaseConfigured && supabase) {
      // 1. Lấy thông tin hóa đơn cũ
      const { data: oldOrder } = await supabase
        .from('hoadon')
        .select('*')
        .eq('id', orderId)
        .single();

      if (!oldOrder) throw new Error('Không tìm thấy hóa đơn cần chia.');

      // 2. Tạo hóa đơn mới
      const newOrderId = generateShortId('ord_');
      const createdAt = new Date().toISOString();
      const { data: newOrderData, error: newOrderErr } = await supabase
        .from('hoadon')
        .insert([{
          id: newOrderId,
          id_ban: oldOrder.id_ban,
          id_nhan_vien: oldOrder.id_nhan_vien,
          tong_tien: 0, // Sẽ tính và cập nhật sau
          giam_gia: 0,
          trang_thai_thanh_toan: 'Chưa thanh toán',
          ngay_tao: createdAt
        }])
        .select()
        .single();

      if (newOrderErr || !newOrderData) throw new Error('Không thể tạo hóa đơn mới khi chia đơn.');

      let totalNewAmount = 0;
      const orderItemsToInsert: any[] = [];

      // 3. Xử lý từng món được chia
      for (const req of itemSplitRequests) {
        const { itemId, splitQuantity } = req;
        if (splitQuantity <= 0) continue;

        // Lấy chi tiết món hiện tại
        const { data: detail } = await supabase
          .from('hoadondetail')
          .select('*')
          .eq('id', itemId)
          .single();

        if (detail) {
          const currentQty = Number(detail.so_luong || 0);
          const price = Number(detail.don_gia || 0);
          const splitSubtotal = splitQuantity * price;
          totalNewAmount += splitSubtotal;

          // Thêm vào hóa đơn mới
          orderItemsToInsert.push({
            id: generateShortId('item_'),
            idhoadon: newOrderId,
            idsp: detail.idsp,
            ten_san_pham: detail.ten_san_pham,
            don_vi_tinh: detail.don_vi_tinh,
            don_gia: price,
            so_luong: splitQuantity,
            thanh_tien: splitSubtotal,
            ghi_chu: detail.ghi_chu || '',
            gia_von: Number(detail.gia_von || 0)
          });

          // Trừ số lượng ở hóa đơn cũ
          if (currentQty > splitQuantity) {
            const newQty = currentQty - splitQuantity;
            const newSubtotal = newQty * price;
            await supabase
              .from('hoadondetail')
              .update({
                so_luong: newQty,
                thanh_tien: newSubtotal
              })
              .eq('id', itemId);
          } else {
            // Nếu chia toàn bộ số lượng -> Xóa khỏi hóa đơn cũ
            await supabase.from('hoadondetail').delete().eq('id', itemId);
          }
        }
      }

      // Thêm các chi tiết vào hóa đơn mới
      if (orderItemsToInsert.length > 0) {
        await supabase.from('hoadondetail').insert(orderItemsToInsert);
      }

      // Cập nhật tổng tiền hóa đơn mới
      await supabase
        .from('hoadon')
        .update({ tong_tien: totalNewAmount })
        .eq('id', newOrderId);

      // 4. Tính toán lại tiền hóa đơn cũ
      const { data: remaining } = await supabase
        .from('hoadondetail')
        .select('thanh_tien')
        .eq('idhoadon', orderId);

      if (!remaining || remaining.length === 0) {
        // Hóa đơn cũ không còn món nào -> Hủy luôn hóa đơn cũ
        await this.cancelOrder(orderId);
      } else {
        const sumRemaining = remaining.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);
        const newDiscount = Math.min(sumRemaining, Number(oldOrder.giam_gia || 0));
        const newTotal = Math.max(0, sumRemaining - newDiscount);

        await supabase
          .from('hoadon')
          .update({
            tong_tien: newTotal,
            giam_gia: newDiscount
          })
          .eq('id', orderId);
      }

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('table_update');
      broadcastRealtimeEvent('report_update');
      return { success: true, newOrderId };
    }

    // Mock DB Fallback
    const orders = mockDb.getOrders();
    const orderItems = mockDb.getOrderItems();
    const oldOrder = orders.find(o => o.id === orderId);
    if (!oldOrder) throw new Error('Không tìm thấy hóa đơn.');

    const newOrderId = generateShortId('ord_');
    const newOrder = {
      id: newOrderId,
      table_id: oldOrder.table_id,
      staff_id: oldOrder.staff_id,
      total_amount: 0,
      discount: 0,
      payment_status: 'Chưa thanh toán',
      created_at: new Date().toISOString()
    };

    let totalNewAmount = 0;
    const newItems: any[] = [];

    for (const req of itemSplitRequests) {
      const { itemId, splitQuantity } = req;
      const detailIdx = orderItems.findIndex(d => d.id === itemId);
      if (detailIdx !== -1) {
        const detail = orderItems[detailIdx];
        const currentQty = Number(detail.quantity || 0);
        const price = Number(detail.unit_price || 0);
        const splitSubtotal = splitQuantity * price;
        totalNewAmount += splitSubtotal;

        newItems.push({
          id: generateShortId('item_'),
          order_id: newOrderId,
          product_id: detail.product_id,
          quantity: splitQuantity,
          unit_price: price,
          subtotal: splitSubtotal,
          ghi_chu: detail.ghi_chu || '',
          cost_price: Number(detail.cost_price || 0),
          products: detail.products
        });

        if (currentQty > splitQuantity) {
          orderItems[detailIdx].quantity = currentQty - splitQuantity;
          orderItems[detailIdx].subtotal = (currentQty - splitQuantity) * price;
        } else {
          orderItems.splice(detailIdx, 1);
        }
      }
    }

    newOrder.total_amount = totalNewAmount;
    orders.push(newOrder);
    mockDb.setOrders(orders);
    mockDb.setOrderItems([...orderItems, ...newItems]);

    // Recalculate old order total
    const oldRemaining = orderItems.filter(item => item.order_id === orderId);
    if (oldRemaining.length === 0) {
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) orders.splice(idx, 1);
      mockDb.setOrders(orders);
    } else {
      const sumRemaining = oldRemaining.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
      const newDiscount = Math.min(sumRemaining, Number(oldOrder.discount || 0));
      const newTotal = Math.max(0, sumRemaining - newDiscount);
      
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        orders[idx].total_amount = newTotal;
        orders[idx].discount = newDiscount;
        mockDb.setOrders(orders);
      }
    }

    broadcastRealtimeEvent('order_update');
    broadcastRealtimeEvent('table_update');
    broadcastRealtimeEvent('report_update');
    return { success: true, newOrderId };
  },

  // --- TIME LOGS (chamcong) ---
  async getTimeLogs() {
    if (isSupabaseConfigured && supabase) {
      let allLogs: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('chamcong')
          .select(`
            *,
            nguoidung (ho_ten, email)
          `)
          .order('thoi_gian_thuc_vao', { ascending: false })
          .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < step) break;
        from += step;
      }
      if (allLogs.length > 0) return allLogs.map(mapTimeLogToClient).filter(Boolean) as any[];
    }
    const logs = mockDb.getTimeLogs();
    const users = mockDb.getUsers();
    return logs.map(log => ({
      ...log,
      users: users.find(u => u.id === log.user_id) || null
    })).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  },

  async createTimeLog(log: { 
    user_id: string; 
    shift: string; 
    check_in_time: string; 
    latitude: number; 
    longitude: number; 
    location_address: string;
    ghi_chu_vao?: string;
  }) {
    const newLog = {
      id: generateShortId('log_'),
      user_id: log.user_id,
      shift: log.shift,
      check_in_time: log.check_in_time,
      check_out_time: null,
      submitted_at: new Date().toISOString(),
      real_check_out_time: null,
      latitude: log.latitude,
      longitude: log.longitude,
      location_address: log.location_address,
      ghi_chu_vao: log.ghi_chu_vao || '',
      ghi_chu_ra: '',
      status: 'Đang trong ca' as const
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('chamcong').insert([{
        id: newLog.id,
        id_nhan_vien: log.user_id,
        ca_lam: log.shift,
        gio_vao: log.check_in_time,
        gio_ra: null,
        thoi_gian_thuc_vao: newLog.submitted_at,
        thoi_gian_thuc_ra: null,
        vi_do: log.latitude,
        kinh_do: log.longitude,
        dia_chi: log.location_address,
        ghi_chu_vao: log.ghi_chu_vao || null,
        ghi_chu_ra: null,
        trang_thai: 'Đang trong ca'
      }]).select();
      if (!error && data) return mapTimeLogToClient(data[0]);
    }

    const logs = mockDb.getTimeLogs();
    logs.push(newLog);
    mockDb.setTimeLogs(logs);
    return newLog;
  },

  async checkOutTimeLog(logId: string, checkOutData: {
    check_out_time: string;
    latitude: number;
    longitude: number;
    location_address: string;
    ghi_chu_ra?: string;
  }) {
    const realCheckOut = new Date().toISOString();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('chamcong')
        .update({
          gio_ra: checkOutData.check_out_time,
          thoi_gian_thuc_ra: realCheckOut,
          vi_do: checkOutData.latitude,
          kinh_do: checkOutData.longitude,
          dia_chi: checkOutData.location_address,
          ghi_chu_ra: checkOutData.ghi_chu_ra || null,
          trang_thai: 'Chờ duyệt'
        })
        .eq('id', logId)
        .select();
      if (!error && data) return mapTimeLogToClient(data[0]);
    }

    const logs = mockDb.getTimeLogs();
    const idx = logs.findIndex(l => l.id === logId);
    if (idx !== -1) {
      logs[idx].check_out_time = checkOutData.check_out_time;
      logs[idx].real_check_out_time = realCheckOut;
      logs[idx].latitude = checkOutData.latitude;
      logs[idx].longitude = checkOutData.longitude;
      logs[idx].location_address = checkOutData.location_address;
      logs[idx].ghi_chu_ra = checkOutData.ghi_chu_ra || '';
      logs[idx].status = 'Chờ duyệt';
      mockDb.setTimeLogs(logs);
      return logs[idx];
    }
    return null;
  },

  async approveTimeLog(id: string, status: 'Đã duyệt' | 'Từ chối') {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('chamcong').update({ trang_thai: status }).eq('id', id).select();
      if (!error && data) return mapTimeLogToClient(data[0]);
    }
    const logs = mockDb.getTimeLogs();
    const idx = logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      logs[idx].status = status;
      mockDb.setTimeLogs(logs);
      return logs[idx];
    }
    return null;
  },

  async updateTimeLogRequest(logId: string, updates: {
    check_in_time: string;
    check_out_time: string | null;
    ghi_chu_vao: string;
  }) {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('chamcong')
        .update({
          gio_vao: updates.check_in_time,
          gio_ra: updates.check_out_time,
          ghi_chu_vao: updates.ghi_chu_vao,
          trang_thai: 'Chờ duyệt',
          sua_lai: true
        })
        .eq('id', logId)
        .select();
      if (!error && data) return mapTimeLogToClient(data[0]);
    }

    const logs = mockDb.getTimeLogs();
    const idx = logs.findIndex(l => l.id === logId);
    if (idx !== -1) {
      logs[idx].check_in_time = updates.check_in_time;
      logs[idx].check_out_time = updates.check_out_time;
      logs[idx].ghi_chu_vao = updates.ghi_chu_vao;
      logs[idx].status = 'Chờ duyệt';
      logs[idx].sua_lai = true;
      mockDb.setTimeLogs(logs);
      return logs[idx];
    }
    return null;
  },

  // --- CHẤM CÔNG NGOÀI GIỜ (DÀNH RIÊNG CHO QUẢN LÝ) ---
  async createOvertimeTimeLog(payload: {
    staff_id: string;
    date: string; // YYYY-MM-DD
    shift: string;
    check_in_time: string; // ISO string
    check_out_time: string; // ISO string
    notes?: string;
  }) {
    const logId = generateShortId('ot_');
    const noteText = `[Quản lý chấm ngoài giờ] ${payload.notes || ''}`.trim();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('chamcong')
        .insert([{
          id: logId,
          id_nhan_vien: payload.staff_id,
          ca_lam: payload.shift,
          gio_vao: payload.check_in_time,
          gio_ra: payload.check_out_time,
          thoi_gian_thuc_vao: payload.check_in_time,
          thoi_gian_thuc_ra: payload.check_out_time,
          vi_do: 10.8872,
          kinh_do: 106.5932,
          dia_chi: 'AVA Coffee K300 (Quản lý chấm ngoài giờ)',
          trang_thai: 'Đã duyệt',
          ghi_chu_vao: noteText,
          ghi_chu_ra: noteText
        }])
        .select(`
          *,
          nguoidung (ho_ten, email)
        `)
        .single();

      if (error) throw error;
      broadcastRealtimeEvent('attendance_update');
      return mapTimeLogToClient(data);
    } else {
      const logs = mockDb.getTimeLogs();
      const users = mockDb.getUsers();
      const user = users.find(u => u.id === payload.staff_id);
      const newLog = {
        id: logId,
        user_id: payload.staff_id,
        shift: payload.shift,
        check_in_time: payload.check_in_time,
        check_out_time: payload.check_out_time,
        submitted_at: payload.check_in_time,
        real_check_out_time: payload.check_out_time,
        latitude: 10.8872,
        longitude: 106.5932,
        location_address: 'AVA Coffee K300 (Quản lý chấm ngoài giờ)',
        status: 'Đã duyệt' as const,
        ghi_chu_vao: noteText,
        ghi_chu_ra: noteText,
        users: user ? { full_name: user.full_name, email: user.email } : undefined
      };
      logs.push(newLog);
      mockDb.setTimeLogs(logs);
      broadcastRealtimeEvent('attendance_update');
      return newLog;
    }
  },

  async updateOvertimeTimeLog(
    id: string,
    payload: {
      staff_id: string;
      shift: string;
      check_in_time: string;
      check_out_time: string;
      notes?: string;
    }
  ) {
    const noteText = `[Quản lý chấm ngoài giờ] ${payload.notes || ''}`.trim();

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('chamcong')
        .update({
          id_nhan_vien: payload.staff_id,
          ca_lam: payload.shift,
          gio_vao: payload.check_in_time,
          gio_ra: payload.check_out_time,
          thoi_gian_thuc_vao: payload.check_in_time,
          thoi_gian_thuc_ra: payload.check_out_time,
          ghi_chu_vao: noteText,
          ghi_chu_ra: noteText
        })
        .eq('id', id)
        .select(`
          *,
          nguoidung (ho_ten, email)
        `)
        .single();

      if (error) throw error;
      broadcastRealtimeEvent('attendance_update');
      return mapTimeLogToClient(data);
    } else {
      const logs = mockDb.getTimeLogs();
      const users = mockDb.getUsers();
      const idx = logs.findIndex(l => l.id === id);
      if (idx !== -1) {
        const user = users.find(u => u.id === payload.staff_id);
        logs[idx] = {
          ...logs[idx],
          user_id: payload.staff_id,
          shift: payload.shift,
          check_in_time: payload.check_in_time,
          check_out_time: payload.check_out_time,
          ghi_chu_vao: noteText,
          ghi_chu_ra: noteText,
          users: user ? { full_name: user.full_name, email: user.email } : logs[idx].users
        };
        mockDb.setTimeLogs(logs);
      }
      broadcastRealtimeEvent('attendance_update');
      return logs[idx];
    }
  },

  async deleteOvertimeTimeLog(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('chamcong').delete().eq('id', id);
      if (error) throw error;
    } else {
      const logs = mockDb.getTimeLogs().filter(l => l.id !== id);
      mockDb.setTimeLogs(logs);
    }
    broadcastRealtimeEvent('attendance_update');
    return true;
  },
  async getLeaveRequests() {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('nghiphep')
        .select(`
          *,
          nguoidung (ho_ten, email)
        `)
        .order('ngay_nop', { ascending: false });
      if (!error && data) return data.map(mapLeaveRequestToClient).filter(Boolean) as any[];
    }
    const requests = mockDb.getLeaveRequests();
    const users = mockDb.getUsers();
    return requests.map(req => ({
      ...req,
      users: users.find(u => u.id === req.user_id) || null
    })).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  },

  async createLeaveRequest(req: { user_id: string; start_date: string; end_date: string; reason: string }) {
    const newReq = {
      id: generateShortId('lv_'),
      ...req,
      submitted_at: new Date().toISOString(),
      status: 'Chờ duyệt' as const
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('nghiphep').insert([{
        id: newReq.id,
        id_nhan_vien: req.user_id,
        ngay_bat_dau: req.start_date,
        ngay_ket_thuc: req.end_date,
        ly_do: req.reason,
        ngay_nop: newReq.submitted_at,
        trang_thai: 'Chờ duyệt'
      }]).select();
      broadcastRealtimeEvent('attendance_update');
      if (!error && data) return mapLeaveRequestToClient(data[0]);
    }

    const requests = mockDb.getLeaveRequests();
    requests.push(newReq);
    mockDb.setLeaveRequests(requests);
    broadcastRealtimeEvent('attendance_update');
    return newReq;
  },

  async approveLeaveRequest(id: string, status: 'Đã duyệt' | 'Từ chối') {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('nghiphep').update({ trang_thai: status }).eq('id', id).select();
      broadcastRealtimeEvent('attendance_update');
      if (!error && data) return mapLeaveRequestToClient(data[0]);
    }
    const requests = mockDb.getLeaveRequests();
    const idx = requests.findIndex(r => r.id === id);
    if (idx !== -1) {
      requests[idx].status = status;
      mockDb.setLeaveRequests(requests);
      broadcastRealtimeEvent('attendance_update');
      return requests[idx];
    }
    return null;
  },

  async checkDailyRollover() {
    if (typeof window === 'undefined') return;
    const todayStr = new Date().toLocaleDateString('en-CA');
    const lastRollover = localStorage.getItem('ava_last_rollover_date');
    if (lastRollover !== todayStr) {
      try {
        let ingredients: any[] = [];
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase.from('nguyenlieu').select('*');
          if (data && data.length > 0) {
            ingredients = data.map(ing => ({
              id: ing.id,
              name: ing.ten_nguyen_lieu,
              unit: ing.don_vi_tinh,
              stock_quantity: Number(ing.so_luong_ton),
              opening_stock: Number(ing.so_luong_ton),
              min_stock: ing.muc_canh_bao !== null ? Number(ing.muc_canh_bao) : null,
              quy_cach: ing.quy_cach,
              don_gia_nhap: Number(ing.don_gia_nhap || 0)
            }));
            mockDb.setIngredients(ingredients);
          }
        } else {
          ingredients = mockDb.getIngredients().map(ing => ({
            ...ing,
            don_gia_nhap: Number((ing as any).don_gia_nhap || 0)
          }));
        }

        localStorage.setItem('ava_last_rollover_date', todayStr);
      } catch (e) {
        console.error('Lỗi khi rollover ngày mới cho kho:', e);
      }
    }
  },

  // --- NGUYÊN LIỆU & KHO (nguyenlieu, congthuc, lichsukho) ---
  async getIngredients() {
    await this.checkDailyRollover();
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('nguyenlieu')
        .select('*')
        .order('ten_nguyen_lieu', { ascending: true });
      if (!error && data && data.length > 0) {
        const mapped = data.map(ing => ({
          id: ing.id,
          name: ing.ten_nguyen_lieu,
          unit: ing.don_vi_tinh,
          stock_quantity: Number(ing.so_luong_ton),
          opening_stock: Number(ing.so_luong_ton),
          min_stock: ing.muc_canh_bao !== null ? Number(ing.muc_canh_bao) : null,
          quy_cach: ing.quy_cach,
          don_gia_nhap: Number(ing.don_gia_nhap || 0),
          gia_von_trung_binh: Number(ing.gia_von_trung_binh || ing.don_gia_nhap || 0)
        }));
        mockDb.setIngredients(mapped);
        return mapped;
      } else if (error) {
        console.error('Lỗi lấy nguyên liệu từ Supabase:', error.message || error);
      }
    }
    return mockDb.getIngredients().map(ing => ({
      ...ing,
      don_gia_nhap: Number((ing as any).don_gia_nhap || 0),
      gia_von_trung_binh: Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0)
    }));
  },

  async createIngredient(data: {
    name: string;
    unit: string;
    quy_cach?: string;
    min_stock?: number | null;
    initial_stock?: number;
    don_gia_nhap?: number;
    gia_von_trung_binh?: number;
  }) {
    const id = generateShortId('ing_');
    const initialQty = Number(data.initial_stock || 0);
    const donGia = Number(data.don_gia_nhap || 0);
    const giaVon = Number(data.gia_von_trung_binh || donGia || 0);
    const minStock = data.min_stock !== undefined && data.min_stock !== null ? Number(data.min_stock) : null;

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('nguyenlieu')
        .insert([{
          id,
          ten_nguyen_lieu: data.name.trim(),
          don_vi_tinh: data.unit.trim(),
          so_luong_ton: initialQty,
          muc_canh_bao: minStock,
          quy_cach: data.quy_cach?.trim() || null,
          don_gia_nhap: donGia,
          gia_von_trung_binh: giaVon
        }]);

      if (error) {
        console.error('Lỗi thêm nguyên liệu trên Supabase:', error);
        throw new Error(error.message);
      }
    }

    const currentList = mockDb.getIngredients();
    const newIng = {
      id,
      name: data.name.trim(),
      unit: data.unit.trim(),
      stock_quantity: initialQty,
      opening_stock: initialQty,
      min_stock: minStock,
      quy_cach: data.quy_cach?.trim() || '',
      don_gia_nhap: donGia,
      gia_von_trung_binh: giaVon
    };
    currentList.push(newIng);
    mockDb.setIngredients(currentList);
    broadcastRealtimeEvent('inventory_update');
    return newIng;
  },

  async updateIngredient(id: string, data: Partial<{
    name: string;
    unit: string;
    quy_cach: string;
    min_stock: number | null;
    don_gia_nhap: number;
    gia_von_trung_binh: number;
    stock_quantity: number;
  }>) {
    if (isSupabaseConfigured && supabase) {
      const updatePayload: any = {};
      if (data.name !== undefined) updatePayload.ten_nguyen_lieu = data.name.trim();
      if (data.unit !== undefined) updatePayload.don_vi_tinh = data.unit.trim();
      if (data.quy_cach !== undefined) updatePayload.quy_cach = data.quy_cach.trim() || null;
      if (data.min_stock !== undefined) updatePayload.muc_canh_bao = data.min_stock;
      if (data.don_gia_nhap !== undefined) updatePayload.don_gia_nhap = Number(data.don_gia_nhap);
      if (data.gia_von_trung_binh !== undefined) updatePayload.gia_von_trung_binh = Number(data.gia_von_trung_binh);
      if (data.stock_quantity !== undefined) updatePayload.so_luong_ton = Number(data.stock_quantity);

      const { error } = await supabase.from('nguyenlieu').update(updatePayload).eq('id', id);
      if (error) {
        console.error('Lỗi cập nhật nguyên liệu trên Supabase:', error);
        throw new Error(error.message);
      }
    }

    const currentList = mockDb.getIngredients();
    const idx = currentList.findIndex(i => i.id === id);
    if (idx !== -1) {
      currentList[idx] = {
        ...currentList[idx],
        ...data,
        name: data.name !== undefined ? data.name.trim() : currentList[idx].name,
        unit: data.unit !== undefined ? data.unit.trim() : currentList[idx].unit,
        quy_cach: data.quy_cach !== undefined ? data.quy_cach.trim() : currentList[idx].quy_cach,
        min_stock: data.min_stock !== undefined ? data.min_stock : currentList[idx].min_stock,
        don_gia_nhap: data.don_gia_nhap !== undefined ? Number(data.don_gia_nhap) : currentList[idx].don_gia_nhap,
        gia_von_trung_binh: data.gia_von_trung_binh !== undefined ? Number(data.gia_von_trung_binh) : currentList[idx].gia_von_trung_binh
      };
      mockDb.setIngredients(currentList);
    }

    if (data.gia_von_trung_binh !== undefined || data.don_gia_nhap !== undefined) {
      try {
        await this.recalculateProductsCostPriceByIngredient(id);
      } catch (err) {
        console.error('Lỗi tính lại giá vốn món sau khi sửa nguyên liệu:', err);
      }
    }

    broadcastRealtimeEvent('inventory_update');
    return true;
  },

  async deleteIngredient(id: string): Promise<{ success: boolean; message?: string }> {
    // 1. Ràng buộc an toàn: Kiểm tra công thức món ăn
    const allRecipes = await this.getRecipes();
    const usedRecipes = allRecipes.filter(r => r.ingredient_id === id);
    if (usedRecipes.length > 0) {
      const allProducts = await this.getProducts();
      const productNames = Array.from(new Set(
        usedRecipes.map(r => allProducts.find(p => p.id === r.product_id)?.name || 'Món').filter(Boolean)
      ));
      return {
        success: false,
        message: `Không thể xóa nguyên liệu vì đang được sử dụng trong công thức của: "${productNames.join(', ')}". Vui lòng vào Quản lý đồ uống để gỡ nguyên liệu khỏi công thức món trước khi xóa!`
      };
    }

    // 2. Xóa khỏi Supabase
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('nguyenlieu').delete().eq('id', id);
      if (error) {
        console.error('Lỗi xóa nguyên liệu trên Supabase:', error);
        return { success: false, message: `Lỗi CSDL: ${error.message}` };
      }
    }

    // 3. Xóa khỏi LocalStorage
    const currentList = mockDb.getIngredients();
    mockDb.setIngredients(currentList.filter(i => i.id !== id));
    broadcastRealtimeEvent('inventory_update');
    return { success: true };
  },

  async getRecipes() {
    if (cachedRecipes) return cachedRecipes;
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('congthuc').select('*');
      if (!error && data) {
        cachedRecipes = data.map(rec => ({
          id: rec.id,
          product_id: rec.id_san_pham,
          ingredient_id: rec.id_nguyen_lieu,
          quantity_needed: Number(rec.so_luong_can),
          unit: rec.don_vi_tinh
        }));
        mockDb.setRecipes(cachedRecipes);
        return cachedRecipes;
      }
    }
    return mockDb.getRecipes();
  },

  async getProductRecipes(productId: string) {
    const allRecipes = await this.getRecipes();
    const allIngredients = await this.getIngredients();
    const recipesForProduct = allRecipes.filter(r => r.product_id === productId);
    
    return recipesForProduct.map(r => {
      const ing = allIngredients.find(i => i.id === r.ingredient_id);
      return {
        ...r,
        ingredient_name: ing ? ing.name : 'Nguyên liệu',
        ingredient_unit: r.unit || (ing ? ing.unit : '')
      };
    });
  },

  async getPendingInventoryLogs() {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('lichsukho')
        .select('id, id_nguyen_lieu, id_nhan_vien, trang_thai, loai_giao_dich')
        .eq('trang_thai', 'Chờ duyệt');
      if (!error && data) {
        return data.map(log => ({
          id: log.id,
          ingredient_id: log.id_nguyen_lieu,
          staff_id: log.id_nhan_vien,
          status: log.trang_thai,
          type: log.loai_giao_dich
        }));
      }
    }
    return mockDb.getInventoryLogs().filter(l => l.status === 'Chờ duyệt');
  },

  async getInventoryLogs() {
    this.consolidateDuplicateSalesLogs().catch(err => console.error(err));
    if (isSupabaseConfigured && supabase) {
      let allLogs: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('lichsukho')
          .select(`
            *,
            nguyenlieu (ten_nguyen_lieu, don_vi_tinh),
            nguoidung (ho_ten)
          `)
          .order('thoi_gian_tao', { ascending: false })
          .range(from, from + step - 1);

        if (error || !data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < step) break;
        from += step;
      }

      if (allLogs.length > 0) {
        return allLogs.map(log => ({
          id: log.id,
          ingredient_id: log.id_nguyen_lieu,
          custom_ingredient_name: log.ten_nguyen_lieu_khac,
          change_amount: Number(log.so_luong_thay_doi),
          type: log.loai_giao_dich,
          cost: Number(log.chi_phi || 0),
          note: log.ghi_chu,
          staff_id: log.id_nhan_vien,
          staff_name: log.nguoidung?.ho_ten || 'Nhân viên',
          ingredient_name: log.nguyenlieu?.ten_nguyen_lieu || log.ten_nguyen_lieu_khac || 'Khác',
          ingredient_unit: log.nguyenlieu?.don_vi_tinh || '',
          created_at: log.thoi_gian_tao,
          status: log.trang_thai
        }));
      }
    }
    const logs = mockDb.getInventoryLogs();
    const ingredients = mockDb.getIngredients();
    const users = mockDb.getUsers();
    return logs.map(log => {
      const ing = ingredients.find(i => i.id === log.ingredient_id);
      const user = users.find(u => u.id === log.staff_id);
      return {
        ...log,
        staff_name: user?.full_name || 'Nhân viên',
        ingredient_name: ing?.name || log.custom_ingredient_name || 'Khác',
        ingredient_unit: ing?.unit || ''
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  // Nhập thêm nguyên liệu (Restock) - Cộng kho ngay lập tức để nhân viên pha chế & Ghi nhận 'Chờ duyệt' cho Admin
  async restockIngredient(payload: {
    ingredient_id?: string;
    custom_ingredient_name?: string;
    change_amount: number;
    cost: number;
    note?: string;
    staff_id: string;
  }) {
    const isCustom = !payload.ingredient_id || payload.ingredient_id === 'other';
    const logId = generateShortId('inv_');
    const newLog = {
      id: logId,
      ingredient_id: isCustom ? null : payload.ingredient_id,
      custom_ingredient_name: isCustom ? payload.custom_ingredient_name : null,
      change_amount: payload.change_amount,
      type: 'Nhập kho' as const,
      cost: payload.cost,
      note: payload.note || '',
      staff_id: payload.staff_id,
      created_at: new Date().toISOString(),
      status: 'Chờ duyệt' as 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'
    };

    const ingredients = await this.getIngredients();

    // 1. CỘNG TỒN KHO NGAY LẬP TỨC để nhân viên sử dụng/bán hàng ngay
    if (!isCustom && payload.ingredient_id) {
      const ing = ingredients.find(i => i.id === payload.ingredient_id);
      const donGiaNhap = payload.change_amount > 0 ? (payload.cost / payload.change_amount) : 0;
      const v_ton_hien_tai = Number(ing?.stock_quantity || 0);
      const v_gia_von_cu = Number((ing as any)?.gia_von_trung_binh || (ing as any)?.don_gia_nhap || 0);
      const newQty = v_ton_hien_tai + payload.change_amount;
      
      let newGiaVon = v_gia_von_cu;
      if (newQty > 0 && payload.cost > 0) {
        newGiaVon = Math.round(((v_ton_hien_tai * v_gia_von_cu) + payload.cost) / newQty * 100) / 100;
      } else if (payload.cost > 0) {
        newGiaVon = donGiaNhap;
      }

      if (ing) {
        ing.stock_quantity = newQty;
        (ing as any).don_gia_nhap = donGiaNhap;
        (ing as any).gia_von_trung_binh = newGiaVon;
      }

      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('nguyenlieu')
          .update({
            so_luong_ton: newQty,
            don_gia_nhap: donGiaNhap,
            gia_von_trung_binh: newGiaVon
          })
          .eq('id', payload.ingredient_id);

        // Tạo phiếu nhập kho và chi tiết phiếu nhập
        const phieuId = generateShortId('phieu_');
        const maPhieu = 'PNK-' + generateShortId('').toUpperCase();
        
        await supabase.from('phieunhapkho').insert({
          id: phieuId,
          ma_phieu: maPhieu,
          id_nhan_vien: payload.staff_id,
          nha_cung_cap: 'AVA Coffee Supplier',
          tong_tien: payload.cost,
          ghi_chu: payload.note || 'Nhập kho nguyên liệu',
          ngay_nhap: new Date().toISOString()
        });

        await supabase.from('chitietnhapkho').insert({
          id: generateShortId('ct_'),
          id_phieu_nhap: phieuId,
          id_nguyen_lieu: payload.ingredient_id,
          so_luong: payload.change_amount,
          don_gia_nhap: donGiaNhap,
          thanh_tien: payload.cost
        });
      } else {
        mockDb.setIngredients(ingredients);
      }

      // Tự động tính toán lại giá vốn của các sản phẩm sử dụng nguyên liệu này
      try {
        await this.recalculateProductsCostPriceByIngredient(payload.ingredient_id);
      } catch (err) {
        console.error('Error recalculating cost price:', err);
      }
    }

    // 2. GHI LỊCH SỬ KHO VỚI TRẠNG THÁI "Chờ duyệt"
    if (isSupabaseConfigured && supabase) {
      await supabase.from('lichsukho').insert([{
        id: logId,
        id_nguyen_lieu: isCustom ? null : payload.ingredient_id,
        ten_nguyen_lieu_khac: isCustom ? payload.custom_ingredient_name : null,
        so_luong_thay_doi: payload.change_amount,
        loai_giao_dich: 'Nhập kho',
        chi_phi: payload.cost,
        ghi_chu: payload.note || '',
        id_nhan_vien: payload.staff_id,
        trang_thai: 'Chờ duyệt'
      }]);
    } else {
      const logs = mockDb.getInventoryLogs();
      logs.push(newLog);
      mockDb.setInventoryLogs(logs);
    }

    broadcastRealtimeEvent('inventory_update');
    broadcastRealtimeEvent('report_update');
    return newLog;
  },

  // Cập nhật giá nhập kho sau khi đã duyệt / phát sinh hóa đơn trễ
  async updateRestockCost(logId: string, newCost: number) {
    if (isSupabaseConfigured && supabase) {
      // 1. Lấy thông tin log nhập kho cũ
      const { data: log, error: logErr } = await supabase
        .from('lichsukho')
        .select('*')
        .eq('id', logId)
        .single();

      if (logErr || !log) throw new Error('Không tìm thấy lịch sử nhập kho');

      const oldCost = Number(log.chi_phi || 0);
      const ingredientId = log.id_nguyen_lieu;
      const changeAmount = Number(log.so_luong_thay_doi || 0);

      // 2. Cập nhật chi phí trong bảng lichsukho
      const { error: updateErr } = await supabase
        .from('lichsukho')
        .update({ chi_phi: newCost })
        .eq('id', logId);

      if (updateErr) throw updateErr;

      // 3. Nếu là nguyên liệu có trong hệ thống, cập nhật lại đơn giá nhập & giá vốn trung bình (Cách A)
      if (ingredientId) {
        const { data: ing } = await supabase
          .from('nguyenlieu')
          .select('*')
          .eq('id', ingredientId)
          .single();

        if (ing) {
          const v_ton_hien_tai = Number(ing.so_luong_ton || 0);
          const v_gia_von_cu = Number(ing.gia_von_trung_binh || ing.don_gia_nhap || 0);
          const donGiaNhapMoi = changeAmount > 0 ? (newCost / changeAmount) : 0;

          let newGiaVon = 0;
          if (v_ton_hien_tai > 0) {
            newGiaVon = Math.max(0, ((v_ton_hien_tai * v_gia_von_cu) - oldCost + newCost) / v_ton_hien_tai);
          } else {
            newGiaVon = donGiaNhapMoi;
          }

          await supabase
            .from('nguyenlieu')
            .update({
              gia_von_trung_binh: newGiaVon,
              don_gia_nhap: donGiaNhapMoi
            })
            .eq('id', ingredientId);

          // Cập nhật lại giá vốn sản phẩm liên quan
          try {
            await this.recalculateProductsCostPriceByIngredient(ingredientId);
          } catch (err) {
            console.error('Lỗi tính lại giá vốn sản phẩm:', err);
          }
        }
      }

      broadcastRealtimeEvent('inventory_update');
      broadcastRealtimeEvent('report_update');
      return true;
    }

    // MockDb fallback
    const logs = mockDb.getInventoryLogs();
    const targetLog = logs.find(l => l.id === logId);
    if (!targetLog) throw new Error('Không tìm thấy lịch sử nhập kho');

    const oldCost = Number(targetLog.cost || 0);
    targetLog.cost = newCost;
    mockDb.setInventoryLogs(logs);

    if (targetLog.ingredient_id) {
      const ingredients = mockDb.getIngredients();
      const ing = ingredients.find(i => i.id === targetLog.ingredient_id);
      if (ing) {
        const v_ton = Number(ing.stock_quantity || 0);
        const v_gia_von_cu = Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0);
        const donGiaNhapMoi = targetLog.change_amount > 0 ? (newCost / targetLog.change_amount) : 0;

        let newGiaVon = 0;
        if (v_ton > 0) {
          newGiaVon = Math.max(0, ((v_ton * v_gia_von_cu) - oldCost + newCost) / v_ton);
        } else {
          newGiaVon = donGiaNhapMoi;
        }

        (ing as any).gia_von_trung_binh = newGiaVon;
        (ing as any).don_gia_nhap = donGiaNhapMoi;
        mockDb.setIngredients(ingredients);

        try {
          await this.recalculateProductsCostPriceByIngredient(targetLog.ingredient_id);
        } catch (err) {
          console.error('Lỗi tính lại giá vốn sản phẩm mock:', err);
        }
      }
    }

    broadcastRealtimeEvent('inventory_update');
    broadcastRealtimeEvent('report_update');
    return true;
  },

  // Kiểm kho Cuối ngày / Cuối tuần (Stocktake)
  // Cập nhật tồn kho NGAY LẬP TỨC để nhân viên đối soát, nhưng ghi nhận trạng thái "Chờ duyệt" để Admin xác nhận.
  // Nếu Admin từ chối → hoàn lại tồn kho về lúc ban đầu.
  async submitStocktake(payload: {
    ingredient_id: string;
    actual_stock: number;
    system_stock: number;
    note?: string;
    staff_id: string;
  }) {
    const diff = payload.actual_stock - payload.system_stock;
    const logId = generateShortId('inv_');
    const newLog = {
      id: logId,
      ingredient_id: payload.ingredient_id,
      custom_ingredient_name: null,
      change_amount: diff,
      type: 'Hao hụt/Cân lại' as const,
      cost: 0,
      note: `Kiểm kho thực tế: ${payload.actual_stock} (Hệ thống: ${payload.system_stock}). ${payload.note || ''}`,
      staff_id: payload.staff_id,
      created_at: new Date().toISOString(),
      status: 'Chờ duyệt' as const
    };

    if (isSupabaseConfigured && supabase) {
      // 1. Ghi nhận lịch sử kho trạng thái Chờ duyệt
      await supabase.from('lichsukho').insert([{
        id: logId,
        id_nguyen_lieu: payload.ingredient_id,
        so_luong_thay_doi: diff,
        loai_giao_dich: 'Hao hụt/Cân lại',
        chi_phi: 0,
        ghi_chu: newLog.note,
        id_nhan_vien: payload.staff_id,
        trang_thai: 'Chờ duyệt'
      }]);

      // 2. Cập nhật trực tiếp số lượng tồn kho thực tế trong nguyenlieu ngay lập tức
      await supabase.from('nguyenlieu')
        .update({ so_luong_ton: payload.actual_stock })
        .eq('id', payload.ingredient_id);
    } else {
      const logs = mockDb.getInventoryLogs();
      logs.push(newLog);
      mockDb.setInventoryLogs(logs);

      const ingredients = mockDb.getIngredients();
      const ingIdx = ingredients.findIndex(i => i.id === payload.ingredient_id);
      if (ingIdx !== -1) {
        ingredients[ingIdx].stock_quantity = payload.actual_stock;
        mockDb.setIngredients(ingredients);
      }
    }

    broadcastRealtimeEvent('inventory_update');
    broadcastRealtimeEvent('report_update');
    return newLog;
  },

  // Admin Phê duyệt / Từ chối đơn Nhập kho & Kiểm kho
  // Quy trình chuẩn theo yêu cầu:
  // - Khi gửi: Đã cộng kho / điều chỉnh kho ngay lập tức để nhân viên pha chế & kiểm kê khớp 100%.
  // - Admin Phê duyệt ('Đã duyệt'): Đã vào kho rồi nên GIỮ NGUYÊN, chỉ đổi trạng thái thành 'Đã duyệt'.
  // - Admin Từ chối ('Từ chối'): HOÀN LẠI TỒN KHO & GIÁ VỐN VỀ TRƯỚC ĐÓ ("bỏ ra như chưa có gì").
  async approveInventoryLog(id: string, status: 'Đã duyệt' | 'Từ chối') {
    let resultLog: any = null;

    if (isSupabaseConfigured && supabase) {
      const { data: logRow, error: logErr } = await supabase
        .from('lichsukho')
        .select('*')
        .eq('id', id)
        .single();

      if (logErr || !logRow) return null;
      if (logRow.trang_thai === status) return logRow;

      const ingId = logRow.id_nguyen_lieu;
      const changeAmount = Number(logRow.so_luong_thay_doi || 0);
      const cost = Number(logRow.chi_phi || 0);
      const logType = logRow.loai_giao_dich;

      // 1. KHI TỪ CHỐI: Thu hồi kho & hoàn tác giá vốn
      if (status === 'Từ chối' && ingId) {
        const { data: ing } = await supabase
          .from('nguyenlieu')
          .select('*')
          .eq('id', ingId)
          .single();

        if (ing) {
          const v_ton_hien_tai = Number(ing.so_luong_ton || 0);
          const v_gia_von_hien_tai = Number(ing.gia_von_trung_binh || ing.don_gia_nhap || 0);
          const newQty = Math.max(0, v_ton_hien_tai - changeAmount);

          if (logType === 'Nhập kho') {
            // Hoàn lại giá vốn trung bình trước khi nhập đơn này
            let revertedGiaVon = v_gia_von_hien_tai;
            if (newQty > 0 && cost > 0) {
              revertedGiaVon = Math.max(0, ((v_ton_hien_tai * v_gia_von_hien_tai) - cost) / newQty);
            }

            await supabase
              .from('nguyenlieu')
              .update({
                so_luong_ton: newQty,
                gia_von_trung_binh: Math.round(revertedGiaVon * 100) / 100
              })
              .eq('id', ingId);

            // Xóa chi tiết phiếu nhập và phiếu nhập tương ứng (nếu có)
            const { data: ctRows } = await supabase
              .from('chitietnhapkho')
              .select('id, id_phieu_nhap')
              .eq('id_nguyen_lieu', ingId)
              .eq('so_luong', changeAmount)
              .order('id', { ascending: false })
              .limit(1);

            if (ctRows && ctRows.length > 0) {
              const ct = ctRows[0];
              await supabase.from('chitietnhapkho').delete().eq('id', ct.id);
              if (ct.id_phieu_nhap) {
                await supabase.from('phieunhapkho').delete().eq('id', ct.id_phieu_nhap);
              }
            }

            try {
              await this.recalculateProductsCostPriceByIngredient(ingId);
            } catch (err) {
              console.error('Lỗi tính lại giá vốn khi rollback nhập kho:', err);
            }
          } else {
            // Hao hụt/Cân lại hoặc các loại điều chỉnh kho khác: Trừ lại changeAmount
            await supabase
              .from('nguyenlieu')
              .update({ so_luong_ton: newQty })
              .eq('id', ingId);
          }
        }
      }
      // 2. KHI DUYỆT: Tồn kho đã vào từ trước nên GIỮ NGUYÊN!

      await supabase.from('lichsukho').update({ trang_thai: status }).eq('id', id);
      resultLog = { ...logRow, trang_thai: status };
    } else {
      const logs = mockDb.getInventoryLogs();
      const targetLog = logs.find(l => l.id === id);
      if (!targetLog) return null;
      if (targetLog.status === status) return targetLog;

      targetLog.status = status;

      // KHI TỪ CHỐI MOCK DB: Hoàn lại tồn kho
      if (status === 'Từ chối' && targetLog.ingredient_id) {
        const ingredients = mockDb.getIngredients();
        const ing = ingredients.find(i => i.id === targetLog.ingredient_id);
        if (ing) {
          const v_ton = Number(ing.stock_quantity || 0);
          const newQty = Math.max(0, v_ton - targetLog.change_amount);
          ing.stock_quantity = newQty;

          if (targetLog.type === 'Nhập kho' && targetLog.cost > 0 && newQty > 0) {
            const v_gia_von = Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0);
            (ing as any).gia_von_trung_binh = Math.max(0, ((v_ton * v_gia_von) - targetLog.cost) / newQty);
            try {
              await this.recalculateProductsCostPriceByIngredient(targetLog.ingredient_id);
            } catch (err) {
              console.error('Lỗi tính lại giá vốn mock:', err);
            }
          }
          mockDb.setIngredients(ingredients);
        }
      }

      mockDb.setInventoryLogs(logs);
      resultLog = targetLog;
    }

    broadcastRealtimeEvent('inventory_update');
    broadcastRealtimeEvent('report_update');
    return resultLog;
  },

  // --- BATCH APPROVE (Duyệt hàng loạt) ---
  async approveAllTimeLogs(ids: string[], status: 'Đã duyệt' | 'Từ chối') {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('chamcong').update({ trang_thai: status }).in('id', ids);
    } else {
      const logs = mockDb.getTimeLogs();
      ids.forEach(id => { const l = logs.find(x => x.id === id); if (l) l.status = status; });
      mockDb.setTimeLogs(logs);
    }
  },

  async approveAllLeaveRequests(ids: string[], status: 'Đã duyệt' | 'Từ chối') {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('nghiphep').update({ trang_thai: status }).in('id', ids);
    } else {
      const requests = mockDb.getLeaveRequests();
      ids.forEach(id => { const r = requests.find(x => x.id === id); if (r) r.status = status; });
      mockDb.setLeaveRequests(requests);
    }
  },

  async approveAllInventoryLogs(ids: string[], status: 'Đã duyệt' | 'Từ chối') {
    for (const id of ids) {
      await this.approveInventoryLog(id, status);
    }
    broadcastRealtimeEvent('inventory_update');
    broadcastRealtimeEvent('report_update');
  },

  async recalculateProductCostPrice(productId: string) {
    try {
      const allRecipes = await this.getRecipes();
      const productRecipes = allRecipes.filter(r => r.product_id === productId);
      const allIngredients = await this.getIngredients();
      
      let totalCost = 0;
      for (const recipe of productRecipes) {
        const ing = allIngredients.find(i => i.id === recipe.ingredient_id);
        const costPrice = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
        totalCost += recipe.quantity_needed * costPrice;
      }
      
      totalCost = Math.round(totalCost * 100) / 100;
      
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('sanpham')
          .update({ gia_von: totalCost })
          .eq('id', productId);
      } else {
        const products = mockDb.getProducts();
        const product = products.find(p => p.id === productId);
        if (product) {
          product.cost_price = totalCost;
          mockDb.setProducts(products);
        }
      }
      return totalCost;
    } catch (e) {
      console.error('Lỗi khi tính toán lại giá vốn cho sản phẩm:', productId, e);
      return 0;
    }
  },

  async recalculateProductsCostPriceByIngredient(ingredientId: string) {
    try {
      const allRecipes = await this.getRecipes();
      const productIds = allRecipes
        .filter(r => r.ingredient_id === ingredientId)
        .map(r => r.product_id);
      
      const uniqueProductIds = Array.from(new Set(productIds));
      for (const pId of uniqueProductIds) {
        await this.recalculateProductCostPrice(pId);
      }
    } catch (e) {
      console.error('Lỗi khi tính toán lại giá vốn theo nguyên liệu:', ingredientId, e);
    }
  },

  // Hoàn trả kho nguyên liệu khi hủy đơn hàng (hỗ trợ kiểm duyệt kho)
  async restoreStockFromOrder(
    items: Array<{ product_id: string; quantity: number }>,
    options?: {
      orderId?: string;
      staffId?: string;
      status?: 'Chờ duyệt' | 'Đã duyệt';
      reason?: string;
    }
  ) {
    try {
      const recipes = await this.getRecipes();
      const ingredients = await this.getIngredients();
      let updated = false;

      // Group ingredient changes
      const ingChanges: { [id: string]: { restoreQty: number; productIds: string[] } } = {};

      for (const item of items) {
        const itemRecipes = recipes.filter(r => r.product_id === item.product_id);
        for (const rec of itemRecipes) {
          const restoreQty = rec.quantity_needed * item.quantity;
          if (!ingChanges[rec.ingredient_id]) {
            ingChanges[rec.ingredient_id] = { restoreQty: 0, productIds: [] };
          }
          ingChanges[rec.ingredient_id].restoreQty += restoreQty;
          if (!ingChanges[rec.ingredient_id].productIds.includes(item.product_id)) {
            ingChanges[rec.ingredient_id].productIds.push(item.product_id);
          }
        }
      }

      const dbUpdates: any[] = [];
      const historyLogsToInsert: any[] = [];
      const logStatus = options?.status || 'Đã duyệt';
      const staffId = options?.staffId || 'system';

      for (const ingId in ingChanges) {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) {
          const { restoreQty, productIds } = ingChanges[ingId];
          const currentStock = Number(ing.stock_quantity ?? (ing as any).so_luong_ton ?? 0) || 0;
          ing.stock_quantity = currentStock + restoreQty;
          updated = true;

          const defaultNote = options?.orderId
            ? `Hoàn kho do hủy đơn #${options.orderId} (Mã SP: ${productIds.join(', ')})`
            : `Hoàn kho do hủy đơn hàng (Mã SP: ${productIds.join(', ')})`;
          const logNote = options?.reason ? options.reason : defaultNote;

          if (isSupabaseConfigured && supabase) {
            dbUpdates.push(
              supabase.from('nguyenlieu').update({ so_luong_ton: ing.stock_quantity }).eq('id', ing.id)
            );
            historyLogsToInsert.push({
              id: generateShortId('inv_'),
              id_nguyen_lieu: ing.id,
              so_luong_thay_doi: restoreQty,
              loai_giao_dich: 'Khác',
              chi_phi: 0,
              ghi_chu: logNote,
              id_nhan_vien: staffId,
              trang_thai: logStatus
            });
          } else {
            const logs = mockDb.getInventoryLogs();
            logs.push({
              id: generateShortId('inv_'),
              ingredient_id: ing.id,
              custom_ingredient_name: null,
              change_amount: restoreQty,
              type: 'Khác' as const,
              cost: 0,
              note: logNote,
              staff_id: staffId,
              created_at: new Date().toISOString(),
              status: logStatus
            });
            mockDb.setInventoryLogs(logs);
          }
        }
      }

      if (isSupabaseConfigured && supabase) {
        if (dbUpdates.length > 0) {
          await Promise.all(dbUpdates);
        }
        if (historyLogsToInsert.length > 0) {
          await supabase.from('lichsukho').insert(historyLogsToInsert);
        }
        broadcastRealtimeEvent('inventory_update');
      } else if (updated) {
        mockDb.setIngredients(ingredients);
        broadcastRealtimeEvent('inventory_update');
      }
    } catch (e) {
      console.error('Lỗi khi hoàn trả tồn kho đơn hàng:', e);
    }
  },

  // Tự động khấu trừ kho khi có đơn bán hàng mới ở POS
  async deductStockFromOrder(items: Array<{ product_id: string; quantity: number }>) {
    try {
      // Song song: lấy công thức, lấy nguyên liệu, và lấy nhật ký kho hôm nay cùng lúc
      const now = new Date();
      const vnDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

      const [recipes, ingredients, historyLogsResult] = await Promise.all([
        this.getRecipes(),
        this.getIngredients(),
        isSupabaseConfigured && supabase
          ? supabase
              .from('lichsukho')
              .select('*')
              .eq('loai_giao_dich', 'Bán hàng')
              .gte('thoi_gian_tao', `${vnDateStr}T00:00:00+07:00`)
              .order('thoi_gian_tao', { ascending: false })
          : Promise.resolve({ data: null })
      ]);

      let updated = false;

      const CUP_INGREDIENTS = ['ing_lyden', 'ing_lytrang', 'ing_lyhoavan'];
      const ingChanges: { [id: string]: { deductQty: number; productIds: string[] } } = {};
      for (const item of items) {
        // Kiểm tra xem món có chọn đổi ly riêng không (từ thuộc tính hoặc ghi chú [Ly: ing_...])
        let customCupId = (item as any).cup_id || (item as any).selected_cup_id;
        const notesStr = (item as any).notes || (item as any).ghi_chu || '';
        if (!customCupId && notesStr) {
          const m = notesStr.match(/\[Ly:\s*(ing_ly[a-z]+)\]/);
          if (m) customCupId = m[1];
        }

        const itemRecipes = recipes.filter(r => r.product_id === item.product_id);
        let cupReplaced = false;

        for (const rec of itemRecipes) {
          let targetIngId = rec.ingredient_id;

          // Nếu công thức có ly trà tắc cũ -> đổi sang ly trắng vì K300 không dùng ly trà tắc
          if (targetIngId === 'ing_lytratac') {
            targetIngId = 'ing_lytrang';
          }

          // Nếu là nguyên liệu ly và đơn hàng có chỉ định đổi ly riêng (ví dụ uống nóng -> đổi ly đen)
          if (CUP_INGREDIENTS.includes(targetIngId) && customCupId && CUP_INGREDIENTS.includes(customCupId)) {
            targetIngId = customCupId;
            cupReplaced = true;
          }

          const deductQty = rec.quantity_needed * item.quantity;
          if (!ingChanges[targetIngId]) {
            ingChanges[targetIngId] = { deductQty: 0, productIds: [] };
          }
          ingChanges[targetIngId].deductQty += deductQty;
          if (!ingChanges[targetIngId].productIds.includes(item.product_id)) {
            ingChanges[targetIngId].productIds.push(item.product_id);
          }
        }

        // Nếu món ban đầu không có ly trong công thức nhưng nhân viên chọn ly
        if (!cupReplaced && customCupId && CUP_INGREDIENTS.includes(customCupId)) {
          if (!ingChanges[customCupId]) {
            ingChanges[customCupId] = { deductQty: 0, productIds: [] };
          }
          ingChanges[customCupId].deductQty += item.quantity;
          if (!ingChanges[customCupId].productIds.includes(item.product_id)) {
            ingChanges[customCupId].productIds.push(item.product_id);
          }
        }
      }

      let existingTodayLogs: any[] = [];
      if (historyLogsResult?.data) {
        existingTodayLogs = historyLogsResult.data.filter(l => {
          const logVnDate = new Date(l.thoi_gian_tao).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
          return logVnDate === vnDateStr;
        });
      }

      const dbUpdates: any[] = [];
      const historyLogsToInsert: any[] = [];

      for (const ingId in ingChanges) {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) {
          const { deductQty } = ingChanges[ingId];
          const currentStock = Number(ing.stock_quantity ?? (ing as any).so_luong_ton ?? 0) || 0;
          ing.stock_quantity = Math.max(0, currentStock - deductQty);
          updated = true;

          if (isSupabaseConfigured && supabase) {
            dbUpdates.push(
              supabase.from('nguyenlieu').update({ so_luong_ton: ing.stock_quantity }).eq('id', ing.id)
            );
            
            const existingLog = existingTodayLogs.find(l => l.id_nguyen_lieu === ing.id);
            if (existingLog) {
              const newQty = Number(existingLog.so_luong_thay_doi) - deductQty;
              dbUpdates.push(
                supabase.from('lichsukho').update({ 
                  so_luong_thay_doi: newQty,
                  thoi_gian_tao: now.toISOString()
                }).eq('id', existingLog.id)
              );
            } else {
              historyLogsToInsert.push({
                id: generateShortId('inv_'),
                id_nguyen_lieu: ing.id,
                so_luong_thay_doi: -deductQty,
                loai_giao_dich: 'Bán hàng',
                chi_phi: 0,
                ghi_chu: `Khấu trừ tổng hợp bán hàng POS ngày ${now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
                trang_thai: 'Đã duyệt'
              });
            }
          } else {
            const logs = mockDb.getInventoryLogs();
            const existingMockLog = logs.find(l => 
              l.ingredient_id === ing.id && 
              l.type === 'Bán hàng' && 
              new Date(l.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) === vnDateStr
            );
            if (existingMockLog) {
              existingMockLog.change_amount = Number(existingMockLog.change_amount) - deductQty;
            } else {
              logs.push({
                id: generateShortId('inv_'),
                ingredient_id: ing.id,
                custom_ingredient_name: null,
                change_amount: -deductQty,
                type: 'Bán hàng' as const,
                cost: 0,
                note: `Khấu trừ tổng hợp bán hàng POS ngày ${now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
                staff_id: 'system',
                created_at: now.toISOString(),
                status: 'Đã duyệt' as const
              });
            }
            mockDb.setInventoryLogs(logs);
          }
        }
      }

      if (isSupabaseConfigured && supabase) {
        if (dbUpdates.length > 0) {
          await Promise.all(dbUpdates);
        }
        if (historyLogsToInsert.length > 0) {
          await supabase.from('lichsukho').insert(historyLogsToInsert);
        }
        broadcastRealtimeEvent('inventory_update');
      } else if (updated) {
        mockDb.setIngredients(ingredients);
        broadcastRealtimeEvent('inventory_update');
      }
    } catch (e) {
      console.error('Lỗi khi khấu trừ tồn kho bán hàng:', e);
    }
  },

  // Gộp các log bán hàng trùng lặp trong cùng một ngày cho từng nguyên liệu
  async consolidateDuplicateSalesLogs() {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { data: salesLogs, error } = await supabase
        .from('lichsukho')
        .select('*')
        .eq('loai_giao_dich', 'Bán hàng');

      if (error || !salesLogs || salesLogs.length === 0) return;

      const groups: { [key: string]: any[] } = {};
      salesLogs.forEach(log => {
        const vnDateStr = new Date(log.thoi_gian_tao).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
        const key = `${log.id_nguyen_lieu}_${vnDateStr}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      });

      const updates: any[] = [];
      const idsToDelete: string[] = [];

      Object.values(groups).forEach(group => {
        if (group.length > 1) {
          group.sort((a, b) => new Date(b.thoi_gian_tao).getTime() - new Date(a.thoi_gian_tao).getTime());
          const keepLog = group[0];
          const totalQty = group.reduce((sum, l) => sum + Number(l.so_luong_thay_doi || 0), 0);

          updates.push(
            supabase.from('lichsukho').update({ so_luong_thay_doi: totalQty }).eq('id', keepLog.id)
          );

          for (let i = 1; i < group.length; i++) {
            idsToDelete.push(group[i].id);
          }
        }
      });

      if (updates.length > 0) {
        await Promise.all(updates);
      }

      if (idsToDelete.length > 0) {
        for (let i = 0; i < idsToDelete.length; i += 50) {
          const batch = idsToDelete.slice(i, i + 50);
          await supabase.from('lichsukho').delete().in('id', batch);
        }
      }
    } catch (e) {
      console.error('Lỗi khi gộp nhật ký bán hàng trùng lặp:', e);
    }
  },

  // Đối soát và tự động hiệu chỉnh tồn kho + nhật ký kho khớp 100% với đơn bán hàng trong ngày
  async reconcileDailyInventoryWithSales(targetDateVN?: string) {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const dateVN = targetDateVN || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      
      const startUtc = new Date(`${dateVN}T00:00:00+07:00`).toISOString();
      const endUtc = new Date(`${dateVN}T23:59:59.999+07:00`).toISOString();
      const queryStartUtc = new Date(new Date(startUtc).getTime() - 24 * 3600 * 1000).toISOString();
      
      const [allOrdersResult, recipesResult, logsResult, ingredientsResult] = await Promise.all([
        supabase.from('hoadon')
          .select('*, hoadondetail(*)')
          .eq('trang_thai_thanh_toan', 'Đã thanh toán')
          .gte('ngay_tao', queryStartUtc)
          .lte('ngay_tao', endUtc),
        supabase.from('congthuc').select('*'),
        supabase.from('lichsukho')
          .select('*')
          .eq('loai_giao_dich', 'Bán hàng')
          .gte('thoi_gian_tao', startUtc)
          .lte('thoi_gian_tao', endUtc),
        supabase.from('nguyenlieu').select('*')
      ]);

      const paidOrders = (allOrdersResult.data || []).filter(o => {
        const dVN = new Date(new Date(o.ngay_thanh_toan || o.ngay_tao).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        return dVN === dateVN;
      });

      const recipes = recipesResult.data || [];
      const theoreticalDeductions: { [ingId: string]: number } = {};

      paidOrders.forEach(o => {
        o.hoadondetail?.forEach((item: any) => {
          const prodId = item.idsp;
          const qty = Number(item.so_luong || 0);
          const prodRecipes = recipes.filter(r => r.id_san_pham === prodId);
          prodRecipes.forEach(rec => {
            const deduct = Number(rec.so_luong_can || 0) * qty;
            theoreticalDeductions[rec.id_nguyen_lieu] = (theoreticalDeductions[rec.id_nguyen_lieu] || 0) + deduct;
          });
        });
      });

      const todayLogs = (logsResult.data || []).filter(l => {
        const dVN = new Date(new Date(l.thoi_gian_tao).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        return dVN === dateVN;
      });

      const ingredients = ingredientsResult.data || [];
      const dbUpdates: any[] = [];

      for (const ing of ingredients) {
        const ingId = ing.id;
        const theoQty = theoreticalDeductions[ingId] || 0;
        const log = todayLogs.find(l => l.id_nguyen_lieu === ingId);

        if (log) {
          const currentLoggedQty = Math.abs(Number(log.so_luong_thay_doi));
          const diff = currentLoggedQty - theoQty;
          if (Math.abs(diff) > 0.0001) {
            dbUpdates.push(
              supabase.from('lichsukho').update({ so_luong_thay_doi: -theoQty }).eq('id', log.id),
              supabase.from('nguyenlieu').update({ so_luong_ton: Number(ing.so_luong_ton) + diff }).eq('id', ingId)
            );
          }
        } else if (theoQty > 0) {
          dbUpdates.push(
            supabase.from('lichsukho').insert({
              id: generateShortId('inv_'),
              id_nguyen_lieu: ingId,
              so_luong_thay_doi: -theoQty,
              loai_giao_dich: 'Bán hàng',
              chi_phi: 0,
              ghi_chu: `Khấu trừ tổng hợp bán hàng POS ngày ${dateVN}`,
              trang_thai: 'Đã duyệt'
            }),
            supabase.from('nguyenlieu').update({ so_luong_ton: Math.max(0, Number(ing.so_luong_ton) - theoQty) }).eq('id', ingId)
          );
        }
      }

      if (dbUpdates.length > 0) {
        await Promise.all(dbUpdates);
      }
    } catch (e) {
      console.error('Lỗi khi tự động đối soát kho với đơn bán hàng:', e);
    }
  },

  // --- OPERATIONAL EXPENSES (chiphivanhang) ---
  async getExpenses(startDate?: string, endDate?: string) {
    if (isSupabaseConfigured && supabase) {
      let query = supabase.from('chiphivanhang').select(`
        *,
        nguoidung (ho_ten)
      `);
      if (startDate) {
        query = query.gte('ngay_chi', startDate);
      }
      if (endDate) {
        query = query.lte('ngay_chi', endDate);
      }
      const { data, error } = await query.order('ngay_chi', { ascending: false });
      if (!error && data) {
        return data.map(item => ({
          id: item.id,
          name: item.ten_chi_phi,
          type: item.loai_chi_phi, // 'co_dinh' or 'bien_dong'
          amount: Number(item.so_tien),
          date: item.ngay_chi,
          staff_id: item.id_nhan_vien,
          notes: item.ghi_chu || '',
          staff_name: item.nguoidung?.ho_ten || 'Không rõ'
        }));
      }
    }
    
    // Mock DB Fallback
    const expenses = getStorageItem<any[]>('ava_expenses', []);
    const users = mockDb.getUsers();
    let filtered = expenses;
    if (startDate) {
      filtered = filtered.filter(e => e.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(e => e.date <= endDate);
    }
    return filtered.map(e => ({
      ...e,
      staff_name: users.find(u => u.id === e.staff_id)?.full_name || 'Không rõ'
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  async createExpense(payload: {
    name: string;
    type: 'co_dinh' | 'bien_dong';
    amount: number;
    date: string;
    staff_id: string;
    notes?: string;
  }) {
    const id = generateShortId('exp_');
    const newExpense = {
      id,
      ten_chi_phi: payload.name,
      loai_chi_phi: payload.type,
      so_tien: payload.amount,
      ngay_chi: payload.date,
      id_nhan_vien: payload.staff_id,
      ghi_chu: payload.notes || ''
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.from('chiphivanhang').insert([newExpense]).select().single();
      if (!error && data) {
        broadcastRealtimeEvent('report_update');
        return {
          id: data.id,
          name: data.ten_chi_phi,
          type: data.loai_chi_phi,
          amount: Number(data.so_tien),
          date: data.ngay_chi,
          staff_id: data.id_nhan_vien,
          notes: data.ghi_chu || ''
        };
      }
    }

    const expenses = getStorageItem<any[]>('ava_expenses', []);
    const clientExpense = {
      id,
      name: payload.name,
      type: payload.type,
      amount: payload.amount,
      date: payload.date,
      staff_id: payload.staff_id,
      notes: payload.notes || ''
    };
    expenses.push(clientExpense);
    setStorageItem('ava_expenses', expenses);
    broadcastRealtimeEvent('report_update');
    return clientExpense;
  },

  async deleteExpense(id: string) {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('chiphivanhang').delete().eq('id', id);
      if (!error) {
        broadcastRealtimeEvent('report_update');
        return true;
      }
    }

    const expenses = getStorageItem<any[]>('ava_expenses', []);
    const filtered = expenses.filter(e => e.id !== id);
    setStorageItem('ava_expenses', filtered);
    broadcastRealtimeEvent('report_update');
    return true;
  },

  // --- STORE SETTINGS (CÀI ĐẶT CỬA HÀNG & MÁY IN) ---
  getStoreSettingsSync(): StoreSettings {
    return mockDb.getStoreSettings();
  },

  async getStoreSettings(): Promise<StoreSettings> {
    const local = mockDb.getStoreSettings();
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('cauhinh').select('*').eq('id', 'store_settings').maybeSingle();
        if (!error && data && data.gia_tri) {
          const parsed = typeof data.gia_tri === 'string' ? JSON.parse(data.gia_tri) : data.gia_tri;
          const merged = { ...DEFAULT_STORE_SETTINGS, ...parsed };
          mockDb.setStoreSettings(merged);
          return merged;
        }
      } catch (e) {
        // Fallback gracefully if cauhinh does not exist
      }
    }
    return local || DEFAULT_STORE_SETTINGS;
  },

  async updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
    const current = await this.getStoreSettings();
    const updated: StoreSettings = {
      ...current,
      ...settings,
      printer_port: Number(settings.printer_port || current.printer_port || 9100)
    };
    mockDb.setStoreSettings(updated);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('cauhinh').upsert({
          id: 'store_settings',
          khoa: 'store_settings',
          gia_tri: JSON.stringify(updated),
          ngay_cap_nhat: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Lưu cauhinh lên Supabase chưa khả dụng, đã lưu an toàn vào máy.', e);
      }
    }

    return updated;
  },

  // --- FULL BACKUP & CLEAN-UP AN TOÀN ---
  async exportFullBackupData() {
    const backup: any = {
      version: '1.0',
      export_date: new Date().toISOString(),
      store_settings: this.getStoreSettingsSync(),
      orders: [],
      order_details: [],
      ingredients: [],
      products: [],
      categories: [],
      recipes: [],
      tables: [],
      time_logs: [],
      inventory_logs: [],
      expenses: []
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const [
          ordersRes,
          detailsRes,
          ingredientsRes,
          productsRes,
          categoriesRes,
          recipesRes,
          tablesRes,
          timeLogsRes,
          invLogsRes,
          expensesRes
        ] = await Promise.all([
          supabase.from('hoadon').select('*').order('ngay_tao', { ascending: false }),
          supabase.from('hoadondetail').select('*'),
          supabase.from('nguyenlieu').select('*').order('ten_nguyen_lieu', { ascending: true }),
          supabase.from('sanpham').select('*').order('ten_san_pham', { ascending: true }),
          supabase.from('danhmuc').select('*'),
          supabase.from('congthuc').select('*'),
          supabase.from('danhsachban').select('*').order('ten_ban', { ascending: true }),
          supabase.from('chamcong').select('*').order('gio_vao', { ascending: false }),
          supabase.from('lichsukho').select('*').order('thoi_gian_tao', { ascending: false }),
          supabase.from('chiphivanhang').select('*').order('ngay_chi', { ascending: false })
        ]);

        backup.orders = ordersRes.data || [];
        backup.order_details = detailsRes.data || [];
        backup.ingredients = ingredientsRes.data || [];
        backup.products = productsRes.data || [];
        backup.categories = categoriesRes.data || [];
        backup.recipes = recipesRes.data || [];
        backup.tables = tablesRes.data || [];
        backup.time_logs = timeLogsRes.data || [];
        backup.inventory_logs = invLogsRes.data || [];
        backup.expenses = expensesRes.data || [];
      } catch (e) {
        console.error('Lỗi khi fetch toàn bộ dữ liệu từ Supabase:', e);
      }
    } else {
      backup.orders = mockDb.getOrders();
      backup.order_details = mockDb.getOrderItems();
      backup.ingredients = mockDb.getIngredients();
      backup.products = mockDb.getProducts();
      backup.categories = mockDb.getCategories();
      backup.recipes = mockDb.getRecipes();
      backup.tables = mockDb.getTables();
      backup.time_logs = mockDb.getTimeLogs();
      backup.inventory_logs = mockDb.getInventoryLogs();
      backup.expenses = getStorageItem<any[]>('ava_expenses', []);
    }

    return backup;
  },

  async cleanupOldData(retentionDays: number) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    let deletedOrdersCount = 0;
    let deletedLogsCount = 0;

    if (isSupabaseConfigured && supabase) {
      // 1. Tìm các đơn hàng cũ hơn cutoffDate mà KHÔNG ở trạng thái 'Chưa thanh toán'
      const { data: oldOrders } = await supabase
        .from('hoadon')
        .select('id')
        .lt('ngay_tao', cutoffDate)
        .neq('trang_thai_thanh_toan', 'Chưa thanh toán');

      if (oldOrders && oldOrders.length > 0) {
        const oldIds = oldOrders.map(o => o.id);
        deletedOrdersCount = oldIds.length;

        // Xóa chi tiết đơn hàng cũ trước (tránh foreign key cascade issue)
        for (let i = 0; i < oldIds.length; i += 200) {
          const batch = oldIds.slice(i, i + 200);
          await supabase.from('hoadondetail').delete().in('idhoadon', batch);
          await supabase.from('hoadon').delete().in('id', batch);
        }
      }

      // 2. Xóa lịch sử kho cũ (TUYỆT ĐỐI KHÔNG CHẠM BẢNG nguyenlieu!)
      const { count: deletedLogs } = await supabase
        .from('lichsukho')
        .delete({ count: 'exact' })
        .lt('thoi_gian_tao', cutoffDate);
      deletedLogsCount = deletedLogs || 0;

      // 3. Xóa chi phí vận hành cũ hơn cutoffDate
      await supabase.from('chiphivanhang').delete().lt('ngay_chi', cutoffDate.split('T')[0]);

      // 4. Xóa chấm công cũ hơn cutoffDate
      await supabase.from('chamcong').delete().lt('gio_vao', cutoffDate);

      broadcastRealtimeEvent('order_update');
      broadcastRealtimeEvent('report_update');
    } else {
      // Fallback LocalStorage
      const orders = mockDb.getOrders();
      const keptOrders = orders.filter(o => {
        const orderDate = new Date(o.created_at || o.thoi_gian_tao).getTime();
        const cutoffTime = new Date(cutoffDate).getTime();
        return o.status === 'Chưa thanh toán' || orderDate >= cutoffTime;
      });
      deletedOrdersCount = orders.length - keptOrders.length;
      mockDb.setOrders(keptOrders);

      const logs = mockDb.getInventoryLogs();
      const keptLogs = logs.filter(l => new Date(l.created_at || l.thoi_gian).getTime() >= new Date(cutoffDate).getTime());
      deletedLogsCount = logs.length - keptLogs.length;
      mockDb.setInventoryLogs(keptLogs);
    }

    return {
      success: true,
      deletedOrdersCount,
      deletedLogsCount,
      cutoffDate
    };
  },

  // --- SUPABASE REALTIME SUBSCRIPTION HELPERS ---
  subscribeToTableChanges(callback: (payload: any) => void): () => void {
    if (!isSupabaseConfigured || !supabase) return () => {};
    getSharedRealtimeChannel();
    realtimeListeners['table_update'].add(callback);
    return () => {
      realtimeListeners['table_update'].delete(callback);
    };
  },

  subscribeToOrderChanges(callback: (payload: any) => void): () => void {
    if (!isSupabaseConfigured || !supabase) return () => {};
    getSharedRealtimeChannel();
    realtimeListeners['order_update'].add(callback);
    return () => {
      realtimeListeners['order_update'].delete(callback);
    };
  },

  subscribeToReportChanges(callback: (payload: any) => void): () => void {
    if (!isSupabaseConfigured || !supabase) return () => {};
    getSharedRealtimeChannel();
    realtimeListeners['report_update'].add(callback);
    return () => {
      realtimeListeners['report_update'].delete(callback);
    };
  },

  subscribeToInventoryChanges(callback: (payload: any) => void): () => void {
    if (!isSupabaseConfigured || !supabase) return () => {};
    getSharedRealtimeChannel();
    realtimeListeners['inventory_update'].add(callback);
    return () => {
      realtimeListeners['inventory_update'].delete(callback);
    };
  }
};



