'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Coffee, 
  CreditCard, 
  Clock, 
  CalendarDays, 
  ShieldCheck, 
  UserCheck,
  ChevronRight,
  BarChart3,
  ShoppingBag,
  Loader2,
  Boxes
} from 'lucide-react';
import { db, getCurrentUser } from '@/lib/database';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stats, setStats] = useState(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('ava_cached_stats');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
    }
    return {
      totalTables: 0,
      servingTables: 0,
      unpaidBills: 0,
      pendingApprovals: 0
    };
  });
  const [todayShiftStatus, setTodayShiftStatus] = useState(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('ava_cached_shift');
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
    }
    return {
      text: 'Chưa chấm công',
      color: 'bg-red-500/20 border-red-400/30 text-red-200'
    };
  });
  const [greeting, setGreeting] = useState('Chào bạn');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Chào buổi sáng');
    else if (hour < 18) setGreeting('Chào buổi chiều');
    else setGreeting('Chào buổi tối');

    async function loadStats() {
      try {
        const isAdmin = user && user.role === 'Admin';

        // Tải dữ liệu bàn, đơn chưa thanh toán, chấm công, nghỉ phép và kho hàng (tối ưu hóa siêu nhẹ)
        const [tables, unpaidOrders, logs, leaves, pendingInvLogs] = await Promise.all([
          db.getTables(),
          db.getUnpaidOrders(),
          db.getTimeLogs(),
          db.getLeaveRequests(),
          db.getPendingInventoryLogs()
        ]);

        const serving = tables.filter((t: any) => t.status === 'Đang phục vụ').length;
        const unpaid = (unpaidOrders || []).length;
        
        let pendingTime = 0;
        let pendingLeave = 0;
        let pendingInv = 0;

        if (isAdmin) {
          // Admin: Xem tổng số lượng yêu cầu đang chờ phê duyệt của toàn hệ thống
          pendingTime = (logs || []).filter((l: any) => l.status === 'Chờ duyệt').length;
          pendingLeave = (leaves || []).filter((r: any) => r.status === 'Chờ duyệt').length;
          pendingInv = (pendingInvLogs || []).length;
        } else if (user) {
          // Nhân viên: Chỉ đếm các đơn của MÌNH nộp đang chờ duyệt
          pendingTime = (logs || []).filter((l: any) => l.user_id === user.id && l.status === 'Chờ duyệt').length;
          pendingLeave = (leaves || []).filter((r: any) => r.user_id === user.id && r.status === 'Chờ duyệt').length;
          pendingInv = (pendingInvLogs || []).filter((r: any) => r.staff_id === user.id).length;
        }

        const newStats = {
          totalTables: tables.length,
          servingTables: serving,
          unpaidBills: unpaid,
          pendingApprovals: pendingTime + pendingLeave + pendingInv
        };

        setStats(newStats);
        localStorage.setItem('ava_cached_stats', JSON.stringify(newStats));

        // Tính toán trạng thái ca trực hôm nay của nhân viên hiện tại
        if (user) {
          const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
          const myLogs = logs.filter((l: any) => l.user_id === user.id);
          const todayLogs = myLogs.filter((l: any) => {
            const logDateStr = new Date(l.check_in_time).toLocaleDateString('en-CA');
            return logDateStr === todayStr;
          });

          let statusText = 'Chưa chấm công';
          let statusColor = 'bg-red-500/20 border-red-400/30 text-red-200';

          if (todayLogs.length > 0) {
            const hasActiveShift = todayLogs.some((l: any) => !l.check_out_time);

            if (hasActiveShift) {
              statusText = 'Đang trong ca';
              statusColor = 'bg-yellow-500/20 border-yellow-400/30 text-yellow-200';
            } else {
              statusText = 'Hoàn tất ca làm';
              statusColor = 'bg-green-500/20 border-green-400/30 text-green-200';
            }
          }

          const newShiftStatus = {
            text: statusText,
            color: statusColor
          };
          setTodayShiftStatus(newShiftStatus);
          localStorage.setItem('ava_cached_shift', JSON.stringify(newShiftStatus));
        }
      } catch (e) {
        console.error('Lỗi khi tải thống kê trang chủ:', e);
      }
    }
    loadStats();
  }, []);

  const actionCards = [
    {
      name: 'Bán hàng (POS)',
      description: 'Ghi đơn gọi món tại bàn, đồng bộ tức thì.',
      path: '/pos',
      icon: ShoppingBag,
      color: 'bg-amber-100/60 border-amber-300 text-amber-900',
      badge: stats.servingTables > 0 ? `${stats.servingTables} bàn bận` : 'POS',
      group: 'daily'
    },
    {
      name: 'Thanh toán',
      description: 'Thanh toán hóa đơn bàn, in bill nhiệt 80mm.',
      path: '/payment',
      icon: CreditCard,
      color: 'bg-blue-50 border-blue-200 text-blue-950',
      badge: stats.unpaidBills > 0 ? `${stats.unpaidBills} hóa đơn` : 'Trống',
      group: 'daily'
    },
    {
      name: 'Chấm công vào ca',
      description: 'Bắt đầu ca làm việc, ghi nhận GPS vào ca.',
      path: '/time-log?type=in',
      icon: Clock,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-950',
      badge: 'Vào ca',
      group: 'daily'
    },
    {
      name: 'Chấm công ra ca',
      description: 'Kết thúc ca làm việc, ghi nhận GPS ra ca.',
      path: '/time-log?type=out',
      icon: Clock,
      color: 'bg-teal-50 border-teal-200 text-teal-950',
      badge: 'Ra ca',
      group: 'daily'
    },
    {
      name: 'Kho',
      description: 'Theo dõi tồn kho thực tế, nhập thêm và kiểm kê.',
      path: '/inventory',
      icon: Boxes,
      color: 'bg-amber-50 border-amber-200 text-amber-950',
      badge: 'Nguyên liệu',
      group: 'other'
    },
    {
      name: 'Báo cáo ca trực',
      description: 'Xem doanh thu và số lượng đơn theo ca sáng/chiều.',
      path: '/daily-report',
      icon: BarChart3,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-950',
      badge: 'Doanh thu',
      group: 'other'
    },
    {
      name: 'Thực đơn (Menu)',
      description: 'Xem chi tiết các món uống, đơn giá, hình ảnh món.',
      path: '/menu',
      icon: Coffee,
      color: 'bg-orange-50 border-orange-200 text-orange-950',
      badge: 'Món nước',
      group: 'other'
    },
    {
      name: 'Xin nghỉ phép',
      description: 'Gửi đơn đăng ký nghỉ phép có định vị gửi đơn.',
      path: '/leave',
      icon: CalendarDays,
      color: 'bg-purple-50 border-purple-200 text-purple-950',
      badge: 'Đăng ký',
      group: 'other'
    },
    {
      name: 'Quản trị (Admin)',
      description: 'Duyệt yêu cầu chấm công, xem doanh số tháng.',
      path: '/admin',
      icon: ShieldCheck,
      color: 'bg-rose-50 border-rose-200 text-rose-950',
      badge: stats.pendingApprovals > 0 ? `${stats.pendingApprovals} duyệt` : 'Hệ thống',
      requiresAdmin: true,
      group: 'other'
    }
  ];

  // Chỉ hiển thị các card mà user được phép truy cập (Ẩn nút Admin hoàn toàn đối với User)
  const visibleCards = actionCards.filter(card => {
    if (card.requiresAdmin && currentUser?.role !== 'Admin') {
      return false;
    }
    return true;
  });

  const dailyCards = visibleCards.filter(card => card.group === 'daily');
  const otherCards = visibleCards.filter(card => card.group === 'other');

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* BANNER CHÀO MỪNG TỔNG HỢP THÔNG TIN */}
      <div className="bg-gradient-to-br from-coffee-primary to-coffee-dark rounded-3xl p-6 text-white shadow-lg relative overflow-hidden space-y-6">
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-coffee-medium/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute left-1/3 top-0 -translate-y-16 w-32 h-32 bg-coffee-accent/10 rounded-full blur-lg pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-coffee-accent uppercase tracking-widest">{greeting}</span>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              {currentUser?.full_name || 'Nhân viên AVA Coffee K300'}
            </h2>
            <p className="text-[11px] text-coffee-light/95 max-w-md leading-normal">
              Chào mừng bạn đến với AVA Coffee (Chi nhánh K300). Chọn chức năng bên dưới để bắt đầu ca làm việc của mình.
            </p>
          </div>

          {/* Ngày giờ đơn giản trên cùng 1 hàng, không có ô */}
          <div className="text-right text-xs font-bold text-coffee-accent/90 shrink-0 self-start sm:self-auto flex items-center space-x-2">
            <span>{(typeof window !== 'undefined') ? new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : '00:00'}</span>
            <span className="text-coffee-light/40">•</span>
            <span>{(typeof window !== 'undefined') ? new Date().toLocaleDateString('vi-VN') : ''}</span>
          </div>
        </div>

        {/* QUICK STATS SUMMARY GRID INSIDE BANNER */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
          {/* Bàn phục vụ (ĐẶC BIỆT NỔI BẬT) */}
          <div className="bg-amber-500/30 backdrop-blur-sm border border-amber-400/40 p-3.5 rounded-2xl flex flex-col justify-between h-20 shadow-md">
            <span className="text-[9px] font-black text-amber-200 uppercase tracking-wider">Bàn phục vụ</span>
            <div className="flex items-end justify-between">
              <h4 className="font-black text-lg text-white leading-none">{stats.servingTables} / {stats.totalTables}</h4>
              <span className="text-[8px] font-bold text-amber-100 bg-amber-500/45 px-1.5 py-0.5 rounded-md uppercase tracking-wider scale-90 origin-right">Đang mở</span>
            </div>
          </div>

          {/* Hóa đơn chờ (ĐẶC BIỆT NỔI BẬT) */}
          <div className="bg-orange-500/30 backdrop-blur-sm border border-orange-400/40 p-3.5 rounded-2xl flex flex-col justify-between h-20 shadow-md">
            <span className="text-[9px] font-black text-orange-200 uppercase tracking-wider">Hóa đơn chờ</span>
            <div className="flex items-end justify-between">
              <h4 className="font-black text-lg text-white leading-none">{stats.unpaidBills} HĐ</h4>
              <span className="text-[8px] font-bold text-orange-100 bg-orange-500/45 px-1.5 py-0.5 rounded-md uppercase tracking-wider scale-90 origin-right">Chưa trả</span>
            </div>
          </div>

          {/* Yêu cầu chờ duyệt */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-3.5 rounded-2xl flex flex-col justify-between h-20 shadow-sm">
            <span className="text-[9px] font-bold text-coffee-light/80 uppercase tracking-wider">
              {currentUser?.role === 'Admin' ? 'Chờ phê duyệt' : 'Đơn của tôi chờ'}
            </span>
            <h4 className="font-black text-base text-white leading-none">{stats.pendingApprovals} đơn</h4>
          </div>

          {/* Trạng thái ca trực (Động & màu sắc code tùy trạng thái) */}
          <div className={`backdrop-blur-sm border p-3.5 rounded-2xl flex flex-col justify-between h-20 shadow-sm transition-all duration-300 ${todayShiftStatus.color}`}>
            <span className="text-[9px] font-black uppercase tracking-wider">Trạng thái ca</span>
            <h4 className="font-extrabold text-[11px] truncate leading-none">{todayShiftStatus.text}</h4>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS GRID (APP LAUNCHER TILE FORMAT) */}
      <div className="space-y-6">
        {/* Nhóm Nhiệm vụ mỗi ngày */}
        <div className="space-y-3">
          <h3 className="font-black text-base md:text-lg text-coffee-dark uppercase tracking-wider border-l-4 border-coffee-primary pl-2">Nhiệm vụ mỗi ngày</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {dailyCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.path}
                  href={card.path}
                  className="group relative bg-white p-4 rounded-2xl border border-coffee-light flex flex-col justify-between h-36 hover:-translate-y-1 hover:shadow-md transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className={`p-2.5 rounded-xl border ${card.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 bg-[#FAF6F0] text-coffee-primary rounded-md uppercase tracking-wider shrink-0">
                      {card.badge}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-sm text-coffee-dark tracking-tight flex items-center space-x-1">
                      <span>{card.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-coffee-medium/40 group-hover:translate-x-0.5 transition-transform" />
                    </h4>
                    <p className="text-[10px] text-coffee-medium leading-snug line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Nhóm Tính năng Khác */}
        <div className="space-y-3">
          <h3 className="font-black text-base md:text-lg text-coffee-dark uppercase tracking-wider border-l-4 border-coffee-medium pl-2">Khác</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {otherCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.path}
                  href={card.path}
                  className="group relative bg-white p-4 rounded-2xl border border-coffee-light flex flex-col justify-between h-36 hover:-translate-y-1 hover:shadow-md transition-all duration-300 shadow-sm"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className={`p-2.5 rounded-xl border ${card.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 bg-[#FAF6F0] text-coffee-primary rounded-md uppercase tracking-wider shrink-0">
                      {card.badge}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <h4 className="font-extrabold text-sm text-coffee-dark tracking-tight flex items-center space-x-1">
                      <span>{card.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-coffee-medium/40 group-hover:translate-x-0.5 transition-transform" />
                    </h4>
                    <p className="text-[10px] text-coffee-medium leading-snug line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

