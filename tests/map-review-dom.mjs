import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {openDB,all,write} from '../db.js';
import {createRestaurantMap} from '../map.js';

const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));
Object.assign(globalThis,{window:dom.window,document:dom.window.document,indexedDB});
const $=id=>document.getElementById(id),dialog=$('location-dialog');
dom.window.HTMLDialogElement.prototype.showModal=function(){assert.equal(this.open,false);this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
await openDB();
await write([
 ...['A','B','C'].map(id=>({id,name:'Place '+id,city:'Test City',cuisine:'Test',rating:null,notes:'Keep my notes',tags:[]})),
 {id:'mapped',name:'Already mapped',latitude:1,longitude:2},
 {id:'trashed',name:'In Trash',deletedAt:'2026-01-01'}
]);
let rows=await all(),edited=null;
createRestaurantMap({getRows:()=>rows,onChange:async()=>{rows=await all();},onEdit:r=>{edited=r;},onError:e=>{throw e;}});
const pending=[];
globalThis.fetch=url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject}));
const until=async check=>{for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected asynchronous review state');};
const answer=(request,name)=>request.resolve({ok:true,json:async()=>({features:name?[{properties:{name,city:'Test City'},geometry:{coordinates:[2,1]}}]:[]})});
const original=JSON.stringify(await all());

// Skip is available while loading, ignores late errors, and advances past mapped/trashed rows.
$('map-locate').click();await until(()=>pending.length===1);assert.equal($('location-title').textContent,'Locate Place A');
$('location-skip').click();await until(()=>pending.length===2);assert.equal($('location-title').textContent,'Locate Place B');
answer(pending[1],'Place B');await until(()=>$('location-results').textContent.includes('Use this location'));
pending[0].reject(Error('Old failed request'));await new Promise(r=>setTimeout(r,10));
assert.equal($('location-error').textContent,'Check the address before choosing a branch.');

// Late success cannot append results to the next restaurant or reopen a finished review.
$('location-results').querySelector(':scope > button').click();await until(()=>pending.length===3);
$('location-skip').click();await until(()=>pending.length===4);assert.equal($('location-title').textContent,'Locate Place C');
answer(pending[2],'Old Place B');answer(pending[3],null);
await until(()=>$('location-error').textContent.startsWith('No match found'));
assert.ok(!$('location-results').textContent.includes('Old Place B'));
$('location-skip').click();assert.equal(dialog.open,false);assert.ok($('map-status').textContent.includes('3 skipped for now'));
assert.equal(JSON.stringify(await all()),original);

// Starting a new pass revisits skipped entries; selecting and editing still target the right row.
$('map-locate').click();await until(()=>pending.length===5);assert.equal($('location-title').textContent,'Locate Place A');
answer(pending[4],'Place A');await until(()=>$('location-results').textContent.includes('Use this location'));
let closeCount=0;dialog.addEventListener('close',()=>closeCount++);
const useA=$('location-results').querySelector('.location-choice button');useA.click();useA.click();
await until(()=>$('location-title').textContent==='Locate Place B'&&rows.find(r=>r.id==='A').latitude===1);
assert.equal(dialog.open,true);assert.equal(closeCount,0);
assert.equal((await all()).find(r=>r.id==='B').latitude,undefined);
await until(()=>$('location-results').textContent.includes('Use this location'));
assert.equal($('location-title').textContent,'Locate Place B');$('location-edit').click();assert.equal(edited.id,'B');assert.equal(dialog.open,false);

// Closing during a pending lookup never repaints or reopens the dialog.
$('map-locate').click();await until(()=>$('location-results').textContent.includes('Use this location'));
$('location-results').querySelector(':scope > button').click();await until(()=>pending.length===6);
dialog.close();answer(pending[5],'Closed request');await new Promise(r=>setTimeout(r,15));
assert.equal(dialog.open,false);assert.ok(!$('location-results').textContent.includes('Closed request'));

// Saving after a skip finishes this pass instead of circling back to the skipped row.
$('map-locate').click();await until(()=>$('location-results').textContent.includes('Use this location'));
$('location-skip').click();await until(()=>$('location-title').textContent==='Locate Place C'&&$('location-results').querySelector(':scope > button'));
$('location-results').querySelector(':scope > button').click();await until(()=>pending.length===7);
answer(pending[6],'Place C');await until(()=>$('location-results').textContent.includes('Use this location'));
$('location-results').querySelector('.location-choice button').click();await until(()=>!dialog.open);
assert.equal(rows.find(r=>r.id==='C').latitude,1);assert.equal(rows.find(r=>r.id==='B').latitude,undefined);
assert.ok($('map-status').textContent.includes('1 skipped for now'));

// A fresh pass can resolve the skipped row and report completion.
$('map-locate').click();await until(()=>$('location-results').textContent.includes('Use this location'));
assert.equal($('location-title').textContent,'Locate Place B');
$('location-results').querySelector('.location-choice button').click();await until(()=>!dialog.open);
assert.equal($('map-status').textContent,'All saved restaurants are mapped.');
for(const r of rows.filter(r=>['A','B','C'].includes(r.id))){assert.equal(r.notes,'Keep my notes');assert.equal(r.rating,null);assert.equal(r.latitude,1);}
console.log('PASS: save advances without closing or revisiting skipped places; repeated taps, exhaustion, stale lookups and editing remain correct.');
