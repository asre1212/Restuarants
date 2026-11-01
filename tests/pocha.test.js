import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {canonicalCuisine,clean,key,planImport,categoryTree} from '../core.js';
import {openDB,all,setting,write,mergeDelivery,reconcilePochaCategories,restoreCategoryNotes} from '../db.js';

const row=(id,cuisine,extra={})=>({id,name:'Synthetic '+id,city:'NYC',cuisine,rating:4.25,notes:'Dish 4.2/5.\nKeep every note.',tags:['Visited','group'],address:'1 Test St',url:'https://example.test/',latitude:40.7,longitude:-74,michelinStars:0,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',deletedAt:null,assistantNew:true,...extra});
test('NYC Pocha aliases share one import key while distinct places remain distinct',()=>{
 for(const cuisine of ['Korean-pocha','Korean / Pocha',' korean – POCHA ','Korean/Pocha','Korean · Pocha']){
  assert.equal(canonicalCuisine('NYC',cuisine),'Korean / Pocha');
  assert.equal(clean(row('a',cuisine)).cuisine,'Korean / Pocha');
 }
 assert.equal(canonicalCuisine('London','Korean-pocha'),'Korean-pocha');
 assert.equal(canonicalCuisine('NYC','Korean'),'Korean');
 assert.equal(canonicalCuisine('NYC','Korean-American'),'Korean-American');
 const old=row('a','Korean-pocha'),incoming=row('a','Korean / Pocha');
 assert.equal(key(old),key(incoming));
 assert.equal(planImport([old],[incoming]).duplicates,1);
 assert.equal(planImport([old],[{...incoming,address:'2 Test St'}]).add.length,1);
});

test('local correction retains every record and field, combines category notes, and is repeatable',async()=>{
 globalThis.indexedDB=indexedDB;
 const db=await openDB();
 const before=[row('hyphen','Korean-pocha'),row('slash','Korean / Pocha'),row('same-place','Korean-pocha',{name:'Synthetic slash'}),row('trash','Korean-pocha',{deletedAt:'2026-10-15T00:00:00Z'}),row('plain','Korean'),row('other-city','Korean-pocha',{city:'London'})];
 const noteKey=path=>'category-note:'+JSON.stringify(path);
 const alias=noteKey(['NYC','Korean-pocha']),canonical=noteKey(['NYC','Korean','Pocha']);
 await new Promise((resolve,reject)=>{const tx=db.transaction(['restaurants','settings'],'readwrite');for(const r of before)tx.objectStore('restaurants').put(r);for(const [key,value]of [[alias,'Old Pocha favorites'],[canonical,'Other Pocha favorites'],[noteKey(['*','Korean-pocha']),'All-city note'],['delivery:github:already-imported',true]])tx.objectStore('settings').put({key,value});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 await reconcilePochaCategories();
 const after=await all();assert.equal(after.length,before.length);
 for(const original of before)assert.deepEqual(after.find(r=>r.id===original.id),{...original,cuisine:canonicalCuisine(original.city,original.cuisine)});
 assert.equal(await setting(alias),'Old Pocha favorites');
 assert.equal(await setting(canonical),'Other Pocha favorites\n\nOld Pocha favorites');
 assert.equal(await setting(noteKey(['*','Korean','Pocha'])),'All-city note');
 assert.equal(await setting('delivery:github:already-imported'),true);
 const active=after.filter(r=>!r.deletedAt&&r.city==='NYC');
 assert.deepEqual([...new Set(active.map(r=>r.cuisine))].sort(),['Korean','Korean / Pocha']);
 const groups=categoryTree(active);assert.equal(groups.length,1);assert.equal(groups[0].count,4);assert.equal(groups[0].children.length,1);assert.equal(groups[0].children[0].label,'Pocha');assert.equal(groups[0].children[0].count,3);
 await reconcilePochaCategories();assert.deepEqual(await all(),after);assert.equal(await setting(canonical),'Other Pocha favorites\n\nOld Pocha favorites');
 await setting(canonical,'Edited combined notes');await reconcilePochaCategories();assert.equal(await setting(canonical),'Edited combined notes');
 await write([row('new-edit','Korean-pocha')]);assert.equal((await all()).find(r=>r.id==='new-edit').cuisine,'Korean / Pocha');
 const count=(await all()).length;assert.equal(await mergeDelivery('new-alias-delivery',[row('hyphen','Korean-pocha')]),0);assert.equal((await all()).length,count);
 // Old backups normalize their category notes without duplicating a copy already
 // present in the canonical note; original note keys remain available in backups.
 const restored=['New York','Korean','Pocha'];
 await restoreCategoryNotes({[JSON.stringify(restored)]:'New note\n\nLegacy note',[JSON.stringify(['New York','Korean-pocha'])]:'Legacy note'});
 assert.equal(await setting(noteKey(restored)),'New note\n\nLegacy note');
 db.close();
});
