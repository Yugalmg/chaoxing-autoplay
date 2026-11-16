import { httpGet } from './lib/core.mjs';

const html = await httpGet(
  'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?courseid=268092949&clazzid=157233451&cpi=571260325&ut=s',
  'https://mooc2-ans.chaoxing.com/'
);

const i = html.indexOf('cur1265127906');
const seg = html.slice(Math.max(0, i - 150), i + 1000);
const title = (seg.match(/title="([^"]*)"/) || [])[1] || '';
const st = (seg.match(/class="catalog_state ([^"]*)"/) || [])[1] || '';
const tip = (seg.match(/bntHoverTips">([^<]*)</) || [])[1] || '';

console.log('章节 2.1 :', title);
console.log('状态 class:', st);
console.log('服务端提示:', tip);
console.log('章节已完成:', /yiwanc/.test(st) ? '是' : '否');
