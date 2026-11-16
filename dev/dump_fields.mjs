import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpGet, extractJsonObject } from './lib/core.mjs';

const CID = '265739431';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8')).find(x => x.name.includes('人工智能'));

// dump 12.6 第一个视频的完整字段
const ch = s.chapters.find(x => x.no === '12.6');
const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html = await httpGet(url, 'https://mooc1.chaoxing.com/');
const mArg = JSON.parse(extractJsonObject(html, 'mArg'));
console.log('=== mArg 顶层键 ===');
console.log(Object.keys(mArg).join(', '));
console.log('\n=== defaults ===');
console.log(JSON.stringify(mArg.defaults, null, 1).slice(0, 800));
console.log('\n=== 第一个视频 attachment 完整字段 ===');
console.log(JSON.stringify(mArg.attachments[0], null, 1).slice(0, 1500));
console.log('\n=== 对比：12.11.1（已通过）===');
const ch2 = s.chapters.find(x => x.no === '12.11.1');
const url2 = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${c.clazzid}&courseid=${CID}&knowledgeid=${ch2.kid}&num=0&ut=s&cpi=${c.cpi}&v=2025`;
const html2 = await httpGet(url2, 'https://mooc1.chaoxing.com/');
const mArg2 = JSON.parse(extractJsonObject(html2, 'mArg'));
console.log(JSON.stringify(mArg2.attachments[0], null, 1).slice(0, 1500));
