import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { renderToStaticMarkup } from 'react-dom/server';
const ready={state:'ready',canSend:true,recipientConnectionId:'11111111-1111-4111-8111-111111111111'};
const markup=ui=>renderToStaticMarkup(ui.render());
const draft=ui=>nodes(ui.render()).find(n=>n.type==='textarea');
const submit=ui=>nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
test('TV sends through the private API, confirms only queued saves and pumps delivery',async()=>{
 const calls=[];const ui=tickerUi(async(url,options={})=>{assert.equal(url,'/api/tv/commands');if(!options.method)return Response.json(ready);const input=JSON.parse(options.body);calls.push(input);return Response.json(input.action==='send'?{saved:true,accepted:true,id:input.id,delivery:'queued'}:{attempted:false,recorded:false});},{},false,'tv/command-box.js');
 try {await ui.settle();draft(ui).props.onChange({target:{value:'Summarize my next steps'}});await ui.settle();await submit(ui);await ui.settle();assert.equal(draft(ui).props.value,'');assert.match(markup(ui),/Saved to your private queue/);assert.match(markup(ui),/does not confirm execution/);assert.deepEqual(calls.filter(c=>c.action==='send').map(c=>c.body),['Summarize my next steps']);assert.ok(calls.filter(c=>c.action==='dispatch').length>=2);}finally{ui.close();}
});
test('uncertain saves preserve the exact UUID and text across retries',async()=>{
 const sends=[];let fail=true;const ui=tickerUi(async(_,options={})=>{if(!options.method)return Response.json(ready);const command=JSON.parse(options.body);if(command.action==='dispatch')return Response.json({attempted:false});sends.push(command);if(fail)throw new TypeError('Network unavailable');return Response.json({saved:true,accepted:true,id:command.id,delivery:'queued'});},{},false,'tv/command-box.js');
 try {await ui.settle();draft(ui).props.onChange({target:{value:'A private command'}});await ui.settle();await submit(ui);await ui.settle();assert.equal(draft(ui).props.value,'A private command');assert.equal(draft(ui).props.readOnly,true);assert.ok(button(ui.render(),'Retry same command'));fail=false;await submit(ui);await ui.settle();assert.equal(sends.length,2);assert.deepEqual(sends[0],sends[1]);assert.equal(draft(ui).props.value,'');}finally{ui.close();}
});
test('disconnected status and revoked sessions disable sending; refresh recovers service failure',async()=>{
 let response=Response.json({state:'disconnected',canSend:false});const ui=tickerUi(async()=>response.clone(),{},false,'tv/command-box.js');
 try {await ui.settle();assert.equal(draft(ui).props.disabled,true);assert.ok(nodes(ui.render()).some(n=>n.props?.href==='/admin/apps/robot-party/personal'));response=Response.json({error:'Owner sign-in required'},{status:401});await ui.tick(15000);assert.equal(draft(ui).props.disabled,true);assert.match(markup(ui),/Owner sign-in required/);response=Response.json({state:'disconnected',canSend:false});await button(ui.render(),'Check connection').props.onClick();await ui.settle();assert.doesNotMatch(markup(ui),/Owner sign-in required/);}finally{ui.close();}
});
test('Calendar missing Google access offers explicit device-only sign-out before phone QR, preserving failed sign-out',async()=>{
 const urls=[];const ui=tickerUi(async(url,options={})=>{urls.push([url,options.method]);return url==='/auth/signout'?Response.json({error:'unavailable'},{status:503}):Response.json({connection:'required',error:'Connect Google Calendar'});},{locked:false},false,'tv/calendar.js');
 try{await ui.settle();assert.match(markup(ui),/Your phone stays signed in/);assert.equal(urls.length,1);await button(ui.render(),'Sign out this screen and show QR code').props.onClick();await ui.settle();assert.deepEqual(urls[1],['/auth/signout','POST']);assert.match(markup(ui),/Could not sign out this screen/);assert.equal(button(ui.render(),'Sign out this screen and show QR code').props.disabled,false);}finally{ui.close();}
});

test('paired-only Commands shows owner entry and never checks or sends on the private API', async () => {
 let calls=0; const ui=tickerUi(async()=>{calls++;throw Error('Unexpected request');},{paired:true,ownerLoginEnabled:true},false,'tv/command-box.js');
 try {await ui.settle();await ui.tick(15000);assert.equal(calls,0);assert.equal(draft(ui),undefined);assert.match(markup(ui),/Owner sign-in needed/);assert.ok(nodes(ui.render()).some(n=>n.props.href==='/login/qr'));} finally {ui.close();}
});

test('an incorrect save receipt keeps the original command locked for exact-ID retry', async () => {
 const sends=[];const ui=tickerUi(async(_,options={})=>{if(!options.method)return Response.json(ready);const command=JSON.parse(options.body);if(command.action==='dispatch')return Response.json({attempted:false});sends.push(command);return Response.json({saved:true,accepted:true,id:'wrong-command-id',delivery:'queued'});},{},false,'tv/command-box.js');
 try {await ui.settle();draft(ui).props.onChange({target:{value:'Keep this exact command'}});await ui.settle();await submit(ui);await ui.settle();assert.equal(draft(ui).props.value,'Keep this exact command');assert.equal(draft(ui).props.readOnly,true);assert.match(markup(ui),/Save was not confirmed/);assert.doesNotMatch(markup(ui),/Saved to your private queue/);await submit(ui);await ui.settle();assert.deepEqual(sends[0],sends[1]);} finally {ui.close();}
});

test('delivery feedback keeps complete errors and a confirmed queue receipt in measured pages', async () => {
 const longError='The private connection needs attention. '.repeat(60);let saved=false,failSend=true;
 const ui=tickerUi(async(_,options={})=>{if(!options.method)return Response.json(ready);const command=JSON.parse(options.body);if(command.action==='dispatch')return saved?Response.json({error:'Delivery unavailable'},{status:503}):Response.json({attempted:false});if(failSend)return Response.json({error:longError},{status:503});saved=true;return Response.json({saved:true,accepted:true,id:command.id,delivery:'queued'});},{},false,'tv/command-box.js');
 try {await ui.settle();draft(ui).props.onChange({target:{value:'A recoverable command'}});await ui.settle();await submit(ui);await ui.settle();let feedback=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Connection message');assert.equal(feedback.props.text,longError);failSend=false;await submit(ui);await ui.settle();feedback=nodes(ui.render()).find(n=>typeof n.type==='function'&&n.props.label==='Connection message');assert.match(feedback.props.text,/Saved to your private queue.*does not confirm execution/s);assert.match(feedback.props.text,/Your command is saved\. Delivery will retry/);assert.equal(draft(ui).props.value,'');} finally {ui.close();}
});
