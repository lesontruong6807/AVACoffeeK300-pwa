'use client';

import React, { useEffect, useRef } from 'react';
import { db, onRealtimeEvent } from '@/lib/database';
import { 
  printOrderDirect, 
  isOrderAlreadyPrinted, 
  markOrderAsPrinted, 
  getPrintedOrderInfo 
} from '@/lib/printerService';
import { toast } from '@/lib/toast';

export default function GlobalPrintListener() {
  const isListeningRef = useRef(false);

  // TUYỆT ĐỐI KHÔNG CHẠY BỘ IN TRÊN MÀN HÌNH PHỤ KHÁCH HÀNG (CUSTOMER DISPLAY)
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('customer-display') || (window as any).__IS_CUSTOMER_DISPLAY__) {
      return null;
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('customer-display') || (window as any).__IS_CUSTOMER_DISPLAY__) {
        return;
      }
    }

    // Chỉ kích hoạt một bộ lắng nghe duy nhất trong toàn bộ vòng đời ứng dụng
    if (isListeningRef.current) return;
    isListeningRef.current = true;

    // Kiểm tra xem có đang chạy trong môi trường Desktop (Tauri) hay không
    const isDesktop = typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__);
    console.log(`[GlobalPrintListener] Khởi động bộ lắng nghe in toàn cục (Môi trường Desktop: ${isDesktop})`);

    // 0. LẮNG NGHE SỰ KIỆN IN TỪ TAURI NATIVE HTTP BRIDGE (Nội bộ máy POS)
    let unlistenTauriPrint: (() => void) | null = null;
    if (isDesktop) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('print-completed', (event: any) => {
          if (event.payload?.orderId) {
            console.log(`[GlobalPrintListener] Tauri Native Bridge đã in đơn ${event.payload.orderId}. Đánh dấu hoàn tất.`);
            markOrderAsPrinted(event.payload.orderId);
          }
        }).then(unlisten => {
          unlistenTauriPrint = unlisten;
        }).catch(() => {});
      }).catch(() => {});
    }

    // ─────────────────────────────────────────────────────────────
    // 1. LẮNG NGHE LỆNH IN SIÊU TỐC QUA SUPABASE REALTIME BROADCAST (~20ms)
    // ─────────────────────────────────────────────────────────────
    const unsubRealtime = onRealtimeEvent('order_update', async (rawPayload: any) => {
      const payload = rawPayload?.payload || rawPayload;
      if (!payload) return;

      // Nếu là thông báo đã in xong từ thiết bị khác (qua Wi-Fi bridge) -> Cập nhật sổ lưu vết ngay
      if (payload.action === 'PRINT_COMPLETED' && payload.orderId) {
        console.log(`[GlobalPrintListener] Nhận thông báo đơn ${payload.orderId} đã được in xong.`);
        markOrderAsPrinted(payload.orderId, payload.details || {
          itemCount: payload.itemCount,
          totalAmount: payload.totalAmount
        });
        return;
      }

      if (payload.action !== 'PRINT_RECEIPT' || !payload.orderData) return;

      const orderData = payload.orderData;
      const orderId = orderData.orderId;
      const isManual = !!(payload.isManualReprint || orderData.isManualReprint);

      // NGUYÊN TẮC VÀNG: Mỗi bill in đúng 1 lần trừ khi thêm món mới hoặc tự chọn in lại
      if (orderId && !isManual) {
        if (isOrderAlreadyPrinted(orderId, orderData.items?.length, orderData)) {
          console.log(`[GlobalPrintListener] Realtime: Bỏ qua vì đơn ${orderId} đã được in trước đó.`);
          return;
        }
      }

      console.log('[GlobalPrintListener] Nhận lệnh in từ Web app điện thoại:', orderData);
      try {
        if (orderId) {
          markOrderAsPrinted(orderId, {
            itemCount: orderData.items?.length,
            totalAmount: orderData.totalAmount,
            isPaid: orderData.notes?.includes('ĐÃ THANH TOÁN')
          });
        }
        await printOrderDirect(orderData, undefined, undefined, { isManualUserReprint: true });
        toast.success(`🖨️ Đã in hoá đơn (${orderData.tableName || 'Đơn hàng'}) từ điện thoại!`);
      } catch (err: any) {
        console.error('[GlobalPrintListener] Lỗi in tự động Realtime:', err);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // 2. DỰ PHÒNG LẮNG NGHE QUA SUPABASE POSTGRES DATABASE CHANGES
    // ─────────────────────────────────────────────────────────────
    const unsubPostgres = db.subscribeToOrderChanges(async (orderChangePayload?: any) => {
      if (!orderChangePayload) return;

      const { eventType, new: newOrder } = orderChangePayload;
      if (!newOrder || !newOrder.id) return;

      // Đã hủy thì tuyệt đối không in
      if (newOrder.trang_thai_thanh_toan === 'Đã hủy' || newOrder.trang_thai_thanh_toan === 'Chờ duyệt hủy') {
        return;
      }

      const orderId = newOrder.id;
      const createdAt = newOrder.ngay_tao ? new Date(newOrder.ngay_tao).getTime() : Date.now();
      const isRecent = Date.now() - createdAt < 45000;

      // TRƯỜNG HỢP 1: TẠO ĐƠN MỚI TỪ ĐIỆN THOẠI (DỰ PHÒNG KHI BROADCAST BỊ LỠ)
      if (eventType === 'INSERT' && isRecent) {
        // ĐÃ ĐƯỢC IN (tại POS máy bàn, qua HTTP Bridge hoặc qua Realtime Broadcast) -> Bỏ qua ngay!
        if (orderId && isOrderAlreadyPrinted(orderId)) {
          return;
        }

        // Chờ ngắn 350ms để đảm bảo lệnh in trực tiếp từ quầy POS ghi nhận xong
        await new Promise(r => setTimeout(r, 350));
        if (orderId && isOrderAlreadyPrinted(orderId)) return;

        try {
          const items = await db.getOrderItems(orderId);
          if (items && items.length > 0) {
            if (orderId && isOrderAlreadyPrinted(orderId, items.length)) return;

            const currentTables = await db.getTables();
            const matchedTable = currentTables.find((t: any) => t.id === newOrder.id_ban);
            const isPaid = newOrder.trang_thai_thanh_toan === 'Đã thanh toán';

            // Đánh dấu trước khi in để ngăn chặn mọi luồng đồng thời khác
            markOrderAsPrinted(orderId, {
              itemCount: items.length,
              totalAmount: Number(newOrder.tong_tien || 0),
              isPaid: isPaid
            });

            await printOrderDirect({
              orderId: newOrder.id,
              tableName: matchedTable?.table_name || 'Khách mang về',
              staffName: 'Nhân viên (Điện thoại)',
              totalAmount: Number(newOrder.tong_tien || 0),
              discount: Number(newOrder.giam_gia || 0),
              notes: isPaid ? '(ĐÃ THANH TOÁN)' : '(LƯU ĐƠN)',
              items: items.map((i: any) => ({
                name: i.products?.name || i.name || i.ten_san_pham || 'Món',
                quantity: Number(i.so_luong || i.quantity || 1),
                price: Number(i.unit_price || i.don_gia || i.price || 0),
                subtotal: Number(i.thanh_tien || i.subtotal || 0),
                notes: i.ghi_chu || ''
              }))
            }, undefined, undefined, { isManualUserReprint: true });

            toast.success(`🖨️ Đã in phiếu order (${matchedTable?.table_name || 'Khách mang về'}) từ điện thoại!`);
          }
        } catch (printErr) {
          console.warn('[GlobalPrintListener] Lỗi in tự động từ INSERT:', printErr);
        }
      }

      // TRƯỜNG HỢP 2: UPDATE (KIỂM TRA CÓ MÓN MỚI BỔ SUNG KHÔNG)
      else if (eventType === 'UPDATE' && newOrder.trang_thai_thanh_toan === 'Chưa thanh toán') {
        const tracked = getPrintedOrderInfo(orderId);
        if (tracked) {
          try {
            const currentItems = await db.getOrderItems(orderId);
            if (currentItems && currentItems.length > tracked.itemCount) {
              if (isOrderAlreadyPrinted(orderId, currentItems.length)) return;

              const currentTables = await db.getTables();
              const matchedTable = currentTables.find((t: any) => t.id === newOrder.id_ban);

              markOrderAsPrinted(orderId, {
                itemCount: currentItems.length,
                itemIds: currentItems.map((i: any) => i.id || i.product_id),
                totalAmount: Number(newOrder.tong_tien || 0),
                isPaid: false
              });

              await printOrderDirect({
                orderId: newOrder.id,
                tableName: matchedTable?.table_name || 'Khách mang về',
                staffName: 'Nhân viên (Điện thoại)',
                totalAmount: Number(newOrder.tong_tien || 0),
                discount: 0,
                notes: '(GỌI THÊM MÓN)',
                items: currentItems.map((i: any) => ({
                  name: i.products?.name || i.name || i.ten_san_pham || 'Món',
                  quantity: Number(i.so_luong || i.quantity || 1),
                  price: Number(i.unit_price || i.don_gia || i.price || 0),
                  subtotal: Number(i.thanh_tien || i.subtotal || 0),
                  notes: i.ghi_chu || ''
                }))
              }, undefined, undefined, { isManualUserReprint: true });

              toast.success(`🖨️ Đã in món gọi thêm (${matchedTable?.table_name || 'Bàn'})!`);
            }
          } catch (e) {
            console.warn('[GlobalPrintListener] Lỗi in món gọi thêm:', e);
          }
        }
      }
      // TRƯỜNG HỢP 3: UPDATE SANG 'Đã thanh toán' -> Tuân thủ quy tắc không in lặp
      else if (eventType === 'UPDATE' && newOrder.trang_thai_thanh_toan === 'Đã thanh toán') {
        console.log(`[GlobalPrintListener] Đơn ${orderId} đã thanh toán - tuân thủ quy tắc không in lặp.`);
      }
    });

    return () => {
      unsubRealtime();
      unsubPostgres();
      if (unlistenTauriPrint) unlistenTauriPrint();
      isListeningRef.current = false;
    };
  }, []);

  return null;
}
