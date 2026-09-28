import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev serves both pages (prep.html is reachable at /prep.html).
// The production build only includes index.html, so the Photo Prep tool never ships.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: 'index.html',
    },
  },
});
