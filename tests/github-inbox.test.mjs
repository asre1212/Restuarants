import assert from 'node:assert/strict';import worker from '../worker/index.js';
const originalFetch=globalThis.fetch;const objects=new Map();const env={GITHUB_INBOX_KEY:Buffer.alloc(32,7).toString('base64'),BUCKET:{async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null},async put(k,v){objects.set(k,v)}}};
const request=(path,email,body,origin='https://test.example')=>new Request('https://test.example'+path,{method:body?'POST':'GET',headers:{...(email?{'oai-authenticated-user-id':'site-user-'+email,'oai-authenticated-user-email':email}:{}),'Content-Type':'application/json',Origin:origin},body:body?JSON.stringify(body):undefined});
const args={delivery_id:'test-delivery01',restaurants:[{name:'Synthetic Cafe',city:'Test City',cuisine:'American',rating:4.5,notes:'Dish — 5/5.'}]};
const result=await worker.fetch(request('/mcp','owner@example.test',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'add_restaurants',arguments:args}}),env).then(r=>r.json());
const prepared=JSON.parse(result.result.content[0].text);assert.equal(prepared.prepared,1);assert.equal(prepared.saved_on_device,false);assert.ok(!JSON.stringify(prepared.github_payload).includes('Synthetic Cafe'));
const envelope=prepared.github_payload;
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/'+envelope.id+'.json')?envelope:{format:'restaurants-inbox-index',version:1,files:[envelope.id+'.json']}),{headers:{'Content-Type':'application/json'}});
try{
 assert.equal((await worker.fetch(request('/api/github/pull',null,{}),env)).status,401);
 assert.equal((await worker.fetch(request('/api/github/pull','owner@example.test',{},'https://other.example'),env)).status,403);
 const unrelated=await worker.fetch(request('/api/github/pull','other@example.test',{}),env).then(r=>r.json());assert.equal(unrelated.packets.length,0);
 const pulled=await worker.fetch(request('/api/github/pull','OWNER@example.test',{}),env).then(r=>r.json());assert.equal(pulled.packets[0].packet.restaurants[0].rating,4.5);assert.equal(objects.size,0);
 const packet=pulled.packets[0];const ack={id:packet.id,receipt:packet.receipt,receiptToken:packet.receiptToken};
 assert.equal((await worker.fetch(request('/api/github/ack','other@example.test',ack),env)).status,400);assert.equal(objects.size,0);
 assert.equal((await worker.fetch(request('/api/github/receipt/'+packet.receipt,null),env).then(r=>r.json())).acknowledged,false);
 assert.equal((await worker.fetch(request('/api/github/ack','owner@example.test',ack),env)).status,200);
 assert.equal((await worker.fetch(request('/api/github/receipt/'+packet.receipt,null),env).then(r=>r.json())).acknowledged,true);
 envelope.ciphertext=envelope.ciphertext.slice(0,-4)+'AAAA';assert.equal((await worker.fetch(request('/api/github/pull','owner@example.test',{}),env)).status,400);
 console.log('PASS: encrypted GitHub preparation, click-only pull, account isolation, case-normalized identity, no deletion on read, signed receipt authorization, tamper rejection.');
}finally{globalThis.fetch=originalFetch;}
