// Chép TOÀN BỘ dữ liệu + ảnh món từ dự án Supabase CŨ sang dự án MỚI (chạy lại được nhiều lần).
//
// Dùng: node scripts/chuyen-du-an/dong_bo_du_lieu_sang_du_an_moi.js
//   - Dự án CŨ đọc từ file .env.du-an-cu.local, dự án MỚI đọc từ file .env.local
//   - Dự án mới phải chạy xong supabase/1_TAO_CAU_TRUC_DU_AN_MOI.sql trước
//
// Cách hoạt động:
//   1. Đọc từng bảng ở dự án cũ (chỉ đọc, không sửa gì dự án cũ)
//   2. Ảnh món nằm trong kho ảnh dự án cũ -> chép sang kho ảnh dự án mới, đổi đường dẫn
//   3. Ghi (upsert theo id) vào dự án mới; xóa ở dự án mới những dòng không còn ở dự án cũ
//   4. Đối chiếu số dòng, doanh thu, tồn kho giữa 2 dự án
// CHỐT AN TOÀN: nếu dự án mới đã có hóa đơn MỚI HƠN dự án cũ (tức là đã bán thật trên dự án mới)
// thì dừng ngay, không ghi / xóa gì, để không bao giờ mất đơn đã bán.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const { createClient } = require(path.join(root, 'node_modules', '@supabase', 'supabase-js'));

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

const OLD = readEnv('.env.du-an-cu.local');
const NEW = readEnv('.env.local');
if (!OLD.url || !NEW.url || OLD.url === NEW.url) {
  console.error('Cấu hình sai: cần .env.du-an-cu.local (dự án cũ) và .env.local (dự án mới) khác nhau.');
  process.exit(1);
}
const opts = { auth: { persistSession: false } };
const oldDb = createClient(OLD.url, OLD.key, opts);
const newDb = createClient(NEW.url, NEW.key, opts);

const BUCKET = 'product-images';
// Thứ tự bảng cha trước, bảng con sau
const TABLES = [
  'nguoidung', 'danhsachban', 'danhmuc', 'sanpham', 'nguyenlieu', 'congthuc',
  'hoadon', 'hoadondetail', 'lichsukho', 'phieunhapkho', 'chitietnhapkho',
  'chiphivanhang', 'chamcong', 'nghiphep'
];

async function fetchAll(db, table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Đọc ${table} lỗi: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function upsertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await newDb.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw new Error(`Ghi ${table} lỗi: ${error.message}`);
  }
}

async function deleteIds(table, ids) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await newDb.from(table).delete().in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`Xóa ${table} lỗi: ${error.message}`);
  }
}

// Chép ảnh món từ kho ảnh cũ sang kho ảnh mới, trả về đường dẫn mới
const oldStoragePrefix = `${OLD.url.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/`;
async function copyImage(product) {
  const objectPath = product.hinh_anh.slice(oldStoragePrefix.length).split('?')[0];
  const dest = `chuyen-du-an/${product.id}-${path.basename(objectPath)}`;
  const src = await fetch(product.hinh_anh);
  if (!src.ok) throw new Error(`Tải ảnh ${product.id} từ dự án cũ lỗi HTTP ${src.status}`);
  const bytes = Buffer.from(await src.arrayBuffer());
  const { error } = await newDb.storage.from(BUCKET).upload(dest, bytes, {
    contentType: src.headers.get('content-type') || 'image/webp',
    cacheControl: '31536000',
    upsert: true
  });
  if (error) throw new Error(`Tải ảnh ${product.id} lên dự án mới lỗi: ${error.message}`);
  return newDb.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
}

(async () => {
  console.log(`Dự án cũ: ${OLD.url}\nDự án mới: ${NEW.url}\n`);

  // 0. Chốt an toàn: dự án mới đã bán thật chưa?
  const [{ data: oldLatest }, { data: newLatest, error: newErr }] = await Promise.all([
    oldDb.from('hoadon').select('ngay_tao').order('ngay_tao', { ascending: false }).limit(1),
    newDb.from('hoadon').select('id, ngay_tao').order('ngay_tao', { ascending: false }).limit(1)
  ]);
  if (newErr) throw new Error(`Dự án mới chưa có bảng (hãy chạy file 1_TAO_CAU_TRUC_DU_AN_MOI.sql): ${newErr.message}`);
  if (newLatest?.length && oldLatest?.length && new Date(newLatest[0].ngay_tao) > new Date(oldLatest[0].ngay_tao)) {
    console.error(`DỪNG: dự án mới đã có hóa đơn ${newLatest[0].id} mới hơn dự án cũ -> đã bán thật trên dự án mới. Không ghi đè.`);
    process.exit(2);
  }

  // 1. Đọc toàn bộ dự án cũ
  const data = {};
  for (const t of TABLES) {
    data[t] = await fetchAll(oldDb, t);
  }

  // 2. Ảnh món trong kho ảnh cũ -> chép sang kho ảnh mới
  let copied = 0;
  for (const p of data.sanpham) {
    if (typeof p.hinh_anh === 'string' && p.hinh_anh.startsWith(oldStoragePrefix)) {
      p.hinh_anh = await copyImage(p);
      copied++;
    }
  }
  console.log(`Đã chép ${copied} ảnh món sang kho ảnh dự án mới`);

  // 3. Ghi vào dự án mới (nguyenlieu ghi lại lần cuối: trigger giá vốn khi chèn phiếu nhập có thể đổi giá vốn)
  for (const t of TABLES) {
    await upsertAll(t, data[t]);
  }
  await upsertAll('nguyenlieu', data.nguyenlieu);

  // Xóa ở dự án mới những dòng không còn ở dự án cũ (bảng con trước, bảng cha sau)
  for (const t of [...TABLES].reverse()) {
    const keep = new Set(data[t].map(r => r.id));
    const existing = await fetchAll(newDb, t);
    const extra = existing.filter(r => !keep.has(r.id)).map(r => r.id);
    if (extra.length) {
      await deleteIds(t, extra);
      console.log(`  ${t}: xóa ${extra.length} dòng đã không còn ở dự án cũ`);
    }
  }

  // 4. Đối chiếu
  let mismatch = 0;
  console.log('\nĐỐI CHIẾU (cũ -> mới):');
  for (const t of TABLES) {
    const { count } = await newDb.from(t).select('id', { count: 'exact', head: true });
    const ok = count === data[t].length;
    if (!ok) mismatch++;
    console.log(`  ${ok ? '✓' : '✗'} ${t.padEnd(15)} ${String(data[t].length).padStart(5)} -> ${count}`);
  }
  const newOrders = await fetchAll(newDb, 'hoadon');
  const newIngs = await fetchAll(newDb, 'nguyenlieu');
  const revenue = rows => rows.filter(o => o.trang_thai_thanh_toan === 'Đã thanh toán').reduce((s, o) => s + Number(o.tong_tien || 0), 0);
  const stock = rows => rows.reduce((s, r) => s + Number(r.so_luong_ton || 0), 0);
  const cost = rows => rows.reduce((s, r) => s + Number(r.gia_von_trung_binh || 0), 0);
  const checks = [
    ['Tổng doanh thu đã thanh toán', revenue(data.hoadon), revenue(newOrders)],
    ['Tổng tồn kho', stock(data.nguyenlieu), stock(newIngs)],
    ['Tổng giá vốn nguyên liệu', cost(data.nguyenlieu), cost(newIngs)]
  ];
  for (const [label, a, b] of checks) {
    const ok = Math.abs(a - b) < 0.001;
    if (!ok) mismatch++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${a.toLocaleString('vi-VN')} -> ${b.toLocaleString('vi-VN')}`);
  }
  console.log(mismatch === 0 ? '\nHOÀN TẤT: dữ liệu 2 dự án khớp 100%' : `\nCÓ ${mismatch} MỤC LỆCH, kiểm tra lại`);
  process.exit(mismatch ? 1 : 0);
})().catch(err => {
  console.error('LỖI:', err.message);
  process.exit(1);
});
