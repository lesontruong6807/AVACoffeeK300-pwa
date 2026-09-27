-- ==============================================================================
-- SQL MIGRATION: CẬP NHẬT MENU, 2 BẢNG GIÁ (MANG VỀ / NGỒI LẠI),
-- NGUYÊN LIỆU MỚI & CÔNG THỨC PHA CHẾ CHO AVA COFFEE K300
-- ==============================================================================

-- 1. THÊM 2 CỘT GIÁ MANG VỀ VÀ GIÁ NGỒI LẠI VÀO BẢNG SẢN PHẨM (NẾU CHƯA CÓ)
ALTER TABLE public.sanpham ADD COLUMN IF NOT EXISTS gia_mang_ve NUMERIC DEFAULT NULL;
ALTER TABLE public.sanpham ADD COLUMN IF NOT EXISTS gia_ngoi_lai NUMERIC DEFAULT NULL;

-- 2. THÊM DANH MỤC "NƯỚC ÉP" VÀ DỌN DẸP DANH MỤC CŨ
INSERT INTO public.danhmuc (id, ten_danh_muc) VALUES ('c_nuocep', 'Nước ép') ON CONFLICT (id) DO NOTHING;

-- Xóa nhóm Sữa lắc theo yêu cầu
DELETE FROM public.congthuc WHERE id_san_pham IN ('SL001', 'SL002', 'SL003', 'SL004', 'SL005');
DELETE FROM public.sanpham WHERE id IN ('SL001', 'SL002', 'SL003', 'SL004', 'SL005');
DELETE FROM public.danhmuc WHERE id = 'c_sualac';

-- Xóa các món cũ không còn bán: Trà vải, Trà chanh dây, Soda vải, Nước ngọt lon/chai bỏ bớt
DELETE FROM public.congthuc WHERE id_san_pham IN ('T004', 'T005', 'S004', 'N001', 'N003', 'N004', 'N006', 'N007', 'N008');
DELETE FROM public.sanpham WHERE id IN ('T004', 'T005', 'S004', 'N001', 'N003', 'N004', 'N006', 'N007', 'N008');

-- 3. BỔ SUNG CÁC NGUYÊN LIỆU MỚI VÀO KHO (TỒN KHO = 0, GIÁ VỐN = 0)
INSERT INTO public.nguyenlieu (id, ten_nguyen_lieu, don_vi_tinh, so_luong_ton, muc_canh_bao, quy_cach, don_gia_nhap, gia_von_trung_binh) VALUES 
('ing_tralai', 'Trà lài', 'g', 0, 500, 'Bịch 1kg', 0, 0),
('ing_lipton', 'Trà túi lọc Lipton', 'gói', 0, 10, 'Hộp 100 gói', 0, 0),
('ing_khoaimon', 'Bột khoai môn', 'g', 0, 200, 'Gói 500g', 0, 0),
('ing_sirochanhday', 'Siro chanh dây', 'ml', 0, 200, 'Chai 730ml', 0, 0),
('ing_mutnhietdoi', 'Mứt nhiệt đới', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_mutxoai', 'Mứt xoài', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_sirooihong', 'Siro ổi hồng', 'ml', 0, 200, 'Chai 730ml', 0, 0),
('ing_mutoihong', 'Mứt ổi hồng', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_sirodualuoi', 'Siro dưa lưới', 'ml', 0, 200, 'Chai 730ml', 0, 0),
('ing_mutdualuoi', 'Mứt dưa lưới', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_siromangcau', 'Siro mãng cầu', 'ml', 0, 200, 'Chai 730ml', 0, 0),
('ing_mutmangcau', 'Mứt mãng cầu', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_mutnhan', 'Mứt nhãn', 'g', 0, 200, 'Hũ 1kg', 0, 0),
('ing_hatdac', 'Hạt đác', 'g', 0, 100, 'Hũ 1kg', 0, 0)
ON CONFLICT (id) DO UPDATE SET 
  ten_nguyen_lieu = EXCLUDED.ten_nguyen_lieu,
  don_vi_tinh = EXCLUDED.don_vi_tinh,
  quy_cach = EXCLUDED.quy_cach,
  muc_canh_bao = EXCLUDED.muc_canh_bao;

-- 4. CẬP NHẬT BẢNG SẢN PHẨM (MENU VỚI 2 GIÁ: MANG VỀ / NGỒI LẠI)

-- NHÓM CÀ PHÊ
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('CP001', 'c_caphe', 'Cà phê đá', 'Ly', 18000, 18000, 25000, 6432, '/products/CP001.png', 'Cà phê nguyên chất đậm đà', 'Còn hàng'),
('CP002', 'c_caphe', 'Cà phê sữa', 'Ly', 20000, 20000, 28000, 7421, '/products/CP002.png', 'Cà phê sữa ngọt dịu thơm béo', 'Còn hàng'),
('CP003', 'c_caphe', 'Cà phê sữa tươi', 'Ly', 25000, 25000, 33000, 9715, '/products/CP003.png', 'Cà phê kết hợp sữa tươi thanh béo', 'Còn hàng'),
('CP004', 'c_caphe', 'Cà phê muối', 'Ly', 25000, 25000, 33000, 9691, '/products/CP004.png', 'Cà phê lớp kem muối sánh mịn', 'Còn hàng'),
('CP005', 'c_caphe', 'Bạc xỉu', 'Ly', 25000, 25000, 33000, 9148, '/products/CP005.png', 'Nhiều sữa ít cà phê béo ngọt', 'Còn hàng'),
('CP006', 'c_caphe', 'Bạc xỉu kem muối', 'Ly', 30000, 30000, 38000, 11418, '/products/CP006.png', 'Bạc xỉu kem muối béo ngậy đậm đà', 'Còn hàng'),
('CP007', 'c_caphe', 'Americano', 'Ly', 20000, 20000, 28000, 5000, '/products/CP007.png', 'Cà phê Espresso pha loãng thanh nhẹ', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM THỨC UỐNG KHÁC
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('TUK001', 'c_douongkhac', 'Cacao sữa', 'Ly', 25000, 25000, 33000, 7048, '/products/TUK001.png', 'Cacao đậm đà béo ngọt', 'Còn hàng'),
('TUK002', 'c_douongkhac', 'Cacao kem muối', 'Ly', 30000, 30000, 38000, 9317, '/products/TUK002.png', 'Cacao kem muối thơm béo', 'Còn hàng'),
('TUK003', 'c_douongkhac', 'Matcha Latte', 'Ly', 30000, 30000, 38000, 7198, '/products/TUK003.png', 'Trà xanh Matcha sữa tươi thơm ngon', 'Còn hàng'),
('TUK004', 'c_douongkhac', 'Matcha Latte kem muối', 'Ly', 35000, 35000, 43000, 8646, '/products/TUK004.png', 'Matcha Latte kết hợp kem muối', 'Còn hàng'),
('TUK007', 'c_douongkhac', 'Khoai môn Latte', 'Ly', 30000, 30000, 38000, 7500, '/products/TUK007.png', 'Khoai môn thơm bùi kết hợp sữa tươi', 'Còn hàng'),
('TUK008', 'c_douongkhac', 'Khoai môn Latte kem muối', 'Ly', 35000, 35000, 43000, 9500, '/products/TUK008.png', 'Khoai môn sữa tươi phủ kem muối', 'Còn hàng'),
('TUK005', 'c_douongkhac', 'Chanh đá', 'Ly', 18000, 18000, 25000, 1618, '/products/TUK005.png', 'Nước chanh đá tươi mát', 'Còn hàng'),
('TUK006', 'c_douongkhac', 'Chanh nóng', 'Ly', 18000, 18000, 25000, 2237, '/products/TUK006.png', 'Nước chanh nóng ấm bụng', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM TRÀ
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('T001', 'c_tra', 'Trà tắc', 'Ly', 18000, 18000, 25000, 1618, '/products/T001.png', 'Trà tắc truyền thống sảng khoái', 'Còn hàng'),
('T006', 'c_tra', 'Trà Lipton', 'Ly', 18000, 18000, 25000, 2500, '/products/T006.png', 'Trà Lipton túi lọc thanh nhẹ', 'Còn hàng'),
('T002', 'c_tra', 'Trà dâu', 'Ly', 30000, 30000, 38000, 5607, '/products/T002.png', 'Trà lài dâu tây chua ngọt', 'Còn hàng'),
('T003', 'c_tra', 'Trà đào', 'Ly', 30000, 30000, 38000, 5745, '/products/T003.png', 'Trà lài đào thơm lừng', 'Còn hàng'),
('T007', 'c_tra', 'Trà nhiệt đới', 'Ly', 30000, 30000, 38000, 6000, '/products/T007.png', 'Trà lài chanh dây mứt nhiệt đới', 'Còn hàng'),
('T008', 'c_tra', 'Trà xoài chanh dây', 'Ly', 30000, 30000, 38000, 6000, '/products/T008.png', 'Trà lài xoài chín hòa quyện chanh dây', 'Còn hàng'),
('T009', 'c_tra', 'Trà ổi hồng', 'Ly', 30000, 30000, 38000, 6000, '/products/T009.png', 'Trà lài ổi hồng thanh tao', 'Còn hàng'),
('T010', 'c_tra', 'Trà dưa lưới', 'Ly', 30000, 30000, 38000, 6000, '/products/T010.png', 'Trà lài dưa lưới mát lạnh ngọt dịu', 'Còn hàng'),
('T011', 'c_tra', 'Trà mãng cầu', 'Ly', 30000, 30000, 38000, 6000, '/products/T011.png', 'Trà lài mãng cầu xiêm chua ngọt', 'Còn hàng'),
('T012', 'c_tra', 'Trà nhãn', 'Ly', 30000, 30000, 38000, 6000, '/products/T012.png', 'Trà lài nhãn nhục ngọt thanh', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM YAOURT
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('Y001', 'c_yaourt', 'Yaourt đá', 'Ly', 25000, 25000, 33000, 7826, '/products/Y001.png', 'Sữa chua dẻo thơm mát', 'Còn hàng'),
('Y002', 'c_yaourt', 'Yaourt dâu', 'Ly', 30000, 30000, 38000, 10176, '/products/Y002.png', 'Sữa chua dẻo kết hợp mứt dâu', 'Còn hàng'),
('Y003', 'c_yaourt', 'Yaourt việt quất', 'Ly', 30000, 30000, 38000, 11131, '/products/Y003.png', 'Sữa chua dẻo kết hợp việt quất', 'Còn hàng'),
('Y004', 'c_yaourt', 'Yaourt đào', 'Ly', 30000, 30000, 38000, 10294, '/products/Y004.png', 'Sữa chua dẻo kết hợp mứt đào', 'Còn hàng'),
('Y005', 'c_yaourt', 'Yaourt chanh dây', 'Ly', 30000, 30000, 38000, 11148, '/products/Y005.png', 'Sữa chua dẻo kết hợp chanh dây', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM SODA
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('S001', 'c_soda', 'Soda dâu', 'Ly', 30000, 30000, 38000, 7996, '/products/S001.png', 'Soda 7-Up siro dâu sảng khoái', 'Còn hàng'),
('S002', 'c_soda', 'Soda đào', 'Ly', 30000, 30000, 38000, 8097, '/products/S002.png', 'Soda 7-Up siro đào thơm ngát', 'Còn hàng'),
('S003', 'c_soda', 'Soda việt quất', 'Ly', 30000, 30000, 38000, 8084, '/products/S003.png', 'Soda 7-Up việt quất đậm vị', 'Còn hàng'),
('S005', 'c_soda', 'Soda chanh dây', 'Ly', 30000, 30000, 38000, 7272, '/products/S005.png', 'Soda 7-Up chanh dây tươi mát', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM NƯỚC ÉP TƯƠI
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('NE001', 'c_nuocep', 'Nước ép ổi', 'Ly', 30000, 30000, 38000, 8000, '/products/NE001.png', 'Ổi hồng tươi ép nguyên chất', 'Còn hàng'),
('NE002', 'c_nuocep', 'Nước ép táo', 'Ly', 30000, 30000, 38000, 8000, '/products/NE002.png', 'Táo tươi ép giòn ngọt thanh', 'Còn hàng'),
('NE003', 'c_nuocep', 'Nước ép cam', 'Ly', 30000, 30000, 38000, 8000, '/products/NE003.png', 'Cam sành tươi ép giàu vitamin C', 'Còn hàng'),
('NE004', 'c_nuocep', 'Nước ép dưa hấu', 'Ly', 30000, 30000, 38000, 8000, '/products/NE004.png', 'Dưa hấu tươi mát giải nhiệt', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM NƯỚC ĐÓNG CHAI (CHỈ GIỮ BÒ HÚC VÀ NƯỚC SUỐI)
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('N002', 'c_nuocngot', 'Bò Húc', 'lon', 22000, 22000, 30000, 12295, '/products/N002.jpg', 'Tăng lực RedBull lon', 'Còn hàng'),
('N005', 'c_nuocngot', 'Nước suối', 'chai', 12000, 12000, 20000, 4200, '/products/N005.jpg', 'Nước tinh khiết chai', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- NHÓM TOPPING
INSERT INTO public.sanpham (id, id_danh_muc, ten_san_pham, don_vi_tinh, don_gia, gia_mang_ve, gia_ngoi_lai, gia_von, hinh_anh, mo_ta, trang_thai) VALUES
('TP001', 'c_topping', 'Kem muối', 'Phần', 8000, 8000, 8000, 2270, '/products/TP001.png', 'Topping kem muối béo mặn sánh mịn (+60ml)', 'Còn hàng'),
('TP002', 'c_topping', 'Trân châu trắng', 'Phần', 8000, 8000, 8000, 0, '/products/TP002.png', 'Topping trân châu trắng giòn dai (không trừ kho)', 'Còn hàng'),
('TP003', 'c_topping', 'Hạt đác', 'Phần', 8000, 8000, 8000, 0, '/products/TP003.png', 'Topping hạt đác thơm dẻo (không trừ kho)', 'Còn hàng')
ON CONFLICT (id) DO UPDATE SET 
  ten_san_pham = EXCLUDED.ten_san_pham,
  don_gia = EXCLUDED.don_gia,
  gia_mang_ve = EXCLUDED.gia_mang_ve,
  gia_ngoi_lai = EXCLUDED.gia_ngoi_lai;

-- 5. CẬP NHẬT CÔNG THỨC PHA CHẾ CHO CÁC MÓN MỚI VÀ MÓN THAY ĐỔI
-- Xóa công thức cũ của các món thay đổi để nạp lại chuẩn
DELETE FROM public.congthuc WHERE id_san_pham IN ('CP007', 'TUK007', 'TUK008', 'T006', 'T007', 'T008', 'T009', 'T010', 'T011', 'T012', 'NE001', 'NE002', 'NE003', 'NE004');

INSERT INTO public.congthuc (id, id_san_pham, id_nguyen_lieu, so_luong_can, don_vi_tinh) VALUES
-- Americano (CP007)
('rec_cp7_1', 'CP007', 'ing_caphe', 20, 'g'),
('rec_cp7_2', 'CP007', 'ing_lytrang', 1, 'cái'),

-- Khoai môn Latte (TUK007)
('rec_tuk7_1', 'TUK007', 'ing_khoaimon', 10, 'g'),
('rec_tuk7_2', 'TUK007', 'ing_suadac', 30, 'g'),
('rec_tuk7_3', 'TUK007', 'ing_suatuoi', 80, 'ml'),
('rec_tuk7_4', 'TUK007', 'ing_lytrang', 1, 'cái'),

-- Khoai môn Latte kem muối (TUK008)
('rec_tuk8_1', 'TUK008', 'ing_khoaimon', 10, 'g'),
('rec_tuk8_2', 'TUK008', 'ing_suadac', 31.73, 'g'),
('rec_tuk8_3', 'TUK008', 'ing_suatuoi', 52, 'ml'),
('rec_tuk8_4', 'TUK008', 'ing_kembeo', 30.27, 'g'),
('rec_tuk8_5', 'TUK008', 'ing_muoibien', 0.67, 'g'),
('rec_tuk8_6', 'TUK008', 'ing_lytrang', 1, 'cái'),

-- Trà Lipton (T006)
('rec_t6_1', 'T006', 'ing_lipton', 1, 'gói'),
('rec_t6_2', 'T006', 'ing_duong', 41.67, 'g'),
('rec_t6_3', 'T006', 'ing_lytrang', 1, 'cái'),

-- Trà nhiệt đới (T007)
('rec_t7_1', 'T007', 'ing_tralai', 2.77, 'g'),
('rec_t7_2', 'T007', 'ing_sirochanhday', 20, 'ml'),
('rec_t7_3', 'T007', 'ing_mutnhietdoi', 50, 'g'),
('rec_t7_4', 'T007', 'ing_duong', 16.67, 'g'),
('rec_t7_5', 'T007', 'ing_lyhoavan', 1, 'cái'),

-- Trà xoài chanh dây (T008)
('rec_t8_1', 'T008', 'ing_tralai', 2.77, 'g'),
('rec_t8_2', 'T008', 'ing_sirochanhday', 20, 'ml'),
('rec_t8_3', 'T008', 'ing_mutxoai', 50, 'g'),
('rec_t8_4', 'T008', 'ing_duong', 16.67, 'g'),
('rec_t8_5', 'T008', 'ing_lyhoavan', 1, 'cái'),

-- Trà ổi hồng (T009)
('rec_t9_1', 'T009', 'ing_tralai', 2.77, 'g'),
('rec_t9_2', 'T009', 'ing_sirooihong', 20, 'ml'),
('rec_t9_3', 'T009', 'ing_mutoihong', 50, 'g'),
('rec_t9_4', 'T009', 'ing_duong', 16.67, 'g'),
('rec_t9_5', 'T009', 'ing_lyhoavan', 1, 'cái'),

-- Trà dưa lưới (T010)
('rec_t10_1', 'T010', 'ing_tralai', 2.77, 'g'),
('rec_t10_2', 'T010', 'ing_sirodualuoi', 20, 'ml'),
('rec_t10_3', 'T010', 'ing_mutdualuoi', 50, 'g'),
('rec_t10_4', 'T010', 'ing_duong', 16.67, 'g'),
('rec_t10_5', 'T010', 'ing_lyhoavan', 1, 'cái'),

-- Trà mãng cầu (T011)
('rec_t11_1', 'T011', 'ing_tralai', 2.77, 'g'),
('rec_t11_2', 'T011', 'ing_siromangcau', 20, 'ml'),
('rec_t11_3', 'T011', 'ing_mutmangcau', 40, 'g'),
('rec_t11_4', 'T011', 'ing_duong', 16.67, 'g'),
('rec_t11_5', 'T011', 'ing_lyhoavan', 1, 'cái'),

-- Trà nhãn (T012)
('rec_t12_1', 'T012', 'ing_tralai', 2.77, 'g'),
('rec_t12_2', 'T012', 'ing_mutnhan', 40, 'g'),
('rec_t12_3', 'T012', 'ing_duong', 16.67, 'g'),
('rec_t12_4', 'T012', 'ing_lyhoavan', 1, 'cái'),

-- Nước ép ổi (NE001)
('rec_ne1_1', 'NE001', 'ing_duong', 25, 'g'),
('rec_ne1_2', 'NE001', 'ing_lyhoavan', 1, 'cái'),

-- Nước ép táo (NE002)
('rec_ne2_1', 'NE002', 'ing_duong', 25, 'g'),
('rec_ne2_2', 'NE002', 'ing_lyhoavan', 1, 'cái'),

-- Nước ép cam (NE003)
('rec_ne3_1', 'NE003', 'ing_duong', 25, 'g'),
('rec_ne3_2', 'NE003', 'ing_lyhoavan', 1, 'cái'),

-- Nước ép dưa hấu (NE004)
('rec_ne4_1', 'NE004', 'ing_duong', 25, 'g'),
('rec_ne4_2', 'NE004', 'ing_lyhoavan', 1, 'cái')
ON CONFLICT (id) DO NOTHING;
