import fs from 'node:fs/promises';
import config from '../config/config.js';
import { DownloadError, httpDownload } from '../utils/downloader.js';
import { safeFileName } from '../utils/fileManager.js';

export const name = 'pinterest';

const PIN_HOST = /(^|\.)pinterest\.[a-z.]+$/i;
const MEDIA_HOSTS = ['pinimg.com', 'pinterest.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function matches(url) {
  return PIN_HOST.test(url.hostname) || url.hostname === 'pin.it';
}

/** Follows pin.it short links manually, staying on Pinterest hosts only. */
async function resolveShort(url) {
  let current = url;
  for (let i = 0; i < 3 && current.hostname === 'pin.it'; i++) {
    const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': UA } });
    const loc = res.headers.get('location');
    if (!loc) break;
    const next = new URL(loc, current);
    if (next.protocol !== 'https:' || !(PIN_HOST.test(next.hostname) || next.hostname === 'pin.it')) {
      throw new DownloadError('❌ That link does not point to a Pinterest pin.', { code: 'INVALID' });
    }
    current = next;
  }
  return current;
}

function pinId(url) {
  const m = url.pathname.match(/\/pin\/(?:[^/]*--)?(\d{5,25})/);
  return m ? m[1] : null;
}

async function fetchPin(id) {
  const data = JSON.stringify({ options: { id, field_set_key: 'detailed' }, context: {} });
  const api = new URL('https://www.pinterest.com/resource/PinResource/get/');
  api.searchParams.set('data', data);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(api, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/json', 'x-pinterest-pws-handler': 'www/pin/[id].js' } });
    if (res.status === 404) throw new DownloadError('❌ This pin was not found. It may have been deleted.', { code: 'UNAVAILABLE' });
    if (!res.ok) throw new DownloadError('❌ Pinterest did not return this pin.\n\nIt may be private or unavailable.', { code: 'FAILED' });
    const json = await res.json();
    const pin = json?.resource_response?.data;
    if (!pin || json.resource_response.status !== 'success') throw new DownloadError('❌ This pin was not found or is private.', { code: 'UNAVAILABLE' });
    return pin;
  } catch (err) {
    if (err instanceof DownloadError) throw err;
    throw new DownloadError('📡 Network problem while contacting Pinterest. Please try again.', { code: 'NETWORK', cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/** Picks the best media URL from the pin payload. */
export function pickMedia(pin) {
  const list = pin?.videos?.video_list || pin?.story_pin_data?.pages?.[0]?.blocks?.find((b) => b.video)?.video?.video_list;
  if (list) {
    const mp4 = Object.values(list)
      .filter((v) => v?.url && /\.mp4(\?|$)/i.test(v.url))
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    const fit = mp4.find((v) => (v.height || 0) <= 720) || mp4[0];
    if (fit) return { kind: 'video', url: fit.url };
  }
  const img = pin?.images?.orig?.url || pin?.images?.['736x']?.url || pin?.images?.['564x']?.url;
  if (img) return { kind: 'image', url: img };
  return null;
}

export async function download(url, { dir }) {
  const full = await resolveShort(url).catch((e) => {
    if (e instanceof DownloadError) throw e;
    throw new DownloadError('📡 Network problem while opening the link.', { code: 'NETWORK', cause: e });
  });
  const id = pinId(full);
  if (!id) throw new DownloadError('❌ That does not look like a Pinterest pin link.\n\nExample: https://www.pinterest.com/pin/123456789/', { code: 'INVALID' });

  const pin = await fetchPin(id);
  const media = pickMedia(pin);
  if (!media) throw new DownloadError('❌ No downloadable image or video was found on this pin.', { code: 'NO_MEDIA' });

  let res;
  try {
    res = await httpDownload(media.url, dir, { allowedHosts: MEDIA_HOSTS, baseName: `pin-${id}` });
  } catch (err) {
    if (err.code === 'TOO_LARGE') throw new DownloadError(`📦 This file is larger than the ${Math.round(config.limits.maxFileBytes / 1048576)} MB limit.`, { code: 'TOO_LARGE' });
    throw err;
  }
  const title = safeFileName(pin.title || pin.grid_title || pin.description || `pin-${id}`, `pin-${id}`).slice(0, 60);
  const stat = await fs.stat(res.path);
  return {
    title,
    files: [{ path: res.path, type: media.kind, mimetype: res.contentType, fileName: res.path.split('/').pop(), size: stat.size }],
  };
}

/** Searches Pinterest pins by text. Returns { url, title } for the top usable pin, or null. */
export async function searchPin(query) {
  const u = new URL('https://www.pinterest.com/resource/BaseSearchResource/get/');
  u.searchParams.set('source_url', `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`);
  u.searchParams.set('data', JSON.stringify({ options: { query, scope: 'pins', rs: 'typed', page_size: 25 }, context: {} }));
  const res = await fetch(u, {
    signal: AbortSignal.timeout(25_000),
    headers: { 'user-agent': UA, accept: 'application/json', 'x-pinterest-pws-handler': 'www/search/[scope].js', 'x-requested-with': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const list = json?.resource_response?.data?.results || [];
  const pin = list.find((p) => p?.id && p.type === 'pin' && (p.images?.orig?.url || p.images?.['736x']?.url));
  if (!pin) return null;
  const title = String(pin.title || pin.grid_title || pin.description || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { url: `https://www.pinterest.com/pin/${pin.id}/`, title };
}
