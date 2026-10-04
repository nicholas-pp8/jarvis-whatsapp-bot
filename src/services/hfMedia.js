import {gradioRun, makeLimiter, PublicAiError} from './publicAi.js';

export const EDIT_HOST = 'https://qwen-qwen-image-edit-2509.hf.space';
export const WAN_HOST = 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space';
export const VOICE_HOST = 'https://k2-fsa-omnivoice.hf.space';

export const editLimiter = makeLimiter('EDITIMG', 'EDITIMG_PER_HOUR', 20);
export const animateLimiter = makeLimiter('ANIMATE', 'ANIMATE_PER_HOUR', 10);
export const voiceLimiter = makeLimiter('VOICE', 'VOICE_PER_HOUR', 40);

// Depth-first search for the first {url|path} file object in a Gradio output (handles Gallery items and nested lists).
export function findFile(x, depth = 0) {
  if (!x || depth > 5) return null;
  if (typeof x === 'object' && !Array.isArray(x) && (x.url || x.path) && typeof (x.url || x.path) === 'string') return x;
  const vals = Array.isArray(x) ? x : typeof x === 'object' ? Object.values(x) : [];
  for (const v of vals) { const f = findFile(v, depth + 1); if (f) return f; }
  return null;
}
function quota(e) {
  const m = String(e?.message || '');
  if (/quota|runs limit/i.test(m)) { const err = new PublicAiError('quota'); err.quota = true; return err; }
  return e;
}
async function fileOut(r, label) {
  const f = findFile(r.output?.data?.[0]);
  if (!f) throw new PublicAiError('no ' + label + ' output');
  return r.fetch(f);
}
const clamp8 = (n) => Math.max(256, Math.min(1024, Math.round(n / 8) * 8));

export async function editPhoto(jpeg, prompt, {width = 1024, height = 1024, timeoutMs = 120000, run = gradioRun} = {}) {
  try {
    const r = await run(EDIT_HOST, 0, [[{upload: jpeg, name: 'photo.jpg', type: 'image/jpeg'}], prompt, 0, true, 4, 20, clamp8(height), clamp8(width), false], {timeoutMs});
    return await fileOut(r, 'image');
  } catch (e) { throw quota(e); }
}

export async function animatePhoto(jpeg, prompt, {timeoutMs = 180000, run = gradioRun} = {}) {
  try {
    const r = await run(WAN_HOST, 0, [{upload: jpeg, name: 'photo.jpg', type: 'image/jpeg'}, prompt || 'make this image come alive, cinematic motion, smooth animation', 6, '', 3.5, 1, 1, 42, true], {timeoutMs});
    return await fileOut(r, 'video');
  } catch (e) { throw quota(e); }
}

// OmniVoice "voice design": text + language, voice attributes left on Auto.
export async function speakText(text, language = 'Auto', {timeoutMs = 120000, run = gradioRun} = {}) {
  try {
    const r = await run(VOICE_HOST, 1, [text, language, 32, 2, true, 1, null, true, true, 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto'], {timeoutMs});
    return await fileOut(r, 'audio');
  } catch (e) { throw quota(e); }
}
