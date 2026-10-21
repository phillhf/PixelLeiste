import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from file:// (Electron) and the Android WebView.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  test: { environment: 'node' },
} as any);
