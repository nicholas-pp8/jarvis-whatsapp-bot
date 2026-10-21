// Runs ONE generated command's usage path in this separate, permission-restricted
// process. Launched by agent.js with node --experimental-permission: fs writes are
// confined to the temp dir, child_process/worker/addons are blocked. Network is NOT
// restricted here - the bodyProblem scan covers private/plain-http targets, and this
// is honest partial containment, not a sandbox. Transport is fully mocked: nothing
// the code "sends" leaves this process.
const candidate = process.argv[2];
const replies = [], sent = [];
try {
  const mod = await import('file://' + candidate + '?t=' + Date.now());
  const cmd = mod.default;
  if (!cmd?.name || typeof cmd.run !== 'function') throw new Error('bad module shape');
  if (cmd.minArgs !== 1) throw new Error('template minArgs changed');
  const sock = {
    sendMessage: async (jid, payload) => { sent.push(String((payload && (payload.text || payload.caption)) || '').slice(0, 300)); return { key: {} }; },
    updateMediaMessage: async () => ({}),
  };
  const ctx = {
    args: [], sender: 'selftest@local', senderJid: 'selftest@local', jid: 'selftest@local',
    isOwner: true, isGroup: false, msg: { key: { id: 'selftest' }, message: { conversation: '' } },
    text: '', commands: [], sock,
    reply: async (t) => { replies.push(String(t).slice(0, 500)); return { key: {} }; },
  };
  await cmd.run(ctx);
  console.log('SELFTEST_JSON:' + JSON.stringify({ ok: true, replies, sent }));
} catch (e) {
  console.log('SELFTEST_JSON:' + JSON.stringify({ ok: false, error: String(e?.message || e).slice(0, 200) }));
}
