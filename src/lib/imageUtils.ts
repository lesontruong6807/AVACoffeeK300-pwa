/**
 * Tiện ích nén và tối ưu hóa hình ảnh đồ uống trực tiếp trên trình duyệt (Client-Side)
 * - Tự động resize ảnh về kích thước chuẩn (mặc định tối đa 400x400px)
 * - Nén sang định dạng WebP (hoặc JPEG fallback) với chất lượng tối ưu (quality = 0.82)
 * - Dung lượng sau nén chỉ khoảng 15KB - 30KB (giảm hơn 95% so với ảnh chụp gốc 5MB - 10MB)
 * - Lưu vĩnh viễn trên Supabase Cloud Database (bảng sanpham, cột hinh_anh)
 * - Đồng bộ tức thì và hiển thị sắc nét trên tất cả thiết bị (Web PC, Mobile staff, Desktop POS exe, Màn hình phụ)
 */

export interface CompressResult {
  dataUrl: string;
  sizeKB: number;
  width: number;
  height: number;
}

export function estimateBase64SizeKB(base64String: string): number {
  if (!base64String) return 0;
  // Bỏ phần header "data:image/...;base64,"
  const base64Data = base64String.split(',')[1] || base64String;
  const sizeInBytes = Math.round((base64Data.length * 3) / 4);
  return Math.round((sizeInBytes / 1024) * 10) / 10;
}

export async function compressProductImage(
  file: File,
  maxDimension = 400,
  quality = 0.82
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Vui lòng chọn file hình ảnh hợp lệ (PNG, JPG, JPEG, WEBP)!'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tập tin ảnh!'));
    
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Định dạng hình ảnh không được hỗ trợ bởi trình duyệt!'));
      
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Giữ nguyên tỷ lệ khung hình và scale xuống nếu vượt quá maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Không thể khởi tạo Canvas 2D'));
        }

        // Tối ưu thuật toán làm mịn ảnh chất lượng cao
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Thử xuất WebP trước (hỗ trợ cả nền trong suốt PNG)
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          // Trình duyệt không hỗ trợ xuất WebP qua canvas -> fallback sang JPEG
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const sizeKB = estimateBase64SizeKB(dataUrl);
        resolve({
          dataUrl,
          sizeKB,
          width,
          height
        });
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
