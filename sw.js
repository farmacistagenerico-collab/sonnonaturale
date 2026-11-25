const CACHE='sleep-reset-v9';
const BASE=new URL('./',self.location.href);
const CORE=['./','index.html','styles.css','app.js','manifest.webmanifest','assets/icon.svg','supabase-config.js','supabase-client.js','supabase-live-chat.js'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sleep-reset-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(event.request);
  if(cached)return cached;
  try{
   const response=await fetch(event.request);
   if(response.ok)cache.put(event.request,response.clone());
   return response;
  }catch{
   return cache.match(new URL('index.html',BASE).href);
  }
 })());
});
