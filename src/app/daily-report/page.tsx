'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db, getCurrentUser } from '@/lib/database';
import { toast } from '@/lib/toast';
import { BarChart3, Clock, DollarSign, ShoppingBag, TrendingUp, ShieldCheck, Calendar, ArrowRightLeft, ArrowLeft, X } from 'lucide-react';

const isOrderPendingCancel = (o: any) => {
  if (!o) return false;
  const status = o.payment_status || (o as any).trang_thai_thanh_toan;
  if (status === 'Chờ duyệt hủy') return true;
  const notes = o.notes || (o as any).ghi_chu || '';
  return notes.includes('[Chờ duyệt hủy]') && !notes.includes('[Admin đã duyệt hủy]') && !notes.includes('[Admin từ chối hủy]');
};

export default function DailyReportPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeShiftFilter, setActiveShiftFilter] = useState<'morning' | 'afternoon' | 'both'>('both');

  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const [allOrders, allLogs, allItems, allRecipes] = await Promise.all([
        db.getOrders(),
        db.getInventoryLogs(),
        db.getAllOrderItems(),
        db.getRecipes()
      ]);
      setOrders(allOrders);
      setInventoryLogs(allLogs);
      setOrderItems(allItems);
      setRecipes(allRecipes);
    } catch (e) {
      console.error('Lỗi khi tải hóa đơn báo cáo:', e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    loadData();

    // 1. Realtime listener cho báo cáo ca trực (Đơn hàng, Chi phí, Nhập kho)
    const unsubscribe = db.subscribeToReportChanges(() => {
      loadData(true);
    });

    // 2. Tự động kiểm tra & đồng bộ khi mở sáng màn hình / kết nối mạng lại
    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadData(true);
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

  // Helper lấy chuỗi ngày chuẩn hóa theo giờ Việt Nam (YYYY-MM-DD)
  const getVnDate = (d: string | Date = new Date()) => {
    return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  };

  // Helper lấy số phút trong ngày theo giờ Việt Nam
  const getVnMins = (d: string | Date) => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(d)).split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } catch (_) {
      const dt = new Date(d);
      return dt.getHours() * 60 + dt.getMinutes();
    }
  };

  // 1. Lọc hóa đơn ngày hôm nay (chuẩn hóa múi giờ Việt Nam):
  // - todayPaidOrders: Chỉ các đơn Đã thanh toán hợp lệ (loại trừ ngay đơn đang Chờ duyệt hủy để tiền két và doanh thu khớp 100%)
  // - todayAllOrders: Bao gồm cả đơn Đã thanh toán & đơn Chờ duyệt hủy (dùng để hiển thị danh sách đối soát)
  const todayVn = getVnDate();
  const todayPaidOrders = orders.filter(o => {
    if (o.payment_status !== 'Đã thanh toán') return false;
    if (isOrderPendingCancel(o)) return false;
    return getVnDate(o.paid_at || o.created_at) === todayVn;
  });

  const todayAllOrders = orders.filter(o => {
    const isPaid = o.payment_status === 'Đã thanh toán';
    const isPending = isOrderPendingCancel(o);
    if (!isPaid && !isPending) return false;
    return getVnDate(o.paid_at || o.created_at) === todayVn;
  });

  const todayLogs = inventoryLogs.filter(l => {
    return getVnDate(l.created_at) === todayVn && l.type === 'Nhập kho' && l.status === 'Đã duyệt';
  });

  // 2. Phân loại theo Ca làm việc (theo chuẩn giờ Việt Nam)
  // Ca sáng: 05:30 - 12:00 (Tính các order/chi phí tạo trước 14:00 VN)
  const morningOrders = todayPaidOrders.filter(o => getVnMins(o.paid_at || o.created_at) < (14 * 60));
  const morningAllOrders = todayAllOrders.filter(o => getVnMins(o.paid_at || o.created_at) < (14 * 60));
  const morningLogs = todayLogs.filter(l => getVnMins(l.created_at) < (14 * 60));

  // Ca chiều: 16:00 - 21:00 (Tính các order/chi phí tạo từ 14:00 VN trở đi)
  const afternoonOrders = todayPaidOrders.filter(o => getVnMins(o.paid_at || o.created_at) >= (14 * 60));
  const afternoonAllOrders = todayAllOrders.filter(o => getVnMins(o.paid_at || o.created_at) >= (14 * 60));
  const afternoonLogs = todayLogs.filter(l => getVnMins(l.created_at) >= (14 * 60));

  // 3. Hàm tính toán các chỉ số cho từng ca
  const calculateMetrics = (shiftOrders: any[], shiftLogs: any[], displayOrders: any[] = shiftOrders) => {
    const totalDiscount = shiftOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
    const grossRevenue = shiftOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) + totalDiscount;
    const actualRevenue = shiftOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalCash = shiftOrders.filter(o => o.payment_method === 'Tiền mặt').reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const totalTransfer = shiftOrders.filter(o => o.payment_method === 'Chuyển khoản').reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    
    // Chi phí nhập kho / chi trả tiền mặt trong ca
    const restockCosts = shiftLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
    const restockExpenses = restockCosts + totalDiscount; 
    const restockItems = shiftLogs;
    const netRevenue = actualRevenue - restockCosts;

    // Tiền mặt thực tế còn lại trong két cuối ca = Tiền mặt thu - Tiền mặt xuất trả hàng trong ca
    const currentCash = Math.max(0, totalCash - restockCosts);

    // --- Tính toán thống kê bán hàng (Phân loại rõ ràng Tại quán & Mang đi) ---
    const shiftItems = orderItems.filter(item => shiftOrders.some(o => o.id === item.order_id));
    const salesMap: { 
      [key: string]: { 
        id: string;
        product_id: string;
        name: string; 
        baseName: string;
        isTakeaway: boolean;
        type: 'Tại quán' | 'Mang đi';
        quantity: number; 
        price: number; 
        subtotal: number;
      } 
    } = {};
    
    shiftItems.forEach(item => {
      const prodId = item.product_id;
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || item.products?.price || 0);
      const parentOrder = shiftOrders.find(o => o.id === item.order_id);
      const isTakeaway = parentOrder?.table_id === 'tb_mangve' || parentOrder?.tables?.table_name === 'Khách mang về';
      const key = `${prodId}_${isTakeaway ? 'takeaway' : 'dinein'}`;
      const rawName = item.products?.name || item.ten_san_pham || 'Sản phẩm';

      if (!salesMap[key]) {
        salesMap[key] = {
          id: key,
          product_id: prodId,
          baseName: rawName,
          name: isTakeaway ? `${rawName} (Mang đi)` : rawName,
          isTakeaway,
          type: isTakeaway ? 'Mang đi' : 'Tại quán',
          quantity: 0,
          price: price,
          subtotal: 0
        };
      }
      salesMap[key].quantity += qty;
      salesMap[key].subtotal += (Number(item.subtotal) || (qty * price));
      if (!salesMap[key].price && price) {
        salesMap[key].price = price;
      }
    });

    const sortedSales = Object.values(salesMap).sort((a, b) => b.quantity - a.quantity);

    let lyDen = 0;
    let lyTrang = 0;
    let lyHoaVan = 0;

    shiftItems.forEach(item => {
      const prodId = item.product_id;
      const qty = Number(item.quantity || 0);
      
      // Kiểm tra xem món có chỉ định đổi ly riêng không
      let customCup = item.cup_id;
      if (!customCup && item.notes) {
        const m = item.notes.match(/\[Ly:\s*(ing_ly[a-z]+)\]/);
        if (m) customCup = m[1];
      }

      if (customCup) {
        if (customCup === 'ing_lyden') lyDen += qty;
        else if (customCup === 'ing_lyhoavan') lyHoaVan += qty;
        else lyTrang += qty;
      } else {
        const prodRecipes = recipes.filter(r => r.product_id === prodId);
        prodRecipes.forEach(r => {
          if (r.ingredient_id === 'ing_lyden') {
            lyDen += Number(r.quantity_needed || 0) * qty;
          } else if (r.ingredient_id === 'ing_lytrang' || r.ingredient_id === 'ing_lytratac') {
            lyTrang += Number(r.quantity_needed || 0) * qty;
          } else if (r.ingredient_id === 'ing_lyhoavan') {
            lyHoaVan += Number(r.quantity_needed || 0) * qty;
          }
        });
      }
    });

    const totalLy = lyDen + lyTrang + lyHoaVan;

    return {
      orders: displayOrders,
      grossRevenue,
      actualRevenue,
      totalCash,
      totalTransfer,
      totalDiscount,
      restockCosts,
      restockExpenses,
      restockItems,
      currentCash,
      netRevenue,
      sales: {
        sortedSales,
        lyDen,
        lyTrang,
        lyHoaVan,
        totalLy
      }
    };
  };

  const morning = calculateMetrics(morningOrders, morningLogs, morningAllOrders);
  const afternoon = calculateMetrics(afternoonOrders, afternoonLogs, afternoonAllOrders);
  const bothShifts = calculateMetrics(todayPaidOrders, todayLogs, todayAllOrders);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 text-coffee-primary animate-spin" />
        <p className="text-coffee-medium font-medium">Đang tính toán báo cáo doanh thu ca...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 font-sans">
      <Link 
        href="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold hover:bg-coffee-light transition shadow-sm w-fit animate-fade-in"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về Trang chủ</span>
      </Link>

      {/* Tiêu đề & Ngày */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-coffee-light">
        <div>
          <span className="text-xs font-bold text-coffee-medium uppercase tracking-wider">Doanh thu ngày hôm nay</span>
          <h2 className="font-black text-2xl text-coffee-dark flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-coffee-primary" />
            <span>Báo cáo doanh thu ca trực</span>
          </h2>
        </div>
        <div className="px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold flex items-center space-x-2 w-fit shadow-sm">
          <Calendar className="w-4 h-4" />
          <span>Ngày: {new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      {/* Bộ lọc chọn Ca */}
      <div className="flex bg-white p-1 rounded-2xl border border-coffee-light w-fit shadow-sm gap-1 overflow-x-auto max-w-full">
        <button
          onClick={() => setActiveShiftFilter('both')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 ${
            activeShiftFilter === 'both'
              ? 'bg-coffee-primary text-white shadow-sm'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          Cả hai ca
        </button>
        <button
          onClick={() => setActiveShiftFilter('morning')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 ${
            activeShiftFilter === 'morning'
              ? 'bg-coffee-primary text-white shadow-sm'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          Ca Sáng (05:30 - 12:00)
        </button>
        <button
          onClick={() => setActiveShiftFilter('afternoon')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 ${
            activeShiftFilter === 'afternoon'
              ? 'bg-coffee-primary text-white shadow-sm'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          Ca Chiều (16:00 - 21:00)
        </button>
      </div>

      {activeShiftFilter === 'both' ? (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-coffee-primary text-white p-5 rounded-3xl shadow flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-lg">Cả Hai Ca</h3>
              <p className="text-xs text-coffee-accent/80 font-medium">Tổng hợp toàn bộ ngày làm việc (00:00 - 23:59)</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-white/20 rounded-full">
              {bothShifts.orders.length} Đơn hàng
            </span>
          </div>
          <ShiftMetricsSection metrics={bothShifts} currentUser={currentUser} onRefresh={loadData} />
        </div>
      ) : activeShiftFilter === 'morning' ? (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-coffee-primary text-white p-5 rounded-3xl shadow flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-lg">Ca Sáng</h3>
              <p className="text-xs text-coffee-accent/80 font-medium">Ca làm: 05:30 - 12:00 (Ghi nhận đơn: trước 14:00)</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-white/20 rounded-full">
              {morning.orders.length} Đơn hàng
            </span>
          </div>
          <ShiftMetricsSection metrics={morning} currentUser={currentUser} onRefresh={loadData} />
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-coffee-dark text-white p-5 rounded-3xl shadow flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-lg">Ca Chiều</h3>
              <p className="text-xs text-coffee-accent/80 font-medium">Ca làm: 16:00 - 21:00 (Ghi nhận đơn: từ 14:00)</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-white/20 rounded-full">
              {afternoon.orders.length} Đơn hàng
            </span>
          </div>
          <ShiftMetricsSection metrics={afternoon} currentUser={currentUser} onRefresh={loadData} />
        </div>
      )}
    </div>
  );
}

// Component phụ hiển thị các chỉ số chi tiết cho từng ca
function ShiftMetricsSection({ metrics, currentUser, onRefresh }: { metrics: any; currentUser?: any; onRefresh: () => void }) {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedOrderItems, setExpandedOrderItems] = useState<any[]>([]);
  const [loadingExpandedItems, setLoadingExpandedItems] = useState<boolean>(false);

  // State lọc món: Tất cả / Tại quán / Mang đi
  const [salesFilterTab, setSalesFilterTab] = useState<'all' | 'dinein' | 'takeaway'>('all');

  // State Modal Hủy đơn kiểm duyệt 2 chiều
  const [cancelModalOrder, setCancelModalOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);

  useEffect(() => {
    if (!expandedOrderId) {
      setExpandedOrderItems([]);
      return;
    }
    async function fetchExpandedItems() {
      const orderId = expandedOrderId;
      if (!orderId) return;
      setLoadingExpandedItems(true);
      try {
        const items = await db.getOrderItems(orderId);
        setExpandedOrderItems(items || []);
      } catch (e) {
        console.error('Lỗi khi tải chi tiết đơn hàng:', e);
        toast.error('Không thể tải chi tiết sản phẩm.');
      } finally {
        setLoadingExpandedItems(false);
      }
    }
    fetchExpandedItems();
  }, [expandedOrderId]);

  // Reset page when metrics change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedOrderId(null);
  }, [metrics]);

  const handleOpenCancelModal = (order: any) => {
    setCancelModalOrder(order);
    setCancelReason('');
  };

  const handleConfirmRequestCancel = async () => {
    if (!cancelModalOrder) return;
    if (!cancelReason.trim()) {
      toast.error('Vui lòng nhập hoặc chọn lý do hủy hóa đơn!');
      return;
    }

    setSubmittingCancel(true);
    try {
      await db.requestCancelPaidOrder(
        cancelModalOrder.id,
        currentUser?.id || 'staff',
        cancelReason.trim()
      );
      toast.success(`Đã gửi yêu cầu hủy đơn #${cancelModalOrder.id.substring(0, 6)} và tạm hoàn kho nguyên liệu. Đang chờ Admin duyệt!`);
      setCancelModalOrder(null);
      setCancelReason('');
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Lỗi khi gửi yêu cầu hủy đơn.');
    } finally {
      setSubmittingCancel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Chỉ số chính */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-coffee-light flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-coffee-medium uppercase tracking-wider block">Doanh thu bán hàng</span>
            <span className="font-black text-xl text-coffee-primary">{metrics.actualRevenue.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="p-2.5 bg-green-50 rounded-xl text-green-700">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-coffee-light flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-coffee-medium uppercase tracking-wider block">Chi tiền nhập hàng / Khác</span>
            <span className="font-black text-xl text-red-600">-{metrics.restockCosts.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="p-2.5 bg-red-50 rounded-xl text-red-700">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-coffee-light flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-coffee-medium uppercase tracking-wider block">Hóa đơn thành công</span>
            <span className="font-black text-xl text-coffee-primary">{metrics.orders.length} đơn</span>
          </div>
          <div className="p-2.5 bg-blue-50 rounded-xl text-blue-700">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-coffee-light flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-coffee-medium uppercase tracking-wider block">Tiền mặt bàn giao (Két)</span>
            <span className="font-black text-xl text-amber-900 font-mono">{metrics.currentCash.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="p-2.5 bg-amber-50 rounded-xl text-amber-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Báo cáo bán hàng (Món ăn & Ly) */}
      <div className="bg-white p-5 rounded-2xl border border-coffee-light shadow-sm space-y-4">
        <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider flex items-center justify-between border-b border-coffee-light pb-2.5">
          <span>📊 Báo cáo bán hàng (Món ăn & Ly)</span>
          <span className="text-[10px] text-coffee-medium font-bold uppercase">Tổng cộng: {metrics.sales.totalLy} ly</span>
        </h4>

        {/* Thống kê chi tiết các loại ly */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF6F0] p-4 rounded-2xl border border-coffee-light/60">
          <div className="text-center space-y-0.5">
            <span className="text-[10px] text-coffee-medium uppercase font-bold block">Tổng Ly</span>
            <span className="font-black text-base text-coffee-primary">{metrics.sales.totalLy}</span>
          </div>
          <div className="text-center space-y-0.5 border-l border-coffee-light/60">
            <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Đen AVA</span>
            <span className="font-black text-base text-coffee-dark">{metrics.sales.lyDen}</span>
          </div>
          <div className="text-center space-y-0.5 border-l border-coffee-light/60">
            <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Trắng AVA</span>
            <span className="font-black text-base text-coffee-dark">{metrics.sales.lyTrang}</span>
          </div>
          <div className="text-center space-y-0.5 border-l border-coffee-light/60">
            <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Trắng H.Văn AVA</span>
            <span className="font-black text-base text-coffee-dark">{metrics.sales.lyHoaVan}</span>
          </div>
        </div>

        {/* Thanh lọc phân loại: Tất cả / Tại quán / Mang đi */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 bg-[#FAF6F0] p-1 rounded-xl border border-coffee-light/60">
            <button
              type="button"
              onClick={() => setSalesFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                salesFilterTab === 'all'
                  ? 'bg-[#4A3525] text-white shadow-2xs'
                  : 'text-coffee-dark hover:bg-white/60'
              }`}
            >
              Tất cả món ({metrics.sales.sortedSales.length})
            </button>
            <button
              type="button"
              onClick={() => setSalesFilterTab('dinein')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                salesFilterTab === 'dinein'
                  ? 'bg-[#4A3525] text-white shadow-2xs'
                  : 'text-coffee-dark hover:bg-white/60'
              }`}
            >
              Tại quán ({metrics.sales.sortedSales.filter((i: any) => !i.isTakeaway).length})
            </button>
            <button
              type="button"
              onClick={() => setSalesFilterTab('takeaway')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                salesFilterTab === 'takeaway'
                  ? 'bg-[#4A3525] text-white shadow-2xs'
                  : 'text-coffee-dark hover:bg-white/60'
              }`}
            >
              Mang đi ({metrics.sales.sortedSales.filter((i: any) => i.isTakeaway).length})
            </button>
          </div>
        </div>

        {/* Bảng danh sách món ăn đã bán tách riêng dòng Tại quán và Mang đi */}
        {(() => {
          const filteredSales = metrics.sales.sortedSales.filter((item: any) => {
            if (salesFilterTab === 'dinein') return !item.isTakeaway;
            if (salesFilterTab === 'takeaway') return item.isTakeaway;
            return true;
          });
          const totalFilteredQty = filteredSales.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
          const totalFilteredAmount = filteredSales.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);

          return (
            <div className="overflow-x-auto rounded-xl border border-coffee-light/80">
              <table className="w-full text-left border-collapse min-w-[550px]">
                <thead>
                  <tr className="bg-coffee-light/40 border-b border-coffee-light text-coffee-medium text-[10px] font-extrabold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">STT</th>
                    <th className="py-2.5 px-3">Tên món</th>
                    <th className="py-2.5 px-3 text-center">Hình thức</th>
                    <th className="py-2.5 px-3 text-center">Số lượng</th>
                    <th className="py-2.5 px-3 text-right">Đơn giá</th>
                    <th className="py-2.5 px-3 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-coffee-light/35">
                  {filteredSales.map((item: any, index: number) => (
                    <tr key={index} className="hover:bg-coffee-light/10 text-xs font-medium text-coffee-dark transition whitespace-nowrap">
                      <td className="py-2.5 px-3 text-center text-coffee-medium font-mono">{index + 1}</td>
                      <td className="py-2.5 px-3 font-extrabold text-coffee-dark">
                        {item.name || 'Món ăn'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.isTakeaway 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-extrabold text-coffee-dark">
                        {item.quantity} ly
                      </td>
                      <td className="py-2.5 px-3 text-right text-coffee-medium">
                        {Number(item.price || 0).toLocaleString('vi-VN')}đ
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-coffee-primary">
                        {Number(item.subtotal || 0).toLocaleString('vi-VN')}đ
                      </td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-coffee-medium italic">
                        Không có dữ liệu cho mục này
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredSales.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#FAF6F0] border-t-2 border-coffee-light/80 text-xs font-black text-coffee-dark">
                      <td colSpan={3} className="py-3 px-3 uppercase tracking-wider text-coffee-dark font-extrabold">
                        Tổng cộng {salesFilterTab === 'dinein' ? 'Tại quán' : salesFilterTab === 'takeaway' ? 'Mang đi' : ''} ({filteredSales.length} dòng):
                      </td>
                      <td className="py-3 px-3 text-center font-black text-coffee-primary text-sm font-mono">
                        {totalFilteredQty} ly
                      </td>
                      <td className="py-3 px-3 text-right text-coffee-medium">-</td>
                      <td className="py-3 px-3 text-right font-black text-coffee-primary text-sm font-mono">
                        {totalFilteredAmount.toLocaleString('vi-VN')}đ
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          );
        })()}
      </div>

      {/* Bảng tính dòng tiền thực tế */}
      <div className="bg-white p-5 rounded-2xl border border-coffee-light shadow-sm space-y-4">
        <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider border-b border-coffee-light pb-2.5">
          💵 Bảng tính dòng tiền thực tế ca
        </h4>
        <div className="space-y-3 text-xs text-coffee-dark font-medium">
          {/* Doanh thu Tiền mặt */}
          <div className="flex justify-between items-center bg-amber-50/70 p-3 rounded-xl border border-amber-200/60 font-bold">
            <span className="text-amber-900">Doanh thu Tiền mặt:</span>
            <span className="font-extrabold text-amber-900 text-sm">+{metrics.totalCash.toLocaleString('vi-VN')}đ</span>
          </div>

          {/* Doanh thu Chuyển khoản */}
          <div className="flex justify-between items-center bg-blue-50/70 p-3 rounded-xl border border-blue-200/60 font-bold">
            <span className="text-blue-900">Doanh thu Chuyển khoản:</span>
            <span className="font-extrabold text-blue-900 text-sm">+{metrics.totalTransfer.toLocaleString('vi-VN')}đ</span>
          </div>

          {/* Giảm giá */}
          <div className="flex justify-between items-center bg-red-50/60 p-3 rounded-xl border border-red-200/50 font-bold">
            <span className="text-red-950">Giảm giá:</span>
            <span className="font-extrabold text-red-950 text-sm">-{metrics.totalDiscount.toLocaleString('vi-VN')}đ</span>
          </div>

          {/* Chi tiết chi phí nhập trong ca */}
          {metrics.restockItems.length > 0 ? (
            <div className="space-y-1.5 bg-[#FAF6F0] p-3 rounded-xl border border-coffee-light/45">
              <span className="text-[10px] text-coffee-medium uppercase font-bold block">Chi tiết chi phí nhập trong ca:</span>
              {metrics.restockItems.map((log: any) => (
                <div key={log.id} className="flex justify-between text-[11px] text-red-700 font-semibold">
                  <span>• {log.note || `Nhập ${log.custom_ingredient_name || 'Nguyên liệu'}`}</span>
                  <span>-{Number(log.cost || 0).toLocaleString('vi-VN')}đ</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-between items-center text-coffee-medium/70 text-[11px] px-1 bg-[#FAF6F0] p-3 rounded-xl border border-coffee-light/45">
              <span className="text-[10px] text-coffee-medium uppercase font-bold block">Chi tiết chi phí nhập trong ca:</span>
              <span className="text-[11px] text-coffee-medium font-semibold">0đ</span>
            </div>
          )}

          {/* Tiền mặt thực tế bàn giao (Trong két) */}
          <div className="flex justify-between items-center p-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl shadow-xs font-black text-sm">
            <div>
              <span className="block text-xs uppercase tracking-wider text-amber-100">👉 Tiền mặt thực tế bàn giao (Trong két):</span>
              <span className="text-[10px] text-amber-200/90 font-normal">(= Tiền mặt thu {metrics.totalCash.toLocaleString('vi-VN')}đ - Tiền chi {metrics.restockCosts.toLocaleString('vi-VN')}đ)</span>
            </div>
            <span className="text-xl font-mono">{metrics.currentCash.toLocaleString('vi-VN')}đ</span>
          </div>
        </div>
      </div>

      {/* Lịch sử đơn hàng trong ca */}
      <div className="bg-white p-5 rounded-2xl border border-coffee-light shadow-sm space-y-3">
        <h4 className="font-bold text-xs text-coffee-dark uppercase tracking-wider">Hóa đơn trong ca</h4>
        {metrics.orders.length === 0 ? (
          <p className="text-xs text-coffee-medium/70 italic text-center py-4">Chưa có giao dịch phát sinh trong ca này.</p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-coffee-light/60">
              {(() => {
                const itemsPerPage = 10;
                const totalOrders = metrics.orders.length;
                const totalPages = Math.ceil(totalOrders / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const displayedOrders = metrics.orders.slice(startIndex, endIndex);

                return (
                  <>
                    {displayedOrders.map((order: any) => {
                      const date = new Date(order.paid_at || order.created_at);
                      const hh = String(date.getHours()).padStart(2, '0');
                      const mm = String(date.getMinutes()).padStart(2, '0');
                      const dd = String(date.getDate()).padStart(2, '0');
                      const mMonth = String(date.getMonth() + 1).padStart(2, '0');
                      const timeFormatted = `${hh}:${mm} - ${dd}/${mMonth}`;
                      return (
                        <div
                          key={order.id}
                          onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                          className="py-3.5 space-y-2 text-xs cursor-pointer hover:bg-[#FAF6F0]/50 -mx-3 px-3 rounded-2xl transition"
                        >
                          {/* Hàng 1: Mã HĐ và Giờ */}
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-bold text-coffee-dark uppercase">#{order.id.substring(0, 6)}</span>
                            <span className="text-[10px] text-coffee-medium font-medium">{timeFormatted}</span>
                          </div>
                          {/* Hàng 2: Bàn, hình thức thanh toán, tổng tiền */}
                          <div className="flex justify-between items-center text-[11px]">
                            <div className="flex items-center space-x-2.5">
                              <span className="font-semibold text-coffee-dark bg-coffee-light px-2 py-0.5 rounded">{order.tables?.table_name || 'Khách mang về'}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                                order.payment_method === 'Tiền mặt' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {order.payment_method}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="font-extrabold text-coffee-primary mr-1">{order.total_amount.toLocaleString('vi-VN')}đ</span>
                              {isOrderPendingCancel(order) ? (
                                <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-extrabold flex items-center space-x-1">
                                  <span>⏳ Chờ duyệt hủy</span>
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenCancelModal(order);
                                  }}
                                  className="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer"
                                >
                                  <span>Hủy</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Mở rộng chi tiết món hàng */}
                          {expandedOrderId === order.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-3 p-3.5 bg-coffee-cream/20 rounded-2xl border border-coffee-light/40 space-y-2 text-[11px]"
                            >
                              <p className="font-bold text-[9px] text-coffee-medium uppercase tracking-wider">Chi tiết món ăn:</p>
                              {loadingExpandedItems ? (
                                <div className="py-3 flex justify-center">
                                  <Loader2 className="w-4 h-4 text-coffee-primary animate-spin" />
                                </div>
                              ) : expandedOrderItems.length === 0 ? (
                                <p className="italic text-coffee-medium/70">Không có chi tiết sản phẩm.</p>
                              ) : (
                                <div className="space-y-2 divide-y divide-coffee-light/25">
                                  {expandedOrderItems.map((item, idx) => (
                                    <div key={item.id || idx} className="flex justify-between items-center pt-2 first:pt-0">
                                      <span className="text-coffee-dark font-medium">
                                        {item.products?.name || 'Sản phẩm'} <span className="text-coffee-medium font-black">x{item.quantity}</span>
                                      </span>
                                      <span className="font-bold text-coffee-dark">
                                        {(item.subtotal || 0).toLocaleString('vi-VN')}đ
                                      </span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between items-center font-extrabold text-coffee-primary pt-2.5">
                                    <span>Tạm tính tiền món:</span>
                                    <span>
                                      {expandedOrderItems.reduce((sum, item) => sum + (item.subtotal || 0), 0).toLocaleString('vi-VN')}đ
                                    </span>
                                  </div>
                                  {order.discount > 0 && (
                                    <div className="flex justify-between items-center text-red-600 font-extrabold pt-1">
                                      <span>Giảm giá hóa đơn:</span>
                                      <span>
                                        -{order.discount.toLocaleString('vi-VN')}đ
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Điều khiển phân trang thông minh */}
                    {totalPages > 1 && (
                      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-4 border-t border-coffee-light/40">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="px-2.5 py-1.5 rounded-lg border border-coffee-light text-coffee-medium hover:bg-[#FAF6F0] disabled:opacity-40 text-[10px] font-bold transition cursor-pointer"
                        >
                          Trước
                        </button>

                        {(() => {
                          const getPageItems = () => {
                            if (totalPages <= 7) {
                              return Array.from({ length: totalPages }, (_, i) => i + 1);
                            }
                            const items: (number | string)[] = [];
                            if (currentPage <= 4) {
                              items.push(1, 2, 3, 4, 5, '...', totalPages);
                            } else if (currentPage >= totalPages - 3) {
                              items.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                            } else {
                              items.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                            }
                            return items;
                          };

                          return getPageItems().map((p, idx) => {
                            if (p === '...') {
                              return (
                                <span key={`ellipsis-${idx}`} className="px-1 text-coffee-medium text-xs font-bold select-none">
                                  ...
                                </span>
                              );
                            }
                            const pageNum = Number(p);
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setCurrentPage(pageNum)}
                                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                  currentPage === pageNum
                                    ? 'bg-coffee-primary text-white shadow-sm font-black'
                                    : 'border border-coffee-light text-coffee-medium hover:bg-[#FAF6F0]'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          });
                        })()}

                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="px-2.5 py-1.5 rounded-lg border border-coffee-light text-coffee-medium hover:bg-[#FAF6F0] disabled:opacity-40 text-[10px] font-bold transition cursor-pointer"
                        >
                          Sau
                        </button>

                        {totalPages > 7 && (
                          <select
                            value={currentPage}
                            onChange={(e) => setCurrentPage(Number(e.target.value))}
                            className="h-7 px-1.5 bg-[#FAF6F0] border border-coffee-light text-coffee-dark text-[10px] font-bold rounded-lg ml-1 focus:ring-1 focus:ring-coffee-primary outline-none cursor-pointer"
                          >
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                              <option key={p} value={p}>Trang {p}/{totalPages}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* MODAL YÊU CẦU HỦY HÓA ĐƠN ĐÃ THANH TOÁN (KIỂM DUYỆT 2 CHIỀU) */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 border border-red-200 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
              <h3 className="font-extrabold text-base text-red-600 flex items-center space-x-2">
                <span>⚠️ Yêu cầu hủy hóa đơn #{cancelModalOrder.id.substring(0, 6)}</span>
              </h3>
              <button
                onClick={() => setCancelModalOrder(null)}
                className="p-1 hover:bg-coffee-light rounded-lg text-coffee-medium cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1.5 leading-relaxed">
              <p className="font-bold">📌 Quy trình kiểm duyệt hủy đơn:</p>
              <p>• Nguyên liệu của đơn sẽ được <strong>tạm hoàn ngay vào kho</strong>.</p>
              <p>• Hóa đơn chuyển trạng thái <strong>"Chờ duyệt hủy"</strong> và tạm trừ khỏi tiền két ca trực.</p>
              <p>• Admin sẽ duyệt: nếu Đồng ý thì giữ nguyên; nếu Từ chối thì đơn được khôi phục và kho tự động thu hồi.</p>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-coffee-dark uppercase text-[10px] tracking-wider block">
                Chọn nhanh lý do hủy:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Khách đổi ý hủy món', 'Thu ngân bấm nhầm đơn/bàn', 'Khách không đủ tiền', 'Món bị lỗi/hỏng'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelReason(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      cancelReason === preset
                        ? 'bg-coffee-primary text-white border-coffee-primary shadow-xs'
                        : 'bg-[#FAF6F0] text-coffee-dark border-coffee-light hover:bg-coffee-light/50'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-coffee-dark uppercase text-[10px] tracking-wider block">
                Chi tiết lý do hủy <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Nhập lý do chi tiết để Admin kiểm duyệt..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-3 bg-[#FAF6F0] rounded-xl text-xs font-medium border border-coffee-light focus:ring-2 focus:ring-red-400 text-coffee-dark outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-coffee-light/60">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                disabled={submittingCancel}
                className="px-4 py-2.5 bg-[#FAF6F0] hover:bg-coffee-light text-coffee-dark font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmRequestCancel}
                disabled={submittingCancel || !cancelReason.trim()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition shadow shadow-red-600/20 flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {submittingCancel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <span>Gửi yêu cầu hủy</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Loader icon component locally declared just in case
function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
