'use client';

import React, { useState, useEffect } from 'react';
import { Coffee, QrCode, Sparkles, CheckCircle2, DollarSign } from 'lucide-react';

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
    <div className="min-h-screen bg-[#1A120B] text-[#FAF6F0] flex flex-col select-none overflow-hidden font-sans">
      {/* HEADER BANNER */}
      <header className="h-16 px-6 bg-[#2B1810] border-b border-[#3D251A] flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wide text-amber-300">AVA COFFEE K300</h1>
            <p className="text-[11px] font-semibold text-amber-200/60 uppercase tracking-wider">
              {order?.tableName ? `Đang phục vụ: ${order.tableName}` : 'Màn hình hiển thị cho khách hàng'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {order?.staffName && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-black/30 border border-white/10 text-amber-200">
              Thu ngân: {order.staffName}
            </span>
          )}
          <span className="text-sm font-mono font-bold text-amber-400 bg-black/40 px-3 py-1.5 rounded-lg border border-amber-900/40">
            {currentTime}
          </span>
        </div>
      </header>

      {/* BODY CONTENT */}
      {!hasItems ? (
        // IDLE SCREENSAVER
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.15)_0%,transparent_70%)] pointer-events-none" />
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-amber-700/40 to-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-6 shadow-2xl">
            <Coffee className="w-14 h-14 text-amber-400 animate-pulse" />
          </div>
          <h2 className="text-3xl font-black text-amber-200 tracking-tight mb-2">
            AVA COFFEE XIN CHÀO QUÝ KHÁCH !
          </h2>
          <p className="text-base text-amber-100/70 max-w-md font-medium">
            Chúc quý khách một ngày tràn đầy năng lượng và có trải nghiệm tuyệt vời cùng tách cà phê thơm ngon.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Chi nhánh K300 • Tân Bình • TP. Hồ Chí Minh
          </div>
        </main>
      ) : (
        // ACTIVE ORDER DISPLAY
        <main className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-hidden">
          {/* CỘT TRÁI: DANH SÁCH MÓN */}
          <div className="col-span-7 bg-[#23150F] rounded-2xl border border-[#3D251A] p-4 flex flex-col overflow-hidden shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">Tên món đồ uống</span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider">SL</span>
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider w-24 text-right">Thành tiền</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {order.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-xl bg-black/25 border border-white/5 hover:border-amber-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-black flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{item.name}</p>
                      <p className="text-[11px] text-amber-300/60 font-medium">
                        {item.price.toLocaleString('vi-VN')} đ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <span className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 font-black text-xs flex items-center justify-center">
                      x{item.quantity}
                    </span>
                    <span className="text-sm font-black text-amber-400 w-24 text-right">
                      {item.subtotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {isPaid && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center gap-2 text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                HÓA ĐƠN ĐÃ THANH TOÁN THÀNH CÔNG !
              </div>
            )}
          </div>

          {/* CỘT PHẢI: TỔNG TIỀN & VIETQR */}
          <div className="col-span-5 flex flex-col gap-4">
            {/* TỔNG TIỀN THANH TOÁN */}
            <div className="bg-gradient-to-br from-[#2D1B12] to-[#1E110A] rounded-2xl border border-amber-600/30 p-5 shadow-xl">
              <div className="space-y-2 pb-4 border-b border-white/10">
                <div className="flex justify-between text-xs text-amber-200/70 font-semibold">
                  <span>Tổng tiền món:</span>
                  <span>
                    {order.items.reduce((s, i) => s + i.subtotal, 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                {order.discount && order.discount > 0 ? (
                  <div className="flex justify-between text-xs text-rose-400 font-semibold">
                    <span>Giảm giá:</span>
                    <span>-{order.discount.toLocaleString('vi-VN')} đ</span>
                  </div>
                ) : null}
              </div>

              <div className="pt-4">
                <p className="text-xs uppercase font-extrabold text-amber-300/80 tracking-wider">
                  Cần thanh toán
                </p>
                <p className="text-3xl font-black text-amber-400 tracking-tight mt-1">
                  {order.totalAmount.toLocaleString('vi-VN')} <span className="text-lg">đ</span>
                </p>
              </div>

              {order.paymentMethod && (
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-amber-200">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  Hình thức: {order.paymentMethod}
                </div>
              )}
            </div>

            {/* MÃ VIETQR QUÉT NHANH */}
            <div className="flex-1 bg-[#23150F] rounded-2xl border border-[#3D251A] p-4 flex flex-col items-center justify-center shadow-lg relative">
              {order.qrCodeUrl ? (
                <div className="flex flex-col items-center">
                  <p className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-amber-400" />
                    Quét VietQR chuyển khoản
                  </p>
                  <div className="p-2 bg-white rounded-xl shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.qrCodeUrl}
                      alt="VietQR thanh toan"
                      className="w-44 h-44 object-contain rounded-lg"
                    />
                  </div>
                  <p className="text-[11px] text-amber-200/60 font-semibold mt-2">
                    Mở app ngân hàng bất kỳ để quét mã
                  </p>
                </div>
              ) : (
                <div className="text-center p-4">
                  <Coffee className="w-10 h-10 text-amber-400/40 mx-auto mb-2" />
                  <p className="text-sm font-bold text-amber-200">AVA Coffee K300</p>
                  <p className="text-xs text-amber-200/50 mt-1">Cảm ơn Quý khách !</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
