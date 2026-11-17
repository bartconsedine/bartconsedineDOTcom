import test from 'node:test';import assert from 'node:assert/strict';import {partyUi,nodes,button} from './helpers/trip-ui.js';
const id='11111111-1111-4111-8111-111111111111';
const text=tree=>nodes(tree).map(n=>typeof n.props?.children==='string'?n.props.children:'').join(' ');
test('board distinguishes loading, empty, database failure and viewer access without invented records',async()=>{
 const failed=partyUi(async()=>Response.json({error:'Migration pending'},{status:503}));assert.match(text(failed.render()),/Opening Robot Party/);assert.match(text(await failed.mount()),/Migration pending/);assert.ok(button(failed.render(),'Retry opening board'));assert.equal(button(failed.render(),'Publish post'),undefined);
 const empty=partyUi(async()=>Response.json({threads:[],next:null,viewer:{id,role:'viewer'}}),{permission:'viewer'});const tree=await empty.mount();assert.match(text(tree),/party starts/);assert.equal(button(tree,'Start a conversation').props.disabled,true);assert.ok(button(tree,'Connect a dot or robot'));assert.equal(nodes(tree).filter(n=>n.type==='a'&&n.props.children==='Invite people').length,0);
});
test('failed and conflicted publishing keeps the draft; confirmed database save opens the new thread',async()=>{
 let status=503,writes=0,last;const row={id,parent_id:null,author_id:id,author_label:'Member',robot_name:'',kind:'update',status:'working',title:'A new idea',body:'The draft should survive a failed write',tags:[],project_url:'',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const ui=partyUi(async(url,options={})=>{if(options.method==='POST'){writes++;last=JSON.parse(options.body);return Response.json(status===200?{saved:true,message:row}:{error:'Save not confirmed'},{status});}return Response.json(String(url).includes('thread=')?{thread:row,replies:[],next:null}:{threads:[],next:null,viewer:{id,role:'owner'}});});
 await ui.mount();button(ui.render(),'Start a conversation').props.onClick();let form=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Publish post');form.props.onChange({...form.props.value,title:row.title,body:row.body});form=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Publish post');await form.props.onSubmit();assert.equal(writes,1);assert.match(text(ui.render()),/Save not confirmed/);assert.equal(nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Publish post').props.value.body,row.body);
 const firstId=last.id;status=409;await form.props.onSubmit();assert.equal(last.id,firstId);status=200;await form.props.onSubmit();assert.match(text(ui.render()),/Published to this board/);assert.match(text(ui.render()),/A new idea/);assert.equal(button(ui.render(),'Publish post'),undefined);
});
test('viewers can create reader tokens for the shared board, see a key once and clear it when the panel closes',async()=>{
 const requests=[],token='rp_'+'S'.repeat(43);const ui=partyUi(async(url,options={})=>{
 requests.push({url,options});if(String(url).includes('/robots'))return Response.json(options.method==='POST'?{saved:true,token,robot:{id}}:{robots:[]});return Response.json({threads:[],next:null,viewer:{id,role:'viewer'}});
 },{permission:'viewer',workspaceOwner:id});await ui.mount();await button(ui.render(),'Connect a dot or robot').props.onClick();await new Promise(resolve=>setImmediate(resolve));let tree=ui.render();assert.ok(requests.some(r=>r.url==='/api/admin/robot-party/robots?owner='+id));assert.equal(nodes(tree).filter(n=>n.type==='option'&&n.props.value==='writer').length,0);
 const name=nodes(tree).find(n=>n.type==='input'&&n.props.maxLength===60);name.props.onChange({target:{value:'My robot'}});tree=ui.render();const form=nodes(tree).find(n=>n.type==='form'&&nodes(n).some(child=>child.type==='button'&&child.props.children==='Create API token'));form.props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));tree=ui.render();assert.ok(nodes(tree).some(n=>n.type==='input'&&n.props.value===token));const write=requests.find(r=>r.options.method==='POST');assert.equal(JSON.parse(write.options.body).role,'reader');assert.ok(write.url.endsWith('?owner='+id));button(tree,'Connect a dot or robot').props.onClick();tree=ui.render();assert.equal(nodes(tree).some(n=>n.type==='input'&&n.props.value===token),false);
});
test('workspace remounts app state when board, signed-in user or permission changes',async()=>{
 const {readFileSync}=await import('node:fs');const {createRequire}=await import('node:module');const {runInNewContext}=await import('node:vm');const require=createRequire(import.meta.url);const {transformSync}=require('next/dist/compiled/babel/core');
 const {code}=transformSync(readFileSync(new URL('../src/app/admin/apps/[slug]/page.js',import.meta.url),'utf8'),{babelrc:false,configFile:false,presets:[[require('next/dist/compiled/babel/preset-react'),{runtime:'automatic'}]],plugins:[require('next/dist/compiled/babel/plugin-transform-modules-commonjs')]});
 const Component=()=>null;let actor=id,owner=id,role='owner';const module={exports:{}};
 runInNewContext(code,{module,exports:module.exports,require:name=>name==='react/jsx-runtime'?require(name):name==='next/link'?{default:()=>null,__esModule:true}:name==='next/navigation'?{notFound:()=>{throw Error('not found');}}:name==='@/lib/auth'?{requireWorkspace:async()=>({user:{id:actor}})}:name==='@/components/workspace-icon'?{default:()=>null,__esModule:true}:name==='@/lib/workspace-presentation'?{appPresentation:()=>({color:'#7dcfff'}),roleLabel:role=>role}:name==='@/lib/apps'?{getApp:async()=>({Component,name:'Robot Party',description:'Board',access:{ownerId:owner,role}})}:null});
 const key=async()=>{const tree=await module.exports.default({params:Promise.resolve({slug:'robot-party'}),searchParams:Promise.resolve({owner})});return tree.props.children.find(child=>child?.type===Component).key;};
 const original=await key();owner='22222222-2222-4222-8222-222222222222';const second=await key();assert.notEqual(original,second);role='viewer';const third=await key();assert.notEqual(second,third);actor='33333333-3333-4333-8333-333333333333';assert.notEqual(third,await key());
});

test('narrow conversation navigation preserves a compose draft and reset filters keeps the owner selector',async()=>{
 const calls=[];const ui=partyUi(async url=>{calls.push(String(url));return Response.json({threads:[],next:null,viewer:{id,role:'owner'}});},{workspaceOwner:id});await ui.mount();
 const layout=()=>nodes(ui.render()).find(n=>n.props.className==='rp-layout');assert.equal(layout().props['data-reading'],false);
 button(ui.render(),'Start a conversation').props.onClick();assert.equal(layout().props['data-reading'],true);
 let form=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Publish post');form.props.onChange({...form.props.value,title:'Still drafting',body:'Keep this idea while I browse.'});
 button(ui.render(),'← All conversations').props.onClick();assert.equal(layout().props['data-reading'],false);
 button(ui.render(),'Start a conversation').props.onClick();form=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Publish post');assert.equal(form.props.value.body,'Keep this idea while I browse.');
 button(ui.render(),'← All conversations').props.onClick();nodes(ui.render()).find(n=>n.type==='input'&&n.props.placeholder==='Search the party…').props.onChange({target:{value:'signal'}});
 nodes(ui.render()).find(n=>n.type==='form'&&n.props.className==='rp-search').props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.at(-1).includes('q=signal'));button(ui.render(),'Clear filters').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.at(-1),'/api/admin/apps/robot-party?owner='+id);assert.equal(nodes(ui.render()).find(n=>n.type==='input'&&n.props.placeholder==='Search the party…').props.value,'');ui.close();
});

test('returning to the feed preserves message edits and their original revision through a conflict',async()=>{
 const originalAt='2026-11-16T12:00:00Z';let row={id,parent_id:null,author_id:id,author_label:'Member',robot_name:'',actor_kind:'human',kind:'update',status:'working',title:'A saved post',body:'Original body',tags:[],project_url:'',created_at:originalAt,updated_at:originalAt};const writes=[];
 const ui=partyUi(async(url,options={})=>{if(options.method==='POST'){writes.push(JSON.parse(options.body));return Response.json({error:'This message changed. Your edit was not saved.'},{status:409});}return Response.json(String(url).includes('thread=')?{thread:row,replies:[],next:null}:{threads:[row],next:null,viewer:{id,role:'owner'}});});await ui.mount();
 const thread=()=>nodes(ui.render()).find(n=>n.props.className==='rp-thread-card');
 const editor=()=>nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Save message');
 await thread().props.onClick();button(ui.render(),'Edit message').props.onClick();editor().props.onChange({...editor().props.value,body:'A careful unpublished edit'});
 button(ui.render(),'← All conversations').props.onClick();assert.equal(editor(),undefined);
 row={...row,body:'A newer saved version',updated_at:'2026-11-16T12:05:00Z'};
 await thread().props.onClick();assert.match(text(ui.render()),/Unsaved edit on this page/);button(ui.render(),'Edit message').props.onClick();assert.equal(editor().props.value.body,'A careful unpublished edit');
 await editor().props.onSubmit();assert.equal(writes.length,1);assert.equal(writes[0].expectedAt,originalAt);assert.equal(writes[0].content.body,'A careful unpublished edit');assert.equal(editor().props.value.body,'A careful unpublished edit');
 button(ui.render(),'Cancel editing').props.onClick();button(ui.render(),'Edit message').props.onClick();assert.equal(editor().props.value.body,'A newer saved version');ui.close();
});

test('reader and composer return keyboard focus to their source with a removed-thread fallback',async()=>{
 const row={id,parent_id:null,author_id:id,author_label:'Member',robot_name:'',kind:'update',status:'working',title:'A saved post',body:'A conversation',tags:[],project_url:'',created_at:'2026-11-16T12:00:00Z',updated_at:'2026-11-16T12:00:00Z'};
 const ui=partyUi(async url=>Response.json(String(url).includes('thread=')?{thread:row,replies:[],next:null}:{threads:[row],next:null,viewer:{id,role:'owner'}}));await ui.mount();const focused=[];
 const target=name=>({focus(){focused.push(name);}});const tree=ui.render();
 nodes(tree).find(n=>n.props.className==='rp-detail').props.ref.current=target('detail');
 nodes(tree).find(n=>n.props.className==='rp-feed').props.ref.current=target('feed');
 button(tree,'Start a conversation').props.ref.current=target('compose');
 const thread=()=>nodes(ui.render()).find(n=>n.props.className==='rp-thread-card');thread().props.ref(target('thread'));
 await thread().props.onClick();ui.render();assert.equal(focused.at(-1),'detail');button(ui.render(),'← All conversations').props.onClick();ui.render();assert.equal(focused.at(-1),'thread');
 button(ui.render(),'Start a conversation').props.onClick();ui.render();assert.equal(focused.at(-1),'detail');button(ui.render(),'Cancel editing').props.onClick();ui.render();assert.equal(focused.at(-1),'compose');
 await thread().props.onClick();ui.render();thread().props.ref(null);button(ui.render(),'← All conversations').props.onClick();ui.render();assert.equal(focused.at(-1),'feed');ui.close();
});
