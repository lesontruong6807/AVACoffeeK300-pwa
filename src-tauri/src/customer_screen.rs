// Module quản lý và điều khiển cửa sổ Màn hình phụ 11.6 inch (Customer Display)

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub fn open_or_focus_customer_display(app: &AppHandle) -> Result<(), String> {
    // 1. Tìm hoặc khởi tạo lại cửa sổ customer_display nếu bị đóng
    let window = if let Some(win) = app.get_webview_window("customer_display") {
        win
    } else {
        WebviewWindowBuilder::new(
            app,
            "customer_display",
            WebviewUrl::App("customer-display.html".into()),
        )
        .title("AVA Coffee - Màn Hình Khách Hàng")
        .inner_size(1024.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|e| format!("Lỗi tạo cửa sổ customer_display: {}", e))?
    };

    // 2. Quét danh sách các màn hình vật lý đang kết nối vào máy POS CPOS 603
    if let Ok(monitors) = app.available_monitors() {
        if monitors.len() > 1 {
            // Có từ 2 màn hình trở lên (Màn hình chính 15.6" + Màn hình phụ 11.6")
            // Chọn màn hình có tọa độ khác với màn hình chính (main window)
            let target_monitor = if let Some(main_win) = app.get_webview_window("main") {
                if let Ok(Some(main_mon)) = main_win.current_monitor() {
                    monitors.iter().find(|m| m.position() != main_mon.position()).unwrap_or(&monitors[1])
                } else {
                    &monitors[1]
                }
            } else {
                &monitors[1]
            };

            let pos = target_monitor.position();
            let size = target_monitor.size();

            println!(
                "[CustomerDisplay] Phát hiện màn hình phụ tại ({}, {}), kích thước {}x{}",
                pos.x, pos.y, size.width, size.height
            );

            // Đặt tọa độ và kích thước của màn hình phụ rồi chuyển sang Toàn màn hình (Fullscreen)
            let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
            let _ = window.set_size(PhysicalSize::new(size.width, size.height));
            let _ = window.set_fullscreen(true);
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        } else {
            // Chỉ có 1 màn hình (chế độ chạy thử nghiệm)
            println!("[CustomerDisplay] Chỉ phát hiện 1 màn hình. Hiển thị cửa sổ phụ dạng nổi.");
            let _ = window.set_fullscreen(false);
            let _ = window.set_size(PhysicalSize::new(1024, 600));
            let _ = window.center();
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    Ok(())
}
