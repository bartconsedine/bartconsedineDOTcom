import test from 'node:test';import assert from 'node:assert/strict';
import {cardArticle} from '../src/private-apps/morning-feed/tv/card-article.js';
test('card reader resolves only a currently authorized enabled card; no private content is needed in history',()=>{
 const card={id:'one',enabled:true,title:'Private card',body:'Private saved copy',url:'https://example.com/article?v=7'};
 assert.deepEqual(cardArticle('one',[card]),{kind:'card',title:card.title,url:card.url,summary:card.body,editions:[]});
 assert.equal(cardArticle('other',[card]),null);assert.equal(cardArticle('one',[]),null);assert.equal(cardArticle('one',[{...card,enabled:false}]),null);
 for(const url of ['javascript:alert(1)','https://user:secret@example.com/a'])assert.equal(cardArticle('one',[{...card,url}]),null);
});
