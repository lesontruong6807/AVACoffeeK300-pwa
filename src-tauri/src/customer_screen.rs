// Module quản lý và điều khiển cửa sổ Màn hình phụ 11.6 inch (Customer Display)

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

pub fn open_or_focus_customer_display(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("customer_display") {
        // Quét danh sách các màn hình vật lý đang kết nối vào máy POS CPOS 603
        if let Ok(monitors) = app.available_monitors() {
            if monitors.len() > 1 {
                // Có từ 2 màn hình trở lên (Màn hình chính 15.6" + Màn hình phụ 11.6")
                // Màn hình phụ thường là màn hình thứ 2 trong danh sách
                let secondary_monitor = &monitors[1];
                let pos = secondary_monitor.position();
                let size = secondary_monitor.size();

                println!(
                    "[CustomerDisplay] Phát hiện màn hình phụ tại ({}, {}), kích thước {}x{}",
                    pos.x, pos.y, size.width, size.height
                );

                let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
                let _ = window.set_size(PhysicalSize::new(size.width, size.height));
                let _ = window.set_fullscreen(true);
            } else {
                // Chỉ có 1 màn hình (chế độ chạy thử nghiệm)
                println!("[CustomerDisplay] Chỉ phát hiện 1 màn hình. Hiển thị cửa sổ phụ dạng nổi.");
                let _ = window.set_size(PhysicalSize::new(1024, 600));
                let _ = window.set_fullscreen(false);
            }
        }

        // Hiển thị cửa sổ và đưa lên trên
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        Ok(())
    } else {
        Err("Không tìm thấy cửa sổ 'customer_display' trong cấu hình tauri.conf.json.".to_string())
    }
}
