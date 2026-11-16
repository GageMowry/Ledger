import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => {
  // The built site is served from https://gagemowry.github.io/Ledger/
  const base = command === 'build' ? '/Ledger/' : '/'

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg'],
        manifest: {
          name: 'Ledger',
          short_name: 'Ledger',
          description: 'Personal tracker for wardrobe, meals, body and tasks',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  }
})
