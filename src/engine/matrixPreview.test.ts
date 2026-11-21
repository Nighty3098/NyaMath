import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { valueToLatex } from './mathEngine';

describe('valueToLatex: big matrix preview', () => {
  it('renders dimensions with a real × instead of a raw \\times command', () => {
    const tex = valueToLatex(Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 1 : 0)));
    expect(tex).toContain('\\times');

    const html = katex.renderToString(tex, { throwOnError: true });
    expect(html).not.toContain('katex-error');
    expect(html).toContain('×');
  });
});
