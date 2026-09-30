import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkSourceCitations from '../src/utils/sourceCitations.js';
function parse(text) {
  const processor=unified().use(remarkParse).use(remarkMath).use(remarkSourceCitations);
  return processor.runSync(processor.parse(text));
}
function links(tree) {
  return [ ...(tree.type==='link' ? [tree.url] : []), ...(tree.children || []).flatMap(links) ];
}
for(const marker of ['[[S6], [S7]]','[[S6, S7]]','[S6, S7]','[[ S6 ], [ S7 ]]','[[S6]; [S7]]', '[[S6]] [[S7]]', '[S6], [S7]']){
  assert.deepEqual(links(parse('Text '+marker+'.')),['#source-S6','#source-S7'],marker);
}
assert.deepEqual(links(parse('**[[S6], [S7]]**')),['#source-S6','#source-S7']);
assert.equal(parse('**Text [[S6], [S7]]**').children[0].children[0].type,'strong');
assert.deepEqual(links(parse('[[S6], [S6], [S7]]')),['#source-S6','#source-S7']);
for(const literal of ['`[[S6], [S7]]`','```text\n[[S6], [S7]]\n```','~~~text\n[[S6], [S7]]\n~~~','$[S6]$','$$[S6]$$','![S6](/picture.png)']){
  assert.deepEqual(links(parse(literal)),[],literal);
}
assert.deepEqual(links(parse('[S6](https://example.com)')),['https://example.com']);
assert.deepEqual(links(parse('Value [S6 is a variable] and array [6, 7].')),[]);
console.log('Source citation grouping, formatting, and literal-content checks passed.');
