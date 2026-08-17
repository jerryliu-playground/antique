import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
    // fuzz 测试要跑 1000 局完整对局
    testTimeout: 180_000,
  },
});
