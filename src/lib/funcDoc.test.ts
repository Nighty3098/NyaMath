import { describe, expect, it } from 'vitest';
import { lookupFuncDoc, wordAt } from './funcDoc';

describe('funcDoc', () => {
  it('finds builtin math functions', () => {
    expect(lookupFuncDoc('sin', 'ru')).toMatchObject({ name: 'sin' });
    expect(lookupFuncDoc('sin', 'en')!.syntax).toContain('sin(x)');
    expect(lookupFuncDoc('sqrt', 'ru')!.syntax).toContain('sqrt(x)');
  });

  it('finds snippet functions by primary call', () => {
    const d = lookupFuncDoc('numsum', 'ru');
    expect(d).not.toBeNull();
    expect(d!.syntax).toContain('numsum(');
    expect(lookupFuncDoc('dec2bin', 'en')).not.toBeNull();
  });

  it('returns null for unknown names', () => {
    expect(lookupFuncDoc('nosuchfn', 'ru')).toBeNull();
    expect(lookupFuncDoc('', 'en')).toBeNull();
  });

  it('extracts the word under the cursor', () => {
    expect(wordAt('y := sin(x)', 8)).toBe('sin');
    expect(wordAt('y := sin(x)', 2)).toBe('y');
    expect(wordAt('123 +', 5)).toBeNull();
    expect(wordAt('', 0)).toBeNull();
  });
});
