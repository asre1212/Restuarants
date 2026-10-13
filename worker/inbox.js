// Server holds delivery packets only. It never receives the device notebook.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Cookie'}});
const fieldSchema={type:'object',additionalProperties:false,required:['name','city','cuisine'],properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},michelinStars:{type:'integer',minimum:0,maximum:3},name:{type:'string'},city:{type:'string'},cuisine:{type:'string'},rating:{type:['number','null'],minimum:0,maximum:5},notes:{type:'string'},address:{type:'string'},url:{type:'string'},tags:{type:'array',items:{type:'string'}}}};
const tools=[
 {name:'add_restaurants',description:'Prepare an encrypted GitHub delivery. Save the returned github_payload at github_path in asre1212/Restuarants on main using GitHub and add its filename to inbox/index.json. Only then confirm it is queued. The user presses Force pull list to save entries locally and acknowledge GitHub deletion. Cannot read, modify, or sync existing notebook data. For every new restaurant, verify its exact branch and provide latitude and longitude with the address when available so it appears on the local map. Leave coordinates absent for ambiguous branches; the app offers location review. Round ratings to the nearest 0.25. If the user requests an average where no overall is provided, average the original rated items first, excluding unrated items, then round the result to the nearest 0.25. Otherwise never infer personal ratings. Use a stable delivery_id to retry the same packet.',inputSchema:{type:'object',additionalProperties:false,required:['restaurants','delivery_id'],properties:{restaurants:{type:'array',minItems:1,maxItems:100,items:fieldSchema},delivery_id:{type:'string',pattern:'^[A-Za-z0-9_-]{8,100}$'}}}},
 {name:'restaurant_inbox_status',description:'Return pending delivery count for the caller, without reading their device notebook.',inputSchema:{type:'object',additionalProperties:false,properties:{}}}
];
async function prefixFor(user){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user));return 'inbox/'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')+'/';}
async function readPackets(bucket,prefix){const listing=await bucket.list({prefix,limit:100});const packets=[];for(const item of listing.objects){const object=await bucket.get(item.key);if(!object)continue;const packet=await object.json();if(packet.expiresAt<=Date.now()){await bucket.delete(item.key);continue;}packets.push(packet);}return packets.sort((a,b)=>a.createdAt-b.createdAt);}
async function readJSON(request){const text=await request.text();if(text.length>500000)throw Error('Request too large.');return JSON.parse(text);}
export async function inboxFetch(request,env){
 const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
 if(url.pathname.startsWith('/api/github/'))return githubInboxFetch(request,env);
 if(url.pathname==='/mcp'){
  if(request.method!=='POST')return json({error:'POST required'},405);
  let msg;try{msg=await readJSON(request);}catch(e){return json({error:e.message},400);}
  if(msg.id==null)return new Response(null,{status:202});
  const reply=result=>json({jsonrpc:'2.0',id:msg.id,result});
  if(msg.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
  if(msg.method==='initialize')return reply({protocolVersion:msg.params?.protocolVersion||'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'table-notes',version:'2.0.0'}});
  if(msg.method==='tools/list')return reply({tools});
  if(msg.method==='ping')return reply({});
  if(msg.method!=='tools/call')return json({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});
  try{
   if(!user)throw Error('Connect your ChatGPT account to use the inbox.');
   if(!env.BUCKET)throw Error('Inbox storage unavailable.');
   const prefix=await prefixFor(user),name=msg.params?.name,args=msg.params?.arguments||{};
   let result;
   if(name==='restaurant_inbox_status'){const pending=await readPackets(env.BUCKET,prefix);result={pending_deliveries:pending.length,pending_restaurants:pending.reduce((n,p)=>n+p.packet.restaurants.length,0),device_notebook_access:false};}
   else if(name==='add_restaurants'){
    if(env.GITHUB_INBOX_KEY)return reply({content:[{type:'text',text:JSON.stringify(await prepareGitHubDelivery(request,env,args))}]});
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(args.delivery_id||''))throw Error('Provide a stable delivery_id of 8–100 letters, numbers, underscores or hyphens.');
    if(!Array.isArray(args.restaurants)||args.restaurants.length<1||args.restaurants.length>100)throw Error('Send 1–100 restaurants at a time.');
    const restaurants=args.restaurants.map(r=>{const value=clean(r);if(value.deletedAt)throw Error('New deliveries cannot be in Trash.');return value;});
    const existing=await env.BUCKET.get(prefix+args.delivery_id);
    if(existing){const prior=await existing.json();if(JSON.stringify(prior.packet.restaurants)!==JSON.stringify(restaurants))throw Error('delivery_id already belongs to a different packet.');result={queued:restaurants.length,delivery_id:args.delivery_id,already_pending:true};}
    else{const pending=await readPackets(env.BUCKET,prefix);if(pending.length>=20)throw Error('Inbox has 20 deliveries. Open the app to save them first.');const now=Date.now();await env.BUCKET.put(prefix+args.delivery_id,JSON.stringify({id:args.delivery_id,createdAt:now,expiresAt:now+7*86400000,packet:{format:'restaurant-log-import',version:1,restaurants}}),{httpMetadata:{contentType:'application/json'}});result={queued:restaurants.length,delivery_id:args.delivery_id};}
    result.saved_on_device=false;result.next_step='Open Restaurants signed in with this ChatGPT account. The first device to import saves the entries locally and removes the delivery.';
   }else throw Error('Unknown tool.');
   return reply({content:[{type:'text',text:JSON.stringify(result)}]});
  }catch(e){return reply({isError:true,content:[{type:'text',text:e.message}]});}
 }
 if(url.pathname.startsWith('/api/inbox')){
  if(!user)return json({error:'Sign in with ChatGPT to connect your inbox.'},401);
  if(!env.BUCKET)return json({error:'Inbox storage unavailable.'},503);
  try{const prefix=await prefixFor(user);
   if(url.pathname==='/api/inbox'&&request.method==='GET')return json({packets:await readPackets(env.BUCKET,prefix)});
   if(url.pathname==='/api/inbox/ack'&&request.method==='POST'){
    if(request.headers.get('Origin')!==url.origin)return json({error:'Same-origin request required.'},403);
    const body=await readJSON(request);if(!Array.isArray(body.ids)||body.ids.length>20||body.ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id)))return json({error:'Invalid receipt IDs.'},400);
    for(const id of body.ids)await env.BUCKET.delete(prefix+id);return json({removed:body.ids.length});
   }return json({error:'Not found'},404);
  }catch(e){return json({error:e.message},400);}
 }
 return null;
}
