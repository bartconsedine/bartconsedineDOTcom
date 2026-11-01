import test from 'node:test';
import assert from 'node:assert/strict';
import { textPages } from '../src/private-apps/morning-feed/tv/pagination.js';
test('summary pages fit their measured budget without dropping or rewriting source text',()=>{
 const original=('Original summary sentence with punctuation.\n\n• Newsletter detail  📰\n').repeat(50);
 for(const budget of [40,90,250,1000]){const pages=textPages(original,t=>t.length<=budget);assert.ok(pages.length>1);assert.equal(pages.join(''),original);assert.ok(pages.every(p=>p.length<=budget));}
});
test('empty summaries, unbroken URLs and changed viewport budgets remain lossless',()=>{
 assert.deepEqual(textPages('',()=>true),['']);const text='https://example.com/'+ 'x'.repeat(500);const small=textPages(text,t=>t.length<=35),large=textPages(text,t=>t.length<=120);assert.equal(small.join(''),text);assert.equal(large.join(''),text);assert.ok(small.length>large.length);assert.ok(small.every(p=>p.length<=35));
});
