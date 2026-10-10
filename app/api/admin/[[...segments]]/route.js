import { env } from 'cloudflare:workers';
import { adminRequest } from '../../../../lib/admin-service.mjs';
export const dynamic = 'force-dynamic';
async function handle(request, context) { const { segments = [] } = await context.params; return adminRequest(env, request, segments); }
export async function GET(request, context) { return handle(request, context); }
export async function POST(request, context) { return handle(request, context); }
