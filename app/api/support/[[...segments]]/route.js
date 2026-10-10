import { env } from 'cloudflare:workers';
import { customerTicket } from '../../../../lib/admin-service.mjs';
export const dynamic = 'force-dynamic';
async function handle(request,context) { try { const {segments=[]}=await context.params; return await customerTicket(env,request,segments); } catch(error) { return Response.json({error:error.status?error.message:'暂时无法提交工单。'},{status:error.status||500}); } }
export async function GET(request,context) { return handle(request,context); }
export async function POST(request,context) { return handle(request,context); }
