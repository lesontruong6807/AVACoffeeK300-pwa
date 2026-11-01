// Sao lưu toàn bộ dữ liệu Supabase ra file JSON. CHỈ ĐỌC. Dùng: node scripts/chuyen-du-an/sao_luu_du_lieu.js . "<thư mục đích>"
// Sao lưu toàn bộ dữ liệu Supabase ra file JSON. CHỈ ĐỌC, không sửa gì trên Supabase.
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || ".");
const outDir = process.argv[3];
const { createClient } = require(path.join(root, 'node_modules', '@supabase', 'supabase-js'));

const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !line.startsWith('#')) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Thứ tự phù hợp để nhập lại (bảng cha trước, bảng con sau)
const TABLES = [
  'nguoidung', 'danhsachban', 'danhmuc', 'sanpham', 'nguyenlieu', 'congthuc',
  'hoadon', 'hoadondetail', 'lichsukho', 'phieunhapkho', 'chitietnhapkho',
  'chiphivanhang', 'chamcong', 'nghiphep', 'cauhinh'
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const summary = {};
  let failed = 0;
  for (const table of TABLES) {
    const rows = [];
    let error = null;
    for (let from = 0; ; from += 1000) {
      const { data, error: err } = await sb.from(table).select('*').order('id', { ascending: true }).range(from, from + 999);
      if (err) { error = err; break; }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (error) {
      failed++;
      summary[table] = `LỖI: ${error.message}`;
      console.log(table.padEnd(16), 'LỖI:', error.message);
      continue;
    }
    fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 1), 'utf8');
    // Đọc lại file để chắc chắn đã ghi đủ
    const back = JSON.parse(fs.readFileSync(path.join(outDir, `${table}.json`), 'utf8'));
    summary[table] = back.length;
    console.log(table.padEnd(16), String(back.length).padStart(6), 'dòng', back.length === rows.length ? '✓' : '✗ LỆCH');
  }
  fs.writeFileSync(path.join(outDir, '_THONG_TIN_SAO_LUU.json'), JSON.stringify({
    thoi_gian: new Date().toISOString(),
    du_an: env.NEXT_PUBLIC_SUPABASE_URL,
    so_dong: summary
  }, null, 2), 'utf8');
  console.log(failed === 0 ? '\nSAO LƯU HOÀN TẤT' : `\n${failed} BẢNG LỖI`);
  process.exit(failed ? 1 : 0);
})();
