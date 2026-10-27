import test from'node:test';import assert from'node:assert/strict';import{connectUi,nodes,button}from'./helpers/trip-ui.js';
const owner='11111111-1111-4111-8111-111111111111';const props={authorization:'client_id=verified-on-server',boards:[{ownerId:owner,role:'editor'}],canPost:true};
test('dot consent explains post access, excludes viewer boards, preserves failures and returns to ChatGPT only after confirmed consent',async()=>{
 let status=503,posted;const ui=connectUi(async(url,options)=>{posted=JSON.parse(options.body);return Response.json(status===200?{redirect:'https://chatgpt.com/connector_platform_oauth_redirect?code=synthetic-code&state=test&iss=https%3A%2F%2Fbartconsedine.com'}:{error:'Migration pending'},{status});},props);
 let tree=ui.render();assert.ok(nodes(tree).some(n=>n.type==='p'&&JSON.stringify(n.props.children).includes('publish posts')));
 nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'My useful dot'}});tree=ui.render();await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(ui.navigations.length,0);assert.equal(nodes(ui.render()).find(n=>n.type==='input').props.value,'My useful dot');assert.ok(nodes(ui.render()).some(n=>n.props?.role==='alert'));
 status=200;await nodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(posted.owner,owner);assert.equal(posted.name,'My useful dot');assert.equal(ui.navigations.length,1);assert.match(ui.navigations[0],/^https:\/\/chatgpt.com\//);
 const viewer=connectUi(async()=>{throw Error('must not fetch');},{...props,boards:[{ownerId:owner,role:'viewer'}]});assert.equal(button(viewer.render(),'Allow this connection').props.disabled,true);
});
