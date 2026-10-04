/**
 * Экспорт листа в отчёт для лабораторных: Markdown и standalone LaTeX.
 * Берём уже посчитанные блоки (displayLatex/resultLatex/resultStr),
 * формулы идут как математика, комментарии — как разделы.
 * Учитывает visibility: hide — пропуск, input — только ввод,
 * result — только результат.
 */
import type { MathBlockData } from '../engine/dependencies';
import { isReportVisible, visibilityOf } from './blocks';
import { downloadTextFile } from './exportFiles';

function sortedBlocks(blocks: Record<string, MathBlockData>): MathBlockData[] {
  return Object.values(blocks)
    .filter(isReportVisible)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
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

function showInput(b: MathBlockData): boolean {
  return visibilityOf(b) !== 'result';
}

function showResult(b: MathBlockData): boolean {
  return visibilityOf(b) !== 'input';
}

/** Короткое описание графика для отчёта (заголовок/функция/единицы осей). */
function plotCaption(b: MathBlockData): string {
  const fn = (b.plotFn ?? '').trim().slice(0, 200);
  const title = (b.plotTitle ?? '').trim().slice(0, 120);
  const head = title || fn || 'plot';
  const units =
    b.plotXUnit || b.plotYUnit ? ` [${b.plotXUnit ?? ''}${b.plotYUnit ? `; ${b.plotYUnit}` : ''}]` : '';
  return `${head}${units}`;
}

/** Лист → Markdown (формулы — $$LaTeX$$, программы — код). */
export function blocksToMarkdown(blocks: Record<string, MathBlockData>): string {
  const out: string[] = ['# NyaMath report', ''];
  for (const b of sortedBlocks(blocks)) {
    const input = showInput(b);
    const result = showResult(b);
    if (b.kind === 'text') {
      const c = commentText(b.rawInput);
      if (c) out.push(`## ${c}`, '');
    } else if (b.kind === 'math' || b.kind === 'program') {
      if (b.error) {
        out.push(`> ⚠ \`${b.rawInput.split('\n')[0]}\`: ${b.error}`, '');
      } else if (b.kind === 'program') {
        if (input) out.push('```', b.rawInput, '```');
        if (result && b.resultStr) out.push(`Result: \`${b.resultStr}\``, '');
        else if (input) out.push('');
      } else {
        const inputLine = (b.displayLatex || b.rawInput).trim();
        const fullLine = mathLine(b);
        if (input && result && fullLine) {
          out.push(`$$${fullLine}$$`);
          if (b.substStr) out.push(`Substitution: \`${b.substStr}\``);
          out.push('');
        } else if (input && !result && inputLine) {
          out.push(`$$${inputLine}$$`, '');
        } else if (!input && result && b.resultStr) {
          // result-only: для isOutput-блоков результат уже включён в строку —
          // показываем голый результат, иначе `Result:` (как для обычных присвоений)
          if (b.isOutput && b.resultLatex) out.push(`$$${b.resultLatex}$$`, '');
          else out.push(`Result: \`${b.resultStr}\``, '');
        }
      }
    } else if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'contour') {
      out.push(`> Plot: \`${plotCaption(b)}\` (see PNG export for the figure)`, '');
    } else if (b.kind === 'sim') {
      const states = (b.simStates ?? '').trim().slice(0, 160) || 'sim';
      const solver = b.simSolver ? ` · ${b.simSolver}` : '';
      const range =
        b.simT0 !== undefined && b.simT1 !== undefined ? ` · t ∈ [${b.simT0}; ${b.simT1}]` : '';
      out.push(`> Simulation: \`${states}\`${solver}${range} (see the app for trajectories)`, '');
    } else if (b.kind === 'slider') {
      const name = b.sliderVar ?? 'k';
      if (input && result) out.push(`$$${name} = ${b.resultStr || '—'}$$\n`);
      else if (input) out.push(`$$${name}$$\n`);
      else if (result) out.push(`$$= ${b.resultStr || '—'}$$\n`);
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
    const input = showInput(b);
    const result = showResult(b);
    if (b.kind === 'text') {
      const c = commentText(b.rawInput);
      if (c) out.push(`\\section*{${esc(c)}}`, '');
    } else if (b.kind === 'math') {
      if (b.error) {
        out.push(`% skipped (error): ${esc(b.rawInput.split('\n')[0])}`, '');
      } else {
        const line = input ? mathLine(b) : '';
        if (line && result) out.push(`\\[${line}\\]`, '');
        else if (line) out.push(`% input only: \\[${line}\\]`, '');
        else if (result && b.resultStr) out.push(`\\[${esc(b.resultStr)}\\]`, '');
      }
    } else if (b.kind === 'program') {
      if (input) out.push('\\begin{verbatim}', b.rawInput, '\\end{verbatim}', '');
      if (result && b.resultStr) out.push(`Result: \\verb|${b.resultStr.slice(0, 200)}|`, '');
    } else if (b.kind === 'slider') {
      const name = esc(b.sliderVar ?? 'k');
      if (input && result) out.push(`\\[${name} = ${esc(b.resultStr || '-')}\\]`, '');
      else if (input) out.push(`% slider ${name} (input only)`, '');
      else if (result) out.push(`\\[${esc(b.resultStr || '-')}\\]`, '');
    } else if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'contour') {
      out.push(`% figure: ${esc(plotCaption(b))}`, '');
    } else if (b.kind === 'sim') {
      out.push(`% simulation: ${esc((b.simStates ?? 'sim').slice(0, 160))}`, '');
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
