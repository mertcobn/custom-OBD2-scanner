import { strToU8, zipSync } from 'fflate';
import type { Language } from '@/state/settings';
import type { UnitPrefs } from '@/units/units';
import { formatTrafficLog, trafficLog } from '@/obd/services/realBackend';
import { fileStem, type Dataset } from './dataset';
import { toAiReadme, toJson, toLongCsv, toSummaryMarkdown, toTimelineCsv } from './formats';

export type ExportKind = 'pdf' | 'ai' | 'csv';

export interface ExportFile {
  blob: Blob;
  filename: string;
}

export function buildAiPack(d: Dataset, lang: Language): ExportFile {
  const files: Record<string, Uint8Array> = {
    'README.md': strToU8(toAiReadme(d)),
    'summary.md': strToU8(toSummaryMarkdown(d, lang)),
    'session.json': strToU8(JSON.stringify(toJson(d, lang), null, 1)),
  };
  // The adapter conversation helps diagnose connection problems; it contains no personal data beyond the VIN.
  if (trafficLog.length) files['adapter_log.txt'] = strToU8(formatTrafficLog(trafficLog));
  if (d.kind === 'recording') {
    files['samples_long.csv'] = strToU8(toLongCsv(d));
    files['timeline.csv'] = strToU8(toTimelineCsv(d));
  }
  const zip = zipSync(files, { level: 6 });
  return { blob: new Blob([zip as BlobPart], { type: 'application/zip' }), filename: `${fileStem(d)}-ai.zip` };
}

export async function buildExport(kind: ExportKind, d: Dataset, opts: { lang: Language; units: UnitPrefs }): Promise<ExportFile> {
  if (kind === 'ai') return buildAiPack(d, opts.lang);
  if (kind === 'csv') {
    // BOM so Excel opens UTF-8 (°, λ, Turkish letters) correctly.
    return { blob: new Blob(['﻿', toTimelineCsv(d)], { type: 'text/csv;charset=utf-8' }), filename: `${fileStem(d)}.csv` };
  }
  const { buildPdf } = await import('./pdf');
  return { blob: await buildPdf(d, opts), filename: `${fileStem(d)}.pdf` };
}

export function download({ blob, filename }: ExportFile): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Native share sheet on phones (send to WhatsApp, mail, Drive…), when the browser can share files. */
export function canShareFiles(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [new File([''], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export async function share({ blob, filename }: ExportFile): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  try {
    await navigator.share({ files: [file], title: filename });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    download({ blob, filename });
  }
}
