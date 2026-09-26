'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  db, 
  getCurrentUser, 
  isSupabaseConfigured 
} from '@/lib/database';
import { toast } from '@/lib/toast';
import { printOrderDirect } from '@/lib/printerService';
import { 
  syncCustomerDisplay, 
  openCustomerDisplayWindow, 
  kickCashDrawer 
} from '@/lib/tauriPOS';
import { 
  Coffee, 
  Users, 
  Search, 
  Check, 
  Trash2, 
  ArrowLeft,
  Loader2,
  FileText,
  CreditCard,
  DollarSign,
  ArrowRightLeft,
  X,
  Eye,
  Maximize2,
  Minimize2,
  Clock,
  Sparkles,
  UtensilsCrossed,
  CheckCircle2,
  User,
  Tag,
  Percent,
  Plus,
  Minus,
  Delete,
  MoreVertical,
  QrCode,
  LayoutGrid,
  ShoppingBag,
  Save,
  Volume2,
  PhoneCall
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
}

// Bảng màu Pastel chuẩn cho các danh mục (khớp 100% ảnh tham chiếu POS)
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  'c_caphe': { 
    bg: '#FBE4D8', 
    border: '#F4B183', 
    text: '#5B2C10', 
    bar: '#E06A3B' 
  },
  'c_nuocngot': { 
    bg: '#EFEFEF', 
    border: '#D5D5D5', 
    text: '#333333', 
    bar: '#888888' 
  },
  'c_soda': { 
    bg: '#D9E8F9', 
    border: '#9DC3E6', 
    text: '#1B4477', 
    bar: '#3B82F6' 
  },
  'c_sualac': { 
    bg: '#FEF3CD', 
    border: '#FFE69C', 
    text: '#725100', 
    bar: '#EAB308' 
  },
  'c_douongkhac': { 
    bg: '#CFF4FC', 
    border: '#9EEAF9', 
    text: '#055160', 
    bar: '#06B6D4' 
  },
  'c_topping': { 
    bg: '#E8DAEF', 
    border: '#D2B4DE', 
    text: '#512E5F', 
    bar: '#A855F7' 
  },
  'c_tra': { 
    bg: '#D1E7DD', 
    border: '#A3CFBB', 
    text: '#0F5132', 
    bar: '#10B981' 
  },
  'c_yaourt': { 
    bg: '#DCE4F7', 
    border: '#BAC8E8', 
    text: '#1F3A60', 
    bar: '#6366F1' 
  }
};

const DEFAULT_CATEGORY_COLOR = { 
  bg: '#F3F4F6', 
  border: '#E5E7EB', 
  text: '#374151', 
  bar: '#9CA3AF' 
};

export default function PosPage() {
  // Dữ liệu chính
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [yesterdaySales, setYesterdaySales] = useState<{ [productId: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // MẶC ĐỊNH MỞ MÀN HÌNH CHỌN BÀN TRƯỚC (YÊU CẦU CỦA QUÁN)
  const [viewMode, setViewMode] = useState<'tables' | 'menu'>('tables');
  const [selectedTable, setSelectedTable] = useState<any>(null);

  // Trạng thái giỏ hàng & sản phẩm
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [orderNotes, setOrderNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Buffer bàn phím số Numpad cảm ứng POS
  const [numpadBuffer, setNumpadBuffer] = useState<string>('');

  // Đơn hàng đang phục vụ của bàn (nếu bàn đã có đơn trước đó)
  const [existingOrder, setExistingOrder] = useState<any>(null);
  const [existingOrderItems, setExistingOrderItems] = useState<any[]>([]);

  // Hóa đơn nhỏ Barista / Bếp (Kitchen Queue Bar)
  const [completedKitchenOrderIds, setCompletedKitchenOrderIds] = useState<string[]>([]);
  const [selectedKitchenTicket, setSelectedKitchenTicket] = useState<any>(null);

  // Cấu hình Loa MoMo / Số điện thoại MoMo
  const [momoPhone, setMomoPhone] = useState<string>('0909123456');
  const [transferTab, setTransferTab] = useState<'momo' | 'vietqr'>('momo');

  // Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isUnpaidOrdersDrawerOpen, setIsUnpaidOrdersDrawerOpen] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const isSavingRef = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Chuyển khoản');
  const [customerCashGiven, setCustomerCashGiven] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tải danh sách đơn đã làm xong của bếp trong ngày & SĐT MoMo từ LocalStorage
  useEffect(() => {
    try {
      const todayKey = new Date().toLocaleDateString('en-CA');
      const storedDone = localStorage.getItem(`ava_kitchen_done_${todayKey}`);
      if (storedDone) {
        setCompletedKitchenOrderIds(JSON.parse(storedDone));
      }
      const savedMomo = localStorage.getItem('ava_momo_phone');
      if (savedMomo) {
        setMomoPhone(savedMomo);
      }
    } catch (_) {}
  }, []);

  // Lưu SĐT MoMo
  const handleSaveMomoPhone = (phone: string) => {
    setMomoPhone(phone);
    try {
      localStorage.setItem('ava_momo_phone', phone);
    } catch (_) {}
  };

  // Đánh dấu đơn bếp đã làm xong và tự động biến mất
  const handleMarkKitchenOrderDone = (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const todayKey = new Date().toLocaleDateString('en-CA');
    setCompletedKitchenOrderIds(prev => {
      const updated = Array.from(new Set([...prev, orderId]));
      try {
        localStorage.setItem(`ava_kitchen_done_${todayKey}`, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    toast.success('Đã hoàn thành pha chế đơn hàng!');
  };

  // Làm mới dữ liệu bàn, đơn chưa thanh toán & toàn bộ đơn gần đây (cả đã thanh toán và chưa thanh toán)
  const refreshData = async () => {
    try {
      const [tablesData, unpaidData, recentData] = await Promise.all([
        db.getTables(),
        db.getUnpaidOrders(),
        db.getRecentOrders(40)
      ]);
      setTables(tablesData);
      setUnpaidOrders(unpaidData);
      setRecentOrders(recentData);
      try {
        localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
        localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
        localStorage.setItem('ava_pos_cache_recent_orders', JSON.stringify(recentData));
      } catch (_) {}
    } catch (e) {
      console.error('Lỗi làm mới dữ liệu POS:', e);
    }
  };

  // Khởi động & Prefetch dữ liệu
  useEffect(() => {
    async function initPos() {
      const todayDateKey = new Date().toLocaleDateString('en-CA');
      // 1. Tải từ cache trước (0ms)
      try {
        const storedTables = localStorage.getItem('ava_pos_cache_tables');
        const storedCategories = localStorage.getItem('ava_pos_cache_categories');
        const storedProducts = localStorage.getItem('ava_pos_cache_products');
        const storedUnpaid = localStorage.getItem('ava_pos_cache_unpaid');
        const storedRecent = localStorage.getItem('ava_pos_cache_recent_orders');
        const storedYest = localStorage.getItem(`ava_pos_yest_sales_${todayDateKey}`);

        if (storedTables && storedCategories && storedProducts) {
          const parsedTables = JSON.parse(storedTables);
          setTables(parsedTables);
          setCategories(JSON.parse(storedCategories));
          setProducts(JSON.parse(storedProducts));
          if (storedUnpaid) setUnpaidOrders(JSON.parse(storedUnpaid));
          if (storedRecent) setRecentOrders(JSON.parse(storedRecent));
          if (storedYest) setYesterdaySales(JSON.parse(storedYest));
          setLoading(false);
        }
      } catch (_) {}

      // 2. Tải dữ liệu mới nhất từ database
      try {
        const [tablesData, categoriesData, productsData, unpaidData, recentData] = await Promise.all([
          db.getTables(),
          db.getCategories(),
          db.getProducts(),
          db.getUnpaidOrders(),
          db.getRecentOrders(40)
        ]);

        setTables(tablesData);
        setCategories(categoriesData);
        setProducts(productsData);
        setUnpaidOrders(unpaidData);
        setRecentOrders(recentData);

        try {
          localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
          localStorage.setItem('ava_pos_cache_categories', JSON.stringify(categoriesData));
          localStorage.setItem('ava_pos_cache_products', JSON.stringify(productsData));
          localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
          localStorage.setItem('ava_pos_cache_recent_orders', JSON.stringify(recentData));
        } catch (_) {}

        // Tải doanh số hôm qua
        db.getYesterdayProductSales().then(yest => {
          if (yest) {
            setYesterdaySales(yest);
            try {
              localStorage.setItem(`ava_pos_yest_sales_${todayDateKey}`, JSON.stringify(yest));
            } catch (_) {}
          }
        }).catch(() => {});
      } catch (err) {
        console.error('Lỗi tải dữ liệu POS từ server:', err);
      } finally {
        setLoading(false);
        setCurrentUser(getCurrentUser());
      }
    }

    initPos();

    // Lắng nghe Realtime thay đổi từ Supabase
    const unsubTables = db.subscribeToTableChanges(() => refreshData());
    const unsubOrders = db.subscribeToOrderChanges(() => refreshData());

    return () => {
      unsubTables();
      unsubOrders();
    };
  }, []);

  // Tính toán số tiền giỏ hàng
  const totalCartAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    const safeVal = Math.max(0, Number(discountValue) || 0);
    if (discountType === 'percent') {
      return Math.min(totalCartAmount, Math.round((totalCartAmount * Math.min(100, safeVal)) / 100));
    }
    return Math.min(totalCartAmount, safeVal);
  }, [totalCartAmount, discountType, discountValue]);

  const finalTotalAmount = useMemo(() => {
    return Math.max(0, totalCartAmount - discountAmount);
  }, [totalCartAmount, discountAmount]);

  // Tạo URL mã QR MoMo và VietQR
  const momoQrUrl = useMemo(() => {
    if (finalTotalAmount <= 0) return '';
    const cleanPhone = momoPhone.trim().replace(/\s+/g, '');
    // Chuỗi mã QR tiêu chuẩn chuyển tiền MoMo
    const momoData = `2|99|${cleanPhone}|||0|0|${finalTotalAmount}|AVA Coffee K300|transfer_myqr`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(momoData)}`;
  }, [momoPhone, finalTotalAmount]);

  const vietQrUrl = useMemo(() => {
    if (finalTotalAmount <= 0) return '';
    const cleanPhone = momoPhone.trim().replace(/\s+/g, '');
    // Napas BIN 970422 là tài khoản MoMo / MB Bank liên kết
    return `https://img.vietqr.io/image/970422-${cleanPhone}-compact2.png?amount=${finalTotalAmount}&addInfo=AVAK300`;
  }, [momoPhone, finalTotalAmount]);

  // Đồng bộ giỏ hàng sang Màn hình phụ 11.6 inch cho khách
  useEffect(() => {
    const syncToSecondaryDisplay = async () => {
      try {
        const activeQr = transferTab === 'momo' ? momoQrUrl : vietQrUrl;
        if (cart.length > 0) {
          await syncCustomerDisplay({
            tableName: selectedTable?.table_name || 'Bàn chưa chọn',
            staffName: currentUser?.full_name || '',
            items: cart.map(i => ({
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              subtotal: i.subtotal
            })),
            discount: discountAmount,
            totalAmount: finalTotalAmount,
            paymentMethod: paymentMethod,
            qrCodeUrl: paymentMethod === 'Chuyển khoản' ? activeQr : undefined,
            orderStatus: 'ordering'
          });
        } else {
          await syncCustomerDisplay({
            tableName: selectedTable?.table_name || '',
            items: [],
            totalAmount: 0,
            orderStatus: 'idle'
          });
        }
      } catch (_) {}
    };
    syncToSecondaryDisplay();
  }, [cart, selectedTable, discountAmount, finalTotalAmount, currentUser, paymentMethod, transferTab, momoQrUrl, vietQrUrl]);

  // THAO TÁC 1-CHẠM THÊM MÓN VÀO GIỎ HÀNG (FAST TOUCH)
  const handleAddToCart = (product: any) => {
    if (product.status === 'Hết hàng') {
      toast.error(`Món "${product.name}" hiện đang hết hàng!`);
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.product_id === product.id);
      if (idx !== -1) {
        const updated = [...prev];
        const nextQty = updated[idx].quantity + 1;
        updated[idx] = {
          ...updated[idx],
          quantity: nextQty,
          subtotal: nextQty * updated[idx].price
        };
        setSelectedCartIndex(idx);
        return updated;
      }

      const newItem: CartItem = {
        product_id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        subtotal: product.price
      };
      const updated = [...prev, newItem];
      setSelectedCartIndex(updated.length - 1);
      return updated;
    });

    setNumpadBuffer('');
  };

  // Cập nhật số lượng món
  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (index < 0 || index >= cart.length) return;
    setCart(prev => {
      if (newQty <= 0) {
        const next = prev.filter((_, i) => i !== index);
        setSelectedCartIndex(next.length > 0 ? Math.min(index, next.length - 1) : -1);
        return next;
      }
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: newQty,
        subtotal: newQty * updated[index].price
      };
      return updated;
    });
  };

  // Xóa toàn bộ giỏ hàng
  const handleClearCart = () => {
    setCart([]);
    setSelectedCartIndex(-1);
    setDiscountValue(0);
    setDiscountType('amount');
    setOrderNotes('');
    setNumpadBuffer('');
  };

  // XỬ LÝ BÀN PHÍM SỐ NUMPAD CHUẨN POS
  const handleNumpadDigit = (digit: string) => {
    setNumpadBuffer(prev => {
      if (digit === ',' || digit === '.') {
        if (prev.includes('.')) return prev;
        return prev + '.';
      }
      if (prev === '0' && digit !== '0') return digit;
      return prev + digit;
    });
  };

  // Nút SL (Số lượng)
  const handleNumpadSL = () => {
    if (selectedCartIndex === -1 || cart.length === 0) {
      toast.info('Vui lòng chạm chọn một món trong danh sách trước!');
      return;
    }
    const val = parseInt(numpadBuffer, 10);
    if (!isNaN(val) && val > 0) {
      handleUpdateQuantity(selectedCartIndex, val);
      setNumpadBuffer('');
    } else if (numpadBuffer === '0') {
      handleUpdateQuantity(selectedCartIndex, 0);
      setNumpadBuffer('');
    } else {
      handleUpdateQuantity(selectedCartIndex, cart[selectedCartIndex].quantity + 1);
    }
  };

  // Nút % (Giảm giá phần trăm)
  const handleNumpadPercent = () => {
    const val = parseFloat(numpadBuffer);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      setDiscountType('percent');
      setDiscountValue(val);
      setNumpadBuffer('');
      toast.success(`Đã áp dụng giảm giá ${val}%`);
    } else {
      setIsDiscountModalOpen(true);
    }
  };

  // Nút Giá (Đổi đơn giá món)
  const handleNumpadPrice = () => {
    if (selectedCartIndex === -1 || cart.length === 0) {
      toast.info('Vui lòng chọn món để chỉnh giá');
      return;
    }
    const val = parseFloat(numpadBuffer);
    if (!isNaN(val) && val >= 0) {
      setCart(prev => {
        const updated = [...prev];
        const item = updated[selectedCartIndex];
        updated[selectedCartIndex] = {
          ...item,
          price: val,
          subtotal: item.quantity * val
        };
        return updated;
      });
      setNumpadBuffer('');
      toast.success(`Đã đổi đơn giá thành ${val.toLocaleString('vi-VN')}đ`);
    }
  };

  // Nút +/- (Tăng/giảm nhanh số lượng)
  const handleNumpadToggleSign = () => {
    if (selectedCartIndex !== -1 && cart[selectedCartIndex]) {
      const current = cart[selectedCartIndex].quantity;
      handleUpdateQuantity(selectedCartIndex, current > 1 ? current - 1 : 1);
    }
  };

  // Nút Backspace / Xóa
  const handleNumpadBackspace = () => {
    if (numpadBuffer.length > 0) {
      setNumpadBuffer(prev => prev.slice(0, -1));
    } else if (selectedCartIndex !== -1 && cart[selectedCartIndex]) {
      const currentQty = cart[selectedCartIndex].quantity;
      if (currentQty > 1) {
        handleUpdateQuantity(selectedCartIndex, currentQty - 1);
      } else {
        handleUpdateQuantity(selectedCartIndex, 0);
      }
    }
  };

  // CHỌN BÀN TỪ SƠ ĐỒ BÀN
  const handleSelectTable = async (table: any) => {
    setSelectedTable(table);
    setViewMode('menu'); // Chuyển sang màn hình chọn món
    setCart([]);
    setSelectedCartIndex(-1);
    setOrderNotes('');
    setDiscountValue(0);

    const isOccupied = table.status === 'Đang phục vụ' && table.table_name !== 'Khách mang về';
    if (isOccupied) {
      const cached = unpaidOrders.find(o => o.table_id === table.id);
      if (cached) {
        setExistingOrder(cached);
      }
      try {
        if (cached?.id) {
          const items = await db.getOrderItems(cached.id);
          setExistingOrderItems(items || []);
        } else {
          const res = await db.getUnpaidOrderByTableId(table.id);
          if (res) {
            setExistingOrder(res.order);
            setExistingOrderItems(res.items || []);
          }
        }
      } catch (e) {
        console.error('Lỗi tải đơn cũ của bàn:', e);
      }
    } else {
      setExistingOrder(null);
      setExistingOrderItems([]);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // LỰA CHỌN 1: LƯU ĐƠN (THANH TOÁN SAU) -> GỬI BẾP PHA CHẾ
  // ─────────────────────────────────────────────────────────────
  const handleSaveOrderLater = async () => {
    if (savingOrder || isSavingRef.current) return;
    if (!selectedTable || cart.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 món để lưu đơn');
      return;
    }
    isSavingRef.current = true;
    setSavingOrder(true);

    try {
      const savedOrder = await db.createOrder({
        table_id: selectedTable.id || 'tb_mangve',
        staff_id: currentUser?.id || 'admin',
        total_amount: finalTotalAmount,
        discount: discountAmount,
        notes: orderNotes.trim(),
        items: cart
      });

      // Optimistic update: Thêm ngay đơn mới vào danh sách Bếp làm
      if (savedOrder) {
        setRecentOrders(prev => [savedOrder, ...prev.filter(o => o.id !== savedOrder.id)]);
      }

      toast.success(`Đã lưu đơn cho ${selectedTable.table_name}! Đã gửi bếp pha chế.`);
      handleClearCart();
      setViewMode('tables'); // Quay về màn hình chọn bàn
      await refreshData();
    } catch (err) {
      console.error('Lỗi lưu đơn:', err);
      toast.error('Gặp lỗi khi lưu đơn hàng');
    } finally {
      isSavingRef.current = false;
      setSavingOrder(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // LỰA CHỌN 2: THANH TOÁN LUÔN (TIỀN MẶT / CHUYỂN KHOẢN VIETQR / MOMO)
  // ─────────────────────────────────────────────────────────────
  const handleProcessPayment = async () => {
    if (submittingPayment) return;
    setSubmittingPayment(true);

    try {
      let orderIdToPay = existingOrder?.id;

      // 1. Nếu có món mới trong giỏ hàng -> Lưu đơn trước
      if (cart.length > 0) {
        const savedOrder = await db.createOrder({
          table_id: selectedTable?.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: finalTotalAmount,
          discount: discountAmount,
          notes: orderNotes.trim(),
          items: cart
        });
        if (savedOrder?.id) {
          orderIdToPay = savedOrder.id;
          // Thêm đơn vào hàng đợi bếp
          setRecentOrders(prev => [savedOrder, ...prev.filter(o => o.id !== savedOrder.id)]);
        }
      }

      if (!orderIdToPay) {
        toast.error('Chưa có món ăn nào để thanh toán!');
        setSubmittingPayment(false);
        return;
      }

      // 2. Xác nhận thanh toán trong Database
      await db.payOrder(orderIdToPay, paymentMethod);

      // Cập nhật trạng thái đơn trong danh sách gần đây
      setRecentOrders(prev => prev.map(o => o.id === orderIdToPay ? { ...o, payment_status: 'Đã thanh toán' } : o));

      // 3. In hóa đơn nhiệt câm K80 và mở két tiền tự động
      try {
        const printItems = cart.length > 0 
          ? cart 
          : existingOrderItems.map(i => ({
              name: i.products?.name || i.ten_san_pham || 'Món',
              quantity: i.quantity || 1,
              price: i.unit_price || 0,
              subtotal: i.subtotal || 0,
              notes: i.ghi_chu || ''
            }));

        await printOrderDirect({
          tableName: selectedTable?.table_name || 'Khách mang về',
          staffName: currentUser?.full_name || 'Admin',
          orderId: orderIdToPay,
          items: printItems.map(i => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            subtotal: i.subtotal
          })),
          totalAmount: totalCartAmount || existingOrder?.total_amount || 0,
          discount: discountAmount || existingOrder?.discount || 0,
          notes: orderNotes.trim()
        });

        // Bật mở két tiền qua RJ11
        await kickCashDrawer();
      } catch (printErr) {
        console.warn('In bill hoặc mở két tiền:', printErr);
      }

      // Hiệu ứng pháo hoa chúc mừng
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Thanh toán thành công ${selectedTable?.table_name}! Đã gửi bếp pha chế.`);
      setIsPayModalOpen(false);
      handleClearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
      setViewMode('tables'); // Trả về giao diện chọn bàn
      await refreshData();
    } catch (e) {
      console.error('Lỗi khi thanh toán:', e);
      toast.error('Có lỗi xảy ra khi xử lý thanh toán');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // LỌC SẢN PHẨM & SẮP XẾP THÔNG MINH
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCat = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
        return matchSearch && matchCat;
      })
      .sort((a, b) => {
        // Ưu tiên bán chạy hôm qua
        const sA = yesterdaySales[a.id] || 0;
        const sB = yesterdaySales[b.id] || 0;
        if (sB !== sA) return sB - sA;

        // Thứ tự nhóm món
        const catOrder: Record<string, number> = {
          'c_caphe': 1,
          'c_nuocngot': 2,
          'c_soda': 3,
          'c_sualac': 4,
          'c_douongkhac': 5,
          'c_topping': 6,
          'c_tra': 7,
          'c_yaourt': 8
        };
        const orderA = catOrder[a.category_id] || 99;
        const orderB = catOrder[b.category_id] || 99;
        if (orderA !== orderB) return orderA - orderB;

        return a.name.localeCompare(b.name, 'vi');
      });
  }, [products, searchTerm, selectedCategoryId, yesterdaySales]);

  // DANH SÁCH HÓA ĐƠN CHỜ PHA CHẾ (CẢ ĐÃ THANH TOÁN HOẶC CHƯA THANH TOÁN ĐỀU PHẢI HIỆN CHO BẾP LÀM)
  const pendingKitchenOrders = useMemo(() => {
    return recentOrders.filter(order => !completedKitchenOrderIds.includes(order.id));
  }, [recentOrders, completedKitchenOrderIds]);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-[#FAF6F0] space-y-4">
        <Loader2 className="w-12 h-12 text-[#4A3525] animate-spin" />
        <p className="text-sm font-bold text-[#4A3525]">Đang chuẩn bị màn hình POS CPOS 603...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#F4F5F7] text-gray-900 select-none overflow-hidden font-sans">
      
      {/* ─────────────────────────────────────────────────────────────
          1. TOP NAVIGATION HEADER
      ───────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-200 px-3 flex items-center justify-between shrink-0 shadow-xs z-30">
        {/* Nút Tab: Sơ đồ bàn | Đăng ký | Đơn chưa TT */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            onClick={() => setViewMode(prev => prev === 'tables' ? 'menu' : 'tables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
              viewMode === 'tables'
                ? 'bg-[#4A3525] text-white border-[#4A3525] shadow-xs'
                : 'bg-white hover:bg-[#FAF6F0] text-[#4A3525] border-gray-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Sơ đồ bàn</span>
            {tables.filter(t => t.status === 'Đang phục vụ').length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-black">
                {tables.filter(t => t.status === 'Đang phục vụ').length}
              </span>
            )}
          </button>

          {selectedTable && (
            <div 
              onClick={() => setViewMode('menu')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border cursor-pointer transition ${
                viewMode === 'menu'
                  ? 'bg-[#F5EFE6] text-[#4A3525] border-[#4A3525]'
                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
              }`}
            >
              <span>Bàn:</span>
              <span className="font-bold text-[#4A3525]">{selectedTable.table_name}</span>
            </div>
          )}

          <button
            onClick={() => setIsUnpaidOrdersDrawerOpen(true)}
            className="px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <span>Đơn chưa TT</span>
            <span className="px-1.5 py-0.2 bg-[#00A896] text-white rounded-full text-[10px] font-black">
              {unpaidOrders.length}
            </span>
          </button>
        </div>

        {/* Thông tin nhanh số lượng đơn chờ pha chế */}
        <div className="flex items-center space-x-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-900">
          <UtensilsCrossed className="w-3.5 h-3.5 text-amber-700" />
          <span>Hóa đơn chờ pha chế ({pendingKitchenOrders.length})</span>
        </div>

        {/* Ô Tìm kiếm & Tiện ích bên phải */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative w-40 sm:w-56">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 bg-gray-50 pl-8 pr-7 rounded-lg text-xs border border-gray-200 focus:outline-none focus:border-[#4A3525] text-gray-800 placeholder-gray-400 transition"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={async () => {
              await openCustomerDisplayWindow();
            }}
            className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs transition cursor-pointer"
            title="Mở màn hình phụ 11.6 inch cho khách xem"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs transition cursor-pointer"
            title="Bật/Tắt Toàn màn hình"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <Link
            href="/"
            className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs transition cursor-pointer"
            title="Về Trang chủ Quản lý"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>

          {/* Avatar User Nâu Cà Phê */}
          <div className="w-7 h-7 rounded-full bg-[#4A3525] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'M'}
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. THANH HÓA ĐƠN BẾP (KITCHEN QUEUE BAR) - HÌNH CHỮ NHẬT BỰ DỄ NHÌN, DỄ BẤM
      ───────────────────────────────────────────────────────────── */}
      <section className="bg-[#FAF6F0] border-b border-amber-200/80 px-3 py-2 shrink-0 z-20 shadow-xs">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-[#4A3525] uppercase tracking-wide flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Hóa đơn cần pha chế</span>
            </span>
            <span className="text-[10px] text-gray-500 font-medium">
              (Chạm "ĐÃ XONG" để đơn tự biến mất khỏi danh sách)
            </span>
          </div>

          <span className="text-[11px] font-bold text-amber-800">
            {pendingKitchenOrders.length} đơn đang chờ
          </span>
        </div>

        {/* CAROUSEL CÁC HÓA ĐƠN HÌNH CHỮ NHẬT BỰ */}
        <div className="flex items-center space-x-3 overflow-x-auto pb-1 no-scrollbar min-h-[142px]">
          {pendingKitchenOrders.length === 0 ? (
            <div className="w-full py-6 flex items-center justify-center space-x-2 text-xs font-bold text-gray-400 bg-white/70 rounded-2xl border border-dashed border-gray-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span>Tuyệt vời! Hiện tại đã pha chế xong tất cả các đơn hàng. Đơn mới sẽ xuất hiện tại đây.</span>
            </div>
          ) : (
            pendingKitchenOrders.map((order) => {
              const orderTime = new Date(order.created_at);
              const minutesAgo = Math.floor((Date.now() - orderTime.getTime()) / 60000);
              const isUrgent = minutesAgo >= 10;
              const tableName = order.tables?.table_name || 'Khách mang về';
              const isPaid = order.payment_status === 'Đã thanh toán';

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedKitchenTicket(order)}
                  className={`w-64 sm:w-72 h-[138px] p-3 rounded-2xl border bg-white flex flex-col justify-between shrink-0 shadow-sm hover:shadow-md transition-all cursor-pointer relative ${
                    isUrgent
                      ? 'border-red-400 ring-2 ring-red-200'
                      : isPaid
                      ? 'border-emerald-300 ring-1 ring-emerald-100'
                      : 'border-amber-300 ring-1 ring-amber-100'
                  }`}
                  style={{
                    backgroundImage: 'linear-gradient(to bottom, #FFFFFF, #FFFDF9)'
                  }}
                >
                  {/* TIÊU ĐỀ VÉ: BÀN + TRẠNG THÁI THANH TOÁN */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-dashed border-gray-200">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-sm font-black text-[#4A3525] uppercase tracking-tight">
                        {tableName}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium">
                        • {minutesAgo}p
                      </span>
                    </div>

                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                      isPaid 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}>
                      {isPaid ? 'ĐÃ TT' : 'CHƯA TT'}
                    </span>
                  </div>

                  {/* DANH SÁCH MÓN ĂN HIỂN THỊ RÕ RÀNG */}
                  <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1 custom-scrollbar text-xs">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-start text-xs leading-tight">
                          <span className="font-bold text-gray-900 truncate flex-1">
                            {item.name}
                            {item.notes && (
                              <span className="block text-[10px] text-amber-800 italic font-normal">
                                📝 {item.notes}
                              </span>
                            )}
                          </span>
                          <span className="font-black text-[#4A3525] ml-2 shrink-0">
                            x{item.quantity}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-gray-400 italic">Đơn #{order.id.slice(0, 6)}</p>
                    )}

                    {order.notes && (
                      <p className="text-[10px] text-amber-900 bg-amber-50 p-1 rounded-md border border-amber-200 font-semibold">
                        Ghi chú: {order.notes}
                      </p>
                    )}
                  </div>

                  {/* NÚT BẤM "ĐÃ LÀM XONG" BỰ DỄ BẤM */}
                  <button
                    onClick={(e) => handleMarkKitchenOrderDone(order.id, e)}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer mt-1"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>✓ ĐÃ LÀM XONG</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. NỘI DUNG CHÍNH (SƠ ĐỒ BÀN HOẶC GIAO DIỆN BÁN HÀNG)
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'tables' ? (
        /* GIAO DIỆN SƠ ĐỒ BÀN (MẶC ĐỊNH KHI MỞ APP) */
        <div className="flex-1 p-5 overflow-y-auto bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black text-gray-800">Sơ đồ bàn phục vụ</h2>
              <p className="text-xs text-gray-500">
                Chạm vào bàn trống để bắt đầu gọi món, hoặc chạm vào bàn đang phục vụ để xem hóa đơn / thêm món / thanh toán
              </p>
            </div>
            {selectedTable && (
              <button
                onClick={() => setViewMode('menu')}
                className="px-4 py-2 bg-[#4A3525] hover:bg-[#382513] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Vào gọi món: {selectedTable.table_name}</span>
                <span>→</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {[...tables]
              .sort((a, b) => {
                if (a.table_name === 'Khách mang về') return -1;
                if (b.table_name === 'Khách mang về') return 1;
                return a.table_name.localeCompare(b.table_name, 'vi', { numeric: true });
              })
              .map(table => {
                const isOccupied = table.status === 'Đang phục vụ';
                const isTakeaway = table.table_name === 'Khách mang về';
                const unpaidMatch = unpaidOrders.find(o => o.table_id === table.id);

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`h-36 p-4 rounded-2xl border text-left flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer ${
                      isTakeaway
                        ? 'bg-[#FAF6F0] border-[#8C6A5C] ring-2 ring-[#8C6A5C]/40'
                        : isOccupied
                        ? 'bg-amber-50/90 border-amber-300 shadow-xs'
                        : selectedTable?.id === table.id
                        ? 'bg-[#F5EFE6] border-[#4A3525] shadow-xs'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isOccupied 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {table.status}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center space-x-1">
                        <Users className="w-3 h-3" />
                        <span>{table.capacity || 4}</span>
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-lg text-gray-800 tracking-tight">{table.table_name}</h4>
                      {isOccupied && unpaidMatch ? (
                        <p className="text-xs font-black text-[#4A3525] mt-1">
                          {Number(unpaidMatch.total_amount || 0).toLocaleString('vi-VN')} đ
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-1 font-medium">Chạm để gọi món</p>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ) : (
        /* GIAO DIỆN BÁN HÀNG TOUCH CHUẨN POS (CỘT TRÁI GIỎ HÀNG + CỘT PHẢI THỰC ĐƠN) */
        <div className="flex-1 flex overflow-hidden">
          
          {/* ─────────────────────────────────────────────────────────────
              CỘT TRÁI: GIỎ HÀNG + BÀN PHÍM SỐ POS NUMPAD (~30% WIDTH)
          ───────────────────────────────────────────────────────────── */}
          <div className="w-[320px] sm:w-[360px] md:w-[380px] bg-white border-r border-gray-200 flex flex-col shrink-0 z-20">
            
            {/* TIÊU ĐỀ BÀN ĐANG CHỌN */}
            <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setViewMode('tables')}
                  className="p-1 hover:bg-gray-200 rounded-lg text-gray-600 transition cursor-pointer"
                  title="Quay lại sơ đồ bàn"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span className="font-extrabold text-xs text-gray-800">
                  {selectedTable?.table_name || 'Bàn chưa chọn'}
                </span>
              </div>

              {existingOrder && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-full">
                  Đang phục vụ
                </span>
              )}
            </div>

            {/* DANH SÁCH MÓN ĐÃ CHỌN (CART TABLE) */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-2">
                  <Coffee className="w-10 h-10 opacity-30 stroke-[1.5]" />
                  <p className="text-xs font-bold text-gray-500">Chưa có món nào được chọn</p>
                  <p className="text-[11px]">Chạm vào hình ảnh món ăn bên phải để thêm nhanh vào giỏ</p>
                </div>
              ) : (
                cart.map((item, idx) => {
                  const isSelected = idx === selectedCartIndex;
                  return (
                    <div
                      key={item.product_id}
                      onClick={() => setSelectedCartIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2.5 text-xs transition cursor-pointer select-none ${
                        isSelected 
                          ? 'bg-[#F5EFE6] text-[#4A3525] font-semibold' 
                          : 'hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-2">
                        <span className={`w-5 text-center font-extrabold text-xs shrink-0 ${
                          isSelected ? 'text-[#4A3525]' : 'text-gray-900'
                        }`}>
                          {item.quantity}
                        </span>
                        <div className="truncate flex-1">
                          <p className="truncate font-bold leading-tight">{item.name}</p>
                          {item.notes && (
                            <p className="text-[10px] text-amber-700 italic truncate font-normal">
                              📝 {item.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-gray-900">
                          {item.subtotal.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* DÒNG HIỂN THỊ TỔNG TIỀN */}
            <div className="px-4 py-2.5 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-sm font-bold text-gray-700">Tổng</span>
              <div className="text-right">
                <span className="text-xl font-black text-gray-950">
                  {finalTotalAmount.toLocaleString('vi-VN')} đ
                </span>
                {discountAmount > 0 && (
                  <span className="block text-[10px] text-red-600 font-bold">
                    (Đã giảm: -{discountAmount.toLocaleString('vi-VN')}đ)
                  </span>
                )}
              </div>
            </div>

            {/* HÀNG 4 NÚT THAO TÁC NHANH */}
            <div className="grid grid-cols-4 gap-1 p-2 bg-gray-50 border-t border-gray-200 shrink-0 text-[11px] font-bold text-gray-700">
              <button
                onClick={() => setIsCustomerModalOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs cursor-pointer"
              >
                <span>Khách hàng</span>
              </button>
              <button
                onClick={() => setIsNotesModalOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs cursor-pointer"
              >
                <span>Ghi chú</span>
              </button>
              <button
                onClick={() => setIsDiscountModalOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs cursor-pointer"
              >
                <span>Giảm giá</span>
              </button>
              <button
                onClick={() => setIsUnpaidOrdersDrawerOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs cursor-pointer"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* BÀN PHÍM SỐ CẢM ỨNG POS (4x4 MATRIX) */}
            <div className="p-2 bg-gray-50 border-t border-gray-200 grid grid-cols-4 gap-1.5 shrink-0">
              {/* Hàng 1 */}
              <button
                onClick={() => handleNumpadDigit('1')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                1
              </button>
              <button
                onClick={() => handleNumpadDigit('2')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                2
              </button>
              <button
                onClick={() => handleNumpadDigit('3')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                3
              </button>
              <button
                onClick={handleNumpadSL}
                className="h-10 bg-[#EBD9CC] hover:bg-[#DEC5B3] border border-[#D4B8A5] rounded-xl text-xs font-black text-[#5A3825] shadow-2xs transition cursor-pointer"
                title="Thay đổi số lượng"
              >
                SL
              </button>

              {/* Hàng 2 */}
              <button
                onClick={() => handleNumpadDigit('4')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                4
              </button>
              <button
                onClick={() => handleNumpadDigit('5')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                5
              </button>
              <button
                onClick={() => handleNumpadDigit('6')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                6
              </button>
              <button
                onClick={handleNumpadPercent}
                className="h-10 bg-[#EAECEE] hover:bg-[#D5D8DC] border border-[#D5D8DC] rounded-xl text-xs font-black text-[#2C3E50] shadow-2xs transition cursor-pointer"
                title="Giảm giá %"
              >
                %
              </button>

              {/* Hàng 3 */}
              <button
                onClick={() => handleNumpadDigit('7')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                7
              </button>
              <button
                onClick={() => handleNumpadDigit('8')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                8
              </button>
              <button
                onClick={() => handleNumpadDigit('9')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                9
              </button>
              <button
                onClick={handleNumpadPrice}
                className="h-10 bg-[#EAECEE] hover:bg-[#D5D8DC] border border-[#D5D8DC] rounded-xl text-xs font-bold text-[#2C3E50] shadow-2xs transition cursor-pointer"
                title="Đổi đơn giá"
              >
                Giá
              </button>

              {/* Hàng 4 */}
              <button
                onClick={handleNumpadToggleSign}
                className="h-10 bg-[#FEF3CD] hover:bg-[#FFE69C] border border-[#FFE69C] rounded-xl text-sm font-black text-[#725100] shadow-2xs transition cursor-pointer"
                title="Giảm 1 số lượng"
              >
                +/-
              </button>
              <button
                onClick={() => handleNumpadDigit('0')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                0
              </button>
              <button
                onClick={() => handleNumpadDigit(',')}
                className="h-10 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition cursor-pointer"
              >
                ,
              </button>
              <button
                onClick={handleNumpadBackspace}
                className="h-10 bg-[#FADBD8] hover:bg-[#F5B7B1] border border-[#F5B7B1] rounded-xl text-sm font-black text-[#78281F] shadow-2xs transition flex items-center justify-center cursor-pointer"
                title="Xóa lùi"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {/* HÀNG NÚT THAO TÁC DƯỚI CÙNG: MỚI + 2 LỰA CHỌN (LƯU ĐƠN BẾP LÀM HOẶC THANH TOÁN NGAY) */}
            <div className="p-2 bg-white border-t border-gray-200 flex flex-col space-y-1.5 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                {/* LỰA CHỌN 1: LƯU ĐƠN (THANH TOÁN SAU / BẾP LÀM) */}
                <button
                  disabled={savingOrder || cart.length === 0}
                  onClick={handleSaveOrderLater}
                  className="py-3 px-2 bg-[#8C6A5C] hover:bg-[#725346] active:scale-[0.98] text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Lưu đơn hàng vào bàn, gửi bếp pha chế, thanh toán sau"
                >
                  {savingOrder ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu (TT sau)</span>
                </button>

                {/* LỰA CHỌN 2: THANH TOÁN NGAY (MÀU NÂU CÀ PHÊ CHỦ ĐẠO) */}
                <button
                  onClick={() => {
                    if (cart.length === 0 && (!existingOrderItems || existingOrderItems.length === 0)) {
                      toast.info('Vui lòng chọn ít nhất 1 món để thanh toán');
                      return;
                    }
                    setIsPayModalOpen(true);
                  }}
                  className="py-3 px-2 bg-[#4A3525] hover:bg-[#382513] active:scale-[0.98] text-white rounded-xl font-black text-xs shadow-md transition flex items-center justify-center space-x-1 cursor-pointer"
                  title="Thanh toán ngay bằng Tiền mặt / Chuyển khoản"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Thanh toán ngay</span>
                </button>
              </div>

              {/* NÚT XÓA GIỎ HÀNG */}
              <button
                onClick={handleClearCart}
                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold text-[11px] text-gray-500 transition active:scale-98 cursor-pointer"
              >
                Xóa giỏ hàng (Mới)
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              CỘT PHẢI: DANH MỤC PASTEL & LƯỚI SẢN PHẨM 1-CHẠM (~70% WIDTH)
          ───────────────────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-[#F9FAFB] overflow-hidden">
            
            {/* HÀNG NÚT DANH MỤC MÀU PASTEL CHUẨN */}
            <div className="p-2.5 pb-1 overflow-x-auto no-scrollbar flex items-center space-x-2 shrink-0 bg-white border-b border-gray-200">
              <button
                onClick={() => setSelectedCategoryId('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 border cursor-pointer ${
                  selectedCategoryId === 'all'
                    ? 'bg-gray-800 text-white border-gray-800 shadow-xs'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                }`}
              >
                Tất cả
              </button>

              {categories.map((cat) => {
                const color = CATEGORY_COLORS[cat.id] || DEFAULT_CATEGORY_COLOR;
                const isSelected = selectedCategoryId === cat.id;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(isSelected ? 'all' : cat.id)}
                    style={{
                      backgroundColor: isSelected ? color.border : color.bg,
                      borderColor: color.border,
                      color: color.text
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 border cursor-pointer ${
                      isSelected ? 'shadow-xs ring-2 ring-amber-600' : 'hover:opacity-90'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>

            {/* LƯỚI THẺ SẢN PHẨM TOUCH 1-CHẠM (PRODUCT MATRIX GRID) */}
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2.5">
                {filteredProducts.map((prod) => {
                  const cartItem = cart.find(i => i.product_id === prod.id);
                  const inCartQty = cartItem?.quantity || 0;
                  const catColor = CATEGORY_COLORS[prod.category_id] || DEFAULT_CATEGORY_COLOR;
                  const isOutOfStock = prod.status === 'Hết hàng';

                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleAddToCart(prod)}
                      className={`relative bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col justify-between cursor-pointer transition-all duration-150 select-none shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] ${
                        isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        minHeight: '135px'
                      }}
                    >
                      {/* KHUNG ẢNH SẢN PHẨM */}
                      <div className="relative w-full h-24 bg-white flex items-center justify-center p-2 overflow-hidden">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain pointer-events-none"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-300">
                            <Coffee className="w-5 h-5" />
                          </div>
                        )}

                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[10px] font-black uppercase">
                            Hết hàng
                          </div>
                        )}

                        {/* HUY HIỆU CON NHỘNG MÀU ĐEN THỂ HIỆN SỐ LƯỢNG TRONG GIỎ (EXACT REFERENCE) */}
                        {inCartQty > 0 && (
                          <div className="absolute bottom-1 right-1 bg-black text-white font-black text-[11px] px-1.5 py-0.2 rounded-md shadow-md min-w-[18px] text-center border border-white">
                            {inCartQty}
                          </div>
                        )}
                      </div>

                      {/* TÊN SẢN PHẨM & ĐƠN GIÁ */}
                      <div className="p-1.5 pt-0 text-center">
                        <p className="text-[11px] font-extrabold text-gray-800 leading-tight line-clamp-1">
                          {prod.name}
                        </p>
                      </div>

                      {/* DẢI MÀU CHÂN THẺ ĐỒNG BỘ DANH MỤC */}
                      <div 
                        className="w-full h-1 shrink-0" 
                        style={{ backgroundColor: catColor.bar }}
                      />
                    </div>
                  );
                })}
              </div>

              {filteredProducts.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 space-y-2">
                  <Coffee className="w-10 h-10 opacity-30 stroke-[1.5]" />
                  <p className="text-xs font-bold">Không tìm thấy món ăn phù hợp</p>
                  <p className="text-[11px]">Thử tìm với từ khóa khác hoặc chọn danh mục khác</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. MODAL THANH TOÁN (TIỀN MẶT / CHUYỂN KHOẢN VIETQR & LOA MOMO)
      ───────────────────────────────────────────────────────────── */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-gray-200 animate-scaleIn">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">
                  Thanh toán {selectedTable?.table_name || ''}
                </h3>
                <p className="text-[11px] text-gray-500">
                  Thu ngân: {currentUser?.full_name || 'Admin'}
                </p>
              </div>
              <button 
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tổng tiền cần thanh toán */}
              <div className="bg-[#FAF6F0] border border-[#4A3525]/20 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-xs font-bold text-[#4A3525] uppercase tracking-wide">Tổng tiền cần thu:</span>
                <span className="text-2xl font-black text-[#4A3525]">
                  {finalTotalAmount.toLocaleString('vi-VN')} đ
                </span>
              </div>

              {/* Chọn hình thức thanh toán */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Tiền mặt')}
                  className={`p-3.5 rounded-2xl border text-center transition font-bold text-xs flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
                    paymentMethod === 'Tiền mặt'
                      ? 'bg-[#4A3525] text-white border-[#4A3525] shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <DollarSign className="w-5 h-5" />
                  <span>Tiền mặt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('Chuyển khoản')}
                  className={`p-3.5 rounded-2xl border text-center transition font-bold text-xs flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
                    paymentMethod === 'Chuyển khoản'
                      ? 'bg-[#4A3525] text-white border-[#4A3525] shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span>Chuyển khoản (MoMo / VietQR)</span>
                </button>
              </div>

              {/* NẾU LÀ CHUYỂN KHOẢN -> HỖ TRỢ LOA MOMO & VIETQR */}
              {paymentMethod === 'Chuyển khoản' && (
                <div className="p-4 bg-pink-50/60 border border-pink-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Volume2 className="w-4 h-4 text-pink-700" />
                      <span className="text-xs font-black text-pink-950 uppercase">
                        Quét mã Loa MoMo / Ngân hàng
                      </span>
                    </div>

                    <div className="flex bg-white rounded-lg p-0.5 border border-pink-200 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setTransferTab('momo')}
                        className={`px-2.5 py-1 rounded-md transition ${
                          transferTab === 'momo' ? 'bg-pink-600 text-white shadow-xs' : 'text-gray-600'
                        }`}
                      >
                        Loa MoMo
                      </button>
                      <button
                        type="button"
                        onClick={() => setTransferTab('vietqr')}
                        className={`px-2.5 py-1 rounded-md transition ${
                          transferTab === 'vietqr' ? 'bg-pink-600 text-white shadow-xs' : 'text-gray-600'
                        }`}
                      >
                        VietQR
                      </button>
                    </div>
                  </div>

                  {/* SĐT Loa MoMo */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-gray-600 shrink-0">SĐT MoMo:</span>
                    <input
                      type="text"
                      value={momoPhone}
                      onChange={(e) => handleSaveMomoPhone(e.target.value)}
                      placeholder="Nhập số điện thoại MoMo..."
                      className="flex-1 h-8 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  {/* Hiển thị mã QR tương ứng */}
                  <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-pink-100 shadow-2xs">
                    {transferTab === 'momo' ? (
                      momoQrUrl ? (
                        <div className="flex flex-col items-center space-y-1">
                          <img
                            src={momoQrUrl}
                            alt="Mã QR MoMo"
                            className="w-36 h-36 object-contain rounded-lg"
                          />
                          <p className="text-[10px] text-pink-800 font-bold">
                            Mã MoMo chuẩn: Khách quét app MoMo sẽ báo Loa MoMo
                          </p>
                        </div>
                      ) : null
                    ) : (
                      vietQrUrl ? (
                        <div className="flex flex-col items-center space-y-1">
                          <img
                            src={vietQrUrl}
                            alt="Mã VietQR"
                            className="w-36 h-36 object-contain rounded-lg"
                          />
                          <p className="text-[10px] text-blue-800 font-bold">
                            Mã VietQR: Mọi ngân hàng (MB, VCB, Techcom...) đều quét được
                          </p>
                        </div>
                      ) : null
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 text-center italic">
                    Mã QR đã tự động đồng bộ sang màn hình phụ 11.6 inch cho khách quét
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                disabled={submittingPayment}
                onClick={handleProcessPayment}
                className="px-6 py-2.5 bg-[#4A3525] hover:bg-[#382513] text-white font-black text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {submittingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Xác nhận & In bill K80</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. MODAL CHI TIẾT VÉ BẾP / BARISTA TICKET MODAL
      ───────────────────────────────────────────────────────────── */}
      {selectedKitchenTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl p-5 border border-gray-200 animate-scaleIn space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">
                  {selectedKitchenTicket.tables?.table_name || 'Khách mang về'}
                </h3>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase ${
                    selectedKitchenTicket.payment_status === 'Đã thanh toán' 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedKitchenTicket.payment_status}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(selectedKitchenTicket.created_at).toLocaleTimeString('vi-VN')}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedKitchenTicket(null)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chi tiết đơn */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-700">Món cần pha chế:</p>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2 max-h-48 overflow-y-auto">
                {selectedKitchenTicket.order_items && selectedKitchenTicket.order_items.length > 0 ? (
                  selectedKitchenTicket.order_items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-1.5 last:border-0 last:pb-0">
                      <div>
                        <span className="font-bold text-gray-900">{item.name}</span>
                        {item.notes && (
                          <p className="text-[10px] text-amber-800 italic">📝 {item.notes}</p>
                        )}
                      </div>
                      <span className="font-black text-[#4A3525]">x {item.quantity}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic">Đơn #{selectedKitchenTicket.id.slice(0, 8)}</p>
                )}
                {selectedKitchenTicket.notes && (
                  <p className="text-amber-800 font-medium pt-1 border-t border-gray-200">
                    📝 Ghi chú: {selectedKitchenTicket.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setSelectedKitchenTicket(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  handleMarkKitchenOrderDone(selectedKitchenTicket.id);
                  setSelectedKitchenTicket(null);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Đã làm xong</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. MODAL GHI CHÚ ĐƠN HÀNG
      ───────────────────────────────────────────────────────────── */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 border border-gray-200 space-y-4 shadow-2xl animate-scaleIn">
            <h3 className="font-extrabold text-base text-gray-900">Ghi chú đơn hàng</h3>
            <textarea
              rows={3}
              placeholder="Ví dụ: Ít đường, mang về, thêm đá..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#4A3525]"
            />
            {/* Gợi ý nhanh */}
            <div className="flex flex-wrap gap-1.5">
              {['Ít đường', 'Không đường', 'Ít đá', 'Nhiều đá', 'Mang về', 'Uống tại chỗ'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setOrderNotes(prev => prev ? `${prev}, ${tag}` : tag)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-700 transition cursor-pointer"
                >
                  +{tag}
                </button>
              ))}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsNotesModalOpen(false)}
                className="px-4 py-2 bg-[#4A3525] text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. MODAL GIẢM GIÁ
      ───────────────────────────────────────────────────────────── */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 border border-gray-200 space-y-4 shadow-2xl animate-scaleIn">
            <h3 className="font-extrabold text-base text-gray-900">Giảm giá / Chiết khấu</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                  discountType === 'percent' ? 'bg-[#4A3525] text-white border-[#4A3525]' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Phần trăm (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('amount')}
                className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                  discountType === 'amount' ? 'bg-[#4A3525] text-white border-[#4A3525]' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Số tiền (VNĐ)
              </button>
            </div>
            <input
              type="number"
              min="0"
              placeholder={discountType === 'percent' ? "Nhập % giảm (ví dụ: 10)" : "Nhập số tiền giảm"}
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-[#4A3525]"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 10, 15, 20].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setDiscountType('percent'); setDiscountValue(p); }}
                  className="py-1.5 bg-[#FAF6F0] hover:bg-[#F5EFE6] text-[#4A3525] font-black text-xs rounded-lg border border-[#D4B8A5] cursor-pointer"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => { setDiscountValue(0); setIsDiscountModalOpen(false); }}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl cursor-pointer"
              >
                Xóa giảm giá
              </button>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                className="px-4 py-2 bg-[#4A3525] text-white text-xs font-bold rounded-xl shadow cursor-pointer"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          8. MODAL THÔNG TIN KHÁCH HÀNG
      ───────────────────────────────────────────────────────────── */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 border border-gray-200 space-y-4 shadow-2xl animate-scaleIn">
            <h3 className="font-extrabold text-base text-gray-900">Thông tin khách hàng</h3>
            <input
              type="text"
              placeholder="Tên khách hàng / Số điện thoại..."
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#4A3525]"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="px-4 py-2 bg-[#4A3525] text-white text-xs font-bold rounded-xl shadow cursor-pointer"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          9. DRAWER DANH SÁCH ĐƠN HÀNG CHƯA THANH TOÁN
      ───────────────────────────────────────────────────────────── */}
      {isUnpaidOrdersDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slideLeft">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base text-gray-900">Đơn hàng chưa thanh toán</h3>
                <p className="text-[11px] text-gray-500">Tổng cộng {unpaidOrders.length} hóa đơn đang mở</p>
              </div>
              <button
                onClick={() => setIsUnpaidOrdersDrawerOpen(false)}
                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {unpaidOrders.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p className="text-xs font-bold">Không có đơn hàng nào chưa thanh toán</p>
                </div>
              ) : (
                unpaidOrders.map(order => (
                  <div
                    key={order.id}
                    onClick={() => {
                      const matchedTable = tables.find(t => t.id === order.table_id);
                      if (matchedTable) {
                        handleSelectTable(matchedTable);
                      }
                      setIsUnpaidOrdersDrawerOpen(false);
                    }}
                    className="p-3.5 bg-gray-50 hover:bg-[#FAF6F0] border border-gray-200 rounded-2xl cursor-pointer transition space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-sm text-gray-900">
                        {order.tables?.table_name || 'Khách mang về'}
                      </span>
                      <span className="font-black text-sm text-[#4A3525]">
                        {Number(order.total_amount).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-500">
                      <span>{new Date(order.created_at).toLocaleString('vi-VN')}</span>
                      <span>Thu ngân: {order.users?.full_name || 'Admin'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
