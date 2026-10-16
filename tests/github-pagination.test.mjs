import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const originalFetch=globalThis.fetch,objects=new Map();
const env={GITHUB_INBOX_KEY:Buffer.alloc(32,7).toString('base64'),BUCKET:{async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null},async put(k,v){objects.set(k,v)}}};
const request=(path,email,body={})=>new Request('https://test.example'+path,{method:'POST',headers:{'oai-authenticated-user-id':'test-'+email,'oai-authenticated-user-email':email,'Content-Type':'application/json',Origin:'https://test.example'},body:JSON.stringify(body)});
const envelopes=new Map();
for(let i=0;i<25;i++){
 const id='batch-delivery-'+String(i).padStart(2,'0');
 const response=await worker.fetch(request('/mcp',i===11?'other@example.test':'owner@example.test',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'add_restaurants',arguments:{delivery_id:id,restaurants:[{name:'Synthetic place '+i,city:'Test',cuisine:'Test',rating:4}]}}}),env).then(r=>r.json());
 envelopes.set(id+'.json',JSON.parse(response.result.content[0].text).github_payload);
}
let files=[...envelopes.keys()].reverse(),requests=0;
globalThis.fetch=async input=>{requests++;const url=new URL(input);if(url.pathname.endsWith('index.json'))return Response.json({format:'restaurants-inbox-index',version:1,files});const file=decodeURIComponent(url.pathname.split('/').at(-1));return file==='batch-delivery-12.json'?new Response('',{status:404}):Response.json(envelopes.get(file));};
try{
 let cursor='',pages=0;const received=[];
 do{
  requests=0;const response=await worker.fetch(request('/api/github/pull'+(cursor?'?after='+encodeURIComponent(cursor):''),'owner@example.test'),env);
  assert.equal(response.status,200);const data=await response.json();assert.ok(requests<=11);assert.ok(data.packets.length<=10);pages++;
  for(const packet of data.packets){received.push(packet.id);const ack=await worker.fetch(request('/api/github/ack','owner@example.test',{id:packet.id,receipt:packet.receipt,receiptToken:packet.receiptToken}),env);assert.equal(ack.status,200);}
  if(pages===1)files=files.filter(file=>file>data.nextCursor); // Cleanup removes page one while the pull continues.
  cursor=data.nextCursor||'';
 }while(cursor);
 assert.equal(pages,3);assert.equal(received.length,23);assert.equal(new Set(received).size,23);assert.ok(received.includes('batch-delivery-24'));assert.equal(objects.size,23);
 assert.equal((await worker.fetch(request('/api/github/pull?after=../bad','owner@example.test'),env)).status,400);
 console.log('PASS: queues above 20 drain in bounded pages; cleanup, missing files, other accounts, signed acknowledgements, and cursor validation.');
}finally{globalThis.fetch=originalFetch;}
