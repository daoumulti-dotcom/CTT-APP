import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
await build({
  root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: false,
  plugins: [react()],
  publicDir: false,
  build: { emptyOutDir: false }
});
