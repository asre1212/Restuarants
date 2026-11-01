import {readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
export const files=['index.html','app.js','core.js','db.js','map.js','style.css','hosting.js','updates.js','backup.js','sharing.js','sharing-ui.js','inbox-client.js','manifest.webmanifest','icons/favicon-32.png','icons/michelin-star.png','icons/restaurant-192.png','icons/restaurant-512.png','icons/apple-touch-icon-v2.png','vendor/leaflet.js','vendor/leaflet.css','vendor/leaflet-LICENSE.txt'];
const output='pages-dist',hash=createHash('sha256');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const path of files){hash.update(path);hash.update(await readFile(path));await mkdir(dirname(output+'/'+path),{recursive:true});await copyFile(path,output+'/'+path);}
const sw=await readFile('sw.js','utf8');hash.update(sw);const release=hash.digest('hex').slice(0,20);
await writeFile(output+'/sw.js',sw.replace(/const CACHE = PREFIX \+ '[^']+';/,`const CACHE = PREFIX + 'release-${release}';`));
await writeFile(output+'/.nojekyll','');await writeFile(output+'/version.json',JSON.stringify({release})+'\n');
console.log(`GitHub Pages artifact: ${output} (${release}). Static allowlist only; no notebook data or inbox envelopes.`);
