import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cfg, sleep, readJson, writeJson, httpGet, extractJsonObject } from './lib/core.mjs';

const args = new Set(process.argv.slice(2));
const MODE_SCAN = args.has('--scan');
const MODE_RESCAN = args.has('--rescan');
const MODE_GO = args.has('--go');

const survey = readJson('state/survey.json', []);

function planText() {
  const lines = [];
  lines.push('=== 待刷计划（只读，无网络请求）===');
  for (const s of survey) {
    if (cfg.target.skip_courses.includes(s.name)) continue;
    if (!cfg.target.courses.includes(s.name)) continue;
    lines.push(`  ${s.name}  待刷 ${s.pending}/${s.total} 章`);
  }
  lines.push('');
  lines.push('用法:');
  lines.push('  node run.mjs            # 只打印计划，不联网');
  lines.push('  node run.mjs --scan     # 只读枚举任务点，落 state/jobs_index.json');
  lines.push('  node run.mjs --go        # 真正开刷（需先完成 player 模块）');
  return lines.join('\n');
}

async function scan() {
  console.log('[scan] 只读枚举任务点，不产生任何学习记录');
  const index = MODE_RESCAN ? {} : readJson('state/jobs_index.json', {});
  for (const s of survey) {
    if (cfg.target.skip_courses.includes(s.name)) continue;
    if (!cfg.target.courses.includes(s.name)) continue;
    if (index[s.courseid]) { console.log(`  跳过（已枚举）${s.name}`); continue; }
    const jobs = [];
    for (const ch of s.chapters) {
      const url = `https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid=${s.clazzid}&courseid=${s.courseid}&knowledgeid=${ch.kid}&num=0&ut=s&cpi=${s.cpi}&v=2025`;
      try {
        const html = await httpGet(url, `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${ch.kid}&courseId=${s.courseid}&clazzid=${s.clazzid}`);
        const raw = extractJsonObject(html, 'mArg');
        if (!raw) continue;
        const mArg = JSON.parse(raw);
        const d = mArg.defaults || {};
        for (const a of (mArg.attachments || [])) {
          const p = a.property || {};
          const type = a.type || (p.module === 'insertvideo' ? 'video' : p.module === 'insertdoc' ? 'document' : p.module === 'insertbbs' ? 'bbs' : 'unknown');
          jobs.push({
            no: ch.no, kid: ch.kid, chapter: ch.title, chapterDone: ch.done,
            jobid: a.jobid || p.jobid || '',
            objectId: a.objectId || p.objectid || '',
            type,
            module: p.module || '',
            name: p.name || p.title || '',
            duration: Number(a.attDuration || p.duration || 0),      // 秒
            played: Number(a.playTime || 0),                          // 毫秒
            passed: !!a.isPassed,
            jobRate: a.jobRate ?? null,
            faceCapture: (a.randomFaceCaptureTimeList || []).length > 0 || Number(a.randomCaptureTime) > 0,
            switchWindow: p.switchwindow === 'true',
            fastForward: p.fastforward === 'true',
            doubleSpeed: Number(p.doublespeed || 0),
            otherInfo: a.otherInfo || '',
            enc: a.enc || '',
          });
        }
      } catch (e) {
        console.log(`  ERR ${s.name} ${ch.no}: ${e.message}`);
        if (e.message === 'SESSION_EXPIRED') throw e;
      }
      await sleep(700);
    }
    index[s.courseid] = { course: s.name, clazzid: s.clazzid, cpi: s.cpi, enc: s.enc, videoDefaults: null, jobs };
    writeJson('state/jobs_index.json', index);
    console.log(`  ${s.name}: ${jobs.length} 个任务点`);
  }
  console.log('[scan] 完成 -> state/jobs_index.json');
}

async function go() {
  if (cfg.mode.dry_run) {
    console.log('mode.dry_run = true，拒绝开火。把 config.json 的 mode.dry_run 改为 false 后再执行 --go。');
    return;
  }
  console.log('[go] player 模块尚未装配，未发起任何播放/上报。');
  console.log('      装配顺序: 1) 安装 Chromium 驱动  2) 实现播放器挂载与自动切章');
  console.log('                3) 弹题 OCR  4) 运行校验与落库');
}

if (MODE_GO) await go();
else if (MODE_SCAN || MODE_RESCAN) await scan();
else console.log(planText());
