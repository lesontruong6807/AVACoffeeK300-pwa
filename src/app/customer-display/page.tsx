'use client';

import React, { useState, useEffect } from 'react';
import { Coffee, QrCode, Sparkles, CheckCircle2, DollarSign, ShieldCheck } from 'lucide-react';
import { TECHCOMBANK_INFO, getVietQrUrl } from '@/lib/vietqr';

interface DisplayItem {
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface DisplayOrder {
  tableName?: string;
  staffName?: string;
  items: DisplayItem[];
  discount?: number;
  totalAmount: number;
  paymentMethod?: 'Tiền mặt' | 'Chuyển khoản';
  qrCodeUrl?: string;
  customerPaid?: number;
  changeAmount?: number;
  orderStatus?: 'ordering' | 'paid' | 'idle';
}

export default function CustomerDisplayPage() {
  const [order, setOrder] = useState<DisplayOrder | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Cập nhật đồng hồ thời gian thực
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Lắng nghe dữ liệu từ Tauri Event & BroadcastChannel
  useEffect(() => {
    // 0. Đọc ngay dữ liệu đang có từ localStorage
    try {
      const cached = localStorage.getItem('ava_customer_display_data');
      if (cached) {
        setOrder(JSON.parse(cached));
      }
    } catch (_) {}

    // 1. BroadcastChannel (cho web đa tab)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('ava_customer_display');
      channel.onmessage = (event) => {
        if (event.data) {
          setOrder(event.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported');
    }

    // 2. Tauri IPC Event (cho app Desktop Windows)
    let unlistenTauri: (() => void) | null = null;
    const initTauriListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<DisplayOrder>('customer-display-update', (event) => {
          if (event.payload) {
            setOrder(event.payload);
          }
        });
        unlistenTauri = unlisten;
      } catch (e) {
        // Không ở môi trường Tauri
      }
    };
    initTauriListener();

    // 3. Fallback qua localStorage event
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ava_customer_display_data' && e.newValue) {
        try {
          setOrder(JSON.parse(e.newValue));
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      if (unlistenTauri) unlistenTauri();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const hasItems = order && order.items && order.items.length > 0;
  const isPaid = order?.orderStatus === 'paid';

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2C1D11] flex flex-col select-none overflow-hidden font-sans">
      {/* HEADER BANNER - NÂU CÀ PHÊ SANG TRỌNG */}
      <header className="h-16 px-6 bg-gradient-to-r from-[#4A3525] via-[#382513] to-[#2C1D11] text-white flex items-center justify-between shadow-md shrink-0 border-b border-[#382513]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-xs">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-amber-200">AVA COFFEE K300</h1>
            <p className="text-[11px] font-bold text-amber-100/70 uppercase tracking-wider">
              {order?.tableName ? `Đang phục vụ: ${order.tableName}` : 'Màn hình hiển thị cho khách hàng'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {order?.staffName && (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white">
              Thu ngân: {order.staffName}
            </span>
          )}
          <span className="text-sm font-mono font-bold text-amber-300 bg-black/30 px-3 py-1.5 rounded-lg border border-amber-500/30">
            {currentTime}
          </span>
        </div>
      </header>

      {/* BODY CONTENT */}
      {!hasItems ? (
        // IDLE SCREENSAVER - TONE TRẮNG KEM LATTE ẤM ÁP + THẺ TECHCOMBANK VIETQR
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden bg-[#FAF6F0]">
          <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* LỜI CHÀO */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200/80 shadow-xl flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center mb-4 shadow-sm">
                <Coffee className="w-10 h-10 text-[#4A3525] animate-pulse" />
              </div>
              <h2 className="text-2xl font-black text-[#4A3525] tracking-tight mb-2">
                AVA COFFEE XIN CHÀO!
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed mb-4">
                Chúc quý khách một ngày tràn đầy năng lượng và có trải nghiệm tuyệt vời cùng tách cà phê thơm ngon tại quán.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4A3525] text-amber-200 text-[11px] font-bold uppercase tracking-wider shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Chi nhánh K300 • Tân Bình
              </div>
            </div>

            {/* MÃ QR TECHCOMBANK TĨNH (KHI MÀN HÌNH CHỜ) */}
            <div className="bg-white rounded-3xl p-4 border-2 border-red-200 shadow-xl flex flex-col items-center text-center">
              <div className="p-1 bg-white rounded-2xl flex items-center justify-center">
                <img
                  src="/techcombank-qr-card.png"
                  alt="Mã QR Techcombank Điểm bán AVA Coffee K300"
                  className="max-h-[340px] w-auto object-contain rounded-xl shadow-xs"
                />
              </div>
              <p className="text-[11px] text-gray-500 italic mt-2">
                Quét bằng App Ngân hàng hoặc MoMo • Loa sẽ tự động đọc to thông báo
              </p>
            </div>
          </div>
        </main>
      ) : (
        // ACTIVE ORDER DISPLAY - NỀN SÁNG TRẮNG, DỄ NHÌN, TƯƠNG PHẢN CAO
        <main className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-hidden bg-[#FAF6F0]">
          {/* CỘT TRÁI: DANH SÁCH MÓN ĂN */}
          <div className="col-span-7 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col overflow-hidden shadow-md">
            <div className="flex items-center justify-between pb-3 border-b-2 border-amber-100 mb-2">
              <span className="text-xs font-black text-[#4A3525] uppercase tracking-wider">Tên món đồ uống</span>
              <div className="flex items-center gap-8">
                <span className="text-xs font-black text-[#4A3525] uppercase tracking-wider">SL</span>
                <span className="text-xs font-black text-[#4A3525] uppercase tracking-wider w-28 text-right">Thành tiền</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {order.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-amber-300 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                    <span className="w-6 h-6 rounded-lg bg-[#FAF6F0] text-[#4A3525] font-black text-xs flex items-center justify-center shrink-0 border border-amber-200/60">
                      {index + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-sm sm:text-base font-black text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500 font-semibold">
                        {item.price.toLocaleString('vi-VN')} đ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 shrink-0">
                    <span className="w-8 h-8 rounded-xl bg-[#4A3525] text-white font-black text-xs flex items-center justify-center shadow-xs">
                      x{item.quantity}
                    </span>
                    <span className="text-sm sm:text-base font-black text-[#4A3525] w-28 text-right">
                      {item.subtotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {isPaid && (
              <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center gap-2 text-emerald-900 font-black text-sm shadow-xs animate-bounce">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 stroke-[3]" />
                HÓA ĐƠN ĐÃ THANH TOÁN THÀNH CÔNG !
              </div>
            )}
          </div>

          {/* CỘT PHẢI: TỔNG TIỀN & MÃ TECHCOMBANK VIETQR ĐỘNG */}
          <div className="col-span-5 flex flex-col gap-4">
            {/* TỔNG TIỀN THANH TOÁN */}
            <div className="bg-gradient-to-br from-[#4A3525] to-[#2C1D11] text-white rounded-2xl border border-[#382513] p-5 shadow-xl">
              <div className="space-y-2 pb-4 border-b border-white/15">
                <div className="flex justify-between text-xs text-amber-100/90 font-semibold">
                  <span>Tổng tiền món:</span>
                  <span>
                    {order.items.reduce((s, i) => s + i.subtotal, 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                {order.discount && order.discount > 0 ? (
                  <div className="flex justify-between text-xs text-rose-300 font-bold">
                    <span>Giảm giá:</span>
                    <span>-{order.discount.toLocaleString('vi-VN')} đ</span>
                  </div>
                ) : null}
              </div>

              <div className="pt-4 flex items-baseline justify-between">
                <div>
                  <p className="text-xs uppercase font-extrabold text-amber-200/90 tracking-wider">
                    Cần thanh toán
                  </p>
                  <p className="text-3xl sm:text-4xl font-black text-amber-300 tracking-tight mt-1 font-mono">
                    {order.totalAmount.toLocaleString('vi-VN')} <span className="text-lg">đ</span>
                  </p>
                </div>
                {order.tableName && (
                  <span className="text-xs font-bold px-3 py-1 bg-amber-400/20 text-amber-200 rounded-lg border border-amber-300/30">
                    {order.tableName}
                  </span>
                )}
              </div>
            </div>

            {/* MÃ QR CỨNG TECHCOMBANK ĐIỂM BÁN KẾT NỐI LOA SOUNDBOX */}
            <div className="flex-1 bg-white rounded-2xl border-2 border-red-200 p-4 flex flex-col items-center justify-between shadow-md relative overflow-hidden">
              <div className="w-full flex items-center justify-between border-b border-red-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                  <span className="text-xs font-black text-red-700 tracking-wider">TECHCOMBANK • SOUNDBOX</span>
                </div>
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  MS00T04320808126774
                </span>
              </div>

              {/* THẺ QR CỨNG CHUẨN ĐIỂM BÁN - ĐẢM BẢO LOA BÁO ÂM THANH */}
              <div className="my-1 p-1 bg-white rounded-2xl border border-red-100 shadow-xs flex items-center justify-center">
                <img
                  src="/techcombank-qr-card.png"
                  alt="Mã QR Techcombank Điểm bán AVA Coffee K300"
                  className="max-h-[300px] w-auto object-contain rounded-xl"
                />
              </div>

              {/* HƯỚNG DẪN THANH TOÁN RÕ RÀNG VỚI SỐ TIỀN */}
              <div className="w-full text-center space-y-1 bg-red-50/80 p-2.5 rounded-xl border border-red-200">
                <p className="text-xs text-gray-700 font-bold">
                  Quý khách quét mã và nhập số tiền: <span className="text-base font-black text-red-600 font-mono">{order.totalAmount.toLocaleString('vi-VN')} đ</span>
                </p>
                <p className="text-[11px] text-gray-500 font-medium">
                  Loa Techcombank sẽ đọc thông báo tức thì khi nhận được tiền
                </p>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
