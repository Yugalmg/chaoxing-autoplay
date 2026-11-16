import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survey = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const jobsFile = path.join(ROOT, 'state', 'jobs_index.json');
const jobsIndex = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, 'utf8')) : {};

const targets = cfg.target.courses;
let totalPending = 0;

console.log('课程待刷总览');
console.log('='.repeat(78));
console.log('课程'.padEnd(34) + '章节'.padStart(6) + '已完成'.padStart(8) + '待刷'.padStart(8) + '任务点'.padStart(10));
console.log('-'.repeat(78));

for (const s of survey) {
  if (cfg.target.skip_courses.includes(s.name)) continue;
  if (!targets.includes(s.name)) continue;
  const ji = jobsIndex[s.courseid];
  const atts = ji ? ji.jobs.length : null;
  totalPending += s.pending;
  console.log(
    s.name.slice(0, 32).padEnd(34) +
    String(s.total).padStart(6) +
    String(s.done).padStart(8) +
    String(s.pending).padStart(8) +
    (atts === null ? '  未枚举' : String(atts).padStart(10))
  );
}
console.log('-'.repeat(78));
console.log(`待刷章节合计: ${totalPending}`);

console.log('\n当前准备状态');
console.log('='.repeat(78));
const checks = [
  ['登录态 cookies', fs.existsSync(path.join(ROOT, 'state', 'cookies.json')), '(22 条, 解密自客户端 DPAPI)'],
  ['主密钥', fs.existsSync(path.join(ROOT, 'state', 'key.b64')), '(32 字节 AES key)'],
  ['课程列表', fs.existsSync(path.join(ROOT, 'state', 'courses.json')), '(10 门)'],
  ['章节树+完成状态', fs.existsSync(path.join(ROOT, 'state', 'survey.json')), '(10 门课已扫描)'],
  ['任务点枚举', Object.keys(jobsIndex).length > 0, `(${Object.keys(jobsIndex).length} 门已枚举)`],
  ['风控参数', true, '(reportTimeInterval=60, silentFaceCapture=0, playingCapture=1)'],
];
for (const [k, ok, note] of checks) console.log(`  ${ok ? '[OK]  ' : '[TODO]'} ${k.padEnd(20)} ${note}`);

console.log('\n网络动作边界');
console.log('='.repeat(78));
console.log('  已执行: 登录态解出、课程列表、章节树扫描（全部 GET/POST 只读）');
console.log('  未执行: 打开播放器、multimedia/log 上报、任何答题提交');
console.log(`  当前 mode.dry_run = ${cfg.mode.dry_run}`);
