-- =====================================================================================
-- AVA COFFEE K300 - NÂNG CẤP DATABASE V2 (chạy 1 lần trong Supabase > SQL Editor > Run)
-- -------------------------------------------------------------------------------------
-- An toàn tuyệt đối với dữ liệu đang có:
--   * KHÔNG xóa / sửa bất kỳ đơn hàng, món, nguyên liệu, chấm công nào.
--   * Chạy lại nhiều lần cũng không sao (mọi lệnh đều "if not exists" / "create or replace").
--   * App vẫn chạy bình thường kể cả khi CHƯA chạy file này (app tự dùng cách cũ).
-- Nội dung:
--   1. Chỉ mục (index) giúp tải đơn / kho / chấm công nhanh hơn
--   2. Hàm trừ kho NGUYÊN TỬ: điện thoại và máy POS bán cùng lúc không bao giờ lệch kho
--   3. Hàm cộng / trừ kho khi hủy đơn, từ chối hủy đơn (cùng cơ chế nguyên tử)
--   4. Kho ảnh món (Supabase Storage) để ảnh tải nhanh trên mọi máy
--   5. Bật realtime cho bảng công thức (máy POS nhận ngay khi Admin sửa định lượng)
-- =====================================================================================


-- -------------------------------------------------------------------------------------
-- 1. CHỈ MỤC (INDEX)
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hoadon_trang_thai_ngay   ON public.hoadon (trang_thai_thanh_toan, ngay_tao DESC);
CREATE INDEX IF NOT EXISTS idx_hoadon_ban_chua_tt       ON public.hoadon (id_ban, trang_thai_thanh_toan);
CREATE INDEX IF NOT EXISTS idx_hoadon_ngay_tao          ON public.hoadon (ngay_tao DESC);
CREATE INDEX IF NOT EXISTS idx_hoadon_ngay_thanh_toan   ON public.hoadon (ngay_thanh_toan DESC);
CREATE INDEX IF NOT EXISTS idx_hoadon_nhan_vien         ON public.hoadon (id_nhan_vien, ngay_tao DESC);

CREATE INDEX IF NOT EXISTS idx_hoadondetail_idhoadon    ON public.hoadondetail (idhoadon);
CREATE INDEX IF NOT EXISTS idx_hoadondetail_idsp        ON public.hoadondetail (idsp);

CREATE INDEX IF NOT EXISTS idx_lichsukho_thoi_gian      ON public.lichsukho (thoi_gian_tao DESC);
CREATE INDEX IF NOT EXISTS idx_lichsukho_loai_thoi_gian ON public.lichsukho (loai_giao_dich, thoi_gian_tao DESC);
CREATE INDEX IF NOT EXISTS idx_lichsukho_nguyenlieu     ON public.lichsukho (id_nguyen_lieu, loai_giao_dich, thoi_gian_tao DESC);
CREATE INDEX IF NOT EXISTS idx_lichsukho_trang_thai     ON public.lichsukho (trang_thai);

CREATE INDEX IF NOT EXISTS idx_congthuc_san_pham        ON public.congthuc (id_san_pham);
CREATE INDEX IF NOT EXISTS idx_chamcong_nhan_vien       ON public.chamcong (id_nhan_vien, gio_vao DESC);
CREATE INDEX IF NOT EXISTS idx_chamcong_trang_thai      ON public.chamcong (trang_thai);
CREATE INDEX IF NOT EXISTS idx_nghiphep_nhan_vien       ON public.nghiphep (id_nhan_vien, ngay_nop DESC);


-- -------------------------------------------------------------------------------------
-- 2. HÀM TRỪ KHO KHI BÁN HÀNG (NGUYÊN TỬ)
-- p_changes: [{ "id_nguyen_lieu": "ing_caphe", "so_luong": 40 }, ...]  (app đã tính sẵn theo công thức + loại ly)
-- * Trừ thẳng trên server: so_luong_ton = so_luong_ton - x  (không đọc-rồi-ghi đè như trước)
-- * Gộp vào 1 dòng nhật ký "Bán hàng" mỗi nguyên liệu mỗi ngày (giờ Việt Nam) giống hệt cách cũ
-- * Khóa theo thứ tự mã nguyên liệu để 2 máy cùng thanh toán không bị kẹt (deadlock)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ava_tru_kho_ban_hang(p_changes jsonb, p_ghi_chu text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_day date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_log_id text;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT e->>'id_nguyen_lieu' AS ing, SUM((e->>'so_luong')::numeric) AS qty
    FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) AS e
    WHERE COALESCE(e->>'id_nguyen_lieu', '') <> ''
    GROUP BY e->>'id_nguyen_lieu'
    ORDER BY 1
  LOOP
    CONTINUE WHEN r.qty IS NULL OR r.qty <= 0;

    UPDATE public.nguyenlieu
       SET so_luong_ton = GREATEST(0, COALESCE(so_luong_ton, 0) - r.qty)
     WHERE id = r.ing;
    CONTINUE WHEN NOT FOUND;

    SELECT id INTO v_log_id
      FROM public.lichsukho
     WHERE id_nguyen_lieu = r.ing
       AND loai_giao_dich = 'Bán hàng'
       AND (thoi_gian_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_day
     ORDER BY thoi_gian_tao DESC
     LIMIT 1
     FOR UPDATE;

    IF v_log_id IS NOT NULL THEN
      UPDATE public.lichsukho
         SET so_luong_thay_doi = so_luong_thay_doi - r.qty,
             thoi_gian_tao = now()
       WHERE id = v_log_id;
    ELSE
      INSERT INTO public.lichsukho (id, id_nguyen_lieu, so_luong_thay_doi, loai_giao_dich, chi_phi, ghi_chu, trang_thai)
      VALUES (
        'inv_' || substr(md5(random()::text || clock_timestamp()::text || r.ing), 1, 10),
        r.ing,
        -r.qty,
        'Bán hàng',
        0,
        COALESCE(p_ghi_chu, 'Khấu trừ tổng hợp bán hàng POS ngày ' || to_char(v_day, 'DD/MM/YYYY')),
        'Đã duyệt'
      );
    END IF;

    v_log_id := NULL;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- -------------------------------------------------------------------------------------
-- 3. HÀM CỘNG / TRỪ KHO CÓ GHI NHẬT KÝ (hoàn kho khi hủy đơn, thu hồi kho khi từ chối hủy)
-- p_changes: [{ "id_nguyen_lieu": "...", "so_luong": 5, "ghi_chu": "..." }]  so_luong > 0: cộng kho, < 0: trừ kho
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ava_dieu_chinh_kho(
  p_changes jsonb,
  p_loai text DEFAULT 'Khác',
  p_ghi_chu text DEFAULT NULL,
  p_nhan_vien text DEFAULT NULL,
  p_trang_thai text DEFAULT 'Đã duyệt'
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_staff text;
BEGIN
  -- Mã nhân viên không tồn tại (ví dụ 'system') thì để trống, tránh lỗi khóa ngoại
  SELECT id INTO v_staff FROM public.nguoidung WHERE id = p_nhan_vien;

  FOR r IN
    SELECT e->>'id_nguyen_lieu' AS ing,
           SUM((e->>'so_luong')::numeric) AS qty,
           MAX(e->>'ghi_chu') AS note
    FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) AS e
    WHERE COALESCE(e->>'id_nguyen_lieu', '') <> ''
    GROUP BY e->>'id_nguyen_lieu'
    ORDER BY 1
  LOOP
    CONTINUE WHEN r.qty IS NULL OR r.qty = 0;

    UPDATE public.nguyenlieu
       SET so_luong_ton = GREATEST(0, COALESCE(so_luong_ton, 0) + r.qty)
     WHERE id = r.ing;
    CONTINUE WHEN NOT FOUND;

    INSERT INTO public.lichsukho (id, id_nguyen_lieu, so_luong_thay_doi, loai_giao_dich, chi_phi, ghi_chu, id_nhan_vien, trang_thai)
    VALUES (
      'inv_' || substr(md5(random()::text || clock_timestamp()::text || r.ing), 1, 10),
      r.ing,
      r.qty,
      COALESCE(p_loai, 'Khác'),
      0,
      COALESCE(r.note, p_ghi_chu),
      v_staff,
      COALESCE(p_trang_thai, 'Đã duyệt')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ava_tru_kho_ban_hang(jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ava_dieu_chinh_kho(jsonb, text, text, text, text) TO anon, authenticated;


-- -------------------------------------------------------------------------------------
-- 4. KHO ẢNH MÓN (Supabase Storage - bucket công khai "product-images")
-- Ảnh được app tự nén (~20-40KB WebP) rồi tải lên đây; bảng sanpham chỉ lưu đường link ảnh
-- -> danh sách món tải nhanh, ảnh được trình duyệt lưu đệm, POS và điện thoại đều hiển thị.
-- -------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 1048576, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'AVA product images - xem') THEN
    CREATE POLICY "AVA product images - xem" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'AVA product images - tai len') THEN
    CREATE POLICY "AVA product images - tai len" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'AVA product images - cap nhat') THEN
    CREATE POLICY "AVA product images - cap nhat" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');
  END IF;
END $$;


-- -------------------------------------------------------------------------------------
-- 5. REALTIME CHO BẢNG CÔNG THỨC (Admin sửa định lượng -> máy POS cập nhật ngay)
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.congthuc;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;


-- Kiểm tra nhanh sau khi chạy (phải ra 2 dòng: ava_dieu_chinh_kho, ava_tru_kho_ban_hang)
SELECT proname FROM pg_proc WHERE proname IN ('ava_tru_kho_ban_hang', 'ava_dieu_chinh_kho') ORDER BY proname;
