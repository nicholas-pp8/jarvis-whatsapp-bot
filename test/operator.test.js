import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'op-')); const cwd = process.cwd();
process.env.DATA_FOLDER = tmp; process.chdir(tmp); fs.mkdirSync('data');
const root = cwd + '/src/';
const ops = await import(root + 'permissions/operators.js');
const sh = await import(root + 'utilities/ownershell.js');
const { handlePendingAnswer } = await import(root + 'commands/agent.js');
const { config } = await import(root + 'config.js').catch(() => ({ config: null }));
const NUM = '911234567890';
const setFile = (o) => fs.writeFileSync(path.join('data', 'agent-operators.json'), typeof o === 'string' ? o : JSON.stringify(o));
const idn = (n, v = true) => ({ verified: v, phoneNumber: n, senderJid: n + '@s.whatsapp.net' });
test('no file, bad json, bad numbers -> nobody is an operator', () => {
  assert.deepEqual(ops.operatorNumbers(), []);
  setFile('{nope'); assert.deepEqual(ops.operatorNumbers(), []);
  setFile({ numbers: ['abc', '123', '+0123456789012', NUM] }); assert.deepEqual(ops.operatorNumbers(), [NUM]);
});
test('operatorIdentity needs: listed + verified + private chat', () => {
  setFile({ numbers: [NUM] });
  assert.equal(ops.operatorIdentity(idn(NUM), 'private'), NUM);
  assert.equal(ops.operatorIdentity(idn(NUM, false), 'private'), null, 'unverified (e.g. unmapped LID) is refused');
  assert.equal(ops.operatorIdentity(idn(NUM), 'group'), null, 'groups are refused');
  assert.equal(ops.operatorIdentity(idn(NUM), 'self'), null);
  assert.equal(ops.operatorIdentity(idn('919999999999'), 'private'), null, 'unlisted number');
  assert.equal(ops.operatorIdentity({ verified: true, phoneNumber: null }, 'private'), null);
});
const dm = (extra = {}) => ({ isOwner: true, operator: NUM, sender: NUM, isGroup: false, jid: NUM + '@s.whatsapp.net', msg: { message: { conversation: 'x' } }, ...extra });
test('isVerifiedOwnerDM for operators: DM, not forwarded, sender equals the verified operator', () => {
  assert.equal(sh.isVerifiedOwnerDM(dm()), true);
  assert.equal(sh.isVerifiedOwnerDM(dm({ isGroup: true })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ jid: '1@g.us' })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ sender: '911111111111' })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ isOwner: false })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ msg: { message: { extendedTextMessage: { contextInfo: { isForwarded: true } } } } })), false);
  assert.equal(sh.isVerifiedOwnerDM(dm({ msg: { message: { extendedTextMessage: { contextInfo: { forwardingScore: 2 } } } } })), false);
});
test('a message that merely claims to be an operator without the handler flag gets nothing', () => {
  assert.equal(sh.isVerifiedOwnerDM({ isOwner: false, sender: NUM, isGroup: false, jid: NUM + '@s.whatsapp.net', msg: {} }), false);
});
test('a staged confirmation only counts from the person who staged it', async () => {
  const replies = [];
  const opCtx = dm({ reply: async (t) => { replies.push(t); } });
  sh.actorStore.run({ actor: 'owner' }, () => sh.stage(['echo hi'], {}));
  assert.equal(await handlePendingAnswer(opCtx, false), false, 'operator cannot answer the owner\'s pending action');
  assert.ok(sh.getPending(), 'still pending');
  sh.clearPending();
  sh.actorStore.run({ actor: 'op:' + NUM }, () => sh.stage(['echo hi'], {}));
  assert.equal(sh.getPending().by, 'op:' + NUM);
  const ownerCtx = { isOwner: true, sender: String(config?.ownerNumber || '').replace(/\D/g, ''), isGroup: false, jid: 'x@s.whatsapp.net', msg: {}, reply: async () => {} };
  assert.equal(await handlePendingAnswer(ownerCtx, false), false, 'owner cannot answer the operator\'s pending action');
  assert.equal(await handlePendingAnswer(opCtx, false), true, 'the operator can cancel their own');
});
process.on('exit', () => { try { process.chdir(cwd); } catch {} });
