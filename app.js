import {createRestaurantMap} from './map.js';
import {clean,sortRestaurants,sortMichelin,tastingNotes,key,norm,parseImport,planImport,roundQuarter,VERSION} from './core.js';
import {openDB,all,write,setting,mergeDelivery,roundStoredRatings} from './db.js';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,cls)=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',action);return b;};
let collection='all',view='list';
const maps=createRestaurantMap({getRows:()=>rows,onChange:()=>refresh(),onEdit:r=>edit(r),onError:fail});
$('view-list').onclick=()=>{view='list';render();};
$('view-map').onclick=()=>{view='map';render();maps.locateMissing();};
$('map-cuisine').onchange=render;
let rows=[],selectedCity='',reviewRows=[],waitingWorker=null,busy=false,toastTimer;
function toast(text){$('status').textContent=text;$('status').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('status').hidden=true,6000);}
function fail(error){console.error(error);toast('Could not finish: '+error.message);}
async function refresh(){rows=await all();render();}
function render(){
 const active=rows.filter(r=>!r.deletedAt),cities=[...new Set(active.map(r=>r.city))].sort((a,b)=>a.localeCompare(b));
 if(selectedCity&&!cities.includes(selectedCity))selectedCity='';
 $('cities').replaceChildren();for(const [index,city] of cities.entries()){const b=button(city,()=>{collection='all';selectedCity=city;render();});b.id='city-tab-'+index;b.setAttribute('role','tab');b.setAttribute('aria-controls','restaurants');b.setAttribute('aria-selected',String(collection==='all'&&city===selectedCity));$('cities').append(b);}
 for(const [id,values]of [['city-options',cities],['cuisine-options',[...new Set(active.map(r=>r.cuisine))].sort()]]){$(id).replaceChildren(...values.map(v=>{const o=node('option');o.value=v;return o;}));}
 const q=norm($('search').value);let found=active.filter(r=>(!selectedCity||r.city===selectedCity)&&(!q||norm([r.name,r.city,r.cuisine,r.notes,r.address,...r.tags].join(' ')).includes(q)));
 const cuisine=$('map-cuisine').value;const cuisines=[...new Set(active.map(r=>r.cuisine))].sort((a,b)=>a.localeCompare(b));$('map-cuisine').replaceChildren(...['',...cuisines].map(c=>{const o=node('option',c||'All cuisines');o.value=c;return o;}));$('map-cuisine').value=cuisines.includes(cuisine)?cuisine:'';if(cuisine)found=found.filter(r=>r.cuisine===cuisine);
 if(collection==='michelin')found=sortMichelin(active.filter(r=>!q||norm([r.name,r.city,r.cuisine,r.notes,r.address,...r.tags].join(' ')).includes(q)));
 if(collection==='michelin'&&cuisine)found=found.filter(r=>r.cuisine===cuisine);
 $('sort').disabled=collection==='michelin';$('sort').parentElement.hidden=collection==='michelin';
 $('tab-all').setAttribute('aria-selected',String(collection==='all'&&!selectedCity));$('tab-michelin').setAttribute('aria-selected',String(collection==='michelin'));$('michelin-count').textContent=active.filter(r=>r.michelinStars>0).length||'';$('restaurants').setAttribute('aria-labelledby',collection==='michelin'?'tab-michelin':selectedCity?'city-tab-'+cities.indexOf(selectedCity):'tab-all');
 $('city-heading').textContent=collection==='michelin'?'Michelin · stars, then your rating':selectedCity||'Your collection';$('count').textContent=`${found.length} ${found.length===1?'restaurant':'restaurants'}`;
 $('empty').hidden=active.length>0||collection==='michelin'||view==='map';$('restaurants').replaceChildren();
 if((active.length||collection==='michelin')&&!found.length)$('restaurants').append(node('p',collection==='michelin'?'No starred restaurants here yet. Mark Michelin entries in All restaurants.':'No restaurants match. Try another city or search.','hint'));
 $('restaurants').hidden=view==='map';$('map-section').hidden=view!=='map';$('view-list').setAttribute('aria-pressed',String(view==='list'));$('view-map').setAttribute('aria-pressed',String(view==='map'));if(view==='map')maps.render(found);
 if(collection==='michelin'){for(const r of found)$('restaurants').append(card(r));}
 else {const groups=[...new Set(found.map(r=>r.cuisine))].sort((a,b)=>a.localeCompare(b));
 for(const cuisine of groups){const detail=node('details',undefined,'category');detail.open=true;const items=sortRestaurants(found.filter(r=>r.cuisine===cuisine),$('sort').value);const summary=node('summary',cuisine);summary.append(node('span',String(items.length),'category-count'));detail.append(summary);for(const r of items)detail.append(card(r));$('restaurants').append(detail);}
 }
 const newCount=active.filter(r=>r.assistantNew).length;$('assistant-notice').hidden=!newCount;$('assistant-new-count').textContent=`${newCount} new ${newCount===1?'restaurant':'restaurants'} from your assistant.`;
 $('trash-count').textContent=rows.filter(r=>r.deletedAt).length||'';
 $('backup-notice').hidden=!active.length||!(window.backupDue??true);
}
function actionIcon(kind,label,action){
 const b=button('',action,'listing-icon');b.setAttribute('aria-label',label);b.title=label;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='edit'?'M16 3l5 5M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16z':'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');svg.append(path);b.append(svg);return b;
}
let deleteId=null;
function confirmDelete(r){deleteId=r.id;$('delete-message').textContent=`Move “${r.name}” to Trash? You can restore it later.`;$('delete-error').textContent='';$('delete-dialog').showModal();$('delete-cancel').focus();}
$('delete-dialog').addEventListener('close',()=>{deleteId=null;});
$('delete-confirm').onclick=async()=>{if(!deleteId)return;const id=deleteId;$('delete-confirm').disabled=true;try{const current=(await all()).find(r=>r.id===id);if(current&&!current.deletedAt)await write([{...current,deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]);$('delete-dialog').close();await refresh();toast('Moved to Trash. You can restore it anytime.');}catch(e){$('delete-error').textContent=e.message;}finally{$('delete-confirm').disabled=false;}};
function card(r,trash=false){
 const box=node('article',undefined,'card'),body=node('div',undefined,'card-main'),title=node('div',undefined,'listing-title');title.append(node('h3',r.name));
 if(r.michelinStars>0){const mark=node('span',undefined,'michelin-badge');mark.setAttribute('aria-label',`${r.michelinStars} Michelin ${r.michelinStars===1?'star':'stars'}`);mark.title=`${r.michelinStars} Michelin ${r.michelinStars===1?'star':'stars'}`;for(let i=0;i<r.michelinStars;i++){const image=node('img');image.src='./icons/michelin-star.png';image.alt='';image.width=24;image.height=26;mark.append(image);}title.append(mark);}
 body.append(title,node('p',`${r.city} · ${r.cuisine}`,'meta'));if(r.notes)body.append(tastings(r.notes));if(r.address)body.append(node('p',r.address,'meta'));
 if(r.url){const a=node('a','Visit website ↗');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
 const side=node('div',undefined,'listing-side'),actions=node('div',undefined,'card-actions');
 if(trash)actions.append(button('Restore',async()=>{try{await write([{...r,deletedAt:null,updatedAt:new Date().toISOString()}]);await refresh();renderTrash();toast('Restaurant restored.');}catch(e){fail(e);}}));
 else actions.append(actionIcon('edit',`Edit ${r.name}`,()=>edit(r)),actionIcon('delete',`Delete ${r.name}`,()=>confirmDelete(r)));
 const badge=node('div',undefined,`rating-badge${r.rating==null?' unrated':''}`);if(r.rating==null){const count=tastingNotes(r.notes).items.length;badge.textContent=count?`${count} tastings`:'Unrated';}else{badge.textContent=String(r.rating);badge.append(node('small',' / 5'));}
 side.append(actions,badge);box.append(body,side);return box;
}
function edit(r){$('edit-form').reset();$('edit-error').textContent='';$('edit-id').value=r?.id||'';for(const f of ['name','city','cuisine','rating','notes','address','url','latitude','longitude'])$(f).value=r?.[f]??(f==='city'?selectedCity:'');$('tags').value=(r?.tags||[]).join(', ');$('michelin-enabled').checked=(r?.michelinStars||0)>0;$('michelin-stars').value=String(r?.michelinStars||1);$('michelin-stars').disabled=!$('michelin-enabled').checked;$('editor-title').textContent=r?'Edit restaurant':'Add restaurant';$('editor').showModal();$('name').focus();}
$('add').onclick=()=>edit();$('empty-add').onclick=()=>edit();
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;try{const raw=Object.fromEntries(['name','city','cuisine','rating','notes','address','url','latitude','longitude'].map(f=>[f,$(f).value]));raw.michelinStars=$('michelin-enabled').checked?Number($('michelin-stars').value):0;raw.tags=$('tags').value.split(',').map(t=>t.trim()).filter(Boolean);const value=clean(raw),old=rows.find(r=>r.id===$('edit-id').value),now=new Date().toISOString();busy=true;$('save').disabled=true;await write([{...old,...value,id:old?.id||crypto.randomUUID(),createdAt:old?.createdAt||now,updatedAt:now}]);await refresh();$('editor').close();toast('Restaurant saved on this device.');maps.locateMissing();}catch(e){$('edit-error').textContent=e.message;}finally{busy=false;$('save').disabled=false;}});
$('michelin-enabled').onchange=()=>{$('michelin-stars').disabled=!$('michelin-enabled').checked;};
$('tab-all').onclick=()=>{collection='all';selectedCity='';render();};$('tab-michelin').onclick=()=>{collection='michelin';render();};
document.querySelector('.collection-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...document.querySelectorAll('.collection-tabs [role=tab]')],index=buttons.indexOf(e.target);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length,id=buttons[next].id;buttons[next].click();$(id)?.focus();});
$('search').oninput=render;$('sort').onchange=render;
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
function startImport(kind='list'){reviewRows=[];$('import-text').value='';$('import-file').value='';$('default-city').value=selectedCity;$('default-cuisine').value='';$('review').replaceChildren();$('import-actions').hidden=true;$('import-error').textContent='';$('import-title').textContent=kind==='assistant'?'Add from your assistant':kind==='restore'?'Restore or merge a backup':'Bring your list';$('importer').showModal();}
$('batch').onclick=()=>startImport();$('empty-import').onclick=()=>startImport();$('assistant').onclick=()=>startImport('assistant');$('restore').onclick=()=>startImport('restore');
$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>5_000_000)throw Error('Choose a file smaller than 5 MB.');$('import-text').value=await file.text();$('review').replaceChildren();$('import-actions').hidden=true;toast('File loaded. Choose Review import.');}catch(e){$('import-error').textContent=e.message;}};
$('preview').onclick=()=>{try{reviewRows=parseImport($('import-text').value,{city:$('default-city').value,cuisine:$('default-cuisine').value});if(!reviewRows.length)throw Error('No restaurants found.');$('import-error').textContent='';renderReview();}catch(e){$('import-error').textContent=e.message;$('import-actions').hidden=true;$('review').replaceChildren();}};
function reviewValues(){const list=[];for(const fieldset of $('review').children){if(!fieldset.querySelector('[data-include]').checked)continue;const raw={};for(const input of fieldset.querySelectorAll('[data-field]'))raw[input.dataset.field]=input.dataset.field==='tags'?input.value.split(';').map(t=>t.trim()).filter(Boolean):input.value;raw.deletedAt=reviewRows[Number(fieldset.dataset.index)].value.deletedAt??null;list.push(clean(raw));}return list;}
function updateSummary(){try{const p=planImport(rows,reviewValues());$('import-summary').textContent=`${p.add.length} new entries · ${p.duplicates} duplicates skipped`;$('commit-import').disabled=p.add.length===0;$('import-error').textContent='';}catch(e){$('import-summary').textContent='Correct the highlighted row information before saving.';$('commit-import').disabled=true;$('import-error').textContent=e.message;}}
function renderReview(){$('review').replaceChildren();reviewRows.forEach((row,index)=>{const section=node('section',undefined,'review-row');section.dataset.index=String(index);const includeLabel=node('label',` Include restaurant ${index+1}`),include=node('input');include.type='checkbox';include.checked=true;include.dataset.include='';include.style.width='auto';include.style.display='inline';include.style.minHeight='auto';includeLabel.prepend(include);section.append(includeLabel);if(row.error)section.append(node('p',row.error,'error'));for(const f of ['name','city','cuisine','rating','notes','address','url','tags','michelinStars','latitude','longitude']){const label=node('label',f==='michelinStars'?'Michelin stars (0–3)':f==='rating'?'Rating (0–5, or blank)':f==='tags'?'Tags (separated by semicolons)':f.charAt(0).toUpperCase()+f.slice(1));const input=node(f==='notes'?'textarea':'input');input.dataset.field=f;input.setAttribute('aria-label',`${f} for restaurant ${index+1}`);const v=f==='michelinStars'?(row.value?.[f]??0):row.value?.[f];input.value=f==='tags'?(Array.isArray(v)?v.join('; '):''):(typeof v==='string'||typeof v==='number'?v:'');label.append(input);section.append(label);}if(row.value.deletedAt)section.append(node('p','This entry will be restored into Trash.','hint'));section.addEventListener('input',updateSummary);$('review').append(section);});$('import-actions').hidden=false;updateSummary();}
$('commit-import').onclick=async()=>{if(busy)return;try{const latest=await all(),p=planImport(latest,reviewValues());busy=true;$('commit-import').disabled=true;const now=new Date().toISOString();await write(p.add.map(r=>({...r,id:crypto.randomUUID(),createdAt:now,updatedAt:now})));await refresh();$('importer').close();maps.locateMissing();toast(`${p.add.length} restaurants imported. ${p.duplicates} duplicates skipped.`);}catch(e){$('import-error').textContent=e.message;}finally{busy=false;$('commit-import').disabled=false;}};
async function backup(){try{const current=await all();const data={format:'restaurant-log-backup',version:VERSION,exportedAt:new Date().toISOString(),restaurants:current};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=`restaurants-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);await setting('lastExport',Date.now());window.backupDue=false;render();toast('Backup prepared. Save the downloaded file somewhere safe.');}catch(e){fail(e);}}
$('export').onclick=backup;$('backup-top').onclick=backup;
function renderTrash(){$('trash-list').replaceChildren();const trashed=rows.filter(r=>r.deletedAt);if(!trashed.length)$('trash-list').append(node('p','Nothing in Trash.'));trashed.forEach(r=>$('trash-list').append(card(r,true)));}
$('trash').onclick=()=>{renderTrash();$('trash-dialog').showModal();};
$('persist').onclick=async()=>{try{$('persist-status').textContent=navigator.storage?.persist?(await navigator.storage.persist()?'Durable storage granted. Backups are still important.':'This browser did not grant durable storage. Keep regular backups.'):'This browser does not support durable-storage requests. Keep regular backups.';}catch(e){$('persist-status').textContent='Storage request unavailable. Keep regular backups.';}};
window.tableNotes=Object.freeze({schemaVersion:VERSION,prepareImport(packet){startImport('assistant');$('import-text').value=typeof packet==='string'?packet:JSON.stringify(packet,null,2);$('preview').click();}});
try{await openDB();await roundStoredRatings();const last=await setting('lastExport');window.backupDue=!last||Date.now()-last>7*86400000;await refresh();}catch(e){$('empty').hidden=true;$('restaurants').append(node('p','Device storage is unavailable. Your changes cannot be saved. Check browser privacy settings and reload.','error'));for(const b of document.querySelectorAll('button'))b.disabled=true;fail(e);}
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
  if(result.status===404){$('inbox-status').textContent='Assistant inbox is available in the hosted Restaurants app.';$('inbox-connect').hidden=false;$('inbox-connect').href='https://table-notes-restaurants.savorymug256.chatgpt.site/';$('inbox-connect').textContent='Open hosted Restaurants';return;}
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
  await refresh();const saved=rows.filter(r=>!r.deletedAt).length;$('inbox-status').textContent=added?`${added} new restaurants saved on this device. ${saved} total.`:`Inbox up to date · ${saved} ${saved===1?'restaurant':'restaurants'} saved on this device.`;
  if(added)maps.locateMissing();
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


function tastings(notes){
 const {items,general}=tastingNotes(notes);if(!items.length)return node('p',notes);
 const detail=node('details',undefined,'tasting-notes'),summary=node('summary',`Tasting notes · ${items.length}`);detail.append(summary);
 for(const item of items){const row=node('div',undefined,'tasting-row'),title=node('span',item.name,'tasting-name'),score=node('span',String(roundQuarter(item.rating)),'tasting-score');score.append(node('small',' / 5'));row.append(title,score);if(item.comment)row.append(node('p',item.comment,'tasting-comment'));detail.append(row);}
 if(general.length)detail.append(node('p',general.join('\n'),'tasting-general'));return detail;
}

$('github-pull').onclick=async()=>{
 if(checkingInbox||busy||document.querySelector('dialog[open]')){toast('Finish the open form before pulling.');return;}
 checkingInbox=true;$('github-pull').disabled=true;$('inbox-check').disabled=true;let saved=0;
 try{
  const response=await fetch('./api/github/pull',{method:'POST',credentials:'same-origin',cache:'no-store'}),data=await response.json();
  if(!response.ok)throw Error(data.error||'GitHub pull failed.');
  if(!Array.isArray(data.packets))throw Error('Invalid GitHub response.');
  if(data.unmatched)throw Error('A list is waiting for a different ChatGPT account. Sign in with the account used in this chat.');
  for(const packet of data.packets){
   const parsed=parseImport(JSON.stringify(packet.packet));if(parsed.some(r=>r.error))throw Error('Invalid GitHub entry fields.');
   saved+=await mergeDelivery('github:'+packet.id,parsed.map(r=>r.value),packet.packet.updateRatings===true);
   const verified=new Set((await all()).map(key));if(parsed.some(r=>!verified.has(key(r.value))))throw Error('Device storage verification failed. The GitHub file has been kept.');
   const ack=await fetch('./api/github/ack',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:packet.id,receipt:packet.receipt,receiptToken:packet.receiptToken})});
   const result=await ack.json();if(!ack.ok||!result.acknowledged)throw Error(result.error||'Saved locally; GitHub acknowledgement failed. Pull again to retry.');
  }
  await refresh();collection='all';selectedCity='';$('search').value='';render();if(data.packets.length)maps.locateMissing();
  const message=data.packets.length?`${saved} new restaurants saved locally. Ratings updated where requested. GitHub deletion acknowledged; cleanup is scheduled.`:`No GitHub lists waiting. ${rows.filter(r=>!r.deletedAt).length} restaurants on this device.`;$('inbox-status').textContent=message;toast(message);
 }catch(e){await refresh().catch(()=>{});$('inbox-status').textContent=e.message;toast(e.message);}
 finally{checkingInbox=false;$('github-pull').disabled=false;$('inbox-check').disabled=false;}
};
