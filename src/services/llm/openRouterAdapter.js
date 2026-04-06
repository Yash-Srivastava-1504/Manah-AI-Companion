'use strict';
const OpenAI = require('openai');

const baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const apiKey = process.env.OPENROUTER_API_KEY || 'missing-key';
const MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

const defaultHeaders = {};
const referer = process.env.OPENROUTER_HTTP_REFERER || process.env.FRONTEND_URL || 'http://localhost:5173';
const title = process.env.OPENROUTER_APP_TITLE || 'Manah';
if (referer) defaultHeaders['HTTP-Referer'] = referer;
if (title) defaultHeaders['X-Title'] = title;

const client = new OpenAI({
  baseURL,
  apiKey,
  defaultHeaders: Object.keys(defaultHeaders).length ? defaultHeaders : undefined,
});

async function withRetry(fn, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503 || err.code === 'ECONNRESET';
      if (!isRetryable || attempt === retries) throw err;

      const delay = Math.pow(2, attempt) * 500;
      console.warn(`[OpenRouter] Attempt ${attempt + 1} failed (${err.status}). Retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function chat(messages) {
  const response = await withRetry(() =>
    client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 512,
      temperature: 0.75,
    }),
  );
  return response.choices[0].message.content;
}

async function* streamChat(messages) {
  const stream = await withRetry(() =>
    client.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 512,
      temperature: 0.75,
      stream: true,
    }),
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

module.exports = { chat, streamChat };
