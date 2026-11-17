import test from 'node:test';
import assert from 'node:assert/strict';
import { pageForOffset, textPages } from '../src/private-apps/morning-feed/tv/pagination.js';
test('summary pages fit their measured budget without dropping or rewriting source text',()=>{
 const original=('Original summary sentence with punctuation.\n\n• Newsletter detail  📰\n').repeat(50);
 for(const budget of [40,90,250,1000]){const pages=textPages(original,t=>t.length<=budget);assert.ok(pages.length>1);assert.equal(pages.join(''),original);assert.ok(pages.every(p=>p.length<=budget));}
});
test('empty summaries, unbroken URLs and changed viewport budgets remain lossless',()=>{
 assert.deepEqual(textPages('',()=>true),['']);const text='https://example.com/'+ 'x'.repeat(500);const small=textPages(text,t=>t.length<=35),large=textPages(text,t=>t.length<=120);assert.equal(small.join(''),text);assert.equal(large.join(''),text);assert.ok(small.length>large.length);assert.ok(small.every(p=>p.length<=35));
});

test('page boundaries keep surrogate pairs intact even when a glyph exceeds the measured budget',()=>{
 const original='📰a🧭b';const pages=textPages(original,text=>text.length<=1);assert.equal(pages.join(''),original);assert.deepEqual(pages,['📰','a','🧭','b']);
 assert.equal(pageForOffset(['first','second','last'],5),1);assert.equal(pageForOffset(['first','second','last'],999),2);assert.equal(pageForOffset([''],0),0);
});

test('rendered pager keeps the original reading character through resize and resets only for new text',async()=>{
 const {readFileSync}=await import('node:fs'),{createRequire}=await import('node:module'),{runInNewContext}=await import('node:vm');const {createUiRuntime}=await import('./helpers/ui-runtime.js');const {nodes}=await import('./helpers/trip-ui.js');const require=createRequire(import.meta.url);
 let budget=40,resize;const pane={clientHeight:100,clientWidth:600},measure={textContent:'',getBoundingClientRect(){return{height:this.textContent.length<=budget?20:200};}};const runtime=createUiRuntime([{current:pane},{current:measure}]);const pagesSeen=[];
 const {code}=require('next/dist/compiled/babel/core').transformSync(readFileSync(new URL('../src/private-apps/morning-feed/tv/paged-text.js',import.meta.url),'utf8'),{babelrc:false,configFile:false,presets:[[require('next/dist/compiled/babel/preset-react'),{runtime:'automatic'}]],plugins:[require('next/dist/compiled/babel/plugin-transform-modules-commonjs')]});const module={exports:{}};
 runInNewContext(code,{module,exports:module.exports,ResizeObserver:class{constructor(callback){resize=callback;}observe(){}disconnect(){}},requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){},window:{addEventListener(){},removeEventListener(){}},document:{fonts:{ready:{then(){}}}},require:name=>name==='react'?runtime.hooks:name==='react/jsx-runtime'?require(name):{pageForOffset,textPages}});
 const original=Array.from({length:240},(_,index)=>String.fromCharCode(0x100+index)).join('');let text=original,props={};const render=()=>runtime.render(()=>module.exports.default({text,label:'Summary',onPage:value=>pagesSeen.push(value),...props}));const copy=()=>nodes(render()).find(node=>Object.hasOwn(node.props??{},'data-text-page')).props.children;const next=()=>nodes(render()).find(node=>node.props?.['aria-label']==='Next summary page');
 render();assert.equal(copy(),original.slice(0,40));next().props.onClick();next().props.onClick();assert.equal(copy(),original.slice(80,120));budget=30;resize();assert.equal(copy(),original.slice(60,90));budget=80;resize();assert.equal(copy(),original.slice(80,160));assert.equal(pagesSeen.at(-1),1);
 text='A different story.';render();assert.equal(copy(),text);assert.equal(pagesSeen.at(-1),0);
 let opened=0;props={label:'Headline',onActivate:()=>opened++,activationClassName:'tldr-headline',textClassName:'tldr-title',activationLabel:'Open full source',hideSinglePageControls:true};render();assert.equal(nodes(render()).some(node=>node.props?.className==='tv-page-controls'),false);
 text=original;render();let reconstructed='';for(let count=0;count<20;count++){reconstructed+=copy();const advance=nodes(render()).find(node=>node.props?.['aria-label']==='Next headline page');if(advance.props.disabled)break;advance.props.onClick();}assert.equal(reconstructed,original);assert.equal(opened,0);nodes(render()).find(node=>node.props?.['aria-label']==='Open full source').props.onClick();assert.equal(opened,1);
 props={label:'Headline',textClassName:'tv-article-title',hideSinglePageControls:true};assert.equal(nodes(render()).find(node=>Object.hasOwn(node.props??{},'data-text-page')).props.className,'tv-article-title');runtime.unmount();
});
