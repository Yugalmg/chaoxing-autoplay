import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'state', 'Cookies.db');
const KEYB64 = path.join(ROOT, 'state', 'key.b64');
const OUT = path.join(ROOT, 'state', 'cookies.json');

const key = Buffer.from(fs.readFileSync(KEYB64, 'utf8').trim(), 'base64');
if (key.length !== 32) throw new Error('bad key length ' + key.length);

function decryptValue(buf) {
  if (!buf || buf.length === 0) return '';
  const head = buf.subarray(0, 3).toString('latin1');
  if (head === 'v10' || head === 'v11') {
    const nonce = buf.subarray(3, 15);
    const body = buf.subarray(15);
    const tag = body.subarray(body.length - 16);
    const ct = body.subarray(0, body.length - 16);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch (e) {
      return `__DECRYPT_FAIL__:${e.message}`;
    }
  }
  // 明文（Chromium 对某些值不加密）
  return buf.toString('utf8');
}

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare(`
  SELECT host_key, name, value, encrypted_value, path,
         CAST(expires_utc AS TEXT) AS expires_utc, is_secure, is_httponly
  FROM cookies ORDER BY host_key, name
`).all();

const chromeEpoch = 11644473600000000n; // 1601-01-01 -> 1970-01-01 in microseconds
const out = [];
const hosts = new Map();
for (const r of rows) {
  let val = r.value;
  if (!val) val = decryptValue(r.encrypted_value);
  let exp = -1;
  if (r.expires_utc && r.expires_utc > 0) {
    exp = Number((BigInt(r.expires_utc) - chromeEpoch) / 1000000n);
  }
  out.push({
    name: r.name, value: val, domain: r.host_key, path: r.path || '/',
    expires: exp, httpOnly: !!r.is_httponly, secure: !!r.is_secure,
    sameSite: 'Lax',
  });
  hosts.set(r.host_key, (hosts.get(r.host_key) || 0) + 1);
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

console.log(`total cookies: ${out.length}`);
console.log('--- domains ---');
for (const [h, c] of [...hosts.entries()].sort((a, b) => b[1] - a[1])) console.log(`${String(c).padStart(3)}  ${h}`);
console.log('--- key cookies ---');
for (const c of out.filter(c => /^(JSESSIONID|route|_uid|UID|fid|uf|_d|vc3|vc2|vc1|p_auth_token|_csrfToken)$/i.test(c.name))) {
  const v = c.value.length > 40 ? c.value.slice(0, 40) + '...' : c.value;
  console.log(`${c.domain}\t${c.name}=${v}`);
}
