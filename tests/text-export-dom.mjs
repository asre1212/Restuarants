import {JSDOM} from 'jsdom';
import {indexedDB} from 'fake-indexeddb';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost:8080/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,indexedDB});
Object.defineProperty(dom.window.navigator,'onLine',{value:false});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
const networkRequests=[];let networkCalls=0;globalThis.fetch=async(input,options)=>{networkCalls++;networkRequests.push({url:String(input),options});return {status:401,ok:false};};
await import('../app.js');
const db=await import('../db.js'),$=id=>document.getElementById(id),tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const click=async id=>{$(id).click();await tick();};
const event=type=>new dom.window.Event(type,{bubbles:true,cancelable:true});
await click('export-text');assert.ok($('text-preview').value.includes('No active restaurants.'));assert.equal($('text-share').hidden,true);$('text-export-dialog').close();
await db.write([{id:'a',name:'Café 東京',city:'NYC',cuisine:'Japanese',rating:0,notes:'Sushi 4.123/5.\nSecond line',tags:[]},{id:'b',name:'Pending 🍜',city:'Paris',cuisine:'French',rating:null,notes:'Try next',tags:[]},{id:'c',name:'Private Trash',city:'NYC',cuisine:'French',rating:4,deletedAt:'2026-10-01',notes:'Do not export',tags:[]}]);
await db.setting('category-note:["NYC","Japanese"]','City note');await db.setting('lastExport',123);
await click('assistant-mark-seen');
const categoryInput=document.querySelector('.category-notes textarea');categoryInput.value='Immediate unsaved draft';categoryInput.dispatchEvent(event('input'));
$('search').value='No match';$('search').dispatchEvent(event('input'));
const before=JSON.stringify(await db.all()),networkBefore=networkCalls;
await click('export-text');const text=$('text-preview').value;
for(const value of ['Café 東京','Pending 🍜','Overall rating: 0 / 5','Not rated','Sushi 4.123/5.\n  Second line','City note','Immediate unsaved draft'])assert.ok(text.includes(value),value);
assert.equal(text.includes('Private Trash'),false);assert.equal(text.includes('Do not export'),false);assert.equal(await db.setting('lastExport'),123);

let downloaded,downloadBlob;
URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:test-export';};URL.revokeObjectURL=()=>{};
dom.window.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};
await click('text-save');assert.match(downloaded,/^restaurants-\d{4}-\d{2}-\d{2}\.txt$/);assert.equal(await downloadBlob.text(),text);assert.equal(downloadBlob.type,'text/plain;charset=utf-8');

let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{copied=value;}},configurable:true});
await click('text-copy');assert.equal(copied,text);assert.ok($('text-export-status').textContent.startsWith('Copied'));
Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('Denied');}},configurable:true});
document.execCommand=()=>false;await click('text-copy');assert.equal($('text-preview').selectionStart,0);assert.equal($('text-preview').selectionEnd,text.length);assert.ok($('text-export-status').textContent.includes('Touch and hold'));

assert.equal(networkCalls,networkBefore);
$('text-export-dialog').close();let shareData;Object.defineProperty(navigator,'share',{value:async data=>{shareData=data;},configurable:true});Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
await click('export-text');assert.equal($('text-share').hidden,false);await click('text-share');assert.equal(shareData.files.length,1);assert.match(shareData.files[0].name,/\.txt$/);assert.equal(await shareData.files[0].text(),$('text-preview').value);
Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true});await click('text-share');assert.equal(shareData.text,$('text-preview').value);assert.equal(shareData.files,undefined);
Object.defineProperty(navigator,'share',{value:async()=>{throw new DOMException('Canceled','AbortError');},configurable:true});await click('text-share');assert.ok($('text-export-status').textContent.startsWith('Sharing canceled'));assert.equal($('text-copy').disabled,false);
Object.defineProperty(navigator,'share',{value:async()=>{throw Error('No access');},configurable:true});await click('text-share');assert.ok($('text-export-status').textContent.includes('Try Save .txt or Copy text'));

let resolveShare,shares=0;Object.defineProperty(navigator,'share',{value:()=>{shares++;return new Promise(resolve=>{resolveShare=resolve;});},configurable:true});
$('text-share').click();$('text-share').click();await tick();assert.equal(shares,1);$('text-export-dialog').close();await click('export-text');resolveShare();await tick();assert.ok($('text-export-status').textContent.startsWith('Ready.'));assert.equal($('text-copy').disabled,false);
// Opening, immediately closing and reopening must not display a stale result.
$('text-export-dialog').close();$('export-text').click();$('text-export-dialog').close();await click('export-text');assert.ok($('text-export-status').textContent.startsWith('Ready.'));
$('text-export-dialog').close();await click('export');const backup=JSON.parse(await downloadBlob.text());assert.equal(backup.format,'restaurant-log-backup');assert.equal(backup.restaurants.length,3);assert.equal(backup.restaurants.find(r=>r.id==='c').notes,'Do not export');assert.ok(backup.categoryNotes['["NYC","Japanese"]']);
assert.equal(JSON.stringify(await db.all()),before);
// Existing dialog-close behavior checks incoming deliveries; it never sends the notebook.
assert.ok(networkRequests.every(r=>r.url==='./api/inbox'&&!r.options?.body));
console.log('PASS: text download, complete local data, notes drafts, filter independence, copy fallbacks, file/text sharing, cancellation/repeats, JSON backup and no notebook-data network transmission.');
process.exit(0);
