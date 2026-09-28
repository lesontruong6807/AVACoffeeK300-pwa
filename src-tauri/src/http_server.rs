// HTTP Print Bridge Server cho AVA Coffee K300 Desktop POS
// Lắng nghe trên cổng 3333 để nhận lệnh in hóa đơn qua mạng Wi-Fi từ điện thoại nhân viên

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};


pub fn start_http_print_server(port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => {
            println!("[HTTP Print Bridge] Đang lắng nghe lệnh in Wi-Fi tại http://{}", addr);
            l
        }
        Err(e) => {
            eprintln!("[HTTP Print Bridge] Không thể mở cổng {}: {}. Vui lòng kiểm tra xung đột cổng.", addr, e);
            return;
        }
    };

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                std::thread::spawn(move || {
                    handle_connection(stream);
                });
            }
            Err(e) => {
                eprintln!("[HTTP Print Bridge] Lỗi kết nối incoming: {}", e);
            }
        }
    }
}

fn handle_connection(mut stream: TcpStream) {
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

    if buffer.is_empty() {
        return;
    }

    let hend = match header_end {
        Some(h) => h,
        None => buffer.len(),
    };

    let header_str = String::from_utf8_lossy(&buffer[..hend]);
    let first_line = header_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let path = parts[1];

    let cors_headers = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\n";

    // Xử lý CORS Preflight
    if method == "OPTIONS" {
        let response = format!("HTTP/1.1 200 OK\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Healthcheck / Status
    if method == "GET" && (path == "/status" || path == "/" || path == "/ping") {
        let body = serde_json::json!({
            "status": "ready",
            "service": "AVA Coffee K300 Print Server",
            "port": 3333,
            "version": "1.0"
        }).to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors_headers, body.len(), body
        );
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // Xử lý yêu cầu in: POST /print
    if method == "POST" && path == "/print" {
        let body_bytes = if buffer.len() > hend {
            &buffer[hend..hend + content_length.min(buffer.len() - hend)]
        } else {
            &[]
        };

        match handle_print_payload(body_bytes) {
            Ok(msg) => {
                let body = serde_json::json!({
                    "success": true,
                    "message": msg
                }).to_string();
                let response = format!(
                    "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    cors_headers, body.len(), body
                );
                let _ = stream.write_all(response.as_bytes());
            }
            Err(err_msg) => {
                let body = serde_json::json!({
                    "success": false,
                    "error": err_msg
                }).to_string();
                let response = format!(
                    "HTTP/1.1 500 Internal Server Error\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    cors_headers, body.len(), body
                );
                let _ = stream.write_all(response.as_bytes());
            }
        }
        return;
    }

    // Xử lý kích mở két tiền: POST /kick
    if method == "POST" && path == "/kick" {
        let _ = crate::printer::kick_cash_drawer(None);
        let body = serde_json::json!({ "success": true, "message": "Đã mở két tiền" }).to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            cors_headers, body.len(), body
        );
        let _ = stream.write_all(response.as_bytes());
        return;
    }

    // 404 cho các đường dẫn khác
    let response = format!("HTTP/1.1 404 Not Found\r\n{}Content-Length: 0\r\nConnection: close\r\n\r\n", cors_headers);
    let _ = stream.write_all(response.as_bytes());
}

fn handle_print_payload(body: &[u8]) -> Result<String, String> {
    if body.is_empty() {
        return Err("Payload rỗng".to_string());
    }

    let val: serde_json::Value = serde_json::from_slice(body)
        .map_err(|e| format!("Dữ liệu JSON không hợp lệ: {}", e))?;

    let printer_name = val.get("printerName")
        .and_then(|p| p.as_str())
        .map(|s| s.to_string());

    // Trường hợp 1: Dữ liệu là mảng byte ESC/POS trực tiếp ("data": [27, 64, ...])
    if let Some(arr) = val.get("data").and_then(|d| d.as_array()) {
        let raw_bytes: Vec<u8> = arr.iter().filter_map(|x| x.as_u64().map(|n| n as u8)).collect();
        if raw_bytes.is_empty() {
            return Err("Dữ liệu mã in rỗng".to_string());
        }


        crate::printer::print_escpos_raw(&raw_bytes, printer_name)?;
        return Ok("Đã in hóa đơn thành công".to_string());
    }

    Err("Không tìm thấy trường 'data' chứa mã ESC/POS".to_string())
}
