// Updating the app shell never reads, clears, or replaces the notebook database.
export async function startUpdates({canReload,onWaiting,onStatus,sw=navigator.serviceWorker,win=window,doc=document,reload=()=>window.location.reload()}){
 if(!sw){onStatus('Offline installation is unavailable in this browser.');return;}
 let registration,reloadPending=false,reloaded=false,checking=false,lastCheck=0;
 const hadController=!!sw.controller;
 const safe=()=>doc.visibilityState!=='hidden'&&canReload();
 const apply=()=>{
  if(reloadPending&&safe()&&!reloaded){reloaded=true;reload();return;}
  const worker=registration?.waiting;
  if(worker){onWaiting(!safe());if(safe())worker.postMessage({type:'ACTIVATE_WHEN_READY'});}
 };
 const check=async()=>{
  apply();if(checking||doc.visibilityState==='hidden'||Date.now()-lastCheck<30000)return;
  checking=true;lastCheck=Date.now();try{await registration?.update();}catch{/* Offline: keep the installed version. */}finally{checking=false;apply();}
 };
 sw.addEventListener('message',event=>{if(event.data?.type==='CAN_UPDATE')event.ports?.[0]?.postMessage({ready:canReload()});});
 sw.addEventListener('controllerchange',()=>{if(hadController){reloadPending=true;apply();}});
 try{
  registration=await sw.register('./sw.js',{scope:'./',updateViaCache:'none'});
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')apply();});});
  onStatus('Automatic updates are on. Updates wait until your open forms and saves are finished. Your notebook stays on this device.');
  doc.addEventListener('visibilitychange',check);win.addEventListener('pageshow',check);win.addEventListener('online',check);
  const timer=win.setInterval(()=>{apply();if(Date.now()-lastCheck>300000)check();},2000);
  await check();
  return {check,apply,stop:()=>win.clearInterval(timer)};
 }catch{onStatus('Offline installation is unavailable. Your notebook is unchanged; updates will retry when you reopen online.');}
}
