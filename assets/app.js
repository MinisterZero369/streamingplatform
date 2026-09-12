(() => {
  const cfg = window.APP_CONFIG || {};
  const isConfigured = cfg.supabaseUrl && !cfg.supabaseUrl.includes('YOUR_PROJECT') && cfg.supabasePublishableKey && !cfg.supabasePublishableKey.includes('YOUR_');
  const sb = isConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const state = { session:null, profile:null, videos:[], cloudflareVideos:[], importSelected:null, selected:null, favorites:new Set(), progress:new Map(), signup:false, hero:null, normalHero:null, liveSettings:null, liveLifecycle:null, livePoll:null, imageUploadPromises:{} };
  const $ = (id) => document.getElementById(id);
  const esc = (s='') => String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const demo = [
    {id:'demo1',title:'Beyond the Signal',description:'A mysterious transmission reaches an isolated research crew.',release_year:2026,maturity_rating:'PG-13',genre:['Sci-Fi','Thriller'],featured:true,published:true,poster_url:'',backdrop_url:'',cloudflare_uid:null},
    {id:'demo2',title:'Neon Divide',description:'Two runners cross a synthetic city searching for the truth.',release_year:2026,maturity_rating:'TV-14',genre:['Action'],featured:false,published:true,poster_url:'',backdrop_url:'',cloudflare_uid:null},
    {id:'demo3',title:'The Archive',description:'A forgotten vault contains memories that were never meant to survive.',release_year:2025,maturity_rating:'TV-MA',genre:['Mystery','Sci-Fi'],featured:false,published:true,poster_url:'',backdrop_url:'',cloudflare_uid:null}
  ];

  function toast(msg){ $('uploadText').textContent = msg; }
  function show(id){ $(id)?.classList.remove('hidden'); }
  function hide(id){ $(id)?.classList.add('hidden'); }
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));

  const IMAGE_BUCKET='scenez-images';
  function setImagePreview(previewId,url,emptyText='No image selected') {
    const el=$(previewId); if(!el)return;
    if(url){ el.style.backgroundImage=`url('${String(url).replace(/'/g,"%27")}')`; el.classList.add('has-image'); el.innerHTML=''; }
    else { el.style.backgroundImage=''; el.classList.remove('has-image'); el.innerHTML=`<span>${esc(emptyText)}</span>`; }
  }
  async function uploadImageAsset(file,folder,statusId){
    if(!sb||!state.session||state.profile?.role!=='admin')throw new Error('Admin login required to upload images.');
    if(!file?.type?.startsWith('image/'))throw new Error('Please choose an image file.');
    if(file.size>10*1024*1024)throw new Error('Image is too large. Please use an image under 10 MB.');
    const status=$(statusId); if(status)status.textContent='Uploading image…';
    const rawExt=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const unique=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const path=`${folder}/${state.session.user.id}/${unique}.${rawExt}`;
    const {error}=await sb.storage.from(IMAGE_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error)throw new Error(error.message);
    const {data}=sb.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if(!data?.publicUrl)throw new Error('Image uploaded, but a public URL was not returned.');
    if(status)status.textContent='✓ Image uploaded';
    return data.publicUrl;
  }
  function bindImageUploader(fileId,urlId,previewId,statusId,folder,emptyText='No image selected'){
    const input=$(fileId); if(!input)return;
    input.addEventListener('change',()=>{
      const file=input.files?.[0]; if(!file)return;
      const status=$(statusId);
      const task=(async()=>{
        try{
          const url=await uploadImageAsset(file,folder,statusId);
          $(urlId).value=url; setImagePreview(previewId,url,emptyText);
          return url;
        }catch(err){ console.error(err); if(status)status.textContent='Upload failed: '+(err.message||err); throw err; }
      })();
      state.imageUploadPromises[urlId]=task;
      task.catch(()=>{}).finally(()=>{ if(state.imageUploadPromises[urlId]===task)delete state.imageUploadPromises[urlId]; });
    });
  }
  async function waitForImageUploads(...urlIds){
    const tasks=urlIds.map(id=>state.imageUploadPromises[id]).filter(Boolean);
    if(tasks.length)await Promise.all(tasks);
  }

  async function init(){
    if(!isConfigured){ state.videos = demo; renderAll(); return; }
    const {data:{session}} = await sb.auth.getSession();
    state.session = session;
    if(session) await loadUser();
    await loadCatalog();
    await loadLiveSettings();
    startLivePolling();
    sb.auth.onAuthStateChange(async (_e,s)=>{state.session=s;if(s) await loadUser(); else {state.profile=null;state.favorites.clear();state.progress.clear();} updateAuthUI();renderAll();});
  }

  async function loadUser(){
    const uid = state.session.user.id;
    const [{data:p},{data:f},{data:w}] = await Promise.all([
      sb.from('profiles').select('*').eq('id',uid).single(),
      sb.from('favorites').select('video_id').eq('user_id',uid),
      sb.from('watch_progress').select('*').eq('user_id',uid)
    ]);
    state.profile=p; state.favorites=new Set((f||[]).map(x=>x.video_id)); state.progress=new Map((w||[]).map(x=>[x.video_id,x])); updateAuthUI();
  }

  async function loadCatalog(){
    if(!sb){state.videos=demo;renderAll();return;}
    const {data,error}=await sb.from('videos').select('*').order('sort_order').order('created_at',{ascending:false});
    if(error){console.error(error);return;}
    state.videos=data||[];renderAll();
  }

  function updateAuthUI(){
    $('authBtn').textContent=state.session?'Sign out':'Sign in';
    $('adminNav').classList.toggle('hidden',state.profile?.role!=='admin');
  }

  function renderAll(){ renderCatalog(); renderHero(); renderContinue(); renderMyList(); renderAdmin(); renderCloudflareLibrary(); renderLiveStudio(); updateAuthUI(); }

  function filteredVideos(){
    const s=$('searchInput').value.trim().toLowerCase(), g=$('genreFilter').value;
    return state.videos.filter(v=>(!s||(v.title||'').toLowerCase().includes(s)||(v.description||'').toLowerCase().includes(s))&&(!g||(v.genre||[]).includes(g)));
  }

  function posterStyle(v){ return v.poster_url?`style="background-image:url('${esc(v.poster_url)}')"`:''; }
  function landscapeStyle(v){ const url=v.backdrop_url||v.poster_url; return url?`style="background-image:url('${esc(url)}')"`:''; }
  function card(v,progress,landscape=false){
    const pct=progress&&progress.duration_seconds?Math.min(100,Math.round(progress.position_seconds/progress.duration_seconds*100)):0;
    return `<article class="card ${landscape?'landscape-card':''}" data-id="${v.id}"><div class="poster" ${landscape?landscapeStyle(v):posterStyle(v)}></div><div class="card-info"><div class="card-title">${esc(v.title)}</div><div class="card-meta">${esc(v.release_year||'')} ${v.maturity_rating?' · '+esc(v.maturity_rating):''}</div>${pct?`<div class="progress-mini"><span style="width:${pct}%"></span></div>`:''}</div></article>`;
  }
  function bindCards(root){ if(!root)return; root.querySelectorAll('.card').forEach(el=>el.onclick=()=>openDetails(state.videos.find(v=>String(v.id)===el.dataset.id))); }

  function rowSection(title,list,key){
    if(!list.length)return '';
    return `<section class="content-row-section" data-row="${esc(key)}"><div class="row-heading"><h2>${esc(title)}</h2><span>${list.length} title${list.length===1?'':'s'}</span></div><div class="netflix-rail">${list.map(v=>card(v,state.progress.get(v.id),true)).join('')}</div></section>`;
  }

  function renderCatalog(){
    const genres=[...new Set(state.videos.flatMap(v=>v.genre||[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const current=$('genreFilter').value;
    $('genreFilter').innerHTML='<option value="">All genres</option>'+genres.map(g=>`<option value="${esc(g)}" ${g===current?'selected':''}>${esc(g)}</option>`).join('');
    const list=filteredVideos();
    const query=$('searchInput').value.trim();
    const chosenGenre=$('genreFilter').value;
    let html='';
    if(query || chosenGenre){
      html=rowSection(query?`Search results${chosenGenre?' · '+chosenGenre:''}`:chosenGenre,list,'filtered');
    }else{
      html+=rowSection('Recently Added',list.slice(0,12),'recent');
      for(const g of genres){
        html+=rowSection(g,list.filter(v=>(v.genre||[]).includes(g)),`genre-${g}`);
      }
      const uncategorized=list.filter(v=>!(v.genre||[]).length);
      html+=rowSection('More to Explore',uncategorized,'uncategorized');
    }
    $('catalogRows').innerHTML=html||'<div class="empty rows-empty">No titles found.</div>';
    bindCards($('catalogRows'));
  }

  function getNormalHero(){
    const published=state.videos.filter(v=>v.published!==false);
    return published.find(x=>x.featured)||published[0]||state.videos[0]||null;
  }

  function getLiveHero(){
    const ls=state.liveSettings;
    if(!ls?.live_input_uid || !ls.auto_takeover || !state.liveLifecycle?.live)return null;
    return {
      id:'__live__',
      title:ls.title||'Scenez Live',
      description:ls.description||'Streaming live now on Scenez.',
      backdrop_url:ls.hero_image_url||'',
      poster_url:ls.hero_image_url||'',
      cloudflare_uid:ls.live_input_uid,
      is_live:true,
      published:true
    };
  }

  function renderHero(){
    state.normalHero=getNormalHero();
    const liveHero=getLiveHero();
    const v=liveHero||state.normalHero;
    const eyebrow=$('heroEyebrow');
    if(!v){ state.hero=null; $('heroTitle').textContent='Your streaming platform starts here.'; $('heroDesc').textContent='Add a title from Admin Studio to start building your catalog.'; $('hero').style.backgroundImage=''; if(eyebrow)eyebrow.textContent='FEATURED'; $('heroInfo').classList.remove('hidden'); return; }
    state.hero=v;
    $('heroTitle').textContent=v.title;
    $('heroDesc').textContent=v.description||'';
    if(eyebrow){eyebrow.textContent=v.is_live?'● LIVE NOW':'FEATURED';eyebrow.classList.toggle('live-eyebrow',!!v.is_live);}
    $('heroInfo').classList.toggle('hidden',!!v.is_live);
    $('heroPlay').textContent=v.is_live?'▶ Watch Live':'▶ Play';
    const bg=v.backdrop_url||v.poster_url;
    $('hero').style.backgroundImage=bg?`linear-gradient(90deg,#07070ad9 0%,#07070a80 44%,#07070a10 75%),linear-gradient(0deg,#07070a 0%,transparent 38%),url('${bg}')`:'';
    $('hero').classList.toggle('hero-live',!!v.is_live);
  }

  function renderContinue(){
    const list=state.videos.filter(v=>{const p=state.progress.get(v.id);return p&&!p.completed&&p.position_seconds>5});
    $('continueSection').classList.toggle('hidden',!list.length);
    $('continueGrid').innerHTML=list.map(v=>card(v,state.progress.get(v.id),true)).join('');
    bindCards($('continueGrid'));
  }

  function renderMyList(){
    const list=state.videos.filter(v=>state.favorites.has(v.id));
    $('myListGrid').innerHTML=list.length?list.map(v=>card(v,state.progress.get(v.id))).join(''):'<div class="empty">Sign in and add titles to build your list.</div>';
    bindCards($('myListGrid'));
  }

  async function loadLiveSettings(){
    if(!sb)return;
    const {data,error}=await sb.from('live_settings').select('*').eq('id',1).maybeSingle();
    if(error){
      console.warn('Live settings unavailable. Run sql/live-streaming-v5.sql once.',error.message);
      state.liveSettings=null;
      renderHero();
      renderLiveStudio();
      return;
    }
    state.liveSettings=data||null;
    await refreshLiveLifecycle();
    renderHero();
    renderLiveStudio();
  }

  async function refreshLiveLifecycle(){
    const uid=state.liveSettings?.live_input_uid;
    const host=cfg.cloudflareCustomerHost;
    if(!uid||!host){state.liveLifecycle={live:false,videoUID:null,isInput:true};renderHero();renderLiveStudio();return state.liveLifecycle;}
    try{
      const r=await fetch(`https://${host}/${encodeURIComponent(uid)}/lifecycle`,{cache:'no-store'});
      if(!r.ok)throw new Error(`Live status ${r.status}`);
      state.liveLifecycle=await r.json();
    }catch(err){
      console.warn('Unable to read Cloudflare live lifecycle',err);
      state.liveLifecycle={live:false,videoUID:null,isInput:true,error:err.message};
    }
    renderHero();
    renderLiveStudio();
    return state.liveLifecycle;
  }

  function startLivePolling(){
    clearInterval(state.livePoll);
    refreshLiveLifecycle();
    state.livePoll=setInterval(refreshLiveLifecycle,15000);
  }

  function renderLiveStudio(){
    const panel=$('liveStudioPanel'); if(!panel)return;
    if(state.profile?.role!=='admin'){panel.classList.add('hidden');return;}
    panel.classList.remove('hidden');
    const ls=state.liveSettings;
    const isLive=!!state.liveLifecycle?.live;
    $('liveStateBadge').textContent=isLive?'● LIVE':'● OFFLINE';
    $('liveStateBadge').classList.toggle('is-live',isLive);
    $('liveStatusText').textContent=isLive?'Broadcast is live. The homepage hero is currently showing this stream.':'No active broadcast. The normal Featured Hero is showing.';
    $('createLiveInputBtn').classList.toggle('hidden',!!ls?.live_input_uid);
    $('loadLiveCredentialsBtn').classList.toggle('hidden',!ls?.live_input_uid);
    $('liveInputUid').textContent=ls?.live_input_uid||'No Live Input created yet';
    if(document.activeElement!==$('liveTitle'))$('liveTitle').value=ls?.title||'Scenez Live';
    if(document.activeElement!==$('liveDescription'))$('liveDescription').value=ls?.description||'Streaming live now on Scenez.';
    if(!state.imageUploadPromises.liveHeroImage){
      $('liveHeroImage').value=ls?.hero_image_url||'';
      setImagePreview('liveHeroImagePreview',ls?.hero_image_url||'','No live hero image selected');
    }
    $('liveAutoTakeover').checked=ls?.auto_takeover!==false;
    $('liveSettingsSave').disabled=!ls?.live_input_uid;
  }

  async function createLiveInput(){
    if(state.profile?.role!=='admin')return;
    $('liveActionStatus').textContent='Creating permanent Cloudflare Live Input…';
    try{
      const r=await authFetch('/api/live-input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Scenez Live'})});
      const data=await r.json(); if(!r.ok)throw new Error(data.error||'Unable to create live input');
      const payload={id:1,live_input_uid:data.uid,title:$('liveTitle').value.trim()||'Scenez Live',description:$('liveDescription').value.trim()||'Streaming live now on Scenez.',hero_image_url:$('liveHeroImage').value.trim()||null,auto_takeover:true,created_by:state.session.user.id,updated_at:new Date().toISOString()};
      const {error}=await sb.from('live_settings').upsert(payload,{onConflict:'id'}); if(error)throw error;
      await loadLiveSettings();
      showLiveCredentials(data);
      $('liveActionStatus').textContent='Live Input created. Add the RTMPS server and Stream Key to OBS.';
    }catch(err){console.error(err);$('liveActionStatus').textContent=err.message||'Unable to create live input.';}
  }

  async function loadLiveCredentials(){
    const uid=state.liveSettings?.live_input_uid;if(!uid)return;
    $('liveActionStatus').textContent='Loading broadcast credentials…';
    try{
      const r=await authFetch(`/api/live-input?uid=${encodeURIComponent(uid)}`);
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load credentials');
      showLiveCredentials(data);$('liveActionStatus').textContent='Broadcast credentials loaded.';
    }catch(err){console.error(err);$('liveActionStatus').textContent=err.message||'Unable to load credentials.';}
  }

  function showLiveCredentials(data){
    $('liveCredentials').classList.remove('hidden');
    $('liveRtmpsUrl').value=data.rtmps?.url||'';
    $('liveStreamKey').value=data.rtmps?.streamKey||'';
  }

  async function saveLiveSettings(e){
    e?.preventDefault();
    const uid=state.liveSettings?.live_input_uid;if(!uid)return;
    $('liveActionStatus').textContent='Saving Live Studio settings…';
    try{await waitForImageUploads('liveHeroImage');}catch(err){$('liveActionStatus').textContent=err.message||'Image upload failed.';return;}
    const payload={id:1,live_input_uid:uid,title:$('liveTitle').value.trim()||'Scenez Live',description:$('liveDescription').value.trim(),hero_image_url:$('liveHeroImage').value.trim()||null,auto_takeover:$('liveAutoTakeover').checked,created_by:state.liveSettings?.created_by||state.session.user.id,updated_at:new Date().toISOString()};
    const {error}=await sb.from('live_settings').upsert(payload,{onConflict:'id'});
    if(error){$('liveActionStatus').textContent=error.message;return;}
    await loadLiveSettings();
    $('liveActionStatus').textContent='Live Studio settings saved.';
  }

  async function copyField(id){
    const el=$(id); if(!el?.value)return;
    try{await navigator.clipboard.writeText(el.value);$('liveActionStatus').textContent='Copied to clipboard.';}
    catch{$('liveActionStatus').textContent='Copy failed. Select the value and copy it manually.';}
  }

  function renderFeaturedAdmin(){
    if(state.profile?.role!=='admin')return;
    const published=state.videos.filter(v=>v.published);
    const current=published.find(v=>v.featured)||null;
    const select=$('heroAdminSelect');
    select.innerHTML=published.length?published.map(v=>`<option value="${v.id}" ${current?.id===v.id?'selected':''}>${esc(v.title)}</option>`).join(''):'<option value="">No published titles</option>';
    $('setHeroBtn').disabled=!published.length;
    $('heroAdminStatus').textContent=current?'Current hero: '+current.title:'No hero selected';
    const preview=$('heroAdminPreview');
    if(current){
      const bg=current.backdrop_url||current.poster_url;
      preview.style.backgroundImage=bg?`linear-gradient(90deg,#050507cc,transparent),url('${bg}')`:'';
      preview.innerHTML=`<div><span>FEATURED</span><strong>${esc(current.title)}</strong><small>${esc(current.description||'')}</small></div>`;
    }else{
      preview.style.backgroundImage='';
      preview.innerHTML='<div><span>FEATURED</span><strong>Select a hero title</strong><small>Published titles will appear here.</small></div>';
    }
  }

  async function setFeaturedHero(videoId){
    if(!sb||state.profile?.role!=='admin'||!videoId)return;
    const chosen=state.videos.find(v=>String(v.id)===String(videoId));
    if(!chosen?.published){alert('Publish this title before setting it as the Featured Hero.');return;}
    $('heroAdminStatus').textContent='Updating hero…';
    const {error:clearError}=await sb.from('videos').update({featured:false}).eq('featured',true);
    if(clearError){$('heroAdminStatus').textContent=clearError.message;return;}
    const {error}=await sb.from('videos').update({featured:true}).eq('id',videoId);
    if(error){$('heroAdminStatus').textContent=error.message;return;}
    await loadCatalog();
    $('heroAdminStatus').textContent='Featured Hero updated.';
  }

  function renderAdmin(){
    if(state.profile?.role!=='admin')return;
    renderFeaturedAdmin();
    $('adminCatalog').innerHTML=state.videos.length?state.videos.map(v=>`<div class="admin-item ${v.featured?'is-hero':''}"><div class="admin-thumb" ${posterStyle(v)}></div><div><b>${esc(v.title)} ${v.featured?'<span class="hero-badge">★ HERO</span>':''}</b><br><small>${v.published?'Published':'Draft'} · ${v.cloudflare_uid?'Video connected':'No video'}${(v.genre||[]).length?' · '+esc((v.genre||[]).join(', ')):''}</small></div><div class="admin-actions"><button data-hero="${v.id}" ${!v.published||v.featured?'disabled':''}>${v.featured?'Hero selected':'Make Hero'}</button><button data-toggle="${v.id}">${v.published?'Unpublish':'Publish'}</button><button data-delete="${v.id}">Delete</button></div></div>`).join(''):'<div class="empty">No uploads yet.</div>';
    document.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>setFeaturedHero(b.dataset.hero));
    document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const v=state.videos.find(x=>String(x.id)===String(b.dataset.toggle));await sb.from('videos').update({published:!v.published,featured:v.published&&v.featured?false:v.featured}).eq('id',v.id);await loadCatalog();});
    document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this catalog record? Cloudflare video is not deleted by this action.')){await sb.from('videos').delete().eq('id',b.dataset.delete);await loadCatalog();}});
  }

  function formatDuration(seconds){
    const n=Math.max(0,Math.round(Number(seconds)||0));
    const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),sec=n%60;
    return h?`${h}h ${m}m`:(m?`${m}m ${sec}s`:`${sec}s`);
  }

  function renderCloudflareLibrary(){
    const root=$('cloudflareLibrary');
    if(!root)return;
    if(state.profile?.role!=='admin'){root.innerHTML='';return;}
    const existing=new Set(state.videos.map(v=>v.cloudflare_uid).filter(Boolean));
    if(!state.cloudflareVideos.length){root.innerHTML='<div class="empty">No Cloudflare videos loaded yet.</div>';return;}
    root.innerHTML=state.cloudflareVideos.map(v=>{
      const added=existing.has(v.uid);
      const bg=v.thumbnail?`style="background-image:url('${esc(v.thumbnail)}')"`:'';
      const ready=v.readyToStream||v.state==='ready';
      return `<article class="cf-video"><div class="cf-thumb" ${bg}><span class="cf-state">${esc(v.state||'unknown')}</span></div><div class="cf-body"><div class="cf-title" title="${esc(v.name)}">${esc(v.name||v.uid)}</div><div class="cf-meta">${formatDuration(v.duration)} · ${ready?'Ready to stream':'Processing'}</div><button class="cf-button ${added?'':'primary-small'}" data-import-uid="${esc(v.uid)}" ${added?'disabled':''}>${added?'✓ Already in catalog':'＋ Add to catalog'}</button></div></article>`;
    }).join('');
    root.querySelectorAll('[data-import-uid]:not([disabled])').forEach(b=>b.onclick=()=>openImportModal(b.dataset.importUid));
  }

  async function loadCloudflareLibrary(){
    if(state.profile?.role!=='admin')return;
    $('cloudflareStatus').textContent='Loading videos from Cloudflare Stream…';
    $('cloudflareLibrary').innerHTML='<div class="empty">Loading…</div>';
    try{
      const r=await authFetch('/api/cloudflare-videos');
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Unable to load Cloudflare library');
      state.cloudflareVideos=data.videos||[];
      $('cloudflareStatus').textContent=`${state.cloudflareVideos.length} video${state.cloudflareVideos.length===1?'':'s'} found in Cloudflare Stream.`;
      renderCloudflareLibrary();
    }catch(err){
      console.error(err);
      $('cloudflareStatus').textContent=err.message||'Unable to load Cloudflare Stream videos.';
      $('cloudflareLibrary').innerHTML='<div class="empty">Cloudflare library could not be loaded. Check the API token and Account ID in Netlify.</div>';
    }
  }

  function openImportModal(uid){
    const v=state.cloudflareVideos.find(x=>x.uid===uid);if(!v)return;
    state.importSelected=v;
    $('importCloudflareName').textContent=`Cloudflare: ${v.name} · ${formatDuration(v.duration)}`;
    $('importTitle').value=v.name&&v.name!=='Untitled video'?v.name:'';
    $('importDescription').value='';
    $('importReleaseYear').value=new Date().getFullYear();
    $('importRating').value='';
    $('importGenres').value='';
    $('importPosterUrl').value=v.thumbnail||'';
    $('importBackdropUrl').value=v.thumbnail||'';
    $('importPosterFile').value=''; $('importBackdropFile').value='';
    $('importPosterUploadStatus').textContent=''; $('importBackdropUploadStatus').textContent='';
    setImagePreview('importPosterPreview',v.thumbnail||'','Cloudflare thumbnail will be used if you do not upload one');
    setImagePreview('importBackdropPreview',v.thumbnail||'','Cloudflare thumbnail will be used if you do not upload one');
    $('importFeatured').checked=false;
    $('importPublished').checked=true;
    $('importError').textContent='';
    show('importModal');
  }

  async function importCloudflareVideo(e){
    e.preventDefault();
    const v=state.importSelected;if(!v||state.profile?.role!=='admin')return;
    $('importError').textContent='Adding video…';
    try{await waitForImageUploads('importPosterUrl','importBackdropUrl');}catch(err){$('importError').textContent=err.message||'Image upload failed.';return;}
    const makeHero=$('importFeatured').checked;
    const payload={
      title:$('importTitle').value.trim(), description:$('importDescription').value.trim(), release_year:Number($('importReleaseYear').value)||null,
      maturity_rating:$('importRating').value.trim()||null, genre:$('importGenres').value.split(',').map(x=>x.trim()).filter(Boolean),
      poster_url:$('importPosterUrl').value.trim()||v.thumbnail||null, backdrop_url:$('importBackdropUrl').value.trim()||v.thumbnail||null,
      duration_seconds:Math.round(Number(v.duration)||0), featured:false, published:$('importPublished').checked, cloudflare_uid:v.uid, created_by:state.session.user.id
    };
    if(!payload.title){$('importError').textContent='Please enter a title.';return;}
    if(makeHero&&!payload.published){$('importError').textContent='A Featured Hero must also be published.';return;}
    const {data:inserted,error}=await sb.from('videos').insert(payload).select('id').single();
    if(error){$('importError').textContent=error.message;return;}
    hide('importModal');state.importSelected=null;
    await loadCatalog();
    if(makeHero)await setFeaturedHero(inserted.id);
    renderCloudflareLibrary();
  }

  function openDetails(v){if(!v||v.is_live)return;state.selected=v;$('detailTitle').textContent=v.title;$('detailDesc').textContent=v.description||'';$('detailMeta').textContent=[v.release_year,v.maturity_rating,...(v.genre||[])].filter(Boolean).join(' · ');$('detailBackdrop').style.backgroundImage=v.backdrop_url?`url('${v.backdrop_url}')`:'';$('favoriteBtn').textContent=state.favorites.has(v.id)?'✓ In My List':'+ My List';show('detailModal');}
  async function toggleFavorite(){if(!state.session){show('authModal');return;}const v=state.selected;if(state.favorites.has(v.id)){await sb.from('favorites').delete().eq('user_id',state.session.user.id).eq('video_id',v.id);state.favorites.delete(v.id)}else{await sb.from('favorites').insert({user_id:state.session.user.id,video_id:v.id});state.favorites.add(v.id)}openDetails(v);renderMyList();}

  function play(v){if(!v)return;if(!v.cloudflare_uid){alert('This title has no Cloudflare video connected.');return;}hide('detailModal');show('playerModal');const host=cfg.cloudflareCustomerHost;const src=`https://${host}/${v.cloudflare_uid}/iframe?autoplay=true`; $('playerWrap').innerHTML=`<iframe src="${src}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; if(state.session&&!v.is_live) startProgressHeartbeat(v);}
  let heartbeat=null,startAt=0;
  function startProgressHeartbeat(v){clearInterval(heartbeat);startAt=Date.now();heartbeat=setInterval(async()=>{const approx=(state.progress.get(v.id)?.position_seconds||0)+Math.round((Date.now()-startAt)/1000);await sb.from('watch_progress').upsert({user_id:state.session.user.id,video_id:v.id,position_seconds:approx,duration_seconds:Math.max(approx+1,state.progress.get(v.id)?.duration_seconds||0),updated_at:new Date().toISOString()},{onConflict:'user_id,video_id'});},15000);}
  async function closePlayer(){clearInterval(heartbeat);heartbeat=null;$('playerWrap').innerHTML='';hide('playerModal');if(state.session)await loadUser();renderContinue();}

  bindImageUploader('posterFile','posterUrl','posterPreview','posterUploadStatus','posters');
  bindImageUploader('backdropFile','backdropUrl','backdropPreview','backdropUploadStatus','backdrops');
  bindImageUploader('importPosterFile','importPosterUrl','importPosterPreview','importPosterUploadStatus','posters','Cloudflare thumbnail will be used if you do not upload one');
  bindImageUploader('importBackdropFile','importBackdropUrl','importBackdropPreview','importBackdropUploadStatus','backdrops','Cloudflare thumbnail will be used if you do not upload one');
  bindImageUploader('liveHeroImageFile','liveHeroImage','liveHeroImagePreview','liveHeroImageStatus','live');

  $('heroPlay').onclick=()=>play(state.hero); $('heroInfo').onclick=()=>openDetails(state.hero); $('detailPlay').onclick=()=>play(state.selected); $('favoriteBtn').onclick=toggleFavorite; $('playerClose').onclick=closePlayer;
  $('searchInput').oninput=renderCatalog; $('genreFilter').onchange=renderCatalog; $('refreshAdmin').onclick=()=>loadCatalog(); $('refreshCloudflare').onclick=loadCloudflareLibrary; $('importForm').onsubmit=importCloudflareVideo;
  $('setHeroBtn').onclick=()=>setFeaturedHero($('heroAdminSelect').value);
  $('createLiveInputBtn').onclick=createLiveInput; $('loadLiveCredentialsBtn').onclick=loadLiveCredentials; $('refreshLiveStatusBtn').onclick=refreshLiveLifecycle; $('liveSettingsForm').onsubmit=saveLiveSettings; $('copyRtmpsBtn').onclick=()=>copyField('liveRtmpsUrl'); $('copyStreamKeyBtn').onclick=()=>copyField('liveStreamKey');
  $('heroAdminSelect').onchange=()=>{
    const v=state.videos.find(x=>String(x.id)===String($('heroAdminSelect').value));
    if(!v)return;
    const bg=v.backdrop_url||v.poster_url; const preview=$('heroAdminPreview');
    preview.style.backgroundImage=bg?`linear-gradient(90deg,#050507cc,transparent),url('${bg}')`:'';
    preview.innerHTML=`<div><span>PREVIEW</span><strong>${esc(v.title)}</strong><small>${esc(v.description||'')}</small></div>`;
  };
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));const id=b.dataset.view==='home'?'homeView':b.dataset.view==='mylist'?'mylistView':'adminView';show(id);if(id!=='homeView')$('hero').classList.add('hidden');else $('hero').classList.remove('hidden');document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(id==='adminView'){loadCloudflareLibrary();loadLiveSettings();}});

  $('authBtn').onclick=async()=>{if(state.session){await sb.auth.signOut();return;}if(!sb){alert('Add your Supabase URL and publishable key to config.js first.');return;}show('authModal');};
  $('authToggle').onclick=()=>{state.signup=!state.signup;$('authTitle').textContent=state.signup?'Create account':'Sign in';$('authSubmit').textContent=state.signup?'Create account':'Sign in';$('authName').classList.toggle('hidden',!state.signup);$('authToggle').textContent=state.signup?'Already have an account? Sign in':'Need an account? Sign up';$('authError').textContent='';};
  $('authSubmit').onclick=async()=>{const email=$('authEmail').value.trim(),password=$('authPassword').value;let res;if(state.signup){res=await sb.auth.signUp({email,password,options:{data:{display_name:$('authName').value.trim()}}});}else{res=await sb.auth.signInWithPassword({email,password});}if(res.error){$('authError').textContent=res.error.message;}else{hide('authModal');if(state.signup&&!res.data.session)alert('Account created. Check your email if confirmation is enabled.');}};

  async function authFetch(url,options={}){const {data:{session}}=await sb.auth.getSession();return fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${session?.access_token||''}`}});}
  async function uploadTus(file,uploadURL,onProgress){const chunkSize=8*1024*1024;let offset=0;while(offset<file.size){const chunk=file.slice(offset,Math.min(file.size,offset+chunkSize));const r=await fetch(uploadURL,{method:'PATCH',headers:{'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:chunk});if(!r.ok)throw new Error(`Upload failed at ${Math.round(offset/file.size*100)}% (${r.status})`);const next=Number(r.headers.get('Upload-Offset'));offset=Number.isFinite(next)&&next>offset?next:offset+chunk.size;onProgress(offset/file.size);}}

  $('uploadForm').onsubmit=async(e)=>{
    e.preventDefault(); if(!state.session||state.profile?.role!=='admin')return alert('Admin login required.'); const file=$('videoFile').files[0]; if(!file)return;
    const makeHero=$('featured').checked; if(makeHero&&!$('publishNow').checked)return alert('A Featured Hero must also be published.');
    show('uploadStatus'); $('uploadBar').style.width='0%'; toast('Preparing upload…');
    try{
      await waitForImageUploads('posterUrl','backdropUrl');
      toast('Requesting secure upload URL…');
      const provision=await authFetch('/api/create-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:file.size,name:file.name,maxDurationSeconds:14400})});
      const p=await provision.json(); if(!provision.ok)throw new Error(p.error+(p.details?' — '+p.details:'')); let uid=p.uid;
      toast('Uploading video directly to Cloudflare…'); await uploadTus(file,p.uploadURL,(f)=>{$('uploadBar').style.width=`${Math.round(f*100)}%`;toast(`Uploading… ${Math.round(f*100)}%`);});
      if(!uid){const m=p.uploadURL.match(/\/([a-f0-9]{32})(?:\?|$)/i);uid=m?.[1]||null;} if(!uid)throw new Error('Upload completed but Stream UID was not returned. Check Cloudflare response headers.');
      toast('Saving catalog metadata…');
      const payload={title:$('title').value.trim(),description:$('description').value.trim(),release_year:Number($('releaseYear').value)||null,maturity_rating:$('rating').value.trim()||null,genre:$('genres').value.split(',').map(x=>x.trim()).filter(Boolean),poster_url:$('posterUrl').value.trim()||null,backdrop_url:$('backdropUrl').value.trim()||null,featured:false,published:$('publishNow').checked,cloudflare_uid:uid,created_by:state.session.user.id};
      const {data:inserted,error}=await sb.from('videos').insert(payload).select('id').single(); if(error)throw error;
      $('uploadBar').style.width='100%'; toast('Upload complete. Cloudflare is processing the video; it will play when ready.'); $('uploadForm').reset();
      $('posterUrl').value=''; $('backdropUrl').value=''; $('posterUploadStatus').textContent=''; $('backdropUploadStatus').textContent='';
      setImagePreview('posterPreview','','No poster selected'); setImagePreview('backdropPreview','','No backdrop selected');
      await loadCatalog(); if(makeHero)await setFeaturedHero(inserted.id);
    }catch(err){console.error(err);toast(err.message||'Upload failed');}
  };

  init();
})();
