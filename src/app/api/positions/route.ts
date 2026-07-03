import { NextResponse } from 'next/server';
import { POSITIONS } from '@/lib/server/stamp';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ positions: POSITIONS });
}
