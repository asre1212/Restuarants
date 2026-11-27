/* Copies go only to an explicitly selected external folder. IndexedDB holds the permission handle, not notebook data. */
(function (w) {
  'use strict';
  const format='local-auto-backup',version=1;
  const stringify=JSON.stringify;
  function create({id,name,read,validate,apply}){
    if(!/^[a-z0-9-]+$/.test(id)||[read,validate,apply].some(x=>typeof x!=='function'))throw Error('Invalid Auto Backup adapter.');
    const available=typeof w.showDirectoryPicker==='function'&&!!w.indexedDB&&!!w.crypto?.subtle;
    let panel,config=null,opening,issue='',queue=Promise.resolve(),renderId=0;
    function settings(action){
      return new Promise((resolve,reject)=>{
        if(!available)return resolve(null);
        const request=w.indexedDB.open('journal-external-folder-v1',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('folders');
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(Error('Close other app tabs and reopen Auto Backup.'));
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction('folders',action?'readwrite':'readonly'),s=tx.objectStore('folders');
          const r=action?action(s):s.get(id);
          tx.oncomplete=()=>{db.close();resolve(r.result??null);};
          tx.onabort=()=>{db.close();reject(tx.error||r.error);};
        };
      });
    }
    function configured(){
      if(!available)return Promise.resolve(null);
      if(!opening)opening=settings().then(value=>config=value).catch(e=>{opening=null;throw e;});
      return opening;
    }
    async function saveConfig(next){
      if(next)await settings(s=>s.put(next,id));
      else await settings(s=>s.delete(id));
      config=next;opening=Promise.resolve(next);
    }
    function unpack(item){
      if(!item||item.format!==format||item.version!==version||item.app!==id||typeof item.savedAt!=='string'||!Number.isSafeInteger(item.seq)||item.seq<1)throw Error('Not an Auto Backup for '+name+'.');
      return validate(item.data);
    }
    async function digest(data){
      const bytes=await w.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stringify(data)));
      return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    }
    function filename(c,slot){return id+'-auto-backup-'+c.token+'-'+slot+'.json';}
    async function entries(c){
      const out=[];
      for(const slot of [1,2]){
        let handle;
        try{handle=await c.handle.getFileHandle(filename(c,slot));}
        catch(e){if(e.name==='NotFoundError')continue;throw e;}
        const file=await handle.getFile();
        if(file.size>150_000_000)throw Error('A backup file is too large to verify. Its contents were not changed.');
        const raw=await file.text();let item;
        try{item=JSON.parse(raw);}catch{throw Error('A backup filename is already in use. Its contents were not changed.');}
        if(item?.folderToken!==c.token||item?.app!==id)throw Error('A backup filename is already in use. Its contents were not changed.');
        unpack(item);
        if(await digest(item.data)!==item.digest)throw Error('An existing backup failed verification and was not overwritten.');
        out.push({slot,handle,item});
      }
      return out.sort((a,b)=>b.item.seq-a.item.seq);
    }
    async function write(c,data){
      const current=await settings();
      if(!current||current.token!==c.token||!current.enabled)return false;
      const permission=await c.handle.queryPermission({mode:'readwrite'});
      if(permission!=='granted')throw Error('Reconnect the selected folder to resume Auto Backup.');
      const list=await entries(c);
      const hash=await digest(data);
      if(list[0]?.item.digest===hash)return false;
      // Overwrite only the older verified, app-owned slot. The other file remains intact.
      const slot=list.length===2?list[1].slot:(list[0]?.slot===1?2:1);
      const old=list.find(x=>x.slot===slot);
      const item={format,version,app:id,folderToken:c.token,savedAt:new Date().toISOString(),seq:(list[0]?.item.seq||0)+1,digest:hash,data};
      const body=stringify(item);
      if(new Blob([body]).size>150_000_000)throw Error('This backup is too large to save safely.');
      const file=old?.handle||await c.handle.getFileHandle(filename(c,slot),{create:true});
      const stream=await file.createWritable({mode:'exclusive'});
      try{await stream.write(body);await stream.close();}
      catch(e){try{await stream.abort();}catch{}throw e;}
      if(await (await file.getFile()).text()!==body)throw Error('Could not verify the saved folder copy.');
      issue='Backup saved to the selected folder.';
      return true;
    }
    function capture(value){
      if(!available)return Promise.resolve(false);
      // Read only when an enabled, persistent external destination is writable.
      const prepared=configured().then(async c=>{
        if(!c?.enabled)return null;
        if(await c.handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('Reconnect the selected folder to resume Auto Backup.');
        return {c,data:validate(await (typeof value==='function'?value():value===undefined?read():value))};
      }).then(x=>({x}),error=>({error}));
      const run=async()=>{
        try{
          const {x,error}=await prepared;if(error)throw error;if(!x)return false;
          const action=()=>write(x.c,x.data);
          const ok=w.navigator.locks?await w.navigator.locks.request('journal-external-backup:'+id,action):await action();
          await render();return ok;
        }catch(e){issue=e.message||'Could not save to the selected folder.';await render();return false;}
      };
      queue=queue.then(run,run);return queue;
    }
    async function choose(){
      try{
        // The picker must run directly from this tap, before any asynchronous work.
        const handle=await w.showDirectoryPicker({id:id+'-backup',mode:'readwrite'});
        const previous=await configured();
        const isSame=previous?.handle&&await previous.handle.isSameEntry(handle);
        const token=isSame?previous.token:w.crypto.randomUUID();
        await saveConfig({handle,token,enabled:true});
        issue='Folder selected.';await capture();
      }catch(e){if(e.name!=='AbortError')issue=e.message||'Could not choose a folder.';}
      await render();
    }
    async function reconnect(){
      try{
        const c=config;if(!c)return;
        const result=await c.handle.requestPermission({mode:'readwrite'});
        if(result!=='granted')throw Error('The folder was not granted write permission.');
        await saveConfig({...c,enabled:true});await capture();
      }catch(e){issue=e.message||'Could not reconnect the folder.';}
      await render();
    }
    async function restore(item){
      try{
        const data=unpack(item);
        if(!w.confirm('Restore '+name+' from this file? It may replace the data this backup covers.'))return;
        const ok=await apply(data);if(ok===false)throw Error('Restore did not complete successfully.');
        issue='Backup restored.';await capture();
      }catch(e){issue=e.message||'Could not restore this file.';}
      await render();
    }
    function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;b.style.cssText='border:1px solid #7b858e;border-radius:.4rem;padding:.5rem .7rem;margin:.15rem;background:ButtonFace;color:ButtonText;font:inherit;min-height:2.75rem';return b;}
    function paragraph(value){const p=document.createElement('p');p.textContent=value;return p;}
    async function render(){
      if(!panel?.open)return;
      const rid=++renderId;
      const h=document.createElement('h2');h.id=id+'-auto-backup-title';h.textContent='Auto Backup';
      const rows=[h];
      try{
        const c=await configured();
        if(!available){
          rows.push(paragraph('This browser cannot automatically write to a Files folder. Auto Backup is off and no local backup copies are created. Use the regular manual export to save to Files.'));
        }else{
          rows.push(paragraph('After setup, each saved change goes straight to your selected folder. Only the two latest distinct copies are kept there. No copies are stored in the web app.'));
          rows.push(button(c?'Choose a different folder':'Choose backup folder',choose));
          if(c){
            rows.push(paragraph('Selected folder: '+c.handle.name));
            const canRead=await c.handle.queryPermission({mode:'readwrite'})==='granted';
            if(!c.enabled||!canRead)rows.push(button('Reconnect or resume folder',reconnect));
            if(c.enabled)rows.push(button('Pause Auto Backup',async()=>{try{await saveConfig({...c,enabled:false});issue='Paused; existing files were not changed.';}catch(e){issue=e.message;}await render();}));
            if(canRead){
              for(const [i,row] of (await entries(c)).entries())rows.push(paragraph((i?'Previous':'Most recent')+' · '+new Date(row.item.savedAt).toLocaleString()),button(i?'Restore previous':'Restore most recent',()=>restore(row.item)));
            }
          }
        }
      }catch(e){rows.push(paragraph(e.message||'The selected backup folder could not be read.'));}
      if(rid!==renderId||!panel.open)return;
      const status=paragraph(issue);status.setAttribute('role','status');
      const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
      input.onchange=async()=>{try{const f=input.files?.[0];if(!f)return;if(f.size>150_000_000)throw Error('This recovery file is too large.');await restore(JSON.parse(await f.text()));}catch(e){issue=e.message;await render();}};
      panel.replaceChildren(...rows,input,button('Restore Auto Backup file',()=>input.click()),button('Close',()=>panel.close()),status);
    }
    function open(){
      if(!panel){
        panel=document.createElement('dialog');panel.setAttribute('aria-label','Auto Backup');
        panel.style.cssText='box-sizing:border-box;font:16px/1.4 system-ui;width:min(28rem,calc(100% - 2rem));max-height:85vh;overflow:auto;padding:1rem;background:Canvas;color:CanvasText;border:1px solid #7b858e;border-radius:.65rem';
        document.body.append(panel);
      }
      if(!panel.open)panel.showModal();render();
    }
    function mount(holder){if(holder)holder.append(button('Auto Backup',open));}
    return Object.freeze({capture,open,mount});
  }
  w.AutoBackup=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
