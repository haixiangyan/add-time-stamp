import { NextResponse } from 'next/server';
import { ZipArchive } from 'archiver';
import { stampBuffer, DEFAULT_COLOR, DEFAULT_FONT, type StampOptions } from '@/lib/server/stamp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getStr(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === 'string' ? v : null;
}

function getAllFiles(form: FormData): File[] {
  const out: File[] = [];
  for (const v of form.getAll('files')) {
    if (v instanceof File) out.push(v);
  }
  return out;
}

// Process up to `limit` images at once so sharp's decode/encode work overlaps
// instead of running strictly one file at a time. Results keep input order.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = getAllFiles(form);
    if (!files.length) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

    const baseOpts: StampOptions = {
      font: getStr(form, 'font') || DEFAULT_FONT,
      fonts: getStr(form, 'fonts') ? JSON.parse(getStr(form, 'fonts')!) : null,
      color: getStr(form, 'color') || DEFAULT_COLOR,
      position: getStr(form, 'position') || 'bottom-right',
      dateSource: getStr(form, 'dateSource') || 'auto',
      quality: Number(getStr(form, 'quality')) || 100,
      offsetX: Number(getStr(form, 'offsetX')) || 0,
      offsetY: Number(getStr(form, 'offsetY')) || 0,
    };
    const fsStr = getStr(form, 'fontSize');
    if (fsStr) baseOpts.fontSize = Number(fsStr);
    const padStr = getStr(form, 'padding');
    if (padStr) baseOpts.padding = Number(padStr);

    const fileDates: string[] = getStr(form, 'fileDates')
      ? JSON.parse(getStr(form, 'fileDates')!)
      : [];

    if (files.length === 1) {
      baseOpts.fallbackDate = fileDates[0] || null;
      const buf = Buffer.from(await files[0].arrayBuffer());
      const { buffer, outName } = await stampBuffer(buf, files[0].name, baseOpts);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(outName)}"`,
        },
      });
    }

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    type Processed =
      | { ok: true; outName: string; buffer: Buffer; result: unknown }
      | { ok: false; result: unknown };

    const processed = await mapLimit<File, Processed>(files, 4, async (file, i) => {
      const opts: StampOptions = { ...baseOpts, fallbackDate: fileDates[i] || null, fontIndex: i };
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const { buffer, outName, label, font } = await stampBuffer(buf, file.name, opts);
        return { ok: true, outName, buffer, result: { name: file.name, ok: true, label, outName, font } };
      } catch (e) {
        return { ok: false, result: { name: file.name, ok: false, error: (e as Error).message } };
      }
    });

    const results: unknown[] = [];
    for (const p of processed) {
      if (p.ok) archive.append(p.buffer, { name: p.outName });
      results.push(p.result);
    }
    archive.append(JSON.stringify(results, null, 2), { name: '_manifest.json' });
    await archive.finalize();
    await done;

    const zip = Buffer.concat(chunks);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="time-stamp-export.zip"',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
