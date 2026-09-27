// AVA Coffee K300 - Standalone Windows Background Print Server
// Chạy độc lập trên máy POS Windows để nhận lệnh in hóa đơn qua mạng LAN/Wi-Fi từ điện thoại

const http = require('http');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3333;

// Hàm gửi dữ liệu nhị phân ESC/POS trực tiếp tới máy in Windows qua PowerShell Win32 Spooler
function printRawEscPosWindows(bytesArray, printerName) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `ava_receipt_${Date.now()}.bin`);
    const buffer = Buffer.from(bytesArray);
    
    fs.writeFile(tempFile, buffer, (writeErr) => {
      if (writeErr) {
        return reject(`Lỗi ghi file tạm: ${writeErr.message}`);
      }

      // Script PowerShell nạp Win32 winspool.drv để in RAW ra máy in mặc định hoặc chỉ định
      const psScript = `
        $printerName = ${printerName ? `"${printerName}"` : '(Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name'}
        if (-not $printerName) {
            Write-Error "Khong tim thay may in mac dinh tren Windows"
            exit 1
        }
        $filePath = "${tempFile.replace(/\\/g, '\\\\')}"
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        
        $typeDef = @"
        using System;
        using System.Runtime.InteropServices;
        public class WinSpooler {
            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public class DOCINFO {
                public string pDocName;
                public string pOutputFile;
                public string pDataType;
            }
            [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
            [DllImport("winspool.drv", SetLastError = true)]
            public static extern bool ClosePrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint StartDocPrinter(IntPtr hPrinter, uint level, DOCINFO di);
            [DllImport("winspool.drv", SetLastError = true)]
            public static extern bool EndDocPrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError = true)]
            public static extern bool StartPagePrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError = true)]
            public static extern bool EndPagePrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError = true)]
            public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
            public static bool SendRawBytes(string printerName, byte[] data) {
                IntPtr hPrinter;
                if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
                DOCINFO di = new DOCINFO { pDocName = "AVA Coffee Print Bridge", pDataType = "RAW" };
                if (StartDocPrinter(hPrinter, 1, di) == 0) { ClosePrinter(hPrinter); return false; }
                StartPagePrinter(hPrinter);
                int written;
                WritePrinter(hPrinter, data, data.Length, out written);
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                ClosePrinter(hPrinter);
                return true;
            }
        }
"@
        Add-Type -TypeDefinition $typeDef
        $ok = [WinSpooler]::SendRawBytes($printerName, $bytes)
        if ($ok) { Write-Output "IN_THANH_CONG" } else { exit 2 }
      `;

      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, ' ')}"`, (psErr, stdout) => {
        // Dọn dẹp file tạm
        try { fs.unlinkSync(tempFile); } catch (_) {}

        if (psErr || !stdout.includes('IN_THANH_CONG')) {
          return reject(`Lỗi PowerShell WinSpool: ${psErr ? psErr.message : 'Không thể gửi dữ liệu tới máy in'}`);
        }
        resolve(true);
      });
    });
  });
}

// Tạo HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Headers cho phép điện thoại gọi vào thoải mái
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'GET' && (req.url === '/status' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      status: 'ready',
      service: 'AVA Coffee K300 Standalone Print Server',
      port: PORT,
      time: new Date().toISOString()
    }));
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.data || !Array.isArray(payload.data)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Thiếu trường data' }));
        }

        await printRawEscPosWindows(payload.data, payload.printerName);
        console.log(`[${new Date().toLocaleTimeString()}] Đã in thành công ${payload.data.length} bytes ESC/POS.`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Đã gửi lệnh in ra máy in quầy POS' }));
      } catch (err) {
        console.error('Lỗi xử lý lệnh in:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(' AVA COFFEE K300 - MÁY CHỦ IN NGẦM WI-FI ĐÃ SẴN SÀNG ');
  console.log('====================================================');
  console.log(`Đang lắng nghe cổng: http://0.0.0.0:${PORT}`);
  console.log('Điện thoại nhân viên cùng Wi-Fi có thể in trực tiếp tới quầy!');
  console.log('----------------------------------------------------');
});
