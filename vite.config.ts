import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const disableHmr = process.env.DISABLE_HMR === 'true';
  const pwaManifest = {
    id: '/',
    name: 'ARROW-01 | 2157 Cyber Shmup',
    short_name: 'ARROW-01',
    description:
      '2157年のネオン都市を舞台にした横スクロール・4択クイズ搭載シューティングゲーム『ARROW-01』。',
    start_url: '/',
    scope: '/',
    display: 'fullscreen' as const,
    display_override: ['fullscreen' as const, 'standalone' as const],
    orientation: 'landscape' as const,
    theme_color: '#070B14',
    background_color: '#050811',
    lang: 'ja',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return {
    assetsInclude: ['**/*.mid'],
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg'],
        manifest: pwaManifest,
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,mp3,mid}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365},
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365},
                cacheableResponse: {statuses: [0, 200]},
              },
            },
          ],
        },
        devOptions: {
          // vite-plugin-pwa's dev SW calls import.meta.hot.send(), which throws SendBeforeConnectError when HMR is disabled
          enabled: !disableHmr,
          type: 'module',
        },
      }),
      ...(disableHmr
        ? [
            {
              name: 'serve-pwa-manifest-without-hmr',
              apply: 'serve' as const,
              transformIndexHtml(html: string) {
                if (html.includes('manifest.webmanifest')) return html;
                return html.replace(
                  '</head>',
                  '    <link rel="manifest" href="/manifest.webmanifest" />\n  </head>',
                );
              },
              configureServer(server: {
                middlewares: {
                  use: (
                    fn: (
                      req: {url?: string},
                      res: {
                        statusCode: number;
                        setHeader: (k: string, v: string) => void;
                        end: (body: string) => void;
                      },
                      next: () => void,
                    ) => void,
                  ) => void;
                };
              }) {
                server.middlewares.use((req, res, next) => {
                  if (req.url === '/manifest.webmanifest') {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/manifest+json');
                    res.end(JSON.stringify(pwaManifest, null, 2));
                    return;
                  }
                  next();
                });
              },
            },
          ]
        : []),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
