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

// Dung lượng tối đa mong muốn của 1 ảnh món sau khi nén
const TARGET_MAX_KB = 40;

/** Chuyển ảnh dạng data URL (base64) thành Blob để tải lên kho ảnh */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/webp';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Nén lại 1 ảnh có sẵn (data URL base64 cũ hoặc đường dẫn ảnh) về chuẩn WebP nhẹ */
export async function recompressImageSource(src: string, maxDimension = 400): Promise<CompressResult> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error('Không tải được ảnh gốc');
  const blob = await resp.blob();
  const file = new File([blob], 'product-image', { type: blob.type || 'image/jpeg' });
  return compressProductImage(file, maxDimension);
}

export async function compressProductImage(
  file: File,
  maxDimension = 400,
  quality = 0.82
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    if (file.type && !file.type.startsWith('image/')) {
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
        const supportsWebp = canvas.toDataURL('image/webp', quality).startsWith('data:image/webp');
        const mime = supportsWebp ? 'image/webp' : 'image/jpeg';
        if (!supportsWebp) {
          // JPEG không có nền trong suốt -> tô nền trắng để ảnh PNG trong suốt không bị đen
          const bg = document.createElement('canvas');
          bg.width = width;
          bg.height = height;
          const bgCtx = bg.getContext('2d');
          if (bgCtx) {
            bgCtx.fillStyle = '#FFFFFF';
            bgCtx.fillRect(0, 0, width, height);
            bgCtx.drawImage(canvas, 0, 0);
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(bg, 0, 0);
          }
        }

        // Tự hạ dần chất lượng cho tới khi ảnh đủ nhẹ (~40KB) để app tải nhanh trên mọi máy
        let q = quality;
        let dataUrl = canvas.toDataURL(mime, q);
        while (estimateBase64SizeKB(dataUrl) > TARGET_MAX_KB && q > 0.45) {
          q = Math.round((q - 0.08) * 100) / 100;
          dataUrl = canvas.toDataURL(mime, q);
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
