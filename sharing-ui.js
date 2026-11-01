import {createPrivatePublisher} from './sharing.js';
import {sharingState} from './db.js';
import {createInboxClient} from './inbox-client.js';
import {onGitHubPages} from './hosting.js';

export async function startPrivateSharing(){
 const $=id=>document.getElementById(id),bridge=createInboxClient();let connecting=false,timer;
 const paint=(state,message)=>{
  $('sharing-enable').hidden=!!state.enabled||!!state.pendingRevoke;
  $('sharing-sync').hidden=!state.enabled;
  $('sharing-disable').hidden=!state.enabled&&!state.pendingRevoke;
  $('sharing-disable').textContent=state.pendingRevoke?'Retry removing private copy':'Turn off & remove private copy';
  const last=state.lastShared?`Last shared ${new Date(state.lastShared).toLocaleString()} · ${state.counts?.active??0} places${state.counts?.trash?` + ${state.counts.trash} in Trash`:''}.`:'';
  $('sharing-last').textContent=last;
  $('sharing-status').textContent=message||state.error||(state.pendingRevoke?'Sharing stopped here. Removal of the private copy is pending.':state.enabled?'Automatic sharing is on for this device.':'Sharing is off. Enable it on the phone that holds your notebook.');
  $('sharing-summary').textContent=state.pendingRevoke?'Private copy: removal pending':state.enabled?(state.lastShared?'Private copy: '+last:'Private copy: waiting for first upload'):'Private copy: off';
 };
 const publisher=createPrivatePublisher({onStatus:paint});
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>publisher.sync(),800);};
 $('private-copy').onclick=async()=>{paint(await sharingState());$('sharing-dialog').showModal();};
 const connect=async replace=>{
  if(connecting)return;connecting=true;$('sharing-enable').disabled=true;$('sharing-replace').disabled=true;$('sharing-status').textContent='Connecting your ChatGPT account…';
  try{
   // Open synchronously in the click handler, before any IndexedDB await.
   bridge.open();
   let current=await sharingState();const deviceId=current.deviceId||crypto.randomUUID();await sharingState({deviceId});
   const response=await bridge.request('/api/notebook/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,replace})}),data=await response.json();
   if(data.anotherDevice){$('sharing-replace').hidden=false;$('sharing-status').textContent='Another device publishes your copy. Make this device primary only if it holds your complete notebook.';bridge.close();return;}
   if(!response.ok){$('sharing-signin').hidden=response.status!==401||onGitHubPages();throw Error(data.error||'Could not connect sharing.');}
   if(typeof data.token!=='string'||data.deviceId!==deviceId||!Number.isSafeInteger(data.sequence))throw Error('Invalid sharing connection.');
   current=await sharingState();await sharingState({enabled:true,deviceId,token:data.token,sequence:Math.max(current.sequence||0,data.sequence),pendingRevoke:false,error:null,lastHash:null,lastShared:null,counts:null});
   $('sharing-replace').hidden=true;bridge.close();await publisher.sync(true);
  }catch(e){$('sharing-status').textContent=e.message;}finally{connecting=false;$('sharing-enable').disabled=false;$('sharing-replace').disabled=false;}
 };
 $('sharing-enable').onclick=()=>connect(false);$('sharing-replace').onclick=()=>connect(true);
 $('sharing-sync').onclick=()=>publisher.sync(true);$('sharing-disable').onclick=()=>publisher.disable();
 $('sharing-signin').href='/signin-with-chatgpt?return_to='+encodeURIComponent(window.location.pathname);
 window.addEventListener('notebook-changed',schedule);window.addEventListener('online',schedule);window.addEventListener('pageshow',schedule);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
 // Other tabs share IndexedDB. Each snapshot gets an atomic, increasing sequence.
 const interval=setInterval(()=>{if(document.visibilityState==='visible')publisher.sync();},30000);interval.unref?.();
 await publisher.sync();
 return {get busy(){return connecting||publisher.busy;}};
}
