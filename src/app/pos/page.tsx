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
  QrCode
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
  const [yesterdaySales, setYesterdaySales] = useState<{ [productId: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Điều hướng hiển thị: 'menu' (gọi món) hoặc 'tables' (sơ đồ bàn)
  const [viewMode, setViewMode] = useState<'menu' | 'tables'>('menu');
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
  const [numpadActiveMode, setNumpadActiveMode] = useState<'qty' | 'percent' | 'price'>('qty');

  // Đơn hàng đang phục vụ của bàn (nếu bàn đã có đơn trước đó)
  const [existingOrder, setExistingOrder] = useState<any>(null);
  const [existingOrderItems, setExistingOrderItems] = useState<any[]>([]);

  // Hóa đơn nhỏ Barista / Bếp (Kitchen Queue Bar)
  const [completedKitchenOrderIds, setCompletedKitchenOrderIds] = useState<string[]>([]);
  const [selectedKitchenTicket, setSelectedKitchenTicket] = useState<any>(null);

  // Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isUnpaidOrdersDrawerOpen, setIsUnpaidOrdersDrawerOpen] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Tiền mặt');
  const [customerCashGiven, setCustomerCashGiven] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tải danh sách đơn đã làm xong của bếp trong ngày từ LocalStorage
  useEffect(() => {
    try {
      const todayKey = new Date().toLocaleDateString('en-CA');
      const storedDone = localStorage.getItem(`ava_kitchen_done_${todayKey}`);
      if (storedDone) {
        setCompletedKitchenOrderIds(JSON.parse(storedDone));
      }
    } catch (_) {}
  }, []);

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

  // Làm mới dữ liệu bàn & đơn hàng
  const refreshData = async () => {
    try {
      const [tablesData, unpaidData] = await Promise.all([
        db.getTables(),
        db.getUnpaidOrders()
      ]);
      setTables(tablesData);
      setUnpaidOrders(unpaidData);
      try {
        localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
        localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
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
        const storedYest = localStorage.getItem(`ava_pos_yest_sales_${todayDateKey}`);

        if (storedTables && storedCategories && storedProducts) {
          const parsedTables = JSON.parse(storedTables);
          setTables(parsedTables);
          setCategories(JSON.parse(storedCategories));
          setProducts(JSON.parse(storedProducts));
          if (storedUnpaid) setUnpaidOrders(JSON.parse(storedUnpaid));
          if (storedYest) setYesterdaySales(JSON.parse(storedYest));
          if (!selectedTable && parsedTables.length > 0) {
            setSelectedTable(parsedTables[0]);
          }
          setLoading(false);
        }
      } catch (_) {}

      // 2. Tải dữ liệu mới nhất
      try {
        const [tablesData, categoriesData, productsData, unpaidData] = await Promise.all([
          db.getTables(),
          db.getCategories(),
          db.getProducts(),
          db.getUnpaidOrders()
        ]);

        setTables(tablesData);
        setCategories(categoriesData);
        setProducts(productsData);
        setUnpaidOrders(unpaidData);

        if (!selectedTable && tablesData.length > 0) {
          const defaultTable = tablesData.find((t: any) => t.table_name === 'Khách mang về') || tablesData[0];
          setSelectedTable(defaultTable);
        }

        try {
          localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
          localStorage.setItem('ava_pos_cache_categories', JSON.stringify(categoriesData));
          localStorage.setItem('ava_pos_cache_products', JSON.stringify(productsData));
          localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
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

  // Đồng bộ giỏ hàng sang Màn hình phụ 11.6 inch cho khách
  useEffect(() => {
    const syncToSecondaryDisplay = async () => {
      try {
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
  }, [cart, selectedTable, discountAmount, finalTotalAmount, currentUser]);

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
    if (cart.length === 0) return;
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
      // Nếu không gõ số, tăng thêm 1
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

  // CHỌN BÀN
  const handleSelectTable = async (table: any) => {
    setSelectedTable(table);
    setViewMode('menu');
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

  // XÁC NHẬN THANH TOÁN (TIỀN MẶT / CHUYỂN KHOẢN)
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
        }
      }

      if (!orderIdToPay) {
        toast.error('Chưa có món ăn nào để thanh toán!');
        setSubmittingPayment(false);
        return;
      }

      // 2. Xác nhận thanh toán trong Database
      await db.payOrder(orderIdToPay, paymentMethod);

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

      toast.success(`Thanh toán thành công ${selectedTable?.table_name}!`);
      setIsPayModalOpen(false);
      handleClearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
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

  // DANH SÁCH HÓA ĐƠN CHỜ PHA CHẾ TRÊN THANH ĐỈNH (KITCHEN QUEUE TICKETS)
  const pendingKitchenOrders = useMemo(() => {
    return unpaidOrders.filter(order => !completedKitchenOrderIds.includes(order.id));
  }, [unpaidOrders, completedKitchenOrderIds]);

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
        <Loader2 className="w-12 h-12 text-[#6B5B95] animate-spin" />
        <p className="text-sm font-bold text-gray-700">Đang chuẩn bị màn hình POS CPOS 603...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#F4F5F7] text-gray-900 select-none overflow-hidden font-sans">
      
      {/* ─────────────────────────────────────────────────────────────
          1. TOP NAVIGATION & KITCHEN LIVE QUEUE BAR
      ───────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-200 px-3 flex items-center justify-between shrink-0 shadow-xs z-30">
        {/* Nút Tab: Bàn | Đăng ký | Đơn hàng */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            onClick={() => setViewMode(prev => prev === 'tables' ? 'menu' : 'tables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
              viewMode === 'tables'
                ? 'bg-[#6B5B95] text-white border-[#6B5B95] shadow-xs'
                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Bàn</span>
            {tables.filter(t => t.status === 'Đang phục vụ').length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-black">
                {tables.filter(t => t.status === 'Đang phục vụ').length}
              </span>
            )}
          </button>

          <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border border-gray-200">
            <span>Đăng ký</span>
            <span className="font-bold text-[#6B5B95]">
              {selectedTable ? selectedTable.table_name : 'Chưa chọn'}
            </span>
          </div>

          <button
            onClick={() => setIsUnpaidOrdersDrawerOpen(true)}
            className="px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 flex items-center space-x-1.5 transition"
          >
            <span>Đơn hàng</span>
            <span className="px-1.5 py-0.2 bg-[#00A896] text-white rounded-full text-[10px] font-black">
              {unpaidOrders.length}
            </span>
          </button>
        </div>

        {/* THANH HÓA ĐƠN NHỎ BẾP / PHA CHẾ (KITCHEN QUEUE TICKETS) */}
        <div className="flex-1 mx-3 overflow-x-auto no-scrollbar flex items-center space-x-2 py-1">
          {pendingKitchenOrders.length === 0 ? (
            <div className="text-[11px] text-gray-400 italic flex items-center space-x-1 px-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Không có đơn chờ làm</span>
            </div>
          ) : (
            pendingKitchenOrders.map((order) => {
              const orderTime = new Date(order.created_at);
              const minutesAgo = Math.floor((Date.now() - orderTime.getTime()) / 60000);
              const isUrgent = minutesAgo >= 10;
              const tableName = order.tables?.table_name || 'Khách mang về';

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedKitchenTicket(order)}
                  className={`shrink-0 flex items-center space-x-2 px-2.5 py-1 rounded-lg text-xs border cursor-pointer transition-all hover:scale-[1.02] shadow-2xs ${
                    isUrgent 
                      ? 'bg-red-50 border-red-300 text-red-900 animate-pulse'
                      : 'bg-amber-50/80 border-amber-300 text-amber-950'
                  }`}
                  title="Bấm để xem chi tiết hoặc bấm 'Làm xong' để đơn biến mất"
                >
                  <span className="font-extrabold">{tableName}</span>
                  <span className="text-[10px] text-gray-500 font-medium">{minutesAgo}p</span>
                  <button
                    onClick={(e) => handleMarkKitchenOrderDone(order.id, e)}
                    className="p-1 hover:bg-emerald-500 hover:text-white bg-emerald-100 text-emerald-800 rounded-md transition font-black text-[10px] flex items-center space-x-0.5"
                    title="Đã pha chế xong • Đơn tự biến mất"
                  >
                    <Check className="w-3 h-3" />
                    <span>Xong</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Ô Tìm kiếm & Tiện ích bên phải */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 bg-gray-50 pl-8 pr-7 rounded-lg text-xs border border-gray-200 focus:outline-none focus:border-[#6B5B95] text-gray-800 placeholder-gray-400 transition"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={async () => {
              await openCustomerDisplayWindow();
            }}
            className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs transition"
            title="Mở màn hình phụ 11.6 inch cho khách xem"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs transition"
            title="Bật/Tắt Toàn màn hình"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <Link
            href="/"
            className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs transition"
            title="Về Trang chủ Quản lý"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>

          {/* Avatar User */}
          <div className="w-7 h-7 rounded-full bg-[#6B5B95] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'M'}
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. NỘI DUNG CHÍNH (SƠ ĐỒ BÀN HOẶC GIAO DIỆN BÁN HÀNG)
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'tables' ? (
        /* GIAO DIỆN SƠ ĐỒ BÀN */
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-black text-gray-800">Sơ đồ bàn phục vụ</h2>
              <p className="text-xs text-gray-500">Chạm vào bàn trống để gọi món mới, hoặc chạm vào bàn đang phục vụ để xem hóa đơn / thanh toán</p>
            </div>
            <button
              onClick={() => setViewMode('menu')}
              className="px-4 py-2 bg-[#6B5B95] hover:bg-[#584980] text-white text-xs font-bold rounded-xl shadow-xs transition"
            >
              Về màn hình gọi món
            </button>
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
                const unpaidMatch = unpaidOrders.find(o => o.table_id === table.id);

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`h-32 p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                      isOccupied
                        ? 'bg-amber-50/90 border-amber-300 shadow-xs'
                        : selectedTable?.id === table.id
                        ? 'bg-purple-50/70 border-[#6B5B95] shadow-xs'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
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
                      <h4 className="font-black text-base text-gray-800">{table.table_name}</h4>
                      {isOccupied && unpaidMatch && (
                        <p className="text-xs font-extrabold text-[#6B5B95] mt-0.5">
                          {Number(unpaidMatch.total_amount || 0).toLocaleString('vi-VN')} đ
                        </p>
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
                          ? 'bg-[#EFE8F6] text-purple-950 font-semibold' 
                          : 'hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-2">
                        <span className={`w-5 text-center font-extrabold text-xs shrink-0 ${
                          isSelected ? 'text-[#6B5B95]' : 'text-gray-900'
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
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs"
              >
                <span>Khách hàng</span>
              </button>
              <button
                onClick={() => setIsNotesModalOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs"
              >
                <span>Ghi chú</span>
              </button>
              <button
                onClick={() => setIsDiscountModalOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs"
              >
                <span>Giảm giá</span>
              </button>
              <button
                onClick={() => setIsUnpaidOrdersDrawerOpen(true)}
                className="py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg flex flex-col items-center justify-center space-y-0.5 transition shadow-2xs"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* BÀN PHÍM SỐ CẢM ỨNG POS (4x4 MATRIX) */}
            <div className="p-2 bg-gray-50 border-t border-gray-200 grid grid-cols-4 gap-1.5 shrink-0">
              {/* Hàng 1 */}
              <button
                onClick={() => handleNumpadDigit('1')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                1
              </button>
              <button
                onClick={() => handleNumpadDigit('2')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                2
              </button>
              <button
                onClick={() => handleNumpadDigit('3')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                3
              </button>
              <button
                onClick={handleNumpadSL}
                className="h-11 bg-[#E8DAEF] hover:bg-[#D2B4DE] border border-[#D2B4DE] rounded-xl text-xs font-black text-[#512E5F] shadow-2xs transition"
                title="Thay đổi số lượng"
              >
                SL
              </button>

              {/* Hàng 2 */}
              <button
                onClick={() => handleNumpadDigit('4')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                4
              </button>
              <button
                onClick={() => handleNumpadDigit('5')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                5
              </button>
              <button
                onClick={() => handleNumpadDigit('6')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                6
              </button>
              <button
                onClick={handleNumpadPercent}
                className="h-11 bg-[#EAECEE] hover:bg-[#D5D8DC] border border-[#D5D8DC] rounded-xl text-xs font-black text-[#2C3E50] shadow-2xs transition"
                title="Giảm giá %"
              >
                %
              </button>

              {/* Hàng 3 */}
              <button
                onClick={() => handleNumpadDigit('7')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                7
              </button>
              <button
                onClick={() => handleNumpadDigit('8')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                8
              </button>
              <button
                onClick={() => handleNumpadDigit('9')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                9
              </button>
              <button
                onClick={handleNumpadPrice}
                className="h-11 bg-[#EAECEE] hover:bg-[#D5D8DC] border border-[#D5D8DC] rounded-xl text-xs font-bold text-[#2C3E50] shadow-2xs transition"
                title="Đổi đơn giá"
              >
                Giá
              </button>

              {/* Hàng 4 */}
              <button
                onClick={handleNumpadToggleSign}
                className="h-11 bg-[#FEF3CD] hover:bg-[#FFE69C] border border-[#FFE69C] rounded-xl text-sm font-black text-[#725100] shadow-2xs transition"
                title="Giảm 1 số lượng"
              >
                +/-
              </button>
              <button
                onClick={() => handleNumpadDigit('0')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                0
              </button>
              <button
                onClick={() => handleNumpadDigit(',')}
                className="h-11 bg-white hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-xl text-base font-bold text-gray-800 shadow-2xs transition"
              >
                ,
              </button>
              <button
                onClick={handleNumpadBackspace}
                className="h-11 bg-[#FADBD8] hover:bg-[#F5B7B1] border border-[#F5B7B1] rounded-xl text-sm font-black text-[#78281F] shadow-2xs transition flex items-center justify-center"
                title="Xóa lùi"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {/* HÀNG NÚT DƯỚI CÙNG: MỚI & THANH TOÁN TÍM */}
            <div className="p-2.5 bg-white border-t border-gray-200 grid grid-cols-3 gap-2 shrink-0">
              <button
                onClick={handleClearCart}
                className="py-3 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl font-bold text-xs text-gray-700 transition active:scale-95 shadow-2xs"
              >
                Mới
              </button>
              <button
                onClick={() => {
                  if (cart.length === 0 && (!existingOrderItems || existingOrderItems.length === 0)) {
                    toast.info('Vui lòng chọn ít nhất 1 món để thanh toán');
                    return;
                  }
                  setIsPayModalOpen(true);
                }}
                className="col-span-2 py-3 bg-[#6B5B95] hover:bg-[#584980] active:scale-[0.98] text-white rounded-xl font-black text-sm shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>Thanh toán</span>
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
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 border ${
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
                      isSelected ? 'shadow-xs ring-2 ring-purple-400' : 'hover:opacity-90'
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
                              // Khi ảnh lỗi thì ẩn thẻ img và fallback sang icon
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
          3. MODAL THANH TOÁN (TIỀN MẶT / CHUYỂN KHOẢN VIETQR)
      ───────────────────────────────────────────────────────────── */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 animate-scaleIn">
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
                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tổng tiền cần thanh toán */}
              <div className="bg-purple-50/70 border border-purple-200 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-xs font-bold text-purple-950 uppercase tracking-wide">Tổng tiền cần thu:</span>
                <span className="text-2xl font-black text-[#6B5B95]">
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
                      ? 'bg-[#6B5B95] text-white border-[#6B5B95] shadow-xs'
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
                      ? 'bg-[#6B5B95] text-white border-[#6B5B95] shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <QrCode className="w-5 h-5" />
                  <span>Chuyển khoản (VietQR)</span>
                </button>
              </div>

              {/* Nếu là Chuyển khoản -> Gợi ý mã QR */}
              {paymentMethod === 'Chuyển khoản' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-2">
                  <p className="text-xs font-bold text-blue-900">
                    Mã VietQR đã tự động đồng bộ sang màn hình phụ 11.6 inch cho khách quét
                  </p>
                  <p className="text-[11px] text-blue-700">
                    Khách chuyển xong, thu ngân bấm "Xác nhận & In bill" bên dưới
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition"
              >
                Đóng
              </button>

              <button
                type="button"
                disabled={submittingPayment}
                onClick={handleProcessPayment}
                className="px-6 py-2.5 bg-[#6B5B95] hover:bg-[#584980] text-white font-black text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
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
          4. MODAL CHI TIẾT VÉ BẾP / BARISTA TICKET MODAL
      ───────────────────────────────────────────────────────────── */}
      {selectedKitchenTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl p-5 border border-gray-200 animate-scaleIn space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">
                  {selectedKitchenTicket.tables?.table_name || 'Khách mang về'}
                </h3>
                <p className="text-[10px] text-gray-500">
                  Thời gian đặt: {new Date(selectedKitchenTicket.created_at).toLocaleTimeString('vi-VN')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedKitchenTicket(null)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chi tiết đơn */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-700">Món cần pha chế:</p>
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                <p className="text-gray-800">
                  Tổng tiền: <strong className="text-[#6B5B95]">{Number(selectedKitchenTicket.total_amount).toLocaleString('vi-VN')}đ</strong>
                </p>
                {selectedKitchenTicket.notes && (
                  <p className="text-amber-800 font-medium">
                    📝 Ghi chú: {selectedKitchenTicket.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setSelectedKitchenTicket(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  handleMarkKitchenOrderDone(selectedKitchenTicket.id);
                  setSelectedKitchenTicket(null);
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow transition flex items-center justify-center space-x-1"
              >
                <Check className="w-4 h-4" />
                <span>Đã làm xong</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. MODAL GHI CHÚ ĐƠN HÀNG
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
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#6B5B95]"
            />
            {/* Gợi ý nhanh */}
            <div className="flex flex-wrap gap-1.5">
              {['Ít đường', 'Không đường', 'Ít đá', 'Nhiều đá', 'Mang về', 'Uống tại chỗ'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setOrderNotes(prev => prev ? `${prev}, ${tag}` : tag)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-700 transition"
                >
                  +{tag}
                </button>
              ))}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsNotesModalOpen(false)}
                className="px-4 py-2 bg-[#6B5B95] text-white text-xs font-bold rounded-xl shadow transition"
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. MODAL GIẢM GIÁ
      ───────────────────────────────────────────────────────────── */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 border border-gray-200 space-y-4 shadow-2xl animate-scaleIn">
            <h3 className="font-extrabold text-base text-gray-900">Giảm giá / Chiết khấu</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`py-2 rounded-xl text-xs font-bold transition border ${
                  discountType === 'percent' ? 'bg-[#6B5B95] text-white border-[#6B5B95]' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Phần trăm (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('amount')}
                className={`py-2 rounded-xl text-xs font-bold transition border ${
                  discountType === 'amount' ? 'bg-[#6B5B95] text-white border-[#6B5B95]' : 'bg-gray-100 text-gray-700'
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
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:border-[#6B5B95]"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 10, 15, 20].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setDiscountType('percent'); setDiscountValue(p); }}
                  className="py-1.5 bg-purple-50 hover:bg-purple-100 text-[#6B5B95] font-black text-xs rounded-lg border border-purple-200"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => { setDiscountValue(0); setIsDiscountModalOpen(false); }}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl"
              >
                Xóa giảm giá
              </button>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                className="px-4 py-2 bg-[#6B5B95] text-white text-xs font-bold rounded-xl shadow"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. MODAL THÔNG TIN KHÁCH HÀNG
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
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#6B5B95]"
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="px-4 py-2 bg-[#6B5B95] text-white text-xs font-bold rounded-xl shadow"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          8. DRAWER DANH SÁCH ĐƠN HÀNG CHƯA THANH TOÁN
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
                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg"
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
                    className="p-3.5 bg-gray-50 hover:bg-purple-50/50 border border-gray-200 rounded-2xl cursor-pointer transition space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-sm text-gray-900">
                        {order.tables?.table_name || 'Khách mang về'}
                      </span>
                      <span className="font-black text-sm text-[#6B5B95]">
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
