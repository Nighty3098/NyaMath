import { defineConfig } from 'vitest/config';

// Unit-тесты движка/шаринга/отчёта: чистый node, без DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
