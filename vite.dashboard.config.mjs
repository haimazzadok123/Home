import { defineConfig } from 'vite'

// Builds a dashboard-src entry (liveline or kubai, from DASH_ENTRY) into one self-contained script for the dashboard,
// which has no build step of its own. Run: npm run build:dashboard
const entry = process.env.DASH_ENTRY || 'liveline'

export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'public/dashboard/vendor',
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: `dashboard-src/${entry}-entry.js`,
      formats: ['iife'],
      name: `${entry}Bundle`,
      fileName: () => `${entry}.js`,
    },
  },
})
