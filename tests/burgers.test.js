import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {clean,categoryTree,planImport} from '../core.js';
import {openDB,all,categoryNotes,setting,reconcilePochaCategories} from '../db.js';

test('consolidates only exact Burger labels, retaining distinct listings and existing notes',async()=>{
 const row={name:'Sample',city:'Cleveland',cuisine:' burger ',rating:4.25,notes:'Keep me',address:'Same address',tags:['Visited']};
 const other={...row,cuisine:'BURGERS',rating:3,deletedAt:'2026-01-01T00:00:00.000Z'};
 assert.equal(clean(row).cuisine,'Burgers');
 assert.equal(clean({...row,cuisine:'Vegan Burger'}).cuisine,'Vegan Burger');
 assert.deepEqual(categoryTree([row,other]).map(g=>[g.label,g.count]),[['Burgers',2]]);
 assert.equal(planImport([row],[other]).duplicates,1);
 const native=await openDB();
 const saved=[{...row,id:'one'},{...other,id:'two'}];
 await new Promise((res,rej)=>{const tx=native.transaction('restaurants','readwrite');for(const r of saved)tx.objectStore('restaurants').put(r);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
 await setting('category-note:["Cleveland","Burger"]','Old note');
 await setting('category-note:["Cleveland","Burgers"]','Current note');
 await reconcilePochaCategories();await reconcilePochaCategories();
 assert.deepEqual(await all(),saved.map(r=>({...r,cuisine:'Burgers'})));
 const notes=await categoryNotes();
 assert.equal(notes['["Cleveland","Burgers"]'],['Current note','Old note'].join('\n\n'));
 assert.equal(notes['["Cleveland","Burger"]'],'Old note');
});
