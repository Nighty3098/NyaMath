/**
 * Экспорт листа в отчёт для лабораторных: Markdown и standalone LaTeX.
 * Берём уже посчитанные блоки (displayLatex/resultLatex/resultStr),
 * формулы идут как математика, комментарии — как разделы.
 */
import type { MathBlockData } from '../engine/dependencies';
import { downloadTextFile } from './exportFiles';

function sortedBlocks(blocks: Record<string, MathBlockData>): MathBlockData[] {
  return Object.values(blocks).sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function commentText(raw: string): string {
  return raw.replace(/^(\/\/|#)\s?/, '').trim();
}

/** Готовая формула с результатом или пусто (пустые/битые без результата пропускаем молча). */
function mathLine(b: MathBlockData): string {
  const lhs = (b.displayLatex || b.rawInput).trim();
  if (!lhs) return '';
  if (b.isOutput && b.resultLatex) return `${lhs} ${b.resultLatex}`;
  return lhs;
}

/** Лист → Markdown (формулы — $$LaTeX$$, программы — код). */
export function blocksToMarkdown(blocks: Record<string, MathBlockData>): string {
  const out: string[] = ['# NyaMath report', ''];
  for (const b of sortedBlocks(blocks)) {
    if (b.kind === 'text') {
      const c = commentText(b.rawInput);
      if (c) out.push(`## ${c}`, '');
    } else if (b.kind === 'math' || b.kind === 'program') {
      if (b.error) {
        out.push(`> ⚠ \`${b.rawInput.split('\n')[0]}\`: ${b.error}`, '');
      } else if (b.kind === 'program') {
        out.push('```', b.rawInput, '```', b.resultStr ? `Result: \`${b.resultStr}\`` : '', '');
      } else {
        const line = mathLine(b);
        if (line)
          out.push(
            `$$${line}$$`,
            b.resultStr && !b.isOutput ? `Result: \`${b.resultStr}\`` : '',
            '',
          );
      }
    } else if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'contour') {
      out.push(`> Plot: \`${b.plotFn ?? ''}\` (see PNG export for the figure)`, '');
    } else if (b.kind === 'sim') {
      out.push(`> Simulation: \`${b.simStates ?? ''}\` (see the app for trajectories)`, '');
    } else if (b.kind === 'slider') {
      out.push(`$$${b.sliderVar ?? 'k'} = ${b.resultStr || '—'}$$\n`);
    }
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

/** Лист → standalone LaTeX-статья (amsmath). */
export function blocksToLatex(blocks: Record<string, MathBlockData>): string {
  const out: string[] = [
    '\\documentclass[a4paper,12pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{amsmath}',
    '\\begin{document}',
    '',
  ];
  const esc = (s: string): string => s.replace(/([&%$#_{}])/g, '\\$1');
  for (const b of sortedBlocks(blocks)) {
    if (b.kind === 'text') {
      const c = commentText(b.rawInput);
      if (c) out.push(`\\section*{${esc(c)}}`, '');
    } else if (b.kind === 'math') {
      if (b.error) {
        out.push(`% skipped (error): ${esc(b.rawInput.split('\n')[0])}`, '');
      } else {
        const line = mathLine(b);
        if (line) out.push(`\\[${line}\\]`, '');
      }
    } else if (b.kind === 'program') {
      out.push('\\begin{verbatim}', b.rawInput, '\\end{verbatim}', '');
    } else if (b.kind === 'slider') {
      out.push(`\\[${esc(b.sliderVar ?? 'k')} = ${esc(b.resultStr || '-')}\\]`, '');
    }
  }
  out.push('\\end{document}', '');
  return out.join('\n');
}

export function downloadMarkdown(blocks: Record<string, MathBlockData>): void {
  downloadTextFile('nyamath-report.md', blocksToMarkdown(blocks), 'text/markdown;charset=utf-8');
}

export function downloadLatexReport(blocks: Record<string, MathBlockData>): void {
  downloadTextFile('nyamath-report.tex', blocksToLatex(blocks), 'text/x-tex;charset=utf-8');
}
