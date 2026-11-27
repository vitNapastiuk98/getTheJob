import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { build } from 'esbuild';

const sandbox = fileURLToPath(new URL('./src/sandbox/', import.meta.url));
const workerModule = '\0interviewforge:dom-worker-source';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'interviewforge-dom-worker',
    resolveId(id) { if (id === 'virtual:dom-worker-source') return workerModule; },
    async load(id) {
      if (id !== workerModule) return;
      for (const name of ['worker.js', 'dom-runner.js']) this.addWatchFile(`${sandbox}${name}`);
      const result = await build({
        entryPoints: [`${sandbox}dom-runner.js`], bundle: true, write: false,
        minify: true, platform: 'browser', format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      return `export default ${JSON.stringify(result.outputFiles[0].text)};`;
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 3000}` } },
  },
});
