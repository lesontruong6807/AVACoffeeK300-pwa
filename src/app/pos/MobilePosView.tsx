'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  db, 
  getCurrentUser,
  getDefaultCupId,
  getCupLabel,
  resolveItemCupId,
  createCoalescedRefresher,
  generateShortId,
  onRealtimeEvent
} from '@/lib/database';
import { toast } from '@/lib/toast';
import { printOrderDirect } from '@/lib/printerService';
import { getVietQrUrl, TECHCOMBANK_INFO } from '@/lib/vietqr';
import { 
  Coffee, 
  Users, 
  ChevronRight, 
  Trash2, 
  Plus, 
  Minus, 
  ShoppingCart, 
  Search, 
  Tag, 
  ArrowLeft,
  Loader2,
  FileText,
  CreditCard,
  DollarSign,
  ArrowRightLeft,
  X,
  Monitor
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  cup_id?: string;
  notes?: string;
}

interface MobilePosViewProps {
  onSwitchToDesktop?: () => void;
}

export default function MobilePosView({ onSwitchToDesktop }: MobilePosViewProps) {
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [yesterdaySales, setYesterdaySales] = useState<{ [productId: string]: number }>({});
  const [loading, setLoading] = useState(true);

  // Trạng thái giỏ hàng & Quy trình POS
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [posStep, setPosStep] = useState<'table' | 'menu' | 'summary'>('table');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const isSavingRef = useRef(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Trạng thái đơn đang phục vụ & Thanh toán nhanh tại POS
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [existingOrder, setExistingOrder] = useState<any>(null);
  const [existingOrderItems, setExistingOrderItems] = useState<any[]>([]);
  const [loadingExistingOrder, setLoadingExistingOrder] = useState(false);
  const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [showTransferQr, setShowTransferQr] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Trạng thái giảm giá
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);

  const refreshTables = async () => {
    try {
      const [tablesData, unpaidData, recipesData] = await Promise.all([
        db.getTables(true),
        db.getUnpaidOrders(),
        db.getRecipes()
      ]);
      setTables(tablesData);
      setUnpaidOrders(unpaidData);
      if (recipesData) setRecipes(recipesData);
      try {
        localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
        localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
      } catch (_) {}
    } catch (e) {
      console.error('Lỗi làm mới danh sách bàn POS:', e);
    }
  };

  useEffect(() => {
    async function loadData() {
      // 1. Đọc dữ liệu từ cache trước để hiển thị ngay lập tức (0ms)
      const todayDateKey = new Date().toLocaleDateString('en-CA');
      try {
        const storedTables = localStorage.getItem('ava_pos_cache_tables');
        const storedCategories = localStorage.getItem('ava_pos_cache_categories');
        const storedProducts = localStorage.getItem('ava_pos_cache_products');
        const storedUnpaid = localStorage.getItem('ava_pos_cache_unpaid');
        const storedRecipes = localStorage.getItem('ava_pos_cache_recipes');
        const storedYest = localStorage.getItem(`ava_pos_yest_sales_${todayDateKey}`);
        
        if (storedTables && storedCategories && storedProducts) {
          setTables(JSON.parse(storedTables));
          setCategories(JSON.parse(storedCategories));
          setProducts(JSON.parse(storedProducts));
          if (storedUnpaid) setUnpaidOrders(JSON.parse(storedUnpaid));
          if (storedRecipes) setRecipes(JSON.parse(storedRecipes));
          if (storedYest) setYesterdaySales(JSON.parse(storedYest));
          setLoading(false);
        }
      } catch (cacheErr) {
        console.warn('Lỗi đọc cache POS:', cacheErr);
      }

      try {
        const [tablesData, categoriesData, productsData, unpaidData, recipesData] = await Promise.all([
          db.getTables(),
          db.getCategories(),
          db.getProducts(),
          db.getUnpaidOrders(),
          db.getRecipes()
        ]);
        
        setTables(tablesData);
        setCategories(categoriesData);
        setProducts(productsData);
        setUnpaidOrders(unpaidData);
        if (recipesData) setRecipes(recipesData);
        
        try {
          localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
          localStorage.setItem('ava_pos_cache_categories', JSON.stringify(categoriesData));
          localStorage.setItem('ava_pos_cache_products', JSON.stringify(productsData));
          localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
          if (recipesData) localStorage.setItem('ava_pos_cache_recipes', JSON.stringify(recipesData));
        } catch (_) {}

        const cachedYest = localStorage.getItem(`ava_pos_yest_sales_${todayDateKey}`);
        if (!cachedYest) {
          db.getYesterdayProductSales().then(yestSalesData => {
            if (yestSalesData) {
              setYesterdaySales(yestSalesData);
              try {
                localStorage.setItem(`ava_pos_yest_sales_${todayDateKey}`, JSON.stringify(yestSalesData));
              } catch (_) {}
            }
          }).catch(() => {});
        }
      } catch (error) {
        console.error('Lỗi khi tải dữ liệu POS từ server:', error);
      } finally {
        setLoading(false);
        setCurrentUser(getCurrentUser());
      }
    }
    loadData();

    // 2. Realtime listener cho bàn và đơn hàng
    // Gom các sự kiện dồn dập (mỗi lần thanh toán sinh hàng chục sự kiện) thành 1 lần tải lại -> điện thoại không bị lag
    const scheduleRefresh = createCoalescedRefresher(() => refreshTables(), 500, 2500, { onlyWhenVisible: true });
    const unsubTables = db.subscribeToTableChanges(scheduleRefresh);
    const unsubOrders = db.subscribeToOrderChanges(scheduleRefresh);

    // Admin thêm / sửa món, đổi giá, đổi ảnh -> tự tải lại thực đơn (không cần khởi động lại app)
    const reloadMenu = createCoalescedRefresher(async () => {
      const [categoriesData, productsData, recipesData] = await Promise.all([
        db.getCategories(),
        db.getProducts(),
        db.getRecipes()
      ]);
      setCategories(categoriesData);
      setProducts(productsData);
      if (recipesData) setRecipes(recipesData);
      try {
        localStorage.setItem('ava_pos_cache_categories', JSON.stringify(categoriesData));
        localStorage.setItem('ava_pos_cache_products', JSON.stringify(productsData));
      } catch (_) {}
    }, 800, 3000);
    const unsubMenu = onRealtimeEvent('menu_update', () => reloadMenu());
    // Dự phòng: tự làm mới thực đơn mỗi 60 phút (thay đổi thực đơn đã được báo ngay qua realtime)
    const menuTimer = setInterval(() => reloadMenu(), 60 * 60 * 1000);

    let lastRefresh = 0;
    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastRefresh < 2500) return;
        lastRefresh = now;
        scheduleRefresh();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleWakeup);
      window.addEventListener('focus', handleWakeup);
      window.addEventListener('online', handleWakeup);
    }

    return () => {
      scheduleRefresh.cancel();
      unsubTables();
      unsubOrders();
      unsubMenu();
      reloadMenu.cancel();
      clearInterval(menuTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleWakeup);
        window.removeEventListener('focus', handleWakeup);
        window.removeEventListener('online', handleWakeup);
      }
    };
  }, []);

  // Tính đơn giá theo hình thức (Mang về vs Ngồi lại)
  const getProductPrice = (prod: any) => {
    const isTakeaway = selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve';
    if (isTakeaway) {
      return Number(prod.takeaway_price ?? prod.gia_mang_ve ?? prod.price ?? 0);
    }
    return Number(prod.dinein_price ?? prod.gia_ngoi_lai ?? prod.price ?? 0);
  };

  // --- LÓGIC CART ---
  const addToCart = (product: any) => {
    if (product.status === 'Hết hàng') {
      toast.error(`Món "${product.name}" hiện đang tạm hết hàng!`);
      return;
    }
    const unitPrice = getProductPrice(product);

    // Tự động gán ly mặc định chuẩn xác của món (dựa trên công thức + bảng quy chuẩn 0ms)
    const defaultCupId = getDefaultCupId(product.id, product.name, recipes);
    const defaultNotes = defaultCupId ? `[Ly: ${defaultCupId}]` : '';

    setCart((prev) => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product_id === product.id 
            ? { ...item, price: unitPrice, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * unitPrice }
            : item
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        price: unitPrice,
        quantity: 1,
        subtotal: unitPrice,
        cup_id: defaultCupId,
        notes: defaultNotes
      }];
    });
  };

  const updateQuantity = (productId: string, amount: number) => {
    setCart((prev) => {
      return prev.map(item => {
        if (item.product_id === productId) {
          const newQty = Math.max(0, item.quantity + amount);
          return {
            ...item,
            quantity: newQty,
            subtotal: newQty * item.price
          };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const handleCycleCupType = (index: number) => {
    setCart(prev => {
      const next = [...prev];
      const item = next[index];
      if (!item) return prev;

      let nextCupId: string | undefined;
      let cupLabel = '';
      if (!item.cup_id || item.cup_id === 'ing_lytrang') {
        nextCupId = 'ing_lyden';
        cupLabel = 'Ly Đen';
      } else if (item.cup_id === 'ing_lyden') {
        nextCupId = 'ing_lyhoavan';
        cupLabel = 'Ly Hoa Văn';
      } else {
        nextCupId = 'ing_lytrang';
        cupLabel = 'Ly Trắng';
      }

      let cleanNotes = (item.notes || '').replace(/\[Ly:\s*ing_ly[a-z]+\]/g, '').replace(/\(Nóng\)/g, '').replace(/\(Làm nóng\)/g, '').trim();
      const updatedNotes = cleanNotes 
        ? `${cleanNotes} [Ly: ${nextCupId}]`
        : `[Ly: ${nextCupId}]`;

      next[index] = {
        ...item,
        cup_id: nextCupId,
        notes: updatedNotes
      };
      toast.info(`Đã đổi: ${item.name} ➔ ${cupLabel}`);
      return next;
    });
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setDiscountType('amount');
    setOrderNotes('');
  };

  const totalCartAmount = cart.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);

  const safeDiscountValue = Math.max(0, Number(discountValue) || 0);
  const discountAmount = discountType === 'amount'
    ? Math.min(totalCartAmount, safeDiscountValue)
    : Math.min(totalCartAmount, Math.round((totalCartAmount * Math.min(100, safeDiscountValue)) / 100));

  const finalTotalAmount = Math.max(0, totalCartAmount - discountAmount);

  // --- TÍNH TOÁN TỔNG CỘNG ---
  const existingItemsCount = existingOrderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const displayTotalItems = (existingOrder ? existingItemsCount : 0) + cartItemsCount;
  const existingOrderTotal = existingOrder ? Number(existingOrder.total_amount || 0) : 0;
  const displayTotalAmount = (existingOrder ? existingOrderTotal : 0) + finalTotalAmount;

  // Chỉ áp dụng kết quả tải của lần chọn bàn MỚI NHẤT (bấm nhanh bàn A rồi bàn B không bị hiện lẫn món)
  const selectTableRequestRef = useRef(0);
  // Mã đơn ổn định khi bấm lại sau lỗi mạng -> không tạo đơn trùng
  const pendingOrderRef = useRef<{ key: string; id: string } | null>(null);
  const getStableOrderId = (key: string) => {
    if (pendingOrderRef.current?.key === key) return pendingOrderRef.current.id;
    const id = generateShortId('ord_');
    pendingOrderRef.current = { key, id };
    return id;
  };
  const cartKey = (items: CartItem[]) =>
    items.map(i => `${i.product_id}|${i.quantity}|${i.price}|${i.notes || ''}`).sort().join(';');

  // Gửi lệnh in chạy nền: không bắt nhân viên đứng chờ máy in (có thể mất vài giây qua Wi-Fi)
  const printInBackground = (orderData: Parameters<typeof printOrderDirect>[0]) => {
    printOrderDirect(orderData).catch(printErr => {
      console.warn('Lỗi gửi lệnh in từ điện thoại:', printErr);
      toast.error('⚠️ Chưa gửi được lệnh in tới máy POS. Vui lòng kiểm tra Wi-Fi / máy in.');
    });
  };

  // Chọn bàn
  const handleSelectTable = async (table: any) => {
    const requestId = ++selectTableRequestRef.current;
    setSelectedTable(table);
    setPosStep('menu');
    setCart([]);
    setOrderNotes('');
    setDiscountValue(0);
    setDiscountType('amount');
    setIsQuickPayOpen(false);
    setIsPayModalOpen(false);

    const isTakeaway = table.table_name === 'Khách mang về' || table.id === 'tb_mangve';
    let cachedMatch = unpaidOrders.find(o => o.table_id === table.id);
    const isOccupied = !isTakeaway && (table.status === 'Đang phục vụ' || !!cachedMatch);

    // Loại ly của từng món được xác định lại theo công thức định lượng hiện hành
    const withCup = (items: any[]) => (items || []).map((i: any) => ({
      ...i,
      cup_id: resolveItemCupId(i.product_id || i.idsp, i.name || i.ten_san_pham, i.ghi_chu || i.notes, i.cup_id, recipes)
    }));

    if (isOccupied) {
      if (cachedMatch) {
        setExistingOrder(cachedMatch);
        if (cachedMatch.order_items && Array.isArray(cachedMatch.order_items) && cachedMatch.order_items.length > 0) {
          setExistingOrderItems(withCup(cachedMatch.order_items));
        }
      } else {
        setExistingOrder(null);
        setExistingOrderItems([]);
      }

      setLoadingExistingOrder(true);
      try {
        // Luôn đối chiếu lại với server (1 truy vấn) để đủ 100% món, kể cả khi đơn vừa được thanh toán ở máy khác
        const res = await db.getUnpaidOrderByTableId(table.id);
        if (selectTableRequestRef.current !== requestId) return; // Nhân viên đã chọn bàn khác
        if (res?.order) {
          setExistingOrder(res.order);
          setExistingOrderItems(withCup(res.items || []));
        } else {
          setExistingOrder(null);
          setExistingOrderItems([]);
        }
      } catch (e) {
        console.error('Lỗi khi tải đơn đang phục vụ của bàn:', e);
      } finally {
        if (selectTableRequestRef.current === requestId) {
          setLoadingExistingOrder(false);
        }
      }
    } else {
      setExistingOrder(null);
      setExistingOrderItems([]);
      setLoadingExistingOrder(false);
    }
  };

  // Hủy hóa đơn đang phục vụ
  const handleCancelExistingOrder = async () => {
    if (!existingOrder) return;
    const confirmCancel = window.confirm(`Bạn có chắc chắn muốn hủy hóa đơn của ${selectedTable?.table_name || 'bàn này'} không?`);
    if (!confirmCancel) return;

    try {
      const success = await db.cancelOrder(existingOrder.id);
      if (success) {
        toast.success(`Đã hủy hóa đơn của ${selectedTable?.table_name || 'bàn'}!`);
        setIsQuickPayOpen(false);
        setExistingOrder(null);
        setExistingOrderItems([]);
        clearCart();
        setSelectedTable(null);
        setPosStep('table');
        await refreshTables();
      } else {
        toast.error("Không thể hủy hóa đơn này.");
      }
    } catch (err) {
      console.error("Lỗi khi hủy hóa đơn tại POS:", err);
      toast.error("Gặp lỗi khi hủy hóa đơn.");
    }
  };

  // Xử lý thanh toán trực tiếp từ điện thoại
  const handlePayInPos = async (method: 'Tiền mặt' | 'Chuyển khoản') => {
    if (submittingPayment) return;
    setSubmittingPayment(true);

    try {
      let orderIdToPay = existingOrder?.id;

      if (cart.length > 0) {
        const savedOrder = await db.createOrder({
          id: existingOrder ? undefined : getStableOrderId(`pay|${selectedTable?.id || ''}|${cartKey(cart)}|${finalTotalAmount}`),
          table_id: selectedTable?.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: finalTotalAmount,
          discount: discountAmount,
          notes: orderNotes.trim(),
          items: cart
        });
        if (savedOrder?.id) {
          orderIdToPay = savedOrder.id;
        }
      }

      if (!orderIdToPay) {
        toast.error('Không tìm thấy mã hóa đơn để thanh toán!');
        return;
      }

      await db.payOrder(orderIdToPay, method);
      pendingOrderRef.current = null;

      // In hóa đơn: CHỈ in nếu là đơn tạo mới và thanh toán ngay lập tức (cart.length > 0 && !existingOrder)
      // Nếu là bàn đã gọi món và lưu từ trước (existingOrder) thì tuyệt đối không in lại khi ấn thanh toán
      // (gửi lệnh in chạy nền, không bắt nhân viên chờ)
      if (cart.length > 0 && !existingOrder) {
        printInBackground({
          tableName: selectedTable?.table_name || 'Khách mang về',
          staffName: currentUser?.full_name || 'Nhân viên',
          orderId: orderIdToPay,
          items: cart.map(i => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            subtotal: i.subtotal,
            notes: i.notes
          })),
          totalAmount: displayTotalAmount,
          discount: discountAmount,
          notes: orderNotes.trim() ? `${orderNotes.trim()} (ĐÃ THANH TOÁN)` : '(ĐÃ THANH TOÁN)'
        });
      }

      confetti({
        particleCount: 120,
        spread: 70,
        colors: ['#4A3525', '#FFE4C4', '#FFFDD0', '#8C6A5C']
      });

      toast.success(`Thanh toán thành công ${selectedTable?.table_name} qua ${method}!`);
      setIsPayModalOpen(false);
      setIsQuickPayOpen(false);
      clearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
      setSelectedTable(null);
      setPosStep('table');
      refreshTables();
    } catch (e: any) {
      console.error('Lỗi thanh toán tại POS:', e);
      toast.error(`Thanh toán CHƯA thành công (${e?.message || 'lỗi kết nối'}). Vui lòng bấm lại.`);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // XÁC NHẬN ĐƠN HÀNG (LƯU ĐƠN / GỬI BẾP)
  const handleConfirmOrder = async () => {
    if (isSavingRef.current) return;
    if (!selectedTable || cart.length === 0) return;
    isSavingRef.current = true;
    setSavingOrder(true);

    const oldTables = [...tables];
    if (selectedTable?.table_name !== 'Khách mang về') {
      setTables(prev => prev.map(tb => 
        tb.id === selectedTable?.id ? { ...tb, status: 'Đang phục vụ' } : tb
      ));
    }

    try {
      const savedOrder = await db.createOrder({
        id: existingOrder ? undefined : getStableOrderId(`save|${selectedTable?.id || ''}|${cartKey(cart)}|${finalTotalAmount}`),
        table_id: selectedTable?.id || 'tb_mangve',
        staff_id: currentUser?.id || 'admin',
        total_amount: finalTotalAmount,
        discount: discountAmount,
        notes: orderNotes.trim(),
        items: cart
      });
      pendingOrderRef.current = null;

      // Tự động in phiếu order ra máy in quầy POS qua Wi-Fi (chạy nền, không bắt nhân viên chờ)
      printInBackground({
        tableName: selectedTable?.table_name || 'Khách mang về',
        staffName: currentUser?.full_name || 'Nhân viên',
        orderId: savedOrder?.id || `OD-${Date.now()}`,
        items: cart.map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          subtotal: i.subtotal
        })),
        totalAmount: finalTotalAmount,
        discount: discountAmount,
        notes: orderNotes.trim() ? `${orderNotes.trim()} (LƯU ĐƠN)` : '(LƯU ĐƠN)'
      });

      if (selectedTable?.table_name !== 'Khách mang về') {
        const activeOrderData = savedOrder || {
          id: savedOrder?.id || `OD-${Date.now()}`,
          table_id: selectedTable?.id,
          total_amount: finalTotalAmount,
          discount: discountAmount,
          payment_status: 'Chưa thanh toán',
          notes: orderNotes.trim(),
          tables: { table_name: selectedTable?.table_name },
          users: { full_name: currentUser?.full_name || 'Nhân viên' },
          created_at: new Date().toISOString(),
          order_items: cart.map(i => ({
            product_id: i.product_id,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            subtotal: i.subtotal,
            notes: i.notes
          }))
        };
        setUnpaidOrders(prev => [activeOrderData, ...prev.filter(o => o.id !== activeOrderData.id)]);
        setTables(prev => prev.map(tb => tb.id === selectedTable?.id ? { ...tb, status: 'Đang phục vụ' } : tb));
      }

      toast.success(`Đã lưu đơn & gửi bếp cho ${selectedTable?.table_name || 'bàn'}!`);
      clearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
      setSelectedTable(null);
      setPosStep('table');
      refreshTables();
    } catch (e: any) {
      console.error('Lỗi lưu đơn hàng:', e);
      setTables(oldTables);
      toast.error(`Chưa lưu được đơn (${e?.message || 'lỗi kết nối'}). Món vẫn còn trong giỏ, vui lòng thử lại!`);
    } finally {
      isSavingRef.current = false;
      setSavingOrder(false);
    }
  };

  // Lọc sản phẩm
  const filteredProducts = products
    .filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategoryId === 'all' || product.category_id === selectedCategoryId;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const salesA = yesterdaySales[a.id] || 0;
      const salesB = yesterdaySales[b.id] || 0;
      if (salesB !== salesA) return salesB - salesA;

      const categorySortOrder: { [key: string]: number } = {
        'c_caphe': 1,
        'c_tra': 2,
        'c_yaourt': 3,
        'c_douongkhac': 4,
        'c_soda': 5,
        'c_nuocep': 6,
        'c_nuocngot': 7,
        'c_topping': 8,
        'c_monan': 9
      };
      const orderA = categorySortOrder[a.category_id] || 99;
      const orderB = categorySortOrder[b.category_id] || 99;
      if (orderA !== orderB) return orderA - orderB;

      return a.name.localeCompare(b.name, 'vi');
    });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-coffee-primary animate-spin" />
        <p className="text-coffee-medium font-medium text-sm">Đang tải bàn & thực đơn AVA Coffee...</p>
      </div>
    );
  }

  const isTakeaway = selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve';

  return (
    <div className="w-full h-full flex flex-col bg-[#FAF6F0] overflow-hidden">
      {/* THANH TOP BAR CỐ ĐỊNH - ĐẢM BẢO 100% NẰM NGOÀI TAI THỎ / DYNAMIC ISLAND / STATUS BAR */}
      <header 
        className="w-full shrink-0 bg-[#FAF6F0] border-b border-coffee-light/60 px-3 sm:px-4 pb-2 z-40"
        style={{
          paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 48px) + 6px)'
        }}
      >
        {!selectedTable ? (
          <div className="flex items-center justify-between gap-2">
            <Link 
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-black hover:bg-coffee-light active:bg-gray-100 transition shadow-2xs active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              <span>Về Trang chủ</span>
            </Link>

            <div className="flex items-center space-x-2">
              <div className="text-right">
                <p className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">Nhân viên order</p>
                <p className="text-xs font-black text-coffee-dark truncate max-w-[120px]">{currentUser?.full_name || 'Nhân viên'}</p>
              </div>
              {onSwitchToDesktop && (
                <button
                  onClick={onSwitchToDesktop}
                  className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-coffee-light text-coffee-dark border border-coffee-light rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                  title="Chuyển sang giao diện máy POS cảm ứng tại quầy"
                >
                  <Monitor className="w-3.5 h-3.5 text-coffee-primary" />
                  <span>Máy POS</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white p-2.5 sm:p-3 rounded-2xl shadow-xs border border-coffee-light flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <button 
                type="button"
                onClick={() => {
                  if (posStep === 'menu') {
                    // Còn món chưa lưu -> hỏi lại, tránh bấm nhầm làm mất món vừa chọn
                    if (cart.length > 0 && !window.confirm(
                      `${selectedTable?.table_name || 'Bàn này'} còn ${cart.reduce((s, i) => s + i.quantity, 0)} món CHƯA LƯU. Bỏ các món này và đổi bàn?`
                    )) {
                      return;
                    }
                    setPosStep('table');
                    setSelectedTable(null);
                    setExistingOrder(null);
                    setExistingOrderItems([]);
                    clearCart();
                  } else if (posStep === 'summary') {
                    setPosStep('menu');
                  }
                }}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 border border-gray-200 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer shrink-0"
                title="Quay lại chọn bàn khác"
              >
                <ArrowLeft className="w-4 h-4 text-coffee-primary stroke-[2.5]" />
                <span>Đổi bàn</span>
              </button>

              <div>
                <div className="flex items-center space-x-1.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                    isTakeaway 
                      ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isTakeaway ? 'MANG VỀ' : 'NGỒI LẠI'}
                  </span>
                  <span className="text-[9px] font-semibold text-coffee-medium truncate max-w-[85px]">
                    {selectedTable?.status === 'Đang phục vụ' ? 'Đang có đơn' : 'Bàn mới'}
                  </span>
                </div>
                <h2 className="font-black text-sm sm:text-base text-coffee-dark leading-tight mt-0.5">
                  {selectedTable?.table_name || ''}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {existingOrder ? (
                <button
                  type="button"
                  onClick={() => setIsQuickPayOpen(true)}
                  className="flex items-center space-x-2 p-1.5 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-left transition shadow-xs active:scale-95 cursor-pointer"
                >
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-amber-800 uppercase tracking-wider">Hóa đơn</p>
                    <p className="font-black text-coffee-dark text-xs sm:text-sm">
                      {displayTotalAmount.toLocaleString('vi-VN')}đ
                    </p>
                  </div>
                  <div className="p-1.5 bg-coffee-primary text-white rounded-lg relative shadow-xs">
                    <CreditCard className="w-3.5 h-3.5 text-coffee-accent" />
                    {displayTotalItems > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow">
                        {displayTotalItems}
                      </span>
                    )}
                  </div>
                </button>
              ) : (
                <div 
                  onClick={() => {
                    if (cart.length > 0) setIsMobileCartOpen(true);
                  }}
                  className="flex items-center space-x-2 cursor-pointer p-1.5 px-2 bg-[#FAF6F0] rounded-xl border border-coffee-light active:scale-95 transition"
                >
                  <div className="text-right pl-1">
                    <p className="text-[9px] text-coffee-medium font-bold uppercase tracking-wider">Giỏ hàng</p>
                    <p className="font-black text-coffee-dark text-xs">{totalCartAmount.toLocaleString('vi-VN')}đ</p>
                  </div>
                  <div className="p-1.5 bg-coffee-accent rounded-lg text-coffee-dark relative">
                    <ShoppingCart className="w-4 h-4" />
                    {cart.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* VÙNG CUỘN NỘI DUNG RIÊNG BIỆT CHO ĐIỆN THOẠI */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 px-3 sm:px-4 pt-2 pb-32">
        {/* BƯỚC 1: CHỌN BÀN */}
        {posStep === 'table' && (
          <div className="space-y-3">
            <div className="bg-white px-3.5 py-2.5 rounded-2xl shadow-2xs border border-coffee-light flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="font-bold text-xs sm:text-sm text-coffee-primary flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-coffee-medium" />
                  <span>Bước 1: Chọn Bàn hoặc Khách mang về</span>
                </h3>
                <p className="text-[10px] text-coffee-medium">
                  Chạm bàn để mở menu order hoặc xem lại đơn đang phục vụ
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-coffee-accent/20 text-coffee-dark">
                {tables.length} bàn
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {[...tables]
                .sort((a, b) => {
                  if (a.table_name === 'Khách mang về') return -1;
                  if (b.table_name === 'Khách mang về') return 1;
                  return a.table_name.localeCompare(b.table_name, 'vi', { numeric: true });
              })
              .map((table) => {
                const isTbTakeaway = table.table_name === 'Khách mang về' || table.id === 'tb_mangve';
                const unpaidMatch = unpaidOrders.find(o => o.table_id === table.id);
                const isOccupied = !isTbTakeaway && (table.status === 'Đang phục vụ' || !!unpaidMatch);
                const displayStatus = isTbTakeaway ? 'Mang về' : isOccupied ? 'Đang phục vụ' : 'Trống';

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`relative p-3 sm:p-3.5 rounded-2xl border text-left flex flex-col justify-between h-28 sm:h-32 transition-all duration-150 active:scale-95 shadow-2xs ${
                      isTbTakeaway
                        ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-300/40'
                        : isOccupied
                        ? 'bg-amber-50/50 border-amber-300 shadow-inner'
                        : 'bg-white border-coffee-light hover:border-coffee-accent'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isTbTakeaway
                          ? 'bg-amber-200 text-amber-900 font-black'
                          : isOccupied 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {displayStatus}
                      </span>
                      {!isTbTakeaway && (
                        <span className="text-[10px] text-coffee-medium flex items-center space-x-1 font-semibold">
                          <Users className="w-3 h-3" />
                          <span>{table.capacity}</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 mt-1">
                      <h4 className="font-black text-base text-coffee-dark tracking-tight line-clamp-1">
                        {table.table_name}
                      </h4>
                      <p className="text-[10px] text-coffee-medium line-clamp-1 font-medium">
                        {isOccupied && unpaidMatch
                          ? `${Number(unpaidMatch.total_amount || 0).toLocaleString('vi-VN')}đ • Đang phục vụ`
                          : isOccupied
                          ? 'Đang có khách • Bấm để xem'
                          : isTbTakeaway
                          ? 'Giá bán mang về • Bấm để bán'
                          : 'Bàn trống • Bán mới'}
                      </p>
                    </div>

                    <div className="self-end text-coffee-medium/40">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* BƯỚC 2: CHỌN MÓN */}
      {posStep === 'menu' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Menu bên trái (2/3 chiều rộng) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Thanh Tìm Kiếm & Lọc Danh Mục */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-coffee-light space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-coffee-medium absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Tìm kiếm món trong thực đơn..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#FAF6F0] pl-10 pr-4 py-2.5 rounded-xl text-xs border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark placeholder-coffee-medium outline-none"
                />
              </div>

              {/* Lọc danh mục cuộn ngang mượt mà cho điện thoại */}
              <div className="flex overflow-x-auto pb-1 gap-1.5 no-scrollbar -mx-1 px-1">
                <button
                  onClick={() => setSelectedCategoryId('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                    selectedCategoryId === 'all'
                      ? 'bg-coffee-primary text-white shadow-xs'
                      : 'bg-[#FAF6F0] text-coffee-medium hover:bg-coffee-light'
                  }`}
                >
                  Tất cả
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                      selectedCategoryId === cat.id
                        ? 'bg-coffee-primary text-white shadow-xs'
                        : 'bg-[#FAF6F0] text-coffee-medium hover:bg-coffee-light'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách món ăn dạng lưới */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
              {filteredProducts.map((prod) => {
                const isOutOfStock = prod.status === 'Hết hàng';
                const cartQty = cart.find(item => item.product_id === prod.id)?.quantity || 0;
                const unitPrice = getProductPrice(prod);

                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-2xl overflow-hidden border border-coffee-light flex flex-col shadow-xs transition-all relative ${
                      isOutOfStock ? 'opacity-50' : 'active:scale-98'
                    }`}
                  >
                    {/* Hình ảnh sản phẩm (có fallback logo AVA) */}
                    <div 
                      onClick={() => !isOutOfStock && addToCart(prod)}
                      className="relative h-24 sm:h-36 bg-[#FAF6F0] overflow-hidden cursor-pointer"
                    >
                      <img
                        src={prod.image_url || '/logo.jpg'}
                        alt={prod.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo.jpg';
                        }}
                      />
                      {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xs">
                          Tạm hết
                        </div>
                      )}
                      
                      {cartQty > 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-coffee-accent text-coffee-dark font-black text-xs w-6 h-6 rounded-full flex items-center justify-center shadow border-2 border-white">
                          {cartQty}
                        </div>
                      )}
                    </div>

                    {/* Chi tiết sản phẩm */}
                    <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between space-y-1.5">
                      <div>
                        <h4 
                          onClick={() => !isOutOfStock && addToCart(prod)}
                          className="font-black text-coffee-dark text-xs sm:text-sm leading-snug line-clamp-2 cursor-pointer"
                        >
                          {prod.name}
                        </h4>
                        <p className="text-[9px] text-coffee-medium flex items-center mt-0.5">
                          <Tag className="w-2.5 h-2.5 mr-0.5 shrink-0" />
                          <span className="truncate">{categories.find(c => c.id === prod.category_id)?.name}</span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 gap-1.5">
                        <span className="font-black text-xs sm:text-sm text-coffee-primary shrink-0">
                          {unitPrice.toLocaleString('vi-VN')}đ
                        </span>

                        {isOutOfStock ? (
                          <span className="text-[10px] text-red-500 font-bold uppercase">Hết món</span>
                        ) : cartQty > 0 ? (
                          <div className="flex items-center bg-[#FAF6F0] rounded-xl border border-coffee-accent/40 shadow-xs h-9 overflow-hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateQuantity(prod.id, -1);
                              }}
                              className="w-8 h-9 flex items-center justify-center text-coffee-primary active:bg-coffee-accent/20 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                            <span className="px-2 font-black text-xs text-coffee-dark min-w-[20px] text-center">
                              {cartQty}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(prod);
                              }}
                              className="w-8 h-9 flex items-center justify-center text-coffee-primary active:bg-coffee-accent/20 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(prod);
                            }}
                            className="px-3.5 py-2 bg-[#4A3525] hover:bg-[#382513] active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Thêm</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-12 text-center text-coffee-medium space-y-2">
                  <Coffee className="w-10 h-10 mx-auto opacity-30 animate-pulse" />
                  <p className="font-bold text-sm">Không tìm thấy món ăn phù hợp</p>
                  <p className="text-xs">Thử tìm kiếm với từ khóa khác</p>
                </div>
              )}
            </div>
          </div>

          {/* GIỎ HÀNG BÊN PHẢI (HIỂN THỊ TRÊN MÀN HÌNH MÁY TÍNH / IPAD) */}
          <div className="hidden lg:flex bg-white rounded-2xl p-5 shadow-xs border border-coffee-light flex flex-col min-h-[480px]">
            <h3 className="font-bold text-base text-coffee-dark border-b border-coffee-light pb-3 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-coffee-medium" />
                <span>Đơn món - {selectedTable?.table_name || ''}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                {isTakeaway ? 'Mang về' : 'Ngồi lại'}
              </span>
            </h3>

            <div className="flex-1 overflow-y-auto max-h-[300px] py-3 space-y-3">
              {cart.map((item, idx) => (
                <div key={`${item.product_id}-${idx}`} className="flex items-center justify-between text-xs pb-2 border-b border-dashed border-coffee-light/60">
                  <div className="space-y-0.5 flex-1 pr-2">
                    <p className="font-bold text-coffee-dark line-clamp-1">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-coffee-medium">{item.price.toLocaleString('vi-VN')}đ</span>
                      {item.cup_id && (
                      <button
                        type="button"
                        onClick={() => handleCycleCupType(idx)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border transition active:scale-95 ${
                          item.cup_id === 'ing_lyden'
                            ? 'bg-amber-950 text-amber-200 border-amber-800'
                            : item.cup_id === 'ing_lyhoavan'
                            ? 'bg-pink-100 text-pink-700 border-pink-300'
                            : 'bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200'
                        }`}
                        title="Bấm để đổi loại ly (Nóng/Hoa văn/Trắng)"
                      >
                        {item.cup_id === 'ing_lyden' ? '☕ Ly Đen' : item.cup_id === 'ing_lyhoavan' ? '🌸 Hoa Văn' : '🥤 Ly Trắng'}
                      </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-[#FAF6F0] rounded-lg border border-coffee-light overflow-hidden">
                      <button
                        onClick={() => updateQuantity(item.product_id, -1)}
                        className="p-1 hover:bg-coffee-accent/20 text-coffee-primary"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-1.5 font-bold text-coffee-dark min-w-[14px] text-center text-xs">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product_id, 1)}
                        className="p-1 hover:bg-coffee-accent/20 text-coffee-primary"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-extrabold text-coffee-dark w-16 text-right text-xs">
                      {item.subtotal.toLocaleString('vi-VN')}đ
                    </span>
                    
                    <button 
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center py-16 text-center text-coffee-medium/60 space-y-2">
                  <ShoppingCart className="w-10 h-10 opacity-30" />
                  <p className="font-bold text-xs">Chưa chọn món nào</p>
                  <p className="text-[10px]">Bấm vào sản phẩm bên trái để thêm vào đơn</p>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-coffee-light pt-3 space-y-3">
                <input
                  type="text"
                  placeholder="Ghi chú đơn (ví dụ: ít ngọt, mang về...)"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full h-8 px-2.5 bg-[#FAF6F0] border border-coffee-light rounded-xl text-xs text-coffee-dark outline-none"
                />

                <div className="flex justify-between items-center text-xs text-coffee-medium">
                  <span>Tổng tiền món:</span>
                  <span className="font-bold text-coffee-dark">{totalCartAmount.toLocaleString('vi-VN')}đ</span>
                </div>

                <div className="flex justify-between items-center border-t border-coffee-light/50 pt-2">
                  <span className="text-xs text-coffee-dark font-extrabold">Cần thu:</span>
                  <span className="text-lg font-black text-coffee-primary">
                    {finalTotalAmount.toLocaleString('vi-VN')}đ
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleConfirmOrder}
                    disabled={savingOrder}
                    className="py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1"
                  >
                    {savingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Lưu & Gửi bếp</span>}
                  </button>
                  <button
                    onClick={() => setIsPayModalOpen(true)}
                    className="py-2.5 bg-coffee-accent hover:bg-coffee-accent/80 text-coffee-dark font-black text-xs rounded-xl shadow-xs transition"
                  >
                    Thanh toán
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* THANH GIỎ HÀNG DÍNH DƯỚI ĐÁY TRÊN ĐIỆN THOẠI (STICKY BOTTOM BAR) */}
      {cart.length > 0 && posStep === 'menu' && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-coffee-light px-4 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between z-40 shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
          <div>
            <span className="text-[10px] text-coffee-medium block">
              {selectedTable?.table_name} ({isTakeaway ? 'Mang về' : 'Ngồi lại'})
            </span>
            <span className="font-black text-sm text-coffee-primary">
              {cart.reduce((sum, item) => sum + item.quantity, 0)} món • {totalCartAmount.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <button 
            onClick={() => setIsMobileCartOpen(true)}
            className="px-4 py-2 bg-coffee-primary active:bg-coffee-dark text-white font-black text-xs rounded-xl shadow-sm transition flex items-center space-x-1.5"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-coffee-accent" />
            <span>Xem giỏ hàng</span>
          </button>
        </div>
      )}

      {/* MOBILE DRAWER GIỎ HÀNG (VUỐT / BẬT LÊN TỪ ĐÁY MÀN HÌNH ĐIỆN THOẠI) */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setIsMobileCartOpen(false)} />
          <div 
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl p-5 pt-4 z-50 transition-all duration-200"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="w-10 h-1 bg-coffee-light rounded-full mx-auto mb-3 shrink-0" onClick={() => setIsMobileCartOpen(false)} />
            
            <h3 className="font-bold text-sm text-coffee-dark border-b border-coffee-light pb-2.5 flex items-center justify-between shrink-0">
              <span className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-coffee-medium" />
                <span>Đơn món - {selectedTable?.table_name || ''}</span>
              </span>
              <button 
                onClick={() => setIsMobileCartOpen(false)} 
                className="text-xs text-coffee-medium font-bold hover:text-coffee-primary px-2 py-1"
              >
                Đóng
              </button>
            </h3>

            <div className="flex-1 overflow-y-auto py-2 space-y-2.5 my-1">
              {cart.map((item, idx) => (
                <div key={`${item.product_id}-${idx}`} className="flex items-center justify-between text-xs pb-2 border-b border-dashed border-coffee-light/60">
                  <div className="space-y-0.5 flex-1 pr-2">
                    <p className="font-bold text-coffee-dark">{item.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-coffee-medium">{item.price.toLocaleString('vi-VN')}đ</span>
                      {item.cup_id && (
                      <button
                        type="button"
                        onClick={() => handleCycleCupType(idx)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border transition active:scale-95 ${
                          item.cup_id === 'ing_lyden'
                            ? 'bg-amber-950 text-amber-200 border-amber-800'
                            : item.cup_id === 'ing_lyhoavan'
                            ? 'bg-pink-100 text-pink-700 border-pink-300'
                            : 'bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200'
                        }`}
                        title="Bấm để đổi loại ly (Nóng/Hoa văn/Trắng)"
                      >
                        {item.cup_id === 'ing_lyden' ? '☕ Ly Đen' : item.cup_id === 'ing_lyhoavan' ? '🌸 Hoa Văn' : '🥤 Ly Trắng'}
                      </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-[#FAF6F0] rounded-lg border border-coffee-light overflow-hidden">
                      <button
                        onClick={() => updateQuantity(item.product_id, -1)}
                        className="p-1 hover:bg-coffee-accent/20 text-coffee-primary"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-bold text-coffee-dark min-w-[14px] text-center text-xs">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product_id, 1)}
                        className="p-1 hover:bg-coffee-accent/20 text-coffee-primary"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-extrabold text-coffee-dark w-16 text-right text-xs">
                      {item.subtotal.toLocaleString('vi-VN')}đ
                    </span>
                    <button 
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-coffee-light pt-3 space-y-2.5 bg-white shrink-0">
              <input
                type="text"
                placeholder="Ghi chú đơn (ví dụ: ít ngọt, nhiều đá...)"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full h-8 px-2.5 bg-[#FAF6F0] border border-coffee-light rounded-xl text-xs text-coffee-dark outline-none"
              />

              <div className="flex justify-between items-center text-xs text-coffee-medium">
                <span>Tổng tiền:</span>
                <span className="font-black text-coffee-primary text-base">{totalCartAmount.toLocaleString('vi-VN')}đ</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={async () => {
                    setIsMobileCartOpen(false);
                    await handleConfirmOrder();
                  }}
                  disabled={savingOrder}
                  className="py-2.5 bg-coffee-primary active:bg-coffee-dark text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1"
                >
                  {savingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Lưu & Gửi bếp</span>}
                </button>
                <button
                  onClick={() => {
                    setIsMobileCartOpen(false);
                    setIsPayModalOpen(true);
                  }}
                  className="py-2.5 bg-coffee-accent active:bg-coffee-accent/80 text-coffee-dark font-black text-xs rounded-xl shadow-xs transition"
                >
                  Thanh toán ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HÓA ĐƠN & THANH TOÁN CHO BÀN ĐANG PHỤC VỤ */}
      {isQuickPayOpen && existingOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs p-3 flex justify-center items-center">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-coffee-light overflow-hidden">
            <div className="p-4 bg-[#FAF6F0] border-b border-coffee-light flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-coffee-primary text-white rounded-lg">
                  <CreditCard className="w-4 h-4 text-coffee-accent" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-coffee-dark">{selectedTable?.table_name}</h3>
                  <p className="text-[10px] text-coffee-medium">Đang phục vụ</p>
                </div>
              </div>
              <button onClick={() => setIsQuickPayOpen(false)} className="p-1.5 text-coffee-medium hover:text-coffee-dark">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              <div className="space-y-1.5 border border-coffee-light rounded-xl p-3 bg-white divide-y divide-coffee-light/50">
                {loadingExistingOrder ? (
                  <div className="py-4 flex justify-center">
                    <Loader2 className="w-4 h-4 text-coffee-primary animate-spin" />
                  </div>
                ) : existingOrderItems.length === 0 ? (
                  <p className="text-[11px] text-coffee-medium italic py-1">Không có món ăn trong đơn.</p>
                ) : (
                  existingOrderItems.map((item) => {
                    const cupId = resolveItemCupId(item.product_id || item.idsp, item.products?.name || item.ten_san_pham, item.ghi_chu || item.notes, item.cup_id, recipes);
                    return (
                      <div key={item.id} className="flex justify-between items-center py-1.5 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-coffee-dark">{item.products?.name || item.ten_san_pham || 'Món'}</p>
                            {cupId && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${
                                cupId === 'ing_lyden'
                                  ? 'bg-amber-950 text-amber-200 border-amber-800'
                                  : cupId === 'ing_lyhoavan'
                                  ? 'bg-pink-100 text-pink-700 border-pink-300'
                                  : 'bg-stone-100 text-stone-700 border-stone-300'
                              }`}>
                                {cupId === 'ing_lyden' ? '☕ Ly Đen' : cupId === 'ing_lyhoavan' ? '🌸 Hoa Văn' : '🥤 Ly Trắng'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-coffee-medium">{item.quantity} x {Number(item.unit_price || 0).toLocaleString('vi-VN')}đ</p>
                        </div>
                        <span className="font-black text-coffee-dark">{Number(item.subtotal || 0).toLocaleString('vi-VN')}đ</span>
                      </div>
                    );
                  })
                )}
              </div>

              {cart.length > 0 && (
                <div className="space-y-1.5 border border-emerald-200 bg-emerald-50/30 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-emerald-800 uppercase">Món mới chọn thêm (+{cart.length})</p>
                  {cart.map((item, idx) => (
                    <div key={`${item.product_id}-${idx}`} className="flex justify-between items-center py-1 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{item.name} x {item.quantity}</span>
                        {item.cup_id && (
                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${
                            item.cup_id === 'ing_lyden'
                              ? 'bg-amber-950 text-amber-200 border-amber-800'
                              : item.cup_id === 'ing_lyhoavan'
                              ? 'bg-pink-100 text-pink-700 border-pink-300'
                              : 'bg-stone-100 text-stone-700 border-stone-300'
                          }`}>
                            {item.cup_id === 'ing_lyden' ? '☕ Ly Đen' : item.cup_id === 'ing_lyhoavan' ? '🌸 Hoa Văn' : '🥤 Ly Trắng'}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-emerald-950">{item.subtotal.toLocaleString('vi-VN')}đ</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center border-t border-coffee-light/60 pt-2 text-sm">
                <span className="font-bold text-coffee-dark">Tổng cộng:</span>
                <span className="font-black text-coffee-primary text-base">
                  {displayTotalAmount.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            <div className="p-3 bg-white border-t border-coffee-light flex items-center justify-between gap-2 shrink-0">
              <button
                onClick={handleCancelExistingOrder}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hủy đơn</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    await printOrderDirect({
                      tableName: selectedTable?.table_name || 'Bàn',
                      staffName: currentUser?.full_name || 'Nhân viên',
                      orderId: existingOrder.id,
                      items: existingOrderItems.map(i => ({
                        name: i.products?.name || i.ten_san_pham || 'Món',
                        quantity: i.quantity || 1,
                        price: i.unit_price || 0,
                        subtotal: i.subtotal || 0,
                        notes: i.ghi_chu || i.notes
                      })),
                      totalAmount: Number(existingOrder.total_amount || 0),
                      discount: Number(existingOrder.discount || 0),
                      notes: existingOrder.notes || ''
                    }, undefined, undefined, { allowReprint: true }); // Nhân viên chủ động bấm in lại
                    toast.success('Đã gửi lệnh in bill!');
                  } catch (e) {
                    toast.error('Không thể in bill.');
                  }
                }}
                className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                title="In lại hóa đơn tạm tính"
              >
                <FileText className="w-3.5 h-3.5 text-stone-600" />
                <span>In bill</span>
              </button>

              <button
                onClick={() => setIsPayModalOpen(true)}
                className="px-4 py-2 bg-coffee-primary hover:bg-coffee-dark text-white rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-sm"
              >
                <DollarSign className="w-3.5 h-3.5 text-coffee-accent" />
                <span>Thanh toán ({displayTotalAmount.toLocaleString('vi-VN')}đ)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THANH TOÁN (TIỀN MẶT / CHUYỂN KHOẢN) */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs p-3 flex justify-center items-center">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border border-coffee-accent/40">
            <div className="flex items-center justify-between border-b border-coffee-light pb-2.5">
              <h3 className="font-black text-sm text-coffee-dark">Xác nhận thanh toán</h3>
              <button onClick={() => setIsPayModalOpen(false)} className="p-1 text-coffee-medium hover:text-coffee-dark">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#FAF6F0] p-3 rounded-xl border border-coffee-light flex justify-between items-center">
              <span className="text-xs font-semibold text-coffee-dark">{selectedTable?.table_name}:</span>
              <span className="text-base font-black text-coffee-primary">{displayTotalAmount.toLocaleString('vi-VN')}đ</span>
            </div>

            <div className="space-y-3">
              {!showTransferQr ? (
                <>
                  <p className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">Phương thức thanh toán</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => handlePayInPos('Tiền mặt')}
                      disabled={submittingPayment}
                      className="p-4 bg-coffee-cream/40 border border-coffee-accent/60 hover:bg-coffee-accent/50 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition font-bold text-coffee-dark text-xs disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      <DollarSign className="w-6 h-6 text-coffee-primary" />
                      <span>Tiền mặt</span>
                    </button>
                    <button
                      onClick={() => setShowTransferQr(true)}
                      disabled={submittingPayment}
                      className="p-4 bg-red-50 border border-red-300 hover:bg-red-100 rounded-xl flex flex-col items-center justify-center space-y-1.5 transition font-bold text-red-900 text-xs disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                      <ArrowRightLeft className="w-6 h-6 text-red-600" />
                      <span>Chuyển khoản (Techcombank)</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3 flex flex-col items-center w-full">
                  <div className="w-full p-4 bg-white rounded-2xl border-2 border-red-200 shadow-md flex flex-col items-center text-center space-y-2">
                    <div className="w-full flex items-center justify-between border-b border-red-100 pb-2">
                      <span className="text-xs font-black text-red-700 tracking-wider">TECHCOMBANK</span>
                      <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        VIETQR • NAPAS 247
                      </span>
                    </div>

                    <img
                      src="/techcombank-qr-card.png"
                      alt="Mã QR Techcombank Điểm bán AVA Coffee K300"
                      className="max-h-56 w-auto object-contain rounded-xl shadow-xs"
                    />

                    <div className="text-center space-y-0.5">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Chủ tài khoản</p>
                      <h4 className="text-sm font-black text-[#4A3525] uppercase tracking-wide">
                        {TECHCOMBANK_INFO.accountName}
                      </h4>
                      <p className="text-xs font-black text-red-600 font-mono tracking-wider">
                        STK: {TECHCOMBANK_INFO.accountNumberFormatted}
                      </p>
                    </div>

                    <div className="w-full bg-red-50 p-2 rounded-xl text-center border border-red-100">
                      <p className="text-xs text-gray-600 font-medium">
                        Số tiền: <strong className="text-sm font-black text-red-600 font-mono">{displayTotalAmount.toLocaleString('vi-VN')} đ</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setShowTransferQr(false)}
                      className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
                    >
                      Đổi cách khác
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePayInPos('Chuyển khoản')}
                      disabled={submittingPayment}
                      className="flex-1 py-2.5 bg-[#4A3525] hover:bg-[#382513] text-white text-xs font-black rounded-xl shadow-xs transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {submittingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Xác nhận đã nhận tiền</span>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
