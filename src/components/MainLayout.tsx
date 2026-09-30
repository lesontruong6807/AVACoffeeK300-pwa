'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Coffee, 
  LayoutDashboard, 
  ShoppingBag, 
  CreditCard, 
  Clock, 
  CalendarDays, 
  ShieldCheck, 
  Menu, 
  X, 
  UserCheck, 
  Globe, 
  WifiOff,
  AlertCircle,
  Loader2,
  BarChart3
} from 'lucide-react';
import { getCurrentUser, setCurrentUser, isSupabaseConfigured, mockDb, db } from '@/lib/database';
import TauriFullscreenButton from '@/components/TauriFullscreenButton';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setUser] = useState<any>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Trạng thái Toast thông báo
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');

  // Trạng thái Form đăng nhập
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const loggedUser = getCurrentUser();
    setUser(loggedUser);
    setAvailableUsers(mockDb.getUsers());

    // Tự động kiểm tra phiên an toàn: CHỈ KICK khi Supabase kết nối thành công và xác nhận bị xóa/đổi pass
    // TUYỆT ĐỐI KHÔNG KICK KHI MẠNG YẾU / OFFLINE
    if (loggedUser) {
      db.validateUserSession(loggedUser).then((res: any) => {
        if (!res.valid) {
          console.warn(`Tài khoản không còn hiệu lực (${res.reason}). Đang đăng xuất...`);
          setCurrentUser(null);
          setUser(null);
          window.location.reload();
        } else if (res.user && (res.user.id !== loggedUser.id || res.user.full_name !== loggedUser.full_name)) {
          // Tự động sửa lại đúng thông tin (ví dụ từ Nguyễn Văn Minh sang Lê Phước Long)
          setCurrentUser(res.user);
          setUser(res.user);
        }
      }).catch(err => console.warn('Lỗi kiểm tra phiên:', err));
    }

    // Đăng ký bộ lắng nghe sự kiện Toast
    const handleShowToast = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      setToastMessage(message);
      setToastType(type || 'success');
    };
    window.addEventListener('show-toast', handleShowToast);



    return () => window.removeEventListener('show-toast', handleShowToast);
  }, []);

  // Tự động ẩn toast sau 3 giây
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const user = await db.login(loginUsername, loginPassword);
      if (user) {
        setCurrentUser(user);
        setUser(user);
        window.location.reload();
      } else {
        setLoginError('Mã đăng nhập hoặc mật khẩu không chính xác!');
      }
    } catch (err) {
      setLoginError('Có lỗi xảy ra khi kết nối cơ sở dữ liệu!');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUser(null);
    window.location.reload();
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-coffee-light flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Coffee className="w-12 h-12 text-coffee-primary animate-bounce" />
          <span className="text-coffee-dark font-medium">Đang tải AVA Coffee...</span>
        </div>
      </div>
    );
  }

  const isCustomerDisplay = 
    pathname === '/customer-display' || 
    pathname.startsWith('/customer-display') ||
    pathname.includes('customer-display') ||
    (typeof window !== 'undefined' && (window.location.pathname.includes('customer-display') || window.location.href.includes('customer-display')));
  if (isCustomerDisplay) {
    return <>{children}</>;
  }

  // MÀN HÌNH ĐĂNG NHẬP BẮT BUỘC NẾU CHƯA CÓ SESSION
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#2C1D11] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Lớp nền radial gradient ấm áp */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(74,53,37,0.5),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(44,29,17,0.8),transparent_60%)]" />
        
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-coffee-accent/20 z-10 relative">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/logo.jpg" 
              alt="AVA Coffee Logo" 
              className="w-24 h-24 rounded-2xl shadow-md border-2 border-coffee-accent/40 object-cover mb-4" 
            />
            <h1 className="text-2xl font-black text-coffee-dark tracking-wider">AVA COFFEE</h1>
            <p className="text-xs text-coffee-medium font-semibold uppercase tracking-wider mt-1">Chi nhánh K300</p>
            <p className="text-xs text-coffee-medium font-semibold uppercase tracking-wider mt-1">POS & Quản Lý Cửa Hàng</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-coffee-dark mb-1.5 uppercase tracking-wide">
                Mã đăng nhập (User ID)
              </label>
              <input 
                type="text" 
                required
                placeholder="Ví dụ: admin, nv001..." 
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-coffee-accent/30 focus:border-coffee-primary focus:ring-2 focus:ring-coffee-primary/20 outline-none text-sm text-coffee-dark bg-[#FAF6F0] transition-all"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-coffee-dark mb-1.5 uppercase tracking-wide">
                Mật khẩu
              </label>
              <input 
                type="password" 
                required
                placeholder="Nhập mật khẩu..." 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-coffee-accent/30 focus:border-coffee-primary focus:ring-2 focus:ring-coffee-primary/20 outline-none text-sm text-coffee-dark bg-[#FAF6F0] transition-all"
              />
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl flex items-center space-x-2 animate-pulse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-coffee-primary hover:bg-coffee-dark text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-all shadow-md flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <span>Đăng nhập hệ thống</span>
              )}
            </button>
          </form>

          {/* Hộp thông tin tài khoản demo */}
          <div className="mt-8 pt-6 border-t border-coffee-light text-center text-xs text-coffee-medium">
            <p className="font-semibold mb-1.5">Tài khoản thử nghiệm hệ thống:</p>
            <div className="grid grid-cols-2 gap-2 text-left bg-[#FAF6F0] p-3 rounded-xl border border-coffee-accent/10">
              <div>
                <p className="font-bold text-coffee-dark">Quyền Admin:</p>
                <p className="font-mono text-[10px]">ID: <span className="font-bold">admin</span></p>
                <p className="font-mono text-[10px]">Pass: <span className="font-bold">123456</span></p>
              </div>
              <div>
                <p className="font-bold text-coffee-dark">Quyền Nhân viên:</p>
                <p className="font-mono text-[10px]">ID: <span className="font-bold">nv001</span></p>
                <p className="font-mono text-[10px]">Pass: <span className="font-bold">123456</span></p>
              </div>
            </div>
            <div className="mt-3 text-[10px]">
              Chế độ kết nối: {isSupabaseConfigured ? (
                <span className="text-green-600 font-bold">Supabase Online</span>
              ) : (
                <span className="text-amber-600 font-bold">Mock DB Offline</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPosScreen = pathname === '/pos' || pathname.startsWith('/pos');

  if (isPosScreen) {
    return (
      <div className="w-full h-[100dvh] overflow-hidden bg-[#FAF6F0] text-coffee-dark font-sans select-none flex flex-col">
        {children}
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in transition-all duration-300 pointer-events-none">
            <div className={`px-5 py-3 rounded-2xl shadow-xl border text-xs font-black flex items-center space-x-2.5 backdrop-blur-md ${
              toastType === 'success' 
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-100/50' 
                : toastType === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-900 shadow-red-100/50'
                : 'bg-blue-50/95 border-blue-200 text-blue-900 shadow-blue-100/50'
            }`}>
              <span className="text-sm">
                {toastType === 'success' ? '✅' : toastType === 'error' ? '❌' : 'ℹ️'}
              </span>
              <span>{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleUserChange = (user: any) => {
    setCurrentUser(user);
    setUser(user);
    setIsUserDropdownOpen(false);
    // Reload trang để cập nhật quyền truy cập ở các component khác
    window.location.reload();
  };

  const navItems = [
    { name: 'Trang chủ', path: '/', icon: LayoutDashboard },
    { name: 'Bán hàng (POS)', path: '/pos', icon: ShoppingBag },
    { name: 'Hóa đơn chưa thanh toán', path: '/payment', icon: CreditCard },
    { name: 'Báo cáo ca trực', path: '/daily-report', icon: BarChart3 },
    { name: 'Thực đơn (Menu)', path: '/menu', icon: Coffee },
    { name: 'Chấm công', path: '/time-log', icon: Clock },
    { name: 'Xin nghỉ phép', path: '/leave', icon: CalendarDays },
  ];

  // Chỉ hiển thị link Admin nếu user là Admin
  if (currentUser?.role === 'Admin') {
    navItems.push({ name: 'Quản lý (Admin)', path: '/admin', icon: ShieldCheck });
  }

  return (
    <div className="flex min-h-screen bg-[#FAF6F0] text-coffee-dark font-sans">
      {/* SIDEBAR FOR DESKTOP */}
      <aside className="hidden md:flex flex-col w-64 bg-coffee-primary text-white shadow-xl">
        <div className="p-6 border-b border-coffee-medium flex items-center space-x-3">
          <div className="w-11 h-11 bg-black rounded-xl overflow-hidden flex items-center justify-center border border-coffee-accent/40 shadow-inner shrink-0">
            <img src="/logo.jpg" alt="AVA Coffee Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-wide leading-tight">AVA Coffee</h1>
            <p className="text-xs text-coffee-accent font-medium">Chi nhánh K300</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center space-x-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-coffee-accent text-coffee-dark font-semibold shadow-md'
                    : 'text-coffee-light hover:bg-coffee-medium/40 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Sidebar */}
        <div className="p-4 border-t border-coffee-medium bg-coffee-dark/30 text-xs text-coffee-light">
          <div className="flex items-center justify-between mb-2">
            <span>Kết nối:</span>
            {isSupabaseConfigured ? (
              <span className="flex items-center space-x-1 text-green-400 font-semibold">
                <Globe className="w-3.5 h-3.5" />
                <span>Supabase</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-amber-400 font-semibold">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Mock DB (Offline)</span>
              </span>
            )}
          </div>
          <div className="text-[10px] text-coffee-accent/70">
            Giờ hệ thống: {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)] bg-coffee-primary text-white flex items-center justify-between px-4 z-40 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 bg-black rounded-lg overflow-hidden flex items-center justify-center border border-coffee-accent/40 shadow-inner shrink-0">
            <img src="/logo.jpg" alt="AVA Coffee Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="font-extrabold text-base leading-none block">AVA Coffee</span>
            <span className="text-[10px] text-coffee-accent font-semibold block leading-none mt-0.5">K300</span>
          </div>
        </div>
        <div className="flex items-center space-x-2.5">
          {/* Nút Fullscreen thu nhỏ / phóng to riêng cho POS Exe */}
          <TauriFullscreenButton 
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition cursor-pointer border border-white/15 flex items-center justify-center"
            iconClassName="w-4 h-4"
          />

          {/* User Display Mobile */}
          <div className="text-xs text-right hidden sm:block">
            <p className="font-medium text-coffee-accent">{currentUser?.full_name}</p>
            <p className="text-[10px] opacity-75">{currentUser?.role}</p>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="p-2 hover:bg-coffee-medium/40 rounded-lg text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      <div 
        className={`md:hidden fixed inset-0 z-30 flex transition-opacity duration-300 ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
        <aside 
          className={`relative flex flex-col w-72 max-w-xs bg-coffee-primary text-white p-6 pt-[calc(5rem+env(safe-area-inset-top,0px))] z-40 shadow-xl transform transition-transform duration-300 ease-in-out ${
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-coffee-accent text-coffee-dark font-semibold shadow-md'
                      : 'text-coffee-light hover:bg-coffee-medium/40 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-coffee-medium pt-4 text-xs space-y-3">
            {/* Nút đăng xuất trên di động */}
            <button
              onClick={handleLogout}
              className="w-full py-2.5 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white font-bold text-xs rounded-xl transition border border-red-500/20 flex items-center justify-center space-x-1.5"
            >
              <span>Đăng xuất</span>
            </button>

            <div className="flex items-center justify-between text-coffee-light">
              <span>Database:</span>
              {isSupabaseConfigured ? (
                <span className="text-green-400 font-semibold">Supabase</span>
              ) : (
                <span className="text-amber-400 font-semibold">Mock DB (Offline)</span>
              )}
            </div>
            <div className="text-[10px] text-coffee-accent/70">
              Nhân viên: {currentUser?.full_name} ({currentUser?.role})
            </div>
          </div>
        </aside>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-0 pt-[calc(4rem+env(safe-area-inset-top,0px))] md:pt-0">
        {/* TOP BAR / HEADER (DESKTOP) */}
        <header className="hidden md:flex h-16 bg-white border-b border-coffee-light items-center justify-between px-8 z-10">
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-lg text-coffee-dark">
              {pathname === '/' && 'Trang Tổng Quan'}
              {pathname.startsWith('/pos') && 'Màn Hình Bán Hàng (POS)'}
              {pathname.startsWith('/payment') && 'Xử Lý Thanh Toán'}
              {pathname.startsWith('/daily-report') && 'Báo Cáo Doanh Thu Ca Trực'}
              {pathname.startsWith('/menu') && 'Thực Đơn Cửa Hàng'}
              {pathname.startsWith('/time-log') && 'Ghi Nhận Chấm Công'}
              {pathname.startsWith('/leave') && 'Đăng Ký Nghỉ Phép'}
              {pathname.startsWith('/admin') && 'Trang Quản Trị (Admin)'}
            </h2>
            {!isSupabaseConfigured && (
              <span className="ml-4 text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-medium">
                Chế độ chạy thử Local Storage
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Nút Fullscreen thu nhỏ / phóng to riêng cho POS Exe */}
            <TauriFullscreenButton 
              className="px-3 py-2 bg-coffee-cream/40 hover:bg-coffee-light border border-coffee-accent/40 text-coffee-dark hover:text-coffee-primary rounded-xl transition-all duration-200 cursor-pointer shadow-xs flex items-center space-x-1.5 text-xs font-bold"
              iconClassName="w-4 h-4"
            />

            {/* User selector dropdown in Desktop Header */}
            <div className="relative">
              <button 
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center space-x-3 px-4 py-2 hover:bg-coffee-light rounded-xl transition-all duration-200 border border-coffee-accent/30 bg-coffee-cream/20"
              >
              <div className="p-1.5 bg-coffee-primary rounded-lg text-white">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="text-left text-xs">
                <p className="font-semibold text-coffee-dark leading-tight">{currentUser?.full_name}</p>
                <p className="text-[10px] text-coffee-medium font-medium">{currentUser?.role}</p>
              </div>
            </button>

            {isUserDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-coffee-accent/40 py-1.5 z-50">
                <div className="px-4 py-2 border-b border-coffee-light text-left">
                  <p className="text-xs font-bold text-coffee-dark truncate">{currentUser?.full_name}</p>
                  <p className="text-[10px] text-coffee-medium truncate">{currentUser?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2.5 text-xs text-red-600 font-bold hover:bg-red-50 transition-all flex items-center space-x-2"
                >
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

        {/* MOBILE SESSION INFO REMOVED */}

        {/* Scrollable Page Wrapper */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] animate-fade-in transition-all duration-300">
          <div className={`px-5 py-3 rounded-2xl shadow-xl border text-xs font-black flex items-center space-x-2.5 backdrop-blur-md ${
            toastType === 'success' 
              ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-100/50' 
              : toastType === 'error'
              ? 'bg-red-50/95 border-red-200 text-red-900 shadow-red-100/50'
              : 'bg-blue-50/95 border-blue-200 text-blue-900 shadow-blue-100/50'
          }`}>
            <span className="text-sm">
              {toastType === 'success' ? '✅' : toastType === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  );
}
