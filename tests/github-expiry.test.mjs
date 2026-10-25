import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import baseWorker from '../worker/index.js';
const originalFetch=globalThis.fetch, originalNow=Date.now,now=originalNow(),objects=new Map();
const env={GITHUB_INBOX_KEY:Buffer.alloc(32,7).toString('base64'),BUCKET:{async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null},async put(k,v){objects.set(k,v)}}};
const request=(path,email='owner@example.test',body={})=>new Request('https://test.example'+path,{method:'POST',headers:{'oai-authenticated-user-id':'test-'+email,'oai-authenticated-user-email':email,'Content-Type':'application/json',Origin:'https://test.example'},body:JSON.stringify(body)});
async function prepare(id){const r=await baseWorker.fetch(request('/mcp','owner@example.test',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'add_restaurants',arguments:{delivery_id:id,restaurants:[{name:id,city:'Test',cuisine:'Test',rating:3}]}}}),env).then(r=>r.json());return JSON.parse(r.result.content[0].text).github_payload;}
let old,fresh;
try{Date.now=()=>now-8*86400000;old=await prepare('older-delivery01');}finally{Date.now=originalNow;}
fresh=await prepare('fresh-delivery01');
const envelopes=new Map([[old.id+'.json',old],[fresh.id+'.json',fresh]]);
globalThis.fetch=async input=>{const u=new URL(input);return Response.json(u.pathname.endsWith('index.json')?{format:'restaurants-inbox-index',version:1,files:[...envelopes.keys()]}:envelopes.get(decodeURIComponent(u.pathname.split('/').at(-1))));};
try{
 let r=await baseWorker.fetch(request('/api/github/pull'),env);assert.equal(r.status,200);let data=await r.json();assert.equal(data.packets.length,1);assert.equal(data.packets[0].id,fresh.id);assert.equal(data.skippedExpired,1);assert.equal(objects.size,0);
 const receipt=createHash('sha256').update(old.ciphertext).digest('hex');
 const manifest={authorizedUntil:now+7*86400000,deliveries:[{id:old.id,recipient:old.recipient,receipt}]};
 let source=await readFile(new URL('../worker/index.js',import.meta.url),'utf8');source=source.replace(/const EXPIRED_RECOVERY=.*?;\n/,`const EXPIRED_RECOVERY=${JSON.stringify(manifest)};\n`);
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 data=await worker.fetch(request('/api/github/pull'),env).then(r=>r.json());assert.equal(data.packets.length,2);const recovered=data.packets.find(p=>p.id===old.id);assert.equal(recovered.recoveredExpired,true);assert.equal(recovered.packet.updateRatings,false);assert.equal(objects.size,0);
 assert.equal((await worker.fetch(request('/api/github/ack','owner@example.test',{id:recovered.id,receipt:recovered.receipt,receiptToken:recovered.receiptToken}),env)).status,200);
 data=await worker.fetch(request('/api/github/pull'),env).then(r=>r.json());assert.equal(data.packets.length,1);assert.equal(data.skippedAcknowledged,1);
 objects.clear();const saved=old.ciphertext;old.ciphertext=old.ciphertext.slice(0,-4)+'AAAA';data=await worker.fetch(request('/api/github/pull'),env).then(r=>r.json());assert.equal(data.skippedExpired,1);old.ciphertext=saved;
 Date.now=()=>manifest.authorizedUntil+86400000;data=await worker.fetch(request('/api/github/pull'),env).then(r=>r.json());assert.equal(data.packets.length,0);assert.equal(data.skippedExpired,2);Date.now=originalNow;
 fresh.ciphertext=fresh.ciphertext.slice(0,-4)+'AAAA';assert.equal((await worker.fetch(request('/api/github/pull'),env)).status,400);
 console.log('PASS: expired batches do not block fresh deliveries; bounded ID/recipient/hash recovery, original ID, add-only, receipts, deadline, and corruption rejection.');
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
