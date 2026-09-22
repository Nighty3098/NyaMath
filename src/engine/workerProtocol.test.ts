import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine, math } from './mathEngine';
import {
  collectDefLines,
  deserializeScopeValue,
  rebuildMainScope,
  serializeScopeValue,
  slimWorkerInput,
  type SerVal,
} from './workerProtocol';
import type { MathBlockData } from './dependencies';

let id = 0;
function block(y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `w${id++}`,
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
    kind: 'math',
    plotPreview: null,
    ...patch,
  };
}

/** Через JSON — как structured clone границы воркера. */
function hop<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('workerProtocol: scope serde', () => {
  it('числа/строки/bool/null едут как есть', () => {
    expect(serializeScopeValue(5)).toBe(5);
    expect(serializeScopeValue('ab')).toBe('ab');
    expect(serializeScopeValue(true)).toBe(true);
    expect(serializeScopeValue(null)).toBeNull();
    expect(deserializeScopeValue(hop(serializeScopeValue(5) as SerVal))).toBe(5);
  });

  it('complex туда-обратно', () => {
    const s = hop(serializeScopeValue(math.complex(1, -2)) as SerVal);
    const v = deserializeScopeValue(s);
    expect(math.isComplex(v)).toBe(true);
    const c = v as { re: number; im: number };
    expect([c.re, c.im]).toEqual([1, -2]);
  });

  it('unit туда-обратно (формат mathjs переживает clone)', () => {
    const u = math.unit(2, 'kg');
    const s = hop(serializeScopeValue(u) as SerVal);
    expect(s).toEqual({ __t: 'u', s: '2 kg' });
    const v = deserializeScopeValue(s);
    expect(math.isUnit(v)).toBe(true);
    expect((v as { toString: () => string }).toString()).toBe('2 kg');
  });

  it('custom defunit-единица переживает границу (defunit — на инстансе)', () => {
    const ws = createBaseScope();
    evaluateLine('defunit("smoot", "1.7 m")', ws);
    evaluateLine('h := 2 smoot', ws);
    const s = hop(serializeScopeValue(ws['h']) as SerVal);
    expect(s).toEqual({ __t: 'u', s: '2 smoot' });
    const v = deserializeScopeValue(s);
    expect(math.isUnit(v)).toBe(true);
  });

  it('матрицы с юнитами/комплексными внутри', () => {
    const m = math.matrix([
      [1, math.complex(0, 1)],
      [math.unit(3, 'm'), 0],
    ]);
    const s = hop(serializeScopeValue(m) as SerVal);
    const v = deserializeScopeValue(s);
    expect(math.isMatrix(v)).toBe(true);
    const a = (v as { toArray: () => unknown[][] }).toArray();
    expect(a[0][0]).toBe(1);
    expect(math.isComplex(a[0][1])).toBe(true);
    expect(math.isUnit(a[1][0])).toBe(true);
    expect(a[1][1]).toBe(0);
    // bool внутри матрицы — через ручной SerVal (типы mathjs bool не любят)
    const bv = deserializeScopeValue({ __t: 'm', a: [true, 1] });
    expect((bv as { toArray: () => unknown[] }).toArray()).toEqual([true, 1]);
  });

  it('функции и мусор пропускаются', () => {
    expect(serializeScopeValue(() => 1)).toBeUndefined();
    expect(serializeScopeValue({ foo: 1 })).toBeUndefined();
    expect(serializeScopeValue(NaN)).toEqual({ __t: 'n', s: 'NaN' });
    expect(deserializeScopeValue({ __t: 'n', s: 'Infinity' })).toBe(Infinity);
  });
});

describe('workerProtocol: slim', () => {
  it('режет derived и resultValue, оставляет ввод', () => {
    const b = block(60, {
      rawInput: 'x := 5',
      resultStr: '5',
      resultValue: math.complex(1, 2),
      plotPreview: { label: 'x', expr: 'x', xs: [1], ys: [1], xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
      sliderVar: 'k',
      exportName: 'e',
    });
    const s = slimWorkerInput(b);
    expect((s as Record<string, unknown>)['resultValue']).toBeUndefined();
    expect((s as Record<string, unknown>)['resultStr']).toBeUndefined();
    expect((s as Record<string, unknown>)['plotPreview']).toBeUndefined();
    expect(s.rawInput).toBe('x := 5');
    expect(s.sliderVar).toBe('k');
    expect(s.exportName).toBe('e');
  });
});

describe('workerProtocol: def lines + rebuild', () => {
  it('собирает функции и defunit сверху-вниз, пропуская комментарии и disabled', () => {
    const a = block(60, { rawInput: 'f(t) := t^2' });
    const b = block(124, { rawInput: '// коммент\ndefunit("smoot", "1.7 m")' });
    const c = block(188, { rawInput: 'g(t) := f(t)', disabled: true });
    expect(collectDefLines([c, b, a])).toEqual(['f(t) := t^2', 'defunit("smoot", "1.7 m")']);
  });

  it('пересобранный scope считает: f(3) и custom units', () => {
    const ws = createBaseScope();
    evaluateLine('defunit("smoot", "1.7 m")', ws);
    evaluateLine('f(t) := t^2', ws);
    evaluateLine('n := 4', ws);
    const ser: Record<string, SerVal | null> = {};
    for (const [k, v] of Object.entries(ws)) ser[k] = serializeScopeValue(v) ?? null;
    const hopped = hop(ser);
    const rebuilt = rebuildMainScope(hopped, ['defunit("smoot", "1.7 m")', 'f(t) := t^2']);
    expect(evaluateLine('f(3) =', rebuilt).value).toBe(9);
    expect(evaluateLine('n =', rebuilt).value).toBe(4);
    const r = evaluateLine('2 smoot =', rebuilt);
    expect(r.error).toBeNull();
    expect(math.isUnit(r.value)).toBe(true);
  });
});
