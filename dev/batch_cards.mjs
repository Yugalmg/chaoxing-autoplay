import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cookies = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'cookies.json'), 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const survey = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'survey.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractJson(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}

const courseName = process.argv[2] || '2026-2027-1形势与政策';
const course = survey.find(s => s.name === courseName);

const jobs = [];
for (const ch of course.chapters) {
  const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzid}&courseid=${course.courseid}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${course.cpi}&v=2025`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA, 'Cookie': cookieHeader,
        'Referer': `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${course.courseid}&clazzid=${course.clazzid}`,
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const html = await res.text();
    const json = extractJson(html, 'mArg');
    if (!json) { console.log(`  ${ch.no} ${ch.title}: no mArg`); continue; }
    const mArg = JSON.parse(json);
    const atts = mArg.attachments || [];
    if (atts.length === 0) {
      console.log(`  ${ch.no}\t${ch.kid}\t${ch.title}\t-- no attachments`);
    } else {
      for (const a of atts) {
        const rec = {
          no: ch.no, kid: ch.kid, chapter: ch.title,
          jobid: a.jobid, objectId: a.objectId, type: a.type,
          name: a.property?.name || a.name || '',
          duration: a.property?.duration || 0,
          jobRate: a.jobRate, isPassed: a.isPassed,
          raw: Object.keys(a),
        };
        jobs.push(rec);
        console.log(`  ${ch.no}\t${ch.title}\ttype=${a.type}\tdur=${a.property?.duration || '?'}\tjobid=${a.jobid}\tobj=${a.objectId}`);
      }
    }
  } catch (e) {
    console.log(`  ERR ${ch.no}: ${e.message}`);
  }
  await sleep(700);
}

fs.writeFileSync(path.join(ROOT, 'state', `jobs_${course.courseid}.json`), JSON.stringify(jobs, null, 2), 'utf8');
console.log(`\n=== ${course.name}: ${jobs.length} attachments ===`);
if (jobs.length) console.log('fields:', JSON.stringify(jobs[0].raw));
