/**
 * Экспорт листа в Word-совместимый `.doc` (Word-HTML: открывает Word/LibreOffice
 * без конвертеров; zero-deps — настоящий .docx с OMML требует zip-библиотеку
 * и вынесен в бэклог). Формулы — текстом `raw = result`, графики — подписями
 * (фигуры забираются через PNG-экспорт из приложения).
 */
import type { MathBlockData } from '../engine/dependencies';
import { downloadTextFile } from './exportFiles';

function sortedBlocks(blocks: Record<string, MathBlockData>): MathBlockData[] {
  return Object.values(blocks).sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function commentText(raw: string): string {
  return raw.replace(/^(\/\/|#)\s?/, '').trim();
}

/** Одна формула: `raw = result` или предупреждение об ошибке. */
function mathPara(b: MathBlockData): string {
  const raw = esc(b.rawInput.trim().split('\n').join(' ')).slice(0, 500) || '—';
  if (b.error) return `<p class="err">⚠ ${raw}: ${esc(b.error).slice(0, 300)}</p>`;
  const res = (b.resultStr || '').trim();
  return `<p class="math">${raw}${res ? ` = ${esc(res).slice(0, 300)}` : ''}</p>`;
}

/** Лист → Word-HTML документ (MIME application/msword, расширение .doc). */
export function blocksToWordHtml(blocks: Record<string, MathBlockData>, lang: 'ru' | 'en' = 'ru'): string {
  const L = lang === 'ru';
  const title = 'NyaMath report';
  const date = new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
  const body: string[] = [`<h1>${esc(title)}</h1>`, `<p class="meta">${esc(date)}</p>`];
  for (const b of sortedBlocks(blocks)) {
    if (b.kind === 'text') {
      const c = commentText(b.rawInput);
      if (c) body.push(`<h2>${esc(c).slice(0, 200)}</h2>`);
    } else if (b.kind === 'math' || b.kind === 'program' || b.kind === 'slider') {
      if (b.kind === 'program') {
        body.push(`<pre>${esc(b.rawInput).slice(0, 2000)}</pre>`);
        if ((b.resultStr || '').trim()) body.push(`<p class="math">→ ${esc(b.resultStr.trim()).slice(0, 300)}</p>`);
        else if (b.error) body.push(`<p class="err">⚠ ${esc(b.error).slice(0, 300)}</p>`);
      } else if (b.kind === 'slider') {
        body.push(`<p class="math">${esc(b.sliderVar ?? 'k')} = ${esc((b.resultStr || '—').slice(0, 120))}</p>`);
      } else {
        body.push(mathPara(b));
      }
    } else if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'contour') {
      body.push(`<p class="fig">[${L ? 'Рисунок' : 'Figure'}: ${esc((b.plotFn ?? '').slice(0, 200))}]</p>`);
    } else if (b.kind === 'sim') {
      body.push(`<p class="fig">[${L ? 'Моделирование' : 'Simulation'}: ${esc((b.simStates ?? '').slice(0, 120))}]</p>`);
    }
  }
  return [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->',
    '<style>',
    'body{font-family:"Cambria","Times New Roman",serif;font-size:12pt;}',
    'h1{font-size:18pt;}h2{font-size:14pt;margin-top:18pt;}',
    'p.math{font-family:"Consolas","Courier New",monospace;font-size:11pt;margin:4pt 0;}',
    'p.err{color:#B00020;}pre{font-size:10pt;background:#F2F2F2;padding:6pt;}',
    'p.fig{color:#595959;font-style:italic;}p.meta{color:#595959;}',
    '</style></head><body>',
    ...body,
    '</body></html>',
    '',
  ].join('\n');
}

export function downloadWordDoc(blocks: Record<string, MathBlockData>, lang: 'ru' | 'en' = 'ru'): void {
  downloadTextFile('nyamath-report.doc', blocksToWordHtml(blocks, lang), 'application/msword;charset=utf-8');
}
