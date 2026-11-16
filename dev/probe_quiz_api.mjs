import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, getCookieHeader, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));
const kid = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))][0];

const cardsUrl = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(cardsUrl, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
const v = (mArg.attachments || []).find(a => a.type === 'video');
const mid = v.mid || v.property?.mid;
const objectId = v.objectId;
console.log(`视频: ${v.property?.name}`);
console.log(`mid=${mid}  objectId=${objectId}  cpi=${c.cpi}`);

// 播放器初始化数据
const initUrl = `https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${cid}&ut=s`;
const raw = await httpGet(initUrl, 'https://mooc1.chaoxing.com/');
console.log(`\n=== initdatawithviewerV2 响应（${raw.length} 字节）===`);
let j;
try { j = JSON.parse(raw); } catch { console.log(raw.slice(0, 1500)); process.exit(0); }

console.log('顶层字段:', Object.keys(j).join(', '));
const dump = (obj, prefix = '', depth = 0) => {
  if (depth > 3) return;
  for (const [k, val] of Object.entries(obj || {})) {
    const t = Array.isArray(val) ? `array[${val.length}]` : typeof val;
    const hot = /quiz|question|answer|interact|jump|point|task|cc|exercise|test/i.test(k);
    console.log(`${'  '.repeat(depth)}${hot ? '★' : ' '} ${k}: ${t}${hot && t !== 'object' && t !== 'array' ? ' = ' + JSON.stringify(val).slice(0, 100) : ''}`);
    if (val && typeof val === 'object' && !Array.isArray(val) && depth < 2) dump(val, prefix + k + '.', depth + 1);
    if (Array.isArray(val) && val.length && typeof val[0] === 'object' && depth < 2) {
      console.log(`${'  '.repeat(depth + 1)}[0] keys: ${Object.keys(val[0]).join(', ')}`);
    }
  }
};
dump(j);
