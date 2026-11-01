import {test} from 'node:test';import assert from 'node:assert/strict';import {createInboxClient} from '../inbox-client.js';import {INBOX_ORIGIN} from '../hosting.js';
test('Pages inbox validates source, origin and channel; API acknowledgements remain explicit',async()=>{
 let listener,opened,sent;const popup={closed:false,focus(){},close(){this.closed=true;},postMessage:(message,origin)=>{sent={message,origin};}};
 globalThis.window={location:{origin:'https://asre1212.github.io'},addEventListener:(type,fn)=>{listener=fn;},open:url=>{opened=url;return popup;}};
 const client=createInboxClient();client.open();const channel=new URL(opened).hash.slice(1),request=client.request('./api/github/pull',{method:'POST'});
 listener({origin:'https://evil.test',source:popup,data:{type:'RESTAURANTS_BRIDGE_READY',channel}});assert.equal(sent,undefined);
 listener({origin:INBOX_ORIGIN,source:{},data:{type:'RESTAURANTS_BRIDGE_READY',channel}});assert.equal(sent,undefined);
 listener({origin:INBOX_ORIGIN,source:popup,data:{type:'RESTAURANTS_BRIDGE_READY',channel}});assert.equal(sent.origin,INBOX_ORIGIN);assert.equal(sent.message.path,'./api/github/pull');
 listener({origin:INBOX_ORIGIN,source:popup,data:{type:'RESTAURANTS_BRIDGE_RESPONSE',channel,id:sent.message.id,status:200,data:{packets:[]}}});assert.deepEqual(await (await request).json(),{packets:[]});client.close();assert.equal(popup.closed,true);
});
