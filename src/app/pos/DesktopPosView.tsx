'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  db,
  getCurrentUser,
  isSupabaseConfigured,
  onRealtimeEvent,
  getDefaultCupId,
  getCupLabel,
  generateShortId,
  resolveItemCupId,
  stripCupTag,
  logoutCurrentUser,
  createCoalescedRefresher
} from '@/lib/database';
import { toast } from '@/lib/toast';
import { printOrderDirect, tryAcquirePrintLock, markOrderAsPrinted, isOrderAlreadyPrinted, OrderData } from '@/lib/printerService';
import { getVietQrUrl, TECHCOMBANK_INFO } from '@/lib/vietqr';
import { 
  syncCustomerDisplay, 
  openCustomerDisplayWindow, 
  kickCashDrawer 
} from '@/lib/tauriPOS';
import TauriFullscreenButton from '@/components/TauriFullscreenButton';
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
  ArrowRight,
  Scissors,
  GitMerge,
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
  PhoneCall,
  Printer,
  LogOut
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
  cup_id?: string;
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
  'c_nuocep': { 
    bg: '#FFE8D6', 
    border: '#FFBF99', 
    text: '#803400', 
    bar: '#F97316' 
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

// Chuyển 1 dòng món (từ DB, bộ nhớ hoặc giỏ hàng) về đúng định dạng dòng giỏ hàng POS,
// loại ly được xác định lại theo công thức định lượng hiện hành.
function toCartItem(i: any, recipesList: any[]): CartItem {
  const unitPrice = Number(i.unit_price || i.don_gia || i.price || 0);
  const qty = Number(i.quantity || i.so_luong || 1);
  const notes = i.ghi_chu || i.notes || '';
  const productId = i.product_id || i.idsp || i.id;
  const name = i.products?.name || i.ten_san_pham || i.name || 'Món';
  return {
    product_id: productId,
    name,
    price: unitPrice,
    quantity: qty,
    subtotal: Number(i.subtotal || i.thanh_tien || (qty * unitPrice)),
    notes,
    cup_id: resolveItemCupId(productId, name, notes, i.cup_id, recipesList)
  };
}

// Dấu vân tay danh sách món (dùng để biết giỏ hàng có thay đổi so với đơn đã lưu hay không)
function cartSignature(items: CartItem[]): string {
  return items
    .map(i => `${i.product_id}|${Number(i.quantity)}|${Number(i.price)}|${stripCupTag(i.notes)}|${i.cup_id || ''}`)
    .sort()
    .join(';');
}

// Có món mới gọi thêm (hoặc tăng số lượng) so với đơn đã lưu hay không
function hasAddedItems(nextItems: CartItem[], prevItems: CartItem[]): boolean {
  const before = new Map<string, number>();
  prevItems.forEach(i => before.set(i.product_id, (before.get(i.product_id) || 0) + Number(i.quantity || 0)));
  const after = new Map<string, number>();
  nextItems.forEach(i => after.set(i.product_id, (after.get(i.product_id) || 0) + Number(i.quantity || 0)));
  for (const [productId, qty] of after) {
    if (qty > (before.get(productId) || 0)) return true;
  }
  return false;
}

// Dòng món đầy đủ các tên trường (cho danh sách đơn bếp / đơn chưa thanh toán trong bộ nhớ)
function toOrderItemRecord(item: CartItem, orderId: string) {
  return {
    id: generateShortId('item_'),
    order_id: orderId,
    product_id: item.product_id,
    name: item.name,
    ten_san_pham: item.name,
    quantity: item.quantity,
    so_luong: item.quantity,
    price: item.price,
    unit_price: item.price,
    don_gia: item.price,
    subtotal: item.subtotal,
    thanh_tien: item.subtotal,
    notes: item.notes,
    ghi_chu: item.notes,
    cup_id: item.cup_id
  };
}

function errorMessage(err: any): string {
  return err?.message || err?.toString?.() || 'Lỗi không xác định';
}

export default function DesktopPosView({ onSwitchToMobile }: { onSwitchToMobile?: () => void }) {
  // Dữ liệu chính
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
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

  // Trạng thái chuyển bàn
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  // Trạng thái Gộp bàn (Table Merge)
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [selectedSourceTableIds, setSelectedSourceTableIds] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  // Trạng thái Tách hóa đơn (Split Bill)
  // splitQtys[i] = số lượng của dòng món thứ i trong giỏ hàng mà khách này muốn trả riêng
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitQtys, setSplitQtys] = useState<number[]>([]);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<'Tiền mặt' | 'Chuyển khoản'>('Tiền mặt');
  const [splitting, setSplitting] = useState(false);

  const splitCart = useMemo<CartItem[]>(() => (
    cart
      .map((item, idx) => ({ item, qty: Math.min(item.quantity, splitQtys[idx] || 0) }))
      .filter(x => x.qty > 0)
      .map(({ item, qty }) => ({ ...item, quantity: qty, subtotal: qty * item.price }))
  ), [cart, splitQtys]);

  const splitRemainingCart = useMemo<CartItem[]>(() => (
    cart
      .map((item, idx) => ({ item, qty: item.quantity - Math.min(item.quantity, splitQtys[idx] || 0) }))
      .filter(x => x.qty > 0)
      .map(({ item, qty }) => ({ ...item, quantity: qty, subtotal: qty * item.price }))
  ), [cart, splitQtys]);

  // Chống bấm 2 lần / thanh toán chồng
  const isPayingRef = useRef(false);
  // Mã đơn ổn định cho lần lưu/thanh toán đang thực hiện: bấm lại sau khi mạng lỗi sẽ dùng lại đúng mã đơn cũ
  // -> server nhận ra đơn đã tồn tại, tuyệt đối không tạo đơn trùng / tính tiền 2 lần.
  const pendingOrderRef = useRef<{ key: string; id: string } | null>(null);
  const getStableOrderId = (key: string) => {
    if (pendingOrderRef.current?.key === key) return pendingOrderRef.current.id;
    const id = generateShortId('ord_');
    pendingOrderRef.current = { key, id };
    return id;
  };

  // Chọn bàn: chỉ áp dụng kết quả tải của LẦN CHỌN BÀN MỚI NHẤT (bấm nhanh bàn A rồi bàn B không bị lẫn món)
  const selectTableRequestRef = useRef(0);
  // Thu ngân đã thao tác giỏ hàng sau khi chọn bàn chưa (để không ghi đè món vừa bấm)
  const cartTouchedRef = useRef(false);

  // Menu tài khoản trên header POS
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Đăng xuất tài khoản ngay tại màn hình POS
  const handleLogout = () => {
    setIsUserMenuOpen(false);
    if (cart.length > 0 && !existingOrder) {
      const ok = window.confirm('Giỏ hàng còn món CHƯA LƯU. Đăng xuất sẽ bỏ các món này. Bạn vẫn muốn đăng xuất?');
      if (!ok) return;
    }
    syncCustomerDisplay({ items: [], totalAmount: 0, orderStatus: 'idle' }).catch(() => {});
    logoutCurrentUser();
  };

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

  // Đánh dấu đơn bếp đã làm xong và tự động biến mất (Đồng bộ vĩnh viễn vào DB)
  const handleMarkKitchenOrderDone = async (orderId: string, e?: React.MouseEvent) => {
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

    try {
      await db.markKitchenOrderDone(orderId);
    } catch (err) {
      console.warn('Lỗi lưu trạng thái pha chế vào server:', err);
    }
  };

  // Xử lý chuyển bàn phục vụ
  const handleConfirmTransfer = async () => {
    if (!selectedTable || !transferTargetId || !existingOrder?.id) return;
    setTransferring(true);
    try {
      await db.transferTable(selectedTable.id, transferTargetId, existingOrder.id);
      const targetTable = tables.find(t => t.id === transferTargetId);
      toast.success(`Đã chuyển toàn bộ món từ ${selectedTable.table_name} sang ${targetTable?.table_name || 'Bàn mới'}!`);
      setIsTransferModalOpen(false);
      setTransferTargetId('');
      if (targetTable) {
        setSelectedTable(targetTable);
      }
      await refreshData();
    } catch (e) {
      console.error('Lỗi chuyển bàn:', e);
      toast.error('Gặp lỗi khi chuyển bàn');
    } finally {
      setTransferring(false);
    }
  };

  // Xử lý Gộp bàn phục vụ
  const handleConfirmMerge = async () => {
    if (!selectedTable || selectedSourceTableIds.length === 0 || !existingOrder?.id) return;
    setMerging(true);
    try {
      const res: any = await db.mergeTables(selectedTable.id, selectedSourceTableIds, existingOrder.id);
      // Giỏ hàng + đơn hiện tại khớp 100% với đơn đã gộp trên server (tránh in lại "gọi thêm món" sai)
      const mergedCart = (res.items || []).map((i: any) => toCartItem(i, recipes));
      const mergedRecords = mergedCart.map((i: CartItem) => toOrderItemRecord(i, existingOrder.id));
      cartTouchedRef.current = false;
      setCart(mergedCart);
      setExistingOrderItems(mergedRecords);
      setExistingOrder((prev: any) => prev ? {
        ...prev,
        total_amount: res.totalAmount,
        discount: res.discount ?? prev.discount,
        kitchen_done: false,
        order_items: mergedRecords
      } : prev);
      setDiscountType('amount');
      setDiscountValue(Number(res.discount ?? existingOrder.discount ?? 0));
      setIsMergeModalOpen(false);
      setSelectedSourceTableIds([]);
      toast.success(`Đã gộp thành công các bàn vào ${selectedTable.table_name}!`);
      await refreshData();
    } catch (e) {
      console.error('Lỗi gộp bàn:', e);
      toast.error('Gặp lỗi khi gộp bàn');
    } finally {
      setMerging(false);
    }
  };

  // Mở modal tách bill / chia đơn
  const handleOpenSplitModal = () => {
    let sourceCart = cart;
    if (sourceCart.length === 0 && existingOrderItems.length > 0) {
      sourceCart = existingOrderItems.map((i: any) => toCartItem(i, recipes));
      setCart(sourceCart);
    }
    setSplitQtys(new Array(sourceCart.length).fill(0));
    setSplitPaymentMethod('Tiền mặt');
    setIsSplitModalOpen(true);
  };

  // Cập nhật số lượng món (theo dòng trong giỏ) muốn tách trả tiền riêng
  const handleSetSplitItemQty = (index: number, newSplitQty: number) => {
    const originalItem = cart[index];
    if (!originalItem) return;
    const clampedQty = Math.max(0, Math.min(originalItem.quantity, newSplitQty));
    setSplitQtys(prev => {
      const next = cart.map((_, i) => prev[i] || 0);
      next[index] = clampedQty;
      return next;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // XÁC NHẬN TÁCH HÓA ĐƠN: KHÁCH NÀY TRẢ TRƯỚC PHẦN ĐÃ CHỌN
  // Quy trình an toàn (không bao giờ mất món, không tính tiền 2 lần):
  //   1. Cập nhật đơn gốc của bàn chỉ còn các món chưa trả
  //   2. Tạo 1 đơn MỚI RIÊNG BIỆT cho phần tách (không gộp ngược vào đơn gốc)
  //   3. In bill riêng + thanh toán đơn tách (trừ kho đúng phần tách, cộng doanh thu đúng phần tách)
  //   Bàn vẫn giữ trạng thái "Đang phục vụ" cho phần còn lại.
  // ─────────────────────────────────────────────────────────────
  const handleConfirmSplit = async () => {
    if (splitCart.length === 0 || splitting || isPayingRef.current) return;

    // Khách trả toàn bộ các món -> chính là thanh toán cả bàn
    if (splitRemainingCart.length === 0) {
      setIsSplitModalOpen(false);
      await handleProcessPayment(splitPaymentMethod);
      return;
    }

    isPayingRef.current = true;
    setSplitting(true);

    const table = selectedTable;
    const tableName = table?.table_name || 'Bàn';
    const sourceOrder = existingOrder;
    const fullCart = [...cart];
    const splitItems = [...splitCart];
    const remainingItems = [...splitRemainingCart];
    const method = splitPaymentMethod;
    const notesTrim = orderNotes.trim();

    const splitTotal = splitItems.reduce((s, i) => s + i.subtotal, 0);
    const remainingSubtotal = remainingItems.reduce((s, i) => s + i.subtotal, 0);
    // Giảm giá của bàn được giữ cho phần còn lại (tính lại theo số tiền còn lại)
    const remainingDiscount = discountType === 'percent'
      ? Math.min(remainingSubtotal, Math.round((remainingSubtotal * Math.min(100, Math.max(0, Number(discountValue) || 0))) / 100))
      : Math.min(remainingSubtotal, discountAmount);
    const remainingTotal = Math.max(0, remainingSubtotal - remainingDiscount);

    const sourceItems = existingOrderItems.map((i: any) => toCartItem(i, recipes));
    const sourceKitchenDone = !!sourceOrder && isOrderKitchenDone(sourceOrder);
    const cartHasNewItems = sourceOrder ? hasAddedItems(fullCart, sourceItems) : true;

    let sourceUpdated = false;
    let splitOrderId: string | null = null;

    try {
      // 1. Đơn gốc chỉ còn lại các món chưa trả
      if (sourceOrder?.id) {
        await db.syncUnpaidOrder(sourceOrder.id, {
          total_amount: remainingTotal,
          discount: remainingDiscount,
          notes: notesTrim,
          items: remainingItems,
          kitchen_done: sourceKitchenDone && !cartHasNewItems
        });
        sourceUpdated = true;
      }

      // 2. Tạo đơn riêng cho phần tách
      const newOrderId = getStableOrderId(`split|${table?.id || ''}|${cartSignature(splitItems)}|${splitTotal}`);
      reservePrintForNewOrder(newOrderId, splitItems.length, splitTotal, true);
      await db.createOrder({
        id: newOrderId,
        table_id: table?.id || 'tb_mangve',
        staff_id: currentUser?.id || 'admin',
        total_amount: splitTotal,
        discount: 0,
        notes: `Tách từ ${tableName}`,
        items: splitItems,
        force_new: true,
        kitchen_done: sourceKitchenDone && !cartHasNewItems
      });
      splitOrderId = newOrderId;

      // 3. In bill riêng ngay (không chờ máy in) rồi chốt thanh toán
      if (!locallyPrintedIdsRef.current.has(newOrderId)) {
        printInBackground(newOrderId, {
          tableName: `${tableName} (Tách bill)`,
          staffName: currentUser?.full_name || 'Admin',
          items: splitItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, subtotal: i.subtotal })),
          totalAmount: splitTotal,
          discount: 0,
          notes: '(ĐÃ THANH TOÁN)'
        }, true);
      }
      await db.payOrder(newOrderId, method);
      pendingOrderRef.current = null;
      kickCashDrawer().catch(() => {});

      // 4. Cập nhật giao diện: bàn chỉ còn các món chưa trả
      const remainingRecords = remainingItems.map(i => toOrderItemRecord(i, sourceOrder?.id || ''));
      setCart(remainingItems);
      setSplitQtys([]);
      setSelectedCartIndex(-1);
      if (discountType === 'amount') setDiscountValue(remainingDiscount);
      if (sourceOrder) {
        const updatedSource = { ...sourceOrder, total_amount: remainingTotal, discount: remainingDiscount, order_items: remainingRecords };
        setExistingOrder(updatedSource);
        setExistingOrderItems(remainingRecords);
        setUnpaidOrders(prev => prev.map(o => o.id === sourceOrder.id ? updatedSource : o));
      }
      if (!(sourceKitchenDone && !cartHasNewItems)) {
        setRecentOrders(prev => [{
          id: newOrderId,
          table_id: table?.id || 'tb_mangve',
          total_amount: splitTotal,
          discount: 0,
          payment_status: 'Đã thanh toán',
          payment_method: method,
          notes: `Tách từ ${tableName}`,
          tables: { table_name: tableName },
          users: { full_name: currentUser?.full_name || 'Admin' },
          created_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
          kitchen_done: false,
          order_items: splitItems.map(i => toOrderItemRecord(i, newOrderId))
        }, ...prev.filter(o => o.id !== newOrderId)]);
      }

      setIsSplitModalOpen(false);
      toast.success(`Đã thu ${splitTotal.toLocaleString('vi-VN')} đ phần tách! ${tableName} còn lại ${remainingTotal.toLocaleString('vi-VN')} đ.`);
      scheduleRefresh();
    } catch (e) {
      console.error('Lỗi tách hóa đơn:', e);
      if (splitOrderId) {
        // Đơn tách đã được tạo nhưng chưa chốt được tiền -> đơn tách nằm trong "Đơn chưa TT" của bàn
        setCart(remainingItems);
        setSplitQtys([]);
        setIsSplitModalOpen(false);
        toast.error(`Đã tách đơn nhưng chưa thanh toán được (${errorMessage(e)}). Mở "Đơn chưa TT" để thanh toán lại phần tách.`);
        scheduleRefresh();
      } else {
        if (sourceUpdated && sourceOrder?.id) {
          // Khôi phục lại đơn gốc đầy đủ món như trước khi tách
          try {
            await db.syncUnpaidOrder(sourceOrder.id, {
              total_amount: finalTotalAmount,
              discount: discountAmount,
              notes: notesTrim,
              items: fullCart,
              kitchen_done: sourceKitchenDone && !cartHasNewItems
            });
          } catch (restoreErr) {
            console.error('Lỗi khôi phục đơn gốc sau khi tách thất bại:', restoreErr);
          }
        }
        toast.error(`Chưa tách được hóa đơn (${errorMessage(e)}). Vui lòng thử lại.`);
      }
    } finally {
      isPayingRef.current = false;
      setSplitting(false);
    }
  };

  // Thanh toán nhanh trực tiếp từ thẻ hóa đơn bếp hoặc đơn chưa thanh toán
  const handleQuickPayFromTicket = async (order: any) => {
    // Đang chọn món dở cho bàn khác -> hỏi lại trước khi thay giỏ hàng (tránh mất món chưa lưu)
    if (cartTouchedRef.current && cart.length > 0 && order.id !== existingOrder?.id) {
      const ok = window.confirm(
        `${selectedTable?.table_name || 'Bàn đang chọn'} còn món CHƯA LƯU. Mở thanh toán đơn khác sẽ bỏ các món đó. Tiếp tục?`
      );
      if (!ok) return;
    }
    const matchedTable = tables.find(t => t.id === order.table_id) || {
      id: order.table_id || 'tb_mangve',
      table_name: order.tables?.table_name || 'Khách mang về'
    };
    setSelectedTable(matchedTable);
    setExistingOrder(order);

    let items = order.order_items || [];
    const hasValidPrices = items.length > 0 && items.some((i: any) => Number(i.unit_price || i.don_gia || i.price || 0) > 0);
    if (!hasValidPrices || items.length === 0) {
      try {
        const fetched = await db.getOrderItems(order.id);
        if (fetched && fetched.length > 0) {
          items = fetched;
        }
      } catch (_) {}
    }

    const formattedCart: CartItem[] = items.map((i: any) => toCartItem(i, recipes));

    cartTouchedRef.current = false;
    setExistingOrderItems(items);
    setCart(formattedCart);
    setDiscountType('amount');
    setDiscountValue(Number(order.discount || order.giam_gia || 0));
    setOrderNotes(order.notes || '');
    setCustomerCashGiven(Number(order.total_amount || 0));
    setIsPayModalOpen(true);
  };

  // Cơ chế 1-chạm đổi loại ly trừ kho nhanh (Ly Đen -> Ly Hoa Văn -> Ly Trắng)
  // Chỉ áp dụng cho món có ly trong công thức định lượng (món không dùng ly thì không trừ ly)
  const handleCycleCupType = (index: number) => {
    const target = cart[index];
    if (!target) return;
    if (!target.cup_id) {
      toast.info(`${target.name} không dùng ly trong công thức định lượng`);
      return;
    }
    cartTouchedRef.current = true;
    setCart(prev => {
      const next = [...prev];
      const item = { ...next[index] };
      const currentCup = item.cup_id || 'ing_lytrang';
      let newCup = 'ing_lyden';

      if (currentCup === 'ing_lytrang') {
        newCup = 'ing_lyden';
      } else if (currentCup === 'ing_lyden') {
        newCup = 'ing_lyhoavan';
      } else {
        newCup = 'ing_lytrang';
      }

      item.cup_id = newCup;
      
      let cleanNotes = (item.notes || '').replace(/\[Ly:\s*ing_ly[a-z]+\]/g, '').replace(/\(Nóng\)/g, '').replace(/\(Làm nóng\)/g, '').trim();
      if (newCup === 'ing_lyden') {
        item.notes = cleanNotes ? `${cleanNotes} [Ly: ing_lyden]` : `[Ly: ing_lyden]`;
      } else if (newCup === 'ing_lyhoavan') {
        item.notes = cleanNotes ? `${cleanNotes} [Ly: ing_lyhoavan]` : `[Ly: ing_lyhoavan]`;
      } else {
        item.notes = cleanNotes ? `${cleanNotes} [Ly: ing_lytrang]` : `[Ly: ing_lytrang]`;
      }

      const cupLabel = newCup === 'ing_lyden' ? 'Ly Đen' : newCup === 'ing_lyhoavan' ? 'Ly Hoa Văn' : 'Ly Trắng';
      toast.info(`Đã đổi: ${item.name} ➔ ${cupLabel}`);

      next[index] = item;
      return next;
    });
  };

  // In hóa đơn tạm tính thủ công (khi khách cần xem hoặc in bổ sung)
  // ĐÂY LÀ CÁCH DUY NHẤT ĐỂ IN LẠI 1 ĐƠN ĐÃ IN: nhân viên chủ động bấm "In bill" / "In hoá đơn"
  const handlePrintTemporaryBill = async (customOrder?: any) => {
    // In từ danh sách "Đơn chưa thanh toán" -> in đúng đơn được chọn, không lấy món trong giỏ của bàn đang mở
    const isOtherOrder = !!customOrder && customOrder.id !== existingOrder?.id;
    const targetOrder = customOrder || existingOrder;
    const currentTable = isOtherOrder
      ? tables.find(t => t.id === targetOrder.table_id)
      : (selectedTable || (targetOrder ? tables.find(t => t.id === targetOrder.table_id) : null));
    const orderId = targetOrder?.id;
    const toPrintItem = (i: any) => ({
      product_id: i.product_id || i.idsp,
      name: i.products?.name || i.ten_san_pham || i.name || 'Món',
      price: Number(i.unit_price || i.don_gia || i.price || 0),
      quantity: Number(i.quantity || i.so_luong || 1),
      subtotal: Number(i.subtotal || i.thanh_tien || 0),
      notes: i.ghi_chu || i.notes || ''
    });

    let itemsToPrint: any[] = [];
    let totalToPrint = 0;
    let discountToPrint = 0;

    if (isOtherOrder) {
      itemsToPrint = (targetOrder.order_items || []).map(toPrintItem);
      if (orderId) {
        try {
          const fetched = await db.getOrderItems(orderId);
          if (fetched && fetched.length > 0) itemsToPrint = fetched.map(toPrintItem);
        } catch (_) {}
      }
      totalToPrint = Number(targetOrder.total_amount || 0);
      discountToPrint = Number(targetOrder.discount || 0);
    } else {
      itemsToPrint = cart;
      if (itemsToPrint.length === 0 && existingOrderItems.length > 0) {
        itemsToPrint = existingOrderItems.map(toPrintItem);
      } else if (itemsToPrint.length === 0 && orderId) {
        try {
          const fetched = await db.getOrderItems(orderId);
          if (fetched) itemsToPrint = fetched.map(toPrintItem);
        } catch (_) {}
      }
      totalToPrint = finalTotalAmount || Number(targetOrder?.total_amount || 0);
      discountToPrint = discountAmount || Number(targetOrder?.discount || 0);
    }

    if (itemsToPrint.length === 0) {
      toast.info('Chưa có món nào để in hóa đơn!');
      return;
    }

    try {
      await printOrderDirect({
        orderId: orderId,
        tableName: currentTable?.table_name || targetOrder?.tables?.table_name || 'Khách mang về',
        staffName: currentUser?.full_name || 'Admin',
        totalAmount: totalToPrint,
        discount: discountToPrint,
        notes: '(HÓA ĐƠN TẠM TÍNH)',
        items: itemsToPrint
      }, undefined, undefined, { allowReprint: true });
      toast.success(`🖨️ Đã gửi lệnh in bill (${currentTable?.table_name || targetOrder?.tables?.table_name || 'Bàn'})!`);
    } catch (e: any) {
      toast.error(`Gặp lỗi khi gửi lệnh in: ${errorMessage(e)}`);
    }
  };

  // Quay lại Sơ đồ bàn an toàn (không để lại màu vàng trên bàn nếu chưa gọi món)
  const handleBackToTables = () => {
    setViewMode('tables');
    if (!existingOrder && cart.length === 0) {
      setSelectedTable(null);
    }
  };

  // Hủy hóa đơn hoàn toàn (y chang nút Hủy bên trang Thanh toán)
  const handleCancelOrderById = async (orderId: string, tableName?: string, totalAmount?: number) => {
    const confirmCancel = window.confirm(
      `Bạn có chắc chắn muốn hủy và xóa hoàn toàn hóa đơn của ${tableName || 'bàn này'}${totalAmount ? ` (${Number(totalAmount).toLocaleString('vi-VN')} đ)` : ''} không?`
    );
    if (!confirmCancel) return;

    try {
      const success = await db.cancelOrder(orderId);
      if (success) {
        toast.success(`Đã hủy và xóa hóa đơn ${tableName || ''} thành công!`);
        setUnpaidOrders(prev => prev.filter(o => o.id !== orderId));
        if (existingOrder?.id === orderId) {
          const tableId = existingOrder.table_id;
          if (tableId) {
            setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'Trống' } : t));
          }
          setExistingOrder(null);
          setExistingOrderItems([]);
          setCart([]);
          setSelectedTable(null);
          setViewMode('tables');
        }
        await refreshData();
      } else {
        toast.error('Không thể hủy hóa đơn này.');
      }
    } catch (e) {
      console.error('Lỗi khi hủy hóa đơn tại POS:', e);
      toast.error('Gặp lỗi khi hủy hóa đơn.');
    }
  };

  // Làm mới dữ liệu bàn, đơn chưa thanh toán & toàn bộ đơn gần đây (cả đã thanh toán và chưa thanh toán)
  const refreshData = async () => {
    try {
      const [tablesData, unpaidData, recentData, recipesData] = await Promise.all([
        db.getTables(true),
        db.getUnpaidOrders(),
        db.getRecentOrders(40),
        db.getRecipes()
      ]);
      setTables(tablesData);
      setUnpaidOrders(unpaidData);
      setRecentOrders(prev => {
        // Hợp nhất: nếu có đơn vừa thanh toán / vừa lưu trong prev mà server chưa kịp trả về (do độ trễ mạng), giữ lại trong danh sách
        // (chỉ giữ tối đa 10 phút để đơn tạm không nằm mãi trên màn hình pha chế)
        const serverIds = new Set(recentData.map(o => o.id));
        const doneIds = completedKitchenIdsRef.current;
        const now = Date.now();
        const pendingLocals = prev.filter(p =>
          !serverIds.has(p.id) &&
          !doneIds.includes(p.id) &&
          !p.kitchen_done &&
          now - new Date(p.created_at || now).getTime() < 10 * 60 * 1000
        );
        return [...pendingLocals, ...recentData];
      });
      if (recipesData) setRecipes(recipesData);
      try {
        localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
        localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
        localStorage.setItem('ava_pos_cache_recent_orders', JSON.stringify(recentData));
        if (recipesData) localStorage.setItem('ava_pos_cache_recipes', JSON.stringify(recipesData));
      } catch (_) {}
    } catch (e) {
      console.error('Lỗi làm mới dữ liệu POS:', e);
    }
  };

  // Luôn trỏ tới phiên bản refreshData mới nhất (tránh dùng state cũ trong các listener realtime)
  const refreshDataRef = useRef(refreshData);
  const completedKitchenIdsRef = useRef<string[]>(completedKitchenOrderIds);
  useEffect(() => {
    refreshDataRef.current = refreshData;
    completedKitchenIdsRef.current = completedKitchenOrderIds;
  });

  // Gom tất cả sự kiện realtime dồn dập thành 1 lần làm mới.
  // Trước đây mỗi lần thanh toán sinh ra hàng chục sự kiện -> hàng chục lượt tải lại toàn bộ dữ liệu cùng lúc,
  // làm máy POS nghẽn mạng, bấm Thanh toán / Lưu đơn quay rất lâu.
  // (Bộ gom được tạo trong useEffect khởi động màn hình POS bên dưới)
  const scheduleRefreshRef = useRef<ReturnType<typeof createCoalescedRefresher> | null>(null);
  const scheduleRefresh = () => scheduleRefreshRef.current?.();

  // Đơn đã được quầy pha chế bấm "Đã làm xong" chưa
  const isOrderKitchenDone = (order: any) =>
    !!order && (!!order.kitchen_done || completedKitchenOrderIds.includes(order.id));

  // Các đơn mà CHÍNH máy POS này đã gửi lệnh in (để bấm lại sau lỗi mạng không in thêm bill thứ 2)
  const locallyPrintedIdsRef = useRef<Set<string>>(new Set());

  // Đánh dấu TRƯỚC khi lưu lên server: sự kiện realtime "có đơn mới" có thể về tới máy POS trước khi
  // lưu xong, đánh dấu sớm để GlobalPrintListener tuyệt đối không in lặp đơn này như đơn từ điện thoại.
  const reservePrintForNewOrder = (orderId: string, itemCount: number, totalAmount: number, isPaid: boolean) => {
    markOrderAsPrinted(orderId, { itemCount, totalAmount, isPaid });
  };

  // In bill chạy nền: KHÔNG bắt màn hình bán hàng chờ máy in.
  // In lỗi thì báo cho thu ngân biết để bấm "In bill" in lại (không còn im lặng mất bill).
  const printInBackground = (orderId: string, data: Omit<OrderData, 'orderId'>, isPaid: boolean) => {
    locallyPrintedIdsRef.current.add(orderId);
    markOrderAsPrinted(orderId, {
      itemCount: data.items.length,
      totalAmount: data.totalAmount,
      isPaid
    });
    // Lệnh in tự động: đi qua bộ chống in lặp theo mã đơn (1 đơn chỉ in 1 lần)
    printOrderDirect({ ...data, orderId })
      .catch(err => {
        console.warn('Lỗi in bill:', err);
        toast.error(`⚠️ Chưa in được bill ${data.tableName}: ${errorMessage(err)}. Kiểm tra máy in rồi bấm "In bill".`);
      });
  };

  // Khởi động & Prefetch dữ liệu
  useEffect(() => {
    if (!scheduleRefreshRef.current) {
      scheduleRefreshRef.current = createCoalescedRefresher(() => refreshDataRef.current(), 350, 1500);
    }

    async function initPos() {
      const todayDateKey = new Date().toLocaleDateString('en-CA');
      // 1. Tải từ cache trước (0ms)
      try {
        const storedTables = localStorage.getItem('ava_pos_cache_tables');
        const storedCategories = localStorage.getItem('ava_pos_cache_categories');
        const storedProducts = localStorage.getItem('ava_pos_cache_products');
        const storedUnpaid = localStorage.getItem('ava_pos_cache_unpaid');
        const storedRecent = localStorage.getItem('ava_pos_cache_recent_orders');
        const storedRecipes = localStorage.getItem('ava_pos_cache_recipes');
        const storedYest = localStorage.getItem(`ava_pos_yest_sales_${todayDateKey}`);

        if (storedTables && storedCategories && storedProducts) {
          const parsedTables = JSON.parse(storedTables);
          setTables(parsedTables);
          setCategories(JSON.parse(storedCategories));
          setProducts(JSON.parse(storedProducts));
          if (storedUnpaid) setUnpaidOrders(JSON.parse(storedUnpaid));
          if (storedRecent) setRecentOrders(JSON.parse(storedRecent));
          if (storedRecipes) setRecipes(JSON.parse(storedRecipes));
          if (storedYest) setYesterdaySales(JSON.parse(storedYest));
          setLoading(false);
        }
      } catch (_) {}

      // 2. Tải dữ liệu mới nhất từ database
      try {
        const [tablesData, categoriesData, productsData, unpaidData, recentData, recipesData] = await Promise.all([
          db.getTables(),
          db.getCategories(),
          db.getProducts(),
          db.getUnpaidOrders(),
          db.getRecentOrders(40),
          db.getRecipes()
        ]);

        setTables(tablesData);
        setCategories(categoriesData);
        setProducts(productsData);
        setUnpaidOrders(unpaidData);
        setRecentOrders(recentData);
        setRecipes(recipesData || []);

        try {
          localStorage.setItem('ava_pos_cache_tables', JSON.stringify(tablesData));
          localStorage.setItem('ava_pos_cache_categories', JSON.stringify(categoriesData));
          localStorage.setItem('ava_pos_cache_products', JSON.stringify(productsData));
          localStorage.setItem('ava_pos_cache_unpaid', JSON.stringify(unpaidData));
          localStorage.setItem('ava_pos_cache_recent_orders', JSON.stringify(recentData));
          if (recipesData) localStorage.setItem('ava_pos_cache_recipes', JSON.stringify(recipesData));
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

    // Lắng nghe Realtime thay đổi từ Supabase để tự động cập nhật sơ đồ bàn & danh sách đơn
    // (subscribeToOrderChanges và onRealtimeEvent('order_update') dùng chung kênh nên chỉ đăng ký 1 lần)
    const unsubTables = db.subscribeToTableChanges(() => scheduleRefresh());

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
    // Dự phòng: tự làm mới thực đơn mỗi 10 phút
    const menuTimer = setInterval(() => reloadMenu(), 10 * 60 * 1000);
    const unsubPrints = onRealtimeEvent('order_update', async (rawPayload: any) => {
      scheduleRefresh();
      const payload = rawPayload?.payload || rawPayload;
      if (payload?.action === 'PRINT_TEST') {
        try {
          const { printTestTicket } = await import('@/lib/printerService');
          await printTestTicket();
          toast.success('🖨️ Đã in phiếu test máy in Wi-Fi!');
        } catch (_) {}
      }
    });

    // Tự động mở và căn chỉnh Màn hình phụ 11.6 inch FullScreen tại Màn hình 2
    const timerCust = setTimeout(() => {
      openCustomerDisplayWindow().catch(() => {});
    }, 1200);

    // Dự phòng khi kết nối realtime bị rớt (Wi-Fi chập chờn): tự đồng bộ lại mỗi 45 giây
    // và ngay khi có mạng trở lại, để sơ đồ bàn / đơn pha chế không bao giờ bị "đứng hình".
    const pollTimer = setInterval(() => scheduleRefresh(), 45000);
    const handleOnline = () => scheduleRefresh();
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(timerCust);
      clearInterval(pollTimer);
      window.removeEventListener('online', handleOnline);
      scheduleRefreshRef.current?.cancel();
      scheduleRefreshRef.current = null;
      unsubTables();
      unsubPrints();
      unsubMenu();
      reloadMenu.cancel();
      clearInterval(menuTimer);
    };
  }, []);

  // Tính toán số tiền giỏ hàng (linh hoạt bao gồm cả khi thanh toán đơn cũ có sẵn)
  const baseCartAmount = useMemo(() => {
    if (cart.length > 0) {
      return cart.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
    }
    if (existingOrderItems && existingOrderItems.length > 0) {
      return existingOrderItems.reduce((sum, item) => {
        const u = Number(item.unit_price || item.don_gia || item.price || 0);
        const q = Number(item.quantity || item.so_luong || 1);
        return sum + (Number(item.subtotal || item.thanh_tien) || (q * u));
      }, 0);
    }
    return Number(existingOrder?.total_amount || 0);
  }, [cart, existingOrderItems, existingOrder]);

  const totalCartAmount = baseCartAmount;

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

  // Mã QR tĩnh Techcombank dự phòng của quán
  const defaultBankQrUrl = '/techcombank-qr-card.png';

  // Đồng bộ giỏ hàng sang Màn hình phụ 11.6 inch cho khách
  useEffect(() => {
    const syncToSecondaryDisplay = async () => {
      try {
        const hasCart = cart.length > 0;
        const hasExisting = !hasCart && existingOrderItems.length > 0;

        if (hasCart || hasExisting) {
          const itemsToDisplay = hasCart
            ? cart.map(i => ({
                name: i.name,
                price: i.price,
                quantity: i.quantity,
                subtotal: i.subtotal
              }))
            : existingOrderItems.map(i => ({
                name: i.products?.name || i.ten_san_pham || 'Món',
                price: i.unit_price || 0,
                quantity: i.quantity || 1,
                subtotal: i.subtotal || 0
              }));

          const totalToDisplay = hasCart ? finalTotalAmount : (existingOrder?.total_amount || 0);
          const activeQr = getVietQrUrl(
            totalToDisplay,
            (selectedTable?.table_name || 'AVA K300').replace(/[^a-zA-Z0-9 ]/g, ''),
            'compact2'
          );

          await syncCustomerDisplay({
            tableName: selectedTable?.table_name || 'Bàn chưa chọn',
            staffName: currentUser?.full_name || '',
            items: itemsToDisplay,
            discount: hasCart ? discountAmount : (existingOrder?.discount || 0),
            totalAmount: totalToDisplay,
            paymentMethod: paymentMethod,
            qrCodeUrl: activeQr,
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
  }, [cart, existingOrder, existingOrderItems, selectedTable, discountAmount, finalTotalAmount, currentUser, paymentMethod]);

  // THAO TÁC 1-CHẠM THÊM MÓN VÀO GIỎ HÀNG (FAST TOUCH)
  const handleAddToCart = (product: any) => {
    if (product.status === 'Hết hàng') {
      toast.error(`Món "${product.name}" hiện đang hết hàng!`);
      return;
    }

    const isTakeaway = selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve';
    const effectivePrice = isTakeaway
      ? (product.takeaway_price !== undefined && product.takeaway_price !== null ? Number(product.takeaway_price) : Number(product.price))
      : (product.dinein_price !== undefined && product.dinein_price !== null ? Number(product.dinein_price) : Number(product.price));

    // Tự động gán ly mặc định chuẩn xác của món (dựa trên công thức + bảng quy chuẩn 0ms)
    const defaultCupId = getDefaultCupId(product.id, product.name, recipes);
    const defaultNotes = defaultCupId ? `[Ly: ${defaultCupId}]` : '';

    cartTouchedRef.current = true;
    setCart(prev => {
      const idx = prev.findIndex(item => item.product_id === product.id);
      if (idx !== -1) {
        const updated = [...prev];
        const nextQty = updated[idx].quantity + 1;
        updated[idx] = {
          ...updated[idx],
          price: effectivePrice,
          quantity: nextQty,
          subtotal: nextQty * effectivePrice
        };
        setSelectedCartIndex(idx);
        return updated;
      }

      const newItem: CartItem = {
        product_id: product.id,
        name: product.name,
        price: effectivePrice,
        quantity: 1,
        subtotal: effectivePrice,
        cup_id: defaultCupId,
        notes: defaultNotes
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
    cartTouchedRef.current = true;
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
    cartTouchedRef.current = true;
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
      cartTouchedRef.current = true;
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
  // 1. Hiện ngay món đã lưu trong bộ nhớ (0ms)
  // 2. Đối chiếu lại với server để chắc chắn đủ 100% món, không sót / không nhân đôi
  const handleSelectTable = async (table: any) => {
    const hasUnsavedCart = cartTouchedRef.current && cart.length > 0;

    // Quay lại đúng bàn đang chọn dở (ví dụ ra sơ đồ bàn xem rồi bấm lại bàn đó):
    // GIỮ NGUYÊN các món vừa chọn, không tải lại làm mất món
    if (hasUnsavedCart && selectedTable?.id === table.id) {
      setViewMode('menu');
      return;
    }
    // Chuyển sang bàn khác khi bàn hiện tại còn món chưa lưu -> hỏi lại, không âm thầm xóa món
    if (hasUnsavedCart && selectedTable && selectedTable.id !== table.id) {
      const ok = window.confirm(
        `${selectedTable.table_name} còn ${cart.reduce((s, i) => s + i.quantity, 0)} món CHƯA LƯU.\n\n` +
        `Bấm "Hủy" để quay lại lưu đơn ${selectedTable.table_name}.\n` +
        `Bấm "OK" để bỏ các món đó và mở ${table.table_name}.`
      );
      if (!ok) {
        setViewMode('menu');
        return;
      }
    }

    const requestId = ++selectTableRequestRef.current;
    cartTouchedRef.current = false;
    setSelectedTable(table);
    setViewMode('menu'); // Chuyển thẳng sang giao diện chọn món
    setSelectedCartIndex(-1);
    setNumpadBuffer('');

    const applyOrder = (orderObj: any | null, itemsList: any[]) => {
      if (orderObj) {
        setExistingOrder(orderObj);
        setExistingOrderItems(itemsList);
        // ĐỔ TOÀN BỘ MÓN CŨ VÀO GIỎ HÀNG ĐỂ THU NGÂN CÓ THỂ ORDER THÊM / XÓA BỚT / THANH TOÁN
        setCart(itemsList.map((item: any) => toCartItem(item, recipes)));
        setDiscountType('amount');
        setDiscountValue(Number(orderObj.discount || orderObj.giam_gia || 0));
        setOrderNotes(orderObj.notes || '');
      } else {
        setExistingOrder(null);
        setExistingOrderItems([]);
        setCart([]);
        setDiscountType('amount');
        setDiscountValue(0);
        setOrderNotes('');
      }
    };

    const isTakeaway = table.table_name === 'Khách mang về' || table.id === 'tb_mangve';
    if (isTakeaway) {
      applyOrder(null, []);
      return;
    }

    // 1. Nếu trong memory đã có sẵn đơn của bàn -> Đổ ngay 0ms
    const cachedOrder = unpaidOrders.find(o => o.table_id === table.id) || null;
    applyOrder(cachedOrder, cachedOrder?.order_items || []);

    // 2. Tải lại chính xác từ DB để đảm bảo không sót món (kể cả đơn vừa gọi từ điện thoại)
    try {
      const res = await db.getUnpaidOrderByTableId(table.id);
      if (selectTableRequestRef.current !== requestId) return; // Thu ngân đã chọn bàn khác

      const freshOrder = res?.order || null;
      const freshItems = res?.items || [];
      const sigOf = (o: any, items: any[]) =>
        o ? `${o.id}|${Number(o.total_amount || 0)}|${cartSignature(items.map((i: any) => toCartItem(i, recipes)))}` : '';
      const cachedSig = sigOf(cachedOrder, cachedOrder?.order_items || []);
      const freshSig = sigOf(freshOrder, freshItems);

      if (cachedSig === freshSig) {
        if (freshOrder) {
          setExistingOrder(freshOrder);
          setExistingOrderItems(freshItems);
        }
        return;
      }

      applyOrder(freshOrder, freshItems);
      if (cartTouchedRef.current) {
        toast.info(`Đơn của ${table.table_name} vừa được cập nhật từ máy khác. Vui lòng kiểm tra lại các món!`);
      }
      cartTouchedRef.current = false;
      if (freshOrder) {
        setUnpaidOrders(prev => [freshOrder, ...prev.filter(o => o.id !== freshOrder.id)]);
      } else if (cachedOrder) {
        // Đơn đã được thanh toán / hủy ở máy khác
        setUnpaidOrders(prev => prev.filter(o => o.id !== cachedOrder.id));
      }
    } catch (e) {
      // Mất mạng: giữ nguyên dữ liệu đang có trong bộ nhớ
      console.error('Lỗi tải đơn cũ của bàn:', e);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // LỰA CHỌN 1: LƯU ĐƠN (THANH TOÁN SAU) -> GỬI BẾP PHA CHẾ
  // ─────────────────────────────────────────────────────────────
  const handleSaveOrderLater = async () => {
    if (savingOrder || isSavingRef.current || isPayingRef.current) return;
    if (!selectedTable || cart.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 món để lưu đơn');
      return;
    }
    isSavingRef.current = true;
    setSavingOrder(true);

    const table = selectedTable;
    const cartSnapshot = [...cart];
    const total = finalTotalAmount;
    const disc = discountAmount;
    const notesTrim = orderNotes.trim();
    const isTakeawayTable = table.table_name === 'Khách mang về' || table.id === 'tb_mangve';
    const printItems = cartSnapshot.map(i => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      subtotal: i.subtotal,
      notes: i.notes
    }));

    try {
      if (existingOrder?.id) {
        // Cập nhật đơn hàng đang phục vụ đã có sẵn
        const orderId = existingOrder.id;
        const previousItems = existingOrderItems.map((i: any) => toCartItem(i, recipes));
        const hasNewItems = hasAddedItems(cartSnapshot, previousItems);
        const changed = hasNewItems ||
          cartSignature(cartSnapshot) !== cartSignature(previousItems) ||
          total !== Number(existingOrder.total_amount || 0) ||
          disc !== Number(existingOrder.discount || 0) ||
          notesTrim !== (existingOrder.notes || '');

        if (changed) {
          await db.syncUnpaidOrder(orderId, {
            total_amount: total,
            discount: disc,
            notes: notesTrim,
            items: cartSnapshot,
            kitchen_done: isOrderKitchenDone(existingOrder) && !hasNewItems
          });
        }

        // Cập nhật ngay lập tức bộ nhớ để phản hồi 0ms
        const updatedItems = cartSnapshot.map(item => toOrderItemRecord(item, orderId));
        setUnpaidOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          total_amount: total,
          discount: disc,
          notes: notesTrim,
          kitchen_done: o.kitchen_done && !hasNewItems,
          order_items: updatedItems
        } : o));
        if (hasNewItems) {
          // Món gọi thêm -> hiện lại ở quầy pha chế
          setCompletedKitchenOrderIds(prev => prev.filter(id => id !== orderId));
          setRecentOrders(prev => prev.map(o => o.id === orderId ? { ...o, kitchen_done: false, order_items: updatedItems, total_amount: total } : o));
        }

        // NGUYÊN TẮC: Nếu bàn này có gọi thêm món mới -> In bill bao gồm ĐẦY ĐỦ các món có trong bàn!
        // Nếu không có món mới -> Tuyệt đối không in trùng!
        if (hasNewItems) {
          printInBackground(orderId, {
            tableName: table.table_name || 'Khách mang về',
            staffName: currentUser?.full_name || 'Admin',
            items: printItems,
            totalAmount: total,
            discount: disc,
            notes: notesTrim ? `${notesTrim} (GỌI THÊM MÓN)` : '(GỌI THÊM MÓN)'
          }, false);
        }

        toast.success(changed
          ? `Đã cập nhật đơn cho ${table.table_name}! Đã gửi bếp pha chế.`
          : `Đơn của ${table.table_name} không có thay đổi.`);
      } else {
        // TẠO ĐƠN MỚI LƯU BÀN
        const newOrderId = getStableOrderId(`save|${table.id}|${cartSignature(cartSnapshot)}|${total}`);
        reservePrintForNewOrder(newOrderId, cartSnapshot.length, total, false);

        // 1. Lưu vào Database Supabase với id đã định danh (lưu xong mới in để bill luôn khớp với đơn trên hệ thống)
        const savedOrder = await db.createOrder({
          id: newOrderId,
          table_id: table.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: total,
          discount: disc,
          notes: notesTrim,
          items: cartSnapshot
        });
        pendingOrderRef.current = null;
        const savedOrderId = savedOrder?.id || newOrderId;

        // 2. In ngay phiếu bếp / lưu đơn (chạy nền, không bắt thu ngân chờ máy in)
        if (!locallyPrintedIdsRef.current.has(newOrderId)) {
          printInBackground(savedOrderId, {
            tableName: table.table_name || 'Khách mang về',
            staffName: currentUser?.full_name || 'Admin',
            items: printItems,
            totalAmount: total,
            discount: disc,
            notes: notesTrim ? `${notesTrim} (LƯU ĐƠN)` : '(LƯU ĐƠN)'
          }, false);
        }

        const activeOrderData = {
          ...(savedOrder || {}),
          id: savedOrderId,
          table_id: table.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: savedOrder?.total_amount ?? total,
          discount: savedOrder?.discount ?? disc,
          payment_status: 'Chưa thanh toán',
          notes: notesTrim,
          kitchen_done: false,
          tables: { table_name: table.table_name },
          users: { full_name: currentUser?.full_name || 'Admin' },
          created_at: savedOrder?.created_at || new Date().toISOString(),
          order_items: (savedOrder?.order_items && savedOrder.order_items.length > 0)
            ? savedOrder.order_items
            : cartSnapshot.map(item => toOrderItemRecord(item, savedOrderId))
        };

        setRecentOrders(prev => [activeOrderData, ...prev.filter(o => o.id !== activeOrderData.id)]);

        if (!isTakeawayTable) {
          // QUY TẮC BÀN BẬN: Lưu đơn xong bàn lập tức chuyển sang "Đang phục vụ"
          setUnpaidOrders(prev => [activeOrderData, ...prev.filter(o => o.id !== activeOrderData.id)]);
          setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: 'Đang phục vụ' } : t));
        }

        toast.success(`Đã lưu đơn cho ${table.table_name}! Đã gửi bếp pha chế.`);
      }

      handleClearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
      setSelectedTable(null);
      setViewMode('tables'); // Quay về màn hình chọn bàn
      scheduleRefresh();
    } catch (err) {
      console.error('Lỗi lưu đơn:', err);
      toast.error(`Chưa lưu được đơn (${errorMessage(err)}). Món vẫn còn trong giỏ, vui lòng bấm lưu lại.`);
    } finally {
      isSavingRef.current = false;
      setSavingOrder(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // LỰA CHỌN 2: THANH TOÁN LUÔN (TIỀN MẶT / CHUYỂN KHOẢN VIETQR / MOMO)
  // ─────────────────────────────────────────────────────────────
  const handleProcessPayment = async (methodOverride?: 'Tiền mặt' | 'Chuyển khoản') => {
    if (submittingPayment || isPayingRef.current || isSavingRef.current) return;
    isPayingRef.current = true;
    setSubmittingPayment(true);

    const method = methodOverride || paymentMethod;
    const table = selectedTable;
    const tableName = table?.table_name || existingOrder?.tables?.table_name || 'Khách mang về';
    const sourceOrder = existingOrder;
    const previousItems = existingOrderItems.map((i: any) => toCartItem(i, recipes));
    const itemsToPay: CartItem[] = cart.length > 0 ? [...cart] : previousItems;
    const total = finalTotalAmount;
    const disc = discountAmount;
    const notesTrim = orderNotes.trim();

    try {
      if (itemsToPay.length === 0 && !sourceOrder?.id) {
        toast.error('Chưa có món ăn nào để thanh toán!');
        return;
      }

      let orderIdToPay: string;
      let printJob: (() => void) | null = null;

      if (sourceOrder?.id) {
        orderIdToPay = sourceOrder.id;
        const hasNewItems = cart.length > 0 && hasAddedItems(itemsToPay, previousItems);
        const changed = cart.length > 0 && (
          hasNewItems ||
          cartSignature(itemsToPay) !== cartSignature(previousItems) ||
          total !== Number(sourceOrder.total_amount || 0) ||
          disc !== Number(sourceOrder.discount || 0) ||
          notesTrim !== (sourceOrder.notes || '')
        );

        // Đồng bộ danh sách món mới nhất trước khi thanh toán (chỉ khi thực sự có thay đổi)
        if (changed) {
          await db.syncUnpaidOrder(orderIdToPay, {
            total_amount: total,
            discount: disc,
            notes: notesTrim,
            items: itemsToPay,
            kitchen_done: isOrderKitchenDone(sourceOrder) && !hasNewItems
          });
        }

        // Đơn đã lưu trước đó: ĐÃ ĐƯỢC IN LÚC LƯU ĐƠN, TUYỆT ĐỐI KHÔNG IN LẠI KHI THANH TOÁN!
        // Chỉ in nếu có món mới gọi thêm ngay lúc ấn thanh toán (hasNewItems)
        if (hasNewItems) {
          printJob = () => printInBackground(orderIdToPay, {
            tableName,
            staffName: currentUser?.full_name || 'Admin',
            items: itemsToPay.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, subtotal: i.subtotal, notes: i.notes })),
            totalAmount: total,
            discount: disc,
            notes: notesTrim ? `${notesTrim} (GỌI THÊM MÓN)` : '(GỌI THÊM MÓN)'
          }, true);
        }
      } else {
        // ĐƠN GỌI MÓN VÀ THANH TOÁN NGAY TẠI QUẦY
        // Luôn là đơn riêng (force_new) để không bị gộp nhầm vào đơn khác đang mở của bàn
        const newOrderId = getStableOrderId(`pay|${table?.id || ''}|${cartSignature(itemsToPay)}|${total}`);
        reservePrintForNewOrder(newOrderId, itemsToPay.length, total, true);
        await db.createOrder({
          id: newOrderId,
          table_id: table?.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: total,
          discount: disc,
          notes: notesTrim,
          items: itemsToPay,
          force_new: true
        });
        orderIdToPay = newOrderId;

        // QUY TẮC PHA CHẾ: Đơn "Thanh toán ngay" phải lập tức xuất hiện ở cột "Đang pha chế"
        const kitchenTicket = {
          id: newOrderId,
          table_id: table?.id || 'tb_mangve',
          staff_id: currentUser?.id || 'admin',
          total_amount: total,
          discount: disc,
          // Nếu chốt tiền lỗi, lần làm mới kế tiếp sẽ lấy lại đúng trạng thái từ server
          payment_status: 'Đã thanh toán',
          payment_method: method,
          notes: notesTrim,
          tables: { table_name: tableName },
          users: { full_name: currentUser?.full_name || 'Admin' },
          created_at: new Date().toISOString(),
          kitchen_done: false,
          order_items: itemsToPay.map(item => toOrderItemRecord(item, newOrderId))
        };
        setRecentOrders(prev => [kitchenTicket, ...prev.filter(o => o.id !== newOrderId)]);

        if (!locallyPrintedIdsRef.current.has(newOrderId)) {
          printJob = () => printInBackground(newOrderId, {
            tableName,
            staffName: currentUser?.full_name || 'Admin',
            items: itemsToPay.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, subtotal: i.subtotal, notes: i.notes })),
            totalAmount: total,
            discount: disc,
            notes: notesTrim ? `${notesTrim} (ĐÃ THANH TOÁN)` : '(ĐÃ THANH TOÁN)'
          }, true);
        }
      }

      // In bill ngay (chạy nền) trong lúc chốt thanh toán trên server
      printJob?.();

      // Xác nhận thanh toán trong Database (báo lỗi thật nếu không lưu được)
      await db.payOrder(orderIdToPay, method);
      pendingOrderRef.current = null;

      // Cập nhật trạng thái đơn trong danh sách gần đây (vẫn hiện ở cột pha chế cho tới khi bấm "Đã làm xong")
      const paidAt = new Date().toISOString();
      setRecentOrders(prev => prev.map(o => {
        if (o.id !== orderIdToPay) return o;
        return {
          ...o,
          payment_status: 'Đã thanh toán',
          payment_method: method,
          paid_at: paidAt,
          tables: o.tables || { table_name: tableName },
          order_items: (o.order_items && o.order_items.length > 0)
            ? o.order_items
            : itemsToPay.map(item => toOrderItemRecord(item, orderIdToPay))
        };
      }));

      // Luôn kích hoạt mở két tiền tự động qua RJ11 (chạy nền, không chờ)
      kickCashDrawer().catch(() => {});

      // Đồng bộ trạng thái đã thanh toán sang màn hình phụ
      syncCustomerDisplay({
        tableName,
        staffName: currentUser?.full_name || '',
        items: itemsToPay.map(i => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          subtotal: i.subtotal
        })),
        discount: disc,
        totalAmount: total,
        paymentMethod: method,
        orderStatus: 'paid'
      }).catch(() => {});
      setTimeout(() => {
        syncCustomerDisplay({
          items: [],
          totalAmount: 0,
          orderStatus: 'idle'
        }).catch(() => {});
      }, 4000);

      // Hiệu ứng pháo hoa chúc mừng
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });

      toast.success(`Thanh toán thành công ${tableName}! Đã gửi bếp pha chế.`);
      setIsPayModalOpen(false);

      // Bàn chỉ trống khi không còn đơn chưa thanh toán nào khác
      const remainingUnpaid = unpaidOrders.filter(o => o.id !== orderIdToPay);
      setUnpaidOrders(prev => prev.filter(o => o.id !== orderIdToPay));
      if (table?.id && table.table_name !== 'Khách mang về' && !remainingUnpaid.some(o => o.table_id === table.id)) {
        setTables(prevTables => prevTables.map(t => t.id === table.id ? { ...t, status: 'Trống' } : t));
      }

      handleClearCart();
      setExistingOrder(null);
      setExistingOrderItems([]);
      setSelectedTable(null);
      setViewMode('tables'); // Trả về giao diện chọn bàn
      scheduleRefresh();
    } catch (e) {
      console.error('Lỗi khi thanh toán:', e);
      toast.error(`Thanh toán CHƯA thành công (${errorMessage(e)}). Vui lòng bấm thanh toán lại.`);
      scheduleRefresh();
    } finally {
      isPayingRef.current = false;
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

  // DANH SÁCH HÓA ĐƠN CHỜ PHA CHẾ (CẢ ĐÃ THANH TOÁN HOẶC CHƯA THANH TOÁN ĐỀU PHẢI HIỆN CHO BẾP LÀM, LOẠI BỎ ĐƠN ĐÃ HỦY / ĐÃ XONG / ĐƠN CŨ)
  const pendingKitchenOrders = useMemo(() => {
    const now = Date.now();
    const todayVN = new Date().toLocaleDateString('en-CA');
    return recentOrders.filter(order => {
      // 1. Đã bấm xong ở phiên làm việc này hoặc đã lưu trạng thái trong DB
      if (completedKitchenOrderIds.includes(order.id) || order.kitchen_done) return false;
      if (order.notes?.includes('Đã pha chế') || (order as any).ghi_chu?.includes('Đã pha chế')) return false;

      // 2. Đơn đã hủy hoặc chờ duyệt hủy
      if (order.payment_status === 'Đã hủy' || order.payment_status === 'Chờ duyệt hủy' || (order as any).status === 'cancelled') return false;

      // 3. Với các đơn ĐÃ THANH TOÁN:
      // Luôn hiển thị cho quầy pha chế thấy cho đến khi nhân viên bấm "Đã làm xong".
      // Chỉ ẩn nếu là đơn từ ngày trước VÀ đã tạo cách đây hơn 180 phút (3 tiếng)
      if (order.payment_status === 'Đã thanh toán') {
        const rawDate = order.created_at || (order as any).ngay_tao || order.paid_at || (order as any).ngay_thanh_toan;
        if (rawDate) {
          const orderDate = new Date(rawDate);
          if (!isNaN(orderDate.getTime())) {
            const orderDateVN = orderDate.toLocaleDateString('en-CA');
            const minutesAgo = Math.floor((now - orderDate.getTime()) / 60000);
            if (orderDateVN !== todayVN && minutesAgo > 180) {
              return false;
            }
          }
        }
      }

      return true;
    });
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
        {/* NÚT QUAY LẠI TRANG CHỦ (BÊN TRÁI NHẤT - CHỈ HIỆN KHI Ở SƠ ĐỒ BÀN, ẨN KHI Ở CHỌN MÓN ĐỂ TRÁNH BẤM NHẦM) */}
        <div className="flex items-center space-x-2 shrink-0">
          {viewMode === 'tables' && (
            <>
              <Link
                href="/"
                className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                title="Quay lại Trang chủ Quản lý"
              >
                <ArrowLeft className="w-4 h-4 text-gray-800" />
                <span className="hidden sm:inline">Trang chủ</span>
              </Link>

              <div className="h-5 w-px bg-gray-200 mx-0.5" />
            </>
          )}

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

        {/* Ô Tìm kiếm & Tiện ích bên phải */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative w-36 sm:w-52 md:w-64">
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
              const ok = await openCustomerDisplayWindow();
              if (ok) {
                toast.success('🖥️ Đã bật màn hình phụ hiển thị cho khách!');
              } else {
                toast.error('⚠️ Không thể kết nối màn hình phụ!');
              }
            }}
            className="p-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg text-xs transition cursor-pointer"
            title="Mở màn hình phụ 11.6 inch cho khách xem"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <TauriFullscreenButton 
            className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-xs transition cursor-pointer"
            iconClassName="w-3.5 h-3.5"
          />

          {/* Avatar User Nâu Cà Phê + Menu tài khoản (Đăng xuất ngay tại màn hình POS) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              className="h-8 pl-1 pr-2.5 rounded-full bg-[#FAF6F0] hover:bg-[#F5EFE6] border border-[#4A3525]/20 flex items-center space-x-1.5 transition cursor-pointer"
              title="Tài khoản / Đăng xuất"
            >
              <span className="w-6 h-6 rounded-full bg-[#4A3525] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'M'}
              </span>
              <span className="hidden md:inline text-[11px] font-bold text-[#4A3525] max-w-[110px] truncate">
                {currentUser?.full_name || 'Tài khoản'}
              </span>
            </button>

            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-bold text-gray-900 truncate">{currentUser?.full_name || 'Nhân viên'}</p>
                    <p className="text-[10px] text-gray-500 truncate">{currentUser?.role || ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-xs text-red-600 font-bold hover:bg-red-50 transition flex items-center space-x-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. NỘI DUNG CHÍNH (SƠ ĐỒ BÀN HOẶC GIAO DIỆN BÁN HÀNG)
      ───────────────────────────────────────────────────────────── */}
      {viewMode === 'tables' ? (
        /* GIAO DIỆN SƠ ĐỒ BÀN: CỘT TRÁI HÓA ĐƠN CẦN PHA CHẾ + CỘT PHẢI SƠ ĐỒ BÀN */
        <div className="flex-1 flex overflow-hidden">
          
          {/* CỘT TRÁI: HÓA ĐƠN CẦN PHA CHẾ (BARISTA / BẾP) */}
          <aside className="w-[330px] sm:w-[360px] md:w-[390px] bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden shadow-xs z-10">
            <div className="px-4 py-3 bg-[#FAF6F0] border-b border-amber-200/80 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-black text-[#4A3525] uppercase tracking-wide">
                  Hóa đơn cần pha chế
                </span>
              </div>
              <span className="px-2.5 py-0.5 bg-amber-200/80 text-amber-950 font-black text-xs rounded-full">
                {pendingKitchenOrders.length} đơn
              </span>
            </div>

            {/* DANH SÁCH HÓA ĐƠN BẾP DỌC (FULL MÓN ĂN, KHÔNG CẦN SCROLL NỘI BỘ) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-gray-50/50">
              {pendingKitchenOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-60" />
                  <p className="text-xs font-bold text-gray-600">Đã pha chế xong tất cả!</p>
                  <p className="text-[11px] text-gray-400">Đơn hàng mới từ quầy thu ngân sẽ tự động xuất hiện tại đây.</p>
                </div>
              ) : (
                pendingKitchenOrders.map((order) => {
                  const rawTime = order.created_at || (order as any).ngay_tao || order.paid_at || (order as any).ngay_thanh_toan;
                  const orderTime = new Date(rawTime || Date.now());
                  const minutesAgo = Math.max(0, Math.floor((Date.now() - (isNaN(orderTime.getTime()) ? Date.now() : orderTime.getTime())) / 60000));
                  const isUrgent = minutesAgo >= 10;
                  const tableName = order.tables?.table_name || 'Khách mang về';
                  const isPaid = order.payment_status === 'Đã thanh toán';

                  return (
                    <div
                      key={order.id}
                      className={`p-3.5 rounded-2xl border-2 bg-white flex flex-col justify-between shadow-xs hover:shadow-md transition-all ${
                        isUrgent
                          ? 'border-red-400 ring-2 ring-red-200/80 bg-red-50/20'
                          : isPaid
                          ? 'border-emerald-300 ring-1 ring-emerald-100'
                          : 'border-amber-300 ring-1 ring-amber-100'
                      }`}
                    >
                      {/* Tiêu đề vé: Tên bàn + Phù hiệu thanh toán */}
                      <div className="flex items-center justify-between pb-2 border-b border-dashed border-gray-200">
                        <div className="flex items-center space-x-2">
                          <span className="text-base font-black text-[#4A3525] uppercase tracking-tight">
                            {tableName}
                          </span>
                          <span className="text-[11px] text-gray-500 font-semibold bg-gray-100 px-2 py-0.5 rounded-md">
                            {minutesAgo}p trước
                          </span>
                        </div>

                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                          isPaid 
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-400' 
                            : 'bg-amber-100 text-amber-950 border-amber-400'
                        }`}>
                          {isPaid ? 'ĐÃ TT' : 'CHƯA TT'}
                        </span>
                      </div>

                      {/* Danh sách món ăn ĐẦY ĐỦ, KHÔNG BỊ CẮT, KHÔNG CẦN SCROLL NỘI BỘ */}
                      <div className="py-2.5 space-y-1.5 text-xs sm:text-[13px]">
                        {order.order_items && order.order_items.length > 0 ? (
                          order.order_items.map((item: any, i: number) => {
                            const itemName = item.name || item.ten_san_pham || item.products?.name || 'Món';
                            const itemQty = item.quantity || item.so_luong || 1;
                            const itemNote = item.notes || item.ghi_chu || '';
                            return (
                              <div key={i} className="flex justify-between items-start leading-snug">
                                <span className="font-extrabold text-gray-900 flex-1 pr-2">
                                  {itemName}
                                  {itemNote && (
                                    <span className="block text-[11px] text-amber-800 italic font-medium">
                                      📝 {itemNote}
                                    </span>
                                  )}
                                </span>
                                <span className="font-black text-[#4A3525] bg-[#FAF6F0] border border-[#8C6A5C]/30 px-2 py-0.5 rounded-lg text-xs ml-1 shrink-0">
                                  x{itemQty}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-gray-400 italic">Đơn #{order.id.slice(0, 6)}</p>
                        )}

                        {(() => {
                          const note = (order.notes || '').replace(/\[?Đã pha chế\]?/gi, '').trim();
                          return note ? (
                            <p className="text-xs text-amber-950 bg-amber-50 p-1.5 rounded-lg border border-amber-200 font-semibold mt-1">
                              Ghi chú: {note}
                            </p>
                          ) : null;
                        })()}
                      </div>

                      {/* Nút hành động ở chân vé */}
                      <div className="pt-2 border-t border-dashed border-gray-200 flex items-center space-x-2">
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => handleQuickPayFromTicket(order)}
                            className="flex-1 py-2 bg-[#4A3525] hover:bg-[#382513] text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Thanh toán</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleMarkKitchenOrderDone(order.id, e)}
                          className={`${!isPaid ? 'flex-1' : 'w-full'} py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer`}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Đã làm xong</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* CỘT PHẢI: SƠ ĐỒ BÀN PHỤC VỤ */}
          <main className="flex-1 p-5 overflow-y-auto bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-gray-800">Sơ đồ bàn phục vụ</h2>
                <p className="text-xs text-gray-500">
                  Chạm vào bàn để bắt đầu gọi món, xem hóa đơn hoặc thanh toán
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {[...tables]
                .sort((a, b) => {
                  if (a.table_name === 'Khách mang về') return -1;
                  if (b.table_name === 'Khách mang về') return 1;
                  return a.table_name.localeCompare(b.table_name, 'vi', { numeric: true });
                })
                .map(table => {
                  const isTakeaway = table.table_name === 'Khách mang về' || table.id === 'tb_mangve';
                  const unpaidMatch = unpaidOrders.find(o => o.table_id === table.id);
                  const isOccupied = !isTakeaway && (table.status === 'Đang phục vụ' || !!unpaidMatch);
                  const displayStatus = isTakeaway ? 'Mang về' : isOccupied ? 'Đang phục vụ' : 'Trống';

                  return (
                    <button
                      key={table.id}
                      onClick={() => handleSelectTable(table)}
                      className={`h-36 p-4 rounded-2xl border text-left flex flex-col justify-between transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer ${
                        isTakeaway
                          ? 'bg-[#FAF6F0] border-[#8C6A5C] ring-2 ring-[#8C6A5C]/40'
                          : isOccupied
                          ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-200/70 shadow-xs'
                          : 'bg-white border-gray-200 hover:border-[#4A3525]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isTakeaway
                            ? 'bg-[#8C6A5C]/15 text-[#8C6A5C]'
                            : isOccupied 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {displayStatus}
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
          </main>
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
                  type="button"
                  onClick={handleBackToTables}
                  className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-700 transition cursor-pointer"
                  title="Quay lại sơ đồ bàn"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-extrabold text-xs text-gray-800 block leading-tight">
                      {selectedTable?.table_name || 'Bàn chưa chọn'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                      (selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve')
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}>
                      {(selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve') ? 'Mang về' : 'Ngồi lại'}
                    </span>
                  </div>
                  {existingOrder && (
                    <span className="text-[10px] text-amber-800 font-bold">
                      Đơn đang phục vụ
                    </span>
                  )}
                </div>
              </div>

              {/* CÁC THAO TÁC BÀN CẢM ỨNG: TÁCH BILL, GỘP BÀN, ĐỔI BÀN */}
              <div className="flex items-center space-x-1">
                {/* NÚT TÁCH BILL (Hiện khi có từ 2 món trở lên hoặc có món số lượng > 1) */}
                {cart.length > 0 && (cart.length >= 2 || cart.some(i => i.quantity > 1)) && (
                  <button
                    type="button"
                    onClick={handleOpenSplitModal}
                    className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition shadow-2xs active:scale-95"
                    title="Tách các món thành hóa đơn riêng"
                  >
                    <Scissors className="w-3 h-3 text-sky-700" />
                    <span>Tách</span>
                  </button>
                )}

                {existingOrder && selectedTable?.table_name !== 'Khách mang về' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceTableIds([]);
                        setIsMergeModalOpen(true);
                      }}
                      className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition shadow-2xs active:scale-95"
                      title="Gộp các bàn đang phục vụ khác vào bàn này"
                    >
                      <GitMerge className="w-3 h-3 text-purple-700" />
                      <span>Gộp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsTransferModalOpen(true)}
                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition shadow-2xs active:scale-95"
                      title="Chuyển toàn bộ món sang bàn khác"
                    >
                      <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                      <span>Đổi</span>
                    </button>
                  </>
                )}
              </div>
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
                      key={`${item.product_id}-${idx}`}
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
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {/* Chỉ món có ly trong công thức định lượng mới hiện nút chọn ly */}
                            {item.cup_id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCycleCupType(idx);
                              }}
                              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer transition active:scale-90 ${
                                item.cup_id === 'ing_lyden'
                                  ? 'bg-neutral-800 text-amber-200 border-neutral-700'
                                  : item.cup_id === 'ing_lyhoavan'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                              title="Chạm để đổi ly trừ kho (Ly Đen / Ly Trắng / Ly Hoa Văn)"
                            >
                              <span>
                                {item.cup_id === 'ing_lyden'
                                  ? '☕ Ly Đen'
                                  : item.cup_id === 'ing_lyhoavan'
                                  ? '🌸 Ly Hoa Văn'
                                  : '🥤 Ly Trắng'}
                              </span>
                            </button>
                            )}
                            {(() => {
                              const cleanDisplayNote = (item.notes || '').replace(/\[Ly:\s*ing_ly[a-z]+\]/g, '').trim();
                              return cleanDisplayNote ? (
                                <p className="text-[10px] text-amber-700 italic truncate font-normal">
                                  📝 {cleanDisplayNote}
                                </p>
                              ) : null;
                            })()}
                          </div>
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

              {/* NÚT IN BILL, XÓA GIỎ HÀNG & HỦY ĐƠN */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePrintTemporaryBill()}
                  className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-bold text-[11px] transition active:scale-98 cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="In hóa đơn tạm tính cho khách xem"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-700" />
                  <span>In bill</span>
                </button>
                <button
                  onClick={handleClearCart}
                  className="flex-1 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg font-bold text-[11px] text-gray-500 transition active:scale-98 cursor-pointer"
                >
                  Xóa giỏ hàng
                </button>
                {existingOrder && (
                  <button
                    onClick={() => handleCancelOrderById(existingOrder.id, selectedTable?.table_name, existingOrder.total_amount)}
                    className="py-1.5 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg font-bold text-[11px] transition active:scale-98 cursor-pointer flex items-center gap-1"
                    title="Hủy đơn hàng đang phục vụ của bàn này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hủy đơn</span>
                  </button>
                )}
              </div>
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
                        <img
                          src={prod.image_url || '/logo.jpg'}
                          alt={prod.name}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain pointer-events-none rounded-lg"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (!img.src.includes('logo.jpg')) {
                              img.src = '/logo.jpg';
                            }
                          }}
                        />

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
                        <p className="text-[10px] font-black text-[#8C6A5C] mt-0.5">
                          {((selectedTable?.table_name === 'Khách mang về' || selectedTable?.id === 'tb_mangve')
                            ? (prod.takeaway_price ?? prod.price)
                            : (prod.dinein_price ?? prod.price)
                          )?.toLocaleString('vi-VN')} đ
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
          3.5 MODAL CHUYỂN BÀN PHỤC VỤ (ĐỔI BÀN)
      ───────────────────────────────────────────────────────────── */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 animate-scaleIn">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-gray-900">
                  Chuyển {selectedTable?.table_name || 'Bàn'} sang bàn khác
                </h3>
                <p className="text-[11px] text-gray-500">
                  Chọn bàn trống muốn chuyển tới (toàn bộ món sẽ chuyển sang bàn mới)
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsTransferModalOpen(false);
                  setTransferTargetId('');
                }}
                className="p-1.5 hover:bg-gray-200 text-gray-500 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs font-bold text-gray-700">
                Danh sách bàn đang trống:
              </div>

              {/* Danh sách các bàn trống để chọn */}
              <div className="grid grid-cols-3 gap-2.5 max-h-64 overflow-y-auto p-1">
                {tables
                  .filter(t => t.id !== selectedTable?.id && t.table_name !== 'Khách mang về' && t.status === 'Trống')
                  .sort((a, b) => a.table_name.localeCompare(b.table_name, 'vi', { numeric: true }))
                  .map(targetTable => (
                    <button
                      key={targetTable.id}
                      type="button"
                      onClick={() => setTransferTargetId(targetTable.id)}
                      className={`p-3 rounded-xl border text-center transition font-black text-sm cursor-pointer ${
                        transferTargetId === targetTable.id
                          ? 'bg-[#4A3525] text-white border-[#4A3525] shadow-md ring-2 ring-[#4A3525]/30'
                          : 'bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-900 border-emerald-200'
                      }`}
                    >
                      <div>{targetTable.table_name}</div>
                      <span className="text-[10px] font-medium opacity-80">Trống</span>
                    </button>
                  ))}
              </div>

              {tables.filter(t => t.id !== selectedTable?.id && t.table_name !== 'Khách mang về' && t.status === 'Trống').length === 0 && (
                <div className="py-6 text-center text-gray-500 text-xs italic bg-gray-50 rounded-xl border border-gray-200">
                  Hiện không có bàn nào đang trống để chuyển.
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferModalOpen(false);
                  setTransferTargetId('');
                }}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={!transferTargetId || transferring}
                onClick={handleConfirmTransfer}
                className="px-6 py-2.5 bg-[#4A3525] hover:bg-[#382513] text-white font-black text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {transferring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang chuyển...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Xác nhận chuyển bàn</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3.6 MODAL GỘP BÀN (TABLE MERGE)
      ───────────────────────────────────────────────────────────── */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 animate-scaleIn">
            <div className="p-4 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-purple-950 flex items-center space-x-1.5">
                  <GitMerge className="w-4 h-4 text-purple-700" />
                  <span>Gộp bàn vào {selectedTable?.table_name || 'Bàn'}</span>
                </h3>
                <p className="text-[11px] text-purple-800">
                  Chọn một hoặc nhiều bàn đang phục vụ khác để gộp chung hóa đơn
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsMergeModalOpen(false);
                  setSelectedSourceTableIds([]);
                }}
                className="p-1.5 hover:bg-purple-100 text-purple-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs font-bold text-gray-700">
                Chạm để chọn các bàn muốn gộp:
              </div>

              {/* Danh sách các bàn đang phục vụ có thể gộp */}
              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-1">
                {tables
                  .filter(t => t.id !== selectedTable?.id && t.table_name !== 'Khách mang về' && t.status === 'Đang phục vụ')
                  .sort((a, b) => a.table_name.localeCompare(b.table_name, 'vi', { numeric: true }))
                  .map(sourceTable => {
                    const isSelected = selectedSourceTableIds.includes(sourceTable.id);
                    const matchedUnpaid = unpaidOrders.find(o => o.table_id === sourceTable.id);

                    return (
                      <button
                        key={sourceTable.id}
                        type="button"
                        onClick={() => {
                          setSelectedSourceTableIds(prev => 
                            prev.includes(sourceTable.id)
                              ? prev.filter(id => id !== sourceTable.id)
                              : [...prev, sourceTable.id]
                          );
                        }}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-300'
                            : 'bg-gray-50 hover:bg-purple-50 text-gray-900 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">{sourceTable.table_name}</span>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black border ${
                            isSelected ? 'bg-white text-purple-700 border-white' : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected ? '✓' : ''}
                          </span>
                        </div>
                        {matchedUnpaid && (
                          <div className={`text-xs font-bold mt-1 ${isSelected ? 'text-purple-100' : 'text-[#4A3525]'}`}>
                            {Number(matchedUnpaid.total_amount || 0).toLocaleString('vi-VN')} đ
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>

              {tables.filter(t => t.id !== selectedTable?.id && t.table_name !== 'Khách mang về' && t.status === 'Đang phục vụ').length === 0 && (
                <div className="py-8 text-center text-gray-500 text-xs italic bg-gray-50 rounded-xl border border-gray-200">
                  Hiện không có bàn nào khác đang phục vụ để gộp.
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsMergeModalOpen(false);
                  setSelectedSourceTableIds([]);
                }}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={selectedSourceTableIds.length === 0 || merging}
                onClick={handleConfirmMerge}
                className="px-6 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-black text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {merging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang gộp bàn...</span>
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4" />
                    <span>Xác nhận gộp ({selectedSourceTableIds.length} bàn)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3.7 MODAL TÁCH HÓA ĐƠN / THANH TOÁN RIÊNG (TRỰC QUAN - DỄ HIỂU)
      ───────────────────────────────────────────────────────────── */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-gray-200 animate-scaleIn">
            {/* Header Modal */}
            <div className="p-4 bg-sky-50 border-b border-sky-200 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-sky-600 text-white rounded-xl shadow-2xs">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-sky-950">
                    Tách Đơn / Thanh Toán Riêng - {selectedTable?.table_name || 'Bàn'}
                  </h3>
                  <p className="text-[11px] text-sky-800">
                    Chạm nút <span className="font-black">+</span> hoặc <span className="font-black">-</span> để chọn số lượng món khách này muốn trả tiền trước
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSplitModalOpen(false)}
                className="p-1.5 hover:bg-sky-100 text-sky-700 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Danh sách món trên bàn để chọn số lượng tách riêng */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[45vh] custom-scrollbar bg-gray-50/50">
              {cart.map((item, idx) => {
                const splitQty = Math.min(item.quantity, splitQtys[idx] || 0);
                const remainQty = item.quantity - splitQty;
                const cleanNote = stripCupTag(item.notes);
                return (
                  <div
                    key={`${item.product_id}-${idx}`}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                      splitQty > 0
                        ? 'bg-sky-50/80 border-sky-300 shadow-2xs'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-extrabold text-xs text-gray-900 truncate">{item.name}</p>
                      {cleanNote && (
                        <p className="text-[10px] text-amber-700 italic truncate">📝 {cleanNote}</p>
                      )}
                      <p className="text-[11px] text-gray-500 font-medium">
                        {item.price.toLocaleString('vi-VN')} đ/ly • Tổng bàn có: <span className="font-bold text-gray-800">{item.quantity} ly</span>
                      </p>
                    </div>

                    {/* Bộ chọn số lượng tách riêng */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="flex items-center bg-white border border-gray-300 rounded-xl overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          disabled={splitQty <= 0}
                          onClick={() => handleSetSplitItemQty(idx, splitQty - 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-25 transition font-black text-sm cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-black text-xs text-sky-950">
                          {splitQty}
                        </span>
                        <button
                          type="button"
                          disabled={remainQty <= 0}
                          onClick={() => handleSetSplitItemQty(idx, splitQty + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-25 transition font-black text-sm cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSetSplitItemQty(idx, splitQty === item.quantity ? 0 : item.quantity)}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-black transition border cursor-pointer ${
                          splitQty === item.quantity
                            ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                            : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {splitQty === item.quantity ? 'Bỏ' : 'Hết'}
                      </button>

                      <div className="w-20 text-right">
                        <span className="font-black text-xs text-[#4A3525]">
                          {(splitQty * item.price).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2 Hộp tóm tắt rõ ràng: Khách trả trước & Còn lại ở bàn */}
            <div className="p-4 bg-white border-t border-gray-200 grid grid-cols-2 gap-3 shrink-0">
              {/* Cột 1: Khách này trả trước */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-300 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase text-emerald-900 tracking-wider">
                    1. Khách trả trước ({splitCart.reduce((s, i) => s + i.quantity, 0)} ly)
                  </span>
                  <span className="font-black text-base text-emerald-950 font-mono">
                    {splitCart.reduce((s, i) => s + i.subtotal, 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSplitPaymentMethod('Tiền mặt')}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      splitPaymentMethod === 'Tiền mặt'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Tiền mặt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitPaymentMethod('Chuyển khoản')}
                    className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center justify-center gap-1 ${
                      splitPaymentMethod === 'Chuyển khoản'
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>VietQR</span>
                  </button>
                </div>
              </div>

              {/* Cột 2: Còn lại trên bàn */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-gray-600 tracking-wider">
                    2. Còn lại ở bàn ({splitRemainingCart.reduce((s, i) => s + i.quantity, 0)} ly)
                  </span>
                  <span className="font-extrabold text-sm text-[#4A3525] font-mono">
                    {splitRemainingCart.reduce((s, i) => s + i.subtotal, 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 italic">
                  Các món còn lại sẽ tiếp tục được lưu trên bàn để khách tiếp theo trả
                </p>
              </div>
            </div>

            {/* Footer Modal Action Buttons */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(false)}
                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                disabled={splitCart.length === 0 || splitting}
                onClick={handleConfirmSplit}
                className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                {splitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>
                      Xác nhận Thu {splitCart.reduce((s, i) => s + i.subtotal, 0).toLocaleString('vi-VN')} đ & In bill riêng
                    </span>
                  </>
                )}
              </button>
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
                  <span>Chuyển khoản VietQR</span>
                </button>
              </div>

              {/* NẾU LÀ CHUYỂN KHOẢN -> DÙNG MÃ TECHCOMBANK VIETQR CỦA QUÁN */}
              {paymentMethod === 'Chuyển khoản' && (
                <div className="p-4 bg-red-50/70 border-2 border-red-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-red-200/80 pb-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                      <span className="text-xs font-black text-red-700 tracking-wider">
                        TECHCOMBANK • VIETQR
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                      NAPAS 247
                    </span>
                  </div>

                  {/* Hiển thị mã QR Techcombank Điểm bán chính thức kết nối Loa Soundbox */}
                  <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-red-100 shadow-2xs space-y-2">
                    <img
                      src="/techcombank-qr-card.png"
                      alt="Mã QR Techcombank Điểm bán AVA Coffee K300"
                      className="max-h-60 w-auto object-contain rounded-lg shadow-xs"
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
                    <div className="w-full bg-red-50 p-2 rounded-lg text-center border border-red-100">
                      <p className="text-[11px] text-gray-600 font-medium">
                        Số tiền cần chuyển: <strong className="text-sm font-black text-red-600 font-mono">{finalTotalAmount.toLocaleString('vi-VN')} đ</strong>
                      </p>
                    </div>
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
                onClick={() => handleProcessPayment()}
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
                {(() => {
                  const note = (selectedKitchenTicket.notes || '').replace(/\[?Đã pha chế\]?/gi, '').trim();
                  return note ? (
                    <p className="text-amber-800 font-medium pt-1 border-t border-gray-200">
                      📝 Ghi chú: {note}
                    </p>
                  ) : null;
                })()}
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
                unpaidOrders.map(order => {
                  const matchedTable = tables.find(t => t.id === order.table_id);
                  const isTakeaway = order.tables?.table_name === 'Khách mang về' || order.table_id === 'tb_mangve';
                  return (
                    <div
                      key={order.id}
                      className="p-3.5 bg-gray-50 hover:bg-[#FAF6F0] border border-gray-200 rounded-2xl transition space-y-2.5 shadow-2xs"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isTakeaway ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isTakeaway ? 'Mang về' : 'Ngồi lại'}
                            </span>
                            <span className="font-extrabold text-sm text-gray-900">
                              {order.tables?.table_name || 'Khách mang về'}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-1 space-y-0.5">
                            <div>Giờ tạo: {new Date(order.created_at || order.ngay_tao || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • Thu ngân: {order.users?.full_name || 'Admin'}</div>
                            {order.notes && <div className="italic text-gray-600">Ghi chú: {order.notes}</div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-base text-[#4A3525]">
                            {Number(order.total_amount).toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                      </div>

                      {/* HÀNG NÚT THAO TÁC: MỞ ĐƠN, THANH TOÁN, HỦY ĐƠN */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-200/80">
                        <button
                          type="button"
                          onClick={() => {
                            if (matchedTable) {
                              handleSelectTable(matchedTable);
                            }
                            setIsUnpaidOrdersDrawerOpen(false);
                          }}
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer"
                        >
                          <span>Mở bàn</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintTemporaryBill(order)}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                          title="In lại hóa đơn tạm tính cho khách xem"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-700" />
                          <span>In hoá đơn</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            handleQuickPayFromTicket(order);
                            setIsUnpaidOrdersDrawerOpen(false);
                          }}
                          className="px-3 py-1.5 bg-[#4A3525] hover:bg-[#382513] text-white rounded-xl text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Thanh toán</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelOrderById(order.id, order.tables?.table_name || 'Khách mang về', order.total_amount);
                          }}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold border border-red-200 transition flex items-center gap-1 active:scale-95 cursor-pointer"
                          title="Hủy đơn hàng này hoàn toàn"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hủy đơn</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
