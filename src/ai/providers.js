// AI provider registry. To add a provider, add one entry to PROVIDERS and set its key in .env.
// type "openai" works with any OpenAI-compatible chat API (Groq, OpenRouter, DeepSeek, Mistral, ...).
// Free tiers only. Providers without a key are skipped.
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/config.js';
import logger from '../utils/logger.js';

export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Gemini',
    type: 'gemini',
    keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    models: () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']),
  },
  {
    id: 'groq',
    label: 'Groq',
    type: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: ['GROQ_API_KEY'],
    models: () => (process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant']),
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: ['OPENROUTER_API_KEY'],
    models: () => (process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : ['deepseek/deepseek-chat-v3-0324:free']),
  },
];

const SYSTEM = (name) =>
  `You are ${name}, a helpful assistant inside WhatsApp. Reply in the same language and style as the user (Hindi, Hinglish or English). ` +
  'Keep answers short and clear, under about 150 words unless the user asks for detail. Plain text only, light WhatsApp formatting (*bold*) is fine. No markdown headings or tables.';

/** Reads a key from the environment, then from a sibling .env one folder up (shared server .env). */
function readParentEnv() {
  const out = {};
  for (const p of [path.join(config.root, '..', '.env')]) {
    try {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* no parent .env */ }
  }
  return out;
}

function keyFor(p, parentEnv) {
  for (const k of p.keyEnv) {
    const v = (process.env[k] || '').trim();
    if (v) return v;
  }
  for (const k of p.keyEnv) {
    const v = (parentEnv[k] || '').trim();
    if (v) return v;
  }
  return '';
}

export function configuredProviders() {
  const parentEnv = readParentEnv();
  return PROVIDERS.map((p) => ({ ...p, key: keyFor(p, parentEnv) })).filter((p) => p.key);
}

async function httpJson(url, init, ms = 30000) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 120);
    const err = new Error(`HTTP ${r.status}: ${String(msg).slice(0, 160)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

async function callGemini(p, model, question) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const j = await httpJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': p.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM(config.botName) }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: { maxOutputTokens: 700, temperature: 0.7 },
    }),
  });
  const text = (j?.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim();
  if (!text) throw new Error(`empty reply (${j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'no text'})`);
  return text;
}

async function callOpenAi(p, model, question) {
  const j = await httpJson(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${p.key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM(config.botName) }, { role: 'user', content: question }],
      max_tokens: 700,
      temperature: 0.7,
    }),
  });
  const text = (j?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('empty reply');
  return text;
}

/**
 * Asks the providers in order (default first, then the rest). `prefer` is an optional provider id.
 * Returns { text, provider } or throws an Error with .code NO_KEYS / ALL_FAILED.
 */
export async function askAi(question, { prefer } = {}) {
  const list = configuredProviders();
  if (!list.length) {
    const e = new Error('no keys');
    e.code = 'NO_KEYS';
    throw e;
  }
  const ordered = prefer && list.some((p) => p.id === prefer) ? [list.find((p) => p.id === prefer), ...list.filter((p) => p.id !== prefer)] : list;
  for (const p of ordered) {
    for (const model of p.models()) {
      try {
        const text = p.type === 'gemini' ? await callGemini(p, model, question) : await callOpenAi(p, model, question);
        logger.info(`[ai] ok ${p.id}/${model}`);
        return { text, provider: p.label, id: p.id, model };
      } catch (err) {
        logger.warn(`[ai] ${p.id}/${model} failed, status ${Number(err.status)||0}, class ${['Error','TypeError','AbortError'].includes(err.name)?err.name:'Error'}`);
        if (err.status === 401) break; // bad key: skip this provider's other models
      }
    }
  }
  const e = new Error('all failed');
  e.code = 'ALL_FAILED';
  throw e;
}
