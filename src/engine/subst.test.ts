import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { buildSubstitution, createBaseScope, evaluateLine } from './mathEngine';

let id = 0;
function block(
  kind: MathBlockData['kind'],
  y: number,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: `s${id++}`,
    x: 80,
    y,
    rawInput: '',
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind,
    plotPreview: null,
    ...patch,
  };
}

function recalc(list: MathBlockData[]) {
  const r = recalculateAll(list);
  return list.map((b) => r.blocks[b.id]);
}

/** Scope c переменными m=2, a=5 (как после верхних блоков листа). */
function scopeMA() {
  const s = createBaseScope();
  evaluateLine('m := 2', s);
  evaluateLine('a := 5', s);
  return s;
}

describe('subst: buildSubstitution', () => {
  it('подставляет скаляры: m*a → 2 * 5', () => {
    const sub = buildSubstitution('m*a', scopeMA(), [], 10);
    expect(sub).not.toBeNull();
    expect(sub!.names.sort()).toEqual(['a', 'm']);
    expect(sub!.text.replace(/\s+/g, '')).toBe('2*5');
    expect(sub!.latex).toContain('2');
    expect(sub!.latex).toContain('5');
  });

  it('одиночная переменная не подставляется (иначе x = 5 = 5)', () => {
    expect(buildSubstitution('m', scopeMA(), [], 2)).toBeNull();
  });

  it('без переменных нечего подставлять: 2+2 → null', () => {
    expect(buildSubstitution('2+2', scopeMA(), [], 4)).toBeNull();
  });

  it('перевод единиц пропускаем: 10cm = m', () => {
    expect(buildSubstitution('10cm = m', scopeMA(), [], 0.1)).toBeNull();
  });

  it('имена функций не трогаем: sin(x) подставляет только x', () => {
    const s = scopeMA();
    evaluateLine('x := 1', s);
    const sub = buildSubstitution('sin(x)', s, [], Math.sin(1));
    expect(sub).not.toBeNull();
    expect(sub!.names).toEqual(['x']);
    expect(sub!.text.replace(/\s+/g, '')).toBe('sin(1)');
  });

  it('пользовательская f в f(3) не подставляется', () => {
    const s = scopeMA();
    evaluateLine('f(t) := t^2', s);
    expect(buildSubstitution('f(3)', s, [], 9)).toBeNull();
  });

  it('строковые аргументы целы: numsum("k^2",...) — k внутри кавычек не трогаем', () => {
    const s = scopeMA();
    evaluateLine('n := 5', s);
    const sub = buildSubstitution('numsum("k^2", "k", 1, n)', s, [], 55);
    expect(sub).not.toBeNull();
    expect(sub!.names).toEqual(['n']);
    expect(sub!.text).toContain('"k^2"');
    expect(sub!.text).toContain('5');
  });

  it('отрицательные — в скобках: x^2 при x=-3 → (-3)^2', () => {
    const s = scopeMA();
    evaluateLine('x := -3', s);
    const sub = buildSubstitution('x^2', s, [], 9);
    expect(sub).not.toBeNull();
    expect(sub!.text.replace(/\s+/g, '')).toBe('(-3)^2');
  });

  it('единицы подставляются: m [2 kg] в m*a', () => {
    const s = createBaseScope();
    evaluateLine('m := 2 kg', s);
    evaluateLine('a := 5', s);
    const expected = evaluateLine('m*a', s).value;
    const sub = buildSubstitution('m*a', s, [], expected);
    expect(sub).not.toBeNull();
    expect(sub!.names.sort()).toEqual(['a', 'm']);
    expect(sub!.text).toContain('2 kg');
  });

  it('fail-safe: несовпадение контрольного значения → null', () => {
    expect(buildSubstitution('m*a', scopeMA(), [], 999)).toBeNull();
  });

  it('неизвестные имена не мешают: y подставляется, z остаётся', () => {
    const s = scopeMA();
    evaluateLine('y := 4', s);
    // z не определён — buildSubstitution всё равно подставит y;
    // ошибка вычисления поймается движком, здесь проверяем только текст
    const sub = buildSubstitution('y+z', s);
    expect(sub).not.toBeNull();
    expect(sub!.names).toEqual(['y']);
    expect(sub!.text.replace(/\s+/g, '')).toBe('4+z');
  });
});

describe('subst: recalculateAll', () => {
  it('F := m*a = даёт subst 2*5 и результат 10', () => {
    const out = recalc([
      block('math', 60, { rawInput: 'm := 2' }),
      block('math', 124, { rawInput: 'a := 5' }),
      block('math', 188, { rawInput: 'F := m*a =' }),
    ]);
    expect(out[2].error).toBeNull();
    expect(out[2].resultStr).toBe('10');
    expect(out[2].substStr?.replace(/\s+/g, '')).toBe('2*5');
    expect(out[2].substLatex).toContain('2');
  });

  it('m*a = (чистый вывод) тоже с подстановкой', () => {
    const out = recalc([
      block('math', 60, { rawInput: 'm := 2' }),
      block('math', 124, { rawInput: 'a := 5' }),
      block('math', 188, { rawInput: 'm*a =' }),
    ]);
    expect(out[2].error).toBeNull();
    expect(out[2].substStr?.replace(/\s+/g, '')).toBe('2*5');
  });

  it('x = (одиночная) — без подстановки', () => {
    const out = recalc([
      block('math', 60, { rawInput: 'x := 7' }),
      block('math', 124, { rawInput: 'x =' }),
    ]);
    expect(out[1].resultStr).toBe('7');
    expect(out[1].substStr ?? null).toBeNull();
    expect(out[1].substLatex ?? null).toBeNull();
  });

  it('при ошибке подстановки нет', () => {
    const out = recalc([block('math', 60, { rawInput: 'nosuchvar + 1 =' })]);
    expect(out[0].error).not.toBeNull();
    expect(out[0].substStr ?? null).toBeNull();
  });

  it('переопределение в том же блоке: scope ДО последней строки', () => {
    const out = recalc([block('math', 60, { rawInput: 'x := 1\nx := x + 1 =' })]);
    expect(out[0].error).toBeNull();
    expect(out[0].resultStr).toBe('2');
    // x на момент последней строки был 1, а не 2
    expect(out[0].substStr?.replace(/\s+/g, '')).toBe('1+1');
  });

  it('присваивание без показа — не выводим (isOutput false)', () => {
    const out = recalc([
      block('math', 60, { rawInput: 'm := 2' }),
      block('math', 124, { rawInput: 'q := m*3' }),
    ]);
    expect(out[1].isOutput).toBe(false);
    expect(out[1].substStr ?? null).toBeNull();
  });

  it('определение функции не подставляем', () => {
    const out = recalc([block('math', 60, { rawInput: 'f(t) := t^2' })]);
    expect(out[0].substStr ?? null).toBeNull();
  });

  it('с единицами end-to-end: F = mass·acc = (2 kg)·3 = 6 N', () => {
    const out = recalc([
      block('math', 60, { rawInput: 'mass := 2 kg' }),
      block('math', 124, { rawInput: 'acc := 3 m/s^2' }),
      block('math', 188, { rawInput: 'F := mass*acc =' }),
    ]);
    expect(out[2].error).toBeNull();
    expect(out[2].resultStr).toContain('6');
    expect(out[2].substStr).toContain('2 kg');
    expect(out[2].substLatex).toContain('2');
  });
});
