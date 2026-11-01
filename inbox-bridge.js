import {PAGES_URL} from './hosting.js';
const target=new URL(PAGES_URL).origin,channel=location.hash.slice(1),parent=window.opener,status=document.getElementById('bridge-status'),signin=document.getElementById('bridge-signin');
signin.href='/signin-with-chatgpt?return_to='+encodeURIComponent('/inbox-bridge.html#'+channel);
const validChannel=/^[a-f0-9-]{36}$/.test(channel);
window.addEventListener('message',async event=>{
 const message=event.data;
 if(!parent||!validChannel||event.source!==parent||event.origin!==target||message?.channel!==channel||message.type!=='RESTAURANTS_BRIDGE_REQUEST'||! /^[a-f0-9-]{36}$/.test(message.id||''))return;
 const path=String(message.path||'').replace(/^\.\//,'/');
 const pull=/^\/api\/github\/pull(?:\?after=[A-Za-z0-9_.%-]+)?$/.test(path)&&message.method==='POST';
 const ack=path==='/api/github/ack'&&message.method==='POST';
 if(!pull&&!ack)return;
 try{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:ack?message.body:undefined});
  const data=await response.json();
  if(response.status===401){signin.hidden=false;status.textContent='Sign in, then return to your GitHub notebook and tap Force pull list again.';}
  else status.textContent=response.ok?'Connected. Your notebook is receiving its list.':data.error||'Could not retrieve the list.';
  parent.postMessage({type:'RESTAURANTS_BRIDGE_RESPONSE',channel,id:message.id,status:response.status,data},target);
 }catch{parent.postMessage({type:'RESTAURANTS_BRIDGE_RESPONSE',channel,id:message.id,status:503,data:{error:'Assistant inbox is unavailable. Your notebook is unchanged.'}},target);}
});
if(parent&&validChannel){status.textContent='Connected to your GitHub notebook.';parent.postMessage({type:'RESTAURANTS_BRIDGE_READY',channel},target);}else status.textContent='Open your GitHub notebook and tap Force pull list to connect.';
