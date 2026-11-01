import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const data=new Map();let version=0,beforePut;
const env={GITHUB_INBOX_KEY:Buffer.alloc(32,31).toString('base64'),BUCKET:{
 async get(key){const value=data.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.text)}:null;},
 async put(key,text,{onlyIf}={}){if(beforePut){const hook=beforePut;beforePut=null;await hook();}const prior=data.get(key);if(onlyIf?.etagMatches&&prior?.etag!==onlyIf.etagMatches||onlyIf?.etagDoesNotMatch==='*'&&prior)return null;const etag=String(++version);data.set(key,{text,etag});return {etag};}
}};
const host='https://test.example',pages='https://asre1212.github.io',id=crypto.randomUUID();
async function api(path,{user,token,body,method='POST',origin=pages}={}){return worker.fetch(new Request(host+path,{method,headers:{Origin:origin,...(user?{'oai-authenticated-user-id':user}:{}),...(token?{'X-Notebook-Upload':token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env);}
async function rpc(user,name,args={}){const response=await api('/mcp',{user,body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}}),value=await response.json();return value.result.isError?value.result:JSON.parse(value.result.content[0].text);}
const connect=(user='alice',deviceId=id,replace=false)=>api('/api/notebook/connect',{user,origin:host,body:{deviceId,replace}});
const base={id:'one',name:'Synthetic private place',city:'NYC',cuisine:'Korean / Pocha',rating:4.2,notes:'Secret dish 3.9/5; exact notes',tags:['Visited'],createdAt:'2026-10-01T00:00:00Z'};
const packet=sequence=>({format:'restaurant-private-copy',version:1,sequence,capturedAt:new Date().toISOString(),restaurants:[base,{...base,id:'two',rating:null,tags:['To try']},{...base,id:'trash',deletedAt:'2026-10-02T00:00:00Z'}],categoryNotes:{'["NYC","Korean"]':'Secret category note'}});
assert.equal((await rpc(null,'read_restaurant_notebook')).isError,true);
assert.equal((await rpc('alice','restaurant_notebook_status')).has_copy,false);
assert.equal((await api('/api/notebook/connect',{body:{deviceId:id},origin:host})).status,401);
assert.equal((await api('/api/notebook/connect',{user:'alice',body:{deviceId:id}})).status,403);
assert.equal((await api('/api/notebook/snapshot',{method:'OPTIONS',origin:'https://evil.example'})).status,403);
const preflight=await api('/api/notebook/snapshot',{method:'OPTIONS'});assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),pages);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
const connection=await (await connect()).json(),token=connection.token;
assert.equal((await (await connect()).json()).token,token);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token:token+'x',body:packet(1)})).status,401);
const uploaded=await api('/api/notebook/snapshot',{method:'PUT',token,body:packet(1)});assert.equal(uploaded.status,200);assert.equal(uploaded.headers.get('Cache-Control'),'no-store');
assert.equal([...data.values()].some(v=>v.text.includes('Secret')),false);
const result=await rpc('alice','read_restaurant_notebook',{include_category_notes:true,limit:1});assert.equal(result.total_matches,2);assert.equal(result.next_offset,1);assert.equal(result.restaurants[0].rating,4.2);assert.equal(result.restaurants[0].notes,base.notes);assert.equal(result.category_notes['["NYC","Korean"]'],'Secret category note');assert.ok(result.last_shared_at);
assert.equal((await rpc('bob','read_restaurant_notebook')).has_copy,false);
assert.equal((await rpc('alice','write_restaurant_notebook',{restaurants:[]})).isError,true);
assert.equal((await api('/mcp',{token,body:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'read_restaurant_notebook',arguments:{}}}}).then(r=>r.json())).result.isError,true);
assert.equal((await rpc('alice','read_restaurant_notebook',{offset:1})).restaurants[0].id,'two');
assert.equal((await rpc('alice','read_restaurant_notebook',{include_trash:true})).restaurants.length,3);
assert.equal((await rpc('alice','read_restaurant_notebook',{visit_status:'to-try'})).restaurants[0].id,'two');
assert.equal((await rpc('alice','read_restaurant_notebook',{min_rating:4,city:'nyc',cuisine:'pocha',query:'secret'})).restaurants.length,1);
assert.equal((await rpc('alice','read_restaurant_notebook',{limit:21})).isError,true);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token,body:packet(1)})).status,409);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token,body:{...packet(2),restaurants:[base,base]}})).status,400);
const secondId=crypto.randomUUID();assert.equal((await connect('alice',secondId)).status,409);
const second=await (await connect('alice',secondId,true)).json();assert.equal(second.has_copy,true);assert.equal((await rpc('alice','read_restaurant_notebook')).restaurants.length,2);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token,body:packet(2)})).status,401);
// A revoke that commits while an upload encrypts must win; the old upload cannot resurrect it.
beforePut=async()=>{assert.equal((await api('/api/notebook/revoke',{token:second.token})).status,200);};
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token:second.token,body:packet(1)})).status,409);
assert.equal((await rpc('alice','restaurant_notebook_status')).has_copy,false);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token:second.token,body:packet(2)})).status,401);
assert.equal([...data.values()].some(v=>v.text.includes('ciphertext')),false);
const reconnected=await (await connect('alice',secondId)).json();assert.notEqual(reconnected.token,second.token);
assert.equal((await api('/api/notebook/snapshot',{method:'PUT',token:second.token,body:packet(3)})).status,401);
console.log('PASS: private account isolation, upload-only credentials, encrypted snapshots, exact notes, filtering, stale writes, primary-device rotation and revoke/upload race.');
