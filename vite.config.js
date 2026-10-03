import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    // Rapier's compatibility distribution contains its WASM as base64 (~4 MB).
    // Isolate it so edits to artwork don't invalidate the physics download.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {name:'physics-runtime',test:/node_modules\/@dimforge\//},
            {name:'three',test:/node_modules\/three\//},
          ],
        },
      },
    },
  },
});
