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

  useEffect(() => {
    // Chỉ kích hoạt một bộ lắng nghe duy nhất trong toàn bộ vòng đời ứng dụng
    if (isListeningRef.current) return;
    isListeningRef.current = true;

    // Kiểm tra xem có đang chạy trong môi trường Desktop (Tauri) hay không
    const isDesktop = typeof window !== 'undefined' && (!!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__);
    console.log(`[GlobalPrintListener] Khởi động bộ lắng nghe in toàn cục (Môi trường Desktop: ${isDesktop})`);

    // ─────────────────────────────────────────────────────────────
    // 1. LẮNG NGHE LỆNH IN SIÊU TỐC QUA SUPABASE REALTIME BROADCAST (~20ms)
    // ─────────────────────────────────────────────────────────────
    const unsubRealtime = onRealtimeEvent('order_update', async (rawPayload: any) => {
      const payload = rawPayload?.payload || rawPayload;
      if (!payload || payload.action !== 'PRINT_RECEIPT' || !payload.orderData) return;

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
        await printOrderDirect(orderData, undefined, undefined, { isManualUserReprint: isManual });
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
          console.log(`[GlobalPrintListener] Postgres INSERT: Đơn ${orderId} đã được in. Bỏ qua.`);
          return;
        }

        // Chờ 3000ms để HTTP bridge / Realtime hoàn tất trước, tránh xung đột in đồng thời
        await new Promise(r => setTimeout(r, 3000));
        if (orderId && isOrderAlreadyPrinted(orderId)) return;

        try {
          const items = await db.getOrderItems(orderId);
          if (items && items.length > 0) {
            if (orderId && isOrderAlreadyPrinted(orderId, items.length)) return;

            const currentTables = await db.getTables();
            const matchedTable = currentTables.find((t: any) => t.id === newOrder.id_ban);
            const isPaid = newOrder.trang_thai_thanh_toan === 'Đã thanh toán';

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
            });

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
              // Bàn này có thêm món mới!
              const newItems = currentItems.slice(tracked.itemCount);
              const currentTables = await db.getTables();
              const matchedTable = currentTables.find((t: any) => t.id === newOrder.id_ban);

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

              markOrderAsPrinted(orderId, {
                itemCount: currentItems.length,
                itemIds: currentItems.map((i: any) => i.id || i.product_id),
                totalAmount: Number(newOrder.tong_tien || 0),
                isPaid: false
              });

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

    // ─────────────────────────────────────────────────────────────
    // 3. BỘ QUÉT DỰ PHÒNG CHẠY NGẦM ĐẢM BẢO KHÔNG BỎ SÓT LỆNH IN TỪ ĐIỆN THOẠI
    // ─────────────────────────────────────────────────────────────
    const checkRecentUnprintedOrders = async () => {
      if (!isDesktop) return;
      try {
        const unpaid = await db.getUnpaidOrders();
        const now = Date.now();
        for (const order of unpaid) {
          const createdAt = order.created_at ? new Date(order.created_at).getTime() : 0;
          // Nếu đơn tạo cách đây từ 8s đến 120s và chưa in
          const age = now - createdAt;
          if (age > 8000 && age < 120000) {
            if (!isOrderAlreadyPrinted(order.id)) {
              const items = await db.getOrderItems(order.id);
              if (items && items.length > 0) {
                if (isOrderAlreadyPrinted(order.id, items.length)) continue;
                const currentTables = await db.getTables();
                const matchedTable = currentTables.find((t: any) => t.id === order.table_id);
                await printOrderDirect({
                  orderId: order.id,
                  tableName: matchedTable?.table_name || 'Khách mang về',
                  staffName: 'Nhân viên (Điện thoại)',
                  totalAmount: Number(order.total_amount || 0),
                  discount: Number(order.discount || 0),
                  notes: '(LƯU ĐƠN)',
                  items: items.map((i: any) => ({
                    name: i.products?.name || i.name || i.ten_san_pham || 'Món',
                    quantity: Number(i.so_luong || i.quantity || 1),
                    price: Number(i.unit_price || i.don_gia || i.price || 0),
                    subtotal: Number(i.thanh_tien || i.subtotal || 0),
                    notes: i.ghi_chu || ''
                  }))
                });
                toast.success(`🖨️ Đã in phiếu bếp (${matchedTable?.table_name || 'Khách mang về'})!`);
              }
            }
          }
        }
      } catch (err) {
        // silent catch
      }
    };

    // Bộ quét định kỳ 12s (BỎ lắng nghe window focus/visibilitychange để không kích hoạt in bất ngờ khi click cửa sổ)
    const pollerInterval = setInterval(checkRecentUnprintedOrders, 12000);

    return () => {
      clearInterval(pollerInterval);
      unsubRealtime();
      unsubPostgres();
      isListeningRef.current = false;
    };
  }, []);

  return null;
}
