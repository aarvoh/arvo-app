import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function apiMiddlewarePlugin(apiKey) {
  return {
    name: 'arvo-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', async () => {
          try {
            const { messages } = JSON.parse(body);
            if (!apiKey) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ content: 'Set ANTHROPIC_API_KEY in your .env file to enable AI answers.' }));
              return;
            }
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey });
            const msg = await client.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 300,
              system: 'You are ARVO, an AI embedded in smart glasses worn by the user. When an image is attached, it is a live frame from the glass camera pointed at the real world — look at the image carefully and answer the user\'s question based on exactly what you see. If no image is attached, answer from context alone. Keep every answer to 1–2 short sentences. Answers appear on a small HUD overlay so be direct and specific.',
              messages,
            });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ content: msg.content[0].text }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  server: {
    historyApiFallback: true,
  },
  plugins: [
    react(),
    apiMiddlewarePlugin(env.ANTHROPIC_API_KEY),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ARVO',
        short_name: 'ARVO',
        description: 'Smart glasses OS — phone as brain, glass as display',
        theme_color: '#07080A',
        background_color: '#07080A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
}});
