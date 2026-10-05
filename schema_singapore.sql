-- ==============================================================================
-- DATABASE SCHEMA & POLICIES CHO AVA COFFEE - REGION SINGAPORE (ap-southeast-1)
-- Project: rjrvgmyrnqfipqswpxew
-- ==============================================================================

-- BƯỚC 0: DỌN DẸP BẢNG CŨ NẾU CÓ TRÊN PROJECT MỚI
DROP TABLE IF EXISTS public.chitietnhapkho CASCADE;
DROP TABLE IF EXISTS public.phieunhapkho CASCADE;
DROP TABLE IF EXISTS public.chiphivanhang CASCADE;
DROP TABLE IF EXISTS public.lichsukho CASCADE;
DROP TABLE IF EXISTS public.congthuc CASCADE;
DROP TABLE IF EXISTS public.nguyenlieu CASCADE;
DROP TABLE IF EXISTS public.nghiphep CASCADE;
DROP TABLE IF EXISTS public.chamcong CASCADE;
DROP TABLE IF EXISTS public.hoadondetail CASCADE;
DROP TABLE IF EXISTS public.hoadon CASCADE;
DROP TABLE IF EXISTS public.sanpham CASCADE;
DROP TABLE IF EXISTS public.danhmuc CASCADE;
DROP TABLE IF EXISTS public.danhsachban CASCADE;
DROP TABLE IF EXISTS public.nguoidung CASCADE;

-- BƯỚC 1: HÀM TỰ ĐỘNG TẠO ID NGẮN
CREATE OR REPLACE FUNCTION public.generate_short_id(prefix text) 
RETURNS text AS $$
DECLARE
    chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result text := prefix;
    i integer;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- BƯỚC 2: TẠO CÁC BẢNG DỮ LIỆU CỐT LÕI

-- 1. BẢNG NGƯỜI DÙNG / NHÂN VIÊN
CREATE TABLE public.nguoidung (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('u_'),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL DEFAULT '123456',
    email TEXT UNIQUE NOT NULL,
    ho_ten TEXT NOT NULL,
    vai_tro TEXT NOT NULL CHECK (vai_tro IN ('Admin', 'User')) DEFAULT 'User',
    ngay_tao TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. BẢNG DANH SÁCH BÀN
CREATE TABLE public.danhsachban (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('tb_'),
    ten_ban TEXT NOT NULL UNIQUE,
    suc_chua INTEGER NOT NULL DEFAULT 4,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Trống', 'Đang phục vụ')) DEFAULT 'Trống'
);

-- 3. BẢNG DANH MỤC SẢN PHẨM
CREATE TABLE public.danhmuc (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('c_'),
    ten_danh_muc TEXT NOT NULL UNIQUE
);

-- 4. BẢNG SẢN PHẨM (MENU)
CREATE TABLE public.sanpham (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('p_'),
    id_danh_muc TEXT REFERENCES public.danhmuc(id) ON DELETE CASCADE NOT NULL,
    ten_san_pham TEXT NOT NULL,
    don_vi_tinh TEXT NOT NULL DEFAULT 'Ly',
    don_gia NUMERIC NOT NULL CHECK (don_gia >= 0),
    gia_von NUMERIC NOT NULL CHECK (gia_von >= 0) DEFAULT 0,
    hinh_anh TEXT,
    mo_ta TEXT,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Còn hàng', 'Hết hàng')) DEFAULT 'Còn hàng'
);

-- 5. BẢNG NGUYÊN LIỆU KHO
CREATE TABLE public.nguyenlieu (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('ing_'),
    ten_nguyen_lieu TEXT NOT NULL UNIQUE,
    don_vi_tinh TEXT NOT NULL,
    so_luong_ton NUMERIC NOT NULL DEFAULT 0,
    muc_canh_bao NUMERIC,
    quy_cach TEXT,
    don_gia_nhap NUMERIC DEFAULT 0,
    gia_von_trung_binh NUMERIC DEFAULT 0
);

-- 6. BẢNG CÔNG THỨC PHA CHẾ
CREATE TABLE public.congthuc (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('rec_'),
    id_san_pham TEXT REFERENCES public.sanpham(id) ON DELETE CASCADE NOT NULL,
    id_nguyen_lieu TEXT REFERENCES public.nguyenlieu(id) ON DELETE CASCADE NOT NULL,
    so_luong_can NUMERIC NOT NULL CHECK (so_luong_can > 0),
    don_vi_tinh TEXT NOT NULL
);

-- 7. BẢNG HÓA ĐƠN BÁN HÀNG
CREATE TABLE public.hoadon (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('ord_'),
    id_ban TEXT REFERENCES public.danhsachban(id) ON DELETE SET NULL,
    id_nhan_vien TEXT REFERENCES public.nguoidung(id) ON DELETE SET NULL,
    tong_tien NUMERIC NOT NULL CHECK (tong_tien >= 0) DEFAULT 0,
    trang_thai_thanh_toan TEXT NOT NULL CHECK (trang_thai_thanh_toan IN ('Chưa thanh toán', 'Đã thanh toán', 'Đã hủy', 'Chờ duyệt hủy')) DEFAULT 'Chưa thanh toán',
    phuong_thuc_thanh_toan TEXT CHECK (phuong_thuc_thanh_toan IN ('Tiền mặt', 'Chuyển khoản')),
    giam_gia NUMERIC DEFAULT 0 CHECK (giam_gia >= 0),
    ghi_chu TEXT,
    ngay_tao TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ngay_thanh_toan TIMESTAMP WITH TIME ZONE
);

-- 8. BẢNG CHI TIẾT HÓA ĐƠN
CREATE TABLE public.hoadondetail (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('item_'),
    idhoadon TEXT REFERENCES public.hoadon(id) ON DELETE CASCADE NOT NULL,
    idsp TEXT REFERENCES public.sanpham(id) ON DELETE CASCADE NOT NULL,
    ten_san_pham TEXT NOT NULL,
    don_vi_tinh TEXT NOT NULL DEFAULT 'Ly',
    don_gia NUMERIC NOT NULL CHECK (don_gia >= 0),
    so_luong INTEGER NOT NULL CHECK (so_luong > 0),
    thanh_tien NUMERIC NOT NULL CHECK (thanh_tien >= 0),
    gia_von NUMERIC DEFAULT 0,
    ghi_chu TEXT DEFAULT ''
);

-- 9. BẢNG LỊCH SỬ KHO (XUẤT / NHẬP / BÁN HÀNG / HAO HỤT)
CREATE TABLE public.lichsukho (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('inv_'),
    id_nguyen_lieu TEXT REFERENCES public.nguyenlieu(id) ON DELETE CASCADE,
    ten_nguyen_lieu_khac TEXT,
    so_luong_thay_doi NUMERIC NOT NULL,
    loai_giao_dich TEXT NOT NULL CHECK (loai_giao_dich IN ('Nhập kho', 'Bán hàng', 'Hao hụt/Cân lại', 'Khác')),
    chi_phi NUMERIC DEFAULT 0,
    ghi_chu TEXT,
    id_nhan_vien TEXT REFERENCES public.nguoidung(id) ON DELETE SET NULL,
    thoi_gian_tao TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối')) DEFAULT 'Đã duyệt'
);

-- 10. BẢNG PHIẾU NHẬP KHO
CREATE TABLE public.phieunhapkho (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ma_phieu TEXT NOT NULL UNIQUE,
    id_nhan_vien TEXT REFERENCES public.nguoidung(id),
    nha_cung_cap TEXT,
    tong_tien NUMERIC NOT NULL DEFAULT 0,
    ghi_chu TEXT,
    ngay_nhap TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. BẢNG CHI TIẾT PHIẾU NHẬP KHO
CREATE TABLE public.chitietnhapkho (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    id_phieu_nhap TEXT NOT NULL REFERENCES public.phieunhapkho(id) ON DELETE CASCADE,
    id_nguyen_lieu TEXT NOT NULL REFERENCES public.nguyenlieu(id),
    so_luong NUMERIC NOT NULL,
    don_gia_nhap NUMERIC NOT NULL,
    thanh_tien NUMERIC NOT NULL
);

-- 12. BẢNG CHI PHÍ VẬN HÀNH
CREATE TABLE public.chiphivanhang (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ten_chi_phi TEXT NOT NULL,
    loai_chi_phi TEXT DEFAULT 'bien_dong',
    so_tien NUMERIC NOT NULL,
    ngay_chi DATE NOT NULL DEFAULT CURRENT_DATE,
    id_nhan_vien TEXT REFERENCES public.nguoidung(id),
    ghi_chu TEXT
);

-- 13. BẢNG CHẤM CÔNG NHÂN VIÊN
CREATE TABLE public.chamcong (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('log_'),
    id_nhan_vien TEXT REFERENCES public.nguoidung(id) ON DELETE CASCADE NOT NULL,
    ca_lam TEXT NOT NULL DEFAULT 'Ca sáng (06:30 - 12:00)',
    gio_vao TIMESTAMP WITH TIME ZONE NOT NULL,
    gio_ra TIMESTAMP WITH TIME ZONE,
    thoi_gian_thuc_vao TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    thoi_gian_thuc_ra TIMESTAMP WITH TIME ZONE,
    vi_do NUMERIC NOT NULL,
    kinh_do NUMERIC NOT NULL,
    dia_chi TEXT,
    ghi_chu_vao TEXT,
    ghi_chu_ra TEXT,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Đang trong ca', 'Chờ duyệt', 'Đã duyệt', 'Từ chối')) DEFAULT 'Đang trong ca',
    sua_lai BOOLEAN DEFAULT FALSE
);

-- 14. BẢNG XIN NGHỈ PHÉP
CREATE TABLE public.nghiphep (
    id TEXT PRIMARY KEY DEFAULT public.generate_short_id('lv_'),
    id_nhan_vien TEXT REFERENCES public.nguoidung(id) ON DELETE CASCADE NOT NULL,
    ngay_bat_dau DATE NOT NULL,
    ngay_ket_thuc DATE NOT NULL,
    ly_do TEXT NOT NULL,
    ngay_nop TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    trang_thai TEXT NOT NULL CHECK (trang_thai IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối')) DEFAULT 'Chờ duyệt',
    CONSTRAINT check_dates CHECK (ngay_ket_thuc >= ngay_bat_dau)
);

-- BƯỚC 3: TRIGGER TỰ ĐỘNG CẬP NHẬT GIÁ VỐN
CREATE OR REPLACE FUNCTION public.cap_nhat_gia_von_nguyen_lieu()
RETURNS TRIGGER AS $$
DECLARE
    v_ton_hien_tai NUMERIC;
    v_gia_von_cu NUMERIC;
    v_tong_so_luong NUMERIC;
    v_gia_von_moi NUMERIC;
BEGIN
    SELECT COALESCE(so_luong_ton, 0), COALESCE(gia_von_trung_binh, don_gia_nhap, 0)
    INTO v_ton_hien_tai, v_gia_von_cu
    FROM public.nguyenlieu
    WHERE id = NEW.id_nguyen_lieu;

    v_tong_so_luong := v_ton_hien_tai + NEW.so_luong;

    IF v_tong_so_luong > 0 THEN
        v_gia_von_moi := ((v_ton_hien_tai * v_gia_von_cu) + (NEW.so_luong * NEW.don_gia_nhap)) / v_tong_so_luong;
    ELSE
        v_gia_von_moi := NEW.don_gia_nhap;
    END IF;

    UPDATE public.nguyenlieu
    SET gia_von_trung_binh = ROUND(v_gia_von_moi, 2),
        don_gia_nhap = NEW.don_gia_nhap
    WHERE id = NEW.id_nguyen_lieu;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cap_nhat_gia_von ON public.chitietnhapkho;
CREATE TRIGGER trigger_cap_nhat_gia_von
AFTER INSERT ON public.chitietnhapkho
FOR EACH ROW
EXECUTE FUNCTION public.cap_nhat_gia_von_nguyen_lieu();

-- BƯỚC 4: BẬT ROW LEVEL SECURITY (RLS) VÀ CẤP QUYỀN TRUY CẬP ĐẦY ĐỦ
ALTER TABLE public.nguoidung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.danhsachban ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.danhmuc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanpham ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoadon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoadondetail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamcong ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nghiphep ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nguyenlieu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.congthuc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lichsukho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phieunhapkho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chitietnhapkho ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chiphivanhang ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all nguoidung" ON public.nguoidung FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all danhsachban" ON public.danhsachban FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all danhmuc" ON public.danhmuc FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all sanpham" ON public.sanpham FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all hoadon" ON public.hoadon FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all hoadondetail" ON public.hoadondetail FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all chamcong" ON public.chamcong FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nghiphep" ON public.nghiphep FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all nguyenlieu" ON public.nguyenlieu FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all congthuc" ON public.congthuc FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all lichsukho" ON public.lichsukho FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all phieunhapkho" ON public.phieunhapkho FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all chitietnhapkho" ON public.chitietnhapkho FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all chiphivanhang" ON public.chiphivanhang FOR ALL USING (true) WITH CHECK (true);

-- BƯỚC 5: KÍCH HOẠT SUPABASE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.danhsachban;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hoadon;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hoadondetail;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nguyenlieu;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lichsukho;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chamcong;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chiphivanhang;

-- BƯỚC 6: THIẾT LẬP TOÀN BỘ CHỈ MỤC INDEX TỐI ƯU SIÊU TỐC
CREATE INDEX IF NOT EXISTS idx_hoadon_trang_thai_ngay ON public.hoadon (trang_thai_thanh_toan, ngay_tao DESC);
CREATE INDEX IF NOT EXISTS idx_hoadon_ban_chua_tt ON public.hoadon (id_ban, trang_thai_thanh_toan);
CREATE INDEX IF NOT EXISTS idx_hoadon_ngay_thanh_toan ON public.hoadon (ngay_thanh_toan DESC);
CREATE INDEX IF NOT EXISTS idx_hoadon_nhan_vien ON public.hoadon (id_nhan_vien, ngay_tao DESC);

CREATE INDEX IF NOT EXISTS idx_hoadondetail_idhoadon ON public.hoadondetail (idhoadon);
CREATE INDEX IF NOT EXISTS idx_hoadondetail_idsp ON public.hoadondetail (idsp);

CREATE INDEX IF NOT EXISTS idx_lichsukho_thoi_gian ON public.lichsukho (thoi_gian_tao DESC);
CREATE INDEX IF NOT EXISTS idx_lichsukho_loai_thoi_gian ON public.lichsukho (loai_giao_dich, thoi_gian_tao DESC);
CREATE INDEX IF NOT EXISTS idx_lichsukho_nguyenlieu ON public.lichsukho (id_nguyen_lieu);
CREATE INDEX IF NOT EXISTS idx_lichsukho_trang_thai ON public.lichsukho (trang_thai);

CREATE INDEX IF NOT EXISTS idx_chamcong_gio_vao ON public.chamcong (gio_vao DESC);
CREATE INDEX IF NOT EXISTS idx_chamcong_user_gio_vao ON public.chamcong (id_nhan_vien, gio_vao DESC);
CREATE INDEX IF NOT EXISTS idx_chamcong_trang_thai ON public.chamcong (trang_thai);
CREATE INDEX IF NOT EXISTS idx_nghiphep_trang_thai ON public.nghiphep (trang_thai);
CREATE INDEX IF NOT EXISTS idx_nghiphep_nhan_vien ON public.nghiphep (id_nhan_vien, ngay_nop DESC);

CREATE INDEX IF NOT EXISTS idx_congthuc_sanpham ON public.congthuc (id_san_pham);
CREATE INDEX IF NOT EXISTS idx_congthuc_nguyenlieu ON public.congthuc (id_nguyen_lieu);
CREATE INDEX IF NOT EXISTS idx_sanpham_danhmuc ON public.sanpham (id_danh_muc);

-- 15. BẢNG CẤU HÌNH HỆ THỐNG & MÁY IN
CREATE TABLE IF NOT EXISTS public.cauhinh (
    id TEXT PRIMARY KEY,
    khoa TEXT UNIQUE NOT NULL,
    gia_tri TEXT NOT NULL,
    ngay_cap_nhat TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.cauhinh ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all cauhinh" ON public.cauhinh FOR ALL USING (true) WITH CHECK (true);
