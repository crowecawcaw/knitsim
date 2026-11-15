import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the same build works at /knitsim/ (production) and at
// /knitsim/pr-preview/pr-N/ (PR previews). All app state lives in the query
// string, so there is no client-side routing to worry about.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
});
