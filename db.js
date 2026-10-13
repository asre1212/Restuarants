import {planImport,key,roundQuarter} from './core.js';
const DATABASE = 'table-notes-local-v1';
let db;
export async function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{request.result.createObjectStore('restaurants',{keyPath:'id'});request.result.createObjectStore('settings',{keyPath:'key'});};request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Table Notes tabs, then reload.'));});}
export function all(){return new Promise((resolve,reject)=>{const r=db.transaction('restaurants').objectStore('restaurants').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export function write(rows){return new Promise((resolve,reject)=>{const tx=db.transaction('restaurants','readwrite');const store=tx.objectStore('restaurants');for(const row of rows)store.put({...row,rating:roundQuarter(row.rating)});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save changes.'));});}
export function setting(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('settings',value===undefined?'readonly':'readwrite');const store=tx.objectStore('settings');const r=value===undefined?store.get(key):store.put({key,value});let result;r.onsuccess=()=>{result=r.result?.value;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}


// Records and receipt commit together; readwrite serialization prevents cross-tab duplicates.
export function mergeDelivery(id,incoming,updateRatings=false){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings'],'readwrite'),records=tx.objectStore('restaurants'),settings=tx.objectStore('settings');let count=0;
 const receipt=settings.get('delivery:'+id);receipt.onsuccess=()=>{if(receipt.result)return;const current=records.getAll();current.onsuccess=()=>{try{const plan=planImport(current.result,incoming),now=new Date().toISOString();for(const row of plan.add)records.put({...row,id:crypto.randomUUID(),createdAt:now,updatedAt:now,assistantNew:true});if(updateRatings){const ratings=new Map(incoming.map(row=>[key(row),row.rating]));for(const row of current.result)if(ratings.has(key(row)))records.put({...row,rating:ratings.get(key(row)),updatedAt:now});}count=plan.add.length;settings.put({key:'delivery:'+id,value:true});}catch{tx.abort();}};};
 tx.oncomplete=()=>resolve(count);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save inbox entries.'));
});}

export function updateMichelin(id,michelinStars){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.get(id);
 request.onsuccess=()=>{if(request.result)store.put({...request.result,michelinStars,updatedAt:new Date().toISOString()});};
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save Michelin selection.'));
});}

export function updateLocation(id,latitude,longitude,expected){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.get(id);
 request.onsuccess=()=>{if(request.result&&!request.result.deletedAt&&(!expected||['name','city','address'].every(f=>request.result[f]===expected[f])))store.put({...request.result,latitude,longitude,updatedAt:new Date().toISOString()});};
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save location.'));
});}

// One local transaction rounds legacy ratings without changing notes, locations, or trash.
export function roundStoredRatings(){return new Promise((resolve,reject)=>{
 const tx=db.transaction('restaurants','readwrite'),store=tx.objectStore('restaurants'),request=store.getAll();
 request.onsuccess=()=>{for(const row of request.result){if(typeof row.rating!=='number'||!Number.isFinite(row.rating))continue;const rounded=roundQuarter(row.rating);if(rounded!==row.rating)store.put({...row,rating:rounded});}};
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not round saved ratings.'));
});}
