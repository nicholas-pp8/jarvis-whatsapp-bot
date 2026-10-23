import QRCode from 'qrcode';
import sharp from 'sharp';

// Heart-themed pairing QR. The QR matrix is untouched (full square, quiet zone,
// square finder patterns, dark modules on a white panel); the heart is artwork
// around and in the middle of it, so scanning is not weakened.

const HEART = 'M0,-0.62 C-0.05,-0.95 -0.62,-1.02 -0.92,-0.62 C-1.2,-0.2 -0.85,0.25 0,1 C0.85,0.25 1.2,-0.2 0.92,-0.62 C0.62,-1.02 0.05,-0.95 0,-0.62 Z';

export async function renderHeartQr(qr, size = 768) {
  const q = QRCode.create(qr, { errorCorrectionLevel: 'H' });
  const n = q.modules.size;
  const data = q.modules.data;
  const quiet = 4;
  const panel = Math.floor(size * 0.66 / (n + quiet * 2)) * (n + quiet * 2);
  const cell = panel / (n + quiet * 2);
  const px = (size - panel) / 2;
  const py = size * 0.5 - panel / 2 + size * 0.02;
  const cx = size / 2, cy = py + panel / 2;
  let rects = '';
  const ink = '#4a0a1f';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!data[r * n + c]) continue;
    const x = px + (c + quiet) * cell, y = py + (r + quiet) * cell;
    rects += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cell + 0.4).toFixed(2)}" height="${(cell + 0.4).toFixed(2)}"/>`;
  }
  // centre heart: ~9% of QR width, inside the H-level error correction budget
  const hs = panel * 0.065;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7aa8"/><stop offset="1" stop-color="#e0245e"/></linearGradient></defs>
<rect width="${size}" height="${size}" fill="#fff0f5"/>
<g transform="translate(${size / 2} ${size * 0.47}) scale(${size * 0.48})"><path d="${HEART}" fill="url(#g)"/></g>
<rect x="${px}" y="${py}" width="${panel}" height="${panel}" rx="${cell * 2}" fill="#ffffff"/>
<g fill="${ink}" shape-rendering="crispEdges">${rects}</g>
<g transform="translate(${cx} ${cy}) scale(${hs})"><rect x="-1.35" y="-1.25" width="2.7" height="2.55" rx="0.5" fill="#fff"/><path d="${HEART}" fill="#e0245e"/></g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
