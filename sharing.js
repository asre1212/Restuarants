import {INBOX_ORIGIN} from './hosting.js';
import {sharingState,sharingSnapshot} from './db.js';

export function createPrivatePublisher({state=sharingState,snapshot=sharingSnapshot,request=fetch,onStatus=()=>{},online=()=>navigator.onLine!==false}={}){
 let running=null,again=false,forceNext=false,stopped=false;
 const report=async(message)=>onStatus(await state(),message);
 const send=async(path,token,body)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{const response=await request(INBOX_ORIGIN+path,{method:body?'PUT':'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Notebook-Upload':token},body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Private sharing is unavailable.'),{status:response.status});return data;
  }finally{clearTimeout(timer);}
 };
 async function cycle(force){
  const current=await state();
  if(current.pendingRevoke){
   if(!online()){await report('Sharing stopped here. The private copy will be removed when you are online.');return;}
   try{await send('/api/notebook/revoke',current.token);}catch(e){if(e.status!==401)throw e;}
   await state({enabled:false,pendingRevoke:false,token:null,lastShared:null,lastHash:null,error:null},current.token);await report('Sharing is off. The private copy was removed or this device’s access was already revoked.');return;
  }
  if(!current.enabled||!current.token){await report();return;}
  if(!online()){await report('Offline. Changes will share when the app is open and online.');return;}
  const next=await snapshot();if(!next)return;const {state:connection,snapshot:packet}=next;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([packet.restaurants,packet.categoryNotes])))),v=>v.toString(16).padStart(2,'0')).join('');
  if(!force&&connection.lastHash===hash){await report();return;}
  await report('Sharing your latest saved notes…');
  try{
   const result=await send('/api/notebook/snapshot',connection.token,packet);
   await state({lastHash:hash,lastShared:result.last_shared_at,counts:result.counts,error:null},connection.token);await report();
  }catch(e){
   if(e.status===401)await state({enabled:false,error:e.message},connection.token);
   else await state({error:e.message},connection.token);
   throw e;
  }
 }
 function sync(force=false){
  if(stopped)return Promise.resolve();again=true;forceNext||=force;if(running)return running;
  running=(async()=>{do{again=false;const useForce=forceNext;forceNext=false;try{await cycle(useForce);}catch(e){await report(e.status===409?'Another save arrived first. The latest notes will retry shortly.':e.name==='AbortError'?'Sharing timed out. Your notes are safe; retrying when connected.':e.message);}}while(again&&!stopped);})().finally(()=>{running=null;});return running;
 }
 async function disable(){const current=await state();await state({enabled:false,pendingRevoke:!!current.token,error:null},current.token);return sync();}
 return {sync,disable,stop(){stopped=true;},get busy(){return !!running;}};
}
