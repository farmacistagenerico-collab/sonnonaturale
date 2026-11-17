/* Minimal Supabase Auth + PostgREST client for this dependency-free static PWA.
   The publishable key is public by design; all data access relies on RLS. */
(()=>{
  const config=window.SLEEP_RESET_SUPABASE||{};
  const base=(config.url||'').replace(/\/$/,'');
  const key=config.publishableKey||'';
  const storageKey=`sr-session:${base}`;
  let session=null;
  try{session=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}
  let refreshPromise=null;
  const configured=()=>Boolean(base&&key);
  const saveSession=value=>{session=value;try{value?localStorage.setItem(storageKey,JSON.stringify(value)):localStorage.removeItem(storageKey)}catch{}};
  // Supabase confirmation emails may return tokens in the URL fragment. Store
  // them, then remove the fragment so credentials are not left in browser history.
  try{const fragment=new URLSearchParams(window.location.hash.replace(/^#/,''));const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');if(access&&refresh){saveSession({access_token:access,refresh_token:refresh,expires_at:Number(fragment.get('expires_at'))||Math.floor(Date.now()/1000)+Number(fragment.get('expires_in')||3600),token_type:fragment.get('token_type')||'bearer'});window.history.replaceState({},document.title,window.location.pathname+window.location.search)}}catch{}
  const apiFetch=async(path,options={})=>{
    if(!configured())throw new Error('Supabase non configurato.');
    const headers=new Headers(options.headers||{});headers.set('apikey',key);headers.set('Content-Type','application/json');
    headers.set('Authorization',`Bearer ${options.accessToken||key}`);
    const response=await fetch(`${base}${path}`,{...options,headers});
    let data=null;try{data=await response.json()}catch{}
    if(!response.ok){const message=data?.msg||data?.message||data?.error_description||data?.error||`Errore Supabase (${response.status})`;throw new Error(message)}
    return data;
  };
  async function refresh(){
    if(!session?.refresh_token)return null;
    if(!refreshPromise)refreshPromise=apiFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})}).then(data=>{const normalized={...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)};saveSession(normalized);return normalized}).catch(()=>{saveSession(null);return null}).finally(()=>refreshPromise=null);
    return refreshPromise;
  }
  async function accessToken(){
    if(!session?.access_token)return null;
    if(session.expires_at&&session.expires_at<Date.now()/1000+45){const renewed=await refresh();return renewed?.access_token||null}
    return session.access_token;
  }
  async function request(path,options={}){
    let token=await accessToken();
    try{return await apiFetch(path,{...options,accessToken:token||undefined})}
    catch(error){if(token&&/401|jwt|expired/i.test(error.message)){const renewed=await refresh();if(renewed?.access_token)return apiFetch(path,{...options,accessToken:renewed.access_token})}throw error}
  }
  async function signIn(email,password){const data=await apiFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});return data.user}
  async function signUp(email,password,fullName,language){const redirect=encodeURIComponent(window.location.origin);const data=await apiFetch(`/auth/v1/signup?redirect_to=${redirect}`,{method:'POST',body:JSON.stringify({email,password,data:{full_name:fullName,preferred_language:language}})});if(data.access_token)saveSession({...data,expires_at:Math.floor(Date.now()/1000)+(data.expires_in||3600)});return data}
  async function currentUser(){const token=await accessToken();if(!token)return null;try{const user=await apiFetch('/auth/v1/user',{accessToken:token});saveSession({...session,user});return user}catch{saveSession(null);return null}}
  async function signOut(){try{const token=await accessToken();if(token)await apiFetch('/auth/v1/logout',{method:'POST',accessToken:token})}finally{saveSession(null)}}
  async function select(table,params={}){const q=new URLSearchParams({select:'*',...params});return request(`/rest/v1/${encodeURIComponent(table)}?${q.toString()}`)}
  async function insert(table,rows,prefer='return=representation'){return request(`/rest/v1/${encodeURIComponent(table)}`,{method:'POST',headers:{Prefer:prefer},body:JSON.stringify(rows)})}
  async function upsert(table,row,onConflict){const q=new URLSearchParams({on_conflict:onConflict});return request(`/rest/v1/${encodeURIComponent(table)}?${q}`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)})}
  async function remove(table,params){const q=new URLSearchParams(params);return request(`/rest/v1/${encodeURIComponent(table)}?${q}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}
  async function update(table,params,patch){const q=new URLSearchParams(params);return request(`/rest/v1/${encodeURIComponent(table)}?${q}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)})}
  window.SRDB={configured,signIn,signUp,signOut,currentUser,select,insert,upsert,remove,update,session:()=>session};
})();
