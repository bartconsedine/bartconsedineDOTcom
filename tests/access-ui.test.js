import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {accessUi,tripUi,button,nodes,field} from './helpers/trip-ui.js';
import {emptyPlan} from '../src/private-apps/japan-trip/model.js';
const data={ownerId:'11111111-1111-4111-8111-111111111111',apps:[{slug:'japan-trip',name:'Japan'}],grants:[]};
test('access read failure offers retry and never shows a writable empty invitation list',async()=>{
 let fail=true;const ui=accessUi(async()=>fail?Response.json({error:'Connection failed'},{status:503}):Response.json(data));let tree=await ui.mount();assert.match(renderToStaticMarkup(tree),/Connection failed/);assert.equal(button(tree,'Grant access'),undefined);
 fail=false;await button(tree,'Retry loading access').props.onClick();tree=ui.render();assert.ok(button(tree,'Grant access'));assert.match(renderToStaticMarkup(tree),/No invitations yet/);
});
test('failed grant preserves email and confirmed save rereads persisted access',async()=>{
 let stored=structuredClone(data),fail=true;const ui=accessUi(async(_u,options={})=>{if(options.method==='POST'){if(fail)return Response.json({error:'Offline'},{status:503});const body=JSON.parse(options.body);stored.grants=[{app_slug:body.slug,invited_email:body.email,role:body.role,updated_at:'2026-10-26T23:00:00Z'}];return Response.json({saved:true});}return Response.json(stored);});let tree=await ui.mount();
 nodes(tree).find(n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'guest@example.com'}});const submit=()=>nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 await submit();await new Promise(r=>setImmediate(r));tree=ui.render();assert.match(renderToStaticMarkup(tree),/Offline/);assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'guest@example.com');assert.equal(stored.grants.length,0);
 fail=false;await submit();await new Promise(r=>setImmediate(r));tree=ui.render();assert.match(renderToStaticMarkup(tree),/Access saved/);assert.match(renderToStaticMarkup(tree),/guest@example.com/);assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'');
 const reloaded=accessUi(async()=>Response.json(stored));assert.match(renderToStaticMarkup(await reloaded.mount()),/guest@example.com/);
});
test('viewer can navigate proposal tab but cannot dirty or save the shared plan',async()=>{
 let writes=0;const ui=tripUi(async(_u,opts={})=>{if(opts.method==='POST')writes++;return Response.json({plan:emptyPlan(),updatedAt:'2026-10-26T23:00:00Z'});},[],{workspaceOwner:data.ownerId,permission:'viewer'});let tree=await ui.mount();assert.match(renderToStaticMarkup(tree),/View-only access/);assert.equal(nodes(tree).find(n=>n.type==='fieldset').props.disabled,true);
 button(tree,'Trip settings').props.onClick();tree=ui.render();field(tree,'Trip name').props.onChange('Attempted edit');await button(ui.render(),'Save changes').props.onClick();assert.equal(writes,0);assert.equal(ui.states[0].title,emptyPlan().title);
 button(ui.render(),'Explore 10 options').props.onClick();assert.equal(button(ui.render(),'Explore 10 options').props['aria-current'],'page');
});
