import { NextResponse } from 'next/server';
import { recordPing, status } from '../../../lib/domain/spike.ts';
import { PingBody, issuesToMessages } from '../../../lib/contracts/spike.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() { return NextResponse.json(status()); }

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = PingBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: 'validation', issues: issuesToMessages(parsed.error) } }, { status: 400 });
  return NextResponse.json(recordPing(parsed.data));
}
