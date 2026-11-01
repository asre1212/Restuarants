import {test} from 'node:test';import assert from 'node:assert/strict';
import {startUpdates} from '../updates.js';
const emitter=()=>({handlers:{},addEventListener(name,fn){this.handlers[name]=fn;}});
test('automatic updates check on startup/resume and defer activation and reload during edits',async()=>{
 const sw=emitter(),doc={...emitter(),visibilityState:'visible'},win=emitter(),registration=emitter();let safe=false,checks=0,reloads=0,interval;
 const messages=[];registration.waiting={postMessage:message=>messages.push(message)};registration.update=async()=>{checks++;};sw.controller={};sw.register=async(path,options)=>{assert.equal(path,'./sw.js');assert.equal(options.updateViaCache,'none');return registration;};win.setInterval=fn=>{interval=fn;return 1;};win.clearInterval=()=>{};
 const updates=await startUpdates({canReload:()=>safe,onWaiting:()=>{},onStatus:()=>{},sw,doc,win,reload:()=>reloads++});
 assert.equal(checks,1);assert.equal(messages.length,0);
 let readiness;sw.handlers.message({data:{type:'CAN_UPDATE'},ports:[{postMessage:value=>readiness=value.ready}]});assert.equal(readiness,false);
 safe=true;interval();assert.equal(messages.at(-1).type,'ACTIVATE_WHEN_READY');
 safe=false;sw.handlers.controllerchange();assert.equal(reloads,0);
 safe=true;doc.visibilityState='hidden';interval();assert.equal(reloads,0);
 doc.visibilityState='visible';await doc.handlers.visibilitychange();assert.equal(reloads,1);interval();assert.equal(reloads,1);
 updates.stop();
});
test('first install does not cause a reload loop and offline checks leave notebook alone',async()=>{
 const sw=emitter(),doc={...emitter(),visibilityState:'visible'},win={...emitter(),setInterval:()=>1,clearInterval:()=>{}},registration={...emitter(),update:async()=>{throw Error('offline');}};let reloads=0;
 sw.controller=null;sw.register=async()=>registration;
 await startUpdates({canReload:()=>true,onWaiting:()=>{},onStatus:()=>{},sw,doc,win,reload:()=>reloads++});sw.handlers.controllerchange();assert.equal(reloads,0);
});
