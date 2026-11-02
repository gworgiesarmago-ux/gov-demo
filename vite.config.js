import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const pages = ['index', 'roadmap', 'welcome', 'login', 'register', 'verify', 'clearances', 'apply', 'vault'];
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map(page => [page, resolve(import.meta.dirname, page + '.html')])),
    },
  },
});

