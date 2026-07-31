import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the static build works from a subdirectory (e.g. GitHub Pages).
  base: './',
  test: {
    // Only the interaction tests need a DOM; the model tests are pure functions.
    environmentMatchGlobs: [['tests/inputs.test.tsx', 'jsdom']],
    setupFiles: ['./tests/setup.ts'],
  },
});
