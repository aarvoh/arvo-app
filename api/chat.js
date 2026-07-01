export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').replace(/^﻿/, '').trim();
  if (!apiKey) {
    res.status(200).json({ content: 'Set ANTHROPIC_API_KEY in Vercel environment variables.' });
    return;
  }

  try {
    const { messages } = req.body;
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You are sotto, an AI embedded in smart glasses worn by the user. When an image is attached, it is a live frame from the glass camera pointed at the real world — look at the image carefully and answer the user\'s question based on exactly what you see. If no image is attached, answer from context alone. Keep every answer to 1–2 short sentences. Answers appear on a small HUD overlay so be direct and specific.',
      messages,
    });
    res.status(200).json({ content: msg.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
