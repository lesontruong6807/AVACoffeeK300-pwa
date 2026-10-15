// Cấu hình thanh toán chuyển khoản Techcombank VietQR cho AVA Coffee K300

export const TECHCOMBANK_INFO = {
  bankId: '970407', // Mã BIN chuẩn Napas của Techcombank
  bankName: 'Techcombank',
  bankFullName: 'Ngân hàng TMCP Kỹ thương Việt Nam',
  accountNumber: '2308795888',
  accountNumberFormatted: '2308 7958 88',
  accountName: 'LÊ THỊ QUỲNH CHÂU',
  accountNameRaw: 'LE THI QUYNH CHAU',
  storeName: 'AVA COFFEE K300'
};

/**
 * Tạo URL mã QR động từ dịch vụ chuẩn VietQR (Napas 247)
 * Tự động gắn số tiền chính xác và nội dung chuyển khoản
 * @param amount Số tiền cần chuyển (VNĐ)
 * @param memo Nội dung chuyển khoản (tối đa 25 ký tự)
 * @param template Mẫu giao diện VietQR: 'compact2' | 'compact' | 'qr_only'
 */
export function getVietQrUrl(
  amount?: number, 
  memo?: string, 
  template: 'compact2' | 'compact' | 'qr_only' = 'compact2'
): string {
  const { bankId, accountNumber, accountNameRaw } = TECHCOMBANK_INFO;
  const accParam = encodeURIComponent(accountNameRaw);
  const infoParam = encodeURIComponent((memo || 'AVA COFFEE K300').slice(0, 25));

  if (amount && amount > 0) {
    const safeAmount = Math.round(amount);
    return `https://img.vietqr.io/image/${bankId}-${accountNumber}-${template}.png?amount=${safeAmount}&addInfo=${infoParam}&accountName=${accParam}`;
  }

  return `https://img.vietqr.io/image/${bankId}-${accountNumber}-${template}.png?addInfo=${infoParam}&accountName=${accParam}`;
}
