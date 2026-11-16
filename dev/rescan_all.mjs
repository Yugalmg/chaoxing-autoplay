import { scanAll } from './lib/scan.mjs';
console.log('开始全量重扫（含 num=1 视频视图）…');
const courses = await scanAll((p) => {
  if (p.phase === 'done') console.log('  ' + p.text);
  else if (p.current % 3 === 0) console.log(`  [${p.current}/${p.total}] ${p.text.slice(0,50)}`);
});
console.log('\n=== 重扫结果 ===');
for (const c of courses.sort((a,b)=>b.pendSec-a.pendSec)) {
  console.log(`${c.name.slice(0,22).padEnd(24)} ${String(c.passed).padStart(3)}/${String(c.total).padStart(3)}  待看 ${(c.pendSec/3600).toFixed(1)}h`);
}
