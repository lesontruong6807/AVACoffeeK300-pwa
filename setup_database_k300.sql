-- ==============================================================================
-- DATABASE SCHEMA & MASTER SEED DATA CHO AVA COFFEE - CHI NHÁNH K300
-- Phiên bản: Chuẩn hóa 100% theo hệ thống AVA Coffee (Cập nhật 09/2026)
-- Bao gồm: Bạc xỉu kem muối, Topping Kem muối, Trân châu trắng, Sữa lắc, Trà tắc,...
-- ==============================================================================
-- HƯỚNG DẪN:
-- 1. Vào Supabase Dashboard của project K300 -> Chọn SQL Editor -> New Query.
-- 2. Dán toàn bộ nội dung file này vào và bấm 'Run'.
-- 3. File này sẽ tạo đầy đủ bảng, trigger giá vốn, RLS policies, Realtime, và
--    nạp sẵn Menu + Công thức + Nguyên liệu chuẩn của AVA Coffee.
-- 4. BẢO MẬT: KHÔNG mang theo bất kỳ dữ liệu chi tiết nào từ quán cũ (0 hóa đơn, 
--    0 lịch sử kho, 0 chấm công). Quán K300 bắt đầu hoàn toàn mới và sạch 100%!
-- ==============================================================================

-- BƯỚC 0: DỌN DẸP BẢNG CŨ (NẾU CÓ)
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

-- BƯỚC 1: HÀM TỰ ĐỘNG TẠO ID NGẮN (VD: ord_a2b3c4d5, rec_..., inv_...)
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

-- BƯỚC 2: TẠO CÁC BẢNG CỐT LÕI (SCHEMA DDL)

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

-- 3. BẢNG LOẠI SẢN PHẨM (DANH MỤC)
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

-- 6. BẢNG CÔNG THỨC PHA CHẾ & ĐỊNH MỨC TRỪ KHO
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

-- 9. BẢNG LỊCH SỬ KHO (NHẬT KÝ XUẤT / NHẬP / HAO HỤT)
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

-- 12. BẢNG CHI PHÍ VẬN HÀNH (Mặt bằng, điện, nước, linh tinh)
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
    ca_lam TEXT NOT NULL DEFAULT 'Ca sáng (05:30 - 12:00)',
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

-- BƯỚC 3: TRIGGER TỰ ĐỘNG TÍNH GIÁ VỐN BÌNH QUÂN NGUYÊN LIỆU KHI NHẬP HÀNG
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

-- BƯỚC 4: BẬT ROW LEVEL SECURITY (RLS) VÀ CHÍNH SÁCH TRUY CẬP
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

-- BƯỚC 5: BẬT SUPABASE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.danhsachban;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hoadon;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hoadondetail;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nguyenlieu;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lichsukho;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chamcong;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chiphivanhang;

-- ==============================================================================
-- BƯỚC 6: NẠP DỮ LIỆU NỀN TẢNG MẪU (MASTER DATA) - FRESH CHO K300
-- ==============================================================================

-- 1. TÀI KHOẢN NGƯỜI DÙNG (Admin mặc định)
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('admin', 'admin', '123456', 'admin@avacoffee.com', 'Trương Lê Sơn', 'Admin', '2026-07-30T14:42:21.179681+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('nv001', 'admin2', '123456', 'nhanvien1@avacoffee.com', 'Lê Thị Quỳnh Châu', 'Admin', '2026-07-30T14:42:21.179681+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('nv002', 'admin3', '123456', 'nhanvien2@avacoffee.com', 'Trương Hoàng Minh Hải', 'Admin', '2026-07-30T14:42:21.179681+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('u_1786145575045', 'nv001', '123456', 'long@gmail.com', 'Lê Phước Long', 'User', '2026-08-07T23:32:55.046+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('u_1786158337441', 'nv002', '123456', 'tien@gmail.com', 'Nguyễn Minh Tiến', 'User', '2026-08-08T03:05:37.443+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('u_1786317471359', 'maybanhang', '123456', 'banhang@gmail.com', 'Máy bán hàng', 'User', '2026-08-09T23:17:51.36+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('u_1786661651607', 'nv005', '123456', 'kien@gmail.com', 'Nguyễn Trung Kiên', 'User', '2026-08-13T22:54:11.607+00:00') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguoidung (id, username, password, email, ho_ten, vai_tro, ngay_tao) VALUES ('u_1786767308125', 'nv006', '123456', 'thuc@gmail.com', 'Dương Thiện Thức', 'User', '2026-08-15T04:15:08.126+00:00') ON CONFLICT (id) DO NOTHING;

-- 2. DANH SÁCH BÀN (Trạng thái Trống ban đầu)
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb_mangve', 'Khách mang về', 99, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb1', 'Bàn 1', 4, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb2', 'Bàn 2', 4, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb3', 'Bàn 3', 2, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb4', 'Bàn 4', 2, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb5', 'Bàn 5', 6, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb6', 'Bàn 6', 6, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb7', 'Bàn 7', 4, 'Trống') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhsachban (id, ten_ban, suc_chua, trang_thai) VALUES ('tb8', 'Bàn 8', 4, 'Trống') ON CONFLICT (id) DO NOTHING;

-- 3. DANH MỤC SẢN PHẨM
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_caphe', 'Cà phê') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_douongkhac', 'Thức uống khác') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_nuocngot', 'Nước ngọt/suối') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_soda', 'Soda') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_sualac', 'Sữa lắc') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_topping', 'Topping') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_tra', 'Trà') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_yaourt', 'Yaourt') ON CONFLICT (id) DO NOTHING;

-- 4. NGUYÊN LIỆU KHO (Tồn kho khởi tạo = 0 cho quán K300)
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_7up', '7-Up', 'ml', 0, 2, '390ml', 13.88888888888889, 14.023122033397607) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_cacao', 'Cacao AVA', 'g', 0, 200, '1kg', 340, 340) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_caphe', 'Cà phê hạt AVA', 'g', 0, 1000, '1kg', 247.61904761904762, 247.61904761904762) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_duong', 'Đường', 'g', 0, 1000, '1kg', 23, 22.51836094995933) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_hongtra', 'Hồng trà', 'g', 0, 60, '30g', 100, 114.3738719938099) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_kembeo', 'Kem RICH''S', 'g', 0, 1, '454g', 68.28193832599119, 68.28193832599119) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_lyden', 'Ly đen AVA', 'cái', 0, 50, 'cái', 1300, 1292.3853157803167) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_lyhoavan', 'Ly trắng hoa văn AVA', 'cái', 0, 50, 'cái', 1500, 1500) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_lytrang', 'Ly trắng AVA', 'cái', 0, 50, 'cái', 1400, 1398.0662983425414) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_lytratac', 'Ly trà tắc', 'cái', 0, 2, 'cái', 680, 680) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_matcha', 'Bột Matcha', 'g', 0, 50, '200g', 725, 725) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_muoibien', 'Topping Muối biển', 'g', 0, NULL, '500g', 150, 150) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_muong', 'Muỗng', 'bịch', 0, NULL, 'bịch', 333.3333333333333, 333.3333333333333) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_mutchanhday', 'Mứt chanh dây', 'ml', 0, 200, '1000ml', 95, 95) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_mutdao', 'Mứt đào', 'ml', 0, 200, '1000ml', 94, 94.1651376146789) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_mutdau', 'Mứt dâu', 'ml', 0, 200, '1000ml', 90, 90.24854856960896) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_mutvietquat', 'Mứt việt quất', 'ml', 0, 200, '1000ml', 122, 122.05575842389521) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n001', '7-Up (lon)', 'lon', 0, 2, 'lon', 7100, 7100) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n002', 'Bò Húc (lon)', 'lon', 0, 2, 'lon', 12500, 12294.917967186875) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n003', 'Coca (lon)', 'lon', 0, 2, 'lon', 7416.666666666667, 7416.666666666667) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n004', 'Number 1 (chai)', 'chai', 0, 2, 'chai', 6750, 6750) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n005', 'Nước suối (chai)', 'chai', 0, 2, 'chai', 4166.666666666667, 4199.73544973545) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n006', 'Pepsi (lon)', 'lon', 0, 2, 'lon', 7100, 7100) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n007', 'Revive (chai)', 'chai', 0, 2, 'chai', 7083.333333333333, 7083.333333333333) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_n008', 'Sting (lon)', 'lon', 0, 2, 'lon', 7500, 7585) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_sirodao', 'Siro đào', 'ml', 0, 200, '730ml', 89.04109589041096, 91.09607443197126) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_sirodau', 'Siro dâu', 'ml', 0, 200, '730ml', 89.04109589041096, 89.04109589041096) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_sirovai', 'Siro vải', 'ml', 0, 200, '730ml', 89.04109589041096, 91.84889130434783) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_suachua', 'Sữa chua', 'hộp', 0, 4, 'hộp', 5000, 5000.012525293424) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_suadac', 'Sữa đặc', 'g', 0, 1284, '1284g', 35.6957424714434, 35.6957424714434) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_suatuoi', 'Sữa tươi', 'ml', 0, 2000, '1000ml', 27.333333333333332, 27.393165749348576) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES ('ing_tuimangdi', 'Túi mang đi', 'kg', 0, NULL, '1kg', 0, 0) ON CONFLICT (id) DO NOTHING;

-- 5. MENU SẢN PHẨM
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP001', 'c_caphe', 'Cà phê đá', 'Ly', 15000, 6432, '/products/CP001.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP002', 'c_caphe', 'Cà phê sữa', 'Ly', 17000, 7421.319524866796, '/products/CP002.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP003', 'c_caphe', 'Cà phê sữa tươi', 'Ly', 22000, 9714.706486472141, '/products/CP003.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP004', 'c_caphe', 'Cà phê muối', 'Ly', 22000, 9690.975466980266, '/products/CP004.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP005', 'c_caphe', 'Bạc xìu', 'Ly', 22000, 9147.93523704866, '/products/CP005.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('CP006', 'c_caphe', 'Bạc xỉu kem muối', 'Ly', 27000, 11418, '/products/CP006.png', 'Bạc xỉu thơm béo kết hợp lớp kem muối đậm đà chuẩn vị AVA', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N001', 'c_nuocngot', '7-Up', 'lon', 15000, 7100, '/products/N001.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N002', 'c_nuocngot', 'Bò Húc', 'lon', 20000, 12294.917967186875, '/products/N002.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N003', 'c_nuocngot', 'Coca', 'lon', 15000, 7416.666666666667, '/products/N003.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N004', 'c_nuocngot', 'Number 1', 'chai', 15000, 6750, '/products/N004.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N005', 'c_nuocngot', 'Nước suối', 'chai', 10000, 4199.73544973545, '/products/N005.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N006', 'c_nuocngot', 'Pepsi', 'lon', 15000, 7100, '/products/N006.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N007', 'c_nuocngot', 'Revive', 'chai', 15000, 7083.333333333333, '/products/N007.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('N008', 'c_nuocngot', 'Sting', 'lon', 15000, 7585, '/products/N008.jpg', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('S001', 'c_soda', 'Soda dâu', 'Ly', 25000, 7995.805105634113, '/products/S001.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('S002', 'c_soda', 'Soda đào', 'Ly', 25000, 8096.620352331622, '/products/S002.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('S003', 'c_soda', 'Soda việt quất', 'Ly', 25000, 8083.759495942551, '/products/S003.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('S004', 'c_soda', 'Soda vải', 'Ly', 25000, 8096.042395399608, '/products/S004.png', 'Soda 7-Up kết hợp siro vải ngọt thanh, sảng khoái', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('S005', 'c_soda', 'Soda chanh dây', 'Ly', 25000, 7272.086743225695, '/products/S005.png', 'Soda 7-Up sảng khoái với mứt chanh dây tươi mát', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('SL001', 'c_sualac', 'Sữa lắc', 'Ly', 20000, 3755.571092732324, '/products/SL001.png', 'Sữa tươi lắc sữa đặc thơm béo thanh mát', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('SL002', 'c_sualac', 'Sữa lắc dâu', 'Ly', 25000, 6463.027549820593, '/products/SL002.png', 'Sữa lắc hòa quyện mứt dâu thơm ngon', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('SL003', 'c_sualac', 'Sữa lắc việt quất', 'Ly', 25000, 7417.24384544918, '/products/SL003.png', 'Sữa lắc kết hợp mứt việt quất đậm vị', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('SL004', 'c_sualac', 'Sữa lắc đào', 'Ly', 25000, 6580.525221172691, '/products/SL004.png', 'Sữa lắc hòa quyện mứt đào giòn ngọt', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('SL005', 'c_sualac', 'Sữa lắc chanh dây', 'Ly', 25000, 6605.571092732324, '/products/SL005.png', 'Sữa lắc hòa quyện mứt chanh dây chua ngọt béo ngậy', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('T001', 'c_tra', 'Trà tắc', 'Ly', 15000, 1618.3401007848051, '/products/T001.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('T002', 'c_tra', 'Trà dâu', 'Ly', 25000, 5607.12187768813, '/products/T002.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('T003', 'c_tra', 'Trà đào', 'Ly', 25000, 5745.169334455831, '/products/T003.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('T004', 'c_tra', 'Trà vải', 'Ly', 25000, 4858.622765987517, '/products/T004.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('T005', 'c_tra', 'Trà chanh dây', 'Ly', 25000, 5809.254461695751, '/products/T005.png', 'Hồng trà kết hợp mứt chanh dây chua ngọt tươi mát kèm trân châu tươi', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TP001', 'c_topping', 'Kem muối', 'Phần', 5000, 2270, '/products/TP001.png', 'Topping kem muối béo mặn sánh mịn (+60ml)', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TP002', 'c_topping', 'Trân châu trắng', 'Phần', 5000, 0, '/products/TP002.png', 'Topping trân châu trắng giòn dai ngọt thanh (không trừ kho)', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK001', 'c_douongkhac', 'Cacao sữa', 'Ly', 20000, 7047.690969680735, '/products/TUK001.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK002', 'c_douongkhac', 'Cacao kem muối', 'Ly', 25000, 9317.346911794204, '/products/TUK002.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK003', 'c_douongkhac', 'Matcha Latte', 'Ly', 25000, 7197.89183243373, '/products/TUK003.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK004', 'c_douongkhac', 'Matcha Latte kem muối', 'Ly', 30000, 8645.752802066743, '/products/TUK004.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK005', 'c_douongkhac', 'Chanh đá', 'Ly', 15000, 1618, '/products/TUK005.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('TUK006', 'c_douongkhac', 'Chanh nóng', 'Ly', 15000, 2237, '/products/TUK006.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('Y001', 'c_yaourt', 'Yaourt đá', 'Ly', 20000, 7825.908522493702, '/products/Y001.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('Y002', 'c_yaourt', 'Yaourt dâu', 'Ly', 25000, 10176.407554867536, '/products/Y002.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('Y003', 'c_yaourt', 'Yaourt việt quất', 'Ly', 25000, 11130.623850496124, '/products/Y003.png', NULL, 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('Y004', 'c_yaourt', 'Yaourt đào', 'Ly', 25000, 10293.905226219635, '/products/Y004.png', 'Sữa chua dẻo kết hợp mứt đào thơm ngọt', 'Còn hàng') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_von, hinh_anh, mo_ta, trang_thai) VALUES ('Y005', 'c_yaourt', 'Yaourt chanh dây', 'Ly', 25000, 11148.078823635966, '/products/Y005.png', 'Sữa chua dẻo kết hợp mứt chanh dây thơm lừng đậm vị', 'Còn hàng') ON CONFLICT (id) DO NOTHING;

-- 6. ĐỊNH MỨC CÔNG THỨC PHA CHẾ & TRỪ LY
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_2', 'CP001', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_3', 'CP001', 'ing_lyden', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_1', 'CP001', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_4', 'CP002', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_5', 'CP002', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_6', 'CP002', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_9', 'CP003', 'ing_suatuoi', 80, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_10', 'CP003', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_7', 'CP003', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_8', 'CP003', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cm48u5d4', 'CP004', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_mrmx8bhw', 'CP004', 'ing_muoibien', 0.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_yk2tplpm', 'CP004', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_5r7pui14', 'CP004', 'ing_suadac', 31.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_23559g8q', 'CP004', 'ing_suatuoi', 2, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sa9njdou', 'CP004', 'ing_kembeo', 30.27, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_18', 'CP005', 'ing_suatuoi', 50, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_17', 'CP005', 'ing_suadac', 40, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_19', 'CP005', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_16', 'CP005', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_muoibien', 'CP006', 'ing_muoibien', 0.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_lytrang', 'CP006', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_caphe', 'CP006', 'ing_caphe', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_suadac', 'CP006', 'ing_suadac', 41.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_suatuoi', 'CP006', 'ing_suatuoi', 52, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cp6_kembeo', 'CP006', 'ing_kembeo', 30.27, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_78', 'N001', 'ing_n001', 1, 'lon') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_79', 'N002', 'ing_n002', 1, 'lon') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_80', 'N003', 'ing_n003', 1, 'lon') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_81', 'N004', 'ing_n004', 1, 'chai') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_82', 'N005', 'ing_n005', 1, 'chai') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_83', 'N006', 'ing_n006', 1, 'lon') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_84', 'N007', 'ing_n007', 1, 'chai') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_85', 'N008', 'ing_n008', 1, 'lon') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s1_ly', 'S001', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s1_sirodau', 'S001', 'ing_sirodau', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s1_7up', 'S001', 'ing_7up', 195, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s1_mutdau', 'S001', 'ing_mutdau', 10, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s1_duong', 'S001', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s2_ly', 'S002', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s2_duong', 'S002', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s2_mutdao', 'S002', 'ing_mutdao', 10, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s2_sirodao', 'S002', 'ing_sirodao', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s2_7up', 'S002', 'ing_7up', 195, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s3_ly', 'S003', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s3_duong', 'S003', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s3_mutvietquat', 'S003', 'ing_mutvietquat', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s3_7up', 'S003', 'ing_7up', 195, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s4_2', 'S004', 'ing_sirovai', 40, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s4_1', 'S004', 'ing_7up', 195, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s4_3', 'S004', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s4_4', 'S004', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s5_mut', 'S005', 'ing_mutchanhday', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s5_ly', 'S005', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s5_duong', 'S005', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_s5_7up', 'S005', 'ing_7up', 195, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl1_3', 'SL001', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl1_1', 'SL001', 'ing_suatuoi', 60, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl1_2', 'SL001', 'ing_suadac', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl2_4', 'SL002', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl2_2', 'SL002', 'ing_suadac', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl2_3', 'SL002', 'ing_mutdau', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl2_1', 'SL002', 'ing_suatuoi', 60, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl3_2', 'SL003', 'ing_suadac', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl3_1', 'SL003', 'ing_suatuoi', 60, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl3_4', 'SL003', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl3_3', 'SL003', 'ing_mutvietquat', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl4_4', 'SL004', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl4_3', 'SL004', 'ing_mutdao', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl4_2', 'SL004', 'ing_suadac', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl4_1', 'SL004', 'ing_suatuoi', 60, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl5_suatuoi', 'SL005', 'ing_suatuoi', 60, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl5_ly', 'SL005', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl5_mut', 'SL005', 'ing_mutchanhday', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_sl5_suadac', 'SL005', 'ing_suadac', 20, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_rbv5ztos', 'T001', 'ing_duong', 41.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_40', 'T001', 'ing_lytratac', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t2_hongtra', 'T002', 'ing_hongtra', 2.8125, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t2_mutdau', 'T002', 'ing_mutdau', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t2_sirodau', 'T002', 'ing_sirodau', 10, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t2_ly', 'T002', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t2_duong', 'T002', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t3_mutdao', 'T003', 'ing_mutdao', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t3_duong', 'T003', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t3_ly', 'T003', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t3_hongtra', 'T003', 'ing_hongtra', 2.8125, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t3_sirodao', 'T003', 'ing_sirodao', 10, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t4_duong', 'T004', 'ing_duong', 12.5, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t4_hongtra', 'T004', 'ing_hongtra', 2.8125, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t4_sirovai', 'T004', 'ing_sirovai', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t4_ly', 'T004', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t5_mut', 'T005', 'ing_mutchanhday', 40, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t5_ly', 'T005', 'ing_lyhoavan', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t5_duong', 'T005', 'ing_duong', 8.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_t5_hongtra', 'T005', 'ing_hongtra', 2.8125, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tp1_muoibien', 'TP001', 'ing_muoibien', 0.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tp1_suatuoi', 'TP001', 'ing_suatuoi', 2, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tp1_suadac', 'TP001', 'ing_suadac', 1.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tp1_kembeo', 'TP001', 'ing_kembeo', 30.27, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_22', 'TUK001', 'ing_suatuoi', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_20', 'TUK001', 'ing_cacao', 10, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_23', 'TUK001', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_21', 'TUK001', 'ing_suadac', 40, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_cjjb2x9u', 'TUK002', 'ing_muoibien', 0.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_1ljdpvpx', 'TUK002', 'ing_kembeo', 30.27, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_9t9uymrw', 'TUK002', 'ing_suatuoi', 32, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_dm4zejko', 'TUK002', 'ing_suadac', 41.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_35nwj7qu', 'TUK002', 'ing_cacao', 10, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_z1e0ec3r', 'TUK002', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_30', 'TUK003', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_31', 'TUK003', 'ing_suatuoi', 80, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_29', 'TUK003', 'ing_matcha', 3.5, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_gt_32', 'TUK003', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_wudwva54', 'TUK004', 'ing_suatuoi', 52, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_46rtipok', 'TUK004', 'ing_suadac', 31.33, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_1bcht376', 'TUK004', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_07koac6q', 'TUK004', 'ing_kembeo', 30.27, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_g1j07qvs', 'TUK004', 'ing_muoibien', 0.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_k5qj33u7', 'TUK004', 'ing_matcha', 3.5, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tuk5_duong', 'TUK005', 'ing_duong', 41.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tuk5_ly', 'TUK005', 'ing_lytratac', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tuk6_duong', 'TUK006', 'ing_duong', 41.67, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_tuk6_ly', 'TUK006', 'ing_lyden', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y1_ly', 'Y001', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y1_suadac', 'Y001', 'ing_suadac', 40, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y1_suachua', 'Y001', 'ing_suachua', 1, 'hộp') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y2_mutdau', 'Y002', 'ing_mutdau', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y2_suadac', 'Y002', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y2_suachua', 'Y002', 'ing_suachua', 1, 'hộp') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y2_ly', 'Y002', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y3_suadac', 'Y003', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y3_mutvietquat', 'Y003', 'ing_mutvietquat', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y3_ly', 'Y003', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y3_suachua', 'Y003', 'ing_suachua', 1, 'hộp') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y4_3', 'Y004', 'ing_mutdao', 30, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y4_2', 'Y004', 'ing_suadac', 30, 'g') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y4_1', 'Y004', 'ing_suachua', 1, 'hộp') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y4_4', 'Y004', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y5_mut', 'Y005', 'ing_mutchanhday', 50, 'ml') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y5_suachua', 'Y005', 'ing_suachua', 1, 'hộp') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES ('rec_y5_ly', 'Y005', 'ing_lytrang', 1, 'cái') ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- HOÀN TẤT SETUP K300!
-- Các bảng giao dịch: hoadon, hoadondetail, lichsukho, phieunhapkho, chitietnhapkho,
-- chiphivanhang, chamcong, nghiphep được giữ TRỐNG HOÀN TOÀN 100%.
-- ==============================================================================
