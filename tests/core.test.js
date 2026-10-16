import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clean,sortRestaurants,parseImport,planImport,parseCSV,roundQuarter} from '../core.js';
const r=(name,rating=null)=>clean({name,city:'London',cuisine:'Italian',rating});
test('ratings accept decimals and zero, reject coercion and unsafe links',()=>{assert.equal(r('A',0).rating,0);assert.equal(r('A','4.25').rating,4.25);for(const rating of [false,{},-1,5.1,'four','Infinity'])assert.throws(()=>r('A',rating));assert.throws(()=>clean({...r('A'),url:'javascript:alert(1)'}));});
test('best and worst put unrated last with alphabetical ties',()=>{const rows=[r('Z'),r('B',4),r('A',4),r('C',0)];assert.deepEqual(sortRestaurants(rows).map(r=>r.name),['A','B','C','Z']);assert.deepEqual(sortRestaurants(rows,'worst').map(r=>r.name),['C','A','B','Z']);});
test('multiline import preserves names and never infers ratings',()=>{const x=parseImport('Three 4.5\nFour',{city:'NYC',cuisine:'Other'});assert.equal(x[0].value.name,'Three 4.5');assert.equal(x[0].value.rating,null);assert.equal(x.length,2);});
test('CSV supports quoted multiline notes, explicit ratings, tags',()=>{const x=parseImport('name,city,cuisine,rating,notes,tags\n"A, B",NYC,Italian,4.5,"one\ntwo",date;quiet');assert.equal(x[0].error,null);assert.equal(x[0].value.notes,'one\ntwo');assert.deepEqual(x[0].value.tags,['date','quiet','Visited']);assert.throws(()=>parseCSV('"unclosed'));});
test('JSON validation catches unsupported format, invalid rows, script URL',()=>{assert.throws(()=>parseImport('{"version":2,"restaurants":[]}'));assert.ok(parseImport('[{"name":"a"}]')[0].error);assert.ok(parseImport(JSON.stringify([{...r('A'),url:'data:text/html,evil'}]))[0].error);assert.ok(parseImport('[null]')[0].error);});
test('backup round-trip keeps notes and trash; merge deduplicates case and input duplicates',()=>{const original={...r('A',3.5),notes:'Private\nnotes',deletedAt:'2026-10-12T00:00:00Z'};const data=parseImport(JSON.stringify({format:'restaurant-log-backup',version:1,restaurants:[original]}))[0].value;assert.deepEqual(data,original);const p=planImport([original],[r('a'),r('B'),r('B')]);assert.equal(p.duplicates,2);assert.equal(p.add.length,1);});
test('different address remains distinct; missing required fields rejected',()=>{assert.equal(planImport([r('A')],[{...r('A'),address:'2 Main Street'}]).add.length,1);assert.throws(()=>clean({name:'A',city:'',cuisine:'X'}));});


test('ratings round to nearest quarter after validation; unrated and raw tasting notes survive',()=>{
 for(const [input,expected]of [[4.3,4.25],[4.2,4.25],[4.9,5],[3.9,4],[3.18,3.25],[4.125,4.25],[0,0],[5,5]])assert.equal(r('A',input).rating,expected);
 assert.equal(roundQuarter(null),null);assert.equal(r('A').rating,null);assert.throws(()=>r('A',5.01));
 const ratings=[4.2,3.9,4.2];assert.equal(roundQuarter(ratings.reduce((a,b)=>a+b,0)/ratings.length),4);
 const original={...r('A'),rating:4.3,notes:'Cocktail — 4.3/5.'};const imported=parseImport(JSON.stringify([original]))[0].value;assert.equal(imported.rating,4.25);assert.equal(imported.notes,original.notes);
});

test('blank scores always mean To try; scoring removes stale status and zero counts as rated',()=>{
 const pending=clean({...r('Pending'),tags:['Visited','want to try','date']});
 assert.deepEqual(pending.tags,['date','To try']);
 const rated=clean({...pending,rating:0});assert.deepEqual(rated.tags,['date','Visited']);
 assert.equal(rated.rating,0);assert.deepEqual(clean({...rated,rating:null}).tags,['date','To try']);
});

import {categoryTree} from '../core.js';
test('composite categories nest beneath alphabetical parents without changing stored cuisines',()=>{
 const rows=[{...r('R'),cuisine:'Japanese · Sushi'},{...r('N'),cuisine:'Japanese · Ramen'},{...r('D'),cuisine:'Japanese'},{...r('A'),cuisine:'American'}];
 const groups=categoryTree(rows);assert.deepEqual(groups.map(g=>g.label),['American','Japanese']);assert.deepEqual(groups[1].children.map(g=>g.label),['Ramen','Sushi']);assert.equal(groups[1].count,3);assert.equal(groups[1].rows[0].name,'D');assert.equal(rows[0].cuisine,'Japanese · Sushi');assert.deepEqual(groups[1].children[1].path,['Japanese','Sushi']);
});
