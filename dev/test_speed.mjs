import { CDP } from './lib/cdp.mjs';

const OBJECT_ID = '4b9ec2babd03bea2e67ab1a32154c6a4';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);

const r = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const cd = document.getElementById('iframe')?.contentDocument;
    let v=null; [...cd.querySelectorAll('iframe')].forEach(f=>{try{const x=f.contentWindow.document.querySelector('video'); if(x&&(x.currentSrc||'').includes('${OBJECT_ID}')) v=x;}catch(e){}});
    if(!v) return 'none';
    let buf=[]; try{for(let i=0;i<v.buffered.length;i++)buf.push([+v.buffered.start(i).toFixed(0),+v.buffered.end(i).toFixed(0)]);}catch(e){}
    return JSON.stringify({src:v.currentSrc, cur:+v.currentTime.toFixed(1), buf});
  })()`, returnByValue: true,
}, page.sessionId, 20000);

const info = JSON.parse(r.result?.value || '{}');
console.log('页面状态:', JSON.stringify({ cur: info.cur, buf: info.buf }));
if (!info.src) { console.log('拿不到视频地址'); process.exit(0); }

console.log('视频地址:', info.src.slice(0, 120));

// 测速：Range 下载 8MB
const t0 = Date.now();
const res = await fetch(info.src, { headers: { 'Range': 'bytes=0-8388607', 'Referer': 'https://mooc1.chaoxing.com/' } });
const buf = Buffer.from(await res.arrayBuffer());
const sec = (Date.now() - t0) / 1000;
const mb = buf.length / 1048576;
console.log(`状态 ${res.status} | 下载 ${mb.toFixed(1)} MB 用时 ${sec.toFixed(1)}s | 速度 ${(mb / sec).toFixed(2)} MB/s`);

// 探测文件总大小
const res2 = await fetch(info.src, { headers: { 'Range': 'bytes=0-1', 'Referer': 'https://mooc1.chaoxing.com/' } });
const cr = res2.headers.get('content-range');
console.log('文件大小:', cr || '(无 content-range)');
cdp.close();
