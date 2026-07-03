import { NextResponse } from 'next/server';
import { stampPreviewBuffer, DEFAULT_COLOR, DEFAULT_FONT, type StampOptions } from '@/lib/server/stamp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStr(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === 'string' ? v : null;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

    const opts: StampOptions = {
      font: getStr(form, 'font') || DEFAULT_FONT,
      fonts: getStr(form, 'fonts') ? JSON.parse(getStr(form, 'fonts')!) : null,
      color: getStr(form, 'color') || DEFAULT_COLOR,
      position: getStr(form, 'position') || 'bottom-right',
      dateSource: getStr(form, 'dateSource') || 'auto',
      fallbackDate: getStr(form, 'fileDate') || null,
      offsetX: Number(getStr(form, 'offsetX')) || 0,
      offsetY: Number(getStr(form, 'offsetY')) || 0,
    };
    const fsStr = getStr(form, 'fontSize');
    if (fsStr) opts.fontSize = Number(fsStr);

    const buf = Buffer.from(await file.arrayBuffer());
    const { buffer, label, font, fontSize } = await stampPreviewBuffer(buf, file.name, opts);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'X-Stamp-Label': label,
        'X-Stamp-Font': font,
        'X-Stamp-Font-Size': String(fontSize),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
