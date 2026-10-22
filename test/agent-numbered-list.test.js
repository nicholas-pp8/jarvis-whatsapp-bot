import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNumberedList } from '../src/commands/agent.js';
// Input is what WhatsApp args give the command: whitespace-collapsed (newlines become spaces).
const goal21 = 'download all the songs individually from the playlist given by me 1. afran jalebi 2. Lal pari 3. Awarapan 4. Phir se 5. Aawaara angaara 6. Hale dil 7. Deewana kar raha hai 8. Shayad 9. Titli 10. Tera ban jaunga 11. Khairiyat 12. Ahista 13. Sanam teri kasam 14. pehle bhi main 15.bandeya 16.samjhawan 17.arz kiya hai 18.baaton ko teri 19.sanson kj mala 20. Parda hata do jara mukhra dikha do 21. Tere liye';
test('21-item list from the real report is fully extracted, in order, nothing dropped', () => {
  const l = extractNumberedList(goal21);
  assert.equal(l.length, 21);
  assert.equal(l[0], 'afran jalebi'); assert.equal(l[14], 'bandeya'); assert.equal(l[19], 'Parda hata do jara mukhra dikha do'); assert.equal(l[20], 'Tere liye');
});
test('the old 300-char cut would have kept only 15-16 items (documents the bug)', () => {
  assert.ok(goal21.length > 300);
  const l = extractNumberedList(goal21.slice(0, 300));
  assert.ok(l.length < 21 && l.length >= 14);
});
test('huge list: 5000 items extracted exactly', () => {
  const g = 'download ' + Array.from({ length: 5000 }, (_, i) => `${i + 1}. song number ${i + 1}`).join(' ');
  const l = extractNumberedList(g);
  assert.equal(l.length, 5000); assert.equal(l[4999], 'song number 5000');
});
test('non-lists are not treated as lists', () => {
  assert.deepEqual(extractNumberedList('download arijit singh love songs'), []);
  assert.deepEqual(extractNumberedList('top 10. best songs of 2020. and 3. more'), []);
  assert.deepEqual(extractNumberedList('1. only one 2. two'), []);
  assert.deepEqual(extractNumberedList('play 3.5 hours of music 1. a 2. b'), []);
});
test('one per line (newlines kept) also works', () => {
  assert.deepEqual(extractNumberedList('get these\n1. a b\n2) c\n3. d'), ['a b', 'c', 'd']);
});
