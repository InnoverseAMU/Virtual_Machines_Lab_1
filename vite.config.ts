import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeAssetManifest } from './scripts/generate-assets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPERIMENTS_PUBLIC_DIR = path.join(__dirname, 'public', 'experiments');

function experimentAssetsDevPlugin(): Plugin {
  return {
    name: 'vml-experiment-assets-dev-watch',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(EXPERIMENTS_PUBLIC_DIR);
      const regenerate = (filePath: string) => {
        if (!filePath.startsWith(EXPERIMENTS_PUBLIC_DIR)) return;
        try {
          writeAssetManifest();
        } catch {
          // Ignore transient file write errors during dev copy
        }
      };
      server.watcher.on('add', regenerate);
      server.watcher.on('unlink', regenerate);
      server.watcher.on('change', regenerate);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), experimentAssetsDevPlugin()],
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.{ts,mjs}'],
  },
});
