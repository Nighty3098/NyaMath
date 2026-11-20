/**
 * Чтение контейнеров Mathcad (.xmcd / .xmcdz / .mcdx).
 *
 * .xmcd  — обычный XML (Mathcad 15, worksheet30/math30; Prime может писать
 *          worksheet50/math50 в том же расширении).
 * .xmcdz — gzip-сжатый тот же XML.
 * .mcdx  — ZIP (Prime), внутри `mathcad/worksheet.xml`; текст регионов лежит
 *          в XAML-пакетах и сюда не переносится (даём честную заметку).
 *
 * Модуль не использует DOM-API: работает и в браузере, и в node (MCP).
 */
import { parseXmcd, type ImportResult } from './importDoc.js';

export interface MathcadXmlRead {
  xml: string;
  /** Подтип файла — только для заметок/диагностики. */
  container: 'xml' | 'gzip' | 'zip';
  notes: string[];
}

/* Минимальные типы, чтобы модуль компилировался и с lib DOM, и без него. */
interface DecompressReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}
interface DecompressWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface DecompressStreamLike {
  readable: { getReader(): DecompressReader };
  writable: { getWriter(): DecompressWriter };
}
type DecompressCtor = new (format: string) => DecompressStreamLike;

function getDecompressor(format: string): DecompressStreamLike {
  const Ctor = (
    globalThis as unknown as { DecompressionStream?: DecompressCtor }
  ).DecompressionStream;
  if (!Ctor) throw new Error('DecompressionStream недоступен в этой среде');
  return new Ctor(format);
}

async function inflate(bytes: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const ds = getDecompressor(format);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  // Читаем параллельно с записью: иначе большой поток упрется в backpressure
  // writable-стороны, а reader так и не начнёт вычитывать данные.
  let writeError: unknown = null;
  const writeP = (async () => {
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (e) {
      writeError = e;
      await reader.cancel().catch(() => undefined);
    }
  })();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await writeP;
  if (writeError) throw writeError;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function utf8(bytes: Uint8Array): string {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start));
}

function le16(b: Uint8Array, p: number): number {
  return (b[p] as number) | ((b[p + 1] as number) << 8);
}
function le32(b: Uint8Array, p: number): number {
  return (
    (b[p] as number) |
    ((b[p + 1] as number) << 8) |
    ((b[p + 2] as number) << 16) |
    ((b[p + 3] as number) << 24)
  ) >>> 0;
}

/** Достаём `mathcad/worksheet.xml` из ZIP (Prime .mcdx). ZIP64 не нужен. */
async function readZipWorksheet(bytes: Uint8Array): Promise<string> {
  const maxBack = Math.min(bytes.length, 66000);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--) {
    if (le32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: не найден End of Central Directory');
  const count = le16(bytes, eocd + 10);
  let pos = le32(bytes, eocd + 16);
  const target = 'mathcad/worksheet.xml';
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || le32(bytes, pos) !== 0x02014b50) break;
    const method = le16(bytes, pos + 10);
    const csize = le32(bytes, pos + 20);
    const nameLen = le16(bytes, pos + 28);
    const extraLen = le16(bytes, pos + 30);
    const commentLen = le16(bytes, pos + 32);
    const local = le32(bytes, pos + 42);
    const name = utf8(bytes.subarray(pos + 46, pos + 46 + nameLen));
    if (name === target || name.toLowerCase().endsWith('/worksheet.xml')) {
      if (local + 30 > bytes.length || le32(bytes, local) !== 0x04034b50)
        throw new Error('ZIP: битый локальный заголовок');
      const lnLen = le16(bytes, local + 26);
      const lxLen = le16(bytes, local + 28);
      const data = bytes.subarray(local + 30 + lnLen + lxLen, local + 30 + lnLen + lxLen + csize);
      if (method === 0) return utf8(data);
      if (method === 8) return utf8(await inflate(data, 'deflate-raw'));
      throw new Error(`ZIP: метод сжатия ${method} не поддерживается`);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('ZIP: внутри нет mathcad/worksheet.xml');
}

/** Файл → XML-текст worksheets. */
export async function readMathcadXml(
  bytes: Uint8Array,
  name = '',
): Promise<MathcadXmlRead> {
  const notes: string[] = [];
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const isZip =
    bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5 || bytes[2] === 7);
  if (isGzip) {
    notes.push('.xmcdz: gzip-контейнер распакован');
    return { xml: utf8(await inflate(bytes, 'gzip')), container: 'gzip', notes };
  }
  if (isZip) {
    notes.push(
      'Prime .mcdx: взят mathcad/worksheet.xml; текст регионов хранится в XAML-пакетах и не импортируется',
    );
    return { xml: await readZipWorksheet(bytes), container: 'zip', notes };
  }
  if (name.toLowerCase().endsWith('.xmcdz'))
    notes.push('Расширение .xmcdz, но файл не gzip — читаем как обычный XML');
  return { xml: utf8(bytes), container: 'xml', notes };
}

/** Универсальная точка входа: байты файла → готовые блоки импорта. */
export async function parseMathcadFile(bytes: Uint8Array, name = ''): Promise<ImportResult> {
  const read = await readMathcadXml(bytes, name);
  const parsed = parseXmcd(read.xml);
  return { ...parsed, notes: [...read.notes, ...parsed.notes], format: 'xmcd' };
}
