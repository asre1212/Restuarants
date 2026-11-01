import {test} from 'node:test';import assert from 'node:assert/strict';import {indexedDB} from 'fake-indexeddb';
import {parseNotebookBackup} from '../backup.js';import {openDB,all,setting,notebookBackup,restoreNotebook} from '../db.js';
const make=(id,extra={})=>({id,name:'Same place',city:'NYC',cuisine:'Korean / Pocha',rating:4.25,notes:'Original notes\nDish 4.2/5',address:'1 Example St',url:'',latitude:40.7,longitude:-74,michelinStars:1,tags:['Visited','group'],createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',assistantNew:true,deletedAt:null,...extra});
test('full transfer retains duplicate places, IDs, dates, Trash, notes and receipts; retry is harmless',async()=>{
 globalThis.indexedDB=indexedDB;const db=await openDB();
 const packet=parseNotebookBackup(JSON.stringify({format:'restaurant-log-backup',version:1,restaurants:[make('a'),make('b'),make('c',{deletedAt:'2026-10-03T00:00:00Z'})],categoryNotes:{'["NYC","Korean","Pocha"]':'Favorites'},settings:{'delivery:github:old-delivery':true}}));
 assert.equal((await restoreNotebook(packet)).added,3);assert.deepEqual((await all()).map(r=>r.id),['a','b','c']);
 for(const original of packet.restaurants)assert.deepEqual((await all()).find(r=>r.id===original.id),original);
 assert.equal(await setting('delivery:github:old-delivery'),true);assert.equal((await restoreNotebook(packet)).added,0);
 const exported=await notebookBackup();assert.equal(exported.restaurants.length,3);assert.equal(exported.categoryNotes['["NYC","Korean","Pocha"]'],'Favorites');assert.equal(exported.settings['delivery:github:old-delivery'],true);
 const conflicting={...packet,restaurants:[make('a',{notes:'A different saved version'})]};assert.equal((await restoreNotebook(conflicting)).copies,1);assert.equal((await all()).length,4);assert.equal((await all()).find(r=>r.id==='a').notes,'Original notes\nDish 4.2/5');assert.equal((await restoreNotebook(conflicting)).added,0);
 assert.throws(()=>parseNotebookBackup(JSON.stringify({...exported,restaurants:[make('bad',{url:'javascript:alert(1)'})]})));
 assert.throws(()=>parseNotebookBackup(JSON.stringify({...exported,settings:{'secret-token':'no'}})));
 db.close();
});
