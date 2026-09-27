// Entry point của thư viện Tauri v2 cho AVA Coffee K300 Desktop POS

mod printer;
mod customer_screen;
mod http_server;

#[tauri::command]
fn get_printers() -> Result<Vec<String>, String> {
    printer::get_printers()
}

#[tauri::command]
fn silent_print_escpos(data: Vec<u8>, printer_name: Option<String>) -> Result<(), String> {
    printer::print_escpos_raw(&data, printer_name)
}

#[tauri::command]
fn kick_cash_drawer(printer_name: Option<String>) -> Result<(), String> {
    printer::kick_cash_drawer(printer_name)
}

#[tauri::command]
fn open_customer_display(app: tauri::AppHandle) -> Result<(), String> {
    customer_screen::open_or_focus_customer_display(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. Tự động khởi chạy HTTP Print Bridge Server trên cổng 3333
            // Cho phép các thiết bị di động của nhân viên cùng Wi-Fi in trực tiếp tới máy POS
            std::thread::spawn(|| {
                http_server::start_http_print_server(3333);
            });

            // 2. Tự động mở màn hình phụ nếu phát hiện máy POS có từ 2 màn hình trở lên
            let app_handle = app.handle().clone();
            if let Ok(monitors) = app_handle.available_monitors() {
                if monitors.len() > 1 {
                    println!("[Setup] Phát hiện 2 màn hình khi khởi động. Tự động hiển thị màn hình phụ.");
                    let _ = customer_screen::open_or_focus_customer_display(&app_handle);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_printers,
            silent_print_escpos,
            kick_cash_drawer,
            open_customer_display
        ])
        .run(tauri::generate_context!())
        .expect("Lỗi khi khởi chạy ứng dụng AVA Coffee K300 Desktop POS");
}
