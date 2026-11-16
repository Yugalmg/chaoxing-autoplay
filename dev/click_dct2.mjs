import { CDP } from './lib/cdp.mjs';
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('studentstudy'));
if (!page) { console.log('no page'); process.exit(1); }
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const ev = async (expr, t = 30000) => {
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, page.sessionId, t);
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 250);
    return r.result?.value ?? null;
  } catch (e) { return 'ERR:' + e.message; }
};

console.log('=== dct2 元素及其周边 HTML ===');
console.log(await ev(`(() => {
  const el = document.getElementById('dct2');
  if (!el) return 'no dct2';
  return JSON.stringify({ outer: el.outerHTML.slice(0, 400), onclick: el.getAttribute('onclick'), parent: el.parentElement.outerHTML.slice(0, 500) }, null, 1);
})()`));

console.log('\n=== 点击 dct2 ===');
console.log(await ev(`(async () => {
  const el = document.getElementById('dct2');
  el.click();
  await new Promise(r => setTimeout(r, 3500));
  return JSON.stringify({ clicked: true });
})()`));

console.log('\n=== 点击后页面变化 ===');
console.log(await ev(`(() => {
  const ifr = [...document.querySelectorAll('iframe')].map(f => ({ id: f.id, src: (f.src||'').slice(0, 120), visible: f.offsetParent !== null }));
  const pop = document.querySelector('.layui-layer, .popup, #popFrameId, [id*=pop]');
  return JSON.stringify({ iframes: ifr, popText: pop ? pop.innerText.slice(0,200) : null }, null, 1);
})()`));

console.log('\n=== 全局 work 函数源码片段 ===');
console.log(await ev(`(async () => {
  const fns = {};
  for (const k of ['workPop','workToast','workHint']) {
    try { fns[k] = String(window[k]).slice(0, 300); } catch (e) { fns[k] = 'err'; }
  }
  return JSON.stringify(fns, null, 1);
})()`));
cdp.close();
