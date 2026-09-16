// "Keep me signed in": the login hands a remembered device a signed token
// instead of the password, and the token dies with the password.
// Run: node tests/install-shim.mjs && node tests/remember.test.mjs
process.env.ADMIN_PASSWORD = 'first-password';
const { default: handler } = await import('../netlify/functions/api.mjs');

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};
const req = (method, path, headers = {}, body) => handler(new Request('http://localhost/api' + path, {
  method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }));

let res = await req('POST', '/login', { 'x-admin-password': 'first-password' }, { remember: false });
let data = await res.json();
ok('a plain login returns no token', res.status === 200 && !data.token);

res = await req('POST', '/login', { 'x-admin-password': 'first-password' }, { remember: true });
data = await res.json();
ok('a remembered login returns a token and an expiry about 90 days out', res.status === 200 && typeof data.token === 'string'
  && Math.abs(new Date(data.expiresAt).getTime() - Date.now() - 90 * 86400000) < 60000, JSON.stringify(data));
const token = data.token;
ok('the token is not the password and does not contain it', token !== 'first-password' && !token.includes('first-password'));

res = await req('GET', '/events?start=2026-09-06&end=2026-09-12', { 'x-admin-token': token });
data = await res.json();
ok('the token alone is admin', data.mode === 'admin');
ok('a token response is never cached', (res.headers.get('Cache-Control') || '').includes('no-store'));
res = await req('POST', '/events', { 'x-admin-token': token }, { type: 'BLOCKED', title: 'T', start: '2026-09-09T10:00', end: '2026-09-09T11:00', recurrence: null });
ok('and can write', res.status === 200);

res = await req('POST', '/login', { 'x-admin-password': 'wrong' }, { remember: true });
ok('a wrong password gets no token', res.status === 401);
res = await req('GET', '/events?start=2026-09-06&end=2026-09-12', { 'x-admin-token': token + 'x' });
ok('a tampered token is public', (await res.json()).mode === 'public');
res = await req('GET', '/events?start=2026-09-06&end=2026-09-12', { 'x-admin-token': '1000000000000.' + token.split('.')[1] });
ok('an expired token is public', (await res.json()).mode === 'public');
res = await req('GET', '/events?start=2026-09-06&end=2026-09-12', { 'x-admin-token': token, 'x-admin-password': 'wrong' });
ok('a wrong password beside a good token is still refused - the password wins when sent', (await res.json()).mode === 'public');

process.env.ADMIN_PASSWORD = 'second-password';
res = await req('GET', '/events?start=2026-09-06&end=2026-09-12', { 'x-admin-token': token });
ok('changing the admin password kills every remembered device', (await res.json()).mode === 'public');

console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\nremember: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
