import { describe, expect, it } from 'vitest';
import {
  applyCompletion,
  fuzzyScore,
  prefixAt,
  queryAssistant,
  type AssistItem,
} from './assistant';
import { listFuncDocs } from './funcDoc';
import type { ScopeVar } from './scopeVars';

function v(name: string, value = '1'): ScopeVar {
  return { name, value, hasError: false, blockId: 'b' };
}

describe('assistant: prefixAt', () => {
  it('берёт фрагмент перед курсором', () => {
    expect(prefixAt('m*a + sin', 1)).toEqual({ start: 0, word: 'm' });
    expect(prefixAt('m*a + sin', 9)).toEqual({ start: 6, word: 'sin' });
  });
  it('после пробела/оператора — null', () => {
    expect(prefixAt('m*a + ', 6)).toBeNull();
    expect(prefixAt('', 0)).toBeNull();
  });
  it('не начинается с цифры', () => {
    expect(prefixAt('10m', 3)).toBeNull();
  });
  it('нижнее подчёркивание — часть имени', () => {
    expect(prefixAt('my_var + 1', 6)).toEqual({ start: 0, word: 'my_var' });
  });
});

describe('assistant: fuzzyScore', () => {
  it('префикс точнее подстроки, подстрока точнее subsequence', () => {
    const pre = fuzzyScore('si', 'sin');
    const sub = fuzzyScore('si', 'transistorX');
    expect(pre).toBeGreaterThan(sub);
    const fuzzy = fuzzyScore('sq', 'sqrt');
    expect(fuzzy).toBeGreaterThan(0);
    expect(pre).toBeGreaterThan(fuzzy);
  });
  it('регистр не важен, точный — бонус', () => {
    expect(fuzzyScore('sin', 'sin')).toBeGreaterThan(fuzzyScore('SIN', 'sin'));
    expect(fuzzyScore('sin', 'sin')).toBeGreaterThan(0);
  });
  it('нет совпадения — 0', () => {
    expect(fuzzyScore('zzz', 'sin')).toBe(0);
    expect(fuzzyScore('snx', 'sin')).toBe(0);
  });
});

describe('assistant: queryAssistant', () => {
  const vars = [v('mymass', '2 kg'), v('alpha', '0.5'), v('F', '10 N')];
  it('переменная по префиксу первая', () => {
    const q = queryAssistant('mym', vars, 'ru');
    expect(q.items[0].name).toBe('mymass');
    expect(q.items[0].kind).toBe('var');
    expect(q.items[0].detail).toBe('2 kg');
  });
  it('функция находится: si → sin', () => {
    const q = queryAssistant('si', [], 'ru');
    const names = q.items.map((i) => i.name);
    expect(names).toContain('sin');
  });
  it('единицы находятся: mm', () => {
    const q = queryAssistant('mm', [], 'en');
    const mm = q.items.find((i) => i.name === 'mm');
    expect(mm?.kind).toBe('unit');
  });
  it('дедуп: переменная побеждает функцию с тем же именем', () => {
    const q = queryAssistant('mean', [v('mean', '5')], 'ru');
    expect(q.items[0]).toMatchObject({ name: 'mean', kind: 'var' });
    expect(q.items.filter((i) => i.name === 'mean')).toHaveLength(1);
  });
  it('лимит соблюдается, total — полный', () => {
    const q = queryAssistant('m', vars, 'ru', 3);
    expect(q.items.length).toBeLessThanOrEqual(3);
    expect(q.total).toBeGreaterThanOrEqual(q.items.length);
  });
  it('пустой префикс (F12): сначала переменные', () => {
    const q = queryAssistant('', vars, 'ru', 60);
    expect(q.items.slice(0, 3).map((i) => i.name)).toEqual(['mymass', 'alpha', 'F']);
    expect(q.total).toBeGreaterThan(100);
  });
  it('язык влияет на доки функций', () => {
    const ru = queryAssistant('sin', [], 'ru');
    const en = queryAssistant('sin', [], 'en');
    expect(ru.items.find((i) => i.name === 'sin')?.doc).toContain('синус');
    expect(en.items.find((i) => i.name === 'sin')?.doc).toContain('sine');
  });
});

describe('assistant: applyCompletion', () => {
  const fn: AssistItem = { name: 'sin', kind: 'fn', detail: '', doc: '' };
  const vr: AssistItem = { name: 'mymass', kind: 'var', detail: '', doc: '' };
  it('переменная заменяет префикс', () => {
    expect(applyCompletion('mym + 1', 3, vr)).toEqual({ value: 'mymass + 1', cursor: 6 });
  });
  it('функции добавляем скобку', () => {
    expect(applyCompletion('si', 2, fn)).toEqual({ value: 'sin(', cursor: 4 });
  });
  it('скобку не дублируем', () => {
    expect(applyCompletion('si(x)', 2, fn)).toEqual({ value: 'sin(x)', cursor: 3 });
  });
});

describe('assistant: listFuncDocs', () => {
  it('есть встроенные и сниппеты', () => {
    const list = listFuncDocs('ru');
    const names = list.map((f) => f.name);
    expect(names).toContain('sin');
    expect(names).toContain('mean');
    expect(list.length).toBeGreaterThan(30);
  });
});
