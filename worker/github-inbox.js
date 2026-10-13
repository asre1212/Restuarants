const GITHUB_ROOT='https://raw.githubusercontent.com/asre1212/Restuarants/main/inbox';
const GITHUB_HEADERS={'Accept':'application/vnd.github+json','User-Agent':'Restaurants-inbox'};
const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const to64=b=>btoa(Array.from(new Uint8Array(b),v=>String.fromCharCode(v)).join(''));
async function digestHex(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
async function recipientFor(request){const email=request.headers.get('oai-authenticated-user-email');if(!email||!request.headers.get('oai-authenticated-user-id'))throw Error('Connect the same ChatGPT account used to send the list.');return digestHex(email.trim().toLowerCase());}
async function encryptionKey(env){if(!env.GITHUB_INBOX_KEY)throw Error('GitHub inbox encryption is not configured.');return crypto.subtle.importKey('raw',from64(env.GITHUB_INBOX_KEY),'AES-GCM',false,['encrypt','decrypt']);}
const envelopeAAD=e=>new TextEncoder().encode(JSON.stringify([e.id,e.recipient,e.expiresAt]));
async function receiptToken(env,id,recipient,receipt){const key=await crypto.subtle.importKey('raw',from64(env.GITHUB_INBOX_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return to64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([id,recipient,receipt]))));}
async function decodeEnvelope(request,env,e){
 if(e?.format!=='restaurants-encrypted-inbox'||e.version!==1||!/^[A-Za-z0-9_-]{8,100}$/.test(e.id||'')||typeof e.ciphertext!=='string'||e.ciphertext.length>700000||typeof e.iv!=='string'||!Number.isFinite(e.expiresAt))throw Error('Invalid GitHub delivery.');
 if(e.recipient!==await recipientFor(request))return null;
 if(e.expiresAt<=Date.now())throw Error('GitHub delivery expired. Ask your assistant to resend it.');
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(e.iv),additionalData:envelopeAAD(e)},await encryptionKey(env),from64(e.ciphertext));
 const packet=JSON.parse(new TextDecoder().decode(clear));const parsed=parseImport(JSON.stringify(packet));if(parsed.some(r=>r.error))throw Error('GitHub delivery has invalid restaurant fields.');
 const receipt=await digestHex(e.ciphertext);return {id:e.id,packet,receipt,receiptToken:await receiptToken(env,e.id,e.recipient,receipt)};
}
export async function prepareGitHubDelivery(request,env,args){
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(args.delivery_id||''))throw Error('Provide a stable delivery_id of 8–100 characters.');
 if(!Array.isArray(args.restaurants)||!args.restaurants.length||args.restaurants.length>100)throw Error('Send 1–100 restaurants.');
 const packet={format:'restaurant-log-import',version:1,restaurants:args.restaurants.map(r=>clean(r))};
 const e={format:'restaurants-encrypted-inbox',version:1,id:args.delivery_id,recipient:await recipientFor(request),expiresAt:Date.now()+7*86400000,iv:to64(crypto.getRandomValues(new Uint8Array(12)))};
 e.ciphertext=to64(await crypto.subtle.encrypt({name:'AES-GCM',iv:from64(e.iv),additionalData:envelopeAAD(e)},await encryptionKey(env),new TextEncoder().encode(JSON.stringify(packet))));
 return {prepared:packet.restaurants.length,github_path:`inbox/${e.id}.json`,github_payload:e,saved_on_device:false,next_step:'Save github_payload to github_path in asre1212/Restuarants on main using GitHub, and add that filename to inbox/index.json (format restaurants-inbox-index, version 1, files array). Only then confirm it is queued. The user presses Force pull list to save it locally and acknowledge deletion.'};
}
async function githubJSON(url){const r=await fetch(url,{headers:GITHUB_HEADERS,cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw Error(`GitHub returned ${r.status}. Try again later.`);const text=await r.text();if(text.length>1000000)throw Error('GitHub response too large.');return JSON.parse(text);}
export async function githubInboxFetch(request,env){
 const url=new URL(request.url);
 const receiptMatch=url.pathname.match(/^\/api\/github\/receipt\/([a-f0-9]{64})$/);
 // Public non-sensitive receipt status allows the GitHub cleanup workflow to verify acknowledgement.
 if(receiptMatch&&request.method==='GET'){const record=await env.BUCKET?.get('github-receipt/'+receiptMatch[1]);return json({acknowledged:!!record});}
 if(request.method!=='POST')return json({error:'POST required.'},405);
 if(request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required.'},403);
 try{
  const recipient=await recipientFor(request);
  if(url.pathname==='/api/github/pull'){
   const listing=await githubJSON(GITHUB_ROOT+'/index.json?fresh='+Date.now());if(!listing)return json({packets:[],message:'No GitHub deliveries waiting.'});
   if(listing.format!=='restaurants-inbox-index'||listing.version!==1||!Array.isArray(listing.files))throw Error('Invalid GitHub inbox index.');
   const files=listing.files;if(files.some(f=>typeof f!=='string'||! /^[A-Za-z0-9_-]{8,100}\.json$/.test(f)))throw Error('Invalid GitHub inbox filename.');if(files.length>20)throw Error('More than 20 GitHub deliveries. Ask your assistant to split the queue.');
   const packets=[];
   for(const file of files){const e=await githubJSON(GITHUB_ROOT+'/'+encodeURIComponent(file)+'?fresh='+Date.now());if(!e)continue;if(file!==e.id+'.json')throw Error('GitHub delivery ID does not match its filename.');const packet=await decodeEnvelope(request,env,e);if(packet)packets.push(packet);}
   return json({packets,unmatched:files.length>0&&packets.length===0});
  }
  if(url.pathname==='/api/github/ack'){
   if(!env.BUCKET)throw Error('Receipt storage unavailable.');
   const body=await readJSON(request);if(!/^[A-Za-z0-9_-]{8,100}$/.test(body.id||'')||!/^[a-f0-9]{64}$/.test(body.receipt||''))throw Error('Invalid acknowledgement.');
   const expected=await receiptToken(env,body.id,recipient,body.receipt);if(body.receiptToken!==expected)throw Error('Acknowledgement is not authorized for this account.');
   await env.BUCKET.put('github-receipt/'+body.receipt,JSON.stringify({id:body.id,acknowledgedAt:Date.now()}));
   if(!await env.BUCKET.get('github-receipt/'+body.receipt))throw Error('Could not verify acknowledgement storage. The GitHub file has been kept.');
   return json({acknowledged:true,github_cleanup:'scheduled'});
  }
  return json({error:'Not found.'},404);
 }catch(e){return json({error:e.message},e.message.startsWith('Connect')?401:400);}
}
