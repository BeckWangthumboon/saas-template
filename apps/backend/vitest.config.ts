import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setupEnv.ts'],
    include: ['./tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
  },
});
