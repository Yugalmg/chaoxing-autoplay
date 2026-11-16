import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const [cid, c] = Object.entries(index).find(([, x]) => x.course.includes('艺术哲学'));
const kid = [...new Set(c.jobs.filter(j => j.type === 'video' && !j.passed).map(j => j.kid))][0];

const cardsUrl = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${cid}&knowledgeid=${kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(cardsUrl, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${cid}&clazzid=${c.clazzid}`);
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
const v = (mArg.attachments || []).find(a => a.type === 'video');
const mid = v.mid || v.property?.mid;

const initUrl = `https://mooc1.chaoxing.com/mooc-ans/richvideo/initdatawithviewerV2?mid=${mid}&cpi=${c.cpi}&classid=${c.clazzid}&courseid=${cid}&ut=s`;
const raw = await httpGet(initUrl, 'https://mooc1.chaoxing.com/');
const j = JSON.parse(raw);

console.log('=== 完整弹题数据 ===');
console.log(JSON.stringify(j, null, 2).slice(0, 4000));
