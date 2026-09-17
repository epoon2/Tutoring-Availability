// Accounts: sign up, confirm the email, log in, one calendar each; the
// first calendar is claimed with the admin password and keeps what it
// already had; passwords reset by email; addresses; rate limits.
// Run: node tests/install-shim.mjs && node tests/accounts.test.mjs
import { createServer } from 'node:http';
import { getStore } from '@netlify/blobs';

process.env.ADMIN_PASSWORD = 'admin-pw';
process.env.SITE_NAME = 'Test Calendar';

// a fake Brevo that keeps every message
const sent = [];
const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => raw += c);
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    sent.push({ to: body.to[0].email, subject: body.subject, text: body.textContent, html: body.htmlContent, sender: body.sender });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end('{"messageId":"x"}');
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
process.env.BREVO_API_KEY = 'k';
process.env.NOTIFY_FROM_EMAIL = 'site@example.com';
process.env.BREVO_API_BASE = `http://127.0.0.1:${fake.address().port}`;

const { default: handler } = await import('../netlify/functions/api.mjs');

let ran = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  ran++;
  if (cond) console.log('  ok ' + name);
  else fails.push(name + (extra ? `\n    ${extra}` : ''));
};
const call = async (method, path, headers = {}, body) => {
  const res = await handler(new Request('http://site.test/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json(), headers: res.headers };
};
const linkIn = (mail) => (/https?:\/\/\S+/.exec(mail.text) || [])[0];
const param = (link, name) => new URL(link).searchParams.get(name);
const week = '?start=2026-09-06&end=2026-09-12';

// ---- the first calendar has a schedule already
let r = await call('POST', '/events', { 'x-admin-password': 'admin-pw' }, { type: 'BLOCKED', title: 'Noah', start: '2026-09-09T10:00', end: '2026-09-09T11:00', recurrence: null });
ok('the first calendar takes a block with the admin password, as before', r.status === 200, JSON.stringify(r.data));
r = await call('GET', '/events' + week);
ok('with no address the request means the first calendar', r.data.mode === 'public' && r.data.calendar.slug === 'ethan' && r.data.calendar.claimed === false, JSON.stringify(r.data.calendar));
r = await call('GET', '/events' + week + '&calendar=ethan', { 'x-admin-password': 'admin-pw' });
ok('/ethan is the first calendar, from the display name', r.data.mode === 'admin' && r.data.events.length === 1);
r = await call('GET', '/events' + week + '&calendar=nobody');
ok('an unknown address is a 404 that says so', r.status === 404 && r.data.missing === true);

// ---- sign-up checks
r = await call('POST', '/signup', {}, { email: 'not-an-email', password: 'longenough1' });
ok('a bad email is refused', r.status === 400);
r = await call('POST', '/signup', {}, { email: 'maya@example.com', password: 'short' });
ok('a short password is refused', r.status === 400 && /8 characters/.test(r.data.error));

// ---- a new account
r = await call('POST', '/signup', {}, { email: 'Maya@Example.com', password: 'maya-pass-1', displayName: 'Maya Chen' });
ok('sign-up creates the account and a session', r.status === 201 && typeof r.data.token === 'string' && r.data.account.email === 'maya@example.com', JSON.stringify(r.data));
ok('the calendar address comes from the name', r.data.account.slug === 'maya-chen' && r.data.account.url === 'http://site.test/maya-chen');
ok('and is not confirmed yet', r.data.account.verified === false && r.data.verification === 'sent');
const maya = r.data.token;
ok('a confirmation email went out', sent.length === 1 && sent[0].to === 'maya@example.com' && /Confirm/.test(sent[0].subject) && sent[0].sender.name === 'Test Calendar', JSON.stringify(sent[0]));
const verifyLink = linkIn(sent[0]);
ok('with a link to the home page carrying a code', verifyLink && verifyLink.startsWith('http://site.test/?verify='), verifyLink);

r = await call('GET', '/events' + week + '&calendar=maya-chen');
ok('until then the calendar is not public', r.status === 404 && r.data.unpublished === true);
r = await call('GET', '/events' + week + '&calendar=maya-chen', { 'x-session': maya });
ok('but the owner sees it, empty, in admin mode', r.status === 200 && r.data.mode === 'admin' && r.data.events.length === 0 && r.data.session === 'valid');
ok('with a fresh title and their own email for notifications', r.data.config.portalTitle === "Maya Chen's Calendar" && r.data.config.tutorName === 'Maya Chen');
r = await call('GET', '/settings?calendar=maya-chen', { 'x-session': maya });
ok('the settings carry the notification address and the slug', r.data.settings.notificationEmail === 'maya@example.com' && r.data.slug === 'maya-chen');
r = await call('GET', '/events' + week + '&calendar=ethan', { 'x-session': maya });
ok("a signed-in account is a visitor on someone else's calendar", r.data.mode === 'public' && r.data.session === 'valid' && r.data.account.slug === 'maya-chen');
r = await call('POST', '/events?calendar=ethan', { 'x-session': maya }, { type: 'BLOCKED', title: 'X', start: '2026-09-09T10:00', end: '2026-09-09T11:00', recurrence: null });
ok('and cannot write there', r.status === 401 && /not your calendar/.test(r.data.error));
r = await call('POST', '/events?calendar=maya-chen', { 'x-session': maya }, { type: 'BLOCKED', title: 'Lee', start: '2026-09-09T12:00', end: '2026-09-09T13:00', recurrence: null });
ok('but can write to their own', r.status === 200);
r = await call('GET', '/events' + week + '&calendar=ethan', { 'x-admin-password': 'admin-pw' });
ok("which does not touch the first calendar's schedule", r.data.events.length === 1 && r.data.events[0].title === 'Noah');

// ---- confirming
r = await call('POST', '/verify', {}, { token: 'nonsense' });
ok('a bad code is refused', r.status === 400);
r = await call('POST', '/verify', {}, { token: param(verifyLink, 'verify') });
ok('the code from the email confirms the account and signs the device in', r.status === 200 && r.data.account.verified === true && typeof r.data.token === 'string');
r = await call('POST', '/verify', {}, { token: param(verifyLink, 'verify') });
ok('and works once', r.status === 400);
r = await call('GET', '/events' + week + '&calendar=maya-chen');
ok('now the calendar is public', r.status === 200 && r.data.mode === 'public' && r.data.calendar.claimed === true);
ok('public responses are cached per calendar', r.headers.get('Netlify-Cache-Tag') !== 'events' && (r.headers.get('Vary') || '').includes('x-session'));
r = await call('POST', '/resend', { 'x-session': maya });
ok('resend after confirming says it is done', r.data.verification === 'done');

// ---- logging in
r = await call('POST', '/login', {}, { email: 'maya@example.com', password: 'wrong-pass' });
ok('a wrong password is refused without saying which half was wrong', r.status === 401 && /do not match/.test(r.data.error));
r = await call('POST', '/login', {}, { email: 'nobody@example.com', password: 'wrong-pass' });
ok('so is an unknown email, the same way', r.status === 401 && /do not match/.test(r.data.error));
r = await call('POST', '/login', {}, { email: '  MAYA@example.com ', password: 'maya-pass-1' });
ok('the right pair signs in, whatever the case and spaces', r.status === 200 && r.data.account.slug === 'maya-chen');
const maya2 = r.data.token;
r = await call('GET', '/me', { 'x-session': maya2 });
ok('/me names the account', r.data.account.email === 'maya@example.com' && r.data.account.verified === true);
r = await call('GET', '/me', { 'x-session': maya2 + 'x' });
ok('a tampered session is nobody', r.status === 401);
r = await call('GET', '/events' + week + '&calendar=maya-chen', { 'x-session': maya2 + 'x' });
ok('and the page is told so', r.data.session === 'invalid' && r.data.mode === 'public');
r = await call('POST', '/signup', {}, { email: 'maya@example.com', password: 'another-pass', displayName: 'Maya' });
ok('the same email cannot sign up twice', r.status === 409);

// ---- the calendar address
r = await call('PUT', '/settings?calendar=maya-chen', { 'x-session': maya2 }, { slug: 'Ethan' });
ok("an address someone else holds is refused", r.status === 400 && /taken/.test(r.data.error));
r = await call('PUT', '/settings?calendar=maya-chen', { 'x-session': maya2 }, { slug: 'api' });
ok('so is a word the site uses', r.status === 400);
r = await call('PUT', '/settings?calendar=maya-chen', { 'x-session': maya2 }, { slug: 'maya' });
ok('a free one is taken on', r.status === 200 && r.data.slug === 'maya');
r = await call('GET', '/events' + week + '&calendar=maya', { 'x-session': maya2 });
ok('and the calendar answers there', r.status === 200 && r.data.mode === 'admin' && r.data.events.length === 1, JSON.stringify(r.data));
r = await call('GET', '/events' + week + '&calendar=maya-chen');
ok('while the old address is free again', r.status === 404);
r = await call('POST', '/signup', {}, { email: 'second@example.com', password: 'second-pass', displayName: 'Maya Chen' });
ok('a second Maya Chen gets the old address back, since it is free', r.status === 201 && r.data.account.slug === 'maya-chen', JSON.stringify(r.data.account));
r = await call('POST', '/signup', {}, { email: 'third@example.com', password: 'third-pass!', displayName: 'Maya Chen' });
ok('a third gets a numbered one', r.status === 201 && r.data.account.slug === 'maya-chen-2', JSON.stringify(r.data.account));
r = await call('POST', '/signup', {}, { email: 'fourth@example.com', password: 'fourth-pass', displayName: 'Anyone', slug: 'maya' });
ok('a chosen address that is taken is refused up front', r.status === 400 && /taken/.test(r.data.error));

// ---- password reset
sent.length = 0;
r = await call('POST', '/forgot', {}, { email: 'nobody@example.com' });
ok('forgot for an unknown email answers the same as for a known one', r.status === 200 && /on its way/.test(r.data.message) && sent.length === 0);
r = await call('POST', '/forgot', {}, { email: 'maya@example.com' });
ok('a known one gets an email', r.status === 200 && sent.length === 1 && /Reset/.test(sent[0].subject));
const resetLink = linkIn(sent[0]);
r = await call('POST', '/reset', {}, { token: param(resetLink, 'reset'), password: 'short' });
ok('a reset needs a proper password', r.status === 400);
r = await call('POST', '/reset', {}, { token: param(resetLink, 'reset'), password: 'maya-pass-2' });
ok('the code and a new password sign the device in', r.status === 200 && typeof r.data.token === 'string');
const maya3 = r.data.token;
r = await call('GET', '/me', { 'x-session': maya2 });
ok('every older session is signed out', r.status === 401);
r = await call('GET', '/me', { 'x-session': maya3 });
ok('the new one works', r.status === 200);
r = await call('POST', '/login', {}, { email: 'maya@example.com', password: 'maya-pass-1' });
ok('the old password no longer does', r.status === 401);
r = await call('POST', '/reset', {}, { token: param(resetLink, 'reset'), password: 'maya-pass-3' });
ok('a reset code works once', r.status === 400);

r = await call('POST', '/account/password', { 'x-session': maya3 }, { current: 'wrong', password: 'maya-pass-4' });
ok('changing the password needs the current one', r.status === 401);
r = await call('POST', '/account/password', { 'x-session': maya3 }, { current: 'maya-pass-2', password: 'maya-pass-4' });
ok('and then signs everything else out', r.status === 200 && (await call('GET', '/me', { 'x-session': maya3 })).status === 401 && (await call('GET', '/me', { 'x-session': r.data.token })).status === 200);

// ---- claiming the first calendar
r = await call('POST', '/signup', {}, { email: 'ethan@example.com', password: 'ethan-pass-1', displayName: 'Ethan', adminPassword: 'nope' });
ok('the first calendar needs the right admin password', r.status === 401);
r = await call('POST', '/signup', {}, { email: 'ethan@example.com', password: 'ethan-pass-1', displayName: 'Ethan', adminPassword: 'nope' });
ok('five sign-ups an hour from one address is the limit', r.status === 429, JSON.stringify(r.data));
const home = { 'x-forwarded-for': '10.0.0.2, 10.0.0.1' };
r = await call('POST', '/signup', home, { email: 'ethan@example.com', password: 'ethan-pass-1', displayName: 'Ethan', adminPassword: 'admin-pw' });
ok('with it, the account takes over the first calendar', r.status === 201 && r.data.account.slug === 'ethan', JSON.stringify(r.data));
const ethan = r.data.token;
r = await call('GET', '/events' + week + '&calendar=ethan', { 'x-session': ethan });
ok('with everything it had', r.data.mode === 'admin' && r.data.events.length === 1 && r.data.events[0].title === 'Noah' && r.data.calendar.claimed === true);
ok('and it stays public before the email is confirmed', (await call('GET', '/events' + week + '&calendar=ethan')).status === 200);
r = await call('GET', '/settings?calendar=ethan', { 'x-session': ethan });
ok('the notification address is filled in from the account', r.data.settings.notificationEmail === 'ethan@example.com');
r = await call('GET', '/events' + week, { 'x-admin-password': 'admin-pw' });
ok('the admin password alone no longer opens it', r.data.mode === 'public');
r = await call('POST', '/signup', home, { email: 'other@example.com', password: 'other-pass-1', displayName: 'Other', adminPassword: 'admin-pw' });
ok('nor can it be claimed twice', r.status === 409);

// ---- rate limits
for (let i = 0; i < 20; i++) await call('POST', '/login', {}, { email: `x${i}@example.com`, password: 'nope-nope' });
r = await call('POST', '/login', {}, { email: 'maya@example.com', password: 'maya-pass-4' });
ok('too many logins from one address are held off', r.status === 429 && /try again/.test(r.data.error), JSON.stringify(r.data));
const store = getStore('tutoring-availability');
for (let i = 0; i < 12; i++) await call('POST', '/requests', {}, { name: 'A', email: 'a@example.com', subject: 'Math', format: 'Online', start: '2031-01-08T10:00', end: '2031-01-08T11:00', recurrence: null });
r = await call('POST', '/requests', {}, { name: 'A', email: 'a@example.com', subject: 'Math', format: 'Online', start: '2031-01-08T10:00', end: '2031-01-08T11:00', recurrence: null });
ok('so are session requests', r.status === 429, JSON.stringify(r.data));
ok('the counts live in storage, not memory', await store.get('rl/login/unknown', { type: 'json' }) !== null);

fake.close();
console.log(fails.length ? '\nFAILED:\n  ' + fails.join('\n  ') : `\naccounts: all ${ran} checks passed`);
process.exit(fails.length ? 1 : 0);
