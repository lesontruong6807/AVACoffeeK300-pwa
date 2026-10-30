'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { db, createCoalescedRefresher } from '@/lib/database';
import { toast } from '@/lib/toast';
import { 
  CreditCard, 
  Trash2, 
  DollarSign, 
  ArrowRightLeft, 
  Calendar, 
  User, 
  Coffee, 
  CheckCircle,
  X,
  Loader2,
  ArrowLeft,
  Printer,
  Pencil,
  Scissors,
  SplitSquareVertical,
  Check,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function PaymentPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedSplitItems, setSelectedSplitItems] = useState<string[]>([]);

  const getDisplayedItems = () => {
    const isEditing = editingOrderId === selectedOrder?.id;
    if (!isEditing && !isSplitMode) return orderItems;

    const items: any[] = [];
    orderItems.forEach((item) => {
      if (item.quantity && item.quantity >= 2) {
        for (let i = 0; i < item.quantity; i++) {
          items.push({
            ...item,
            id: `${item.id}-split-${i}`,
            originalId: item.id, // Lưu lại ID gốc trong DB
            quantity: 1,
            subtotal: item.unit_price || item.products?.price || 0,
            isSplit: true
          });
        }
      } else {
        items.push({
          ...item,
          originalId: item.id,
          isSplit: false
        });
      }
    });
    return items;
  };

  const selectedOrderRef = useRef<any>(null);
  useEffect(() => {
    selectedOrderRef.current = selectedOrder;
  }, [selectedOrder]);

  const loadOrders = async (isBackground = false) => {
    if (!isBackground && orders.length === 0) setLoading(true);
    try {
      // Chỉ lấy trực tiếp hóa đơn "Chưa thanh toán" (tối ưu siêu tốc độ)
      const unpaid = await db.getUnpaidOrders();
      setOrders(unpaid);
      try {
        localStorage.setItem('ava_payment_cache_unpaid', JSON.stringify(unpaid));
      } catch (_) {}
      
      // Nếu có hóa đơn được chọn trước đó, kiểm tra xem còn tồn tại chưa thanh toán không
      const currentSelected = selectedOrderRef.current;
      if (currentSelected) {
        const updatedSelected = unpaid.find(o => o.id === currentSelected.id);
        if (updatedSelected) {
          setSelectedOrder(updatedSelected);
        } else {
          setSelectedOrder(null);
          setOrderItems([]);
          setIsPayModalOpen(false);
          setIsSplitMode(false);
          setEditingOrderId(null);
          toast.info('Hóa đơn đang xem đã được thanh toán hoặc cập nhật từ thiết bị khác.');
        }
      }
    } catch (e) {
      console.error('Lỗi khi tải hóa đơn:', e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    
    // 0. Đọc dữ liệu từ cache trước để hiển thị tức thì (0ms)
    try {
      const cached = localStorage.getItem('ava_payment_cache_unpaid');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setOrders(parsed);
          setLoading(false);
        }
      }
    } catch (_) {}

    loadOrders();

    // 1. Realtime listener cho hóa đơn & chi tiết hóa đơn (gom sự kiện dồn dập thành 1 lần tải)
    const scheduleReload = createCoalescedRefresher(() => loadOrders(true), 600, 3000, { onlyWhenVisible: true });
    const unsubscribeOrders = db.subscribeToOrderChanges(scheduleReload);
    const unsubscribe = () => {
      scheduleReload.cancel();
      unsubscribeOrders();
    };

    // 2. Tự động kiểm tra & đồng bộ khi mở sáng màn hình / kết nối mạng lại (có throttle chống spam)
    let lastWakeup = 0;
    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastWakeup < 2500) return;
        lastWakeup = now;
        loadOrders(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', handleWakeup);
      window.addEventListener('focus', handleWakeup);
      window.addEventListener('online', handleWakeup);
    }

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleWakeup);
        window.removeEventListener('focus', handleWakeup);
        window.removeEventListener('online', handleWakeup);
      }
    };
  }, []);

  // Tải chi tiết các món trong hóa đơn
  useEffect(() => {
    async function loadItems() {
      if (!selectedOrder) return;
      setLoadingItems(true);
      try {
        const items = await db.getOrderItems(selectedOrder.id);
        setOrderItems(items);
      } catch (e) {
        console.error('Lỗi tải chi tiết hóa đơn:', e);
      } finally {
        setLoadingItems(false);
      }
    }
    loadItems();
  }, [selectedOrder]);

  const processingPayIdsRef = useRef<{ [orderId: string]: boolean }>({});

  const handlePay = async (method: 'Tiền mặt' | 'Chuyển khoản') => {
    if (!selectedOrder || submittingPayment) return;
    if (processingPayIdsRef.current[selectedOrder.id]) return;

    const targetOrder = selectedOrder;
    processingPayIdsRef.current[targetOrder.id] = true;
    setSubmittingPayment(true);
    
    // Optimistic UI Update: Đóng modal và loại bỏ đơn hàng khỏi danh sách chờ thanh toán ngay lập tức
    setIsPayModalOpen(false);
    setOrders(prev => prev.filter(o => o.id !== targetOrder.id));
    setSelectedOrder(null);
    setOrderItems([]);
    setEditingOrderId(null);

    confetti({
      particleCount: 150,
      spread: 80,
      colors: ['#4A3525', '#FFE4C4', '#FFFDD0', '#8C6A5C']
    });

    try {
      await db.payOrder(targetOrder.id, method);
      toast.success(`Thanh toán thành công qua phương thức: ${method}`);

      // Nếu chạy trên Desktop Windows: Tự động kích mở két tiền khi thanh toán tiền mặt
      if (method === 'Tiền mặt') {
        try {
          const { kickCashDrawer } = await import('@/lib/tauriPOS');
          await kickCashDrawer();
        } catch (kdErr) {}
      }

      // Cập nhật trạng thái hoàn tất lên màn hình phụ của khách
      try {
        const { syncCustomerDisplay } = await import('@/lib/tauriPOS');
        await syncCustomerDisplay({
          tableName: targetOrder.tables?.table_name || '',
          items: [],
          totalAmount: targetOrder.total_amount,
          paymentMethod: method,
          orderStatus: 'paid'
        });
      } catch (dispErr) {}
    } catch (e) {
      console.error('Lỗi thanh toán:', e);
      toast.error('Gặp lỗi khi xử lý thanh toán.');
      delete processingPayIdsRef.current[targetOrder.id];
      // Rollback nếu có lỗi mạng
      await loadOrders();
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Hủy hóa đơn hoàn toàn
  const handleCancel = async () => {
    if (!selectedOrder) return;
    const confirmCancel = window.confirm("Bạn có chắc chắn muốn hủy và xóa hoàn toàn hóa đơn này không?");
    if (!confirmCancel) return;

    try {
      const success = await db.cancelOrder(selectedOrder.id);
      if (success) {
        toast.success("Đã hủy và xóa hóa đơn thành công!");
        setSelectedOrder(null);
        setOrderItems([]);
        await loadOrders();
      } else {
        toast.error("Không thể hủy hóa đơn này.");
      }
    } catch (e) {
      console.error("Lỗi khi hủy hóa đơn:", e);
      toast.error("Gặp lỗi khi hủy hóa đơn.");
    }
  };

  // Xóa một món cụ thể khỏi hóa đơn
  const handleDeleteOrderItem = async (itemId: string, itemName: string, isSplit?: boolean) => {
    if (!selectedOrder) return;
    const confirmDelete = window.confirm(`Bạn có chắc chắn muốn xóa món "${itemName}" khỏi hóa đơn này không?`);
    if (!confirmDelete) return;

    setLoadingItems(true);
    try {
      const result = await db.deleteOrderItem(selectedOrder.id, itemId, isSplit ? 1 : 0);
      toast.success(`Đã xóa món ${itemName} khỏi hóa đơn.`);
      
      if (result.orderDeleted) {
        setSelectedOrder(null);
        setOrderItems([]);
        setEditingOrderId(null);
        toast.info("Hóa đơn đã được hủy tự động vì không còn món ăn nào.");
      } else {
        // Tải lại chi tiết món ăn còn lại
        const items = await db.getOrderItems(selectedOrder.id);
        setOrderItems(items);
      }
      
      // Tải lại danh sách hóa đơn chưa thanh toán
      await loadOrders();
    } catch (err) {
      console.error("Lỗi khi xóa món ăn:", err);
      toast.error("Không thể xóa món ăn.");
    } finally {
      setLoadingItems(false);
    }
  };

  // Chia đơn/Tách hóa đơn mới
  const handleSplitOrder = async () => {
    if (!selectedOrder || selectedSplitItems.length === 0) return;
    const confirmSplit = window.confirm(`Bạn có chắc chắn muốn TÁCH ${selectedSplitItems.length} món đã chọn ra thành một hóa đơn mới không?`);
    if (!confirmSplit) return;

    setLoadingItems(true);
    try {
      // Group các items cần tách theo originalId
      const itemSplitRequests: { [itemId: string]: number } = {};
      const displayedItems = getDisplayedItems();
      
      selectedSplitItems.forEach(id => {
         const matched = displayedItems.find(item => item.id === id);
         if (matched) {
           const origId = matched.originalId || matched.id;
           itemSplitRequests[origId] = (itemSplitRequests[origId] || 0) + 1;
         }
      });

      const requestPayload = Object.entries(itemSplitRequests).map(([itemId, splitQuantity]) => ({
         itemId,
         splitQuantity
      }));

      const result = await db.splitOrder(selectedOrder.id, requestPayload);
      if (result.success) {
        toast.success("Tách hóa đơn thành công!");
        setIsSplitMode(false);
        setSelectedSplitItems([]);
        
        // Load lại dữ liệu hóa đơn
        await loadOrders();
        
        // Reset trạng thái chọn đơn hàng hiện tại
        setSelectedOrder(null);
        setOrderItems([]);
        setEditingOrderId(null);
      } else {
        toast.error("Không thể tách hóa đơn.");
      }
    } catch (err) {
      console.error("Lỗi khi tách hóa đơn:", err);
      toast.error("Gặp lỗi trong quá trình tách hóa đơn.");
    } finally {
      setLoadingItems(false);
    }
  };

  // In lại hóa đơn thô (chỉ chạy trên thiết bị native Android)
  const handlePrint = async () => {
    if (!selectedOrder) return;
    try {
      const { printOrderDirect } = await import('@/lib/printerService');
      
      const itemsForPrint = orderItems.map(item => ({
        name: item.products?.name || 'San pham',
        price: item.unit_price || item.products?.price || 0,
        quantity: item.quantity,
        subtotal: item.subtotal
      }));

      await printOrderDirect({
        tableName: selectedOrder.tables?.table_name || 'Ban khong xac dinh',
        staffName: selectedOrder.users?.full_name || 'Nhan vien',
        items: itemsForPrint,
        discount: selectedOrder.discount || 0,
        totalAmount: selectedOrder.total_amount,
        orderId: selectedOrder.id,
        notes: selectedOrder.notes || ''
      }, undefined, undefined, { allowReprint: true }); // Nhân viên chủ động bấm in lại
      toast.success('Đã gửi lệnh in tới máy in!');
    } catch (e) {
      console.error('Lỗi khi in hóa đơn:', e);
      toast.error('Lỗi in bill: Không thể kết nối tới máy in (192.168.1.232:9100)');
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Nút Quay về Trang chủ */}
      <Link 
        href="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold hover:bg-coffee-light transition shadow-sm w-fit animate-fade-in"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về Trang chủ</span>
      </Link>

      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4">
          <h3 className="font-bold text-lg text-coffee-primary flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-coffee-medium" />
            <span>Danh sách hóa đơn chưa thanh toán ({orders.length})</span>
          </h3>
          <p className="text-xs text-coffee-medium">
            Chọn hóa đơn bên dưới để xem chi tiết món ăn, thực hiện thanh toán hoặc hủy đơn nhanh chóng.
          </p>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="py-12 flex justify-center bg-white rounded-3xl border border-coffee-light">
              <Loader2 className="w-8 h-8 text-coffee-primary animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center text-coffee-medium border border-coffee-light space-y-4">
              <Coffee className="w-16 h-16 mx-auto opacity-30 text-coffee-primary" />
              <p className="font-bold text-sm">Không có hóa đơn chờ thanh toán</p>
              <p className="text-xs">Các bàn hiện tại đều trống hoặc đã hoàn tất thanh toán.</p>
            </div>
          ) : (
            orders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              return (
                <div 
                  key={order.id} 
                  className={`bg-white rounded-3xl border transition-all duration-300 overflow-hidden shadow-sm ${
                    isSelected 
                      ? 'border-coffee-accent ring-1 ring-coffee-accent shadow-md' 
                      : 'border-coffee-light hover:border-coffee-medium/55'
                  }`}
                >
                  {/* CARD HEADER (Always visible) */}
                  <button
                    onClick={() => {
                      if (isSelected) {
                        setSelectedOrder(null);
                        setOrderItems([]);
                        setEditingOrderId(null);
                        setIsSplitMode(false);
                        setSelectedSplitItems([]);
                      } else {
                        setSelectedOrder(order);
                        setEditingOrderId(null);
                        setIsSplitMode(false);
                        setSelectedSplitItems([]);
                      }
                    }}
                    className="w-full flex items-center justify-between p-5 text-left transition hover:bg-[#FAF6F0]/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-extrabold text-base text-coffee-dark">
                          {order.tables?.table_name || 'Bàn không xác định'}
                        </h4>
                        <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold uppercase tracking-wider">
                          Chờ thanh toán
                        </span>
                        {order.notes && (
                          <span 
                            title="Đơn hàng có ghi chú" 
                            className="inline-flex items-center justify-center p-1 bg-amber-100/90 text-amber-800 border border-amber-300/80 rounded-lg shadow-2xs"
                          >
                            <FileText className="w-3.5 h-3.5 text-amber-700" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-coffee-medium flex items-center">
                        <User className="w-3.5 h-3.5 mr-1" />
                        <span>Mã HĐ: {order.id.substring(0, 8).toUpperCase()}</span>
                        <span className="mx-2">•</span>
                        <span>{new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>

                    <div className="text-right space-y-0.5">
                      <p className="font-black text-lg text-coffee-primary">
                        {order.total_amount.toLocaleString('vi-VN')}đ
                      </p>
                      <p className="text-[10px] text-coffee-medium">
                        {isSelected ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
                      </p>
                    </div>
                  </button>

                  {/* EXPANDED CONTENT */}
                  {isSelected && (
                    <div className="border-t border-coffee-light/60 p-5 bg-[#FAF6F0]/20 space-y-5">
                      {/* Meta Info & Order Note */}
                      <div className="space-y-3 border-b border-coffee-light/60 pb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-coffee-medium">
                          <div>
                            Thời gian đặt: <strong>{new Date(order.created_at).toLocaleString('vi-VN')}</strong>
                          </div>
                          <div>
                            Nhân viên lập đơn: <strong>{order.users?.full_name || 'Admin'}</strong>
                          </div>
                        </div>

                        {/* Ghi chú đơn hàng nếu có (nằm ngay dưới Thời gian đặt) */}
                        {(order.notes || orderItems.find(i => i.ghi_chu?.includes('[Ghi chú đơn:'))?.ghi_chu) && (
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-start space-x-2.5 shadow-sm">
                            <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold uppercase tracking-wider text-[10px] text-amber-800 block mb-0.5">Ghi chú:</span>
                              <span className="font-semibold text-amber-950 text-xs">
                                {order.notes || orderItems.find(i => i.ghi_chu?.includes('[Ghi chú đơn:'))?.ghi_chu?.match(/\[Ghi chú đơn:\s*([^\]]+)\]/)?.[1] || ''}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => {
                                if (editingOrderId === selectedOrder.id) {
                                  setEditingOrderId(null);
                                } else {
                                  setEditingOrderId(selectedOrder.id);
                                  setIsSplitMode(false);
                                  setSelectedSplitItems([]);
                                }
                              }}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-[10px] font-black border transition uppercase tracking-wider ${
                                editingOrderId === selectedOrder.id
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-white text-coffee-primary border-coffee-light hover:bg-[#FAF6F0]'
                              }`}
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{editingOrderId === selectedOrder.id ? 'Hoàn tất' : 'Sửa'}</span>
                            </button>

                            <button
                              onClick={() => {
                                if (isSplitMode) {
                                  setIsSplitMode(false);
                                  setSelectedSplitItems([]);
                                } else {
                                  setIsSplitMode(true);
                                  setEditingOrderId(null);
                                }
                              }}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-[10px] font-black border transition uppercase tracking-wider ${
                                isSplitMode
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-white text-coffee-primary border-coffee-light hover:bg-[#FAF6F0]'
                              }`}
                            >
                              <Scissors className="w-3 h-3" />
                              <span>{isSplitMode ? 'Hủy chia' : 'Chia đơn'}</span>
                            </button>

                            <h5 className="font-bold text-xs text-coffee-dark uppercase tracking-wider">Danh sách món ăn</h5>
                          </div>
                          {isSplitMode && selectedSplitItems.length > 0 && (
                            <button
                              onClick={handleSplitOrder}
                              className="px-3 py-1.5 bg-coffee-primary hover:bg-coffee-dark text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center space-x-1 shadow transition animate-fade-in animate-duration-200"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Chia ({selectedSplitItems.length} món)</span>
                            </button>
                          )}
                          {editingOrderId === selectedOrder.id && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                              Chế độ tách món lẻ
                            </span>
                          )}
                        </div>
                        {loadingItems ? (
                          <div className="py-4 flex justify-center">
                            <Loader2 className="w-5 h-5 text-coffee-primary animate-spin" />
                          </div>
                        ) : (
                          <div className="border border-coffee-light bg-white rounded-2xl overflow-hidden divide-y divide-coffee-light/50">
                             {getDisplayedItems().map((item) => (
                              <div key={item.id} className="flex justify-between items-center p-3.5 text-xs">
                                <div className="flex items-center">
                                  {isSplitMode && (
                                    <input
                                      type="checkbox"
                                      checked={selectedSplitItems.includes(item.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedSplitItems(prev => [...prev, item.id]);
                                        } else {
                                          setSelectedSplitItems(prev => prev.filter(id => id !== item.id));
                                        }
                                      }}
                                      className="w-4 h-4 rounded border-coffee-light text-coffee-primary focus:ring-coffee-accent mr-3 cursor-pointer"
                                    />
                                  )}
                                  <div className="space-y-0.5">
                                    <p className="font-bold text-coffee-dark">{item.products?.name || 'Món ăn đã xoá'}</p>
                                    <p className="text-[10px] text-coffee-medium">Đơn giá: {item.unit_price?.toLocaleString('vi-VN') || item.products?.price?.toLocaleString('vi-VN')}đ</p>
                                    {item.ghi_chu && item.ghi_chu.replace(/\[Ghi chú đơn:[^\]]+\]/g, '').trim() && (
                                      <p className="text-[10px] text-amber-700 italic font-medium">
                                        📝 {item.ghi_chu.replace(/\[Ghi chú đơn:[^\]]+\]/g, '').trim()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <span className="font-bold text-coffee-medium">x {item.quantity}</span>
                                  <span className="font-extrabold text-coffee-dark w-16 text-right">
                                    {item.subtotal.toLocaleString('vi-VN')}đ
                                  </span>
                                  {editingOrderId === selectedOrder.id && (
                                    <button
                                      onClick={() => handleDeleteOrderItem(item.originalId || item.id, item.products?.name || 'Sản phẩm', item.isSplit)}
                                      title="Xóa món khỏi hóa đơn"
                                      className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Phân rã giá tiền (Tạm tính, Giảm giá, Tổng cộng) */}
                      <div className="bg-[#FAF6F0]/40 p-4 rounded-2xl border border-coffee-light/60 space-y-2">
                        {order.discount > 0 && (
                          <>
                            <div className="flex justify-between text-xs text-coffee-medium">
                              <span>Tiền món ăn:</span>
                              <span className="font-semibold">{(order.total_amount + order.discount).toLocaleString('vi-VN')}đ</span>
                            </div>
                            <div className="flex justify-between text-xs text-red-600">
                              <span>Giảm giá:</span>
                              <span className="font-bold">-{order.discount.toLocaleString('vi-VN')}đ</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between border-t border-coffee-light/40 pt-2">
                          <span className="font-extrabold text-xs text-coffee-dark">Tổng tiền thanh toán:</span>
                          <span className="text-sm font-black text-coffee-primary font-mono">
                            {order.total_amount.toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons inside Card */}
                      <div className="flex items-center justify-end space-x-3 pt-1 border-t border-coffee-light/40">
                        <button
                          onClick={handleCancel}
                          className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition flex items-center space-x-2 text-xs font-bold shadow-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Hủy đơn</span>
                        </button>
                        {isNative && (
                          <button
                            onClick={handlePrint}
                            className="px-5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl transition flex items-center space-x-2 text-xs font-bold shadow-sm"
                          >
                            <Printer className="w-4 h-4" />
                            <span>In hóa đơn</span>
                          </button>
                        )}
                        <button
                          onClick={() => setIsPayModalOpen(true)}
                          className="px-5 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white rounded-xl transition flex items-center space-x-2 text-xs font-bold shadow shadow-coffee-primary/20"
                        >
                          <DollarSign className="w-4 h-4 text-coffee-accent" />
                          <span>Thanh toán</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* POPUP CHỌN PHƯƠNG THỨC THANH TOÁN */}
      {isPayModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 sm:space-y-6 border border-coffee-accent/40 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
              <h3 className="font-extrabold text-base sm:text-lg text-coffee-dark">Xác nhận thanh toán</h3>
              <button 
                onClick={() => setIsPayModalOpen(false)}
                className="p-1 hover:bg-coffee-light rounded-lg text-coffee-medium cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-coffee-medium">
                Bạn đang thực hiện thanh toán cho bàn: <strong>{selectedOrder.tables?.table_name}</strong>
              </p>
              {selectedOrder.notes && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-xs text-amber-900 flex items-start space-x-2">
                  <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Ghi chú:</span> {selectedOrder.notes}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center bg-[#FAF6F0] p-4 rounded-2xl border border-coffee-light">
                <span className="text-sm font-semibold text-coffee-dark">Tổng tiền cần thu:</span>
                <span className="text-xl font-black text-coffee-primary">
                  {selectedOrder.total_amount.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <p className="text-xs font-bold text-coffee-medium uppercase tracking-wider">Chọn phương thức thanh toán</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handlePay('Tiền mặt')}
                  disabled={submittingPayment}
                  className="p-5 bg-coffee-cream/40 border border-coffee-accent hover:bg-coffee-accent/50 rounded-2xl flex flex-col items-center justify-center space-y-2 transition font-bold text-coffee-dark shadow-sm text-sm"
                >
                  <DollarSign className="w-8 h-8 text-coffee-primary" />
                  <span>Tiền mặt</span>
                </button>
                <button
                  onClick={() => handlePay('Chuyển khoản')}
                  disabled={submittingPayment}
                  className="p-5 bg-coffee-cream/40 border border-coffee-accent hover:bg-coffee-accent/50 rounded-2xl flex flex-col items-center justify-center space-y-2 transition font-bold text-coffee-dark shadow-sm text-sm"
                >
                  <ArrowRightLeft className="w-8 h-8 text-coffee-primary" />
                  <span>Chuyển khoản</span>
                </button>
              </div>
            </div>

            <div className="pt-2 text-center text-[10px] text-coffee-medium/70">
              Nhân viên thực hiện: {selectedOrder.users?.full_name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
