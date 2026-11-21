import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {canonicalCity,clean,key,parseImport,planImport} from '../core.js';
import {all,mergeDelivery,openDB,reconcilePochaCategories,restoreNotebook,setting,write} from '../db.js';
import {parseNotebookBackup} from '../backup.js';

const row=(id,city='NYC',extra={})=>({id,name:'Same saved place',city,cuisine:'Korean / Pocha',rating:4.25,notes:'Unchanged note\nDish 4.2/5',tags:['Visited'],deletedAt:null,address:'',url:'',latitude:null,longitude:null,michelinStars:0,...extra});
const note=path=>'category-note:'+JSON.stringify(path);
const backup=rows=>parseNotebookBackup(JSON.stringify({format:'restaurant-log-backup',version:1,restaurants:rows}));

test('canonicalizes NYC only and normalizes write, CSV, JSON, delivery and backup inputs',async()=>{
 assert.deepEqual(['nyc','NYC',' nYc ','ＮＹＣ','New York','London'].map(canonicalCity),['NYC','NYC','NYC','NYC','New York','London']);
 assert.equal(clean(row('a','nYc')).city,'NYC');
 assert.equal(key(row('a',' nYC ')),key(row('b','NYC')));
 assert.equal(parseImport('name,city,cuisine\nExample,nyc,Italian')[0].value.city,'NYC');
 assert.equal(planImport([],[row('a','nyc')]).add[0].city,'NYC');
 globalThis.indexedDB=new IDBFactory();const db=await openDB();
 await write([row('a','nyc')]);assert.equal((await all())[0].city,'NYC');
 await mergeDelivery('case-delivery',[row('b','nYc',{name:'New place'})]);assert.ok((await all()).every(r=>r.city==='NYC'));
 assert.equal((await restoreNotebook(backup([row('a','nYc')]))).added,0);
 assert.equal((await restoreNotebook(backup([row('c','nyc',{rating:4.19})]))).added,1);
 assert.equal((await all()).find(r=>r.id==='c').rating,4.19);
 db.close();
});

test('startup relabels entries, including identical places and Trash, without altering other fields or losing category notes',async()=>{
 globalThis.indexedDB=new IDBFactory();const db=await openDB();
 const rows=[row('a','NYC'),row('b','nyc'),row('c','nYc',{deletedAt:'2026-11-21T08:00:00Z',rating:4.19}),row('d','London')];
 const main=note(['NYC','Korean','Pocha']),lower=note(['nyc','Korean','Pocha']),other=note(['nYc','Italian']);
 await new Promise((resolve,reject)=>{const tx=db.transaction('restaurants','readwrite');rows.forEach(r=>tx.objectStore('restaurants').put(r));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 // Restoring an old backup before running reconciliation must not make a same-ID copy.
 assert.equal((await restoreNotebook(backup([rows[1]]))).copies,0);
 await setting(main,'Note in NYC');await setting(lower,'Note in lowercase nyc');await setting(other,'Mixed case Italian note');
 await reconcilePochaCategories();
 assert.deepEqual(await all(),rows.map(r=>({...r,city:canonicalCity(r.city)})));
 assert.equal(await setting(main),'Note in NYC\n\nNote in lowercase nyc');
 assert.equal(await setting(lower),'Note in lowercase nyc');
 assert.equal(await setting(note(['NYC','Italian'])),'Mixed case Italian note');
 await setting(main,'Edited combined note');await reconcilePochaCategories();
 assert.equal(await setting(main),'Edited combined note');
 db.close();
});
