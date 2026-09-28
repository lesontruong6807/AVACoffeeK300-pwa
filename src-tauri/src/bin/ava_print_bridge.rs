// AVA Coffee K300 - Standalone Native Windows Print Bridge
// Chạy độc lập 100% không phụ thuộc Node.js hay bất kỳ runtime nào khác!
// Tự động nhận diện cấu hình IP máy in từ cai_dat_may_in.txt hoặc mặc định 192.168.1.167:9100

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
struct BridgeConfig {
    printer_ip: String,
    printer_port: u16,
    http_port: u16,
}

fn load_config() -> BridgeConfig {
    let mut config = BridgeConfig {
        printer_ip: "192.168.1.167".to_string(),
        printer_port: 9100,
        http_port: 3333,
    };

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let config_path = exe_dir.join("cai_dat_may_in.txt");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim().to_lowercase();
                let v = v.trim();
                match k.as_str() {
                    "printer_ip" | "ip" => config.printer_ip = v.to_string(),
                    "printer_port" | "port" => {
                        if let Ok(p) = v.parse() {
                            config.printer_port = p;
                        }
                    }
                    "http_port" => {
                        if let Ok(p) = v.parse() {
                            config.http_port = p;
                        }
                    }
                    _ => {}
                }
            }
        }
    } else {
        let default_content = format!(
            "# ==========================================================\n\
             # CAU HINH MAY IN NHIET WI-FI AVA COFFEE K300\n\
             # Neu doi may in hoac modem Wi-Fi cap IP moi, chi can sua\n\
             # dia chi IP ben duoi roi mo lai file la xong:\n\
             # ==========================================================\n\
             printer_ip={}\n\
             printer_port={}\n\
             http_port={}\n",
            config.printer_ip, config.printer_port, config.http_port
        );
        let _ = std::fs::write(&config_path, default_content);
    }

    config
}

fn get_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("192.168.1.1:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn print_to_wifi_printer(data: &[u8], ip: &str, port: u16) -> Result<(), String> {
    let addr_str = format!("{}:{}", ip, port);
    let socket_addr: SocketAddr = addr_str
        .parse()
        .map_err(|e| format!("IP máy in không hợp lệ: {}", e))?;

    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_millis(3000))
        .map_err(|e| format!("Không thể kết nối máy in Wi-Fi {}: {}. Vui lòng bật máy in!", addr_str, e))?;

    stream.set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;

    stream.write_all(data)
        .map_err(|e| format!("Lỗi gửi dữ liệu in: {}", e))?;

    stream.flush()
        .map_err(|e| format!("Lỗi hoàn tất in: {}", e))?;

    Ok(())
}

fn print_test_receipt(cfg: &BridgeConfig) -> Result<(), String> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&[0x1B, 0x40]); // ESC @ (Init)
    bytes.extend_from_slice(&[0x1B, 0x61, 0x01]); // Align Center
    bytes.extend_from_slice(&[0x1D, 0x21, 0x11]); // Double Size
    bytes.extend_from_slice(b"AVA COFFEE K300\n");
    bytes.extend_from_slice(&[0x1D, 0x21, 0x00]); // Normal Size
    bytes.extend_from_slice(b"----------------------------------------\n");
    bytes.extend_from_slice(b"TEST IN QUA MANG WI-FI (PORT 9100)\n");
    bytes.extend_from_slice(format!("May in IP: {}:{}\n", cfg.printer_ip, cfg.printer_port).as_bytes());
    bytes.extend_from_slice(b"KET NOI MAY IN THANH CONG 100%!\n");
    bytes.extend_from_slice(b"----------------------------------------\n");
    bytes.extend_from_slice(b"AVA COFFEE XIN CAM ON QUY KHACH !\n");
    bytes.extend_from_slice(b"CHUC QUY KHACH NGON MIENG\n\n\n\n\n");
    bytes.extend_from_slice(&[0x1D, 0x56, 0x00]); // Cut

    print_to_wifi_printer(&bytes, &cfg.printer_ip, cfg.printer_port)
}

fn handle_http_client(mut stream: TcpStream, cfg: Arc<BridgeConfig>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buffer = Vec::new();
    let mut temp = [0u8; 4096];
    let mut content_length = 0usize;
    let mut header_end = None;

    loop {
        match stream.read(&mut temp) {
            Ok(0) => break,
            Ok(n) => {
                buffer.extend_from_slice(&temp[..n]);
                if header_end.is_none() {
                    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
                        header_end = Some(pos + 4);
                    } else if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
                        header_end = Some(pos + 2);
                    }
                    if let Some(hend) = header_end {
                        let header_str = String::from_utf8_lossy(&buffer[..hend]);
                        for line in header_str.lines() {
                            if line.to_ascii_lowercase().starts_with("content-length:") {
                                if let Some(val) = line.split(':').nth(1) {
                                    content_length = val.trim().parse().unwrap_or(0);
                                }
                            }
                        }
                    }
                }
                if let Some(hend) = header_end {
                    if buffer.len() >= hend + content_length {
                        break;
                    }
                }
            }
            Err(_) => break,
        }
    }

    if buffer.is_empty() { return; }

    let hend = match header_end {
        Some(h) => h,
        None => buffer.len(),
    };

    let header_str = String::from_utf8_lossy(&buffer[..hend]);
    let first_line = header_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 { return; }
    let method = parts[0];
    let path = parts[1];

    let cors_headers = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\n";

    if method == "OPTIONS" {
        let response = format!("HTTP/1.1 200 OK\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    if method == "GET" && (path == "/status" || path == "/" || path == "/ping") {
        let body = serde_json::json!({
            "status": "ready",
            "service": "AVA Coffee K300 Standalone Wi-Fi Print Bridge",
            "printer_ip": cfg.printer_ip,
            "printer_port": cfg.printer_port,
            "http_port": cfg.http_port
        }).to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors_headers, body.len(), body
        );
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    if method == "POST" && path == "/test" {
        match print_test_receipt(&cfg) {
            Ok(_) => {
                let body = serde_json::json!({ "success": true, "message": "In test thành công ra máy in Wi-Fi!" }).to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    cors_headers, body.len(), body
                );
                let _ = stream.write_all(response.as_bytes());
            }
            Err(e) => {
                let body = serde_json::json!({ "success": false, "error": e }).to_string();
                let response = format!(
                    "HTTP/1.1 500 Internal Server Error\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    cors_headers, body.len(), body
                );
                let _ = stream.write_all(response.as_bytes());
            }
        }
        return;
    }

    if method == "POST" && path == "/print" {
        let body_bytes = if buffer.len() > hend {
            &buffer[hend..hend + content_length.min(buffer.len() - hend)]
        } else {
            &[]
        };

        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(body_bytes) {
            if let Some(arr) = val.get("data").and_then(|d| d.as_array()) {
                let raw_bytes: Vec<u8> = arr.iter().filter_map(|x| x.as_u64().map(|n| n as u8)).collect();
                if !raw_bytes.is_empty() {
                    match print_to_wifi_printer(&raw_bytes, &cfg.printer_ip, cfg.printer_port) {
                        Ok(_) => {
                            println!("[IN THÀNH CÔNG] Đã in phiếu ({} bytes) ra máy in Wi-Fi {}:{}", raw_bytes.len(), cfg.printer_ip, cfg.printer_port);
                            let body = serde_json::json!({ "success": true, "message": "Đã in hóa đơn thành công" }).to_string();
                            let response = format!(
                                "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                cors_headers, body.len(), body
                            );
                            let _ = stream.write_all(response.as_bytes());
                            return;
                        }
                        Err(e) => {
                            eprintln!("[LỖI IN] {}", e);
                            let body = serde_json::json!({ "success": false, "error": e }).to_string();
                            let response = format!(
                                "HTTP/1.1 500 Internal Server Error\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                cors_headers, body.len(), body
                            );
                            let _ = stream.write_all(response.as_bytes());
                            return;
                        }
                    }
                }
            }
        }

        let response = format!("HTTP/1.1 400 Bad Request\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    let response = format!("HTTP/1.1 404 Not Found\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
    let _ = stream.write_all(response.as_bytes());
}

fn main() {
    let cfg = Arc::new(load_config());
    let local_ip = get_local_ip();

    println!("===============================================================================");
    println!("       AVA COFFEE K300 - DỊCH VỤ IN NGẦM MÁY IN WI-FI (STANDALONE V2)");
    println!("===============================================================================");
    println!("[1] Máy in Wi-Fi đích : {}:{}", cfg.printer_ip, cfg.printer_port);
    println!("[2] Địa chỉ IP máy POS: {}", local_ip);
    println!("[3] Cổng lắng nghe HTTP: {}", cfg.http_port);
    println!("-------------------------------------------------------------------------------");
    println!("Đang gửi lệnh test in ra máy in Wi-Fi...");

    match print_test_receipt(&cfg) {
        Ok(_) => {
            println!("==> [THÀNH CÔNG] Máy in đã nhận tín hiệu và nhả phiếu test!");
        }
        Err(e) => {
            println!("==> [CẢNH BÁO] Chưa thể gửi lệnh tới máy in: {}", e);
            println!("    Vui lòng kiểm tra: Máy in đã bật nguồn và kết nối cùng Wi-Fi chưa!");
        }
    }

    let listen_addr = format!("0.0.0.0:{}", cfg.http_port);
    let listener = match TcpListener::bind(&listen_addr) {
        Ok(l) => {
            println!("-------------------------------------------------------------------------------");
            println!("[4] SẴN SÀNG! Đang lắng nghe lệnh in từ điện thoại tại http://{}:{}", local_ip, cfg.http_port);
            println!("    * Cửa sổ này có thể thu nhỏ xuống thanh tác vụ để chạy ngầm.");
            println!("    * Mỗi khi nhân viên bấm 'Lưu đơn' hoặc 'Thanh toán' trên điện");
            println!("      thoại, máy in Wi-Fi sẽ tự động nhả bill ngay lập tức!");
            println!("===============================================================================\n");
            l
        }
        Err(_) => {
            println!("-------------------------------------------------------------------------------");
            println!("[THONG BAO] Cong {} hien dang duoc mo boi ung dung AVA Coffee POS chinh.", cfg.http_port);
            println!("==> Ung dung POS tai quay da tich hop san may chu in Wi-Fi!");
            println!("==> May in Wi-Fi ({}:{}) da san sang nhan lenh in tu dien thoai!", cfg.printer_ip, cfg.printer_port);
            println!("===============================================================================");
            println!("* Ban chi can mo ung dung AVA Coffee POS tren may nay la da co san tinh nang in.");
            println!("* Cua so nay se tu dong dong sau 10 giay...");
            std::thread::sleep(Duration::from_secs(10));
            return;
        }
    };

    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            let cfg_clone = Arc::clone(&cfg);
            std::thread::spawn(move || {
                handle_http_client(stream, cfg_clone);
            });
        }
    }
}
