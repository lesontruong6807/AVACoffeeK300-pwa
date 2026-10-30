'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db, getCurrentUser, formatIngredientStock, formatIngredientRefill, resolveItemCupId, createCoalescedRefresher } from '@/lib/database';
import { toast } from '@/lib/toast';
import { 
  ShieldCheck, 
  Clock, 
  CalendarDays, 
  BarChart3, 
  Utensils, 
  Users, 
  Check, 
  X, 
  MapPin, 
  Plus, 
  Edit, 
  Trash2, 
  DollarSign, 
  TrendingUp, 
  ShoppingBag,
  Loader2,
  Upload,
  AlertTriangle,
  Sparkles,
  Coffee,
  CheckCircle2,
  Map,
  Tag,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Settings,
  LayoutGrid,
  Printer,
  Download,
  FileSpreadsheet,
  FileJson,
  Database,
  ShieldAlert,
  Search
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  exportInventoryToExcel, 
  exportInventoryToPDF, 
  exportRevenueToExcel, 
  exportRevenueToPDF, 
  exportProductSalesToExcel, 
  exportProductSalesToPDF, 
  exportAttendanceToExcel, 
  exportAttendanceToPDF,
  exportFullDatabaseToExcel
} from '@/lib/exportUtils';
import { printTestTicket } from '@/lib/printerService';
import { compressProductImage, estimateBase64SizeKB, recompressImageSource } from '@/lib/imageUtils';

const generateShortId = (prefix: string = '') => {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
};

export default function AdminPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [adminTab, setAdminTab] = useState<'approvals' | 'reports' | 'sales' | 'inventory' | 'products' | 'staff' | 'attendance' | 'expenses' | 'overtime' | 'tables' | 'settings'>('approvals');
  const [loading, setLoading] = useState(true);

  // Dữ liệu quản trị mở rộng
  const [tables, setTables] = useState<any[]>([]);
  const [_storeSettings, setStoreSettings] = useState<any>(null);

  // Form CRUD Bàn & Sơ đồ
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<any>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableStatus, setTableStatus] = useState<'Trống' | 'Đang phục vụ'>('Trống');
  const [savingTable, setSavingTable] = useState(false);

  // Form CRUD Nguyên liệu kho
  const [isIngModalOpen, setIsIngModalOpen] = useState(false);
  const [editingIng, setEditingIng] = useState<any>(null);
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState('ml');
  const [ingQuyCach, setIngQuyCach] = useState('');
  const [ingMinStock, setIngMinStock] = useState('');
  const [ingInitialStock, setIngInitialStock] = useState('');
  const [ingDonGia, setIngDonGia] = useState('');
  const [ingGiaVon, setIngGiaVon] = useState('');
  const [savingIng, setSavingIng] = useState(false);

  // Cài đặt Cửa hàng & Máy in LAN/Wi-Fi
  const [cfgStoreName, setCfgStoreName] = useState('AVA COFFEE');
  const [cfgStoreAddress, setCfgStoreAddress] = useState('K300, Tân Bình, TP. Hồ Chí Minh');
  const [cfgStorePhone, setCfgStorePhone] = useState('0909 123 456');
  const [cfgBillFooter, setCfgBillFooter] = useState('AVA COFFEE XIN CẢM ƠN QUÝ KHÁCH !\nCHÚC QUÝ KHÁCH NGON MIỆNG');
  const [cfgPrinterIp, setCfgPrinterIp] = useState('192.168.1.167');
  const [cfgPrinterPort, setCfgPrinterPort] = useState('9100');
  const [cfgPosBridgeIp, setCfgPosBridgeIp] = useState('192.168.1.212');
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);

  // Sao lưu & Dọn dẹp an toàn 3 lớp
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [cleanupHorizon, setCleanupHorizon] = useState<'180' | '365' | '548' | '730'>('365');
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [cleaningUp, setCleaningUp] = useState(false);
  const [lastBackupDownloaded, setLastBackupDownloaded] = useState(false);

  // Dữ liệu quản trị
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [allOrderItems, setAllOrderItems] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);

  // Trạng thái phê duyệt (Duyệt chấm công / Duyệt nghỉ phép / Duyệt đơn kho / Duyệt hủy đơn)
  const [approvalSubTab, setApprovalSubTab] = useState<'time' | 'leave' | 'inventory' | 'order_cancel'>('time');

  // Trạng thái Form CRUD Sản phẩm mở rộng (Công thức định lượng, Base cost, Phân loại mới)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState(0);
  const [prodTakeawayPrice, setProdTakeawayPrice] = useState(0);
  const [prodDineinPrice, setProdDineinPrice] = useState(0);
  const [prodSearchQuery, setProdSearchQuery] = useState('');
  const [prodSelectedCategory, setProdSelectedCategory] = useState('all');
  const [prodBaseCost, setProdBaseCost] = useState(0);
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [prodImageSizeKB, setProdImageSizeKB] = useState<number | null>(null);
  const [prodStatus, setProdStatus] = useState<'Còn hàng' | 'Hết hàng'>('Còn hàng');
  const [prodRecipeList, setProdRecipeList] = useState<Array<{
    id: string;
    ingredient_id: string;
    quantity_needed: number;
    isPremix?: boolean;
    premix_type?: 'nuoc_duong' | 'hong_tra' | 'kem_muoi';
    premix_ml?: number;
  }>>([]);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [recipeAddType, setRecipeAddType] = useState<'stock' | 'premix'>('stock');
  const [selectedStockIngId, setSelectedStockIngId] = useState('');
  const [selectedStockQty, setSelectedStockQty] = useState('');
  const [selectedPremixType, setSelectedPremixType] = useState<'nuoc_duong' | 'hong_tra' | 'kem_muoi'>('nuoc_duong');
  const [selectedPremixMl, setSelectedPremixMl] = useState('');

  // Trạng thái Chấm công ngoài giờ (Overtime - Dành cho Quản lý)
  const [otStaffId, setOtStaffId] = useState('');
  const [otDate, setOtDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [otShift, setOtShift] = useState('Ca sáng (06:30 - 12:00)');
  const [otStartTime, setOtStartTime] = useState('06:30');
  const [otEndTime, setOtEndTime] = useState('12:00');
  const [otNotes, setOtNotes] = useState('');
  const [isOtConfirmModalOpen, setIsOtConfirmModalOpen] = useState(false);
  const [editingOtLog, setEditingOtLog] = useState<any | null>(null);
  const [submittingOt, setSubmittingOt] = useState(false);

  // Trạng thái Form CRUD Nhân viên
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'Admin' | 'User'>('User');

  // Trạng thái Quản lý Chi phí vận hành
  const [expStartDate, setExpStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toLocaleDateString('en-CA');
  });
  const [expEndDate, setExpEndDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA');
  });
  const [isExpModalOpen, setIsExpModalOpen] = useState(false);
  const [expName, setExpName] = useState('');
  const [expType, setExpType] = useState<'co_dinh' | 'bien_dong'>('bien_dong');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [expNotes, setExpNotes] = useState('');

  // Bộ lọc Báo cáo Chấm công
  const [attStartDate, setAttStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toLocaleDateString('en-CA');
  });
  const [attEndDate, setAttEndDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA');
  });
  const [attUserId, setAttUserId] = useState('all');
  const [attendanceSubTab, setAttendanceSubTab] = useState<'summary' | 'shifts' | 'leaves'>('summary');
  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [currentCalDate, setCurrentCalDate] = useState<Date>(() => new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [salesTypeTab, setSalesTypeTab] = useState<'all' | 'dinein' | 'takeaway'>('all');

  useEffect(() => {
    if (attStartDate) {
      setCurrentCalDate(new Date(attStartDate));
    }
  }, [attStartDate]);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!expName.trim() || !expAmount || Number(expAmount) <= 0) {
      toast.error('Vui lòng nhập tên chi phí và số tiền hợp lệ!');
      return;
    }
    try {
      await db.createExpense({
        name: expName.trim(),
        type: expType,
        amount: Number(expAmount),
        date: expDate,
        staff_id: currentUser.id,
        notes: expNotes.trim()
      });
      toast.success('Đã lưu chi phí vận hành thành công!');
      setIsExpModalOpen(false);
      setExpName('');
      setExpType('bien_dong');
      setExpAmount('');
      setExpDate(new Date().toLocaleDateString('en-CA'));
      setExpNotes('');
      loadAllData();
    } catch (err) {
      toast.error('Không thể lưu chi phí.');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xoá khoản chi phí này không?')) {
      try {
        await db.deleteExpense(id);
        toast.success('Đã xoá khoản chi phí.');
        loadAllData();
      } catch (err) {
        toast.error('Không thể xoá chi phí.');
      }
    }
  };

  const loadAllData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const results = await Promise.allSettled([
        db.getTimeLogs(),
        db.getLeaveRequests(),
        // Chỉ tải hóa đơn trong khoảng ngày đang xem ở Báo cáo doanh thu (+ mọi đơn chờ duyệt hủy)
        db.getOrdersForRange(repRangeRef.current.start, repRangeRef.current.end),
        db.getProducts(),
        db.getCategories(),
        db.getUsers(),
        db.getInventoryLogs(),
        db.getIngredients(),
        Promise.resolve(null), // (danh sách món đã đi kèm hóa đơn ở trên)
        db.getExpenses(),
        db.getRecipes(),
        db.getTables(true),
        db.getStoreSettings()
      ]);

      const val = (idx: number, fallback: any = []) => 
        results[idx].status === 'fulfilled' ? (results[idx] as PromiseFulfilledResult<any>).value : fallback;

      setTimeLogs(val(0));
      setLeaveRequests(val(1));
      // Lỗi mạng khi tải hóa đơn -> giữ nguyên số liệu đang hiển thị, không xóa trắng báo cáo
      if (results[2].status === 'fulfilled') {
        const rangeData = (results[2] as PromiseFulfilledResult<any>).value;
        setOrders(rangeData.orders);
        setAllOrderItems(rangeData.items);
      }
      setProducts(val(3));
      setCategories(val(4));
      setUsers(val(5));
      setInventoryLogs(val(6));
      setIngredients(val(7));
      setExpenses(val(9));
      setRecipes(val(10));
      setTables(val(11));
      const settings = val(12, null);
      setStoreSettings(settings);

      if (settings) {
        setCfgStoreName(settings.store_name || 'AVA COFFEE');
        setCfgStoreAddress(settings.store_address || 'K300, Tân Bình, TP. Hồ Chí Minh');
        setCfgStorePhone(settings.store_phone || '0909 123 456');
        setCfgBillFooter(settings.bill_footer || 'AVA COFFEE XIN CẢM ƠN QUÝ KHÁCH !\nCHÚC QUÝ KHÁCH NGON MIỆNG');
        setCfgPrinterIp(settings.printer_ip || '192.168.1.167');
        setCfgPrinterPort(String(settings.printer_port || 9100));
        setCfgPosBridgeIp((settings as any).pos_bridge_ip || '192.168.1.212');
      }
    } catch (e) {
      console.error('Lỗi khi tải dữ liệu admin:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    if (user && user.role === 'Admin') {
      loadAllData();
    } else {
      setLoading(false);
    }

    // Gom tất cả sự kiện realtime dồn dập (1 lần thanh toán sinh ra hàng chục sự kiện) thành 1 lần tải lại ngầm
    const scheduleReload = createCoalescedRefresher(() => {
      if (getCurrentUser()?.role === 'Admin') return loadAllData(true);
    }, 1500, 5000);

    const unsubInv = db.subscribeToInventoryChanges(scheduleReload);
    const unsubReport = db.subscribeToReportChanges(scheduleReload);
    const unsubTables = db.subscribeToTableChanges(scheduleReload);
    const unsubAtt = db.subscribeToAttendanceChanges(scheduleReload);
    const unsubOrders = db.subscribeToOrderChanges(scheduleReload);

    return () => {
      scheduleReload.cancel();
      unsubInv();
      unsubReport();
      unsubTables();
      unsubAtt();
      unsubOrders();
    };
  }, []);

  // Bộ lọc ngày cho Báo cáo doanh thu (Tab 'reports')
  const [repStartDate, setRepStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
  });
  const [repEndDate, setRepEndDate] = useState(() => new Date().toLocaleDateString('en-CA'));

  // Khoảng ngày đang xem (dùng trong các lần tải lại ngầm từ realtime)
  const repRangeRef = useRef({ start: repStartDate, end: repEndDate });
  const isFirstRangeLoadRef = useRef(true);
  useEffect(() => {
    repRangeRef.current = { start: repStartDate, end: repEndDate };
    // Lần đầu đã được loadAllData tải; các lần đổi ngày sau chỉ tải lại hóa đơn của khoảng ngày mới
    if (isFirstRangeLoadRef.current) {
      isFirstRangeLoadRef.current = false;
      return;
    }
    if (!repStartDate || !repEndDate || repStartDate > repEndDate) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rangeData = await db.getOrdersForRange(repStartDate, repEndDate);
        if (!cancelled) {
          setOrders(rangeData.orders);
          setAllOrderItems(rangeData.items);
        }
      } catch (e) {
        console.error('Lỗi tải hóa đơn theo khoảng ngày:', e);
        if (!cancelled) toast.error('Không tải được hóa đơn của khoảng ngày này, vui lòng thử lại.');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [repStartDate, repEndDate]);

  // Phân trang & xem chi tiết hóa đơn trong Báo cáo Doanh thu (Feature 2)
  const [repCurrentPage, setRepCurrentPage] = useState<number>(1);
  const [repExpandedOrderId, setRepExpandedOrderId] = useState<string | null>(null);
  const [repExpandedOrderItems, setRepExpandedOrderItems] = useState<any[]>([]);
  const [repLoadingExpandedItems, setRepLoadingExpandedItems] = useState<boolean>(false);

  // Bộ lọc Ca làm việc & Phương thức thanh toán trong Báo cáo Doanh thu
  const [repShiftFilter, setRepShiftFilter] = useState<'all' | 'morning' | 'afternoon'>('all');
  const [repPayFilter, setRepPayFilter] = useState<'all' | 'Tiền mặt' | 'Chuyển khoản'>('all');
  const [showDailyBreakdown, setShowDailyBreakdown] = useState<boolean>(true);

  // Sửa giá nhập kho sau khi đã duyệt (Feature 3)
  const [editingRestockLog, setEditingRestockLog] = useState<any | null>(null);
  const [newRestockCost, setNewRestockCost] = useState<string>('');
  const [isEditRestockModalOpen, setIsEditRestockModalOpen] = useState(false);
  const [submittingRestockCost, setSubmittingRestockCost] = useState(false);

  useEffect(() => {
    if (!repExpandedOrderId) {
      setRepExpandedOrderItems([]);
      return;
    }
    async function fetchExpandedItems() {
      const orderId = repExpandedOrderId;
      if (!orderId) return;
      setRepLoadingExpandedItems(true);
      try {
        const items = await db.getOrderItems(orderId);
        setRepExpandedOrderItems(items || []);
      } catch (e) {
        console.error('Lỗi khi tải chi tiết đơn hàng trong Admin:', e);
        toast.error('Không thể tải chi tiết sản phẩm.');
      } finally {
        setRepLoadingExpandedItems(false);
      }
    }
    fetchExpandedItems();
  }, [repExpandedOrderId]);

  // Reset page when report date or filters change
  useEffect(() => {
    setRepCurrentPage(1);
    setRepExpandedOrderId(null);
  }, [repStartDate, repEndDate, repShiftFilter, repPayFilter]);

  // Handler mở modal sửa giá nhập kho
  const handleOpenEditRestockModal = (log: any) => {
    setEditingRestockLog(log);
    setNewRestockCost(String(log.cost || 0));
    setIsEditRestockModalOpen(true);
  };

  // Handler lưu cập nhật giá nhập kho
  const handleSaveRestockCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRestockLog) return;
    const costNum = Number(newRestockCost);
    if (isNaN(costNum) || costNum < 0) {
      toast.error('Vui lòng nhập chi phí nhập kho hợp lệ (≥ 0)!');
      return;
    }
    setSubmittingRestockCost(true);
    try {
      await db.updateRestockCost(editingRestockLog.id, costNum);
      toast.success(`Đã cập nhật giá nhập kho cho ${editingRestockLog.ingredient_name || 'nguyên liệu'} và tính lại giá vốn!`);
      setIsEditRestockModalOpen(false);
      setEditingRestockLog(null);
      setNewRestockCost('');
      await loadAllData();
    } catch (err) {
      console.error('Lỗi cập nhật giá nhập kho:', err);
      toast.error('Không thể cập nhật giá nhập kho.');
    } finally {
      setSubmittingRestockCost(false);
    }
  };

  // Bộ lọc ngày & tìm kiếm cho Báo cáo kho (Tab 'inventory')
  const [invStartDate, setInvStartDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [invEndDate, setInvEndDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [invSearchQuery, setInvSearchQuery] = useState('');
  // Đang nén lại toàn bộ ảnh món cũ (nút "Tối ưu ảnh cũ")
  const [isOptimizingImages, setIsOptimizingImages] = useState(false);

  // Kiểm tra quyền Admin
  if (!loading && currentUser?.role !== 'Admin') {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-md border border-red-200 text-center space-y-5 my-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
          <X className="w-10 h-10" />
        </div>
        <h3 className="font-extrabold text-xl text-red-800">Quyền truy cập bị từ chối</h3>
        <p className="text-sm text-coffee-medium">
          Trang này chỉ dành cho tài khoản có quyền **Admin**. Tài khoản hiện tại của bạn là **{currentUser?.full_name}** với vai trò **{currentUser?.role || 'Nhân viên'}**.
        </p>
        <div className="bg-[#FAF6F0] p-4 rounded-2xl text-xs text-coffee-medium text-left space-y-1">
          <p className="font-bold text-coffee-dark mb-1">Cách chạy thử tính năng Admin:</p>
          <p>1. Di chuột lên góc trên bên phải màn hình (trên Desktop) hoặc góc phải header (trên Mobile).</p>
          <p>2. Click vào tên tài khoản hiện tại.</p>
          <p>3. Chọn tài khoản **Lê Sơn (Admin)** để đăng nhập làm Quản trị viên.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 text-coffee-primary animate-spin" />
        <p className="text-coffee-medium font-medium">Đang tải bảng điều khiển quản trị...</p>
      </div>
    );
  }

  // --- LÓGIC PHÊ DUYỆT ---
  const handleApproveTime = async (id: string, status: 'Đã duyệt' | 'Từ chối') => {
    const isConfirmed = window.confirm(`Bạn có chắc chắn muốn ${status === 'Đã duyệt' ? 'CHẤP NHẬN' : 'HỦY / TỪ CHỐI'} lượt chấm công này không?`);
    if (!isConfirmed) return;
    
    try {
      await db.approveTimeLog(id, status);
      confetti({ particleCount: 50, spread: 40 });
      loadAllData();
      toast.success(status === 'Đã duyệt' ? 'Đã phê duyệt chấm công thành công.' : 'Đã hủy / từ chối lượt chấm công.');
    } catch (e) {
      toast.error('Không thể cập nhật chấm công.');
    }
  };

  const handleApproveLeave = async (id: string, status: 'Đã duyệt' | 'Từ chối') => {
    const isConfirmed = window.confirm(`Bạn có chắc chắn muốn ${status === 'Đã duyệt' ? 'CHẤP NHẬN' : 'TỪ CHỐI'} đơn nghỉ phép này không?`);
    if (!isConfirmed) return;

    try {
      await db.approveLeaveRequest(id, status);
      confetti({ particleCount: 50, spread: 40 });
      loadAllData();
      toast.success(`Đã cập nhật trạng thái nghỉ phép thành: ${status}`);
    } catch (e) {
      toast.error('Không thể phê duyệt đơn nghỉ phép.');
    }
  };

  const handleApproveInventory = async (id: string, status: 'Đã duyệt' | 'Từ chối') => {
    const isConfirmed = window.confirm(`Bạn có chắc chắn muốn ${status === 'Đã duyệt' ? 'CHẤP NHẬN' : 'TỪ CHỐI'} đơn kho này không?`);
    if (!isConfirmed) return;

    try {
      await db.approveInventoryLog(id, status);
      confetti({ particleCount: 50, spread: 40 });
      loadAllData();
      toast.success(`Đã cập nhật đơn kho thành: ${status}`);
    } catch (e) {
      toast.error('Không thể phê duyệt đơn kho.');
    }
  };

  const handleApproveOrderCancel = async (orderId: string, approved: boolean) => {
    const isConfirmed = window.confirm(
      approved
        ? `Bạn có chắc chắn muốn ĐỒNG Ý HỦY vĩnh viễn hóa đơn #${orderId.substring(0, 6)}?\n- Kho nguyên liệu sẽ giữ nguyên việc hoàn lại.\n- Hóa đơn chính thức chuyển thành 'Đã hủy'.`
        : `Bạn có chắc chắn muốn TỪ CHỐI hủy hóa đơn #${orderId.substring(0, 6)}?\n- Đơn hàng sẽ được khôi phục về trạng thái 'Đã thanh toán'.\n- Doanh thu sẽ được tính lại bình thường.\n- Kho nguyên liệu sẽ tự động THU HỒI (trừ kho trở lại).`
    );
    if (!isConfirmed) return;

    try {
      await db.approveOrderCancellation(orderId, currentUser?.id || 'admin', approved);
      confetti({ particleCount: 50, spread: 40 });
      toast.success(approved ? 'Đã duyệt hủy đơn hàng thành công!' : 'Đã từ chối hủy, khôi phục đơn và thu hồi kho thành công!');
      await loadAllData();
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi phê duyệt hủy đơn.');
    }
  };

  // Duyệt hàng loạt tất cả đơn chờ duyệt trong sub-tab hiện tại
  const handleApproveAll = async () => {
    const isConfirmed = window.confirm('Bạn có chắc chắn muốn PHÊ DUYỆT TẤT CẢ các đơn đang chờ duyệt trong mục này không?');
    if (!isConfirmed) return;

    try {
      if (approvalSubTab === 'time') {
        const pendingIds = timeLogs.filter(l => l.status === 'Chờ duyệt').map(l => l.id);
        if (pendingIds.length === 0) { toast.info('Không có đơn chấm công nào chờ duyệt.'); return; }
        await db.approveAllTimeLogs(pendingIds, 'Đã duyệt');
      } else if (approvalSubTab === 'leave') {
        const pendingIds = leaveRequests.filter(r => r.status === 'Chờ duyệt').map(r => r.id);
        if (pendingIds.length === 0) { toast.info('Không có đơn nghỉ phép nào chờ duyệt.'); return; }
        await db.approveAllLeaveRequests(pendingIds, 'Đã duyệt');
      } else if (approvalSubTab === 'inventory') {
        const isOrderCancelInventoryLog = (l: any) => {
          const note = (l.note || l.ghi_chu || '').toLowerCase();
          return note.includes('hủy đơn') || note.includes('đơn hủy') || note.includes('hoàn kho đơn');
        };
        const pendingIds = inventoryLogs.filter(l => l.status === 'Chờ duyệt' && !isOrderCancelInventoryLog(l)).map(l => l.id);
        if (pendingIds.length === 0) { toast.info('Không có đơn kho nào chờ duyệt.'); return; }
        await db.approveAllInventoryLogs(pendingIds, 'Đã duyệt');
      } else if (approvalSubTab === 'order_cancel') {
        const pendingOrders = orders.filter(isOrderPendingCancel);
        if (pendingOrders.length === 0) { toast.info('Không có đơn hàng nào chờ duyệt hủy.'); return; }
        for (const o of pendingOrders) {
          await db.approveOrderCancellation(o.id, currentUser?.id || 'admin', true);
        }
      }

      confetti({ particleCount: 100, spread: 80 });
      toast.success('Đã phê duyệt hàng loạt thành công!');
      await loadAllData();
    } catch (e) {
      toast.error('Gặp lỗi khi phê duyệt hàng loạt.');
    }
  };

  // --- LÓGIC CRUD SẢN PHẨM MỞ RỘNG (CÔNG THỨC & BASE COST) ---
  const openAddProduct = () => {
    setEditingProduct(null);
    setProdName('');
    setProdPrice(0);
    setProdTakeawayPrice(0);
    setProdDineinPrice(0);
    setProdBaseCost(0);
    setProdCategoryId(categories[0]?.id || '');
    setProdImageUrl('');
    setProdImageSizeKB(null);
    setProdStatus('Còn hàng');
    setProdRecipeList([]);
    setIsAddingNewCategory(false);
    setNewCategoryName('');
    setIsProductModalOpen(true);
  };

  const openEditProduct = (prod: any) => {
    setEditingProduct(prod);
    setProdName(prod.name);
    setProdPrice(prod.price);
    setProdTakeawayPrice(prod.takeaway_price ?? prod.price ?? 0);
    setProdDineinPrice(prod.dinein_price ?? prod.price ?? 0);
    setProdBaseCost(prod.base_cost || 0);
    setProdCategoryId(prod.category_id);
    setProdImageUrl(prod.image_url || '');
    setProdImageSizeKB(prod.image_url ? estimateBase64SizeKB(prod.image_url) : null);
    setProdStatus(prod.status);
    setIsAddingNewCategory(false);
    setNewCategoryName('');

    // Load công thức hiện tại của sản phẩm
    const currentRecipes = recipes
      .filter(r => r.product_id === prod.id)
      .map(r => ({
        id: r.id || generateShortId('rec_'),
        ingredient_id: r.ingredient_id,
        quantity_needed: Number(r.quantity_needed || 0)
      }));
    setProdRecipeList(currentRecipes);
    setIsProductModalOpen(true);
  };

  // Tạo phân loại danh mục mới ngay trong Modal
  const handleCreateCategoryInline = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Vui lòng nhập tên loại món mới!');
      return;
    }
    setSavingCategory(true);
    try {
      const newCat = await db.createCategory(newCategoryName.trim());
      if (!newCat) {
        throw new Error('Không thể tạo loại món mới.');
      }
      toast.success(`Đã thêm loại món mới: "${newCat.name}"!`);
      const updatedCats = await db.getCategories();
      setCategories(updatedCats);
      setProdCategoryId(newCat.id);
      setIsAddingNewCategory(false);
      setNewCategoryName('');
    } catch (err) {
      console.error(err);
      toast.error('Không thể tạo loại món mới.');
    } finally {
      setSavingCategory(false);
    }
  };

  // Upload hình ảnh từ máy và nén tự động sang WebP Base64 chuẩn hóa
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset file input để có thể chọn lại cùng file nếu muốn
    e.target.value = '';
    if (!file) return;

    setIsCompressingImage(true);
    try {
      // Tự động scale tối đa 400x400 và nén WebP (tự hạ chất lượng tới khi dưới ~40KB)
      const result = await compressProductImage(file, 400, 0.82);
      // Tải ảnh đã nén lên kho ảnh Supabase Storage -> bảng món chỉ lưu đường link, mọi máy tải ảnh nhanh
      const uploadedUrl = await db.uploadProductImage(result.dataUrl);
      setProdImageUrl(uploadedUrl || result.dataUrl);
      setProdImageSizeKB(result.sizeKB);
      toast.success(uploadedUrl
        ? `Đã nén (~${result.sizeKB} KB) & tải ảnh lên kho ảnh! Nhớ bấm Lưu để áp dụng.`
        : `Đã nén tối ưu ảnh (~${result.sizeKB} KB)! Nhớ bấm Lưu để áp dụng.`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Không thể xử lý hình ảnh này!');
    } finally {
      setIsCompressingImage(false);
    }
  };

  // Nén lại toàn bộ ảnh món cũ (ảnh lưu thẳng dạng base64 chưa nén, có ảnh nặng tới hơn 1MB)
  // và chuyển sang kho ảnh Supabase Storage -> POS & điện thoại tải thực đơn nhanh, ảnh luôn hiển thị
  const handleOptimizeAllImages = async () => {
    const targets = products.filter(p => typeof p.image_url === 'string' && p.image_url.startsWith('data:image/'));
    if (targets.length === 0) {
      toast.info('Tất cả ảnh món đã được tối ưu!');
      return;
    }
    if (!confirm(`Tối ưu lại ${targets.length} ảnh món đang lưu dạng nặng? (Ảnh chỉ được nén nhẹ hơn, hình món giữ nguyên)`)) return;

    setIsOptimizingImages(true);
    let done = 0;
    let failed = 0;
    try {
      for (const prod of targets) {
        try {
          const original = prod.image_url as string;
          const result = await recompressImageSource(original, 400);
          const uploadedUrl = await db.uploadProductImage(result.dataUrl);
          const newUrl = uploadedUrl || (result.dataUrl.length < original.length ? result.dataUrl : null);
          if (newUrl) {
            await db.updateProduct(prod.id, { image_url: newUrl });
          }
          done++;
        } catch (err) {
          console.error('Lỗi tối ưu ảnh món', prod.id, err);
          failed++;
        }
      }
      toast.success(`Đã tối ưu ${done} ảnh món${failed ? `, ${failed} ảnh lỗi (giữ nguyên ảnh cũ)` : ''}!`);
      await loadAllData();
    } finally {
      setIsOptimizingImages(false);
    }
  };

  // Gỡ ảnh món ăn (quay về logo mặc định)
  const handleRemoveImage = () => {
    setProdImageUrl('');
    setProdImageSizeKB(null);
    toast.success('Đã gỡ ảnh món. Món sẽ dùng logo mặc định của quán!');
  };

  // Thêm nguyên liệu kho thông thường vào công thức món
  const handleAddStockIngredient = (ingId: string, qty: number) => {
    if (!ingId || qty <= 0) return;
    const existingIdx = prodRecipeList.findIndex(r => !r.isPremix && r.ingredient_id === ingId);
    if (existingIdx !== -1) {
      const updated = [...prodRecipeList];
      updated[existingIdx].quantity_needed += qty;
      setProdRecipeList(updated);
    } else {
      setProdRecipeList([
        ...prodRecipeList,
        {
          id: generateShortId('rec_'),
          ingredient_id: ingId,
          quantity_needed: qty,
          isPremix: false
        }
      ]);
    }
  };

  // Thêm nguyên liệu pha sẵn (Nước đường, Nước cốt hồng trà, Kem muối) vào công thức
  const handleAddPremixIngredient = (type: 'nuoc_duong' | 'hong_tra' | 'kem_muoi', ml: number) => {
    if (ml <= 0) return;
    setProdRecipeList([
      ...prodRecipeList,
      {
        id: generateShortId('pre_'),
        ingredient_id: type === 'nuoc_duong' ? 'ing_duong' : type === 'hong_tra' ? 'ing_hongtra' : 'ing_kembeo',
        quantity_needed: 0,
        isPremix: true,
        premix_type: type,
        premix_ml: ml
      }
    ]);
  };

  // Xóa một dòng nguyên liệu trong công thức
  const handleRemoveRecipeRow = (index: number) => {
    const updated = [...prodRecipeList];
    updated.splice(index, 1);
    setProdRecipeList(updated);
  };

  // Tự động tính tổng Giá vốn dự tính
  const calculateTotalEstimatedCost = () => {
    let cost = Number(prodBaseCost || 0);
    for (const item of prodRecipeList) {
      if (item.isPremix) {
        const ml = Number(item.premix_ml || 0);
        if (item.premix_type === 'nuoc_duong') {
          const ing = ingredients.find(i => i.id === 'ing_duong');
          const unitPrice = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
          cost += ml * 0.8333 * unitPrice;
        } else if (item.premix_type === 'hong_tra') {
          const ing = ingredients.find(i => i.id === 'ing_hongtra');
          const unitPrice = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
          cost += ml * 0.01875 * unitPrice;
        } else if (item.premix_type === 'kem_muoi') {
          const ingKembeo = ingredients.find(i => i.id === 'ing_kembeo');
          const ingSuadac = ingredients.find(i => i.id === 'ing_suadac');
          const ingSuatuoi = ingredients.find(i => i.id === 'ing_suatuoi');
          const ingMuoi = ingredients.find(i => i.id === 'ing_muoibien');
          const pKembeo = ingKembeo ? Number((ingKembeo as any).gia_von_trung_binh || (ingKembeo as any).don_gia_nhap || 0) : 0;
          const pSuadac = ingSuadac ? Number((ingSuadac as any).gia_von_trung_binh || (ingSuadac as any).don_gia_nhap || 0) : 0;
          const pSuatuoi = ingSuatuoi ? Number((ingSuatuoi as any).gia_von_trung_binh || (ingSuatuoi as any).don_gia_nhap || 0) : 0;
          const pMuoi = ingMuoi ? Number((ingMuoi as any).gia_von_trung_binh || (ingMuoi as any).don_gia_nhap || 0) : 0;
          cost += ml * (0.5044 * pKembeo + 0.0222 * pSuadac + 0.0333 * pSuatuoi + 0.0111 * pMuoi);
        }
      } else {
        const ing = ingredients.find(i => i.id === item.ingredient_id);
        const unitPrice = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
        cost += Number(item.quantity_needed || 0) * unitPrice;
      }
    }
    return Math.round(cost);
  };

  // Bung ra các nguyên liệu kho cơ sở để lưu vào CSDL
  const flattenRecipeRows = () => {
    const ingMap: { [ingId: string]: number } = {};
    for (const item of prodRecipeList) {
      if (item.isPremix) {
        const ml = Number(item.premix_ml || 0);
        if (item.premix_type === 'nuoc_duong') {
          ingMap['ing_duong'] = (ingMap['ing_duong'] || 0) + (ml * 0.8333);
        } else if (item.premix_type === 'hong_tra') {
          ingMap['ing_hongtra'] = (ingMap['ing_hongtra'] || 0) + (ml * 0.01875);
        } else if (item.premix_type === 'kem_muoi') {
          ingMap['ing_kembeo'] = (ingMap['ing_kembeo'] || 0) + (ml * 0.5044);
          ingMap['ing_suadac'] = (ingMap['ing_suadac'] || 0) + (ml * 0.0222);
          ingMap['ing_suatuoi'] = (ingMap['ing_suatuoi'] || 0) + (ml * 0.0333);
          ingMap['ing_muoibien'] = (ingMap['ing_muoibien'] || 0) + (ml * 0.0111);
        }
      } else {
        ingMap[item.ingredient_id] = (ingMap[item.ingredient_id] || 0) + Number(item.quantity_needed || 0);
      }
    }
    return Object.keys(ingMap).map(ingId => ({
      ingredient_id: ingId,
      quantity_needed: Math.round(ingMap[ingId] * 1000) / 1000
    }));
  };

  // Lưu món ăn kèm công thức & giá vốn
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      toast.error('Vui lòng nhập tên đồ uống!');
      return;
    }
    const takeaway = Number(prodTakeawayPrice || 0);
    const dinein = Number(prodDineinPrice || 0);
    if (takeaway <= 0 && dinein <= 0) {
      toast.error('Vui lòng nhập giá bán lớn hơn 0đ!');
      return;
    }
    if (!prodCategoryId) {
      toast.error('Vui lòng chọn phân loại cho đồ uống!');
      return;
    }

    setSavingProduct(true);
    try {
      const cleanRecipes = flattenRecipeRows();
      const finalTakeaway = takeaway > 0 ? takeaway : dinein;
      const finalDinein = dinein > 0 ? dinein : takeaway;
      const productPayload = {
        name: prodName.trim(),
        price: finalTakeaway,
        takeaway_price: finalTakeaway,
        dinein_price: finalDinein,
        category_id: prodCategoryId,
        image_url: prodImageUrl || '/logo.jpg',
        status: prodStatus,
        base_cost: Number(prodBaseCost || 0)
      };

      if (editingProduct) {
        await db.updateProductWithRecipe(editingProduct.id, productPayload, cleanRecipes);
        toast.success(`Cập nhật món "${prodName}" và công thức thành công!`);
      } else {
        await db.createProductWithRecipe(productPayload, cleanRecipes);
        toast.success(`Thêm món "${prodName}" và công thức thành công!`);
      }

      setIsProductModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Lỗi khi lưu món ăn.');
    } finally {
      setSavingProduct(false);
    }
  };

  // --- LÓGIC CHẤM CÔNG NGOÀI GIỜ (DÀNH RIÊNG CHO QUẢN LÝ) ---
  const handleOpenOtModal = () => {
    const firstStaff = users.find(u => u.role !== 'Admin') || users[0];
    setOtStaffId(firstStaff?.id || '');
    setOtDate(new Date().toLocaleDateString('en-CA'));
    setOtShift('Ca sáng (06:30 - 12:00)');
    setOtStartTime('06:30');
    setOtEndTime('12:00');
    setOtNotes('');
    setEditingOtLog(null);
    setIsOtConfirmModalOpen(false);
  };

  const openEditOvertime = (log: any) => {
    setEditingOtLog(log);
    setOtStaffId(log.user_id);
    const dStr = new Date(log.check_in_time).toLocaleDateString('en-CA');
    if (log.shift?.includes('tối') || log.shift?.includes('chiều') || log.shift?.includes('12:00') || log.shift?.includes('17:30') || log.shift?.includes('16:00') || log.shift?.includes('18:00')) {
      setOtShift('Ca chiều (12:00 - 17:30)');
    } else {
      setOtShift('Ca sáng (06:30 - 12:00)');
    }

    const inD = new Date(log.check_in_time);
    const inH = String(inD.getHours()).padStart(2, '0');
    const inM = String(inD.getMinutes()).padStart(2, '0');
    setOtStartTime(`${inH}:${inM}`);

    if (log.check_out_time) {
      const outD = new Date(log.check_out_time);
      const outH = String(outD.getHours()).padStart(2, '0');
      const outM = String(outD.getMinutes()).padStart(2, '0');
      setOtEndTime(`${outH}:${outM}`);
    } else {
      setOtEndTime('12:00');
    }

    const cleanNote = (log.ghi_chu_vao || '').replace('[Quản lý chấm ngoài giờ]', '').trim();
    setOtNotes(cleanNote);
    setIsOtConfirmModalOpen(false);
  };

  const handleConfirmSaveOvertime = async () => {
    if (!otStaffId) {
      toast.error('Vui lòng chọn nhân viên cần chấm công!');
      return;
    }
    if (!otStartTime || !otEndTime) {
      toast.error('Vui lòng nhập giờ vào và giờ ra đầy đủ!');
      return;
    }

    setSubmittingOt(true);
    try {
      const [inH, inM] = otStartTime.split(':').map(Number);
      const [outH, outM] = otEndTime.split(':').map(Number);

      const inDate = new Date(`${otDate}T00:00:00`);
      inDate.setHours(inH, inM, 0, 0);

      const outDate = new Date(`${otDate}T00:00:00`);
      outDate.setHours(outH, outM, 0, 0);

      if (outDate.getTime() <= inDate.getTime()) {
        toast.error('Giờ ra ca phải sau giờ vào ca!');
        setSubmittingOt(false);
        return;
      }

      if (editingOtLog) {
        await db.updateOvertimeTimeLog(editingOtLog.id, {
          staff_id: otStaffId,
          shift: otShift,
          check_in_time: inDate.toISOString(),
          check_out_time: outDate.toISOString(),
          notes: otNotes.trim()
        });
        toast.success('Đã cập nhật ca làm ngoài giờ!');
      } else {
        await db.createOvertimeTimeLog({
          staff_id: otStaffId,
          date: otDate,
          shift: otShift,
          check_in_time: inDate.toISOString(),
          check_out_time: outDate.toISOString(),
          notes: otNotes.trim()
        });
        confetti({ particleCount: 50, spread: 40 });
        toast.success('Đã chấm công ngoài giờ thành công! Ca đã được phê duyệt và tính công.');
      }

      setIsOtConfirmModalOpen(false);
      setEditingOtLog(null);
      setOtNotes('');
      await loadAllData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Lỗi khi lưu chấm công ngoài giờ.');
    } finally {
      setSubmittingOt(false);
    }
  };

  const handleDeleteOvertime = async (logId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa ca làm ngoài giờ này không?')) return;
    try {
      await db.deleteOvertimeTimeLog(logId);
      toast.success('Đã xóa ca làm ngoài giờ.');
      await loadAllData();
    } catch (err) {
      toast.error('Không thể xóa ca làm ngoài giờ.');
    }
  };

  // --- LOGIC CRUD BÀN & KHU VỰC ---
  const handleOpenCreateTable = () => {
    setEditingTable(null);
    setTableName('');
    setTableCapacity('4');
    setTableStatus('Trống');
    setIsTableModalOpen(true);
  };

  const handleOpenEditTable = (table: any) => {
    setEditingTable(table);
    setTableName(table.table_name || '');
    setTableCapacity(String(table.capacity || 4));
    setTableStatus(table.status || 'Trống');
    setIsTableModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) {
      toast.error('Vui lòng nhập tên bàn!');
      return;
    }
    setSavingTable(true);
    try {
      if (editingTable) {
        await db.updateTable(editingTable.id, {
          table_name: tableName.trim(),
          capacity: Number(tableCapacity) || 4,
          status: tableStatus
        });
        toast.success(`Đã cập nhật thông tin "${tableName.trim()}" thành công!`);
      } else {
        await db.createTable({
          table_name: tableName.trim(),
          capacity: Number(tableCapacity) || 4,
          status: 'Trống'
        });
        toast.success(`Đã thêm bàn mới "${tableName.trim()}"!`);
      }
      setIsTableModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi lưu thông tin bàn');
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = async (table: any) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa bàn "${table.table_name}" không?`)) return;
    try {
      const res = await db.deleteTable(table.id);
      if (res.success) {
        toast.success(`Đã xóa bàn "${table.table_name}" thành công!`);
        await loadAllData();
      } else {
        toast.error(res.message || 'Không thể xóa bàn.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xóa bàn');
    }
  };

  // --- LOGIC CRUD NGUYÊN LIỆU KHO ---
  const handleOpenCreateIngredient = () => {
    setEditingIng(null);
    setIngName('');
    setIngUnit('ml');
    setIngQuyCach('');
    setIngMinStock('');
    setIngInitialStock('0');
    setIngDonGia('');
    setIngGiaVon('');
    setIsIngModalOpen(true);
  };

  const handleOpenEditIngredient = (ing: any) => {
    setEditingIng(ing);
    setIngName(ing.name || '');
    setIngUnit(ing.unit || 'ml');
    setIngQuyCach(ing.quy_cach || '');
    setIngMinStock(ing.min_stock !== null && ing.min_stock !== undefined ? String(ing.min_stock) : '');
    setIngInitialStock(String(ing.stock_quantity || 0));
    setIngDonGia(ing.don_gia_nhap ? String(ing.don_gia_nhap) : '');
    setIngGiaVon(ing.gia_von_trung_binh ? String(ing.gia_von_trung_binh) : '');
    setIsIngModalOpen(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim()) {
      toast.error('Vui lòng nhập tên nguyên liệu!');
      return;
    }
    if (!ingUnit.trim()) {
      toast.error('Vui lòng nhập hoặc chọn đơn vị tính!');
      return;
    }
    setSavingIng(true);
    try {
      const minStockNum = ingMinStock.trim() ? Number(ingMinStock) : null;
      const donGiaNum = ingDonGia.trim() ? Number(ingDonGia) : 0;
      const giaVonNum = ingGiaVon.trim() ? Number(ingGiaVon) : donGiaNum;

      if (editingIng) {
        await db.updateIngredient(editingIng.id, {
          name: ingName.trim(),
          unit: ingUnit.trim(),
          quy_cach: ingQuyCach.trim(),
          min_stock: minStockNum,
          don_gia_nhap: donGiaNum,
          gia_von_trung_binh: giaVonNum
        });
        toast.success(`Đã cập nhật nguyên liệu "${ingName.trim()}"!`);
      } else {
        const initialQty = Number(ingInitialStock) || 0;
        await db.createIngredient({
          name: ingName.trim(),
          unit: ingUnit.trim(),
          quy_cach: ingQuyCach.trim(),
          min_stock: minStockNum,
          initial_stock: initialQty,
          don_gia_nhap: donGiaNum,
          gia_von_trung_binh: giaVonNum
        });
        toast.success(`Đã thêm nguyên liệu mới "${ingName.trim()}" vào kho!`);
      }
      setIsIngModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi lưu nguyên liệu');
    } finally {
      setSavingIng(false);
    }
  };

  const handleDeleteIngredient = async (ing: any) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa nguyên liệu "${ing.name}" khỏi hệ thống không?`)) return;
    try {
      const res = await db.deleteIngredient(ing.id);
      if (res.success) {
        toast.success(`Đã xóa nguyên liệu "${ing.name}" thành công!`);
        await loadAllData();
      } else {
        toast.error(res.message || 'Không thể xóa nguyên liệu.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi xóa nguyên liệu');
    }
  };

  // --- LOGIC CÀI ĐẶT CỬA HÀNG & MÁY IN ---
  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await db.updateStoreSettings({
        store_name: cfgStoreName.trim(),
        store_address: cfgStoreAddress.trim(),
        store_phone: cfgStorePhone.trim(),
        bill_footer: cfgBillFooter.trim(),
        printer_ip: cfgPrinterIp.trim(),
        printer_port: Number(cfgPrinterPort) || 9100,
        pos_bridge_ip: cfgPosBridgeIp.trim()
      });
      setStoreSettings(updated);
      toast.success('Đã lưu cấu hình cửa hàng & máy in thành công!');
    } catch (err: any) {
      toast.error(err.message || 'Không thể lưu cấu hình');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestPrinter = async () => {
    setTestingPrinter(true);
    try {
      const res = await printTestTicket({
        store_name: cfgStoreName,
        printer_ip: cfgPrinterIp,
        printer_port: Number(cfgPrinterPort) || 9100
      });
      if (res.success) {
        toast.success(res.message);
      } else if (res.isWeb) {
        toast.info(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error('Lỗi in test: ' + (err.message || 'Không thể kết nối máy in'));
    } finally {
      setTestingPrinter(false);
    }
  };

  // --- LOGIC SAO LƯU & DỌN DẸP AN TOÀN 3 LỚP ---
  const handleDownloadBackupJson = async () => {
    setExportingJson(true);
    try {
      const data = await db.exportFullBackupData();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      const today = new Date().toISOString().replace(/[:.]/g, '-');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `AVA_COFFEE_BACKUP_FULL_${today}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setLastBackupDownloaded(true);
      toast.success('Đã tải xuống file sao lưu JSON toàn diện!');
    } catch (err: any) {
      toast.error('Lỗi tải sao lưu JSON: ' + err.message);
    } finally {
      setExportingJson(false);
    }
  };

  const handleDownloadBackupExcel = async () => {
    setExportingExcel(true);
    try {
      const data = await db.exportFullBackupData();
      exportFullDatabaseToExcel(data);
      setLastBackupDownloaded(true);
      toast.success('Đã xuất file Excel sao lưu đa Sheet thành công!');
    } catch (err: any) {
      toast.error('Lỗi xuất file Excel: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (cleanupConfirmText.trim() !== 'XAC NHAN XOA') {
      toast.error('Vui lòng gõ chính xác cụm từ "XAC NHAN XOA" để xác nhận!');
      return;
    }
    setCleaningUp(true);
    try {
      if (!lastBackupDownloaded) {
        const data = await db.exportFullBackupData();
        exportFullDatabaseToExcel(data);
        setLastBackupDownloaded(true);
      }

      const days = Number(cleanupHorizon);
      const res = await db.cleanupOldData(days);
      setIsCleanupModalOpen(false);
      setCleanupConfirmText('');
      await loadAllData();
      toast.success(`Dọn dẹp thành công! Đã dọn ${res.deletedOrdersCount} đơn hàng cũ và ${res.deletedLogsCount} dòng lịch sử kho. Tồn kho và thực đơn hiện tại được bảo toàn 100%!`);
    } catch (err: any) {
      toast.error('Lỗi khi dọn dẹp dữ liệu: ' + err.message);
    } finally {
      setCleaningUp(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xoá món ăn này không?')) {
      try {
        await db.deleteProduct(id);
        toast.success('Đã xoá món ăn.');
        loadAllData();
      } catch (err) {
        toast.error('Không thể xoá món ăn.');
      }
    }
  };

  // --- LÓGIC CRUD NHÂN VIÊN ---
  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffName('');
    setStaffEmail('');
    setStaffUsername('');
    setStaffPassword('');
    setStaffRole('User');
    setIsStaffModalOpen(true);
  };

  const openEditStaff = (staff: any) => {
    setEditingStaff(staff);
    setStaffName(staff.full_name);
    setStaffEmail(staff.email);
    setStaffUsername(staff.username || '');
    setStaffPassword(''); // Bỏ trống mật khẩu khi sửa, chỉ đổi nếu admin nhập mới
    setStaffRole(staff.role);
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const staffPayload: any = {
      full_name: staffName,
      email: staffEmail,
      role: staffRole,
    };

    if (editingStaff) {
      // Khi sửa đổi hồ sơ nhân viên
      if (staffPassword) {
        staffPayload.password = staffPassword;
      }
      // Cho phép sửa cả username nếu cần, nhưng thường thì không đổi
      staffPayload.username = staffUsername;
    } else {
      // Khi thêm nhân viên mới
      staffPayload.username = staffUsername;
      staffPayload.password = staffPassword || '123456';
    }

    try {
      if (editingStaff) {
        await db.updateUser(editingStaff.id, staffPayload);
        toast.success('Cập nhật nhân viên thành công!');
      } else {
        const newId = `u_${Date.now()}`;
        await db.createUser({ id: newId, ...staffPayload });
        toast.success('Thêm nhân viên mới thành công!');
      }
      setIsStaffModalOpen(false);
      loadAllData();
    } catch (err: any) {
      toast.error(`Lỗi lưu nhân viên: ${err?.message || 'không xác định'}`);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (id === currentUser.id) {
      toast.error('Bạn không thể xoá tài khoản Admin của chính mình!');
      return;
    }
    if (confirm('Bạn có chắc chắn muốn xoá nhân viên này không?')) {
      try {
        await db.deleteUser(id);
        toast.success('Đã xoá nhân viên.');
        loadAllData();
      } catch (err) {
        toast.error('Không thể xoá nhân viên.');
      }
    }
  };

  // --- LÓGIC BÁO CÁO DOANH THU ---
  const repStartT = new Date(repStartDate + 'T00:00:00').getTime();
  const repEndT = new Date(repEndDate + 'T23:59:59').getTime();

  const paidOrders = orders.filter(o => {
    if (o.payment_status !== 'Đã thanh toán') return false;
    const notes = o.notes || (o as any).ghi_chu || '';
    if (notes.includes('[Chờ duyệt hủy]') && !notes.includes('[Admin từ chối hủy]')) return false;
    const t = new Date(o.paid_at || o.created_at).getTime();
    return t >= repStartT && t <= repEndT;
  });

  const rangeRestockLogs = inventoryLogs.filter(l => {
    if (l.type !== 'Nhập kho' || l.status === 'Từ chối') return false;
    const t = new Date(l.created_at).getTime();
    return t >= repStartT && t <= repEndT;
  });

  const totalDiscount = paidOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const grossRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0) + totalDiscount;
  const actualRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalCash = paidOrders.filter(o => o.payment_method === 'Tiền mặt').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalTransfer = paidOrders.filter(o => o.payment_method === 'Chuyển khoản').reduce((sum, o) => sum + Number(o.total_amount), 0);

  // Tính tổng giá vốn các món đã bán trong giai đoạn (tính động dựa trên công thức và giá vốn trung bình hiện tại của nguyên liệu)
  let calculatedCOGS = 0;
  const ingredientUsage: { [id: string]: number } = {};

  paidOrders.forEach(order => {
    const matchedItems = allOrderItems.filter(item => item.order_id === order.id);
    const items = matchedItems.length > 0 ? matchedItems : (order.order_items || []);
    items.forEach((item: any) => {
      const prodRecipes = recipes.filter(r => r.product_id === item.product_id);
      if (prodRecipes.length > 0) {
        prodRecipes.forEach(r => {
          const qtyUsed = Number(r.quantity_needed || 0) * Number(item.quantity || 0);
          ingredientUsage[r.ingredient_id] = (ingredientUsage[r.ingredient_id] || 0) + qtyUsed;
        });
      } else {
        // Fallback nếu không có công thức: dùng giá vốn snapshot từ hoadondetail
        calculatedCOGS += Number(item.quantity || 0) * Number(item.cost_price || 0);
      }
    });
  });

  Object.entries(ingredientUsage).forEach(([ingId, qtyUsed]) => {
    const ing = ingredients.find(i => i.id === ingId);
    const costPrice = ing ? Number((ing as any).gia_von_trung_binh || (ing as any).don_gia_nhap || 0) : 0;
    calculatedCOGS += qtyUsed * costPrice;
  });

  const totalCOGS = Math.round(calculatedCOGS);

  // Chi phí vận hành trong khoảng thời gian được chọn
  const rangeExpenses = expenses.filter(e => {
    const t = new Date(e.date + 'T00:00:00').getTime();
    return t >= repStartT && t <= repEndT;
  });
  const totalExpenses = rangeExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const netProfit = actualRevenue - totalCOGS - totalExpenses;
  
  const totalRestockCosts = rangeRestockLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
  const totalRestockExpenses = totalRestockCosts + totalDiscount; // Chi phí nhập / giảm giá
  const netMonthRevenue = grossRevenue - totalRestockExpenses;
  const totalRevenue = grossRevenue;

  // --- LÓGIC PHÂN ĐỊNH CA LÀM VIỆC (Ca Sáng: 06:30 - 12:00, Ca Chiều: 12:00 - 17:30) ---
  const isMorningOrder = (created_at: string) => {
    const d = new Date(created_at);
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins < (12 * 60); // Đơn trước 12:00 tính vào Ca Sáng, từ 12:00 trở đi tính vào Ca Chiều
  };

  const morningPaidOrders = paidOrders.filter(o => isMorningOrder(o.paid_at || o.created_at));
  const afternoonPaidOrders = paidOrders.filter(o => !isMorningOrder(o.paid_at || o.created_at));
  const morningRestockLogs = rangeRestockLogs.filter(l => isMorningOrder(l.created_at));
  const afternoonRestockLogs = rangeRestockLogs.filter(l => !isMorningOrder(l.created_at));

  const morningDiscount = morningPaidOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const morningGross = morningPaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0) + morningDiscount;
  const morningActual = morningPaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const morningCash = morningPaidOrders.filter(o => o.payment_method === 'Tiền mặt').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const morningTransfer = morningPaidOrders.filter(o => o.payment_method === 'Chuyển khoản').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const morningRestockCost = morningRestockLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
  const morningNetCash = Math.max(0, morningCash - morningRestockCost);

  const afternoonDiscount = afternoonPaidOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const afternoonGross = afternoonPaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0) + afternoonDiscount;
  const afternoonActual = afternoonPaidOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const afternoonCash = afternoonPaidOrders.filter(o => o.payment_method === 'Tiền mặt').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const afternoonTransfer = afternoonPaidOrders.filter(o => o.payment_method === 'Chuyển khoản').reduce((sum, o) => sum + Number(o.total_amount), 0);
  const afternoonRestockCost = afternoonRestockLogs.reduce((sum, l) => sum + Number(l.cost || 0), 0);
  const afternoonNetCash = Math.max(0, afternoonCash - afternoonRestockCost);

  // Thống kê đối chiếu dòng tiền theo từng ngày (Daily Cashflow Breakdown by Shift)
  interface DailyReportEntry {
    date: string;
    morningCount: number;
    morningCash: number;
    morningTransfer: number;
    morningRestock: number;
    morningActual: number;
    morningDiscount: number;
    morningNetCash: number;
    afternoonCount: number;
    afternoonCash: number;
    afternoonTransfer: number;
    afternoonRestock: number;
    afternoonActual: number;
    afternoonDiscount: number;
    afternoonNetCash: number;
    totalRevenue: number;
    totalCash: number;
    totalTransfer: number;
    totalRestock: number;
    totalDiscount: number;
    totalNetCash: number;
  }

  const dailyReportDict: { [dateStr: string]: DailyReportEntry } = {};

  paidOrders.forEach(o => {
    const orderTime = o.paid_at || o.created_at;
    const dStr = new Date(orderTime).toLocaleDateString('en-CA');
    if (!dailyReportDict[dStr]) {
      dailyReportDict[dStr] = {
        date: dStr,
        morningCount: 0, morningCash: 0, morningTransfer: 0, morningRestock: 0, morningActual: 0, morningDiscount: 0, morningNetCash: 0,
        afternoonCount: 0, afternoonCash: 0, afternoonTransfer: 0, afternoonRestock: 0, afternoonActual: 0, afternoonDiscount: 0, afternoonNetCash: 0,
        totalRevenue: 0, totalCash: 0, totalTransfer: 0, totalRestock: 0, totalDiscount: 0, totalNetCash: 0
      };
    }
    const day = dailyReportDict[dStr];
    const amt = Number(o.total_amount || 0);
    const disc = Number(o.discount || 0);
    const isMorn = isMorningOrder(orderTime);
    const isCash = o.payment_method === 'Tiền mặt';

    if (isMorn) {
      day.morningCount += 1;
      day.morningActual += amt;
      day.morningDiscount += disc;
      if (isCash) day.morningCash += amt;
      else day.morningTransfer += amt;
    } else {
      day.afternoonCount += 1;
      day.afternoonActual += amt;
      day.afternoonDiscount += disc;
      if (isCash) day.afternoonCash += amt;
      else day.afternoonTransfer += amt;
    }
    day.totalRevenue += amt;
    day.totalDiscount += disc;
    if (isCash) day.totalCash += amt;
    else day.totalTransfer += amt;
  });

  rangeRestockLogs.forEach(l => {
    const dStr = new Date(l.created_at).toLocaleDateString('en-CA');
    if (!dailyReportDict[dStr]) {
      dailyReportDict[dStr] = {
        date: dStr,
        morningCount: 0, morningCash: 0, morningTransfer: 0, morningRestock: 0, morningActual: 0, morningDiscount: 0, morningNetCash: 0,
        afternoonCount: 0, afternoonCash: 0, afternoonTransfer: 0, afternoonRestock: 0, afternoonActual: 0, afternoonDiscount: 0, afternoonNetCash: 0,
        totalRevenue: 0, totalCash: 0, totalTransfer: 0, totalRestock: 0, totalDiscount: 0, totalNetCash: 0
      };
    }
    const day = dailyReportDict[dStr];
    const cost = Number(l.cost || 0);
    const isMorn = isMorningOrder(l.created_at);
    if (isMorn) day.morningRestock += cost;
    else day.afternoonRestock += cost;
    day.totalRestock += cost;
  });

  const dailyReportRows = Object.values(dailyReportDict)
    .map(d => ({
      ...d,
      morningNetCash: Math.max(0, d.morningCash - d.morningRestock),
      afternoonNetCash: Math.max(0, d.afternoonCash - d.afternoonRestock),
      totalNetCash: Math.max(0, d.totalCash - d.totalRestock)
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Danh sách đơn hàng đã lọc theo Ca và Phương thức thanh toán
  const filteredPaidOrders = paidOrders.filter(o => {
    if (repShiftFilter === 'morning' && !isMorningOrder(o.paid_at || o.created_at)) return false;
    if (repShiftFilter === 'afternoon' && isMorningOrder(o.paid_at || o.created_at)) return false;
    if (repPayFilter !== 'all' && o.payment_method !== repPayFilter) return false;
    return true;
  });

  // --- Tính toán thống kê bán hàng Admin (Phân tách Tại quán & Mang đi) ---
  const itemsFromOrders = paidOrders.flatMap(o => (o.order_items || []).map((it: any) => ({ ...it, order_id: o.id })));
  const matchedFromAllItems = allOrderItems.filter(item => paidOrders.some(o => o.id === item.order_id));
  const rangeOrderItems = itemsFromOrders.length > 0 ? itemsFromOrders : matchedFromAllItems;

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
  
  rangeOrderItems.forEach((item: any) => {
    const prodId = item.product_id;
    const qty = Number(item.quantity || 0);
    const price = Number(item.unit_price || item.products?.price || item.price || 0);
    const parentOrder = paidOrders.find(o => o.id === item.order_id);
    const isTakeaway = parentOrder?.table_id === 'tb_mangve' || parentOrder?.tables?.table_name === 'Khách mang về';
    const key = `${prodId}_${isTakeaway ? 'takeaway' : 'dinein'}`;
    const rawName = item.products?.name || item.ten_san_pham || item.name || 'Sản phẩm';

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
    salesMap[key].subtotal += (Number(item.subtotal || item.thanh_tien) || (qty * price));
    if (!salesMap[key].price && price) {
      salesMap[key].price = price;
    }
  });

  const sortedSales = Object.values(salesMap).sort((a, b) => {
    const nameCompare = a.baseName.localeCompare(b.baseName, 'vi', { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return (a.isTakeaway ? 1 : 0) - (b.isTakeaway ? 1 : 0);
  });

  let lyDen = 0;
  let lyTrang = 0;
  let lyHoaVan = 0;

  rangeOrderItems.forEach((item: any) => {
    const qty = Number(item.quantity || 0);

    // Đếm ly đúng quy tắc trừ kho: chỉ món có ly trong công thức định lượng mới tính ly
    // (ly nhân viên đổi riêng được ưu tiên; món không có ly như Bò húc / Nước suối không tính)
    const cup = resolveItemCupId(item.product_id, item.name || item.ten_san_pham, item.notes || item.ghi_chu, item.cup_id, recipes);
    if (cup === 'ing_lyden') lyDen += qty;
    else if (cup === 'ing_lyhoavan') lyHoaVan += qty;
    else if (cup === 'ing_lytrang') lyTrang += qty;
  });

  const totalLy = lyDen + lyTrang + lyHoaVan;


  // Helper: Trích xuất lý do/ghi chú thực tế do nhân viên nhập
  const extractCleanNote = (rawNote?: string | null): string => {
    if (!rawNote) return '';
    const text = rawNote.trim();
    const match = text.match(/Kiểm kho thực tế:\s*[\d.]+\s*\(Hệ thống:\s*[\d.]+\)\.?\s*(.*)/i);
    if (match) {
      const custom = match[1]?.trim();
      return custom || '';
    }
    return text;
  };

  const formatLogTime = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // --- LÓGIC BÁO CÁO KHO THEO KHOẢNG NGÀY ---
  const getHistoricalIngStats = (ing: any) => {
    const startT = new Date(invStartDate + 'T00:00:00').getTime();
    const endT = new Date(invEndDate + 'T23:59:59').getTime();

    const ingLogs = inventoryLogs.filter(l => l.ingredient_id === ing.id);

    // Tính ngược từ tồn kho thực tế hiện tại
    const logsAfterEnd = ingLogs.filter(l => new Date(l.created_at).getTime() > endT);
    const netChangeAfterEnd = logsAfterEnd
      .filter(l => l.status !== 'Từ chối')
      .reduce((sum, l) => sum + Number(l.change_amount || 0), 0);

    const endingStockVal = Math.max(0, Number(ing.stock_quantity || 0) - netChangeAfterEnd);

    const logsInRange = ingLogs.filter(l => {
      const t = new Date(l.created_at).getTime();
      return t >= startT && t <= endT;
    });

    const refilled = logsInRange
      .filter(l => 
        (l.type === 'Nhập kho' && l.status !== 'Từ chối') ||
        (l.type === 'Hao hụt/Cân lại' && l.change_amount > 0 && l.status !== 'Từ chối') ||
        (l.type === 'Khác' && l.change_amount > 0 && l.status !== 'Từ chối')
      )
      .reduce((sum, l) => sum + Number(l.change_amount || 0), 0);

    const sold = logsInRange
      .filter(l => 
        (l.type === 'Bán hàng') ||
        (l.type === 'Hao hụt/Cân lại' && l.change_amount < 0 && l.status !== 'Từ chối') ||
        (l.type === 'Khác' && l.change_amount < 0 && l.status !== 'Từ chối')
      )
      .reduce((sum, l) => sum + Math.abs(Number(l.change_amount || 0)), 0);

    const salesOnly = logsInRange
      .filter(l => l.type === 'Bán hàng')
      .reduce((sum, l) => sum + Math.abs(Number(l.change_amount || 0)), 0);

    // Chi tiết hao hụt / kiểm kho giảm (kèm lý do ghi chú)
    const lossLogs = logsInRange
      .filter(l => 
        ((l.type === 'Hao hụt/Cân lại' && l.change_amount < 0) ||
         (l.type === 'Khác' && l.change_amount < 0)) &&
        l.status !== 'Từ chối'
      )
      .map(l => ({
        id: l.id,
        amount: Math.abs(Number(l.change_amount || 0)),
        type: l.type,
        rawNote: l.note || '',
        cleanNote: extractCleanNote(l.note),
        time: formatLogTime(l.created_at)
      }));

    // Chi tiết hoàn kho do hủy đơn
    const refundLogs = logsInRange
      .filter(l => 
        l.change_amount > 0 &&
        l.status !== 'Từ chối' &&
        (l.type === 'Khác' || (l.note && l.note.toLowerCase().includes('hủy đơn')))
      )
      .map(l => ({
        id: l.id,
        amount: Number(l.change_amount || 0),
        rawNote: l.note || '',
        cleanNote: extractCleanNote(l.note),
        time: formatLogTime(l.created_at)
      }));

    // Chi tiết nhập hàng mới
    const restockLogs = logsInRange
      .filter(l => 
        l.type === 'Nhập kho' &&
        l.status !== 'Từ chối' &&
        !(l.note && l.note.toLowerCase().includes('hủy đơn'))
      )
      .map(l => ({
        id: l.id,
        amount: Number(l.change_amount || 0),
        rawNote: l.note || '',
        cleanNote: extractCleanNote(l.note),
        time: formatLogTime(l.created_at)
      }));

    // Chi tiết kiểm kho dôi dư (tăng)
    const stocktakeGainLogs = logsInRange
      .filter(l => 
        l.type === 'Hao hụt/Cân lại' &&
        l.change_amount > 0 &&
        l.status !== 'Từ chối'
      )
      .map(l => ({
        id: l.id,
        amount: Number(l.change_amount || 0),
        rawNote: l.note || '',
        cleanNote: extractCleanNote(l.note),
        time: formatLogTime(l.created_at)
      }));

    const openingStock = Math.max(0, endingStockVal - refilled + sold);

    return {
      openingStock,
      endingStock: endingStockVal,
      refilled,
      sold,
      salesOnly,
      lossLogs,
      refundLogs,
      restockLogs,
      stocktakeGainLogs
    };
  };

  const isOrderPendingCancel = (o: any) => {
    const status = o.payment_status || (o as any).trang_thai_thanh_toan;
    if (status === 'Chờ duyệt hủy') return true;
    const notes = o.notes || (o as any).ghi_chu || '';
    return notes.includes('[Chờ duyệt hủy]') && !notes.includes('[Admin đã duyệt hủy]') && !notes.includes('[Admin từ chối hủy]');
  };

  const isOrderCancelInventoryLog = (l: any) => {
    const note = (l.note || l.ghi_chu || '').toLowerCase();
    return note.includes('hủy đơn') || note.includes('đơn hủy') || note.includes('hoàn kho đơn');
  };

  const pendingTimeLogs = timeLogs.filter(l => l.status === 'Chờ duyệt');
  const pendingLeaveRequests = leaveRequests.filter(r => r.status === 'Chờ duyệt');
  const pendingInventoryLogs = inventoryLogs.filter(l => l.status === 'Chờ duyệt' && !isOrderCancelInventoryLog(l));
  const pendingCancelOrders = orders.filter(isOrderPendingCancel);
  const totalPendingCount = pendingTimeLogs.length + pendingLeaveRequests.length + pendingInventoryLogs.length + pendingCancelOrders.length;

  return (
    <div className="space-y-6">
      <Link 
        href="/"
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-coffee-light text-coffee-primary rounded-xl text-xs font-bold hover:bg-coffee-light transition shadow-sm w-fit animate-fade-in"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về Trang chủ</span>
      </Link>
      {/* TABS HEADER ADMIN */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-coffee-light flex flex-wrap gap-2">
        <button
          onClick={() => setAdminTab('approvals')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'approvals'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Clock className="w-4.5 h-4.5" />
          <span>Duyệt yêu cầu</span>
          {totalPendingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-extrabold animate-pulse">
              {totalPendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setAdminTab('reports')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'reports'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <BarChart3 className="w-4.5 h-4.5" />
          <span>Báo cáo doanh thu</span>
        </button>
        <button
          onClick={() => setAdminTab('sales')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'sales'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <ShoppingBag className="w-4.5 h-4.5" />
          <span>Báo cáo bán hàng</span>
        </button>
        <button
          onClick={() => setAdminTab('inventory')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'inventory'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <CalendarDays className="w-4.5 h-4.5" />
          <span>Báo cáo kho</span>
        </button>
        <button
          onClick={() => setAdminTab('products')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'products'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Utensils className="w-4.5 h-4.5" />
          <span>Quản lý đồ uống</span>
        </button>
        <button
          onClick={() => setAdminTab('staff')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'staff'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Users className="w-4.5 h-4.5" />
          <span>Quản lý nhân viên</span>
        </button>
        <button
          onClick={() => setAdminTab('attendance')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'attendance'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Clock className="w-4.5 h-4.5" />
          <span>Báo cáo chấm công</span>
        </button>
        <button
          onClick={() => setAdminTab('expenses')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'expenses'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <DollarSign className="w-4.5 h-4.5" />
          <span>Chi phí vận hành</span>
        </button>
        <button
          onClick={() => setAdminTab('overtime')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'overtime'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Sparkles className="w-4.5 h-4.5" />
          <span>Chấm công ngoài giờ</span>
        </button>
        <button
          onClick={() => setAdminTab('tables')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'tables'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <LayoutGrid className="w-4.5 h-4.5" />
          <span>Quản lý Bàn</span>
        </button>
        <button
          onClick={() => setAdminTab('settings')}
          className={`flex items-center space-x-2 px-4 py-3 rounded-2xl text-xs font-bold transition ${
            adminTab === 'settings'
              ? 'bg-coffee-primary text-white shadow'
              : 'text-coffee-medium hover:bg-coffee-light'
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
          <span>Cài đặt & Dữ liệu</span>
        </button>
      </div>

      {/* 1. TAB PHÊ DUYỆT YÊU CẦU */}
      {adminTab === 'approvals' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-lg text-coffee-dark">Danh Sách Yêu Cầu Chờ Duyệt</h3>
              <p className="text-xs text-coffee-medium">Xem lại vị trí chấm công, nghỉ phép, duyệt hủy đơn và đơn nhập/kiểm kho để duyệt.</p>
            </div>
            {/* Sub-tabs */}
            <div className="flex bg-[#FAF6F0] p-1.5 rounded-2xl border border-coffee-light overflow-x-auto max-w-full gap-1">
              <button
                onClick={() => setApprovalSubTab('time')}
                className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition shrink-0 flex items-center space-x-1.5 ${
                  approvalSubTab === 'time' ? 'bg-white text-coffee-dark shadow-sm' : 'text-coffee-medium hover:bg-coffee-light/45'
                }`}
              >
                <span>Chấm công</span>
                {pendingTimeLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold animate-pulse">
                    {pendingTimeLogs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setApprovalSubTab('leave')}
                className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition shrink-0 flex items-center space-x-1.5 ${
                  approvalSubTab === 'leave' ? 'bg-white text-coffee-dark shadow-sm' : 'text-coffee-medium hover:bg-coffee-light/45'
                }`}
              >
                <span>Nghỉ phép</span>
                {pendingLeaveRequests.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold animate-pulse">
                    {pendingLeaveRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setApprovalSubTab('inventory')}
                className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition shrink-0 flex items-center space-x-1.5 ${
                  approvalSubTab === 'inventory' ? 'bg-white text-coffee-dark shadow-sm' : 'text-coffee-medium hover:bg-coffee-light/45'
                }`}
              >
                <span>Duyệt Kho & Kiểm Kho</span>
                {pendingInventoryLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold animate-pulse">
                    {pendingInventoryLogs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setApprovalSubTab('order_cancel')}
                className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition shrink-0 flex items-center space-x-1.5 ${
                  approvalSubTab === 'order_cancel' ? 'bg-white text-coffee-dark shadow-sm' : 'text-coffee-medium hover:bg-coffee-light/45'
                }`}
              >
                <span>Duyệt hủy đơn</span>
                {pendingCancelOrders.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[9px] font-extrabold animate-pulse">
                    {pendingCancelOrders.length}
                  </span>
                )}
              </button>
            </div>

            {/* Nút Duyệt tất cả */}
            <button
              onClick={handleApproveAll}
              className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs rounded-2xl transition shadow-md shadow-green-600/10 flex items-center space-x-1.5 shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>Duyệt tất cả</span>
            </button>
          </div>

          {/* DUYỆT CHẤM CÔNG */}
          {approvalSubTab === 'time' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {timeLogs.filter(l => l.status === 'Chờ duyệt' || l.status === 'Đang trong ca').map((log) => {
                const formatTime = (dStr: any) => {
                  if (!dStr) return 'Chưa ra ca';
                  return new Date(dStr).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                };
                const formatDate = (dStr: any) => {
                  if (!dStr) return '';
                  return new Date(dStr).toLocaleDateString('vi-VN');
                };
                const calculateHours = (logItem: any) => {
                  const checkIn = logItem.check_in_time || logItem.gio_vao;
                  const checkOut = logItem.check_out_time || logItem.gio_ra;
                  if (!checkIn || !checkOut) return 0;
                  const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
                  return Math.max(0, Number((diffMs / (1000 * 60 * 60)).toFixed(2)));
                };

                const isWorking = log.status === 'Đang trong ca';

                return (
                  <div key={log.id} className="bg-white rounded-3xl p-6 border border-coffee-light shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between border-b border-coffee-light pb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-9 h-9 bg-coffee-light rounded-xl flex items-center justify-center text-coffee-primary font-bold text-xs">
                          {log.users?.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-coffee-dark">{log.users?.full_name}</h4>
                          <p className="text-[10px] text-coffee-medium">{log.users?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          isWorking ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {log.status}
                        </span>
                        {log.is_edited && (
                          <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Sửa lại
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-extrabold text-coffee-dark text-xs bg-coffee-light/30 px-2 py-1 rounded w-fit">
                          Ca trực: {log.shift}
                        </p>
                        {!isWorking && (
                          <span className="font-extrabold text-[#D05A3F] text-xs bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            ⏱️ Số giờ làm: <strong>{calculateHours(log)}h</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 bg-[#FAF6F0] p-3 rounded-2xl border border-coffee-light/60">
                        {/* Chi tiết Vào ca */}
                        <div className="space-y-0.5">
                          <p className="text-[9px] font-extrabold text-coffee-primary uppercase">Vào ca</p>
                          <p className="text-coffee-dark">Khai báo: <strong>{formatTime(log.check_in_time)}</strong></p>
                          <p className="text-[10px] text-coffee-medium">Thực tế: {formatTime(log.submitted_at)}</p>
                        </div>

                        {/* Chi tiết Ra ca */}
                        <div className="space-y-0.5 border-l border-coffee-light pl-3">
                          <p className="text-[9px] font-extrabold text-teal-700 uppercase">Ra ca</p>
                          {log.check_out_time ? (
                            <>
                              <p className="text-coffee-dark">Khai báo: <strong>{formatTime(log.check_out_time)}</strong></p>
                              <p className="text-[10px] text-coffee-medium">Thực tế: {formatTime(log.real_check_out_time)}</p>
                            </>
                          ) : (
                            <p className="text-[10px] text-blue-600 font-bold italic animate-pulse">Đang làm...</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-coffee-medium">Ngày chấm công: <strong>{formatDate(log.check_in_time)}</strong></p>
                        {log.ghi_chu_vao && (
                          <p className="text-[10px] text-coffee-medium">Ghi chú vào: <span className="italic">"{log.ghi_chu_vao}"</span></p>
                        )}
                        {log.ghi_chu_ra && (
                          <p className="text-[10px] text-coffee-medium">Ghi chú ra: <span className="italic">"{log.ghi_chu_ra}"</span></p>
                        )}
                        <p className="text-coffee-medium flex items-start text-[10px] pt-1">
                          <MapPin className="w-3.5 h-3.5 mr-1 text-coffee-primary shrink-0 mt-0.5" />
                          <span>Vị trí cuối: {log.location_address || `Tọa độ: ${log.latitude}, ${log.longitude}`}</span>
                        </p>
                      </div>
                    </div>

                    {/* Định vị bằng tọa độ số & Nút mở Google Maps */}
                    <div className="bg-coffee-cream/35 border border-coffee-accent/60 rounded-2xl p-4 space-y-3 shadow-sm text-xs">
                      <div className="flex justify-between font-mono text-[10px] text-coffee-medium">
                        <span>Vĩ độ: {log.latitude.toFixed(6)}</span>
                        <span>Kinh độ: {log.longitude.toFixed(6)}</span>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${log.latitude},${log.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 bg-[#1A73E8] hover:bg-[#1557b0] text-white font-bold text-[10px] rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5"
                      >
                        <Map className="w-3.5 h-3.5" />
                        <span>Mở vị trí chấm công trên Google Maps 🗺️</span>
                      </a>
                    </div>

                    <div className="pt-2">
                      {isWorking ? (
                        <div className="space-y-2">
                          <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-center font-bold text-[10px]">
                            ⚠️ Nhân viên đang trong ca làm. Chỉ được phép <strong>HỦY</strong>, không thể Phê duyệt khi chưa chấm ra.
                          </div>
                          <button
                            onClick={() => handleApproveTime(log.id, 'Từ chối')}
                            className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition border border-red-200 flex items-center justify-center space-x-1.5 shadow-xs"
                          >
                            <X className="w-4 h-4" />
                            <span>Hủy lượt chấm công này (Ca dở dang)</span>
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleApproveTime(log.id, 'Từ chối')}
                            className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                          >
                            <X className="w-4 h-4" />
                            <span>Từ chối</span>
                          </button>
                          <button
                            onClick={() => handleApproveTime(log.id, 'Đã duyệt')}
                            className="py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                          >
                            <Check className="w-4 h-4" />
                            <span>Phê duyệt</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {timeLogs.filter(l => l.status === 'Chờ duyệt' || l.status === 'Đang trong ca').length === 0 && (
                <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-coffee-light text-coffee-medium text-xs space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-bold">Tuyệt vời! Không còn yêu cầu chấm công nào chờ duyệt</p>
                </div>
              )}
            </div>
          )}

          {/* DUYỆT NGHỈ PHÉP */}
          {approvalSubTab === 'leave' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {leaveRequests.filter(r => r.status === 'Chờ duyệt').map((req) => (
                <div key={req.id} className="bg-white rounded-3xl p-6 border border-coffee-light shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between border-b border-coffee-light pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-9 h-9 bg-coffee-light rounded-xl flex items-center justify-center text-coffee-primary font-bold text-xs">
                        {req.users?.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-coffee-dark">{req.users?.full_name}</h4>
                        <p className="text-[10px] text-coffee-medium">{req.users?.email}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full uppercase">
                      Chờ duyệt
                    </span>
                  </div>

                  <div className="text-xs space-y-2">
                    <p className="flex items-center">
                      <CalendarDays className="w-4 h-4 mr-1.5 text-coffee-primary" />
                      <span>Nghỉ từ ngày: <strong>{new Date(req.start_date).toLocaleDateString('vi-VN')}</strong> đến <strong>{new Date(req.end_date).toLocaleDateString('vi-VN')}</strong></span>
                    </p>
                    <p className="bg-[#FAF6F0] p-3 rounded-xl border border-coffee-light text-coffee-medium italic text-[11px]">
                      Lý do: "{req.reason}"
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => handleApproveLeave(req.id, 'Từ chối')}
                      className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>Từ chối</span>
                    </button>
                    <button
                      onClick={() => handleApproveLeave(req.id, 'Đã duyệt')}
                      className="py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Phê duyệt</span>
                    </button>
                  </div>
                </div>
              ))}

              {leaveRequests.filter(r => r.status === 'Chờ duyệt').length === 0 && (
                <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-coffee-light text-coffee-medium text-xs space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-bold">Tuyệt vời! Không còn yêu cầu xin nghỉ phép nào chờ duyệt</p>
                </div>
              )}
            </div>
          )}

          {/* DUYỆT NHẬP & KIỂM KHO (Loại trừ các dòng hoàn kho của đơn hủy) */}
          {approvalSubTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {inventoryLogs.filter(l => l.status === 'Chờ duyệt' && !isOrderCancelInventoryLog(l)).map((log) => (
                <div key={log.id} className="bg-white rounded-3xl p-6 border border-coffee-light shadow-sm flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between border-b border-coffee-light pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-9 h-9 bg-coffee-light rounded-xl flex items-center justify-center text-coffee-primary font-bold text-xs">
                        {log.staff_name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-coffee-dark">{log.staff_name}</h4>
                        <p className="text-[10px] text-coffee-medium">{new Date(log.created_at).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full uppercase">
                      {log.type} - Chờ duyệt
                    </span>
                  </div>

                  <div className="text-xs space-y-2">
                    <p className="font-extrabold text-coffee-dark text-sm">
                      Món: {log.ingredient_name}
                    </p>
                    <p className="text-coffee-medium">
                      Số lượng thay đổi: <strong className="text-coffee-dark">
                        {log.type === 'Nhập kho'
                          ? formatIngredientRefill(log.change_amount, log.ingredient_unit, ingredients.find(i => i.id === log.ingredient_id)?.quy_cach)
                          : `${log.change_amount > 0 ? `+${log.change_amount}` : log.change_amount} ${log.ingredient_unit}`}
                      </strong>
                    </p>
                    {log.cost > 0 && (
                      <p className="text-coffee-medium">
                        Chi phí phát sinh: <strong className="text-emerald-700">{log.cost.toLocaleString('vi-VN')}đ</strong>
                      </p>
                    )}
                    {log.note && (
                      <p className="bg-[#FAF6F0] p-3 rounded-xl border border-coffee-light text-coffee-medium italic text-[11px]">
                        Ghi chú: "{log.note}"
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => handleApproveInventory(log.id, 'Từ chối')}
                      className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>Từ chối</span>
                    </button>
                    <button
                      onClick={() => handleApproveInventory(log.id, 'Đã duyệt')}
                      className="py-2.5 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Phê duyệt</span>
                    </button>
                  </div>
                </div>
              ))}

              {inventoryLogs.filter(l => l.status === 'Chờ duyệt' && !isOrderCancelInventoryLog(l)).length === 0 && (
                <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-coffee-light text-coffee-medium text-xs space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-bold">Tuyệt vời! Không còn đơn kho hoặc kiểm kho nào chờ duyệt</p>
                </div>
              )}
            </div>
          )}

          {/* DUYỆT HỦY ĐƠN ĐÃ THANH TOÁN */}
          {approvalSubTab === 'order_cancel' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingCancelOrders.map((order: any) => {
                const staff = users.find(u => u.id === order.staff_id || u.id === (order as any).id_nhan_vien);
                const orderDate = new Date(order.created_at || (order as any).ngay_tao).toLocaleString('vi-VN');
                const itemsInOrder = allOrderItems.filter(it => it.order_id === order.id || (it as any).idhoadon === order.id);
                const totalItemQty = itemsInOrder.reduce((sum, it) => sum + (Number(it.quantity || (it as any).so_luong || 1)), 0);

                const rawNotes = order.notes || (order as any).ghi_chu || '';
                const reasonMatch = rawNotes.match(/\[Chờ duyệt hủy\] Lý do: ([^|]+)/);
                const cancelReason = reasonMatch ? reasonMatch[1].trim() : (rawNotes || 'Không có lý do chi tiết');

                return (
                  <div key={order.id} className="bg-white p-5 rounded-3xl border border-red-200 shadow-sm space-y-4 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          ⏳ Chờ duyệt hủy đơn
                        </span>
                        <h4 className="font-extrabold text-base text-coffee-dark mt-1.5">
                          Hóa đơn #{order.id.slice(0, 8)}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-base text-red-600 block">
                          {Number(order.total_amount || (order as any).tong_tien || 0).toLocaleString('vi-VN')}đ
                        </span>
                        <span className="text-[11px] text-coffee-medium font-medium">
                          {totalItemQty > 0 ? `${totalItemQty} món` : (order.tables?.table_name || 'Bàn')}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-coffee-medium bg-[#FAF6F0] p-3.5 rounded-2xl border border-coffee-light/60">
                      <div className="flex justify-between">
                        <span>Nhân viên tạo/thu ngân:</span>
                        <span className="font-bold text-coffee-dark">{staff?.full_name || 'Nhân viên'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Thời gian thanh toán:</span>
                        <span className="font-bold text-coffee-dark">{orderDate}</span>
                      </div>
                      <div className="pt-2 border-t border-coffee-light/50">
                        <span className="font-bold text-coffee-dark">Lý do hủy đơn:</span>
                        <p className="text-xs text-red-700 font-bold mt-1 bg-red-50 p-2 rounded-xl border border-red-100 italic">
                          "{cancelReason}"
                        </p>
                      </div>
                      {itemsInOrder.length > 0 && (
                        <div className="pt-2 border-t border-coffee-light/50">
                          <span className="font-bold text-coffee-dark block mb-1">Món trong đơn:</span>
                          <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                            {itemsInOrder.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-[11px] text-coffee-dark">
                                <span>• {it.products?.name || it.ten_san_pham || 'Món'}</span>
                                <span className="font-bold">x{it.quantity || (it as any).so_luong}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-coffee-medium bg-amber-50 p-3 rounded-xl border border-amber-200 space-y-1">
                      <p className="font-bold text-amber-900 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 inline shrink-0" />
                        <span>Quy trình kiểm duyệt kho 2 chiều:</span>
                      </p>
                      <p>
                        • <strong>Đồng ý duyệt hủy:</strong> Giữ nguyên việc hoàn trả nguyên liệu vào kho, doanh thu hủy vĩnh viễn.
                      </p>
                      <p>
                        • <strong>Từ chối duyệt hủy:</strong> Khôi phục hóa đơn 'Đã thanh toán', tính lại doanh thu, và <strong>tự động THU HỒI (trừ kho trở lại)</strong>.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        onClick={() => handleApproveOrderCancel(order.id, false)}
                        className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
                      >
                        <X className="w-4 h-4" />
                        <span>Từ chối hủy</span>
                      </button>
                      <button
                        onClick={() => handleApproveOrderCancel(order.id, true)}
                        className="py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <Check className="w-4 h-4" />
                        <span>Đồng ý duyệt hủy</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {pendingCancelOrders.length === 0 && (
                <div className="col-span-full bg-white rounded-3xl p-12 text-center border border-coffee-light text-coffee-medium text-xs space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <p className="font-bold">Không có yêu cầu hủy đơn nào đang chờ duyệt</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. TAB BÁO CÁO DOANH THU */}
      {adminTab === 'reports' && (
        <div className="space-y-6">
          {/* Bộ lọc khoảng ngày & Bộ lọc Ca làm việc */}
          <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3.5 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Từ ngày:</span>
                <input
                  type="date"
                  value={repStartDate}
                  onChange={(e) => setRepStartDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Đến ngày:</span>
                <input
                  type="date"
                  value={repEndDate}
                  onChange={(e) => setRepEndDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
            </div>

            {/* Shift Quick Filter */}
            <div className="flex flex-wrap items-center gap-2 bg-[#FAF6F0] p-1.5 rounded-2xl border border-coffee-light/60">
              <button
                onClick={() => setRepShiftFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                  repShiftFilter === 'all'
                    ? 'bg-coffee-primary text-white shadow-sm'
                    : 'text-coffee-medium hover:text-coffee-dark hover:bg-white/60'
                }`}
              >
                <span>🌟 Tất cả ca</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  repShiftFilter === 'all' ? 'bg-white/20 text-white' : 'bg-coffee-light/40 text-coffee-dark'
                }`}>
                  {paidOrders.length}
                </span>
              </button>

              <button
                onClick={() => setRepShiftFilter('morning')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                  repShiftFilter === 'morning'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-800 hover:bg-amber-100/60'
                }`}
              >
                <span>☀️ Ca Sáng (06:30-12:00)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  repShiftFilter === 'morning' ? 'bg-white/20 text-white' : 'bg-amber-200/70 text-amber-900'
                }`}>
                  {morningPaidOrders.length}
                </span>
              </button>

              <button
                onClick={() => setRepShiftFilter('afternoon')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                  repShiftFilter === 'afternoon'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-indigo-800 hover:bg-indigo-100/60'
                }`}
              >
                <span>🌙 Ca Chiều (12:00-17:30)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  repShiftFilter === 'afternoon' ? 'bg-white/20 text-white' : 'bg-indigo-200/70 text-indigo-900'
                }`}>
                  {afternoonPaidOrders.length}
                </span>
              </button>
            </div>
          </div>

          {/* Header Báo Cáo Doanh Thu */}
          <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">💰 Báo cáo Doanh thu & Quản lý Dòng tiền</h3>
              <p className="text-xs text-coffee-medium mt-1">Tổng hợp và báo cáo tài chính từ ngày <strong>{new Date(repStartDate).toLocaleDateString('vi-VN')}</strong> đến ngày <strong>{new Date(repEndDate).toLocaleDateString('vi-VN')}</strong>.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => exportRevenueToExcel({
                  grossRevenue, totalDiscount, totalRestockCosts, totalRestockExpenses,
                  netRevenue: netMonthRevenue, totalCash, totalTransfer, paidOrders,
                  restockLogs: rangeRestockLogs, totalCOGS, netProfit, totalExpenses,
                  shifts: {
                    morning: {
                      ordersCount: morningPaidOrders.length,
                      actualRevenue: morningActual,
                      cash: morningCash,
                      transfer: morningTransfer,
                      restockCost: morningRestockCost,
                      netCash: morningNetCash,
                      discount: morningDiscount
                    },
                    afternoon: {
                      ordersCount: afternoonPaidOrders.length,
                      actualRevenue: afternoonActual,
                      cash: afternoonCash,
                      transfer: afternoonTransfer,
                      restockCost: afternoonRestockCost,
                      netCash: afternoonNetCash,
                      discount: afternoonDiscount
                    }
                  }
                }, repStartDate, repEndDate)}
                className="px-3.5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-xl transition border border-green-200 flex items-center space-x-1.5 shadow-sm"
              >
                📊 <span>Xuất Excel Doanh Thu</span>
              </button>
              <button
                onClick={() => exportRevenueToPDF({
                  grossRevenue, totalDiscount, totalRestockCosts, totalRestockExpenses,
                  netRevenue: netMonthRevenue, totalCash, totalTransfer, paidOrders,
                  restockLogs: rangeRestockLogs, totalCOGS, netProfit, totalExpenses,
                  shifts: {
                    morning: {
                      ordersCount: morningPaidOrders.length,
                      actualRevenue: morningActual,
                      cash: morningCash,
                      transfer: morningTransfer,
                      restockCost: morningRestockCost,
                      netCash: morningNetCash,
                      discount: morningDiscount
                    },
                    afternoon: {
                      ordersCount: afternoonPaidOrders.length,
                      actualRevenue: afternoonActual,
                      cash: afternoonCash,
                      transfer: afternoonTransfer,
                      restockCost: afternoonRestockCost,
                      netCash: afternoonNetCash,
                      discount: afternoonDiscount
                    }
                  }
                }, repStartDate, repEndDate)}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition border border-red-200 flex items-center space-x-1.5 shadow-sm"
              >
                📄 <span>Xuất PDF Doanh Thu</span>
              </button>
            </div>
          </div>

          {/* Dashboard Metrics (Tài chính tổng quan) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">DOANH THU THUẦN</span>
                <h4 className="font-black text-xl text-coffee-primary">{actualRevenue.toLocaleString('vi-VN')}đ</h4>
                <p className="text-[10px] text-coffee-medium">Doanh thu gốc: <strong>{grossRevenue.toLocaleString('vi-VN')}đ</strong></p>
              </div>
              <div className="p-3 bg-green-50 rounded-2xl text-green-700">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">TỔNG GIẢM GIÁ</span>
                <h4 className="font-black text-xl text-red-600">
                  {totalDiscount > 0 ? `-${totalDiscount.toLocaleString('vi-VN')}đ` : '0đ'}
                </h4>
                <p className="text-[10px] text-coffee-medium">
                  {grossRevenue > 0 && totalDiscount > 0 ? `Chiếm ${((totalDiscount / grossRevenue) * 100).toFixed(1)}% doanh thu gốc` : 'Không có chiết khấu'}
                </p>
              </div>
              <div className="p-3 bg-red-50 rounded-2xl text-red-700">
                <Tag className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">TỔNG GIÁ VỐN (COGS)</span>
                <h4 className="font-black text-xl text-amber-700">{totalCOGS.toLocaleString('vi-VN')}đ</h4>
                <p className="text-[10px] text-coffee-medium">Định lượng nguyên liệu</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-2xl text-amber-700">
                <TrendingUp className="w-6 h-6 rotate-180" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">LỢI NHUẬN GỘP</span>
                <h4 className="font-black text-xl text-emerald-700">{(actualRevenue - totalCOGS).toLocaleString('vi-VN')}đ</h4>
                <p className="text-[10px] text-coffee-medium">Doanh thu thuần - COGS</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-700">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">CHI PHÍ VẬN HÀNH</span>
                <h4 className="font-black text-xl text-red-600">-{totalExpenses.toLocaleString('vi-VN')}đ</h4>
                <p className="text-[10px] text-coffee-medium">{rangeExpenses.length} khoản chi ngoài</p>
              </div>
              <div className="p-3 bg-red-50 rounded-2xl text-red-700">
                <TrendingUp className="w-6 h-6 rotate-180" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex items-center justify-between shadow-sm">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-coffee-medium uppercase tracking-wider">LỢI NHUẬN RÒNG</span>
                <h4 className={`font-black text-xl ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {netProfit.toLocaleString('vi-VN')}đ
                </h4>
                <p className="text-[10px] text-coffee-medium">Lãi thực tế sau chi phí</p>
              </div>
              <div className={`p-3 rounded-2xl ${netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* ⭐ PHÂN TÍCH & ĐỐI SOÁT DÒNG TIỀN THEO 2 CA (☀️ CA SÁNG vs 🌙 CA CHIỀU) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-coffee-dark uppercase tracking-wider flex items-center gap-2">
                <span>⏱️ Đối Soát Doanh Thu & Dòng Tiền Theo Ca</span>
              </h4>
              <span className="text-xs text-coffee-medium">
                Ca sáng: <strong>06:30 - 12:00</strong> • Ca chiều: <strong>12:00 - 17:30</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* THẺ CA SÁNG */}
              <div className={`bg-gradient-to-br from-amber-50/40 via-white to-amber-50/20 p-6 rounded-3xl border shadow-sm space-y-5 transition ${
                repShiftFilter === 'morning' ? 'border-amber-500 ring-2 ring-amber-400/30' : 'border-amber-200/80'
              }`}>
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg font-bold shadow-xs">
                      ☀️
                    </div>
                    <div>
                      <h4 className="font-black text-base text-amber-950">CA SÁNG</h4>
                      <span className="text-[11px] font-bold text-amber-700/80">Khung giờ: 06:30 - 12:00</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-900">
                      {morningPaidOrders.length} đơn hàng
                    </span>
                  </div>
                </div>

                {/* Doanh thu thực thu ca sáng */}
                <div className="flex items-baseline justify-between bg-white p-4 rounded-2xl border border-amber-200/60 shadow-xs">
                  <span className="text-xs font-bold text-coffee-medium">Doanh thu thực thu:</span>
                  <span className="font-black text-2xl text-amber-900 font-mono">
                    {morningActual.toLocaleString('vi-VN')}đ
                  </span>
                </div>

                {/* Phân bổ Tiền mặt vs Chuyển khoản */}
                <div className="space-y-3 bg-white/80 p-4 rounded-2xl border border-amber-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                      💵 Tiền mặt thu:
                    </span>
                    <span className="font-extrabold text-amber-900">
                      {morningCash.toLocaleString('vi-VN')}đ ({morningActual > 0 ? Math.round((morningCash / morningActual) * 100) : 0}%)
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                      💳 Chuyển khoản (QR):
                    </span>
                    <span className="font-extrabold text-blue-900">
                      {morningTransfer.toLocaleString('vi-VN')}đ ({morningActual > 0 ? Math.round((morningTransfer / morningActual) * 100) : 0}%)
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                      🏷️ Tổng giảm giá:
                    </span>
                    <span className="font-extrabold text-red-600">
                      {morningDiscount > 0 ? `-${morningDiscount.toLocaleString('vi-VN')}đ` : '0đ'}
                    </span>
                  </div>

                  {/* Progress Bar Phân Bổ */}
                  <div className="w-full bg-amber-100/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-amber-600 h-full transition-all duration-500" 
                      style={{ width: `${morningActual > 0 ? (morningCash / morningActual) * 100 : 0}%` }}
                      title="Tiền mặt"
                    />
                    <div 
                      className="bg-blue-500 h-full transition-all duration-500" 
                      style={{ width: `${morningActual > 0 ? (morningTransfer / morningActual) * 100 : 0}%` }}
                      title="Chuyển khoản"
                    />
                  </div>

                  {/* Chi phí nhập kho trong ca */}
                  <div className="pt-2 border-t border-amber-100 flex justify-between items-center text-xs">
                    <span className="text-coffee-medium font-semibold">📦 Chi phí nhập kho ca sáng:</span>
                    <span className="font-extrabold text-red-600">
                      -{morningRestockCost.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>

                {/* KHUNG TIỀN MẶT BÀN GIAO KÉT CA SÁNG */}
                <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-100 block">
                      Tiền mặt thực tế bàn giao (Két Ca Sáng)
                    </span>
                    <span className="text-[11px] text-amber-100/80 font-medium">
                      (= Tiền mặt thu - Chi phí nhập)
                    </span>
                  </div>
                  <span className="text-xl font-black font-mono">
                    {morningNetCash.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              {/* THẺ CA CHIỀU */}
              <div className={`bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/20 p-6 rounded-3xl border shadow-sm space-y-5 transition ${
                repShiftFilter === 'afternoon' ? 'border-indigo-500 ring-2 ring-indigo-400/30' : 'border-indigo-200/80'
              }`}>
                <div className="flex items-center justify-between border-b border-indigo-200/60 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-800 flex items-center justify-center text-lg font-bold shadow-xs">
                      🌙
                    </div>
                    <div>
                      <h4 className="font-black text-base text-indigo-950">CA CHIỀU</h4>
                      <span className="text-[11px] font-bold text-indigo-700/80">Khung giờ: 12:00 - 17:30</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900">
                      {afternoonPaidOrders.length} đơn hàng
                    </span>
                  </div>
                </div>

                {/* Doanh thu thực thu ca chiều */}
                <div className="flex items-baseline justify-between bg-white p-4 rounded-2xl border border-indigo-200/60 shadow-xs">
                  <span className="text-xs font-bold text-coffee-medium">Doanh thu thực thu:</span>
                  <span className="font-black text-2xl text-indigo-900 font-mono">
                    {afternoonActual.toLocaleString('vi-VN')}đ
                  </span>
                </div>

                {/* Phân bổ Tiền mặt vs Chuyển khoản */}
                <div className="space-y-3 bg-white/80 p-4 rounded-2xl border border-indigo-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                      💵 Tiền mặt thu:
                    </span>
                    <span className="font-extrabold text-indigo-900">
                      {afternoonCash.toLocaleString('vi-VN')}đ ({afternoonActual > 0 ? Math.round((afternoonCash / afternoonActual) * 100) : 0}%)
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                      💳 Chuyển khoản (QR):
                    </span>
                    <span className="font-extrabold text-blue-900">
                      {afternoonTransfer.toLocaleString('vi-VN')}đ ({afternoonActual > 0 ? Math.round((afternoonTransfer / afternoonActual) * 100) : 0}%)
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-coffee-dark flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                      🏷️ Tổng giảm giá:
                    </span>
                    <span className="font-extrabold text-red-600">
                      {afternoonDiscount > 0 ? `-${afternoonDiscount.toLocaleString('vi-VN')}đ` : '0đ'}
                    </span>
                  </div>

                  {/* Progress Bar Phân Bổ */}
                  <div className="w-full bg-indigo-100/60 h-2.5 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-500" 
                      style={{ width: `${afternoonActual > 0 ? (afternoonCash / afternoonActual) * 100 : 0}%` }}
                      title="Tiền mặt"
                    />
                    <div 
                      className="bg-blue-500 h-full transition-all duration-500" 
                      style={{ width: `${afternoonActual > 0 ? (afternoonTransfer / afternoonActual) * 100 : 0}%` }}
                      title="Chuyển khoản"
                    />
                  </div>

                  {/* Chi phí nhập kho trong ca */}
                  <div className="pt-2 border-t border-indigo-100 flex justify-between items-center text-xs">
                    <span className="text-coffee-medium font-semibold">📦 Chi phí nhập kho ca chiều:</span>
                    <span className="font-extrabold text-red-600">
                      -{afternoonRestockCost.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>

                {/* KHUNG TIỀN MẶT BÀN GIAO KÉT CA CHIỀU */}
                <div className="p-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-100 block">
                      Tiền mặt thực tế bàn giao (Két Ca Chiều)
                    </span>
                    <span className="text-[11px] text-indigo-100/80 font-medium">
                      (= Tiền mặt thu - Chi phí nhập)
                    </span>
                  </div>
                  <span className="text-xl font-black font-mono">
                    {afternoonNetCash.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ⭐ BẢNG ĐỐI CHIẾU DÒNG TIỀN TỪNG NGÀY THEO CA */}
          <div className="bg-white p-6 rounded-3xl border border-coffee-light shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-coffee-light/60 pb-3">
              <div>
                <h4 className="font-bold text-sm text-coffee-dark uppercase tracking-wider flex items-center gap-2">
                  <span>🗓️ Bảng Đối Chiếu Dòng Tiền Từng Ngày Theo Ca</span>
                </h4>
                <p className="text-xs text-coffee-medium mt-0.5">
                  Chi tiết doanh thu, tiền mặt, chuyển khoản và chi phí theo từng ngày để dễ dàng đối soát với nhân viên.
                </p>
              </div>
              <button
                onClick={() => setShowDailyBreakdown(!showDailyBreakdown)}
                className="px-3 py-1.5 bg-[#FAF6F0] hover:bg-coffee-light/30 text-coffee-dark text-xs font-bold rounded-xl transition border border-coffee-light flex items-center space-x-1 self-start sm:self-auto cursor-pointer"
              >
                <span>{showDailyBreakdown ? 'Thu gọn bảng' : 'Xem chi tiết bảng'}</span>
                <span>{showDailyBreakdown ? '▲' : '▼'}</span>
              </button>
            </div>

            {showDailyBreakdown && (
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full text-xs text-left min-w-[750px]">
                  <thead>
                    <tr className="border-b border-coffee-light text-coffee-medium font-bold uppercase bg-[#FAF6F0]/60">
                      <th className="py-2.5 px-3 rounded-l-xl">Ngày</th>
                      <th className="py-2.5 px-3 text-center bg-amber-50/70 text-amber-900 border-l border-amber-200/50" colSpan={3}>
                        ☀️ CA SÁNG (06:30-12:00)
                      </th>
                      <th className="py-2.5 px-3 text-center bg-indigo-50/70 text-indigo-900 border-l border-indigo-200/50" colSpan={3}>
                        🌙 CA CHIỀU (12:00-17:30)
                      </th>
                      <th className="py-2.5 px-3 text-right border-l border-coffee-light rounded-r-xl bg-green-50/50 text-green-900" colSpan={3}>
                        TỔNG NGÀY
                      </th>
                    </tr>
                    <tr className="border-b border-coffee-light/80 text-[10px] font-bold text-coffee-medium uppercase bg-[#FAF6F0]/30">
                      <th className="py-2 px-3"></th>
                      {/* Ca Sáng */}
                      <th className="py-2 px-2 text-right bg-amber-50/30 text-amber-800">Doanh thu</th>
                      <th className="py-2 px-2 text-right bg-amber-50/30 text-amber-800">Tiền mặt</th>
                      <th className="py-2 px-2 text-right bg-amber-50/30 text-blue-700">Chuyển khoản</th>
                      {/* Ca Chiều */}
                      <th className="py-2 px-2 text-right bg-indigo-50/30 text-indigo-800">Doanh thu</th>
                      <th className="py-2 px-2 text-right bg-indigo-50/30 text-indigo-800">Tiền mặt</th>
                      <th className="py-2 px-2 text-right bg-indigo-50/30 text-blue-700">Chuyển khoản</th>
                      {/* Tổng ngày */}
                      <th className="py-2 px-2 text-right bg-green-50/20 text-red-600 font-extrabold">Giảm giá</th>
                      <th className="py-2 px-2 text-right bg-green-50/20 text-coffee-dark font-extrabold">Tổng DT</th>
                      <th className="py-2 px-3 text-right bg-green-50/20 text-emerald-800 font-extrabold">TM Két Ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-coffee-light/50">
                    {dailyReportRows.map((row) => (
                      <tr key={row.date} className="hover:bg-coffee-light/15 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-coffee-dark font-mono">
                          {new Date(row.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                        </td>
                        {/* Ca sáng */}
                        <td className="py-2.5 px-2 text-right font-semibold text-amber-950 font-mono">
                          {row.morningActual > 0 ? `${row.morningActual.toLocaleString('vi-VN')}đ` : '-'}
                          {row.morningCount > 0 && <span className="text-[9px] text-coffee-medium ml-1 font-normal">({row.morningCount})</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-amber-800 font-mono">
                          {row.morningCash > 0 ? `${row.morningCash.toLocaleString('vi-VN')}đ` : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-blue-600 font-mono">
                          {row.morningTransfer > 0 ? `${row.morningTransfer.toLocaleString('vi-VN')}đ` : '-'}
                        </td>
                        {/* Ca chiều */}
                        <td className="py-2.5 px-2 text-right font-semibold text-indigo-950 font-mono">
                          {row.afternoonActual > 0 ? `${row.afternoonActual.toLocaleString('vi-VN')}đ` : '-'}
                          {row.afternoonCount > 0 && <span className="text-[9px] text-coffee-medium ml-1 font-normal">({row.afternoonCount})</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-indigo-800 font-mono">
                          {row.afternoonCash > 0 ? `${row.afternoonCash.toLocaleString('vi-VN')}đ` : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-blue-600 font-mono">
                          {row.afternoonTransfer > 0 ? `${row.afternoonTransfer.toLocaleString('vi-VN')}đ` : '-'}
                        </td>
                        {/* Tổng ngày */}
                        <td className="py-2.5 px-2 text-right font-semibold text-red-600 font-mono bg-green-50/10">
                          {row.totalDiscount > 0 ? `-${row.totalDiscount.toLocaleString('vi-VN')}đ` : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-black text-coffee-primary font-mono bg-green-50/20">
                          {row.totalRevenue.toLocaleString('vi-VN')}đ
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700 font-mono bg-green-50/20">
                          {row.totalNetCash.toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    ))}

                    {dailyReportRows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-coffee-medium/60 italic">
                          Không có dữ liệu giao dịch trong khoảng thời gian này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {dailyReportRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-coffee-primary/30 font-black text-xs bg-[#FAF6F0]">
                        <td className="py-3 px-3 uppercase text-coffee-dark">TỔNG CỘNG</td>
                        {/* Tổng Sáng */}
                        <td className="py-3 px-2 text-right text-amber-950 font-mono">{morningActual.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right text-amber-800 font-mono">{morningCash.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right text-blue-700 font-mono">{morningTransfer.toLocaleString('vi-VN')}đ</td>
                        {/* Tổng Chiều */}
                        <td className="py-3 px-2 text-right text-indigo-950 font-mono">{afternoonActual.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right text-indigo-800 font-mono">{afternoonCash.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-2 text-right text-blue-700 font-mono">{afternoonTransfer.toLocaleString('vi-VN')}đ</td>
                        {/* Tổng Ngày */}
                        <td className="py-3 px-2 text-right text-red-600 font-mono">
                          {totalDiscount > 0 ? `-${totalDiscount.toLocaleString('vi-VN')}đ` : '0đ'}
                        </td>
                        <td className="py-3 px-2 text-right text-coffee-primary font-mono">{actualRevenue.toLocaleString('vi-VN')}đ</td>
                        <td className="py-3 px-3 text-right text-emerald-800 font-mono">
                          {Math.max(0, totalCash - totalRestockCosts).toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Chi tiết chi phí nhập kho */}
          <div className="bg-white p-6 rounded-3xl border border-coffee-light shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-coffee-dark uppercase tracking-wider">Chi Tiết Chi Phí Nhập Kho</h4>
              <span className="text-xs text-coffee-medium">Tổng tiền nhập: <strong className="text-red-600">-{totalRestockCosts.toLocaleString('vi-VN')}đ</strong></span>
            </div>

            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-coffee-light text-coffee-medium font-bold uppercase">
                    <th className="py-2">Ngày</th>
                    <th className="py-2">Ca</th>
                    <th className="py-2">Nguyên liệu</th>
                    <th className="py-2">Ghi chú/Lý do</th>
                    <th className="py-2 text-right">Chi phí</th>
                    <th className="py-2 text-center w-24">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-coffee-light/50">
                  {rangeRestockLogs.map((log) => {
                    const isMorn = isMorningOrder(log.created_at);
                    return (
                      <tr key={log.id} className="hover:bg-coffee-light/10 transition-colors">
                        <td className="py-2.5 text-coffee-medium font-medium">
                          {new Date(log.created_at).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            isMorn ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {isMorn ? '☀️ Sáng' : '🌙 Chiều'}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-coffee-dark">
                          {log.ingredient_name}
                        </td>
                        <td className="py-2.5 text-coffee-medium italic">
                          {log.note || 'Nhập kho'}
                        </td>
                        <td className="py-2.5 text-right font-extrabold text-red-600 font-mono">
                          -{Number(log.cost || 0).toLocaleString('vi-VN')}đ
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            onClick={() => handleOpenEditRestockModal(log)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200 transition flex items-center space-x-1 mx-auto cursor-pointer"
                            title="Sửa giá nhập kho cho phiếu này"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Sửa giá</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {rangeRestockLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-coffee-medium/60 italic">
                        Không phát sinh chi phí nhập kho nào trong khoảng thời gian này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Danh sách giao dịch bán hàng đã thanh toán */}
          <div className="bg-white p-6 rounded-3xl border border-coffee-light shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-coffee-light/60 pb-3">
              <div>
                <h4 className="font-bold text-sm text-coffee-dark uppercase tracking-wider">Lịch sử giao dịch bán hàng</h4>
                <span className="text-xs text-coffee-medium">
                  Hiển thị <strong>{filteredPaidOrders.length}</strong> / {paidOrders.length} đơn
                  {repShiftFilter !== 'all' && ` (Đang lọc: ${repShiftFilter === 'morning' ? '☀️ Ca Sáng' : '🌙 Ca Chiều'})`}
                  {repPayFilter !== 'all' && ` • Hình thức: ${repPayFilter}`}
                </span>
              </div>

              {/* Lọc nhanh theo Hình thức thanh toán */}
              <div className="flex items-center gap-1.5 bg-[#FAF6F0] p-1 rounded-xl border border-coffee-light/60 text-xs">
                <button
                  onClick={() => setRepPayFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                    repPayFilter === 'all' ? 'bg-coffee-primary text-white' : 'text-coffee-medium hover:text-coffee-dark'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  onClick={() => setRepPayFilter('Tiền mặt')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                    repPayFilter === 'Tiền mặt' ? 'bg-amber-600 text-white' : 'text-amber-800 hover:bg-amber-100/50'
                  }`}
                >
                  💵 Tiền mặt
                </button>
                <button
                  onClick={() => setRepPayFilter('Chuyển khoản')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                    repPayFilter === 'Chuyển khoản' ? 'bg-blue-600 text-white' : 'text-blue-800 hover:bg-blue-100/50'
                  }`}
                >
                  💳 Chuyển khoản
                </button>
              </div>
            </div>
            
            {(() => {
              const repItemsPerPage = 10;
              const totalDisplayCount = filteredPaidOrders.length;
              const repTotalPages = Math.ceil(totalDisplayCount / repItemsPerPage);
              const repStartIndex = (repCurrentPage - 1) * repItemsPerPage;
              const repDisplayedOrders = filteredPaidOrders.slice(repStartIndex, repStartIndex + repItemsPerPage);

              return (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-coffee-light text-coffee-medium font-bold">
                          <th className="py-2">Mã đơn</th>
                          <th className="py-2">Thời gian & Ca</th>
                          <th className="py-2">Bàn</th>
                          <th className="py-2">Thanh toán</th>
                          <th className="py-2 text-right">Giảm giá</th>
                          <th className="py-2 text-right">Tổng tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-light/50">
                        {repDisplayedOrders.map((order) => {
                          const isExpanded = repExpandedOrderId === order.id;
                          const orderTime = order.paid_at || order.created_at;
                          const isMorn = isMorningOrder(orderTime);
                          const d = new Date(orderTime);
                          const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                          const dateStr = d.toLocaleDateString('vi-VN');

                          return (
                            <React.Fragment key={order.id}>
                              <tr 
                                onClick={() => setRepExpandedOrderId(isExpanded ? null : order.id)}
                                className="hover:bg-[#FAF6F0]/70 cursor-pointer transition select-none"
                              >
                                <td className="py-2.5 font-mono text-[10px] text-coffee-medium font-bold">
                                  #{order.id.substring(0, 8).toUpperCase()}
                                  <span className="text-[9px] text-coffee-primary ml-1.5 font-normal">
                                    {isExpanded ? '▲' : '▼'}
                                  </span>
                                </td>
                                <td className="py-2.5 text-coffee-medium font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                                      isMorn ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                                    }`}>
                                      {isMorn ? '☀️ Sáng' : '🌙 Chiều'}
                                    </span>
                                    <span>{dateStr} <strong className="text-coffee-dark font-mono">{timeStr}</strong></span>
                                  </div>
                                </td>
                                <td className="py-2.5 font-semibold text-coffee-dark">{order.tables?.table_name || 'Mang về'}</td>
                                <td className="py-2.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    order.payment_method === 'Tiền mặt' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {order.payment_method}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right font-medium text-red-600 font-mono">
                                  {Number(order.discount || 0) > 0 ? `-${Number(order.discount).toLocaleString('vi-VN')}đ` : '-'}
                                </td>
                                <td className="py-2.5 text-right font-extrabold text-coffee-primary font-mono">{Number(order.total_amount || 0).toLocaleString('vi-VN')}đ</td>
                              </tr>

                              {/* Hàng mở rộng chi tiết món ăn */}
                              {isExpanded && (
                                <tr>
                                  <td colSpan={6} className="p-0 border-b border-coffee-light bg-[#FAF6F0]/30">
                                    <div className="p-4 m-2 rounded-2xl bg-white border border-coffee-light/60 space-y-3 shadow-xs">
                                      <div className="flex justify-between items-center text-xs border-b border-coffee-light/40 pb-2">
                                        <span className="font-bold text-coffee-dark uppercase tracking-wider text-[10px]">
                                          Chi tiết món ăn (#{order.id.substring(0, 8).toUpperCase()})
                                        </span>
                                        <span className="text-coffee-medium text-[11px]">
                                          Bàn: <strong>{order.tables?.table_name || 'Mang về'}</strong> • Thu ngân: <strong>{order.users?.full_name || 'Admin'}</strong>
                                        </span>
                                      </div>

                                      {repLoadingExpandedItems ? (
                                        <div className="py-3 flex justify-center">
                                          <Loader2 className="w-5 h-5 text-coffee-primary animate-spin" />
                                        </div>
                                      ) : repExpandedOrderItems.length === 0 ? (
                                        <p className="text-xs text-coffee-medium italic py-1">Không có chi tiết sản phẩm.</p>
                                      ) : (
                                        <div className="space-y-2 divide-y divide-coffee-light/30">
                                          {repExpandedOrderItems.map((item, idx) => (
                                            <div key={item.id || idx} className="flex justify-between items-center text-xs pt-2 first:pt-0">
                                              <div className="space-y-0.5">
                                                <span className="text-coffee-dark font-medium">
                                                  {item.products?.name || item.ten_san_pham || 'Sản phẩm'} <span className="text-coffee-medium font-bold">x{item.quantity}</span>
                                                </span>
                                                {item.ghi_chu && item.ghi_chu.replace(/\[Ghi chú đơn:[^\]]+\]/g, '').trim() && (
                                                  <p className="text-[10px] text-amber-700 italic">
                                                    📝 {item.ghi_chu.replace(/\[Ghi chú đơn:[^\]]+\]/g, '').trim()}
                                                  </p>
                                                )}
                                              </div>
                                              <span className="font-bold text-coffee-dark">
                                                {Number(item.subtotal || (item.quantity * (item.unit_price || item.products?.price || 0))).toLocaleString('vi-VN')}đ
                                              </span>
                                            </div>
                                          ))}

                                          <div className="flex justify-between items-center font-extrabold text-coffee-primary pt-2.5 text-xs">
                                            <span>Tổng tiền thanh toán:</span>
                                            <span className="font-mono text-sm">{Number(order.total_amount || 0).toLocaleString('vi-VN')}đ</span>
                                          </div>
                                          {order.discount > 0 && (
                                            <div className="flex justify-between items-center text-red-600 font-bold text-xs pt-1">
                                              <span>Giảm giá:</span>
                                              <span>-{Number(order.discount).toLocaleString('vi-VN')}đ</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {filteredPaidOrders.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-coffee-medium/60 italic">
                              Không tìm thấy đơn hàng nào phù hợp với bộ lọc hiện tại.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Điều khiển phân trang thông minh (rút gọn nếu nhiều trang) */}
                  {repTotalPages > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-3 border-t border-coffee-light/40">
                      <button
                        onClick={() => setRepCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={repCurrentPage === 1}
                        className="px-2.5 py-1.5 rounded-lg border border-coffee-light text-coffee-medium hover:bg-[#FAF6F0] disabled:opacity-40 text-[10px] font-bold transition cursor-pointer"
                      >
                        Trước
                      </button>

                      {(() => {
                        const getPageItems = () => {
                          if (repTotalPages <= 7) {
                            return Array.from({ length: repTotalPages }, (_, i) => i + 1);
                          }
                          const items: (number | string)[] = [];
                          if (repCurrentPage <= 4) {
                            items.push(1, 2, 3, 4, 5, '...', repTotalPages);
                          } else if (repCurrentPage >= repTotalPages - 3) {
                            items.push(1, '...', repTotalPages - 4, repTotalPages - 3, repTotalPages - 2, repTotalPages - 1, repTotalPages);
                          } else {
                            items.push(1, '...', repCurrentPage - 1, repCurrentPage, repCurrentPage + 1, '...', repTotalPages);
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
                              onClick={() => setRepCurrentPage(pageNum)}
                              className={`min-w-[28px] h-7 px-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                repCurrentPage === pageNum
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
                        onClick={() => setRepCurrentPage(prev => Math.min(repTotalPages, prev + 1))}
                        disabled={repCurrentPage === repTotalPages}
                        className="px-2.5 py-1.5 rounded-lg border border-coffee-light text-coffee-medium hover:bg-[#FAF6F0] disabled:opacity-40 text-[10px] font-bold transition cursor-pointer"
                      >
                        Sau
                      </button>

                      {repTotalPages > 7 && (
                        <select
                          value={repCurrentPage}
                          onChange={(e) => setRepCurrentPage(Number(e.target.value))}
                          className="h-7 px-1.5 bg-[#FAF6F0] border border-coffee-light text-coffee-dark text-[10px] font-bold rounded-lg ml-1 focus:ring-1 focus:ring-coffee-primary outline-none"
                        >
                          {Array.from({ length: repTotalPages }, (_, i) => i + 1).map(p => (
                            <option key={p} value={p}>Trang {p}/{repTotalPages}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 2.5. TAB BÁO CÁO BÁN HÀNG (SẢN PHẨM & LY) */}
      {adminTab === 'sales' && (() => {
        const filteredSales = sortedSales.filter((item: any) => {
          if (salesTypeTab === 'all') return true;
          if (salesTypeTab === 'takeaway') return item.isTakeaway;
          return !item.isTakeaway;
        });
        const totalFilteredQty = filteredSales.reduce((acc: number, item: any) => acc + item.quantity, 0);
        const totalFilteredRevenue = filteredSales.reduce((acc: number, item: any) => acc + item.subtotal, 0);

        return (
          <div className="space-y-6">
            {/* Bộ lọc khoảng ngày & Phân loại hình thức */}
            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3.5 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-coffee-medium">Từ ngày:</span>
                  <input
                    type="date"
                    value={repStartDate}
                    onChange={(e) => setRepStartDate(e.target.value)}
                    className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-coffee-medium">Đến ngày:</span>
                  <input
                    type="date"
                    value={repEndDate}
                    onChange={(e) => setRepEndDate(e.target.value)}
                    className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                  />
                </div>
              </div>

              {/* Tabs Lọc: Tất cả món / Tại quán / Mang đi */}
              <div className="flex flex-wrap items-center gap-2 bg-[#FAF6F0] p-1.5 rounded-2xl border border-coffee-light/60">
                <button
                  onClick={() => setSalesTypeTab('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                    salesTypeTab === 'all'
                      ? 'bg-coffee-primary text-white shadow-sm'
                      : 'text-coffee-medium hover:text-coffee-dark hover:bg-white/60'
                  }`}
                >
                  <span>🌟 Tất cả món</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    salesTypeTab === 'all' ? 'bg-white/20 text-white' : 'bg-coffee-light/40 text-coffee-dark'
                  }`}>
                    {sortedSales.length}
                  </span>
                </button>

                <button
                  onClick={() => setSalesTypeTab('dinein')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                    salesTypeTab === 'dinein'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-blue-800 hover:bg-blue-100/60'
                  }`}
                >
                  <span>🪑 Tại quán</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    salesTypeTab === 'dinein' ? 'bg-white/20 text-white' : 'bg-blue-200/70 text-blue-900'
                  }`}>
                    {sortedSales.filter((i: any) => !i.isTakeaway).length}
                  </span>
                </button>

                <button
                  onClick={() => setSalesTypeTab('takeaway')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center space-x-1.5 ${
                    salesTypeTab === 'takeaway'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-amber-800 hover:bg-amber-100/60'
                  }`}
                >
                  <span>🛵 Mang đi</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    salesTypeTab === 'takeaway' ? 'bg-white/20 text-white' : 'bg-amber-200/70 text-amber-900'
                  }`}>
                    {sortedSales.filter((i: any) => i.isTakeaway).length}
                  </span>
                </button>
              </div>
            </div>

            {/* Header Báo Cáo Bán Hàng */}
            <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
              <div>
                <h3 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">🛍️ Báo cáo Bán hàng & Sử dụng ly</h3>
                <p className="text-xs text-coffee-medium mt-1">Thống kê chi tiết từng dòng món ăn Tại quán và Mang đi từ <strong>{new Date(repStartDate).toLocaleDateString('vi-VN')}</strong> đến <strong>{new Date(repEndDate).toLocaleDateString('vi-VN')}</strong>.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => exportProductSalesToExcel({
                    totalLy, lyDen, lyTrang, lyHoaVan, sortedSales: filteredSales
                  }, repStartDate, repEndDate)}
                  className="px-3.5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-xl transition border border-green-200 flex items-center space-x-1.5 shadow-sm"
                >
                  📊 <span>Xuất Excel Bán Hàng</span>
                </button>
                <button
                  onClick={() => exportProductSalesToPDF({
                    totalLy, lyDen, lyTrang, lyHoaVan, sortedSales: filteredSales
                  }, repStartDate, repEndDate)}
                  className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition border border-red-200 flex items-center space-x-1.5 shadow-sm"
                >
                  📄 <span>Xuất PDF Bán Hàng</span>
                </button>
              </div>
            </div>

            {/* Grid Thống Kê Các Loại Ly */}
            <div className="bg-white p-6 rounded-3xl border border-coffee-light shadow-sm space-y-4">
              <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider flex items-center justify-between border-b border-coffee-light pb-2.5">
                <span>🥤 Thống kê các loại ly đã sử dụng</span>
                <span className="text-xs text-coffee-medium">Tổng số: <strong>{totalLy} ly</strong></span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#FAF6F0] p-5 rounded-2xl border border-coffee-light/60">
                <div className="text-center space-y-1">
                  <span className="text-[10px] text-coffee-medium uppercase font-bold block">Tổng số ly</span>
                  <span className="font-black text-xl text-coffee-primary">{totalLy}</span>
                </div>
                <div className="text-center space-y-1 border-l border-coffee-light/60">
                  <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Đen AVA</span>
                  <span className="font-black text-xl text-coffee-dark">{lyDen}</span>
                </div>
                <div className="text-center space-y-1 border-l border-coffee-light/60">
                  <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Trắng AVA</span>
                  <span className="font-black text-xl text-coffee-dark">{lyTrang}</span>
                </div>
                <div className="text-center space-y-1 border-l border-coffee-light/60">
                  <span className="text-[10px] text-coffee-medium uppercase font-bold block">Ly Hoa Văn</span>
                  <span className="font-black text-xl text-coffee-dark">{lyHoaVan}</span>
                </div>
              </div>
            </div>

            {/* Bảng liệt kê chi tiết các món ăn bán ra (Phân tách Tại quán / Mang đi) */}
            <div className="bg-white p-6 rounded-3xl border border-coffee-light shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-coffee-light pb-2.5">
                <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
                  📋 Danh sách món ăn bán ra ({salesTypeTab === 'all' ? 'Tất cả' : salesTypeTab === 'takeaway' ? 'Mang đi' : 'Tại quán'})
                </h4>
                <span className="text-xs font-bold text-coffee-medium">
                  {totalFilteredQty} ly • <strong className="text-coffee-primary">{totalFilteredRevenue.toLocaleString('vi-VN')}đ</strong>
                </span>
              </div>

              {filteredSales.length === 0 ? (
                <p className="text-xs text-coffee-medium/70 italic text-center py-8">Không có dữ liệu món ăn bán ra trong nhóm này.</p>
              ) : (
                <div className="overflow-x-auto border border-coffee-light rounded-2xl bg-white shadow-sm">
                  <table className="w-full text-xs text-left min-w-[550px]">
                    <thead>
                      <tr className="bg-[#FAF6F0] text-coffee-medium font-bold border-b border-coffee-light/60 uppercase tracking-wider text-[10px] whitespace-nowrap">
                        <th className="p-3.5 w-12 text-center">STT</th>
                        <th className="p-3.5">Tên món</th>
                        <th className="p-3.5 text-center">Hình thức</th>
                        <th className="p-3.5 text-center">Số lượng</th>
                        <th className="p-3.5 text-right">Đơn giá</th>
                        <th className="p-3.5 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-coffee-light/50">
                      {filteredSales.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="hover:bg-[#FAF6F0]/20 transition whitespace-nowrap">
                          <td className="p-3.5 text-center text-coffee-medium font-bold">{idx + 1}</td>
                          <td className="p-3.5 font-extrabold text-coffee-dark">
                            <span>{item.name}</span>
                          </td>
                          <td className="p-3.5 text-center">
                            {item.isTakeaway ? (
                              <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg text-[10px]">
                                🛵 Mang đi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg text-[10px]">
                                🪑 Tại quán
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-extrabold text-coffee-primary bg-coffee-accent/25 px-2.5 py-0.5 rounded-lg text-[11px] whitespace-nowrap">
                              {item.quantity} ly
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-medium text-coffee-medium">
                            {item.price.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="p-3.5 text-right font-black text-coffee-primary">
                            {item.subtotal.toLocaleString('vi-VN')}đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#FAF6F0]/80 font-bold border-t-2 border-coffee-light text-coffee-dark text-xs">
                        <td colSpan={3} className="p-3.5 uppercase tracking-wider text-coffee-medium">
                          TỔNG CỘNG ({salesTypeTab === 'all' ? 'TẤT CẢ MÓN' : salesTypeTab === 'takeaway' ? 'MANG ĐI' : 'TẠI QUÁN'}):
                        </td>
                        <td className="p-3.5 text-center font-black text-coffee-primary text-sm">
                          {totalFilteredQty} ly
                        </td>
                        <td className="p-3.5 text-right text-coffee-medium">
                          -
                        </td>
                        <td className="p-3.5 text-right font-black text-coffee-primary text-sm">
                          {totalFilteredRevenue.toLocaleString('vi-VN')}đ
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 2.5 TAB BÁO CÁO KHO THEO KHOẢNG NGÀY */}
      {adminTab === 'inventory' && (
        <div className="space-y-6">
          {/* Bộ lọc khoảng ngày & tìm kiếm */}
          <div className="bg-white p-5 rounded-3xl border border-coffee-light shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Từ ngày:</span>
                <input
                  type="date"
                  value={invStartDate}
                  onChange={(e) => setInvStartDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Đến ngày:</span>
                <input
                  type="date"
                  value={invEndDate}
                  onChange={(e) => setInvEndDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
            </div>
            
            <input
              type="text"
              placeholder="🔍 Tìm kiếm nguyên liệu..."
              value={invSearchQuery}
              onChange={(e) => setInvSearchQuery(e.target.value)}
              className="w-full md:w-64 h-10 px-4 bg-[#FAF6F0] rounded-xl text-xs border-none focus:ring-1 focus:ring-coffee-primary text-coffee-dark"
            />
          </div>

          {/* Tiêu đề báo cáo */}
          <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div>
              <h3 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">Thống kê nguyên liệu kho</h3>
              <p className="text-xs text-coffee-medium mt-1">
                Xem lượng tồn đầu kỳ ngày <strong>{new Date(invStartDate).toLocaleDateString('vi-VN')}</strong> đến lượng tồn thực tế cuối ngày <strong>{new Date(invEndDate).toLocaleDateString('vi-VN')}</strong>.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const rows = ingredients
                    .filter(ing => ing.name.toLowerCase().includes(invSearchQuery.toLowerCase()))
                    .map(ing => {
                      const { openingStock, endingStock, refilled, sold } = getHistoricalIngStats(ing);
                      return {
                        name: ing.name,
                        unit: ing.unit,
                        quy_cach: ing.quy_cach,
                        openingStock: formatIngredientStock(openingStock, ing.unit, ing.quy_cach),
                        refilled: refilled > 0 ? formatIngredientRefill(refilled, ing.unit, ing.quy_cach) : '-',
                        sold: sold > 0 ? `-${formatIngredientStock(sold, ing.unit, ing.quy_cach)}` : '-',
                        endingStock: formatIngredientStock(endingStock, ing.unit, ing.quy_cach)
                      };
                    });
                  exportInventoryToExcel(rows, invStartDate, invEndDate);
                }}
                className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold rounded-xl transition border border-green-200"
              >
                📊 Xuất Excel
              </button>
              <button
                onClick={() => {
                  const rows = ingredients
                    .filter(ing => ing.name.toLowerCase().includes(invSearchQuery.toLowerCase()))
                    .map(ing => {
                      const { openingStock, endingStock, refilled, sold } = getHistoricalIngStats(ing);
                      return {
                        name: ing.name,
                        unit: ing.unit,
                        quy_cach: ing.quy_cach,
                        openingStock: formatIngredientStock(openingStock, ing.unit, ing.quy_cach),
                        refilled: refilled > 0 ? formatIngredientRefill(refilled, ing.unit, ing.quy_cach) : '-',
                        sold: sold > 0 ? `-${formatIngredientStock(sold, ing.unit, ing.quy_cach)}` : '-',
                        endingStock: formatIngredientStock(endingStock, ing.unit, ing.quy_cach)
                      };
                    });
                  exportInventoryToPDF(rows, invStartDate, invEndDate);
                }}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold rounded-xl transition border border-red-200"
              >
                📄 Xuất PDF
              </button>
              <button
                onClick={handleOpenCreateIngredient}
                className="px-3 py-2 bg-coffee-primary hover:bg-coffee-dark text-white text-[10px] font-bold rounded-xl transition shadow flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm nguyên liệu</span>
              </button>
            </div>
          </div>

          {/* Bảng Excel-style Thống Kê Kho (Đồng bộ chuẩn giao diện Kho, tối ưu màn hình điện thoại) */}
          <div className="bg-white rounded-3xl border border-coffee-light shadow-sm overflow-hidden">
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full border-collapse text-left text-xs font-sans table-fixed min-w-[700px] bg-white">
                <thead>
                  <tr className="bg-[#FAF6F0] sticky top-0 z-20 border-b border-coffee-light">
                    <th className="p-3.5 w-28 sm:w-52 font-black text-coffee-dark bg-[#FAF6F0] sticky left-0 z-30 border-r border-coffee-light/60">
                      Tên nguyên liệu
                    </th>
                    <th className="p-3.5 w-24 sm:w-32 font-bold text-coffee-medium border-r border-coffee-light/60">
                      Tồn đầu kỳ
                    </th>
                    <th className="p-3.5 min-w-[140px] sm:w-48 font-bold text-green-700 border-r border-coffee-light/60">
                      SL nhập (+)
                    </th>
                    <th className="p-3.5 min-w-[160px] sm:w-56 font-bold text-red-600 border-r border-coffee-light/60">
                      SL xuất (-)
                    </th>
                    <th className="p-3.5 w-28 sm:w-40 font-black text-coffee-primary border-r border-coffee-light/60">
                      Tồn thực tế cuối kỳ
                    </th>
                    <th className="p-3.5 w-20 sm:w-24 text-center font-bold text-coffee-medium">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-coffee-light/50">
                  {ingredients
                    .filter(ing => ing.name.toLowerCase().includes(invSearchQuery.toLowerCase()))
                    .map((ing) => {
                      const { 
                        openingStock, 
                        endingStock, 
                        refilled, 
                        sold,
                        salesOnly,
                        lossLogs,
                        refundLogs,
                        restockLogs,
                        stocktakeGainLogs
                      } = getHistoricalIngStats(ing);
                      const isLowStock = ing.min_stock !== null && endingStock <= Number(ing.min_stock);
                      const formattedOpening = formatIngredientStock(openingStock, ing.unit, ing.quy_cach);
                      const formattedEnding = formatIngredientStock(endingStock, ing.unit, ing.quy_cach);
                      const formatRefill = refilled > 0 ? formatIngredientRefill(refilled, ing.unit, ing.quy_cach) : '-';
                      const formatSold = sold > 0 ? `-${formatIngredientStock(sold, ing.unit, ing.quy_cach)}` : '-';

                      return (
                        <tr 
                          key={ing.id} 
                          className={`hover:bg-coffee-light/20 transition-all ${
                            isLowStock ? 'bg-red-50/20' : ''
                          }`}
                        >
                          {/* Sticky First Column (w-28 trên điện thoại, sm:w-52 trên desktop) */}
                          <td className={`p-3 font-bold text-coffee-dark sticky left-0 z-10 border-r border-coffee-light/60 border-b border-coffee-light/40 w-28 sm:w-52 whitespace-normal break-words align-top ${
                            isLowStock ? 'bg-red-50/95' : 'bg-white'
                          }`}>
                            <div className="flex flex-col">
                              <span className="whitespace-normal break-words leading-tight">{ing.name}</span>
                              <span className="text-[10px] text-coffee-medium font-normal leading-tight mt-1">
                                ({ing.unit}{ing.quy_cach ? `, ${ing.quy_cach}` : ''})
                              </span>
                            </div>
                          </td>
                          <td className="p-3 border-r border-coffee-light/60 text-coffee-medium font-semibold align-top">
                            {formattedOpening}
                          </td>
                          <td className="p-3 border-r border-coffee-light/60 text-green-700 align-top">
                            <div className="font-extrabold text-sm">{formatRefill}</div>

                            <div className="flex flex-col gap-1 mt-1">
                              {/* Hoàn đơn hủy */}
                              {refundLogs.map((log: any) => (
                                <div 
                                  key={log.id} 
                                  className="flex flex-col bg-purple-50 border border-purple-300/90 rounded-lg p-1.5 text-[10px] leading-snug shadow-sm"
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold text-purple-900">
                                    <span className="flex items-center gap-0.5">↩️ Hoàn đơn hủy:</span>
                                    <span className="text-purple-700 font-black">
                                      +{formatIngredientStock(log.amount, ing.unit, ing.quy_cach)}
                                    </span>
                                  </div>
                                  <div className="text-purple-900 font-medium mt-0.5 text-[9.5px] break-words bg-purple-100/60 px-1 py-0.5 rounded">
                                    📝 {log.cleanNote ? log.cleanNote : 'Hoàn kho do hủy đơn'}
                                  </div>
                                  {log.time && (
                                    <span className="text-[8.5px] text-purple-700/80 mt-0.5 font-normal">
                                      ⏱ {log.time}
                                    </span>
                                  )}
                                </div>
                              ))}

                              {/* Nhập hàng mới */}
                              {restockLogs.map((log: any) => (
                                <div 
                                  key={log.id} 
                                  className="flex flex-col bg-emerald-50 border border-emerald-200 rounded-lg p-1.5 text-[10px] leading-snug"
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold text-emerald-900">
                                    <span>📦 Nhập hàng:</span>
                                    <span className="text-emerald-700 font-black">
                                      +{formatIngredientStock(log.amount, ing.unit, ing.quy_cach)}
                                    </span>
                                  </div>
                                  {log.cleanNote && log.cleanNote !== 'Nhập kho nguyên liệu' && (
                                    <div className="text-emerald-800 font-medium mt-0.5 text-[9.5px] break-words">
                                      📝 {log.cleanNote}
                                    </div>
                                  )}
                                  {log.time && (
                                    <span className="text-[8.5px] text-emerald-700/80 mt-0.5 font-normal">
                                      ⏱ {log.time}
                                    </span>
                                  )}
                                </div>
                              ))}

                              {/* Kiểm kho dôi dư */}
                              {stocktakeGainLogs.map((log: any) => (
                                <div 
                                  key={log.id} 
                                  className="flex flex-col bg-blue-50 border border-blue-200 rounded-lg p-1.5 text-[10px] leading-snug"
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold text-blue-900">
                                    <span>⚠️ Kiểm kho thừa:</span>
                                    <span className="text-blue-700 font-black">
                                      +{formatIngredientStock(log.amount, ing.unit, ing.quy_cach)}
                                    </span>
                                  </div>
                                  <div className="text-blue-900 font-medium mt-0.5 text-[9.5px] break-words bg-blue-100/60 px-1 py-0.5 rounded">
                                    📝 {log.cleanNote ? `"${log.cleanNote}"` : 'Cân chỉnh tồn kho'}
                                  </div>
                                  {log.time && (
                                    <span className="text-[8.5px] text-blue-700/80 mt-0.5 font-normal">
                                      ⏱ {log.time}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="p-3 border-r border-coffee-light/60 text-red-600 align-top">
                            <div className="font-extrabold text-sm">{formatSold}</div>

                            <div className="flex flex-col gap-1 mt-1">
                              {/* Badge Bán POS */}
                              {salesOnly > 0 && (
                                <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-600 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded-md w-fit">
                                  <span>🛒 Bán POS:</span>
                                  <span className="font-bold text-stone-900">-{formatIngredientStock(salesOnly, ing.unit, ing.quy_cach)}</span>
                                </div>
                              )}

                              {/* Badges Kiểm kho / Hao hụt kèm lý do nổi bật */}
                              {lossLogs.map((log: any) => (
                                <div 
                                  key={log.id} 
                                  className="flex flex-col bg-amber-50 border border-amber-300 rounded-lg p-1.5 text-[10px] leading-snug shadow-sm"
                                >
                                  <div className="flex items-center justify-between gap-1 font-bold text-amber-900">
                                    <span className="flex items-center gap-0.5">
                                      ⚠️ {log.type === 'Hao hụt/Cân lại' ? 'Kiểm kho' : 'Hao hụt'}:
                                    </span>
                                    <span className="text-red-600 font-black">
                                      -{formatIngredientStock(log.amount, ing.unit, ing.quy_cach)}
                                    </span>
                                  </div>
                                  <div className="text-amber-900 font-medium mt-0.5 text-[9.5px] break-words bg-amber-100/60 px-1 py-0.5 rounded">
                                    📝 {log.cleanNote ? `"${log.cleanNote}"` : 'Cân chỉnh tồn kho'}
                                  </div>
                                  {log.time && (
                                    <span className="text-[8.5px] text-amber-700/80 mt-0.5 font-normal">
                                      ⏱ {log.time}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="p-3 text-coffee-primary font-black align-top border-r border-coffee-light/60">
                            <div className="flex items-center space-x-1.5">
                              <span className={isLowStock ? 'text-red-600' : 'text-coffee-primary'}>
                                {formattedEnding}
                              </span>
                              {isLowStock && (
                                <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.2 rounded uppercase tracking-wider">
                                  Sắp hết
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center align-middle">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEditIngredient(ing)}
                                className="p-1.5 bg-[#FAF6F0] hover:bg-coffee-light text-coffee-dark rounded-xl transition border border-coffee-light shadow-sm"
                                title="Sửa nguyên liệu"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteIngredient(ing)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition border border-red-200 shadow-sm"
                                title="Xóa nguyên liệu"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {ingredients.filter(ing => ing.name.toLowerCase().includes(invSearchQuery.toLowerCase())).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-coffee-medium italic">
                        Không tìm thấy nguyên liệu nào phù hợp với từ khóa tìm kiếm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB QUẢN LÝ THỰC ĐƠN */}
      {adminTab === 'products' && (() => {
        const q = prodSearchQuery.trim().toLowerCase();
        const filteredAdminProducts = products.filter(prod => {
          const matchesSearch = !q || prod.name.toLowerCase().includes(q) || prod.id.toLowerCase().includes(q);
          const matchesCat = prodSelectedCategory === 'all' || prod.category_id === prodSelectedCategory;
          return matchesSearch && matchesCat;
        });

        return (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-extrabold text-lg text-coffee-dark">Danh Sách Đồ Uống</h3>
                <p className="text-xs text-coffee-medium">Cập nhật giá mang đi, giá tại quán, trạng thái còn hàng/hết hàng và thêm đồ uống mới.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOptimizeAllImages}
                  disabled={isOptimizingImages}
                  className="px-4 py-2.5 bg-white hover:bg-coffee-light border border-coffee-light text-coffee-primary font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow-sm w-fit disabled:opacity-60"
                  title="Nén lại các ảnh món cũ đang nặng để app tải nhanh hơn"
                >
                  {isOptimizingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-600" />}
                  <span>{isOptimizingImages ? 'Đang tối ưu ảnh...' : 'Tối ưu ảnh cũ'}</span>
                </button>
                <button
                  onClick={openAddProduct}
                  className="px-4 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow w-fit"
                >
                  <Plus className="w-4 h-4 text-coffee-accent" />
                  <span>Thêm đồ uống</span>
                </button>
              </div>
            </div>

            {/* Thanh Tìm Kiếm & Bộ Lọc Phân Loại Danh Mục (Cà phê, Trà, Nước ép, v.v.) */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-coffee-light space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <input
                    type="text"
                    placeholder="Tìm theo tên món hoặc mã món..."
                    value={prodSearchQuery}
                    onChange={(e) => setProdSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-coffee-light focus:border-coffee-primary focus:ring-2 focus:ring-coffee-primary/20 outline-none text-xs text-coffee-dark bg-[#FAF6F0]"
                  />
                  <Search className="w-4 h-4 text-coffee-medium/60 absolute left-3 top-3" />
                </div>
                <span className="text-xs text-coffee-medium font-semibold">
                  Hiển thị: <strong className="text-coffee-primary">{filteredAdminProducts.length}</strong> / {products.length} món
                </span>
              </div>

              {/* Danh sách phân loại danh mục */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setProdSelectedCategory('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                    prodSelectedCategory === 'all'
                      ? 'bg-coffee-primary text-white shadow-xs'
                      : 'bg-[#FAF6F0] text-coffee-dark hover:bg-coffee-light border border-coffee-light/60'
                  }`}
                >
                  Tất cả ({products.length})
                </button>
                {categories.map((cat) => {
                  const count = products.filter(p => p.category_id === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setProdSelectedCategory(cat.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                        prodSelectedCategory === cat.id
                          ? 'bg-coffee-primary text-white shadow-xs'
                          : 'bg-[#FAF6F0] text-coffee-dark hover:bg-coffee-light border border-coffee-light/60'
                      }`}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid hiển thị sản phẩm */}
            {filteredAdminProducts.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-coffee-light text-center space-y-2">
                <p className="font-bold text-coffee-medium">Không tìm thấy món đồ uống nào phù hợp</p>
                <p className="text-xs text-coffee-medium/80">Thử thay đổi từ khóa tìm kiếm hoặc chọn danh mục khác.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                {filteredAdminProducts.map((prod) => (
                  <div key={prod.id} className="bg-white rounded-3xl overflow-hidden border border-coffee-light flex flex-col shadow-sm">
                    <div className="relative h-28 sm:h-40 bg-coffee-light">
                      {prod.image_url ? (
                        <img 
                          src={prod.image_url} 
                          alt={prod.name} 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/logo.jpg';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-coffee-medium">
                          <Clock className="w-8 h-8 sm:w-12 sm:h-12" />
                        </div>
                      )}
                      <span className={`absolute top-2 right-2 sm:top-3 sm:right-3 text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                        prod.status === 'Còn hàng' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {prod.status}
                      </span>
                      <span className="absolute bottom-2 left-2 text-[9px] font-bold px-1.5 py-0.5 bg-coffee-dark/80 text-coffee-accent rounded">
                        {prod.id}
                      </span>
                    </div>

                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2.5">
                      <div>
                        <h4 className="font-extrabold text-coffee-dark text-xs sm:text-sm line-clamp-2 leading-tight">{prod.name}</h4>
                        <p className="text-[10px] text-coffee-medium mt-0.5">
                          Danh mục: <strong>{categories.find(c => c.id === prod.category_id)?.name || 'Khác'}</strong>
                        </p>
                      </div>

                      <div className="text-[10px] sm:text-xs space-y-1 bg-[#FAF6F0] p-2 rounded-xl border border-coffee-light/60">
                        <p className="flex justify-between">
                          <span className="text-coffee-medium">Giá vốn:</span>
                          <strong className="text-coffee-medium">{(prod.cost_price || 0).toLocaleString('vi-VN')}đ</strong>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-amber-800 font-semibold">Mang đi:</span>
                          <strong className="text-amber-700 font-black">{(prod.takeaway_price ?? prod.price ?? 0).toLocaleString('vi-VN')}đ</strong>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-coffee-primary font-semibold">Tại quán:</span>
                          <strong className="text-coffee-primary font-black">{(prod.dinein_price ?? prod.price ?? 0).toLocaleString('vi-VN')}đ</strong>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-coffee-light/50">
                        <button
                          onClick={() => openEditProduct(prod)}
                          className="py-1.5 bg-[#FAF6F0] hover:bg-coffee-accent text-coffee-primary text-[10px] sm:text-xs font-bold rounded-xl transition flex items-center justify-center space-x-0.5 sm:space-x-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Sửa</span>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(prod.id)}
                          className="py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] sm:text-xs font-bold rounded-xl transition flex items-center justify-center space-x-0.5 sm:space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xoá</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. TAB QUẢN LÝ NHÂN VIÊN */}
      {adminTab === 'staff' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-extrabold text-lg text-coffee-dark">Danh Sách Nhân Viên</h3>
              <p className="text-xs text-coffee-medium">Quản lý hồ sơ nhân sự, email tài khoản và phân quyền đăng nhập.</p>
            </div>
            <button
              onClick={openAddStaff}
              className="px-4 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow"
            >
              <Plus className="w-4 h-4 text-coffee-accent" />
              <span>Thêm nhân viên</span>
            </button>
          </div>

          {/* Phiên bản di động (Mobile Card List) */}
          <div className="md:hidden space-y-4">
            {users.map((staff) => (
              <div key={staff.id} className="bg-white p-4 rounded-2xl border border-coffee-light shadow-sm flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 bg-coffee-accent rounded-xl text-coffee-dark font-black flex items-center justify-center text-xs shrink-0">
                    {staff.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-xs text-coffee-dark truncate">{staff.full_name}</h4>
                    <p className="text-[10px] text-coffee-medium truncate">@{staff.username || 'no-username'} • {staff.email}</p>
                    <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${
                      staff.role === 'Admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {staff.role}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => openEditStaff(staff)}
                    className="p-2 bg-[#FAF6F0] hover:bg-coffee-accent rounded-xl text-coffee-primary transition"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteStaff(staff.id)}
                    className="p-2 bg-red-50 hover:bg-red-100 rounded-xl text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Phiên bản máy tính (Desktop Table) */}
          <div className="hidden md:block bg-white rounded-3xl border border-coffee-light overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#FAF6F0] border-b border-coffee-light text-coffee-medium font-bold text-xs uppercase">
                    <th className="p-4">Nhân viên</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Vai trò</th>
                    <th className="p-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-coffee-light/50">
                  {users.map((staff) => (
                    <tr key={staff.id} className="hover:bg-coffee-light/20 transition-colors">
                      <td className="p-4 flex items-center space-x-3">
                        <div className="w-8 h-8 bg-coffee-accent rounded-lg text-coffee-dark font-extrabold flex items-center justify-center text-xs">
                          {staff.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-coffee-dark block">{staff.full_name}</span>
                          <span className="text-[10px] text-coffee-medium">@{staff.username || 'no-username'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-coffee-medium">{staff.email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          staff.role === 'Admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {staff.role}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => openEditStaff(staff)}
                          className="p-2 bg-coffee-light hover:bg-coffee-accent rounded-lg text-coffee-primary transition inline-flex items-center"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(staff.id)}
                          className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition inline-flex items-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. TAB BÁO CÁO CHẤM CÔNG */}
      {adminTab === 'attendance' && (() => {
        // Hàm tính số ngày giao nhau giữa đơn xin nghỉ và khoảng ngày lọc
        const getOverlapDays = (leaveStart: string, leaveEnd: string, rangeStart: string, rangeEnd: string) => {
          const sStr = leaveStart > rangeStart ? leaveStart : rangeStart;
          const eStr = leaveEnd < rangeEnd ? leaveEnd : rangeEnd;
          if (sStr > eStr) return 0;
          const sDate = new Date(sStr + 'T00:00:00');
          const eDate = new Date(eStr + 'T00:00:00');
          const diffTime = eDate.getTime() - sDate.getTime();
          return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
        };

        const attStartT = new Date(attStartDate + 'T00:00:00').getTime();
        const attEndT = new Date(attEndDate + 'T23:59:59').getTime();

        const filteredLogs = timeLogs.filter(log => {
          if (log.status === 'Từ chối') return false;
          if (attUserId !== 'all' && log.user_id !== attUserId) return false;
          const t = new Date(log.check_in_time).getTime();
          return t >= attStartT && t <= attEndT;
        });

        const filteredLeaves = leaveRequests.filter(leave => {
          if (leave.status === 'Từ chối') return false;
          if (attUserId !== 'all' && leave.user_id !== attUserId) return false;
          const startT = new Date(leave.start_date + 'T00:00:00').getTime();
          const endT = new Date(leave.end_date + 'T23:59:59').getTime();
          return (startT <= attEndT && endT >= attStartT);
        });

        const summaryRows = users.map(user => {
          const userLogs = filteredLogs.filter(log => log.user_id === user.id);
          const approvedLogs = userLogs.filter(log => log.status === 'Đã duyệt');
          
          let totalHours = 0;
          approvedLogs.forEach(log => {
            if (log.check_out_time) {
              const start = new Date(log.check_in_time).getTime();
              const end = new Date(log.check_out_time).getTime();
              const diff = end - start;
              if (diff > 0) {
                totalHours += diff / (1000 * 60 * 60);
              }
            }
          });

          const userLeaves = filteredLeaves.filter(leave => leave.user_id === user.id && leave.status === 'Đã duyệt');
          let totalLeaveDays = 0;
          userLeaves.forEach(leave => {
            totalLeaveDays += getOverlapDays(leave.start_date, leave.end_date, attStartDate, attEndDate);
          });

          return {
            userId: user.id,
            staffName: user.full_name,
            username: user.username || '',
            role: user.role,
            totalShifts: approvedLogs.length,
            totalHours: totalHours,
            totalLeaveDays: totalLeaveDays,
            totalLeaveHours: totalLeaveDays * 8
          };
        });

        const totalApprovedShifts = summaryRows.reduce((acc, r) => acc + (attUserId === 'all' || r.userId === attUserId ? r.totalShifts : 0), 0);
        const totalApprovedHours = summaryRows.reduce((acc, r) => acc + (attUserId === 'all' || r.userId === attUserId ? r.totalHours : 0), 0);
        const totalLeaveDays = summaryRows.reduce((acc, r) => acc + (attUserId === 'all' || r.userId === attUserId ? r.totalLeaveDays : 0), 0);
        const totalLeaveHours = summaryRows.reduce((acc, r) => acc + (attUserId === 'all' || r.userId === attUserId ? r.totalLeaveHours : 0), 0);

        const shiftsDetails = filteredLogs.map(log => {
          let hours = 0;
          if (log.check_out_time) {
            const start = new Date(log.check_in_time).getTime();
            const end = new Date(log.check_out_time).getTime();
            const diff = end - start;
            if (diff > 0) hours = diff / (1000 * 60 * 60);
          }
          const staff = users.find(u => u.id === log.user_id);
          
          // Tính ngày dạng YYYY-MM-DD theo múi giờ GMT+7 địa phương
          const checkInDate = new Date(log.check_in_time);
          const localTime = new Date(checkInDate.getTime() + (7 * 60 * 60 * 1000));
          const yyyy = localTime.getUTCFullYear();
          const mm = String(localTime.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(localTime.getUTCDate()).padStart(2, '0');
          const localYmd = `${yyyy}-${mm}-${dd}`;

          return {
            staffName: staff?.full_name || log.users?.full_name || 'Nhân viên',
            date: new Date(log.check_in_time).toLocaleDateString('vi-VN'),
            localYmd: localYmd,
            shiftName: log.shift,
            checkIn: new Date(log.check_in_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(log.check_in_time).toLocaleDateString('vi-VN'),
            checkOut: log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(log.check_out_time).toLocaleDateString('vi-VN') : '-',
            hours: hours,
            status: log.status,
            noteIn: log.ghi_chu_vao || '',
            noteOut: log.ghi_chu_ra || '',
            submittedAt: log.submitted_at ? new Date(log.submitted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
            realCheckOut: log.real_check_out_time ? new Date(log.real_check_out_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'
          };
        });

        const leavesDetails = filteredLeaves.map(leave => {
          const staff = users.find(u => u.id === leave.user_id);
          const startStr = new Date(leave.start_date).toLocaleDateString('vi-VN');
          const endStr = new Date(leave.end_date).toLocaleDateString('vi-VN');
          const daysInPeriod = getOverlapDays(leave.start_date, leave.end_date, attStartDate, attEndDate);
          
          const startYmd = leave.start_date.split('T')[0];
          const endYmd = leave.end_date.split('T')[0];

          return {
            staffName: staff?.full_name || leave.users?.full_name || 'Nhân viên',
            startDate: startStr,
            endDate: endStr,
            startYmd,
            endYmd,
            days: daysInPeriod,
            reason: leave.reason,
            status: leave.status
          };
        });

        return (
          <div className="space-y-6">
            {/* Header + Bộ lọc */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-extrabold text-lg text-coffee-dark">Báo Cáo Chấm Công & Nghỉ Phép</h3>
                  <p className="text-xs text-coffee-medium">Xem tổng số ca làm, số giờ công thực tế, và lịch sử xin nghỉ phép.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportAttendanceToExcel(summaryRows, shiftsDetails, leavesDetails, attStartDate, attEndDate)}
                    className="px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold rounded-xl transition border border-green-200 flex items-center gap-1"
                  >
                    📊 Xuất Excel
                  </button>
                  <button
                    onClick={() => exportAttendanceToPDF(summaryRows, shiftsDetails, leavesDetails, attStartDate, attEndDate)}
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold rounded-xl transition border border-red-200 flex items-center gap-1"
                  >
                    📄 Xuất PDF
                  </button>
                </div>
              </div>

              {/* Bộ lọc */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-coffee-light/50 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Từ ngày</label>
                  <input
                    type="date"
                    value={attStartDate}
                    onChange={(e) => setAttStartDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Đến ngày</label>
                  <input
                    type="date"
                    value={attEndDate}
                    onChange={(e) => setAttEndDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Nhân viên</label>
                  <select
                    value={attUserId}
                    onChange={(e) => setAttUserId(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  >
                    <option value="all">Tất cả nhân viên</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Thống kê dạng Card */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-coffee-light shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-coffee-accent/40 rounded-2xl text-coffee-primary">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-coffee-medium uppercase">Tổng ca làm</p>
                  <h4 className="text-lg font-black text-coffee-dark">{totalApprovedShifts} ca</h4>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-coffee-light shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-green-50 rounded-2xl text-green-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-coffee-medium uppercase">Tổng giờ công</p>
                  <h4 className="text-lg font-black text-coffee-dark">{totalApprovedHours.toFixed(1)} h</h4>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-coffee-light shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                  <CalendarDays className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-coffee-medium uppercase">Số ngày xin nghỉ</p>
                  <h4 className="text-lg font-black text-coffee-dark">{totalLeaveDays} ngày</h4>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-coffee-light shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-red-50 rounded-2xl text-red-600">
                  <X className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-coffee-medium uppercase">Tổng giờ nghỉ</p>
                  <h4 className="text-lg font-black text-coffee-dark">{totalLeaveHours.toFixed(1)} h</h4>
                </div>
              </div>
            </div>

            {/* Sub-tabs điều hướng bảng + Toggle View Mode */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <div className="bg-white p-2 rounded-2xl border border-coffee-light flex space-x-1 shadow-sm w-fit text-xs">
                <button
                  onClick={() => setAttendanceSubTab('summary')}
                  className={`px-4 py-2 rounded-xl font-bold transition ${
                    attendanceSubTab === 'summary' ? 'bg-coffee-primary text-white shadow-sm' : 'text-coffee-medium hover:bg-coffee-light'
                  }`}
                >
                  Tổng hợp công
                </button>
                <button
                  onClick={() => setAttendanceSubTab('shifts')}
                  className={`px-4 py-2 rounded-xl font-bold transition ${
                    attendanceSubTab === 'shifts' ? 'bg-coffee-primary text-white shadow-sm' : 'text-coffee-medium hover:bg-coffee-light'
                  }`}
                >
                  Lịch sử ca làm ({shiftsDetails.length})
                </button>
                <button
                  onClick={() => setAttendanceSubTab('leaves')}
                  className={`px-4 py-2 rounded-xl font-bold transition ${
                    attendanceSubTab === 'leaves' ? 'bg-coffee-primary text-white shadow-sm' : 'text-coffee-medium hover:bg-coffee-light'
                  }`}
                >
                  Lịch sử nghỉ phép ({leavesDetails.length})
                </button>
              </div>

              {attendanceSubTab !== 'summary' && (
                <div className="bg-white p-2 rounded-2xl border border-coffee-light flex space-x-1 shadow-sm w-fit text-xs">
                  <button
                    onClick={() => setViewMode('calendar')}
                    className={`px-4 py-2 rounded-xl font-bold transition flex items-center space-x-1 ${
                      viewMode === 'calendar' ? 'bg-coffee-primary text-white shadow-sm' : 'text-coffee-medium hover:bg-coffee-light'
                    }`}
                  >
                    <span>📅 Dạng Lịch</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-4 py-2 rounded-xl font-bold transition flex items-center space-x-1 ${
                      viewMode === 'table' ? 'bg-coffee-primary text-white shadow-sm' : 'text-coffee-medium hover:bg-coffee-light'
                    }`}
                  >
                    <span>📋 Dạng Bảng</span>
                  </button>
                </div>
              )}
            </div>

            {/* Render các bảng dữ liệu */}
            {attendanceSubTab === 'summary' && (
              <div className="bg-white rounded-3xl border border-coffee-light shadow-sm overflow-hidden">
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-left text-xs sm:text-sm bg-white">
                    <thead>
                      <tr className="bg-[#FAF6F0] border-b border-coffee-light text-coffee-medium font-bold text-xs uppercase">
                        <th className="p-4">Nhân viên</th>
                        <th className="p-4">Vai trò</th>
                        <th className="p-4 text-center">Số ca làm (Đã duyệt)</th>
                        <th className="p-4 text-right">Tổng giờ làm</th>
                        <th className="p-4 text-center">Số ngày nghỉ (Đã duyệt)</th>
                        <th className="p-4 text-right">Tổng giờ nghỉ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-coffee-light/50">
                      {summaryRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-coffee-light/20 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-coffee-dark">{row.staffName}</div>
                            <div className="text-[10px] text-coffee-medium">@{row.username}</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.role === 'Admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {row.role}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-coffee-dark">{row.totalShifts}</td>
                          <td className="p-4 text-right font-extrabold text-green-700">{row.totalHours.toFixed(1)} giờ</td>
                          <td className="p-4 text-center font-bold text-coffee-dark">{row.totalLeaveDays} ngày</td>
                          <td className="p-4 text-right font-extrabold text-red-700">{row.totalLeaveHours.toFixed(1)} giờ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal chi tiết ngày của Lịch */}
            {selectedCalendarDay && (
              <CalendarDayDetailsModal
                type={attendanceSubTab === 'shifts' ? 'shifts' : 'leaves'}
                day={selectedCalendarDay}
                items={attendanceSubTab === 'shifts' ? shiftsDetails : leavesDetails}
                onClose={() => setSelectedCalendarDay(null)}
              />
            )}

            {attendanceSubTab === 'shifts' && (
              viewMode === 'calendar' ? (
                <CalendarView
                  type="shifts"
                  items={shiftsDetails}
                  currentCalDate={currentCalDate}
                  setCurrentCalDate={setCurrentCalDate}
                  onSelectDay={(day) => setSelectedCalendarDay(day)}
                />
              ) : (
                <div className="bg-white rounded-3xl border border-coffee-light shadow-sm overflow-hidden animate-fade-in">
                  <div className="overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-left text-xs sm:text-sm bg-white">
                      <thead>
                        <tr className="bg-[#FAF6F0] border-b border-coffee-light text-coffee-medium font-bold text-xs uppercase">
                          <th className="p-4">STT</th>
                          <th className="p-4">Nhân viên</th>
                          <th className="p-4">Ngày</th>
                          <th className="p-4">Ca làm</th>
                          <th className="p-4">Giờ vào thực tế</th>
                          <th className="p-4">Giờ ra thực tế</th>
                          <th className="p-4 text-right">Số giờ làm</th>
                          <th className="p-4 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-light/50">
                        {shiftsDetails.map((row, idx) => (
                          <tr key={idx} className="hover:bg-coffee-light/20 transition-colors">
                            <td className="p-4 text-coffee-medium font-mono">{idx + 1}</td>
                            <td className="p-4 font-bold text-coffee-dark">{row.staffName}</td>
                            <td className="p-4 text-coffee-medium">{row.date}</td>
                            <td className="p-4 text-coffee-dark font-medium">{row.shiftName}</td>
                            <td className="p-4 text-coffee-medium font-mono">{row.checkIn}</td>
                            <td className="p-4 text-coffee-medium font-mono">{row.checkOut}</td>
                            <td className="p-4 text-right font-bold text-coffee-dark">{row.hours.toFixed(1)} h</td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.status === 'Đã duyệt' ? 'bg-green-100 text-green-800' :
                                row.status === 'Chờ duyệt' ? 'bg-yellow-100 text-yellow-800' :
                                row.status === 'Từ chối' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {attendanceSubTab === 'leaves' && (
              viewMode === 'calendar' ? (
                <CalendarView
                  type="leaves"
                  items={leavesDetails}
                  currentCalDate={currentCalDate}
                  setCurrentCalDate={setCurrentCalDate}
                  onSelectDay={(day) => setSelectedCalendarDay(day)}
                />
              ) : (
                <div className="bg-white rounded-3xl border border-coffee-light shadow-sm overflow-hidden animate-fade-in">
                  <div className="overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-left text-xs sm:text-sm bg-white">
                      <thead>
                        <tr className="bg-[#FAF6F0] border-b border-coffee-light text-coffee-medium font-bold text-xs uppercase">
                          <th className="p-4">STT</th>
                          <th className="p-4">Nhân viên</th>
                          <th className="p-4">Từ ngày</th>
                          <th className="p-4">Đến ngày</th>
                          <th className="p-4 text-center">Số ngày nghỉ</th>
                          <th className="p-4">Lý do xin nghỉ</th>
                          <th className="p-4 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-coffee-light/50">
                        {leavesDetails.map((row, idx) => (
                          <tr key={idx} className="hover:bg-coffee-light/20 transition-colors">
                            <td className="p-4 text-coffee-medium font-mono">{idx + 1}</td>
                            <td className="p-4 font-bold text-coffee-dark">{row.staffName}</td>
                            <td className="p-4 text-coffee-dark">{row.startDate}</td>
                            <td className="p-4 text-coffee-dark">{row.endDate}</td>
                            <td className="p-4 text-center font-bold text-coffee-dark">{row.days} ngày</td>
                            <td className="p-4 text-coffee-medium italic max-w-xs truncate" title={row.reason}>{row.reason}</td>
                            <td className="p-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                row.status === 'Đã duyệt' ? 'bg-green-100 text-green-800' :
                                row.status === 'Chờ duyệt' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        );
      })()}

      {adminTab === 'expenses' && (
        <div className="space-y-6">
          {/* Bộ lọc khoảng ngày */}
          <div className="bg-white p-5 rounded-3xl border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3.5 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Từ ngày:</span>
                <input
                  type="date"
                  value={expStartDate}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-coffee-medium">Đến ngày:</span>
                <input
                  type="date"
                  value={expEndDate}
                  onChange={(e) => setExpEndDate(e.target.value)}
                  className="h-10 px-3 bg-[#FAF6F0] rounded-xl border-none focus:ring-1 focus:ring-coffee-primary font-bold text-coffee-dark"
                />
              </div>
            </div>
            <button
              onClick={() => setIsExpModalOpen(true)}
              className="px-4 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white text-xs font-bold rounded-xl transition flex items-center space-x-2 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm chi phí vận hành</span>
            </button>
          </div>

          {/* Bảng chi phí */}
          <div className="bg-white rounded-3xl border border-coffee-light shadow-sm overflow-hidden">
            <div className="p-5 border-b border-coffee-light">
              <h3 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">Chi tiết chi phí vận hành</h3>
              <p className="text-xs text-coffee-medium mt-1">Tổng cộng chi phí trong khoảng thời gian này: <strong className="text-red-600">{expenses.filter(e => e.date >= expStartDate && e.date <= expEndDate).reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('vi-VN')}đ</strong></p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#FAF6F0] border-b border-coffee-light text-coffee-medium font-bold text-xs uppercase">
                    <th className="p-4">STT</th>
                    <th className="p-4">Ngày chi</th>
                    <th className="p-4">Tên chi phí</th>
                    <th className="p-4">Phân loại</th>
                    <th className="p-4">Người ghi nhận</th>
                    <th className="p-4 text-right">Số tiền</th>
                    <th className="p-4">Ghi chú</th>
                    <th className="p-4 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-coffee-light/50">
                  {expenses
                    .filter(e => e.date >= expStartDate && e.date <= expEndDate)
                    .map((item, idx) => (
                      <tr key={item.id} className="hover:bg-coffee-light/20 transition-colors">
                        <td className="p-4 text-coffee-medium font-mono">{idx + 1}</td>
                        <td className="p-4 text-coffee-dark font-medium">{new Date(item.date).toLocaleDateString('vi-VN')}</td>
                        <td className="p-4 font-bold text-coffee-dark">{item.name}</td>
                        <td className="p-4 text-coffee-dark">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${item.type === 'co_dinh' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                            {item.type === 'co_dinh' ? 'Cố định' : 'Biến động'}
                          </span>
                        </td>
                        <td className="p-4 text-coffee-medium">{item.staff_name}</td>
                        <td className="p-4 text-right font-black text-coffee-dark">{item.amount.toLocaleString('vi-VN')}đ</td>
                        <td className="p-4 text-coffee-medium max-w-xs truncate" title={item.notes}>{item.notes || '-'}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteExpense(item.id)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition"
                            title="Xóa khoản chi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  {expenses.filter(e => e.date >= expStartDate && e.date <= expEndDate).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-coffee-medium text-xs">
                        Không tìm thấy khoản chi phí vận hành nào trong khoảng thời gian đã chọn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* POPUP FORM THÊM CHI PHÍ VẬN HÀNH */}
      {isExpModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-5 sm:space-y-6 border border-coffee-accent/40 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
              <h3 className="font-extrabold text-base sm:text-lg text-coffee-dark">
                Ghi nhận Chi phí vận hành mới
              </h3>
              <button onClick={() => setIsExpModalOpen(false)} className="p-1 hover:bg-coffee-light rounded-lg text-coffee-medium cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
              {/* Tên chi phí */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Tên chi phí</label>
                <input
                  type="text"
                  value={expName}
                  onChange={(e) => setExpName(e.target.value)}
                  placeholder="Ví dụ: Tiền điện tháng 8, Tiền mặt bằng..."
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required
                />
              </div>

              {/* Loại chi phí & Ngày chi */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-bold text-coffee-medium uppercase">Phân loại</label>
                  <select
                    value={expType}
                    onChange={(e) => setExpType(e.target.value as any)}
                    className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  >
                    <option value="bien_dong">Biến động (Biến phí)</option>
                    <option value="co_dinh">Cố định (Định phí)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-coffee-medium uppercase">Ngày chi</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                    required
                  />
                </div>
              </div>

              {/* Số tiền */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Số tiền chi (VND)</label>
                <input
                  type="number"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="Nhập số tiền..."
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required
                />
              </div>

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Ghi chú</label>
                <textarea
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Ghi chú chi tiết thêm..."
                  rows={3}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold rounded-2xl shadow transition"
              >
                Lưu khoản chi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 8. TAB CHẤM CÔNG NGOÀI GIỜ (DÀNH CHO QUẢN LÝ) */}
      {adminTab === 'overtime' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-lg text-coffee-dark flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                  <span>Chấm Công Ngoài Giờ & Ca Bù Cho Nhân Viên</span>
                </h3>
                <p className="text-xs text-coffee-medium mt-1">
                  Dành riêng cho Quản lý / Admin: Trực tiếp chấm công cho nhân viên làm thêm ca, hỗ trợ quán ngoài lịch, hoặc chấm bù ca. Ca sau khi lưu sẽ được tự động <strong>Đã duyệt</strong> và tính đủ giờ vào Báo cáo chấm công. Nhân viên chỉ xem đối soát, không thể tự sửa ca này.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Chấm công ngoài giờ */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4">
              <h4 className="font-extrabold text-sm text-coffee-dark border-b border-coffee-light pb-3">
                {editingOtLog ? '✏️ Chỉnh sửa ca ngoài giờ' : '➕ Tạo ca làm việc mới'}
              </h4>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!otStaffId) {
                  toast.error('Vui lòng chọn nhân viên cần chấm công!');
                  return;
                }
                if (!otStartTime || !otEndTime) {
                  toast.error('Vui lòng nhập giờ vào và giờ ra đầy đủ!');
                  return;
                }
                setIsOtConfirmModalOpen(true);
              }} className="space-y-3.5 text-xs">
                {/* Chọn nhân viên */}
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Nhân viên *</label>
                  <select
                    value={otStaffId}
                    onChange={(e) => setOtStaffId(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-3.5 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                    required
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} (@{u.username}) {u.role === 'Admin' ? '[Admin]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ngày làm việc */}
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Ngày làm việc *</label>
                  <input
                    type="date"
                    value={otDate}
                    onChange={(e) => setOtDate(e.target.value)}
                    className="w-full bg-[#FAF6F0] px-3.5 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                    required
                  />
                </div>

                {/* Loại ca */}
                <div className="space-y-1">
                  <label className="font-bold text-coffee-medium uppercase">Loại ca làm việc *</label>
                  <select
                    value={otShift}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOtShift(val);
                      if (val.includes('sáng')) {
                        setOtStartTime('06:30');
                        setOtEndTime('12:00');
                      } else {
                        setOtStartTime('12:30');
                        setOtEndTime('17:30');
                      }
                    }}
                    className="w-full bg-[#FAF6F0] px-3.5 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                  >
                    <option value="Ca sáng (06:30 - 12:00)">Ca sáng (06:30 - 12:00) [6:30am - 12:00pm]</option>
                    <option value="Ca chiều (12:00 - 17:30)">Ca chiều (12:30 - 17:30) [12:30pm - 5:30pm]</option>
                  </select>
                </div>

                {/* Giờ vào & Giờ ra */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-coffee-medium uppercase">Giờ vào *</label>
                    <input
                      type="time"
                      value={otStartTime}
                      onChange={(e) => setOtStartTime(e.target.value)}
                      className="w-full bg-[#FAF6F0] px-3 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-bold text-center"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-coffee-medium uppercase">Giờ ra *</label>
                    <input
                      type="time"
                      value={otEndTime}
                      onChange={(e) => setOtEndTime(e.target.value)}
                      className="w-full bg-[#FAF6F0] px-3 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-bold text-center"
                      required
                    />
                  </div>
                </div>

                {/* Ghi chú */}
                <div className="space-y-1.5">
                  <label className="font-bold text-coffee-medium uppercase">Ghi chú công việc</label>
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    {[
                      'Đông khách đột biến ca trực',
                      'Trực thay / Hỗ trợ đồng nghiệp',
                      'Tổng vệ sinh / Sắp xếp quán',
                      'Chuẩn bị nguyên liệu ngày mai'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setOtNotes(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          otNotes === preset
                            ? 'bg-coffee-primary text-white border-coffee-primary shadow-xs'
                            : 'bg-[#FAF6F0] text-coffee-dark border-coffee-light hover:bg-coffee-light/50'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={otNotes}
                    onChange={(e) => setOtNotes(e.target.value)}
                    placeholder="VD: Hỗ trợ kiểm kê, tăng ca đông khách..."
                    className="w-full bg-[#FAF6F0] px-3.5 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark placeholder-coffee-medium/60"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  {editingOtLog && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOtLog(null);
                        handleOpenOtModal();
                      }}
                      className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-coffee-medium font-bold rounded-2xl transition"
                    >
                      Hủy
                    </button>
                  )}
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-coffee-primary hover:bg-coffee-dark text-white font-bold rounded-2xl shadow transition flex items-center justify-center space-x-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingOtLog ? 'Cập nhật ca' : 'Lưu ca làm việc'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Danh sách ca ngoài giờ đã chấm */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4">
              <div className="flex items-center justify-between border-b border-coffee-light pb-3">
                <h4 className="font-extrabold text-sm text-coffee-dark">
                  Danh sách ca Quản lý đã chấm ({timeLogs.filter(l => (l.ghi_chu_vao || '').includes('[Quản lý chấm ngoài giờ]') || (l.notes || '').includes('[Quản lý chấm ngoài giờ]')).length})
                </h4>
                <span className="text-[11px] text-coffee-medium">Tất cả đều tự động Đã duyệt</span>
              </div>

              <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                {timeLogs
                  .filter(l => (l.ghi_chu_vao || '').includes('[Quản lý chấm ngoài giờ]') || (l.notes || '').includes('[Quản lý chấm ngoài giờ]'))
                  .sort((a, b) => new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime())
                  .map((log: any) => {
                    const staff = users.find(u => u.id === log.user_id);
                    const inDate = new Date(log.check_in_time);
                    const outDate = log.check_out_time ? new Date(log.check_out_time) : null;
                    const dateStr = inDate.toLocaleDateString('vi-VN');
                    const inStr = inDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    const outStr = outDate ? outDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa ra ca';
                    
                    let hours = 0;
                    if (outDate) {
                      const diff = outDate.getTime() - inDate.getTime();
                      if (diff > 0) hours = Math.round((diff / (1000 * 60 * 60)) * 100) / 100;
                    }

                    const cleanNote = (log.ghi_chu_vao || '').replace('[Quản lý chấm ngoài giờ]', '').trim();

                    return (
                      <div key={log.id} className="p-4 rounded-2xl border border-coffee-light/80 bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-coffee-primary/30 transition">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-coffee-dark">{staff?.full_name || 'Nhân viên'}</span>
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-[10px] font-bold">
                              ✓ Đã duyệt
                            </span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                              {log.shift || 'Ngoài giờ'}
                            </span>
                          </div>
                          <p className="text-xs text-coffee-medium">
                            📅 <strong>{dateStr}</strong> | ⏰ {inStr} - {outStr} ({hours} giờ công)
                          </p>
                          {cleanNote && (
                            <p className="text-[11px] text-coffee-medium italic">
                              "{cleanNote}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            onClick={() => openEditOvertime(log)}
                            className="p-2 bg-white hover:bg-coffee-light rounded-xl text-coffee-primary border border-coffee-light/60 transition shadow-sm"
                            title="Sửa ca làm"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteOvertime(log.id)}
                            className="p-2 bg-white hover:bg-red-50 rounded-xl text-red-600 border border-red-200 transition shadow-sm"
                            title="Xóa ca làm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {timeLogs.filter(l => (l.ghi_chu_vao || '').includes('[Quản lý chấm ngoài giờ]') || (l.notes || '').includes('[Quản lý chấm ngoài giờ]')).length === 0 && (
                  <div className="p-8 text-center text-coffee-medium text-xs">
                    Chưa có ca làm ngoài giờ nào do Quản lý chấm. Bạn có thể sử dụng form bên trái để chấm ca mới!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. TAB QUẢN LÝ BÀN & SƠ ĐỒ */}
      {adminTab === 'tables' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-lg text-coffee-dark flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-coffee-primary" />
                <span>Quản Lý Sơ Đồ Bàn & Khu Vực</span>
              </h3>
              <p className="text-xs text-coffee-medium mt-1">
                Thêm, sửa tên hoặc sức chứa các bàn. Sơ đồ bàn sẽ được tự động đồng bộ tức thì sang màn hình Bán hàng (POS) và Thanh toán.
              </p>
            </div>
            <button
              onClick={handleOpenCreateTable}
              className="px-4 py-3 bg-coffee-primary hover:bg-coffee-dark text-white text-xs font-bold rounded-2xl shadow transition flex items-center justify-center gap-2 self-start sm:self-center shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ Thêm bàn mới</span>
            </button>
          </div>

          {/* Grid Sơ đồ bàn */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {tables.map((table) => {
              const isTakeaway = (table.table_name || '').toLowerCase().includes('mang về') || (table.table_name || '').toLowerCase().includes('takeaway');
              const isOccupied = table.status === 'Đang phục vụ';

              return (
                <div
                  key={table.id}
                  className={`bg-white rounded-3xl p-5 border transition-all duration-200 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md ${
                    isOccupied 
                      ? 'border-amber-300 bg-amber-50/20' 
                      : 'border-coffee-light hover:border-coffee-accent/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-base text-coffee-dark tracking-tight">
                        {table.table_name}
                      </h4>
                      <p className="text-xs text-coffee-medium mt-0.5">
                        Sức chứa: <span className="font-bold text-coffee-dark">{table.capacity || 4} chỗ</span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isOccupied 
                          ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                          : 'bg-green-100 text-green-900 border border-green-300'
                      }`}>
                        {table.status || 'Trống'}
                      </span>
                      {isTakeaway && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800">
                          Bàn Mặc Định
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-coffee-light/60 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEditTable(table)}
                      className="px-3 py-1.5 bg-[#FAF6F0] hover:bg-coffee-light text-coffee-dark text-xs font-bold rounded-xl transition border border-coffee-light flex items-center gap-1 shadow-sm"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>
                    {!isTakeaway && (
                      <button
                        onClick={() => handleDeleteTable(table)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition border border-red-200 flex items-center gap-1 shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {tables.length === 0 && (
            <div className="bg-white p-12 rounded-3xl border border-coffee-light text-center text-coffee-medium text-xs">
              Chưa có dữ liệu bàn nào trong hệ thống. Hãy nhấn "+ Thêm bàn mới" để thiết lập bàn đầu tiên!
            </div>
          )}
        </div>
      )}

      {/* 10. TAB CÀI ĐẶT HỆ THỐNG & SAO LƯU */}
      {adminTab === 'settings' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-lg text-coffee-dark flex items-center gap-2">
                <Settings className="w-5 h-5 text-coffee-primary" />
                <span>Cài Đặt Cửa Hàng & Dữ Liệu Tự Động Hóa 100%</span>
              </h3>
              <p className="text-xs text-coffee-medium mt-1">
                Tự chủ quản lý thông tin thương hiệu in hóa đơn, đổi IP máy in nhiệt LAN/Wi-Fi, và sao lưu/dọn dẹp dữ liệu an toàn trọn đời.
              </p>
            </div>
          </div>

          {/* Grid 2 Cột: Cài đặt Quán & Cài đặt Máy In */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Thẻ 1: Thông tin Hóa đơn & Quán */}
            <form onSubmit={handleSaveStoreSettings} className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 border-b border-coffee-light pb-3">
                  <Utensils className="w-5 h-5 text-coffee-primary" />
                  <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
                    Thông tin hiển thị trên Bill Hóa Đơn
                  </h4>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Tên quán cà phê</label>
                  <input
                    type="text"
                    value={cfgStoreName}
                    onChange={(e) => setCfgStoreName(e.target.value)}
                    placeholder="VD: AVA COFFEE"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Địa chỉ quán</label>
                  <input
                    type="text"
                    value={cfgStoreAddress}
                    onChange={(e) => setCfgStoreAddress(e.target.value)}
                    placeholder="VD: K300, Tân Bình, TP. Hồ Chí Minh"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Hotline / Số điện thoại</label>
                  <input
                    type="text"
                    value={cfgStorePhone}
                    onChange={(e) => setCfgStorePhone(e.target.value)}
                    placeholder="VD: 0909 123 456"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Lời cảm ơn chân hóa đơn (xuống dòng tùy ý)</label>
                  <textarea
                    rows={3}
                    value={cfgBillFooter}
                    onChange={(e) => setCfgBillFooter(e.target.value)}
                    placeholder="VD: AVA COFFEE XIN CẢM ƠN QUÝ KHÁCH !&#10;CHÚC QUÝ KHÁCH NGON MIỆNG"
                    className="w-full p-3 bg-[#FAF6F0] rounded-xl text-xs font-medium text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-coffee-light/60 flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Lưu thông tin quán</span>
                </button>
              </div>
            </form>

            {/* Thẻ 2: Cấu hình Máy In Nhiệt LAN/Wi-Fi (ESC/POS) */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-coffee-light pb-3">
                  <div className="flex items-center space-x-2">
                    <Printer className="w-5 h-5 text-coffee-primary" />
                    <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
                      Cấu hình Máy In Bill Mạng LAN/Wi-Fi
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                    📱 Dành cho App APK/Máy POS
                  </span>
                </div>

                <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-[11px] text-blue-900 leading-relaxed">
                  💡 <strong>Lưu ý vận hành:</strong> Trình duyệt web trên máy tính không hỗ trợ mở cổng socket TCP trực tiếp. Cấu hình IP máy in dưới đây sẽ được lưu trữ tự động trên hệ thống và <strong>áp dụng tức thì khi thu ngân mở App POS trên điện thoại hoặc máy POS Android (bản APK)</strong> để in bill.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-coffee-dark">Địa chỉ IP Máy in Wi-Fi (Cổng 9100)</label>
                    <input
                      type="text"
                      value={cfgPrinterIp}
                      onChange={(e) => setCfgPrinterIp(e.target.value)}
                      placeholder="VD: 192.168.1.167"
                      className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-coffee-dark">Port máy in</label>
                    <input
                      type="number"
                      value={cfgPrinterPort}
                      onChange={(e) => setCfgPrinterPort(e.target.value)}
                      placeholder="9100"
                      className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Địa chỉ IP Máy POS / Máy chủ in ngầm (Cổng 3333)</label>
                  <input
                    type="text"
                    value={cfgPosBridgeIp}
                    onChange={(e) => setCfgPosBridgeIp(e.target.value)}
                    placeholder="VD: 192.168.1.212"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary font-mono"
                  />
                  <p className="text-[11px] text-coffee-medium">Địa chỉ IP của máy tính POS quầy chạy app hoặc dịch vụ in ngầm.</p>
                </div>

                <div className="p-3 bg-[#FAF6F0] rounded-xl border border-coffee-light text-xs text-coffee-medium space-y-1">
                  <p>• <strong>Máy in Wi-Fi:</strong> IP 192.168.1.167 - Cổng 9100.</p>
                  <p>• <strong>Điện thoại:</strong> Khi nhân viên bấm Lưu đơn / Thanh toán trên điện thoại, hệ thống sẽ tự động gửi lệnh in qua mạng nội bộ và Cloud Realtime tới quầy để nhả bill tức thì.</p>
                </div>
              </div>

              <div className="pt-3 border-t border-coffee-light/60 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestPrinter}
                  disabled={testingPrinter}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-coffee-dark text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {testingPrinter ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span>In test thử kết nối</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveStoreSettings}
                  disabled={savingSettings}
                  className="px-5 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Lưu cấu hình máy in</span>
                </button>
              </div>
            </div>
          </div>

          {/* Thẻ 3: Sao Lưu & Dọn Dẹp An Toàn 3 Lớp */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-coffee-light space-y-6">
            <div className="flex items-center space-x-2 border-b border-coffee-light pb-3">
              <Database className="w-5 h-5 text-coffee-primary" />
              <div>
                <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
                  Sao Lưu Toàn Bộ CSDL & Dọn Dẹp Dữ Liệu An Toàn 3 Lớp
                </h4>
                <p className="text-xs text-coffee-medium mt-0.5">
                  Tải bản sao lưu dự phòng 1-click và tối ưu hóa dung lượng cơ sở dữ liệu để vận hành vĩnh viễn không lo đầy bộ nhớ.
                </p>
              </div>
            </div>

            {/* Phân vùng 1: Tải Bản Sao Lưu */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-[#FAF6F0] border border-coffee-light flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-coffee-dark">
                    <FileJson className="w-4.5 h-4.5 text-amber-700" />
                    <span>Sao lưu toàn bộ (Bản JSON Gốc)</span>
                  </div>
                  <p className="text-xs text-coffee-medium leading-relaxed">
                    Bao gồm toàn bộ đơn hàng, chi tiết đơn, nguyên liệu kho, công thức, thực đơn, chấm công, bàn và lịch sử kho nguyên bản phục vụ khôi phục hệ thống khi cần.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBackupJson}
                  disabled={exportingJson}
                  className="w-full py-3 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-2"
                >
                  {exportingJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Tải Full Backup JSON</span>
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-[#FAF6F0] border border-coffee-light flex flex-col justify-between space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-coffee-dark">
                    <FileSpreadsheet className="w-4.5 h-4.5 text-green-700" />
                    <span>Sao lưu toàn bộ (File Excel .xlsx Đa Sheet)</span>
                  </div>
                  <p className="text-xs text-coffee-medium leading-relaxed">
                    Tạo 1 file Excel gồm 8 trang tính phân loại chi tiết (Đơn hàng, Chi tiết, Kho, Món ăn, Chấm công, Chi phí, Bàn) dễ dàng mở và xem trên Microsoft Excel/Google Sheets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBackupExcel}
                  disabled={exportingExcel}
                  className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-2"
                >
                  {exportingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                  <span>Tải Full Backup Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Phân vùng 2: Dọn dẹp dữ liệu cũ an toàn 3 lớp */}
            <div className="p-5 rounded-2xl border border-red-200 bg-red-50/30 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-sm text-red-900">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    <span>Dọn Dẹp Dữ Liệu Lịch Sử Cũ (Tối Ưu Hóa Dung Lượng Supabase)</span>
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed">
                    Sau 1 đến 2 năm kinh doanh, hàng trăm nghìn đơn hàng và log kho cũ có thể làm tăng dung lượng CSDL. Bạn có thể chủ động dọn dẹp các dữ liệu cũ đã qua thời gian dài để giữ hệ thống luôn mượt mà và nằm trong gói miễn phí vĩnh viễn.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white rounded-xl border border-red-200 text-xs text-coffee-dark space-y-2">
                <div className="font-extrabold text-green-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>NGUYÊN TẮC BẢO VỆ 100% AN TOÀN TUYỆT ĐỐI:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-coffee-medium text-[11px] pl-1">
                  <li><strong>Số lượng tồn kho thực tế hiện tại (so_luong_ton) được giữ nguyên 100%</strong>, tuyệt đối không bị thay đổi.</li>
                  <li><strong>Thực đơn, danh mục, công thức pha chế, danh sách bàn và tài khoản nhân viên</strong> không bao giờ bị ảnh hưởng.</li>
                  <li><strong>Không xóa bất kỳ đơn hàng nào chưa thanh toán</strong> của ngày hôm nay.</li>
                  <li>Hệ thống <strong>tự động tạo bản sao lưu Excel tải về máy</strong> trước khi tiến hành xóa bất kỳ dòng nào.</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-coffee-dark shrink-0">Chọn mốc thời gian dọn dẹp:</span>
                  <select
                    value={cleanupHorizon}
                    onChange={(e: any) => setCleanupHorizon(e.target.value)}
                    className="h-11 px-3 bg-white border border-coffee-light rounded-xl text-xs font-bold text-coffee-dark focus:ring-1 focus:ring-coffee-primary"
                  >
                    <option value="180">Dữ liệu cũ hơn 6 tháng (180 ngày)</option>
                    <option value="365">Dữ liệu cũ hơn 1 năm (365 ngày)</option>
                    <option value="548">Dữ liệu cũ hơn 1.5 năm (548 ngày)</option>
                    <option value="730">Dữ liệu cũ hơn 2 năm (730 ngày)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCleanupConfirmText('');
                    setIsCleanupModalOpen(true);
                  }}
                  className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-2 self-start sm:self-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Bắt đầu dọn dẹp an toàn</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN 2 LỚP CHẤM CÔNG NGOÀI GIỜ */}
      {isOtConfirmModalOpen && (() => {
        const staff = users.find(u => u.id === otStaffId);
        const [inH, inM] = otStartTime.split(':').map(Number);
        const [outH, outM] = otEndTime.split(':').map(Number);
        const inMinutes = inH * 60 + inM;
        const outMinutes = outH * 60 + outM;
        const diffHours = outMinutes > inMinutes ? Math.round(((outMinutes - inMinutes) / 60) * 100) / 100 : 0;

        return (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
            <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 sm:space-y-5 border border-coffee-light my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="font-extrabold text-lg text-coffee-dark">
                  Xác nhận Chấm công Ngoài giờ
                </h3>
                <p className="text-xs text-coffee-medium">
                  Vui lòng kiểm tra kỹ thông tin ca làm trước khi lưu vào hệ thống.
                </p>
              </div>

              <div className="bg-[#FAF6F0] p-4 rounded-2xl border border-coffee-light/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-coffee-medium">Nhân viên:</span>
                  <span className="font-extrabold text-coffee-dark">{staff?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-coffee-medium">Ngày làm việc:</span>
                  <span className="font-bold text-coffee-dark">{new Date(otDate).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-coffee-medium">Ca làm việc:</span>
                  <span className="font-bold text-coffee-dark">{otShift}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-coffee-medium">Khung giờ:</span>
                  <span className="font-bold text-coffee-dark">{otStartTime} - {otEndTime}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-coffee-light/50">
                  <span className="font-bold text-coffee-dark">Tổng giờ tính công:</span>
                  <span className="font-black text-amber-700 text-sm">{diffHours} giờ</span>
                </div>
                {otNotes && (
                  <div className="pt-1 border-t border-coffee-light/50">
                    <span className="text-coffee-medium">Ghi chú:</span>
                    <p className="font-semibold text-coffee-dark italic mt-0.5">"{otNotes}"</p>
                  </div>
                )}
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold">🔒 Cơ chế bảo mật và phê duyệt:</p>
                <p>• Ca làm sẽ được đánh dấu <strong>[Quản lý chấm ngoài giờ]</strong> và chuyển thành <strong>Đã duyệt</strong> ngay lập tức.</p>
                <p>• Nhân viên sẽ <strong>bị khóa nút sửa</strong> ca này trong mục Chấm công cá nhân.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOtConfirmModalOpen(false)}
                  disabled={submittingOt}
                  className="py-3 bg-gray-100 hover:bg-gray-200 text-coffee-dark font-bold text-xs rounded-2xl transition"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveOvertime}
                  disabled={submittingOt}
                  className="py-3 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-2xl shadow transition flex items-center justify-center space-x-1.5"
                >
                  {submittingOt ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Xác nhận & Lưu</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* POPUP FORM CRUD SẢN PHẨM MỞ RỘNG (ĐỊNH MỨC & GIÁ VỐN) */}
      {isProductModalOpen && (() => {
        const estCost = calculateTotalEstimatedCost();
        const refPrice = Number(prodTakeawayPrice || prodDineinPrice || 0);
        const profit = refPrice - estCost;
        const profitMargin = refPrice > 0 ? Math.round((profit / refPrice) * 100) : 0;

        return (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
            <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-2xl w-full my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto shadow-2xl space-y-5 border border-coffee-accent/40 animate-scaleIn">
              <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-coffee-dark">
                    {editingProduct ? 'Cập nhật đồ uống & Định mức' : 'Thêm đồ uống mới'}
                  </h3>
                  <p className="text-xs text-coffee-medium mt-0.5">
                    Tùy chỉnh giá mang đi, giá tại quán, phân loại, ảnh, và công thức định lượng trừ kho
                  </p>
                </div>
                <button onClick={() => setIsProductModalOpen(false)} className="p-1.5 hover:bg-coffee-light rounded-xl text-coffee-medium">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-5 text-xs">
                {/* 1. Thông tin cơ bản & 2 mức giá */}
                <div className="space-y-3">
                  {/* Tên món */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-coffee-medium uppercase">Tên đồ uống *</label>
                    <input
                      type="text"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      placeholder="VD: Cà phê sữa muối, Nước ép thơm..."
                      className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                      required
                    />
                  </div>

                  {/* 2 mục giá: Giá mang đi & Giá tại quán */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-coffee-medium uppercase flex items-center justify-between">
                        <span>Giá mang đi (VND) *</span>
                        <span className="text-[10px] text-amber-700 font-extrabold uppercase bg-amber-100 px-1.5 py-0.5 rounded">Takeaway</span>
                      </label>
                      <input
                        type="number"
                        value={prodTakeawayPrice || ''}
                        onChange={(e) => setProdTakeawayPrice(Number(e.target.value))}
                        placeholder="VD: 25000"
                        className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-bold"
                        min={0}
                        step={1000}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-bold text-coffee-medium uppercase flex items-center justify-between">
                        <span>Giá tại quán (VND) *</span>
                        <span className="text-[10px] text-coffee-primary font-extrabold uppercase bg-coffee-cream/40 px-1.5 py-0.5 rounded">Tại quán</span>
                      </label>
                      <input
                        type="number"
                        value={prodDineinPrice || ''}
                        onChange={(e) => setProdDineinPrice(Number(e.target.value))}
                        placeholder="VD: 30000"
                        className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-bold"
                        min={0}
                        step={1000}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Phân loại & Trạng thái kho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-coffee-medium uppercase">Phân loại *</label>
                      <button
                        type="button"
                        onClick={() => setIsAddingNewCategory(!isAddingNewCategory)}
                        className="text-[11px] font-bold text-coffee-primary hover:underline"
                      >
                        {isAddingNewCategory ? 'Hủy thêm loại' : '+ Thêm loại mới'}
                      </button>
                    </div>

                    {isAddingNewCategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Nhập tên loại mới..."
                          className="flex-1 bg-[#FAF6F0] px-3.5 py-2 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleCreateCategoryInline}
                          disabled={savingCategory}
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xs shrink-0"
                        >
                          {savingCategory ? '...' : 'Lưu'}
                        </button>
                      </div>
                    ) : (
                      <select
                        value={prodCategoryId}
                        onChange={(e) => setProdCategoryId(e.target.value)}
                        className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                        required
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-coffee-medium uppercase">Trạng thái phục vụ</label>
                    <select
                      value={prodStatus}
                      onChange={(e) => setProdStatus(e.target.value as any)}
                      className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-medium"
                    >
                      <option value="Còn hàng">Còn hàng (Phục vụ bình thường)</option>
                      <option value="Hết hàng">Hết hàng (Tạm ngưng)</option>
                    </select>
                  </div>
                </div>

                {/* 3. Hình ảnh món */}
                <div className="space-y-2.5 bg-[#FAF6F0] p-4 rounded-2xl border border-coffee-light/70">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-coffee-medium uppercase block">Hình ảnh đồ uống</label>
                    {prodImageUrl ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{prodImageSizeKB ? `Chuẩn WebP (~${prodImageSizeKB} KB)` : 'Ảnh sẵn sàng'}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-coffee-medium italic">Chưa có ảnh (sử dụng logo mặc định)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Hộp xem trước ảnh */}
                    <div className="relative w-20 h-20 rounded-2xl border-2 border-dashed border-coffee-light overflow-hidden bg-white shrink-0 flex items-center justify-center shadow-inner group">
                      {isCompressingImage ? (
                        <div className="flex flex-col items-center justify-center text-coffee-primary p-2 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mb-1 text-coffee-accent" />
                          <span className="text-[9px] font-bold">Đang nén...</span>
                        </div>
                      ) : prodImageUrl ? (
                        <>
                          <img 
                            src={prodImageUrl} 
                            alt="Preview" 
                            className="w-full h-full object-cover" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/logo.jpg';
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition text-[10px] font-bold"
                            title="Xóa ảnh này"
                          >
                            <Trash2 className="w-4 h-4 mb-0.5 text-red-300" />
                            <span>Gỡ ảnh</span>
                          </button>
                        </>
                      ) : (
                        <Coffee className="w-8 h-8 text-coffee-light" />
                      )}
                    </div>

                    {/* Nút upload & thông tin */}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={`px-3.5 py-2 bg-white hover:bg-coffee-light border border-coffee-light rounded-xl font-bold text-coffee-primary cursor-pointer transition text-xs inline-flex items-center gap-1.5 shadow-sm ${
                          isCompressingImage ? 'opacity-50 pointer-events-none' : ''
                        }`}>
                          <Upload className="w-3.5 h-3.5" />
                          <span>{prodImageUrl ? 'Đổi ảnh khác' : 'Tải ảnh từ máy / điện thoại'}</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleImageFileChange} 
                            className="hidden" 
                            disabled={isCompressingImage}
                          />
                        </label>

                        {prodImageUrl && (
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl font-bold text-xs inline-flex items-center gap-1 transition shadow-sm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa ảnh</span>
                          </button>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] text-coffee-medium leading-relaxed">
                          ⚡ <strong>Tự động tối ưu WebP (~20KB):</strong> Lưu vĩnh viễn trên Supabase Cloud Database. Đồng bộ tức thì và xem được trên mọi máy tính, điện thoại nhân viên và App POS exe!
                        </p>
                        <input
                          type="text"
                          value={prodImageUrl}
                          onChange={(e) => {
                            setProdImageUrl(e.target.value);
                            setProdImageSizeKB(e.target.value ? estimateBase64SizeKB(e.target.value) : null);
                          }}
                          placeholder="Hoặc dán URL/đường dẫn ảnh: /products/CP001.png hoặc https://..."
                          className="w-full bg-white px-3.5 py-1.5 rounded-xl border border-coffee-light text-coffee-dark placeholder-coffee-medium/60 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Định mức & Công thức nguyên liệu */}
                <div className="space-y-3 pt-2 border-t border-coffee-light">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-sm text-coffee-dark">Công thức định lượng & Nguyên liệu</h4>
                      <p className="text-[11px] text-coffee-medium">Kho sẽ tự động trừ nguyên liệu gốc mỗi khi món này được bán</p>
                    </div>
                  </div>

                  {/* Danh sách các dòng nguyên liệu trong công thức */}
                  <div className="space-y-2">
                    {prodRecipeList.map((row, idx) => {
                      if (row.isPremix) {
                        const premixLabel = row.premix_type === 'nuoc_duong' 
                          ? `Nước đường (${row.premix_ml}ml)` 
                          : row.premix_type === 'hong_tra' 
                          ? `Nước cốt hồng trà (${row.premix_ml}ml)` 
                          : `Kem muối (${row.premix_ml}ml)`;
                        
                        const convertedDesc = row.premix_type === 'nuoc_duong'
                          ? `≈ ${Math.round((row.premix_ml || 0) * 0.8333 * 10) / 10}g đường kho`
                          : row.premix_type === 'hong_tra'
                          ? `≈ ${Math.round((row.premix_ml || 0) * 0.01875 * 10) / 10}g hồng trà kho`
                          : `≈ kem béo, sữa đặc, sữa tươi, muối biển`;

                        return (
                          <div key={row.id || idx} className="flex items-center justify-between p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs">
                            <div className="space-y-0.5">
                              <span className="font-bold text-coffee-dark">⚡ {premixLabel}</span>
                              <span className="text-[10px] text-amber-800 ml-2 font-medium">({convertedDesc})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveRecipeRow(idx)}
                              className="p-1 hover:bg-red-100 rounded-lg text-red-600 transition"
                              title="Xóa dòng"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }

                      const ing = ingredients.find(i => i.id === row.ingredient_id);
                      return (
                        <div key={row.id || idx} className="flex items-center justify-between p-2.5 bg-[#FAF6F0] border border-coffee-light rounded-xl text-xs">
                          <div className="space-y-0.5">
                            <span className="font-bold text-coffee-dark">{ing?.name || row.ingredient_id}</span>
                            <span className="text-coffee-medium ml-2 font-semibold">
                              : {row.quantity_needed} {ing?.unit || 'g/ml'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipeRow(idx)}
                            className="p-1 hover:bg-red-100 rounded-lg text-red-600 transition"
                            title="Xóa dòng"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}

                    {prodRecipeList.length === 0 && (
                      <p className="text-[11px] text-coffee-medium italic p-3 bg-[#FAF6F0] rounded-xl text-center">
                        Chưa có nguyên liệu nào. Thêm nguyên liệu kho hoặc pha sẵn ở bên dưới:
                      </p>
                    )}
                  </div>

                  {/* Bộ thêm nguyên liệu vào công thức */}
                  <div className="bg-[#FAF6F0] p-3.5 rounded-2xl border border-coffee-light space-y-3">
                    <div className="flex gap-2 border-b border-coffee-light/60 pb-2">
                      <button
                        type="button"
                        onClick={() => setRecipeAddType('stock')}
                        className={`px-3 py-1 rounded-xl font-bold text-xs transition ${
                          recipeAddType === 'stock' ? 'bg-coffee-primary text-white' : 'text-coffee-medium hover:bg-coffee-light'
                        }`}
                      >
                        Nguyên liệu trong kho
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecipeAddType('premix')}
                        className={`px-3 py-1 rounded-xl font-bold text-xs transition ${
                          recipeAddType === 'premix' ? 'bg-amber-600 text-white' : 'text-coffee-medium hover:bg-coffee-light'
                        }`}
                      >
                        ⚡ Nguyên liệu pha sẵn
                      </button>
                    </div>

                    {recipeAddType === 'stock' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-6">
                          <select
                            value={selectedStockIngId}
                            onChange={(e) => setSelectedStockIngId(e.target.value)}
                            className="w-full bg-white px-3 py-2 rounded-xl border border-coffee-light text-xs font-medium"
                          >
                            <option value="">-- Chọn nguyên liệu kho --</option>
                            {ingredients.map(i => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.unit})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <input
                            type="number"
                            value={selectedStockQty}
                            onChange={(e) => setSelectedStockQty(e.target.value)}
                            placeholder="Số lượng"
                            min={0}
                            step={0.1}
                            className="w-full bg-white px-3 py-2 rounded-xl border border-coffee-light text-xs font-bold"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button
                            type="button"
                            onClick={() => {
                              const qty = Number(selectedStockQty);
                              if (!selectedStockIngId || qty <= 0) {
                                toast.error('Vui lòng chọn nguyên liệu và số lượng > 0!');
                                return;
                              }
                              handleAddStockIngredient(selectedStockIngId, qty);
                              setSelectedStockQty('');
                            }}
                            className="w-full py-2 bg-coffee-primary hover:bg-coffee-dark text-white rounded-xl font-bold text-xs transition"
                          >
                            + Thêm
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-6">
                          <select
                            value={selectedPremixType}
                            onChange={(e) => setSelectedPremixType(e.target.value as any)}
                            className="w-full bg-white px-3 py-2 rounded-xl border border-coffee-light text-xs font-medium"
                          >
                            <option value="nuoc_duong">Nước đường (tự quy đổi đường kho)</option>
                            <option value="hong_tra">Nước cốt hồng trà (tự quy đổi trà kho)</option>
                            <option value="kem_muoi">Kem muối (tự quy đổi 4 nguyên liệu)</option>
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <input
                            type="number"
                            value={selectedPremixMl}
                            onChange={(e) => setSelectedPremixMl(e.target.value)}
                            placeholder="Số ml"
                            min={1}
                            className="w-full bg-white px-3 py-2 rounded-xl border border-coffee-light text-xs font-bold"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <button
                            type="button"
                            onClick={() => {
                              const ml = Number(selectedPremixMl);
                              if (ml <= 0) {
                                toast.error('Vui lòng nhập số ml > 0!');
                                return;
                              }
                              handleAddPremixIngredient(selectedPremixType, ml);
                              setSelectedPremixMl('');
                            }}
                            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition"
                          >
                            + Thêm
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Phụ liệu & Tính giá vốn */}
                <div className="space-y-2 pt-2 border-t border-coffee-light">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-coffee-medium uppercase">
                      Chi phí phụ liệu ngoài kho (Ly, nắp, ống hút, túi mang về...)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={prodBaseCost || ''}
                      onChange={(e) => setProdBaseCost(Number(e.target.value))}
                      placeholder="VD: 1500 (VND)"
                      min={0}
                      step={100}
                      className="w-full bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark font-bold"
                    />
                  </div>

                  {/* Thẻ thống kê tài chính dự tính */}
                  <div className="p-4 bg-[#FAF6F0] rounded-2xl border border-coffee-light grid grid-cols-3 gap-2 text-center mt-2">
                    <div>
                      <span className="text-[10px] text-coffee-medium uppercase font-bold block">Giá vốn ước tính</span>
                      <span className="text-sm font-extrabold text-red-600">
                        {estCost.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-coffee-medium uppercase font-bold block">Lãi gộp / ly</span>
                      <span className="text-sm font-extrabold text-green-600">
                        {profit.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-coffee-medium uppercase font-bold block">Biên lợi nhuận</span>
                      <span className="text-sm font-extrabold text-coffee-dark">
                        {profitMargin}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingProduct}
                    className="w-full py-3.5 bg-coffee-primary hover:bg-coffee-dark text-white font-extrabold text-sm rounded-2xl shadow transition flex items-center justify-center space-x-2"
                  >
                    {savingProduct ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang lưu đồ uống...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{editingProduct ? 'Lưu cập nhật đồ uống' : 'Thêm món vào thực đơn'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* POPUP FORM CRUD NHÂN VIÊN */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-coffee-accent/40 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
              <h3 className="font-extrabold text-base sm:text-lg text-coffee-dark">
                {editingStaff ? 'Cập nhật hồ sơ nhân viên' : 'Thêm nhân viên mới'}
              </h3>
              <button onClick={() => setIsStaffModalOpen(false)} className="p-1 hover:bg-coffee-light rounded-lg text-coffee-medium">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-4 text-xs">
              {/* Họ tên */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Họ và Tên</label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required
                />
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Tên đăng nhập (Username)</label>
                <input
                  type="text"
                  value={staffUsername}
                  onChange={(e) => setStaffUsername(e.target.value)}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required
                  disabled={!!editingStaff}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Mật khẩu (Password)</label>
                <input
                  type="password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder={editingStaff ? "Để trống nếu không muốn đổi mật khẩu" : "Mật khẩu cho tài khoản mới"}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required={!editingStaff}
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Email tài khoản</label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                  required
                  disabled={!!editingStaff} // Email thường không đổi khi sửa để tránh lệch khớp Auth
                />
              </div>

              {/* Vai trò */}
              <div className="space-y-1.5">
                <label className="font-bold text-coffee-medium uppercase">Phân quyền</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full bg-[#FAF6F0] px-4 py-3 rounded-2xl border-none focus:ring-2 focus:ring-coffee-accent text-coffee-dark"
                >
                  <option value="User">Nhân viên (User)</option>
                  <option value="Admin">Quản trị (Admin)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold rounded-2xl shadow transition"
              >
                Lưu nhân viên
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SỬA GIÁ NHẬP KHO (FEATURE 3) */}
      {isEditRestockModalOpen && editingRestockLog && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 sm:space-y-5 border border-coffee-accent/40 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light">
              <h3 className="font-extrabold text-base text-coffee-dark flex items-center space-x-2">
                <Edit className="w-4 h-4 text-coffee-primary" />
                <span>Cập nhật giá nhập kho</span>
              </h3>
              <button
                onClick={() => setIsEditRestockModalOpen(false)}
                className="p-1 hover:bg-coffee-light rounded-lg text-coffee-medium cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRestockCost} className="space-y-4 text-xs">
              <div className="bg-[#FAF6F0] p-3.5 rounded-2xl border border-coffee-light/60 space-y-1.5 text-coffee-medium">
                <div className="flex justify-between">
                  <span>Nguyên liệu:</span>
                  <strong className="text-coffee-dark">{editingRestockLog.ingredient_name || 'Khác'}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Ngày nhập:</span>
                  <strong className="text-coffee-dark">{new Date(editingRestockLog.created_at).toLocaleDateString('vi-VN')}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Số lượng:</span>
                  <strong className="text-coffee-dark">
                    +{formatIngredientRefill(editingRestockLog.change_amount, editingRestockLog.ingredient_unit || '', '')}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Chi phí cũ:</span>
                  <strong className="text-red-600">-{Number(editingRestockLog.cost || 0).toLocaleString('vi-VN')}đ</strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-coffee-dark uppercase text-[10px] tracking-wider block">
                  Tổng chi phí nhập mới (VNĐ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  placeholder="Nhập tổng số tiền thực tế..."
                  value={newRestockCost}
                  onChange={(e) => setNewRestockCost(e.target.value)}
                  className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-sm font-bold border-none focus:ring-2 focus:ring-coffee-primary text-coffee-dark outline-none"
                />
                <p className="text-[10px] text-coffee-medium italic">
                  💡 Hệ thống sẽ tự động cập nhật lại báo cáo tài chính ngày {new Date(editingRestockLog.created_at).toLocaleDateString('vi-VN')} và tính lại giá vốn trung bình cho nguyên liệu.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-coffee-light/60">
                <button
                  type="button"
                  onClick={() => setIsEditRestockModalOpen(false)}
                  disabled={submittingRestockCost}
                  className="px-4 py-2.5 bg-[#FAF6F0] hover:bg-coffee-light text-coffee-dark font-bold rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingRestockCost}
                  className="px-5 py-2.5 bg-coffee-primary hover:bg-coffee-dark text-white font-bold rounded-xl transition shadow shadow-coffee-primary/20 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingRestockCost ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu giá mới</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CRUD BÀN & SƠ ĐỒ */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 sm:space-y-5 border border-coffee-light my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light/60">
              <h3 className="font-extrabold text-base text-coffee-dark flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-coffee-primary" />
                <span>{editingTable ? 'Chỉnh Sửa Thông Tin Bàn' : 'Thêm Bàn Mới'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="p-1.5 hover:bg-[#FAF6F0] rounded-full text-coffee-medium transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-dark">Tên bàn / Khu vực *</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="VD: Bàn 01, Bàn Sân Thượng 02..."
                  className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-dark">Sức chứa (số chỗ ngồi)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  placeholder="4"
                  className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                />
              </div>

              {editingTable && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Trạng thái hiện tại</label>
                  <select
                    value={tableStatus}
                    onChange={(e: any) => setTableStatus(e.target.value)}
                    className="w-full h-11 px-3 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  >
                    <option value="Trống">Trống (Sẵn sàng đón khách)</option>
                    <option value="Đang phục vụ">Đang phục vụ (Có khách)</option>
                  </select>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsTableModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-coffee-dark font-bold text-xs rounded-xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingTable}
                  className="flex-1 py-3 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  {savingTable ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{editingTable ? 'Cập nhật' : 'Tạo bàn'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CRUD NGUYÊN LIỆU KHO */}
      {isIngModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl space-y-4 sm:space-y-5 border border-coffee-light my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="sticky top-0 bg-white z-10 -mt-1 pt-1 pb-3 flex items-center justify-between border-b border-coffee-light/60">
              <h3 className="font-extrabold text-base text-coffee-dark flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-coffee-primary" />
                <span>{editingIng ? 'Chỉnh Sửa Nguyên Liệu Kho' : 'Thêm Nguyên Liệu Mới Vào Kho'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsIngModalOpen(false)}
                className="p-1.5 hover:bg-[#FAF6F0] rounded-full text-coffee-medium transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-dark">Tên nguyên liệu *</label>
                <input
                  type="text"
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder="VD: Cà phê Robusta Đắk Lắk, Sữa đặc Larosee..."
                  className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  required
                />
              </div>

              {/* Đơn vị tính: chọn nhanh nút + nhập tự do */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-coffee-dark">Đơn vị tính cơ bản *</label>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {['ml', 'g', 'kg', 'lon', 'hộp', 'bịch', 'chai', 'ly', 'trái', 'bao'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setIngUnit(u)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                        ingUnit === u
                          ? 'bg-coffee-primary text-white border-coffee-primary shadow-xs'
                          : 'bg-[#FAF6F0] text-coffee-medium border-coffee-light hover:border-coffee-primary/40'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={ingUnit}
                  onChange={(e) => setIngUnit(e.target.value)}
                  placeholder="Nhập đơn vị khác (vd: gói, cuộn...)"
                  className="w-full h-10 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-coffee-dark">Quy cách đóng gói (không bắt buộc)</label>
                <input
                  type="text"
                  value={ingQuyCach}
                  onChange={(e) => setIngQuyCach(e.target.value)}
                  placeholder="VD: Thùng 24 lon, Chai 700ml, Túi 1kg..."
                  className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Mức cảnh báo sắp hết</label>
                  <input
                    type="number"
                    step="any"
                    value={ingMinStock}
                    onChange={(e) => setIngMinStock(e.target.value)}
                    placeholder="VD: 500 (ml) hoặc 5 (lon)"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>

                {!editingIng && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-coffee-dark">Số lượng tồn ban đầu</label>
                    <input
                      type="number"
                      step="any"
                      value={ingInitialStock}
                      onChange={(e) => setIngInitialStock(e.target.value)}
                      placeholder="0"
                      className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Đơn giá nhập (VNĐ/đơn vị)</label>
                  <input
                    type="number"
                    step="any"
                    value={ingDonGia}
                    onChange={(e) => setIngDonGia(e.target.value)}
                    placeholder="VD: 15000"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-coffee-dark">Giá vốn trung bình</label>
                  <input
                    type="number"
                    step="any"
                    value={ingGiaVon}
                    onChange={(e) => setIngGiaVon(e.target.value)}
                    placeholder="VD: 15000"
                    className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-coffee-dark border border-coffee-light/60 focus:ring-1 focus:ring-coffee-primary"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-coffee-light/60 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsIngModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-coffee-dark font-bold text-xs rounded-xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingIng}
                  className="flex-1 py-3 bg-coffee-primary hover:bg-coffee-dark text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  {savingIng ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{editingIng ? 'Lưu cập nhật' : 'Thêm nguyên liệu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DỌN DẸP DỮ LIỆU CŨ AN TOÀN 3 LỚP */}
      {isCleanupModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
          <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl space-y-4 sm:space-y-5 border border-red-200 my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto animate-scaleIn">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-lg text-red-900">
                Xác Nhận Dọn Dẹp Dữ Liệu Cũ
              </h3>
              <p className="text-xs text-coffee-medium leading-relaxed">
                Thao tác này sẽ dọn dẹp các đơn hàng và lịch sử kho <strong>cũ hơn {cleanupHorizon === '180' ? '6 tháng' : cleanupHorizon === '365' ? '1 năm' : cleanupHorizon === '548' ? '1.5 năm' : '2 năm'}</strong>.
              </p>
            </div>

            <div className="p-3.5 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-900 space-y-1">
              <p className="font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-700" />
                <span>Cam kết an toàn tuyệt đối 100%:</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                • <strong>Số lượng tồn kho thực tế hiện tại (so_luong_ton) không bị thay đổi</strong>.<br />
                • Hệ thống sẽ tự động tải về máy bạn 1 bản sao lưu Excel trước khi dọn dẹp.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-coffee-dark block">
                Để xác nhận, vui lòng gõ chính xác cụm từ <strong className="text-red-600 font-mono">XAC NHAN XOA</strong>:
              </label>
              <input
                type="text"
                value={cleanupConfirmText}
                onChange={(e) => setCleanupConfirmText(e.target.value)}
                placeholder="XAC NHAN XOA"
                className="w-full h-11 px-4 bg-[#FAF6F0] rounded-xl text-xs font-bold text-red-600 border border-red-300 focus:ring-2 focus:ring-red-500 font-mono uppercase text-center"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCleanupModalOpen(false)}
                disabled={cleaningUp}
                className="py-3 bg-gray-100 hover:bg-gray-200 text-coffee-dark font-bold text-xs rounded-xl transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanup}
                disabled={cleaningUp || cleanupConfirmText.trim() !== 'XAC NHAN XOA'}
                className="py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
              >
                {cleaningUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Dọn dẹp ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- HELPER CALENDAR COMPONENTS FOR ADMIN ---

function CalendarView({
  type,
  items,
  currentCalDate,
  setCurrentCalDate,
  onSelectDay
}: {
  type: 'shifts' | 'leaves';
  items: any[];
  currentCalDate: Date;
  setCurrentCalDate: React.Dispatch<React.SetStateAction<Date>>;
  onSelectDay: (day: Date) => void;
}) {
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => {
    const firstDay = new Date(y, m, 1);
    const startDayOfWeek = firstDay.getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();
    const prevMonthTotalDays = new Date(y, m, 0).getDate();
    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(y, m - 1, prevMonthTotalDays - i),
        isCurrentMonth: false
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        date: new Date(y, m, i),
        isCurrentMonth: true
      });
    }

    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        date: new Date(y, m + 1, i),
        isCurrentMonth: false
      });
    }

    return cells;
  };

  const cells = getDaysInMonth(year, month);
  const weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return (
    <div className="bg-white rounded-3xl border border-coffee-light shadow-sm p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between pb-2 border-b border-coffee-light/60">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-5 h-5 text-coffee-primary" />
          <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
            Tháng {month + 1} / {year}
          </h4>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setCurrentCalDate(new Date(year, month - 1, 1))}
            className="p-1.5 hover:bg-[#FAF6F0] border border-coffee-light rounded-xl transition text-coffee-medium"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentCalDate(new Date())}
            className="px-3 py-1.5 hover:bg-[#FAF6F0] border border-coffee-light rounded-xl text-[10px] font-bold transition text-coffee-primary"
          >
            Hôm nay
          </button>
          <button
            onClick={() => setCurrentCalDate(new Date(year, month + 1, 1))}
            className="p-1.5 hover:bg-[#FAF6F0] border border-coffee-light rounded-xl transition text-coffee-medium"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] uppercase text-coffee-medium">
        {weekdayNames.map((day, idx) => (
          <div key={idx} className="py-2 bg-[#FAF6F0] rounded-xl border border-coffee-light/40">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 border-t border-l border-coffee-light/35 animate-fade-in">
        {cells.map((cell, idx) => {
          const cellYmd = getLocalDateString(cell.date);
          const isToday = getLocalDateString(new Date()) === cellYmd;
          
          let cellEvents: any[] = [];
          if (type === 'shifts') {
            cellEvents = items.filter(s => s.localYmd === cellYmd);
          } else {
            cellEvents = items.filter(l => cellYmd >= l.startYmd && cellYmd <= l.endYmd);
          }

          const visibleEvents = cellEvents.slice(0, 3);
          const extraCount = cellEvents.length - visibleEvents.length;

          return (
            <div
              key={idx}
              onClick={() => onSelectDay(cell.date)}
              className={`min-h-[105px] p-2 border-r border-b border-coffee-light/35 flex flex-col justify-between transition cursor-pointer hover:bg-[#FAF6F0]/40 ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-[#FAF6F0]/20'
              } ${isToday ? 'ring-2 ring-coffee-accent ring-inset' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span
                  className={`text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ${
                    isToday
                      ? 'bg-coffee-primary text-white'
                      : cell.isCurrentMonth
                      ? 'text-coffee-dark'
                      : 'text-coffee-medium/40'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                {cellEvents.length > 0 && (
                  <span className="text-[8px] bg-coffee-light px-1.5 py-0.5 rounded-full text-coffee-medium font-bold">
                    {cellEvents.length}
                  </span>
                )}
              </div>

              <div className="space-y-1 mt-1.5 flex-grow overflow-hidden">
                {visibleEvents.map((ev, evIdx) => {
                  let pillBg = 'bg-green-50 text-green-700 border-green-200';
                  if (ev.status === 'Chờ duyệt') {
                    pillBg = 'bg-yellow-50 text-yellow-800 border-yellow-200';
                  } else if (ev.status === 'Từ chối') {
                    pillBg = 'bg-red-50 text-red-700 border-red-200';
                  } else if (ev.status === 'Đang trong ca') {
                    pillBg = 'bg-blue-50 text-blue-700 border-blue-200';
                  }

                  const text = type === 'shifts' 
                    ? `${ev.staffName.split(' ').pop()} (${ev.hours.toFixed(1)}h)`
                    : `${ev.staffName.split(' ').pop()} (Nghỉ)`;

                  return (
                    <div
                      key={evIdx}
                      className={`text-[8px] font-extrabold px-1 py-0.5 rounded border leading-tight truncate shadow-sm ${pillBg}`}
                      title={type === 'shifts' ? `${ev.staffName} - ${ev.shiftName}` : `${ev.staffName} - Nghỉ: ${ev.reason}`}
                    >
                      {text}
                    </div>
                  );
                })}
                {extraCount > 0 && (
                  <div className="text-[8px] text-coffee-medium font-bold text-center italic py-0.5">
                    + {extraCount} khác...
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayDetailsModal({
  type,
  day,
  items,
  onClose
}: {
  type: 'shifts' | 'leaves';
  day: Date;
  items: any[];
  onClose: () => void;
}) {
  const getLocalDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const cellYmd = getLocalDateString(day);
  
  let dayEvents: any[] = [];
  if (type === 'shifts') {
    dayEvents = items.filter(s => s.localYmd === cellYmd);
  } else {
    dayEvents = items.filter(l => cellYmd >= l.startYmd && cellYmd <= l.endYmd);
  }

  const formattedDate = day.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] overflow-y-auto p-3 sm:p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center items-start sm:items-center">
      <div className="bg-white rounded-3xl max-w-md w-full border border-coffee-light shadow-2xl p-5 sm:p-6 flex flex-col my-auto max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-hidden space-y-4 animate-scaleIn">
        <div className="flex items-center justify-between border-b border-coffee-light/60 pb-3">
          <div className="space-y-0.5">
            <h4 className="font-extrabold text-sm text-coffee-dark uppercase tracking-wider">
              {type === 'shifts' ? 'Ca trực trong ngày' : 'Nghỉ phép trong ngày'}
            </h4>
            <p className="text-[10px] text-coffee-medium font-bold">{formattedDate}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#FAF6F0] rounded-full text-coffee-medium transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto space-y-3 pr-1">
          {dayEvents.length === 0 ? (
            <p className="text-center italic text-coffee-medium/70 text-xs py-8">
              Không có bản ghi nào trong ngày này.
            </p>
          ) : (
            dayEvents.map((ev, idx) => (
              <div
                key={idx}
                className="p-4 bg-[#FAF6F0]/40 rounded-2xl border border-coffee-light/60 space-y-3 text-xs"
              >
                <div className="flex justify-between items-center border-b border-coffee-light/30 pb-2">
                  <span className="font-bold text-coffee-dark text-sm">{ev.staffName}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    ev.status === 'Đã duyệt' ? 'bg-green-100 text-green-800' :
                    ev.status === 'Chờ duyệt' ? 'bg-yellow-100 text-yellow-800' :
                    ev.status === 'Từ chối' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {ev.status}
                  </span>
                </div>

                {type === 'shifts' ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px] leading-relaxed">
                    <p className="col-span-2 text-coffee-dark font-extrabold">Ca làm: {ev.shiftName}</p>
                    <div>
                      <p className="text-[9px] uppercase font-bold text-coffee-medium">Khai báo vào</p>
                      <p className="text-coffee-dark font-medium">{ev.checkIn.split(' ')[0]}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase font-bold text-coffee-medium">Khai báo ra</p>
                      <p className="text-coffee-dark font-medium">{ev.checkOut.split(' ')[0]}</p>
                    </div>
                    <div className="col-span-2 border-t border-coffee-light/20 pt-2 flex justify-between items-center text-xs">
                      <span className="font-bold text-coffee-primary">Số giờ làm:</span>
                      <span className="font-black text-coffee-primary text-sm">{ev.hours.toFixed(2)}h</span>
                    </div>
                    {ev.noteIn && (
                      <p className="col-span-2 text-coffee-medium italic">Ghi chú vào: "{ev.noteIn}"</p>
                    )}
                    {ev.noteOut && (
                      <p className="col-span-2 text-coffee-medium italic">Ghi chú ra: "{ev.noteOut}"</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1 text-[11px] leading-relaxed">
                    <p className="text-coffee-dark">Thời gian nghỉ: <strong>{ev.startDate}</strong> đến <strong>{ev.endDate}</strong></p>
                    <p className="text-coffee-dark">Số ngày nghỉ: <strong>{ev.days} ngày</strong></p>
                    <p className="text-coffee-medium italic">Lý do nghỉ: "{ev.reason}"</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t border-coffee-light/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-coffee-primary hover:bg-coffee-dark text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
