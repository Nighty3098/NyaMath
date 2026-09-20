import { describe, expect, it } from 'vitest';
import { statusTone } from './status';

describe('status: statusTone', () => {
  it('ошибки важнее всего', () => {
    expect(statusTone(2, 5, true)).toBe('err');
  });

  it('активный пересчёт — busy', () => {
    expect(statusTone(0, 0, true)).toBe('busy');
  });

  it('stale без ошибок — warn', () => {
    expect(statusTone(0, 3, false)).toBe('warn');
  });

  it('чистый лист — ok', () => {
    expect(statusTone(0, 0, false)).toBe('ok');
  });
});
