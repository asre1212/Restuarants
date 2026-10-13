import {clean,sortRestaurants,norm,parseImport,planImport,VERSION} from './core.js';
import {openDB,all,write,setting,mergeDelivery} from './db.js';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls)=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',action);return b;};
let rows=[],selectedCity='',reviewRows=[],waitingWorker=null,busy=false,toastTimer;
function toast(text){$('status').textContent=text;$('status').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('status').hidden=true,6000);}
function fail(error){console.error(error);toast('Could not finish: '+error.message);}
async function refresh(){rows=await all();render();}
function render(){
 const active=rows.filter(r=>!r.deletedAt),cities=[...new Set(active.map(r=>r.city))].sort((a,b)=>a.localeCompare(b));
 if(selectedCity&&!cities.includes(selectedCity))selectedCity='';
 $('cities').replaceChildren();for(const city of ['',...cities]){const b=button(city||'All cities',()=>{selectedCity=city;render();});b.setAttribute('aria-current',String(city===selectedCity));$('cities').append(b);}
 for(const [id,values]of [['city-options',cities],['cuisine-options',[...new Set(active.map(r=>r.cuisine))].sort()]]){$(id).replaceChildren(...values.map(v=>{const o=node('option');o.value=v;return o;}));}
 const q=norm($('search').value);let found=active.filter(r=>(!selectedCity||r.city===selectedCity)&&(!q||norm([r.name,r.city,r.cuisine,r.notes,r.address,...r.tags].join(' ')).includes(q)));
 $('city-heading').textContent=selectedCity||'Your notebook';$('count').textContent=`${found.length} ${found.length===1?'restaurant':'restaurants'}`;
 $('empty').hidden=active.length>0;$('restaurants').replaceChildren();
 if(active.length&&!found.length)$('restaurants').append(node('p','No restaurants match. Try another city or search.','hint'));
 const groups=[...new Set(found.map(r=>r.cuisine))].sort((a,b)=>a.localeCompare(b));
 for(const cuisine of groups){const detail=node('details',undefined,'category');detail.open=true;const items=sortRestaurants(found.filter(r=>r.cuisine===cuisine),$('sort').value);const summary=node('summary',cuisine);summary.append(node('span',String(items.length),'category-count'));detail.append(summary);for(const r of items)detail.append(card(r));$('restaurants').append(detail);}
 const newCount=active.filter(r=>r.assistantNew).length;$('assistant-notice').hidden=!newCount;$('assistant-new-count').textContent=`${newCount} new ${newCount===1?'restaurant':'restaurants'} from your assistant.`;
 $('trash-count').textContent=rows.filter(r=>r.deletedAt).length||'';
 $('backup-notice').hidden=!active.length||!(window.backupDue??true);
}
function card(r,trash=false){const box=node('article',undefined,'card'),body=node('div',undefined,'card-main');if(r.assistantNew)body.append(node('span','New from assistant','tag'));body.append(node('h3',r.name),node('p',`${r.city} · ${r.cuisine}`,'meta'));if(r.notes)body.append(node('p',r.notes));if(r.address)body.append(node('p',r.address,'meta'));if(r.tags.length){const tags=node('div');r.tags.forEach(t=>tags.append(node('span',t,'tag')));body.append(tags);}if(r.url){const a=node('a','Visit website ↗');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}const actions=node('div',undefined,'card-actions');if(trash)actions.append(button('Restore',async()=>{try{await write([{...r,deletedAt:null,updatedAt:new Date().toISOString()}]);await refresh();renderTrash();toast('Restaurant restored.');}catch(e){fail(e);}}));else actions.append(button('Edit',()=>edit(r)),button('Move to trash',async()=>{try{await write([{...r,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]);await refresh();toast('Moved to Trash. You can restore it anytime.');}catch(e){fail(e);}}));body.append(actions);box.append(body);const badge=node('div',undefined,`rating-badge${r.rating==null?' unrated':''}`);if(r.rating==null)badge.textContent='Unrated';else{badge.textContent=String(r.rating);badge.append(node('small',' / 5'));}box.append(badge);return box;}
function edit(r){$('edit-form').reset();$('edit-error').textContent='';$('edit-id').value=r?.id||'';for(const f of ['name','city','cuisine','rating','notes','address','url'])$(f).value=r?.[f]??(f==='city'?selectedCity:'');$('tags').value=(r?.tags||[]).join(', ');$('editor-title').textContent=r?'Edit restaurant':'Add restaurant';$('editor').showModal();$('name').focus();}
$('add').onclick=()=>edit();$('empty-add').onclick=()=>edit();
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;try{const raw=Object.fromEntries(['name','city','cuisine','rating','notes','address','url'].map(f=>[f,$(f).value]));raw.tags=$('tags').value.split(',').map(t=>t.trim()).filter(Boolean);const value=clean(raw),old=rows.find(r=>r.id===$('edit-id').value),now=new Date().toISOString();busy=true;$('save').disabled=true;await write([{...value,id:old?.id||crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now}]);await refresh();$('editor').close();toast('Restaurant saved on this device.');}catch(e){$('edit-error').textContent=e.message;}finally{busy=false;$('save').disabled=false;}});
$('search').oninput=render;$('sort').onchange=render;
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
function startImport(kind='list'){reviewRows=[];$('import-text').value='';$('import-file').value='';$('default-city').value=selectedCity;$('default-cuisine').value='';$('review').replaceChildren();$('import-actions').hidden=true;$('import-error').textContent='';$('import-title').textContent=kind==='assistant'?'Add from your assistant':kind==='restore'?'Restore or merge a backup':'Bring your list';$('importer').showModal();}
$('batch').onclick=()=>startImport();$('empty-import').onclick=()=>startImport();$('assistant').onclick=()=>startImport('assistant');$('restore').onclick=()=>startImport('restore');
$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('Choose a file smaller than 5 MB.');$('import-text').value=await file.text();$('review').replaceChildren();$('import-actions').hidden=true;toast('File loaded. Choose Review import.');}catch(e){$('import-error').textContent=e.message;}};
$('preview').onclick=()=>{try{reviewRows=parseImport($('import-text').value,{city:$('default-city').value,cuisine:$('default-cuisine').value});if(!reviewRows.length)throw Error('No restaurants found.');$('import-error').textContent='';renderReview();}catch(e){$('import-error').textContent=e.message;$('import-actions').hidden=true;$('review').replaceChildren();}};
function reviewValues(){const list=[];for(const fieldset of $('review').children){if(!fieldset.querySelector('[data-include]').checked)continue;const raw={};for(const input of fieldset.querySelectorAll('[data-field]'))raw[input.dataset.field]=input.dataset.field==='tags'?input.value.split(';').map(t=>t.trim()).filter(Boolean):input.value;raw.deletedAt=reviewRows[Number(fieldset.dataset.index)].value.deletedAt??null;list.push(clean(raw));}return list;}
function updateSummary(){try{const p=planImport(rows,reviewValues());$('import-summary').textContent=`${p.add.length} new entries · ${p.duplicates} duplicates skipped`;$('commit-import').disabled=p.add.length===0;$('import-error').textContent='';}catch(e){$('import-summary').textContent='Correct the highlighted row information before saving.';$('commit-import').disabled=true;$('import-error').textContent=e.message;}}
function renderReview(){$('review').replaceChildren();reviewRows.forEach((row,index)=>{const section=node('section',undefined,'review-row');section.dataset.index=String(index);const includeLabel=node('label',` Include restaurant ${index+1}`),include=node('input');include.type='checkbox';include.checked=true;include.dataset.include='';include.style.width='auto';include.style.display='inline';include.style.minHeight='auto';includeLabel.prepend(include);section.append(includeLabel);if(row.error)section.append(node('p',row.error,'error'));for(const f of ['name','city','cuisine','rating','notes','address','url','tags']){const label=node('label',f==='rating'?'Rating (0–5, or blank)':f==='tags'?'Tags (separated by semicolons)':f.charAt(0).toUpperCase()+f.slice(1));const input=node(f==='notes'?'textarea':'input');input.dataset.field=f;input.setAttribute('aria-label',`${f} for restaurant ${index+1}`);const v=row.value?.[f];input.value=f==='tags'?(Array.isArray(v)?v.join('; '):''):(typeof v==='string'||typeof v==='number'?v:'');label.append(input);section.append(label);}if(row.value.deletedAt)section.append(node('p','This entry will be restored into Trash.','hint'));section.addEventListener('input',updateSummary);$('review').append(section);});$('import-actions').hidden=false;updateSummary();}
$('commit-import').onclick=async()=>{if(busy)return;try{const latest=await all(),p=planImport(latest,reviewValues());busy=true;$('commit-import').disabled=true;const now=new Date().toISOString();await write(p.add.map(r=>({...r,id:crypto.randomUUID(),createdAt:now,updatedAt:now})));await refresh();$('importer').close();toast(`${p.add.length} restaurants imported. ${p.duplicates} duplicates skipped.`);}catch(e){$('import-error').textContent=e.message;}finally{busy=false;$('commit-import').disabled=false;}};
async function backup(){try{const current=await all();const data={format:'restaurant-log-backup',version:VERSION,exportedAt:new Date().toISOString(),restaurants:current};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=`table-notes-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);await setting('lastExport',Date.now());window.backupDue=false;render();toast('Backup prepared. Save the downloaded file somewhere safe.');}catch(e){fail(e);}}
$('export').onclick=backup;$('backup-top').onclick=backup;
function renderTrash(){$('trash-list').replaceChildren();const trashed=rows.filter(r=>r.deletedAt);if(!trashed.length)$('trash-list').append(node('p','Nothing in Trash.'));trashed.forEach(r=>$('trash-list').append(card(r,true)));}
$('trash').onclick=()=>{renderTrash();$('trash-dialog').showModal();};
$('persist').onclick=async()=>{try{$('persist-status').textContent=navigator.storage?.persist?(await navigator.storage.persist()?'Durable storage granted. Backups are still important.':'This browser did not grant durable storage. Keep regular backups.'):'This browser does not support durable-storage requests. Keep regular backups.';}catch(e){$('persist-status').textContent='Storage request unavailable. Keep regular backups.';}};
window.tableNotes=Object.freeze({schemaVersion:VERSION,prepareImport(packet){startImport('assistant');$('import-text').value=typeof packet==='string'?packet:JSON.stringify(packet,null,2);$('preview').click();}});
try{await openDB();const last=await setting('lastExport');window.backupDue=!last||Date.now()-last>7*86400000;await refresh();}catch(e){$('empty').hidden=true;$('restaurants').append(node('p','Device storage is unavailable. Your changes cannot be saved. Check browser privacy settings and reload.','error'));for(const b of document.querySelectorAll('button'))b.disabled=true;fail(e);}
if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});const showUpdate=()=>{waitingWorker=registration.waiting;if(waitingWorker)$('update').hidden=false;};showUpdate();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){if(navigator.serviceWorker.controller)showUpdate();else $('offline-status').textContent='Ready for offline use after this page has finished loading.';}});});await navigator.serviceWorker.ready;$('offline-status').textContent='App shell saved for offline use. Your restaurant data stays on this device.';$('apply-update').onclick=()=>{if(document.querySelector('dialog[open]')){toast('Finish or cancel your open form before updating.');return;}waitingWorker?.postMessage({type:'SKIP_WAITING'});};let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing&&waitingWorker){refreshing=true;location.reload();}});}catch(e){$('offline-status').textContent='Offline installation unavailable. Open the app over HTTPS and try again.';}}else $('offline-status').textContent='This browser does not support offline installation.';


let checkingInbox=false;
async function readInbox(){
 const controller=navigator.serviceWorker?.controller;
 if(!controller){const r=await fetch('./api/inbox',{credentials:'same-origin',cache:'no-store',redirect:'error'});return {status:r.status,data:r.ok?await r.json():null};}
 return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('Inbox check timed out.'));},15000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};controller.postMessage({type:'CHECK_ASSISTANT_INBOX'},[channel.port2]);});
}
async function checkInbox(){
 if(checkingInbox||busy||document.querySelector('dialog[open]'))return;
 checkingInbox=true;$('inbox-check').disabled=true;
 try{
  const result=await readInbox();$('inbox-connect').hidden=result.status!==401;
  if(result.status===401){$('inbox-status').textContent='Connect your ChatGPT account once to receive assistant entries. Your notebook stays local.';return;}
  if(result.status===404){$('inbox-status').textContent='Assistant inbox is available in the hosted Table Notes app.';$('inbox-connect').hidden=false;$('inbox-connect').href='https://table-notes-restaurants.savorymug256.chatgpt.site/';$('inbox-connect').textContent='Open hosted Table Notes';return;}
  if(result.status!==200)throw Error('Inbox unavailable. Your notebook is still available offline.');
  if(busy||document.querySelector('dialog[open]'))return;
  const packets=result.data?.packets;if(!Array.isArray(packets)||packets.length>20)throw Error('Invalid inbox response.');
  let added=0;
  for(const packet of packets){
   const parsed=parseImport(JSON.stringify(packet.packet));if(parsed.some(r=>r.error))throw Error('An inbox delivery has invalid restaurant fields.');
   added+=await mergeDelivery(packet.id,parsed.map(r=>r.value));
   // Only receipt IDs leave the device. No notebook records are uploaded.
   const ack=await fetch('./api/inbox/ack',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[packet.id]})});
   if(!ack.ok)throw Error('Entries saved locally; inbox receipt will be retried.');
  }
  await refresh();$('inbox-status').textContent=added?`${added} new restaurants saved on this device.`:'Assistant inbox connected. No new deliveries.';
  if(added)toast(`${added} new restaurants from your assistant.`);
 }catch(e){await refresh().catch(()=>{});$('inbox-status').textContent=e.message;}
 finally{checkingInbox=false;$('inbox-check').disabled=false;}
}
$('inbox-check').onclick=checkInbox;
$('assistant-mark-seen').onclick=async()=>{try{await write(rows.filter(r=>r.assistantNew).map(r=>({...r,assistantNew:false})));await refresh();}catch(e){fail(e);}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkInbox();});
window.addEventListener('pageshow',()=>checkInbox());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>checkInbox());
await checkInbox();
