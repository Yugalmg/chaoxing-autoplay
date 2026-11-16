import fs from 'node:fs';
import { getCookieHeader } from './lib/core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const get = async (u) => {
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': getCookieHeader(), 'Referer': 'https://mooc1.chaoxing.com/' } });
  return { status: r.status, text: await r.text() };
};

// 播放器主页面
const main = await get('https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-1106-1930');
console.log(`播放器页: ${main.status}  ${main.text.length} 字节`);
fs.writeFileSync('log/player_main.html', main.text, 'utf8');

// 提取 script / link
const scripts = [...main.text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
const links = [...main.text.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
console.log('\n脚本文件:');
scripts.forEach(s => console.log('  ' + s));

const resolve = (p) => p.startsWith('http') ? p : (p.startsWith('//') ? 'https:' + p : new URL(p, 'https://mooc1.chaoxing.com/ananas/modules/video/').href);

// 下载并按关键词搜索
const KEYS = /quiz|validation|question|answer|qtype|resourceId/i;
for (const s of scripts.slice(0, 8)) {
  const url = resolve(s);
  try {
    const r = await get(url);
    const hits = [...r.text.matchAll(/.{80}(quiz-validation|richvideo\/qv|resourceId).{120}/gi)].slice(0, 5);
    console.log(`\n=== ${url.split('/').pop()} (${r.text.length} 字节) 命中 ${hits.length} ===`);
    for (const h of hits) console.log('  …' + h[0].replace(/\s+/g, ' ').slice(0, 220));
    if (hits.length) {
      fs.writeFileSync('log/player_' + url.split('/').pop().replace(/[^\w.]/g, '_'), r.text, 'utf8');
    }
  } catch (e) { console.log(`  ${url}: ERR ${e.message}`); }
}
