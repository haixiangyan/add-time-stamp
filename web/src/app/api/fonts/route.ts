import { NextResponse } from 'next/server';
import { FONT_NAMES } from '@/lib/server/font-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Fonts are bundled with the app (not read from the OS), so the list is the
  // same on every environment — what you pick is exactly what gets rendered.
  return NextResponse.json({ fonts: FONT_NAMES, ready: true });
}
