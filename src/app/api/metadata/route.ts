import { NextResponse } from 'next/server';
import { extractMetadata, formatDate } from '@/lib/server/stamp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const fileDate = form.get('fileDate');
    if (!(file instanceof File)) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const meta = await extractMetadata(buf);
    if (!meta.stampDate && typeof fileDate === 'string' && fileDate) {
      const d = new Date(fileDate);
      if (!isNaN(d.getTime())) meta.stampDate = formatDate(d);
    }
    return NextResponse.json(meta);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
