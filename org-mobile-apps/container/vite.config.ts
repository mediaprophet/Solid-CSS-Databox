import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['manifest.webmanifest'],
      manifest: {
        name: 'Databox Org App',
        short_name: 'Databox',
        description: 'Unified WASM/PWA container for org-facing mobile apps',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,wasm,css,html,svg,png}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    wasmLoading: 'fetch',
  },
});
