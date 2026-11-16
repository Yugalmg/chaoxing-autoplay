import fs from 'node:fs';
import { launchBrowser, newPage } from './lib/cdp.mjs';

const { cdp, proc } = await launchBrowser({
  exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  port: 9339, headless: true,
});
const page = await newPage(cdp, 'http://127.0.0.1:7788/');
await new Promise(r => setTimeout(r, 6000));

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, page.sessionId);
fs.writeFileSync('log/ui.png', Buffer.from(shot.data, 'base64'));

const txt = await cdp.send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.title,
    login: document.getElementById('loginText')?.innerText,
    scan: document.getElementById('scanText')?.innerText,
    rows: document.querySelectorAll('#courseBody tr').length,
    firstRow: document.querySelector('#courseBody tr')?.innerText,
    errors: window.__errs || null
  })`, returnByValue: true,
}, page.sessionId);
console.log(txt.result?.value);
try { proc.kill(); } catch {}
