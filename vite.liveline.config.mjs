import { defineConfig } from 'vite'

// Builds dashboard-src/liveline-entry.js into one self-contained script for the dashboard,
// which has no build step of its own. Run: npm run build:dashboard
export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'public/dashboard/vendor',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: 'dashboard-src/liveline-entry.js',
      formats: ['iife'],
      name: 'LivelineBundle',
      fileName: () => 'liveline.js',
    },
  },
})
