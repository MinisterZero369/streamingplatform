import { requireAdmin, jsonResponse } from './_auth.mjs';

function env(){
  const accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken=process.env.CLOUDFLARE_STREAM_API_TOKEN?.trim();
  if(!accountId||!apiToken) throw Object.assign(new Error('Cloudflare Stream environment is not configured'),{statusCode:500});
  return {accountId,apiToken};
}

async function parseCloudflare(res){
  const raw=await res.text();
  let data={}; try{data=raw?JSON.parse(raw):{};}catch{data={raw:raw.slice(0,1000)};}
  if(!res.ok||data?.success===false){
    console.error('Cloudflare live input API failed',res.status,data?.errors||data);
    throw Object.assign(new Error(data?.errors?.[0]?.message||`Cloudflare Live API returned ${res.status}`),{statusCode:res.status||502});
  }
  return data?.result||data;
}

export default async (request)=>{
  if(!['GET','POST'].includes(request.method)) return jsonResponse(405,{error:'Method not allowed'},{Allow:'GET, POST'});
  try{
    const user=await requireAdmin(request);
    const {accountId,apiToken}=env();
    const headers={Authorization:`Bearer ${apiToken}`,Accept:'application/json','Content-Type':'application/json'};

    if(request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/live_inputs`,{
        method:'POST',headers,
        body:JSON.stringify({
          enabled:true,
          meta:{name:body.name||'Scenez Live',createdBy:user.id},
          preferLowLatency:true,
          recording:{mode:'automatic',requireSignedURLs:false,hideLiveViewerCount:false,timeoutSeconds:0}
        })
      });
      const live=await parseCloudflare(res);
      return jsonResponse(200,{uid:live.uid,rtmps:live.rtmps||null,srt:live.srt||null,recording:live.recording||null});
    }

    const url=new URL(request.url); const uid=url.searchParams.get('uid');
    if(!uid)return jsonResponse(400,{error:'uid required'});
    const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/stream/live_inputs/${encodeURIComponent(uid)}`,{headers});
    const live=await parseCloudflare(res);
    return jsonResponse(200,{uid:live.uid,enabled:live.enabled,meta:live.meta||{},rtmps:live.rtmps||null,srt:live.srt||null,recording:live.recording||null});
  }catch(e){
    console.error('live-input function error',e);
    return jsonResponse(e.statusCode||500,{error:e.message||'Unexpected live input error'});
  }
};
