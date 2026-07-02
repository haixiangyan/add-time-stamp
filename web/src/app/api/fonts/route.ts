import { NextResponse } from 'next/server';
import { getFontsPayload, preloadFonts } from '@/lib/server/fonts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  preloadFonts();
  return NextResponse.json(getFontsPayload());
}
