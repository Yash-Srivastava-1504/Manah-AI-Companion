'use strict';
const { getLLMAdapter } = require('../services/llm');
const { buildPromptFromThread } = require('../services/promptBuilder');
const { detectCrisis, HELPLINE_RESPONSE } = require('../middleware/crisis');

const VALID_COMPANIONS = new Set(['didi', 'bhaiya', 'friend']);
const VALID_LANGS = new Set(['en', 'hi', 'hinglish']);

const MAX_CONTENT_LEN = 8000;
const MAX_THREAD_MESSAGES = 32;

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function writeSse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
  if (typeof res.flush === 'function') res.flush();
}

function sanitizeContent(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\0/g, '').trim().slice(0, MAX_CONTENT_LEN);
}

function mapHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((h) => {
      const role = h.role === 'user' ? 'user' : 'assistant';
      const text = typeof h.content === 'string' ? h.content : typeof h.text === 'string' ? h.text : '';
      return { sender: role, text };
    })
    .filter((h) => h.text.length > 0);
}

function normalizeThreadMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    const content = sanitizeContent(typeof m.content === 'string' ? m.content : String(m.content ?? ''));
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-MAX_THREAD_MESSAGES);
}

/** Full thread from body.messages [{ role, content }] (preferred). */
function threadFromMessagesBody(body) {
  return normalizeThreadMessages(body?.messages);
}

/** Legacy: message + history → thread ending with user. */
function threadFromLegacyBody(body) {
  const { message, history = [] } = body || {};
  const mappedHistory = mapHistory(history);
  const out = [];
  for (const m of mappedHistory) {
    const content = sanitizeContent(m.text);
    if (!content) continue;
    out.push({ role: m.sender === 'user' ? 'user' : 'assistant', content });
  }
  const u = sanitizeContent(typeof message === 'string' ? message : '');
  if (u) out.push({ role: 'user', content: u });
  return normalizeThreadMessages(out);
}

function resolveThread(req) {
  const body = req.body || {};
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return threadFromMessagesBody(body);
  }
  return threadFromLegacyBody(body);
}

/**
 * POST /api/companion/chat
 * Body (preferred): { messages: [{ role, content }], companion?, language? } — full thread, last message must be user.
 * Legacy: { message, history?, companion?, language? }
 * Response: SSE — { delta, done:false }, final { done:true }, or { error, stream_error, done }, crisis bundle.
 */
async function companionChatStream(req, res) {
  const body = req.body || {};
  const companion = body.companion ?? 'friend';
  const language = body.language ?? 'hinglish';
  const tone = VALID_COMPANIONS.has(companion) ? companion : 'friend';
  const lang = VALID_LANGS.has(language) ? language : 'hinglish';

  const thread = resolveThread(req);
  if (!thread.length || thread[thread.length - 1].role !== 'user') {
    return res.status(400).json({
      error: 'Invalid request: send messages as a non-empty array ending with role "user".',
    });
  }

  const lastUserText = thread[thread.length - 1].content;

  if (detectCrisis(lastUserText)) {
    sseHeaders(res);
    writeSse(res, {
      crisis: true,
      reply: HELPLINE_RESPONSE.reply,
      helplines: HELPLINE_RESPONSE.helplines,
    });
    writeSse(res, { done: true });
    return res.end();
  }

  const llmMessages = buildPromptFromThread({ thread, tone, language: lang, memorySummary: null });

  sseHeaders(res);

  const llm = getLLMAdapter();

  try {
    for await (const delta of llm.streamChat(llmMessages)) {
      writeSse(res, { delta, done: false });
    }
  } catch (err) {
    console.error('[COMPANION] LLM stream error:', err.message);
    writeSse(res, {
      error: 'We could not finish the reply. Please try again in a moment.',
      stream_error: true,
      done: true,
    });
    return res.end();
  }

  writeSse(res, { delta: '', done: true });
  res.end();
}

module.exports = { companionChatStream };
