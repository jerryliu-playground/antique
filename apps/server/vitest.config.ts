import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // 集成测试要打完整局(含计时托管),放宽超时
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
