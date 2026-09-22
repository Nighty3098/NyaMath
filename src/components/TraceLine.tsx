import { useMemo } from 'react';
import katex from 'katex';
import { traceLineToLatex } from '../lib/traceLatex';

/**
 * TraceLine — одна строка «шагов решателя», отрендеренная KaTeX
 * (тем же рендером, что основная строка блока).
 *
 * Первая строка блока (подпись вызова) — крупнее: там интеграл/уравнение
 * с результатом. Остальные (итерации) — компактнее. Сырой текст строки
 * дублируется в aria-label (читалки/поиск), сам LaTeX — только вид.
 */
export function TraceLine({ line, prominent }: { line: string; prominent?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(traceLineToLatex(line, prominent === true), {
        throwOnError: false,
        displayMode: false,
        strict: false,
      });
    } catch {
      return '';
    }
  }, [line, prominent]);
  return (
    <div
      aria-label={line}
      className={`max-w-full overflow-x-auto py-px ${prominent ? 'text-[14px]' : 'text-[13px]'}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
