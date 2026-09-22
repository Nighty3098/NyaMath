import { describe, expect, it } from 'vitest';
import { tokenizeTraceLine } from './traceFormat';

describe('tokenizeTraceLine', () => {
  it('пробелы внутри [...] не разделяют', () => {
    const ts = tokenizeTraceLine('solve [x, y] from [1, 0]: 5 iters, |F|=1.00·10^-9');
    expect(ts).toEqual([
      { kind: 'text', text: 'solve' },
      { kind: 'text', text: '[x, y]' },
      { kind: 'text', text: 'from' },
      { kind: 'text', text: '[1, 0]:' },
      { kind: 'text', text: '5' },
      { kind: 'text', text: 'iters,' },
      { kind: 'kv', key: '|F|', value: '1.00·10^-9' },
    ]);
  });

  it('итерации Ньютона — чипы k/x/f', () => {
    const ts = tokenizeTraceLine('k=3 x=1.25992 f=0.00012');
    expect(ts).toEqual([
      { kind: 'kv', key: 'k', value: '3' },
      { kind: 'kv', key: 'x', value: '1.25992' },
      { kind: 'kv', key: 'f', value: '0.00012' },
    ]);
  });

  it('дефисные ключи и подпись интеграла', () => {
    const ts = tokenizeTraceLine('∫ (ln(1+x)/(1+x^2)) dx [-9.94·10^-12, 0.0666667]: I=0.00216963');
    expect(ts).toContainEqual({ kind: 'kv', key: 'I', value: '0.00216963' });
    expect(ts).toContainEqual({ kind: 'text', text: '∫' });
    expect(ts).toContainEqual({ kind: 'text', text: '[-9.94·10^-12, 0.0666667]:' });
    const splits = tokenizeTraceLine('splits=1 f-evals=9 I=0.00216963');
    expect(splits).toContainEqual({ kind: 'kv', key: 'f-evals', value: '9' });
  });

  it('маркер compactTrace остаётся текстом', () => {
    expect(tokenizeTraceLine('… 14 more')).toEqual([
      { kind: 'text', text: '…' },
      { kind: 'text', text: '14' },
      { kind: 'text', text: 'more' },
    ]);
  });

  it('пустые значения и мусор — текст, не чип', () => {
    expect(tokenizeTraceLine('')).toEqual([]);
    expect(tokenizeTraceLine('a=')).toEqual([{ kind: 'text', text: 'a=' }]);
    expect(tokenizeTraceLine('=5')).toEqual([{ kind: 'text', text: '=5' }]);
  });
});
