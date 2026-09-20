import { describe, expect, it } from 'vitest';
import { hoverNameOf, isVarRelated } from './varHighlight';

const blk = (definedVar: string | null, dependencies: string[] = []) =>
  ({ definedVar, dependencies }) as Parameters<typeof hoverNameOf>[0];

describe('varHighlight: hoverNameOf', () => {
  it('своё определение важнее зависимостей', () => {
    expect(hoverNameOf(blk('x', ['y']))).toBe('x');
  });

  it('без определения — первая зависимость', () => {
    expect(hoverNameOf(blk(null, ['a', 'b']))).toBe('a');
  });

  it('пустой блок — null', () => {
    expect(hoverNameOf(blk(null, []))).toBe(null);
  });
});

describe('varHighlight: isVarRelated', () => {
  it('null никого не подсвечивает', () => {
    expect(isVarRelated(blk('x'), null)).toBe(false);
  });

  it('определение и использование подсвечиваются', () => {
    expect(isVarRelated(blk('x'), 'x')).toBe(true);
    expect(isVarRelated(blk(null, ['x', 'y']), 'x')).toBe(true);
  });

  it('чужие блоки — нет', () => {
    expect(isVarRelated(blk('y', ['z']), 'x')).toBe(false);
  });
});
