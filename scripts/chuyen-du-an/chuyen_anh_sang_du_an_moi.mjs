// Chuyển ảnh món từ dự án Supabase CŨ sang dự án MỚI.
// Cách dùng (PowerShell, sau khi đã chạy file MIGRATION_DU_AN_MOI_AVA_K300.sql trên dự án mới):
//   $env:OLD_URL="https://<du-an-cu>.supabase.co"
//   $env:NEW_URL="https://<du-an-moi>.supabase.co"
//   $env:NEW_ANON_KEY="<anon key của dự án mới>"
//   node scripts/chuyen-du-an/chuyen_anh_sang_du_an_moi.mjs "<đường dẫn thư mục sao lưu>\2026-10-30" "<thư mục ghi file SQL>"
// Kết quả: tải từng ảnh cũ, tải lên kho ảnh dự án mới, và tạo file SQL cập nhật đường dẫn ảnh.
// Không xóa hay sửa gì trên dự án cũ.

import fs from 'fs';
import path from 'path';

const [, , backupDir, outDir] = process.argv;
const OLD_URL = (process.env.OLD_URL || '').replace(/\/$/, '');
const NEW_URL = (process.env.NEW_URL || '').replace(/\/$/, '');
const NEW_KEY = process.env.NEW_ANON_KEY || '';
const BUCKET = 'product-images';

if (!backupDir || !outDir || !OLD_URL || !NEW_URL || !NEW_KEY) {
  console.error('Thiếu tham số: cần backupDir, outDir và các biến OLD_URL, NEW_URL, NEW_ANON_KEY');
  process.exit(1);
}

const products = JSON.parse(fs.readFileSync(path.join(backupDir, 'sanpham.json'), 'utf8'));
const oldPrefix = `${OLD_URL}/storage/v1/object/public/${BUCKET}/`;
const targets = products.filter(p => typeof p.hinh_anh === 'string' && p.hinh_anh.startsWith(oldPrefix));
console.log(`Có ${targets.length} ảnh cần chuyển`);

const updates = [];
let ok = 0;
let failed = 0;
for (const p of targets) {
  const objectPath = p.hinh_anh.slice(oldPrefix.length).split('?')[0];
  try {
    const src = await fetch(p.hinh_anh);
    if (!src.ok) throw new Error(`tải ảnh cũ lỗi HTTP ${src.status}`);
    const bytes = Buffer.from(await src.arrayBuffer());
    const contentType = src.headers.get('content-type') || 'image/webp';
    const dest = `chuyen-du-an/${p.id}-${path.basename(objectPath)}`;

    const up = await fetch(`${NEW_URL}/storage/v1/object/${BUCKET}/${dest}`, {
      method: 'POST',
      headers: { apikey: NEW_KEY, Authorization: `Bearer ${NEW_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: bytes
    });
    if (!up.ok) throw new Error(`tải lên dự án mới lỗi HTTP ${up.status}: ${await up.text()}`);

    const newUrl = `${NEW_URL}/storage/v1/object/public/${BUCKET}/${dest}`;
    updates.push({ id: p.id, url: newUrl });
    ok++;
    console.log(`✓ ${p.id} ${p.ten_san_pham} (${Math.round(bytes.length / 1024)} KB)`);
  } catch (err) {
    failed++;
    console.log(`✗ ${p.id} ${p.ten_san_pham}: ${err.message}`);
  }
}

// File SQL cập nhật đường dẫn ảnh trong bảng sanpham của dự án mới
const sql = [
  '-- Cập nhật đường dẫn ảnh sang kho ảnh của dự án mới (chạy 1 lần trong SQL Editor của dự án mới)',
  ...updates.map(u => `UPDATE public.sanpham SET hinh_anh = '${u.url.replace(/'/g, "''")}' WHERE id = '${u.id.replace(/'/g, "''")}';`)
].join('\n');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'cap_nhat_anh_du_an_moi.sql'), sql + '\n', 'utf8');
console.log(`\nXong: ${ok} thành công, ${failed} lỗi. File SQL: ${path.join(outDir, 'cap_nhat_anh_du_an_moi.sql')}`);
process.exit(failed ? 1 : 0);
