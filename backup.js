import {clean,canonicalCuisine} from './core.js';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function parseNotebookBackup(text){
 if(typeof text!=='string'||text.length>20_000_000)throw Error('Choose a JSON backup smaller than 20 MB.');
 const packet=JSON.parse(text);
 if(!object(packet)||packet.format!=='restaurant-log-backup'||packet.version!==1||!Array.isArray(packet.restaurants)||packet.restaurants.length>10000)throw Error('Choose a Restaurants JSON backup.');
 const ids=new Set();
 const restaurants=packet.restaurants.map(original=>{
  const validated=clean(original),row={...original,...validated};
  // Validation may normalize aliases, but transfer preserves exact saved scores
  // and user tags. Regular edits/imports keep their existing rounding behavior.
  row.rating=original.rating==null?null:Number(original.rating);
  row.tags=original.tags??validated.tags;row.cuisine=canonicalCuisine(row.city,row.cuisine);
  if(original.id!==undefined){if(typeof original.id!=='string'||!original.id||original.id.length>500||ids.has(original.id))throw Error('Backup has invalid or repeated record IDs.');ids.add(original.id);}
  for(const field of ['createdAt','updatedAt'])if(original[field]!==undefined&&(typeof original[field]!=='string'||!Number.isFinite(Date.parse(original[field]))))throw Error('Backup has an invalid saved date.');
  return row;
 });
 const notes=packet.categoryNotes??{},settings=packet.settings??{};
 if(!object(notes)||Object.keys(notes).length>10000||Object.entries(notes).some(([k,v])=>k.length>4000||typeof v!=='string'||v.length>200000))throw Error('Invalid category notes.');
 if(!object(settings)||Object.keys(settings).length>20000||Object.entries(settings).some(([k,v])=>!(k.startsWith('delivery:')&&v===true||k.startsWith('category-alias-copied:')&&typeof v==='string'&&v.length<=200000)))throw Error('Invalid backup settings.');
 return {restaurants,categoryNotes:notes,settings};
}
export const stableRecord=row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))));
export async function backupRecords(packet){
 return Promise.all(packet.restaurants.map(async row=>{
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableRecord(row)))),b=>b.toString(16).padStart(2,'0')).join('');
  return {row:{...row,id:row.id||'backup-'+hash},conflictId:'backup-copy-'+hash};
 }));
}
