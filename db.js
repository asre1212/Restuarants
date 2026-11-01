import {planImport,key,roundQuarter,withVisitStatus,canonicalCuisine,isNYC,isKoreanPocha,norm} from './core.js';
import {backupRecords,stableRecord} from './backup.js';
const DATABASE = 'table-notes-local-v1';
let db;
function notebookChanged(){if(globalThis.window)window.dispatchEvent(new window.Event('notebook-changed'));}
export async function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{request.result.createObjectStore('restaurants',{keyPath:'id'});request.result.createObjectStore('settings',{keyPath:'key'});};request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Table Notes tabs, then reload.'));});}
export function all(){return new Promise((resolve,reject)=>{const r=db.transaction('restaurants').objectStore('restaurants').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export function write(rows){return new Promise((resolve,reject)=>{const tx=db.transaction('restaurants','readwrite');const store=tx.objectStore('restaurants');for(const row of rows)store.put(withVisitStatus({...row,cuisine:canonicalCuisine(row.city,row.cuisine),rating:roundQuarter(row.rating)}));tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save changes.'));});}
export function setting(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('settings',value===undefined?'readonly':'readwrite');const store=tx.objectStore('settings');const r=value===undefined?store.get(key):store.put({key,value});let result;r.onsuccess=()=>{result=r.result?.value;};tx.oncomplete=()=>{if(value!==undefined&&key.startsWith('category-note:'))notebookChanged();resolve(result);};tx.onerror=()=>reject(tx.error);});}

export function notebookBackup(){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings']),rows=tx.objectStore('restaurants').getAll(),settings=tx.objectStore('settings').getAll();
 tx.oncomplete=()=>resolve({format:'restaurant-log-backup',version:1,exportedAt:new Date().toISOString(),restaurants:rows.result,categoryNotes:Object.fromEntries(settings.result.filter(r=>r.key.startsWith('category-note:')).map(r=>[r.key.slice(14),r.value])),settings:Object.fromEntries(settings.result.filter(r=>r.key.startsWith('delivery:')||r.key.startsWith('category-alias-copied:')).map(r=>[r.key,r.value]))});
 tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}

export const SHARING_KEY='private-sharing-v1';
// Connection keys never leave this device in a backup or in a notebook snapshot.
export function sharingState(patch,expectedToken){return new Promise((resolve,reject)=>{
 const tx=db.transaction('settings',patch?'readwrite':'readonly'),store=tx.objectStore('settings'),read=store.get(SHARING_KEY);let result;
 read.onsuccess=()=>{result=read.result?.value||{};if(patch&&(expectedToken===undefined||result.token===expectedToken)){result={...result,...patch};store.put({key:SHARING_KEY,value:result});}};
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}
export function sharingSnapshot(){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings'],'readwrite'),settings=tx.objectStore('settings'),rows=tx.objectStore('restaurants').getAll(),saved=settings.getAll();let result;
 saved.onsuccess=()=>{const state=saved.result.find(r=>r.key===SHARING_KEY)?.value;if(!state?.enabled||!state.token)return;const sequence=(state.sequence||0)+1;settings.put({key:SHARING_KEY,value:{...state,sequence}});result={state:{...state,sequence},snapshot:{format:'restaurant-private-copy',version:1,sequence,capturedAt:new Date().toISOString(),categoryNotes:Object.fromEntries(saved.result.filter(r=>r.key.startsWith('category-note:')).map(r=>[r.key.slice(14),r.value]))}};};
 tx.oncomplete=()=>{if(result)result.snapshot.restaurants=rows.result;resolve(result);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}

// Restore in one transaction. Same-name records remain separate. An ID conflict
// preserves both versions under a repeatable alternate ID, without overwrites.
export async function restoreNotebook(packet){
 const incoming=await backupRecords(packet);
 const result=await new Promise((resolve,reject)=>{
  const tx=db.transaction(['restaurants','settings'],'readwrite'),records=tx.objectStore('restaurants'),settings=tx.objectStore('settings');
  const rows=records.getAll(),saved=settings.getAll();let added=0,kept=0,copies=0;
  rows.onsuccess=()=>{
   const current=new Map(rows.result.map(row=>[row.id,row]));
   for(const {row,conflictId} of incoming){
    let next=row;const existing=current.get(row.id);
    if(existing){if(stableRecord(existing)===stableRecord(row)){kept++;continue;}next={...row,id:conflictId};if(current.has(conflictId)){kept++;continue;}copies++;}
    records.put(next);current.set(next.id,next);added++;
   }
  };
  saved.onsuccess=()=>{
   const current=new Map(saved.result.map(row=>[row.key,row.value]));
   for(const [key,value]of Object.entries(packet.settings))if(!current.has(key))settings.put({key,value});
   for(const [path,value]of Object.entries(packet.categoryNotes)){
    const key='category-note:'+path,existing=current.get(key);
    if(existing===undefined)settings.put({key,value});
    else if(typeof existing==='string'&&value&&!('\n\n'+existing+'\n\n').includes('\n\n'+value+'\n\n'))settings.put({key,value:existing?existing+'\n\n'+value:value});
   }
  };
  tx.oncomplete=()=>{notebookChanged();resolve({added,kept,copies,total:incoming.length});};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Backup restore failed; nothing was replaced.'));
 });
 await reconcilePochaCategories();return result;
}


// Records and receipt commit together; readwrite serialization prevents cross-tab duplicates.
export function mergeDelivery(id,incoming,updateRatings=false){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings'],'readwrite'),records=tx.objectStore('restaurants'),settings=tx.objectStore('settings');let count=0;
 const receipt=settings.get('delivery:'+id);receipt.onsuccess=()=>{if(receipt.result)return;const current=records.getAll();current.onsuccess=()=>{try{const plan=planImport(current.result,incoming),now=new Date().toISOString();for(const row of plan.add)records.put({...row,id:crypto.randomUUID(),createdAt:now,updatedAt:now,assistantNew:true});if(updateRatings){const ratings=new Map(incoming.map(row=>[key(row),row.rating]));for(const row of current.result)if(ratings.has(key(row)))records.put(withVisitStatus({...row,rating:ratings.get(key(row)),updatedAt:now}));}count=plan.add.length;settings.put({key:'delivery:'+id,value:true});}catch{tx.abort();}};};
 tx.oncomplete=()=>{notebookChanged();resolve(count);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save inbox entries.'));
});}

export function updateMichelin(id,michelinStars){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.get(id);
 request.onsuccess=()=>{if(request.result)store.put({...request.result,michelinStars,updatedAt:new Date().toISOString()});};
 tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save Michelin selection.'));
});}

export function updateLocation(id,latitude,longitude,expected){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.get(id);
 request.onsuccess=()=>{if(request.result&&!request.result.deletedAt&&(!expected||['name','city','address'].every(f=>request.result[f]===expected[f])))store.put({...request.result,latitude,longitude,updatedAt:new Date().toISOString()});};
 tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save location.'));
});}

// One local transaction rounds legacy ratings without changing notes, locations, or trash.
export function roundStoredRatings(){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.getAll();
 request.onsuccess=()=>{for(const row of request.result){if(typeof row.rating!=='number'||!Number.isFinite(row.rating))continue;const rounded=roundQuarter(row.rating);if(rounded!==row.rating)store.put({...row,rating:rounded});}};
 tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not round saved ratings.'));
});}

// Reconcile every saved entry locally, including legacy imports and Trash.
export function reconcileVisitStatus(){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.getAll();
 request.onsuccess=()=>{for(const row of request.result){const next=withVisitStatus(row);if(JSON.stringify(next.tags)!==JSON.stringify(row.tags))store.put(next);}};
 tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not update To try entries.'));
});}

// Relabel in place, including Trash. Never merge or delete restaurant records,
// even when two entries would now have the same import key.
export function reconcilePochaCategories(){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings'],'readwrite'),records=tx.objectStore('restaurants'),settings=tx.objectStore('settings');
 const rows=records.getAll();rows.onsuccess=()=>{for(const row of rows.result){const cuisine=canonicalCuisine(row.city,row.cuisine);if(cuisine!==row.cuisine)records.put({...row,cuisine});}};
 const notes=settings.getAll();notes.onsuccess=()=>{
  const values=new Map(notes.result.map(row=>[row.key,row.value]));
  for(const {key:source,value} of notes.result){
   if(!source.startsWith('category-note:')||typeof value!=='string'||!value.trim())continue;
   let path;try{path=JSON.parse(source.slice(14));}catch{continue;}
   if(!Array.isArray(path)||!(path[0]==='*'||isNYC(path[0])))continue;
   if(!(path.length===2&&isKoreanPocha(path[1])||path.length===3&&norm(path[1])==='korean'&&norm(path[2])==='pocha'))continue;
   const target='category-note:'+JSON.stringify([path[0],'Korean','Pocha']),marker='category-alias-copied:'+source;
   if(source===target||values.get(marker)===value)continue;
   const current=values.get(target),hasCopy=typeof current==='string'&&('\n\n'+current+'\n\n').includes('\n\n'+value+'\n\n');
   const merged=hasCopy?current:typeof current==='string'&&current?current+'\n\n'+value:value;
   settings.put({key:target,value:merged});values.set(target,merged);
   // Keep original notes, and remember each copy so later edits stay intact.
   settings.put({key:marker,value});
  }
 };
 tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not combine Pocha categories.'));
});}

export function categoryNotes(){return new Promise((resolve,reject)=>{const r=db.transaction('settings').objectStore('settings').getAll();r.onsuccess=()=>resolve(Object.fromEntries(r.result.filter(r=>r.key.startsWith('category-note:')).map(r=>[r.key.slice(14),r.value])));r.onerror=()=>reject(r.error);});}
export function restoreCategoryNotes(notes){
 if(notes===undefined)return Promise.resolve();
 if(!notes||typeof notes!=='object'||Array.isArray(notes)||Object.keys(notes).length>2000||Object.entries(notes).some(([k,v])=>k.length>4000||typeof v!=='string'||v.length>20000))throw Error('Invalid category notes in backup.');
 return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');for(const [key,value]of Object.entries(notes)){const k='category-note:'+key,r=store.get(k);r.onsuccess=()=>{if(!r.result)store.put({key:k,value});};}tx.oncomplete=()=>{notebookChanged();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}).then(reconcilePochaCategories);
}
