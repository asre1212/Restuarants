import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clean,sortMichelin,parseImport,planImport} from '../core.js';
const r=(name,stars,rating=null)=>clean({name,city:'Paris',cuisine:'French',michelinStars:stars,rating});
test('old records default to unstarred and only 0–3 whole stars are accepted',()=>{
 assert.equal(clean({name:'Old',city:'Paris',cuisine:'French'}).michelinStars,0);
 for(const stars of [0,1,2,3,'1'])assert.equal(r('A',stars).michelinStars,Number(stars));
 for(const stars of [-1,4,1.5,true,'two'])assert.throws(()=>r('A',stars));
});
test('Michelin ranking is stars descending, personal rating descending, unrated last and name ties',()=>{
 const rows=[r('Unstarred',0,5),r('One',1,5),r('Two',2,4.5),r('Three unrated',3),r('Three low',3,0),r('Three B',3,4),r('Three A',3,4),{...r('Trashed',3,5),deletedAt:'2026-10-13T00:00:00Z'}];
 assert.deepEqual(sortMichelin(rows).map(r=>r.name),['Three A','Three B','Three low','Two','One','Three unrated']);
 assert.equal(rows.length,8);
});
test('Michelin view uses the same record: edits, unchecking, trash and restore reflect without duplicates',()=>{
 const record=r('A',2,4),all=[record];assert.equal(sortMichelin(all)[0],record);
 record.rating=5;assert.equal(sortMichelin(all)[0].rating,5);
 record.michelinStars=0;assert.equal(sortMichelin(all).length,0);record.michelinStars=3;
 record.deletedAt='2026-10-13T00:00:00Z';assert.equal(sortMichelin(all).length,0);record.deletedAt=null;
 assert.equal(sortMichelin(all).length,1);assert.equal(planImport(all,[record]).add.length,0);
});
test('JSON backup and CSV preserve Michelin counts; old backups remain compatible',()=>{
 const record=r('A',3,4.5);const packet={format:'restaurant-log-backup',version:1,restaurants:[record]};
 assert.deepEqual(parseImport(JSON.stringify(packet))[0].value,record);
 const csv=parseImport('name,city,cuisine,michelinStars,rating\nA,Paris,French,2,4.5');assert.equal(csv[0].value.michelinStars,2);assert.equal(csv[0].error,null);
 assert.equal(parseImport('[{"name":"Old","city":"Paris","cuisine":"French"}]')[0].value.michelinStars,0);
});
