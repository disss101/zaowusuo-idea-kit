import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { adminIdentity } from '../../lib/admin-service.mjs';
import AdminConsole from './AdminConsole';
import './admin.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: '造物所 · Maker Console' };

export default async function AdminPage() {
  const headerBag = await headers();
  const identity = await adminIdentity(env, new Request('https://site.local/admin', { headers: headerBag })).catch(() => null);
  if (!identity) return <main className="admin-gate"><div className="admin-gate-mark">✳</div><p>造物所 · Maker Console</p><h1>员工工作台</h1><p>请使用已授权的 ChatGPT 员工账号登录。</p><a href="/signin-with-chatgpt?return_to=%2Fadmin">员工登录 ↗</a><a className="admin-gate-back" href="/index.html">返回网站</a></main>;
  return <AdminConsole />;
}
