import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine, humanizeMathError, suggestName } from './mathEngine';

describe('errors: suggestName', () => {
  const scope = ['alpha', 'beta', 'x', 'myFunc'];

  it('находит опечатку на расстоянии 1', () => {
    expect(suggestName('alpah', scope)).toBe('alpha');
    expect(suggestName('betha', scope)).toBe('beta');
  });

  it('регистр не мешает', () => {
    expect(suggestName('ALPHA', ['alpha'])).toBe('alpha');
  });

  it('префикс — запасной вариант', () => {
    expect(suggestName('alp', scope)).toBe('alpha');
  });

  it('далекое имя — без подсказки', () => {
    expect(suggestName('zzzqqq', scope)).toBe(null);
  });

  it('короткие имена не подсказываем (шум)', () => {
    expect(suggestName('y', ['x'])).toBe(null);
  });

  it('точное совпадение подсказки не требует', () => {
    expect(suggestName('alpha', scope)).toBe(null);
  });
});

describe('errors: did-you-mean in evaluateLine', () => {
  it('опечатка в переменной даёт подсказку', () => {
    const scope = createBaseScope();
    expect(evaluateLine('alpha := 5', scope).error).toBe(null);
    const r = evaluateLine('alpah + 1', scope);
    expect(r.error).toContain('alpah');
    expect(r.error).toContain('alpha');
  });

  it('без похожих имён — чистая ошибка без подсказки', () => {
    const scope = createBaseScope();
    const r = evaluateLine('zzzqqq + 1', scope);
    expect(r.error).not.toBe(null);
    expect(r.error).not.toContain('did you mean');
    expect(r.error).not.toContain('имелось в виду');
  });

  it('humanize без scope не падает', () => {
    expect(humanizeMathError(new Error('Undefined symbol foo'))).toContain('foo');
  });
});
