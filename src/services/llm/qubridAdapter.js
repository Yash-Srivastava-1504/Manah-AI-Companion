'use strict';
const OpenAI = require('openai');

// ── Qubrid OpenAI-Compatible Client ───────────────────────────────────────────
const client = new OpenAI({
  baseURL: process.env.QUBRID_BASE_URL || 'https://platform.qubrid.com/v1',
  apiKey: process.env.QUBRID_API_KEY || 'missing-key',
});

const MODEL = process.env.QUBRID_MODEL || 'google/gemini-2.5-flash';

// Exponential backoff helper
async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503 || err.code === 'ECONNRESET';
      if (!isRetryable || attempt === retries) throw err;

      const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
      console.warn(`[QUBRID] Attempt ${attempt + 1} failed (${err.status}). Retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Non-streaming chat: returns full reply string.
 * @param {Array} messages  - OpenAI-format message array
 * @returns {Promise<string>}
 */
async function chat(messages) {
  const response = await withRetry(() =>
    client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 512,
      temperature: 0.75,
    })
  );
  return response.choices[0].message.content;
}

/**
 * Streaming chat: yields text delta chunks.
 * Caller iterates the returned async generator.
 * @param {Array} messages
 * @returns {AsyncGenerator<string>}
 */
async function* streamChat(messages) {
  const stream = await withRetry(() =>
    client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 512,
      temperature: 0.75,
      stream: true,
    })
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

module.exports = { chat, streamChat };
