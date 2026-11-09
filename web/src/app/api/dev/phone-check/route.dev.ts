import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reportFileName, type Report } from '@/domain/phoneCheck';

// Development only (a `.dev` file: a production build has no such route). Writes a phone check report to the system temp folder, outside the repo.
const MAX_BYTES = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== host) return new Response('wrong origin', { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response('too large', { status: 413 });
  let report: Report;
  try { report = JSON.parse(text) as Report; } catch { return new Response('not json', { status: 400 }); }
  if (typeof report.page !== 'string' || typeof report.at !== 'string' || !Array.isArray(report.steps)) return new Response('not a report', { status: 400 });
  const dir = join(tmpdir(), 'phone-checks');
  mkdirSync(dir, { recursive: true });
  const file = reportFileName(report.page, report.at);
  writeFileSync(join(dir, file), JSON.stringify(report, null, 1));
  return Response.json({ file: join(dir, file) });
}
