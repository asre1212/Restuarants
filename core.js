export const VERSION = 1;
export const roundQuarter = rating => rating == null ? null : Math.round(rating * 4) / 4;
export const norm = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
export const key = r => [r.name,r.city,r.cuisine,r.address].map(norm).join('\u0000');
export function clean(input, defaults = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Each restaurant must be an object.');
  const out = {};
  for (const field of ['name','city','cuisine','notes','address','url']) {
    const value = input[field] ?? defaults[field] ?? '';
    if (typeof value !== 'string') throw Error(`${field} must be text.`);
    if (value.length > (field === 'notes' ? 20000 : 1000)) throw Error(`${field} is too long.`);
    out[field] = value.trim();
  }
  if (!out.name || !out.city || !out.cuisine) throw Error('Name, city, and cuisine are required.');
  for(const [field,limit] of [['latitude',90],['longitude',180]]){
    const value=input[field];out[field]=value===undefined||value===null||value===''?null:Number(value);
    if(out[field]!==null&&(!['number','string'].includes(typeof value)||!Number.isFinite(out[field])||Math.abs(out[field])>limit))throw Error(`Invalid ${field}.`);
  }
  if((out.latitude===null)!==(out.longitude===null))throw Error('Provide both latitude and longitude.');
  const stars=input.michelinStars??0;
  if(!['number','string'].includes(typeof stars)||! /^[0-3]$/.test(String(stars)))throw Error('Michelin stars must be 0, 1, 2, or 3.');
  out.michelinStars=Number(stars);
  const rating = input.rating;
  if (rating === '' || rating === null || rating === undefined) out.rating = null;
  else {
    if (!['number','string'].includes(typeof rating) || !/^\d+(\.\d+)?$/.test(String(rating).trim())) throw Error('Rating must be a number from 0 to 5, or blank.');
    out.rating = Number(rating);
    if (!Number.isFinite(out.rating) || out.rating < 0 || out.rating > 5) throw Error('Rating must be from 0 to 5.');
    out.rating = roundQuarter(out.rating);
  }
  if (out.url) { let u; try {u = new URL(out.url);} catch {throw Error('Website must be a full http or https URL.');} if (!['http:','https:'].includes(u.protocol)) throw Error('Only http and https website links are allowed.'); out.url = u.href; }
  const tags = input.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 50 || tags.some(t => typeof t !== 'string' || t.length > 100)) throw Error('Tags must be an array of short text values.');
  out.tags = [...new Set(tags.map(t=>t.trim()).filter(Boolean))];
  if (input.deletedAt != null && (typeof input.deletedAt !== 'string' || !Number.isFinite(Date.parse(input.deletedAt)))) throw Error('Invalid trash date.');
  out.deletedAt = input.deletedAt ?? null;
  return out;
}
export function sortRestaurants(rows, direction = 'best') {
  return [...rows].sort((a,b) => (a.rating == null) - (b.rating == null) || (a.rating != null && b.rating != null ? (direction === 'worst' ? a.rating-b.rating : b.rating-a.rating) : 0) || a.name.localeCompare(b.name,undefined,{sensitivity:'base'}));
}
export function parseCSV(text) {
  const rows=[]; let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) { const c=text[i]; if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(!quoted&&field.length){throw Error('Invalid CSV quoting.');}else quoted=!quoted;} else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';} else field+=c; }
  if(quoted)throw Error('CSV has an unfinished quote.'); row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function parseImport(text, defaults={}) {
  if(typeof text!=='string'||text.length>5_000_000)throw Error('Import must be text smaller than 5 MB.');
  const t=text.trim();if(!t)throw Error('Paste restaurants or choose a file first.'); let raw;
  if(t.startsWith('{')||t.startsWith('[')) {
    const data=JSON.parse(t);
    if(Array.isArray(data))raw=data;
    else {if(!['restaurant-log-backup','restaurant-log-import'].includes(data.format)||data.version!==VERSION||!Array.isArray(data.restaurants))throw Error('Unsupported JSON format or version.');raw=data.restaurants;}
  } else {
    const rows=parseCSV(t);const headers=rows[0].map(norm);const allowed=['name','city','cuisine','rating','notes','address','url','tags','michelinstars','latitude','longitude'];
    if(headers.includes('name')) {if(headers.some(h=>!allowed.includes(h))||new Set(headers).size!==headers.length)throw Error('CSV headers must be unique: name, city, cuisine, rating, notes, address, url, tags, michelinStars.');raw=rows.slice(1).map(row=>{if(row.length>headers.length)throw Error('CSV row has more values than its header.');const obj=Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));if(obj.michelinstars!==undefined){obj.michelinStars=obj.michelinstars||0;delete obj.michelinstars;}if(obj.tags!==undefined)obj.tags=obj.tags.split(';').map(t=>t.trim()).filter(Boolean);return obj;});}
    else raw=t.split(/\r?\n/).map(name=>({name:name.trim()})).filter(r=>r.name);
  }
  if(raw.length>2000)throw Error('Import at most 2,000 restaurants at a time.');
  return raw.map((r,i)=>{try{return {value:clean(r,defaults),error:null};}catch(e){return {value: r&&typeof r==='object'&&!Array.isArray(r)?{...r}: {name:''},error:`Row ${i+1}: ${e.message}`};}});
}
export function planImport(existing, incoming) {
  const ids=new Set(existing.map(key));const add=[];let duplicates=0;
  for(const row of incoming){const r=clean(row);const k=key(r);if(ids.has(k)){duplicates++;continue;}ids.add(k);add.push(r);}return {add,duplicates};
}


export function sortMichelin(rows){return sortRestaurants(rows.filter(r=>!r.deletedAt&&r.michelinStars>0)).sort((a,b)=>b.michelinStars-a.michelinStars);}

// Display explicit tasting scores; keep the source notes intact and never average them.
export function tastingNotes(notes){
 const lines=String(notes??'').split(/\r?\n/),items=[],general=[];
 for(const line of lines){
  const match=line.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(?:\/\s*a?5|:\s*5)\b(.*)$/i);
  if(!match||Number(match[2])>5||!match[1].trim()){if(line.trim())general.push(line.trim());continue;}
  const name=match[1].trim().replace(/[—–:\s]+$/,'').trim(),comment=match[3].trim().replace(/^[.,;\s]+/,'');
  items.push({name,rating:Number(match[2]),comment});
 }
 return {items,general};
}
