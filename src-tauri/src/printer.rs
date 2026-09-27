// Module xử lý in hóa đơn ngầm (Silent Print) và kích mở két tiền (Cash Drawer) qua Win32 Spooler

#[cfg(windows)]
mod win32_spooler {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;

    #[repr(C)]
    pub struct DOC_INFO_1W {
        pub p_doc_name: *mut u16,
        pub p_output_file: *mut u16,
        pub p_datatype: *mut u16,
    }

    #[repr(C)]
    pub struct PRINTER_INFO_2W {
        pub p_server_name: *mut u16,
        pub p_printer_name: *mut u16,
        pub p_share_name: *mut u16,
        pub p_port_name: *mut u16,
        pub p_driver_name: *mut u16,
        pub p_comment: *mut u16,
        pub p_location: *mut u16,
        pub p_dev_mode: *mut std::ffi::c_void,
        pub p_sep_file: *mut u16,
        pub p_print_processor: *mut u16,
        pub p_datatype: *mut u16,
        pub p_parameters: *mut u16,
        pub p_security_descriptor: *mut std::ffi::c_void,
        pub attributes: u32,
        pub priority: u32,
        pub default_priority: u32,
        pub start_time: u32,
        pub until_time: u32,
        pub status: u32,
        pub c_jobs: u32,
        pub average_ppm: u32,
    }

    const PRINTER_ENUM_LOCAL: u32 = 0x00000002;
    const PRINTER_ENUM_CONNECTIONS: u32 = 0x00000004;

    #[link(name = "winspool")]
    extern "system" {
        pub fn OpenPrinterW(
            pPrinterName: *const u16,
            phPrinter: *mut isize,
            pDefault: *const std::ffi::c_void,
        ) -> i32;

        pub fn StartDocPrinterW(
            hPrinter: isize,
            Level: u32,
            pDocInfo: *const DOC_INFO_1W,
        ) -> u32;

        pub fn StartPagePrinter(hPrinter: isize) -> i32;

        pub fn WritePrinter(
            hPrinter: isize,
            pBuf: *const u8,
            cbBuf: u32,
            pcWritten: *mut u32,
        ) -> i32;

        pub fn EndPagePrinter(hPrinter: isize) -> i32;

        pub fn EndDocPrinter(hPrinter: isize) -> i32;

        pub fn ClosePrinter(hPrinter: isize) -> i32;

        pub fn GetDefaultPrinterW(
            pszBuffer: *mut u16,
            pcchBuffer: *mut u32,
        ) -> i32;

        pub fn EnumPrintersW(
            Flags: u32,
            Name: *const u16,
            Level: u32,
            pPrinterEnum: *mut u8,
            cbBuf: u32,
            pcbNeeded: *mut u32,
            pcReturned: *mut u32,
        ) -> i32;
    }

    pub fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn from_wide_ptr(ptr: *const u16) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0;
        unsafe {
            while *ptr.add(len) != 0 {
                len += 1;
            }
            let slice = std::slice::from_raw_parts(ptr, len);
            String::from_utf16_lossy(slice)
        }
    }

    pub fn get_default_printer() -> Result<String, String> {
        let mut buffer_size = 0u32;
        unsafe {
            GetDefaultPrinterW(null_mut(), &mut buffer_size);
        }
        if buffer_size == 0 {
            return Err("Không tìm thấy máy in mặc định trên hệ thống Windows.".to_string());
        }

        let mut buffer: Vec<u16> = vec![0; buffer_size as usize];
        let success = unsafe { GetDefaultPrinterW(buffer.as_mut_ptr(), &mut buffer_size) };
        if success == 0 {
            return Err("Không thể đọc tên máy in mặc định.".to_string());
        }

        let pos = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        Ok(String::from_utf16_lossy(&buffer[..pos]))
    }

    pub fn list_printers() -> Result<Vec<String>, String> {
        let mut needed = 0u32;
        let mut returned = 0u32;
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;

        unsafe {
            EnumPrintersW(flags, null_mut(), 2, null_mut(), 0, &mut needed, &mut returned);
        }

        if needed == 0 {
            return Ok(Vec::new());
        }

        let mut buffer: Vec<u8> = vec![0; needed as usize];
        let success = unsafe {
            EnumPrintersW(
                flags,
                null_mut(),
                2,
                buffer.as_mut_ptr(),
                needed,
                &mut needed,
                &mut returned,
            )
        };

        if success == 0 {
            return Err("Lỗi khi quét danh sách máy in từ Windows Spooler.".to_string());
        }

        let mut printers = Vec::new();
        let info_slice = unsafe {
            std::slice::from_raw_parts(buffer.as_ptr() as *const PRINTER_INFO_2W, returned as usize)
        };

        for info in info_slice {
            let name = from_wide_ptr(info.p_printer_name);
            if !name.is_empty() {
                printers.push(name);
            }
        }

        Ok(printers)
    }

    pub fn raw_print(printer_name: &str, data: &[u8]) -> Result<(), String> {
        let wide_name = to_wide(printer_name);
        let mut h_printer: isize = 0;

        let ok = unsafe { OpenPrinterW(wide_name.as_ptr(), &mut h_printer, null_mut()) };
        if ok == 0 || h_printer == 0 {
            return Err(format!("Không thể mở kết nối tới máy in '{}'. Hãy kiểm tra cáp USB hoặc driver.", printer_name));
        }

        let mut doc_name = to_wide("AVA Coffee K300 Receipt");
        let mut datatype = to_wide("RAW");

        let doc_info = DOC_INFO_1W {
            p_doc_name: doc_name.as_mut_ptr(),
            p_output_file: null_mut(),
            p_datatype: datatype.as_mut_ptr(),
        };

        let job_id = unsafe { StartDocPrinterW(h_printer, 1, &doc_info) };
        if job_id == 0 {
            unsafe { ClosePrinter(h_printer) };
            return Err("Không thể khởi tạo tiến trình in Spooler.".to_string());
        }

        unsafe {
            StartPagePrinter(h_printer);
            let mut written = 0u32;
            WritePrinter(h_printer, data.as_ptr(), data.len() as u32, &mut written);
            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);
            ClosePrinter(h_printer);
        }

        Ok(())
    }
}

/// Lấy danh sách máy in có trên hệ thống Windows
pub fn get_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        win32_spooler::list_printers()
    }
    #[cfg(not(windows))]
    {
        Ok(vec!["Mock POS Printer (USB/LAN)".to_string()])
    }
}

/// In trực tiếp qua mạng Wi-Fi/LAN tới cổng 9100 của máy in nhiệt ESC/POS
pub fn print_tcp(ip: &str, port: u16, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addr_str = format!("{}:{}", ip, port);
    let socket_addr: SocketAddr = addr_str
        .parse()
        .map_err(|e| format!("Địa chỉ IP máy in '{}' không hợp lệ: {}", addr_str, e))?;

    let mut stream = TcpStream::connect_timeout(&socket_addr, Duration::from_millis(2000))
        .map_err(|e| format!("Không thể kết nối máy in Wi-Fi {}: {}. Vui lòng kiểm tra nguồn và Wi-Fi máy in!", addr_str, e))?;

    stream.set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;

    stream.write_all(data)
        .map_err(|e| format!("Lỗi gửi dữ liệu tới máy in Wi-Fi: {}", e))?;

    stream.flush()
        .map_err(|e| format!("Lỗi flush máy in Wi-Fi: {}", e))?;

    Ok(())
}

/// In ngầm trực tiếp hóa đơn nhị phân ESC/POS (Hỗ trợ cả Wi-Fi LAN TCP 9100 và USB Win32 Spooler)
pub fn print_escpos_raw(data: &[u8], target_printer: Option<String>) -> Result<(), String> {
    // 1. Nếu target_printer là địa chỉ IP mạng (ví dụ "192.168.1.167" hoặc "192.168.1.167:9100")
    if let Some(ref target) = target_printer {
        if target.contains('.') {
            let (ip, port) = if let Some((ip_part, port_part)) = target.split_once(':') {
                (ip_part.trim(), port_part.trim().parse().unwrap_or(9100))
            } else {
                (target.trim(), 9100)
            };
            return print_tcp(ip, port, data);
        }
    }

    // 2. Thử in trực tiếp qua TCP Socket Wi-Fi tới máy in 192.168.1.167:9100 trước
    if let Ok(()) = print_tcp("192.168.1.167", 9100, data) {
        println!("[Print] Đã in thành công qua Wi-Fi TCP Socket 192.168.1.167:9100");
        return Ok(());
    }

    // 3. Fallback sang cổng USB / Windows Spooler nếu cắm dây
    #[cfg(windows)]
    {
        let printer = match target_printer {
            Some(name) if !name.trim().is_empty() => name,
            _ => win32_spooler::get_default_printer()?,
        };
        win32_spooler::raw_print(&printer, data)
    }
    #[cfg(not(windows))]
    {
        println!("[Non-Windows Mock Print] Received {} bytes of ESC/POS data", data.len());
        Ok(())
    }
}

/// Gửi lệnh xung kích mở két tiền (Cash Drawer Kick qua cổng RJ11 máy in nhiệt)
/// Lệnh chuẩn ESC/POS: ESC p 0 25 250 (Pin 2) và ESC p 1 25 250 (Pin 5)
pub fn kick_cash_drawer(target_printer: Option<String>) -> Result<(), String> {
    // Mã nhị phân kích mở két tiền cổng RJ11 tiêu chuẩn của các dòng máy in K80 (Xprinter, Epson, Rongta, v.v.)
    let kick_cmd: [u8; 10] = [
        0x1B, 0x70, 0x00, 0x19, 0xFA, // Chân Pin 2
        0x1B, 0x70, 0x01, 0x19, 0xFA  // Chân Pin 5
    ];
    print_escpos_raw(&kick_cmd, target_printer)
}
