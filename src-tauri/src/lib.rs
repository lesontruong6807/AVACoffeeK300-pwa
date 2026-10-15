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
    let app_clone = app.clone();
    app.run_on_main_thread(move || {
        let _ = customer_screen::open_or_focus_customer_display(&app_clone);
    }).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. Tự động khởi chạy HTTP Print Bridge Server trên cổng 3333
            // Cho phép các thiết bị di động của nhân viên cùng Wi-Fi in trực tiếp tới máy POS
            let app_handle_http = app.handle().clone();
            std::thread::spawn(move || {
                http_server::start_http_print_server(3333, Some(app_handle_http));
            });

            // 2. Tự động mở và định vị màn hình phụ trên main UI thread
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                let h1 = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    let _ = customer_screen::open_or_focus_customer_display(&h1);
                });
            });
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
