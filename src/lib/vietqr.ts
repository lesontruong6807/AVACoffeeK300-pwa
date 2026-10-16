// Cấu hình thanh toán Techcombank VietQR & Loa báo thanh toán Soundbox cho AVA Coffee K300

export const TECHCOMBANK_INFO = {
  bankId: '970407', // Mã BIN chuẩn Napas của Techcombank
  bankName: 'Techcombank',
  bankFullName: 'Ngân hàng TMCP Kỹ thương Việt Nam',
  merchantId: 'MS00T04320808126774', // Mã điểm bán kết nối Loa Soundbox thông báo âm thanh
  accountNumber: '2308795888',
  accountNumberFormatted: '2308 7958 88',
  accountName: 'LÊ THỊ QUỲNH CHÂU',
  accountNameRaw: 'LE THI QUYNH CHAU',
  storeName: 'AVA COFFEE K300',
  qrCardUrl: '/techcombank-qr-card.png',   // Ảnh thẻ QR cứng chính thức có logo, mã điểm bán và Napas 247
  qrMatrixUrl: '/techcombank-qr.png'      // Ảnh mã QR vuông cắt trực tiếp từ standee điểm bán
};

export const OFFICIAL_MERCHANT_QR = '/techcombank-qr-card.png';
export const OFFICIAL_MERCHANT_QR_MATRIX = '/techcombank-qr.png';

/**
 * Lấy đường dẫn mã QR Techcombank của quán:
 * Sử dụng trực tiếp ảnh QR cứng từ Standee kết nối Loa thông báo âm thanh Soundbox (MS00T04320808126774)
 * để đảm bảo 100% các giao dịch đều kích hoạt loa thông báo tức thì cho nhân viên nghe thấy.
 */
export function getVietQrUrl(
  _amount?: number, 
  _memo?: string, 
  template: 'compact2' | 'compact' | 'qr_only' = 'compact2'
): string {
  // Trả về QR cứng kết nối Loa Soundbox
  if (template === 'qr_only') {
    return OFFICIAL_MERCHANT_QR_MATRIX;
  }
  return OFFICIAL_MERCHANT_QR;
}

