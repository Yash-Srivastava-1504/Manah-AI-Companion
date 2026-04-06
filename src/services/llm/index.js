'use strict';

function useOpenRouter() {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key || key.startsWith('your_') || key === 'missing-key') return false;
  return true;
}

/**
 * Active LLM: mock | OpenRouter (if OPENROUTER_API_KEY set) | Qubrid (fallback).
 */
function getLLMAdapter() {
  if (process.env.USE_MOCK_LLM === 'true') {
    return require('./mockAdapter');
  }
  if (useOpenRouter()) {
    return require('./openRouterAdapter');
  }
  return require('./qubridAdapter');
}

function getLLMProviderLabel() {
  if (process.env.USE_MOCK_LLM === 'true') return 'mock';
  if (useOpenRouter()) return `openrouter:${process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'}`;
  return `qubrid:${process.env.QUBRID_MODEL || 'google/gemini-2.5-flash'}`;
}

module.exports = { getLLMAdapter, getLLMProviderLabel };
