import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `q${id++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
  };
}

/** Лист: a → b → c цепочка + независимый t. Возвращает id по именам. */
function chainDoc() {
  const a = block(60, 'a := 1');
  const b = block(200, 'b := a + 1 =');
  const c = block(340, 'c := b + 1 =');
  const t = block(480, 't := 999 =');
  return { list: [a, b, c, t], a: a.id, b: b.id, c: c.id, t: t.id };
}

function edit(list: MathBlockData[], id: string, rawInput: string): MathBlockData[] {
  return list.map((x) => (x.id === id ? { ...x, rawInput } : x));
}

describe('dirty recalc: only-режим (Calculate Now)', () => {
  it('видимый свежий, нижний — stale, независимый чист', () => {
    const { list, a, b, c, t } = chainDoc();
    const full = recalculateAll(list);
    expect(full.staleIds).toEqual([]);
    expect(full.blocks[c]?.resultStr).toBe('3');

    const edited = edit(list, a, 'a := 10');
    const part = recalculateAll(edited, { only: new Set([b]) });
    expect(part.blocks[b]?.resultStr).toBe('11');
    expect(part.staleIds).toEqual([c]);
    // независимый t пересчёт не заметил (кэш-хит, не stale)
    expect(part.blocks[t]?.resultStr).toBe('999');
    // scope протянут: b свежее, c — старое из кэша
    expect(part.scope['b']).toBe(11);
    expect(part.scope['c']).toBe(3);
    expect(part.changed).toBe(true);
  });

  it('upstream подтягивается автоматически (only={c} чинит всё)', () => {
    const { list, a, b, c } = chainDoc();
    recalculateAll(list);
    const edited = edit(list, a, 'a := 10');
    const part = recalculateAll(edited, { only: new Set([c]) });
    expect(part.blocks[b]?.resultStr).toBe('11');
    expect(part.blocks[c]?.resultStr).toBe('12');
    expect(part.staleIds).toEqual([]);
    expect(part.scope['c']).toBe(12);
  });

  it('пустой only = полный пересчёт', () => {
    const { list, a, c } = chainDoc();
    recalculateAll(list);
    const edited = edit(list, a, 'a := 10');
    const part = recalculateAll(edited, { only: new Set<string>() });
    expect(part.blocks[c]?.resultStr).toBe('12');
    expect(part.staleIds).toEqual([]);
  });

  it('stale не врёт кэшу: следующий полный даёт правильные значения', () => {
    const { list, a, c } = chainDoc();
    recalculateAll(list);
    const edited = edit(list, a, 'a := 10');
    const part = recalculateAll(edited, { only: new Set([edited[1]?.id ?? '']) });
    expect(part.staleIds.length).toBeGreaterThan(0);
    const full = recalculateAll(edited);
    expect(full.blocks[c]?.resultStr).toBe('12');
    expect(full.staleIds).toEqual([]);
  });

  it('циклические всегда свежие (не зависают в stale)', () => {
    const x = block(60, 'x := y + 1 =');
    const y = block(200, 'y := x + 1 =');
    const z = block(340, 'z := 1 =');
    recalculateAll([x, y, z]);
    const r = recalculateAll([x, y, z], { only: new Set([z.id]) });
    expect(r.blocks[x.id]?.error).not.toBeNull();
    expect(r.staleIds).not.toContain(x.id);
    expect(r.staleIds).not.toContain(y.id);
  });

  it('pass-блоки (текст) вне only — reuse без stale-шума при чистом кэше', () => {
    const a = block(60, 'a := 1');
    const tx = block(200, '// заметка');
    (tx as MathBlockData).kind = 'text';
    const b = block(340, 'b := a + 1 =');
    recalculateAll([a, tx, b]);
    const r = recalculateAll([a, tx, b], { only: new Set([b.id]) });
    expect(r.staleIds).toEqual([]);
  });
});
