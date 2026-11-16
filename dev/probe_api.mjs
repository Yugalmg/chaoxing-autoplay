import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cookies, sleep } from './lib/core.mjs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const CID = '268092949', KID = '1265127906', OBJECT_ID = '4b9ec2babd03bea2e67ab1a32154c6a4';
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'jobs_index.json'), 'utf8'));
const c = index[CID];

const { cdp, proc } = await launchBrowser({ exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 9333, headless: true });
await cdp.send('Storage.setCookies', {
  cookies: cookies.map(x => ({ name: x.name, value: x.value, domain: x.domain, path: x.path || '/', secure: !!x.secure, httpOnly: !!x.httpOnly, expires: x.expires > 0 ? x.expires : -1, sameSite: x.sameSite || 'Lax' })),
});
const page = await newPage(cdp);
try { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId, 10000); } catch {}

const url = `https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=${KID}&courseId=${CID}&clazzid=${c.clazzid}&cpi=${c.cpi}&enc=${c.enc}&mooc2=1`;
await cdp.send('Page.navigate', { url }, page.sessionId, 30000);
await sleep(16000);

const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cards = document.getElementById('iframe');
    const cd = cards.contentDocument;
    let f = null, v = null, idx = -1;
    [...cd.querySelectorAll('iframe')].forEach((x, i) => {
      try { const y = x.contentWindow.document.querySelector('video');
        if (y && (y.currentSrc || '').includes('${OBJECT_ID}')) { f = x; v = y; idx = i; } } catch (e) {}
    });
    if (!v) return JSON.stringify({err: 'no target'});
    const w = f.contentWindow;
    const keys = Object.keys(w).filter(k => /videojs|player|Player|_video|ins|controller/i.test(k)).slice(0, 25);
    let api = {};
    try {
      if (w.videojs) {
        api.hasVideojs = true;
        const players = w.videojs.getPlayers ? Object.keys(w.videojs.getPlayers()) : [];
        api.players = players;
        if (players.length) {
          const p = w.videojs.getPlayer(players[0]);
          api.playerMethods = ['play','pause','currentTime','playbackRate','duration','paused']
            .map(m => m + ':' + typeof p[m]);
          api.cur = p.currentTime ? p.currentTime() : null;
        }
      }
    } catch (e) { api.err = String(e.message).slice(0, 120); }
    return JSON.stringify({
      idx, cur: +v.currentTime.toFixed(1), dur: v.duration, paused: v.paused, rs: v.readyState,
      winKeys: keys, api,
      playerVar: typeof w.player, insVar: typeof w.ins, cpVar: typeof w.cp
    }, null, 1);
  })()`, returnByValue: true,
}, page.sessionId, 25000);

console.log(r.result?.value || JSON.stringify(r).slice(0, 800));
try { proc.kill(); } catch {}
