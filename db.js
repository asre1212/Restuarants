import {planImport} from './core.js';
const DATABASE = 'table-notes-local-v1';
let db;
export async function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{request.result.createObjectStore('restaurants',{keyPath:'id'});request.result.createObjectStore('settings',{keyPath:'key'});};request.onsuccess=()=>{db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Table Notes tabs, then reload.'));});}
export function all(){return new Promise((resolve,reject)=>{const r=db.transaction('restaurants').objectStore('restaurants').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export function write(rows){return new Promise((resolve,reject)=>{const tx=db.transaction('restaurants','readwrite');const store=tx.objectStore('restaurants');for(const row of rows)store.put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save changes.'));});}
export function setting(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction('settings',value===undefined?'readonly':'readwrite');const store=tx.objectStore('settings');const r=value===undefined?store.get(key):store.put({key,value});let result;r.onsuccess=()=>{result=r.result?.value;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}


// Records and receipt commit together; readwrite serialization prevents cross-tab duplicates.
export function mergeDelivery(id,incoming){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['restaurants','settings'],'readwrite'),records=tx.objectStore('restaurants'),settings=tx.objectStore('settings');let count=0;
 const receipt=settings.get('delivery:'+id);receipt.onsuccess=()=>{if(receipt.result)return;const current=records.getAll();current.onsuccess=()=>{try{const plan=planImport(current.result,incoming),now=new Date().toISOString();for(const row of plan.add)records.put({...row,id:crypto.randomUUID(),createdAt:now,updatedAt:now,assistantNew:true});count=plan.add.length;settings.put({key:'delivery:'+id,value:true});}catch{tx.abort();}};};
 tx.oncomplete=()=>resolve(count);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save inbox entries.'));
});}
