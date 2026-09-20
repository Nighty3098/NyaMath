import type { Lang } from '../i18n';
import { fuzzyScore } from './assistant';

/**
 * Ctrl+K Command Palette (DESIGN.md §5 п.6): команды + переменные в одном
 * месте с fuzzy-поиском. Урок Jupyter: только direct-match — провал,
 * поэтому ранжируем через fuzzyScore (префикс > подстрока > подпосл.).
 */

export type CmdId =
  | 'ins-math' | 'ins-text' | 'ins-plot' | 'ins-contour' | 'ins-3d'
  | 'ins-prog' | 'ins-sim' | 'ins-slider'
  | 'recalc' | 'calc-now' | 'scope-mon'
  | 'ex20' | 'ex-advanced' | 'theme' | 'grid';

export interface CmdSpec {
  id: CmdId;
  ru: string;
  en: string;
  /** дополнительные ключи для fuzzy (синонимы, англ. транслит) */
  keywords: string[];
}

export const COMMANDS: CmdSpec[] = [
  { id: 'ins-math', ru: 'Новый мат-блок', en: 'New math block', keywords: ['math', 'formula', 'мат', 'формула', ':='] },
  { id: 'ins-text', ru: 'Новый текстовый блок', en: 'New text block', keywords: ['text', 'текст', 'заголовок', 'heading'] },
  { id: 'ins-plot', ru: 'Новый 2D-график', en: 'New 2D plot', keywords: ['plot', 'graph', 'график', 'plt'] },
  { id: 'ins-contour', ru: 'Новый контурный график', en: 'New contour plot', keywords: ['contour', 'контур'] },
  { id: 'ins-3d', ru: 'Новый 3D-график', en: 'New 3D plot', keywords: ['3d', 'surface', 'поверхность'] },
  { id: 'ins-prog', ru: 'Новый program-блок', en: 'New program block', keywords: ['program', 'code', 'программа', 'код', 'if', 'for'] },
  { id: 'ins-sim', ru: 'Новая симуляция', en: 'New simulation', keywords: ['sim', 'ode', 'симуляция', 'модель'] },
  { id: 'ins-slider', ru: 'Новый слайдер', en: 'New slider', keywords: ['slider', 'слайдер', 'manipulate', 'bind'] },
  { id: 'recalc', ru: 'Пересчитать всё', en: 'Recalculate all', keywords: ['recalc', 'calc', 'пересчет', 'пересчёт'] },
  { id: 'calc-now', ru: 'Пересчитать видимые', en: 'Recalculate visible', keywords: ['visible', 'now', 'видимые'] },
  { id: 'scope-mon', ru: 'Пульт переменных', en: 'Variable scope monitor', keywords: ['scope', 'monitor', 'пульт', 'телеметрия'] },
  { id: 'ex20', ru: 'Пример: электродинамика', en: 'Example: electrodynamics', keywords: ['example', 'пример', 'variant', 'ex20'] },
  { id: 'ex-advanced', ru: 'Пример: матрицы и программы', en: 'Example: matrices & programs', keywords: ['advanced', 'матрицы', 'демо'] },
  { id: 'theme', ru: 'Переключить тему', en: 'Toggle theme', keywords: ['theme', 'dark', 'тема', 'темная', 'тёмная'] },
  { id: 'grid', ru: 'Переключить сетку', en: 'Toggle grid', keywords: ['grid', 'сетка', 'snap'] },
];

export interface RankedCmd {
  spec: CmdSpec;
  label: string;
  score: number;
}

export function cmdLabel(spec: CmdSpec, lang: Lang): string {
  return lang === 'ru' ? spec.ru : spec.en;
}

/** Ранжированные команды для запроса; пустой запрос — все по порядку. */
export function filterCommands(q: string, lang: Lang, limit = 8): RankedCmd[] {
  const query = q.trim().toLowerCase();
  if (!query) {
    return COMMANDS.map((spec) => ({ spec, label: cmdLabel(spec, lang), score: 1 }));
  }
  const out: RankedCmd[] = [];
  for (const spec of COMMANDS) {
    const label = cmdLabel(spec, lang);
    let best = fuzzyScore(query, label);
    for (const kw of spec.keywords) {
      const s = fuzzyScore(query, kw);
      if (s > best) best = s;
    }
    // запасной вариант: подстрока по второму языку
    if (best <= 0) {
      const other = lang === 'ru' ? spec.en : spec.ru;
      if (other.toLowerCase().includes(query)) best = 1;
    }
    if (best > 0) out.push({ spec, label, score: best });
  }
  out.sort((a, b) => b.score - a.score || a.label.length - b.label.length);
  return out.slice(0, limit);
}

/** Fuzzy-оценка имени переменной (имя важнее сниппета). */
export function varScore(query: string, name: string, snippet: string): number {
  const s = fuzzyScore(query, name);
  if (s > 0) return s + 50;
  const nq = query.trim().toLowerCase();
  if (nq && snippet.toLowerCase().includes(nq)) return 1;
  return 0;
}
