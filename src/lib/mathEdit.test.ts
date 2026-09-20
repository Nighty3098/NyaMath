import { describe, expect, it } from 'vitest';
import { expandSelection, insertSnippet, wrapSelection } from './mathEdit';

describe('editing: wrap selection with operator', () => {
  it('parens keep the selection on the group (chaining)', () => {
    expect(wrapSelection('19+52', 0, 5, 'parens')).toEqual({
      value: '(19+52)', start: 0, end: 7,
    });
  });

  it('slash makes a fraction with cursor in the denominator', () => {
    expect(wrapSelection('19+52', 0, 5, 'fraction')).toEqual({
      value: '(19+52)/()', start: 9, end: 9,
    });
  });

  it('caret makes a power with cursor in the exponent', () => {
    expect(wrapSelection('19+52', 0, 5, 'power')).toEqual({
      value: '(19+52)^()', start: 9, end: 9,
    });
  });

  it('wraps a middle group without touching the rest', () => {
    expect(wrapSelection('1+19+52+3', 2, 7, 'parens')).toEqual({
      value: '1+(19+52)+3', start: 2, end: 9,
    });
  });

  it('sqrt wraps and keeps chaining selection', () => {
    expect(wrapSelection('52', 0, 2, 'sqrt')).toEqual({
      value: 'sqrt(52)', start: 0, end: 8,
    });
  });

  it('collapsed selection is left to normal typing', () => {
    expect(wrapSelection('19+52', 2, 2, 'parens')).toBeNull();
  });
});

describe('editing: expand selection (levels)', () => {
  it('collapsed cursor selects the token', () => {
    expect(expandSelection('19+52', 1, 1)).toEqual({ start: 0, end: 2 });
  });

  it('token expands to bracket content, then to whole brackets', () => {
    expect(expandSelection('(19+52)', 1, 3)).toEqual({ start: 1, end: 6 });
    expect(expandSelection('(19+52)', 1, 6)).toEqual({ start: 0, end: 7 });
  });

  it('climbs nested brackets level by level', () => {
    // содержимое внутренней пары → сама пара
    expect(expandSelection('((ab))', 2, 4)).toEqual({ start: 1, end: 5 });
    // целая внутренняя пара → содержимое внешней → внешняя целиком
    expect(expandSelection('((ab))', 1, 5)).toEqual({ start: 0, end: 6 });
    expect(expandSelection('((ab))', 0, 6)).toBeNull();
  });

  it('ends at the line and then stops', () => {
    expect(expandSelection('19+52', 0, 5)).toBeNull();
    expect(expandSelection('x := 19+52', 5, 7)).toEqual({ start: 0, end: 10 });
  });
});

describe('editing: insert snippet from on-screen keyboard', () => {
  it('вставляет в позицию курсора', () => {
    expect(insertSnippet('x+2', 1, 1, 'π')).toEqual({ value: 'xπ+2', cursor: 2 });
  });

  it('заменяет выделение', () => {
    expect(insertSnippet('x+2', 0, 1, 'sin(')).toEqual({ value: 'sin(+2', cursor: 4 });
  });

  it('перевёрнутые границы нормализуются', () => {
    expect(insertSnippet('ab', 2, 0, ':=')).toEqual({ value: ':=', cursor: 2 });
  });

  it('выход за длину обрезается', () => {
    expect(insertSnippet('ab', 99, 99, '²')).toEqual({ value: 'ab²', cursor: 3 });
  });
});
