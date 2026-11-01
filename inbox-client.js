import {INBOX_ORIGIN,onGitHubPages} from './hosting.js';
export function createInboxClient(){
 let popup=null,channel='',ready=false;
 const pending=new Map();
 window.addEventListener('message',event=>{
  if(event.origin!==INBOX_ORIGIN||event.source!==popup||event.data?.channel!==channel)return;
  if(event.data.type==='RESTAURANTS_BRIDGE_READY'){ready=true;for(const request of pending.values())request.send(true);return;}
  if(event.data.type!=='RESTAURANTS_BRIDGE_RESPONSE')return;
  const request=pending.get(event.data.id);if(!request)return;
  if(event.data.status===401)return; // Sign-in navigates the popup; READY resends after returning.
  clearTimeout(request.timer);pending.delete(event.data.id);
  const {status,data}=event.data;request.resolve({ok:status>=200&&status<300,status,json:async()=>data});
 });
 const open=()=>{
  if(!onGitHubPages())return;
  if(popup&&!popup.closed){popup.focus();return;}
  channel=crypto.randomUUID();ready=false;
  popup=window.open(INBOX_ORIGIN+'/inbox-bridge.html#'+channel,'restaurant-inbox','popup,width=540,height=640');
  if(!popup)throw Error('Allow the assistant connection window, then try again.');
 };
 const request=(path,options={})=>{
  if(!onGitHubPages())return fetch(path,options);
  if(!popup||popup.closed)throw Error('Open the assistant connection to continue.');
  return new Promise((resolve,reject)=>{
   const id=crypto.randomUUID();let sent=false;
   const send=(retry=false)=>{if(retry)sent=false;if(!ready||sent)return;sent=true;popup.postMessage({type:'RESTAURANTS_BRIDGE_REQUEST',channel,id,path,method:options.method||'GET',body:options.body},INBOX_ORIGIN);};
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('Finish signing in in the assistant window, then try again.'));},180000);
   pending.set(id,{resolve,timer,send});send();
  });
 };
 const close=()=>{popup?.close();popup=null;ready=false;};
 return {open,request,close};
}
