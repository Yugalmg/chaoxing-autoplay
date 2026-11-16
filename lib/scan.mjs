/**
 * 扫描引擎：课程列表 → 章节 → 任务点，一次跑完并汇总统计
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, getCookies, getCookieHeader, httpGet, extractJsonObject } from './core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 简易并发池 */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function fetchCourseList() {
  const res = await fetch('https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata', {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Cookie': getCookieHeader(),
      'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest',
    },
    body: 'courseType=1&courseFolderId=0&courseFolderSize=0',
  });
  const html = await res.text();
  if (/passport2|请先登录/.test(html)) throw new Error('LOGIN_EXPIRED');

  const order = [], seen = new Set();
  for (const m of html.matchAll(/stucoursemiddle\?courseid=(\d+)&(?:amp;)?clazzid=(\d+)&(?:amp;)?cpi=(\d+)/g)) {
    const key = `${m[1]}_${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    order.push({ courseid: m[1], clazzid: m[2], cpi: m[3] });
  }
  const names = [...html.matchAll(/class="course-name[^"]*"[^>]*title="([^"]+)"/g)].map(m => m[1]);
  return order.map((c, i) => ({ ...c, name: names[i] || `课程${c.courseid}` }));
}

export async function fetchChapters(course) {
  const url = `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=${course.courseid}&clazzid=${course.clazzid}&cpi=${course.cpi}&ut=s`;
  const html = await httpGet(url, 'https://mooc2-ans.chaoxing.com/');
  const enc = html.match(/var enc = "([0-9a-f]{32})"/)?.[1] || '';
  const chapters = [];
  for (const ch of html.split('<div class="chapter_item"').slice(1)) {
    const kid = ch.match(/id="cur(\d+)"/)?.[1];
    if (!kid) continue;
    const title = ch.match(/^\s*id="cur\d+"[\s\S]{0,200}?title="([^"]*)"/)?.[1] || '';
    const no = ch.match(/class="catalog_sbar">([^<]*)</)?.[1]?.trim() || '';
    const stateClass = ch.match(/class="catalog_state ([^"]*)"/)?.[1] || '';
    chapters.push({ kid, no, title, done: /yiwanc/.test(stateClass) });
  }
  return { enc, chapters };
}

export async function fetchJobs(course, kid) {
  // 章节可能有多个 tab：num=0 学习目标 / num=1 视频 / num=2 章节测验
  // 不同课程编号不同，必须都试一遍，否则会漏掉整批视频
  let best = null;
  for (const num of [0, 1, 2]) {
    const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${course.clazzid}&courseid=${course.courseid}&knowledgeid=${kid}&num=${num}&ut=s&cpi=${course.cpi}&v=2025`;
    try {
      const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${kid}&courseId=${course.courseid}&clazzid=${course.clazzid}`);
      if (/章节未开放/.test(html)) return [];
      const raw = extractJsonObject(html, 'mArg');
      if (!raw) continue;
      const mArg = JSON.parse(raw);
      const atts = mArg.attachments || [];
      if (!atts.some(a => a.type === 'video')) continue;
      if (!best || atts.length > best.length) best = atts;
      if (num >= 1) break;   // 已拿到视频，不必再往后试
    } catch { /* 单次失败不影响整体 */ }
    await sleep(150);
  }
  if (!best) return [];

  const jobs = [];
  for (const a of best) {
    const p = a.property || {};
    const type = a.type || (p.module === 'insertvideo' ? 'video' : p.module === 'insertdoc' ? 'document' : 'unknown');
    jobs.push({
      jobid: a.jobid || p.jobid || '',
      objectId: a.objectId || p.objectid || '',
      type,
      name: p.name || p.title || '',
      duration: Number(a.attDuration || 0),
      // isPassed 是「任务点」判定；无 jobid 的视频永远是 false。
      // 真正的「看完」标记是 property.ywbf=1 或 playTime 达到时长。
      passed: !!a.isPassed || Number(p.ywbf) === 1 || (Number(a.attDuration) > 0 && Number(a.playTime || 0) / 1000 >= Number(a.attDuration) - 1),
      playTime: Number(a.playTime || 0) / 1000,
    });
  }
  return jobs;
}

/**
 * 全量扫描，返回带统计的课程数组
 * onProgress(stage: {phase, current, total, text})
 */
export async function scanAll(onProgress = () => {}) {
  const t0 = Date.now();
  onProgress({ phase: 'courses', current: 0, total: 1, text: '读取课程列表…' });
  const courses = await fetchCourseList();
  onProgress({ phase: 'courses', current: 1, total: 1, text: `找到 ${courses.length} 门课程` });

  const jobsIndex = {};
  const results = [];

  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    onProgress({ phase: 'chapters', current: i, total: courses.length, text: `扫描 ${c.name} 的章节…` });

    let chs = [], enc = '';
    try {
      ({ enc, chapters: chs } = await fetchChapters(c));
    } catch (e) {
      if (e.message === 'SESSION_EXPIRED' || e.message === 'LOGIN_EXPIRED') throw e;
      results.push({ ...c, total: 0, passed: 0, pending: 0, pendSec: 0, error: e.message.slice(0, 60) });
      continue;
    }

    // 章节任务点并发扫描
    const jobsArr = await pool(chs, 3, async (ch) => {
      try { await sleep(200); return { kid: ch.kid, jobs: await fetchJobs(c, ch.kid) }; }
      catch { return { kid: ch.kid, jobs: [] }; }
    });

    const jobs = [];
    for (let k = 0; k < chs.length; k++) {
      const ch = chs[k];
      for (const j of (jobsArr[k]?.jobs || [])) jobs.push({ ...j, kid: ch.kid, no: ch.no, chapter: ch.title });
    }
    jobsIndex[c.courseid] = { course: c.name, clazzid: c.clazzid, cpi: c.cpi, enc, jobs };

    const vids = jobs.filter(j => j.type === 'video');
    const pending = vids.filter(j => !j.passed);
    results.push({
      ...c, enc,
      total: vids.length,
      passed: vids.length - pending.length,
      pending: pending.length,
      pendSec: pending.reduce((s, j) => s + j.duration, 0),
    });

    onProgress({ phase: 'chapters', current: i + 1, total: courses.length, text: `${c.name} 完成（${vids.length} 个视频）` });
  }

  fs.writeFileSync(path.join(ROOT, 'state', 'jobs_index.json'), JSON.stringify(jobsIndex, null, 2), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'state', 'courses_cache.json'), JSON.stringify({
    at: Date.now(), elapsed: Date.now() - t0, courses: results,
  }, null, 2), 'utf8');

  onProgress({ phase: 'done', current: results.length, total: results.length, text: `扫描完成，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒` });
  return results;
}
