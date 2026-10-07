const encoder = new TextEncoder();
const cookieName = 'idea_kit_session';
const sessionSeconds = 7 * 24 * 60 * 60;
const iterations = 210000;

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function hex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function unhex(value) { return new Uint8Array(value.match(/.{2}/g).map(part => Number.parseInt(part, 16))); }
async function sha(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('请输入有效的邮箱地址。');
  return email;
}
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new AuthError('密码需要 12–128 个字符。');
  return value;
}
function validatePhone(value) {
  const phone = String(value || '').trim();
  if (phone && !/^\+?[0-9\s()-]{7,24}$/.test(phone)) throw new AuthError('联系电话格式不正确。');
  return phone;
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations, hash: 'SHA-256' }, key, 256)));
}
function constantTimeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookie(token, maxAge) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
async function startSession(bucket, accountKey) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const key = `auth/sessions/${await sha(token)}.json`;
  await bucket.put(key, JSON.stringify({ accountKey, expiresAt: Date.now() + sessionSeconds * 1000 }));
  return cookie(token, sessionSeconds);
}
export async function register(bucket, input) {
  const email = normalizeEmail(input?.email);
  const password = validatePassword(input?.password);
  const phone = validatePhone(input?.phone);
  const accountKey = `auth/accounts/${await sha(email)}.json`;
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const account = { id: crypto.randomUUID(), email, phone, emailVerified: false, password: await passwordHash(password, salt), salt, createdAt: new Date().toISOString() };
  const created = await bucket.put(accountKey, JSON.stringify(account), { onlyIf: new Headers({ 'If-None-Match': '*' }) });
  if (!created) throw new AuthError('这个邮箱已注册，请直接登录。', 409);
  return { profile: publicProfile(account), setCookie: await startSession(bucket, accountKey) };
}
export async function login(bucket, input) {
  const email = normalizeEmail(input?.email);
  const password = validatePassword(input?.password);
  const emailHash = await sha(email);
  const accountKey = `auth/accounts/${emailHash}.json`;
  const failureKey = `auth/login-fail/${emailHash}.json`;
  const savedFailures = await bucket.get(failureKey);
  const failures = savedFailures ? await savedFailures.json() : { count: 0, until: 0 };
  if (failures.until > Date.now() && failures.count >= 5) throw new AuthError('登录尝试过多，请 15 分钟后再试。', 429);
  const stored = await bucket.get(accountKey);
  const account = stored && await stored.json();
  const salt = account?.salt || '00000000000000000000000000000000';
  const computed = await passwordHash(password, salt);
  if (!account || !constantTimeEqual(computed, account.password)) {
    await bucket.put(failureKey, JSON.stringify({ count: failures.until > Date.now() ? failures.count + 1 : 1, until: Date.now() + 15 * 60 * 1000 }));
    throw new AuthError('邮箱或密码不正确。', 401);
  }
  await bucket.delete(failureKey);
  return { profile: publicProfile(account), setCookie: await startSession(bucket, accountKey) };
}
export async function sessionAccount(bucket, request) {
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sessionKey = `auth/sessions/${await sha(token)}.json`;
  const stored = await bucket.get(sessionKey);
  if (!stored) return null;
  const session = await stored.json();
  if (session.expiresAt < Date.now()) { await bucket.delete(sessionKey); return null; }
  const accountObject = await bucket.get(session.accountKey);
  if (!accountObject) return null;
  return { account: await accountObject.json(), accountKey: session.accountKey, sessionKey, etag: accountObject.etag };
}
export async function logout(bucket, request) {
  const session = await sessionAccount(bucket, request);
  if (session) await bucket.delete(session.sessionKey);
  return cookie('', 0);
}
export async function updatePhone(bucket, session, phoneInput) {
  const phone = validatePhone(phoneInput);
  const account = { ...session.account, phone };
  const updated = await bucket.put(session.accountKey, JSON.stringify(account), { onlyIf: { etagMatches: session.etag } });
  if (!updated) throw new AuthError('资料已更新，请刷新后重试。', 409);
  return publicProfile(account);
}
export function publicProfile(account) {
  return { id: account.id, email: account.email, phone: account.phone, emailVerified: account.emailVerified, displayName: account.email.split('@')[0], mode: 'email' };
}
