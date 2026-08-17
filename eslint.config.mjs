import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/data/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // 铁律 3:规则引擎必须是纯函数——禁止 IO、网络、不确定性来源
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'os',
                'crypto',
                'http',
                'https',
                'net',
                'child_process',
                'socket.io*',
                'fastify*',
              ],
              message: '规则引擎是纯函数,禁止 import IO/网络/Node 内置模块(CLAUDE.md 铁律 3)',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '随机数必须走 seeded RNG(engine/rng.ts),种子存在 GameState 里',
        },
        {
          object: 'Date',
          property: 'now',
          message: '引擎内禁止取当前时间,时间判定一律在服务端(Phase 2)',
        },
      ],
    },
  },
);
