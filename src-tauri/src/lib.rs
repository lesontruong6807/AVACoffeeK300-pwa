mod printer;
mod customer_screen;
mod http_server;

// LƯU Ý QUAN TRỌNG: Các lệnh làm việc với máy in BẮT BUỘC là `async` + chạy trong luồng nền (spawn_blocking).
// Lệnh Tauri dạng đồng bộ (fn thường) chạy trên LUỒNG GIAO DIỆN CHÍNH: khi máy in USB kẹt giấy / rút cáp /
// spooler chậm hoặc phải thử in Wi-Fi (chờ timeout vài giây), toàn bộ cửa sổ POS bị đơ, bấm gì cũng không ăn,
// nhân viên phải khởi động lại máy. Chạy nền thì giao diện luôn mượt dù máy in có trục trặc.

#[tauri::command]
async fn get_printers() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(printer::get_printers)
        .await
        .map_err(|e| format!("Lỗi luồng quét máy in: {}", e))?
}

// dedup_key = "mã đơn # danh sách món": cùng 1 đơn chỉ in 1 lần; allow_reprint = nhân viên chủ động bấm "In bill"
// Trả về true nếu đã in, false nếu bỏ qua vì đơn đã được in trước đó
#[tauri::command]
async fn silent_print_escpos(
    data: Vec<u8>,
    printer_name: Option<String>,
    dedup_key: Option<String>,
    allow_reprint: Option<bool>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        printer::print_receipt(&data, printer_name, dedup_key, allow_reprint.unwrap_or(false))
    })
    .await
    .map_err(|e| format!("Lỗi luồng in: {}", e))?
}

#[tauri::command]
async fn kick_cash_drawer(printer_name: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || printer::kick_cash_drawer(printer_name))
        .await
        .map_err(|e| format!("Lỗi luồng mở két: {}", e))?
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
