/**
 * Экспорт: скачивание файлов, PNG из SVG, CSV-таблицы, буфер обмена.
 * Всё клиентское, без зависимостей.
 */

/** Скачать готовый Blob как файл. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Скачать текстовый файл (CSV, LaTeX, …). */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/** Безопасное имя файла из заголовка/формулы. */
export function safeFilename(name: string, fallback: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-яё._-]+/gi, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

/** Копировать текст (Clipboard API, fallback — скрытый textarea). */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fallback ниже */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Столбцы чисел → CSV (NaN/null — пустая ячейка). */
export function columnsToCsv(headers: string[], columns: (number | null)[][]): string {
  const esc = (v: string): string => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cell = (v: number | null | undefined): string =>
    typeof v === 'number' && isFinite(v) ? String(v) : '';
  const n = Math.max(0, ...columns.map((c) => c.length));
  const lines = [headers.map(esc).join(',')];
  for (let k = 0; k < n; k++) {
    lines.push(columns.map((c) => cell(c[k])).join(','));
  }
  return lines.join('\n');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Отрендеренный <svg> → PNG-файл (scale 2 по умолчанию для чёткости).
 * Добавляет viewBox и фон, чтобы PNG совпадал с видом на экране.
 */
export async function exportSvgElementToPng(
  svg: SVGSVGElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const w = Math.max(1, Math.round(Number(svg.getAttribute('width')) || svg.clientWidth || 600));
  const h = Math.max(1, Math.round(Number(svg.getAttribute('height')) || svg.clientHeight || 400));
  const bg = svg.style.backgroundColor || getComputedStyle(svg).backgroundColor;
  const opaque = bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(w * scale));
  clone.setAttribute('height', String(h * scale));
  clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  clone.setAttribute('font-family', 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif');
  if (opaque) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', bg);
    clone.insertBefore(rect, clone.firstChild);
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg-to-png'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('svg-to-png');
    if (opaque) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('svg-to-png');
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
