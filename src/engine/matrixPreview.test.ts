import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { valueToLatex, valueToTable } from './mathEngine';

describe('valueToLatex: big matrix preview', () => {
  it('renders dimensions with a real × instead of a raw \\times command', () => {
    const tex = valueToLatex(Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 1 : 0)));
    expect(tex).toContain('×');
    expect(tex).not.toContain('\\times');

    const html = katex.renderToString(tex, { throwOnError: true });
    expect(html).not.toContain('katex-error');
    expect(html).toContain('×');
  });
});

describe('valueToTable', () => {
  it('returns a full table for a 60-element vector', () => {
    const table = valueToTable(
      Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 1 : 0)),
    );
    expect(table).toMatchObject({ rowCount: 1, colCount: 60, truncated: false });
    expect(table!.rows[0]).toHaveLength(60);
    expect(table!.rows[0][0]).toBe('1');
  });

  it('does not make tables from scalars', () => {
    expect(valueToTable(42)).toBeNull();
  });
});
