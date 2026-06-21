/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'prompt', // Finding #7: Changed from autoUpdate to prompt
        injectRegister: 'auto',

        // PWA Web App Manifest — required for "Add to Home Screen"
        manifest: {
          name: 'AuraDesk — Fenina Salon & Reflexology',
          short_name: 'AuraDesk',
          description: 'Sistem manajemen kasir & janji temu offline-first untuk Fenina Salon & Reflexology.',
          theme_color: '#D98897',
          background_color: '#FAF6F6',
          display: 'standalone',
          orientation: 'landscape',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },

        // injectManifest options
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        },

        // Dev mode — enables service worker during `npm run dev` for testing
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // Disable HMR & file watching when DISABLE_MHR env var is set (AI Studio compatibility)
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },

    test: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/tests/**',
        '**/.{git,cache}/**',
      ],
    },
  };
});
