import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '*.config.js',
        'api/',
        '*.html',
        '*.css'
      ]
    },
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
    exclude: ['node_modules', 'tests/e2e']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './')
    }
  }
});
