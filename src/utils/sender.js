import config from '../config/config.js';

/** Sends one downloaded file to a chat using the best WhatsApp message type. */
export async function sendMediaFile(sock, jid, file, quoted, caption = '') {
  const source = { url: file.path }; // streamed from disk, not loaded into RAM
  let content;
  if (file.type === 'audio') {
    content = { audio: source, mimetype: file.mimetype || 'audio/mp4', ptt: false };
  } else if (file.type === 'image') {
    content = { image: source, caption };
  } else if (file.type === 'video') {
    const size = file.size ?? 0;
    content = size && size > config.limits.maxInlineVideoBytes
      ? { document: source, mimetype: 'video/mp4', fileName: file.fileName || 'video.mp4', caption }
      : { video: source, mimetype: 'video/mp4', caption };
  } else {
    content = { document: source, mimetype: file.mimetype || 'application/octet-stream', fileName: file.fileName || 'file', caption };
  }
  return sock.sendMessage(jid, content, { quoted });
}
