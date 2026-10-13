import {readFile,writeFile} from 'node:fs/promises';
const types={'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml','png':'image/png','webmanifest':'application/manifest+json'};
const paths=['index.html','app.js','sw.js','core.js','db.js','style.css','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
const assets={};for(const path of paths)assets['/'+path]={type:types[path.split('.').at(-1)],bytes:(await readFile(path)).toString('base64')};
const core=await readFile('core.js','utf8'),inbox=await readFile('worker/inbox.js','utf8');
const handler=`\nconst assets=${JSON.stringify(assets)};\nexport default {async fetch(request,env){const response=await inboxFetch(request,env);if(response)return response;let path=new URL(request.url).pathname;if(path==='/')path='/index.html';const asset=assets[path];if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});const headers={'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.bytes),c=>c.charCodeAt(0)),{headers});}};\n`;
await writeFile('worker/index.js',core+'\n'+inbox+handler);
