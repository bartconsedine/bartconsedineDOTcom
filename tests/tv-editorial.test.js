import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { tickerUi } from './helpers/ticker-ui.js';
import { nodes, button } from './helpers/trip-ui.js';
import { fitHeadline, headlineSize, readingSeconds } from '../src/private-apps/morning-feed/tldr/layout.js';
const view=ui=>renderToStaticMarkup(ui.render());
test('paired TVs and shared viewers never request Calendar data; command input cannot claim delivery',async()=>{
 const calendar=tickerUi(()=>assert.fail('locked TV must never request calendar'),{locked:true},false,'tv/calendar.js');await calendar.settle();assert.match(view(calendar),/approved for Morning signal only/);assert.ok(nodes(calendar.render()).some(n=>n.type==='a'&&n.props.href==='/admin/apps/morning-feed?view=calendar'));assert.doesNotMatch(view(calendar),/Open Calendar companion<\/a>/);calendar.close();
 const commands=tickerUi(()=>assert.fail('no command transport'),{paired:true},false,'tv/command-box.js');await commands.settle();const input=nodes(commands.render()).find(n=>n.type==='input');assert.equal(input.props.disabled,true);assert.equal(button(commands.render(),'Not connected').props.disabled,true);assert.match(view(commands),/Morning signal and news reading progress/);commands.close();
});
test('owner TV agenda uses only existing Calendar GET and clears private data on access denial',async()=>{
 let denied=false,calls=0;
 const ui=tickerUi(async(url,options)=>{calls++;assert.equal(url,'/api/admin/apps/calendar-companion');assert.equal(options.method,undefined);return denied?Response.json({}, {status:403}):Response.json({connection:'connected',preferences:{settings:{timeZone:'America/New_York'}},loadedAt:'2026-10-31T23:00:00Z',events:[{id:'one',calendarId:'primary',summary:'Existing calendar event',start:{date:'2030-01-01'},end:{date:'2030-01-02'}}]});},{locked:false},false,'tv/calendar.js');
 await ui.settle();assert.match(view(ui),/Existing calendar event/);denied=true;button(ui.render(),'Refresh calendar').props.onClick();await ui.settle();assert.doesNotMatch(view(ui),/Existing calendar event/);assert.match(view(ui),/cannot open Calendar/);assert.equal(calls,2);ui.close();
});
test('headline sizing targets two lines without hiding long text; longer summaries receive longer reading time',()=>{
 assert.ok(headlineSize(170)<headlineSize(70));assert.ok(headlineSize(500)>=30);assert.equal(readingSeconds('short'),24);assert.ok(readingSeconds('word '.repeat(120))>24);
 const element={textContent:'Long title '.repeat(10),style:{},getBoundingClientRect:()=>({width:1000}),ownerDocument:{defaultView:{innerWidth:1920,getComputedStyle:e=>({lineHeight:String(parseFloat(e.style.fontSize)*1.08)})}},get scrollHeight(){return Math.ceil(this.textContent.length/(1000/(parseFloat(this.style.fontSize)*.5)))*parseFloat(this.style.fontSize)*1.08;}};
 fitHeadline(element);assert.ok(parseFloat(element.style.fontSize)>=30);assert.ok(element.scrollHeight<=parseFloat(element.style.fontSize)*1.08*2+2);assert.equal(element.textContent,'Long title '.repeat(10));
});
