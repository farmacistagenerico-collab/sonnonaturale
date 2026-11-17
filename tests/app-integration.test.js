import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const sources=['supabase-config.js','supabase-client.js','app.js','supabase-live-chat.js'].map(f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8'));
const users={
  'coach@example.test':{id:'coach-1',email:'coach@example.test'},
  'client@example.test':{id:'client-1',email:'client@example.test'},
  'other@example.test':{id:'client-2',email:'other@example.test'}
};
const seed={
 profiles:[
  {id:'coach-1',full_name:'Daniele Coach',role:'coach',preferred_language:'it',created_at:'2026-01-01T00:00:00Z'},
  {id:'client-1',full_name:'Marta Cliente',role:'client',preferred_language:'it',created_at:'2026-02-01T00:00:00Z'},
  {id:'client-2',full_name:'Other Client',role:'client',preferred_language:'en',created_at:'2026-02-02T00:00:00Z'}
 ],
 coach_clients:[{coach_id:'coach-1',client_id:'client-1'}],
 goals:[{id:'goal-1',client_id:'client-1',created_by:'coach-1',title_it:'Luce al mattino',title_en:'Morning light',description_it:'Esci per 10 minuti',description_en:'Go outside for 10 minutes',sort_order:0}],
 goal_completions:[],sleep_entries:[{id:'sleep-other',client_id:'client-2',night_date:'2026-06-01',bed_time:'22:00:00',wake_time:'06:00:00',sleep_latency_minutes:20,awakenings:1,subjective_rating:4,notes:'private'}],coach_notes:[],messages:[],privacy_consents:[]
};
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data}}
function fixture(){
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://sonnonaturale.netlify.app/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom;window.Headers=Headers;window.URLSearchParams=URLSearchParams;window.scrollTo=()=>{};window.prompt=()=>null;
 const db=structuredClone(seed),requests=[];
 const idsFromFilter=value=>{if(!value)return null;if(value.startsWith('eq.'))return [value.slice(3)];if(value.startsWith('in.('))return value.slice(4,-1).split(',').filter(Boolean);return null};
 const userFromOptions=options=>{const auth=options.headers.get('Authorization')||'';const token=auth.replace(/^Bearer\s+/,'');return Object.values(users).find(u=>token===`jwt-${u.id}`)||null};
 window.fetch=async(url,options={})=>{
  const u=new URL(url),method=(options.method||'GET').toUpperCase();requests.push({url:u.toString(),method,headers:options.headers,body:options.body});
  if(u.pathname==='/auth/v1/signup'){
   const body=JSON.parse(options.body),user={id:'client-new',email:body.email};users[body.email]=user;db.profiles.push({id:user.id,full_name:body.data.full_name,role:'client',preferred_language:body.data.preferred_language,created_at:new Date().toISOString()});
   return response({access_token:`jwt-${user.id}`,refresh_token:`refresh-${user.id}`,expires_in:3600,user});
  }
  if(u.pathname==='/auth/v1/token'){
   const body=JSON.parse(options.body),user=users[body.email];if(!user||body.password!=='Pass12345!')return response({msg:'Invalid login credentials'},400);
   return response({access_token:`jwt-${user.id}`,refresh_token:`refresh-${user.id}`,expires_in:3600,user});
  }
  if(u.pathname==='/auth/v1/user'){const user=userFromOptions(options);return user?response(user):response({msg:'Unauthorized'},401)}
  if(u.pathname==='/auth/v1/logout')return response(null,204);
  const table=u.pathname.match(/\/rest\/v1\/([^/]+)$/)?.[1];if(!table)return response({message:'Unknown endpoint'},404);
  const user=userFromOptions(options);if(!user)return response({message:'Unauthorized'},401);
  const current=db[table];if(!current)return response({message:'Unknown table'},404);
  const filters=Object.fromEntries(u.searchParams.entries());
  const scoped=row=>{
   if(table==='profiles')return row.id===user.id||(user.id==='coach-1'&&db.coach_clients.some(a=>a.coach_id===user.id&&a.client_id===row.id));
   if(table==='coach_clients')return row.coach_id===user.id||row.client_id===user.id;
   if(['goals','goal_completions','sleep_entries','coach_notes'].includes(table))return row.client_id===user.id||(user.id==='coach-1'&&db.coach_clients.some(a=>a.coach_id===user.id&&a.client_id===row.client_id));
   if(table==='messages')return (row.sender_id===user.id||row.recipient_id===user.id)&&db.coach_clients.some(a=>(a.coach_id===row.sender_id&&a.client_id===row.recipient_id)||(a.client_id===row.sender_id&&a.coach_id===row.recipient_id));
   if(table==='privacy_consents')return row.client_id===user.id;
   return false;
  };
  if(method==='GET'){
   let rows=current.filter(scoped);
   for(const col of ['id','client_id','coach_id','goal_id','sender_id','recipient_id','visible_to_client']){const ids=idsFromFilter(filters[col]);if(ids)rows=rows.filter(r=>ids.includes(String(r[col])));else if(filters[col]==='eq.true')rows=rows.filter(r=>r[col]===true)}
   if(filters.or){const ids=[...filters.or.matchAll(/(?:sender_id|recipient_id)\.eq\.([\w-]+)/g)].map(m=>m[1]);rows=rows.filter(r=>ids.some(id=>r.sender_id===id||r.recipient_id===id))}
   if(filters.order){const [col,dir='asc']=filters.order.split('.');rows.sort((a,b)=>String(a[col]).localeCompare(String(b[col]))*(dir==='desc'?-1:1))}
   if(filters.limit)rows=rows.slice(0,Number(filters.limit));
   return response(rows);
  }
  if(method==='POST'){
   const body=JSON.parse(options.body),items=Array.isArray(body)?body:[body],created=[];
   for(const item of items){
    if(table==='goal_completions'&&!(item.client_id===user.id&&db.goals.some(g=>g.id===item.goal_id&&g.client_id===user.id)))return response({message:'RLS denied goal completion'},403);
    if(table==='goals'&&!(user.id==='coach-1'&&item.created_by===user.id&&db.coach_clients.some(a=>a.coach_id===user.id&&a.client_id===item.client_id)))return response({message:'RLS denied goal assignment'},403);
    if(table==='coach_notes'&&!(user.id==='coach-1'&&item.author_id===user.id&&db.coach_clients.some(a=>a.coach_id===user.id&&a.client_id===item.client_id)))return response({message:'RLS denied coach note'},403);
    if(table==='messages'&&!((item.sender_id===user.id)&&db.coach_clients.some(a=>(a.coach_id===item.sender_id&&a.client_id===item.recipient_id)||(a.client_id===item.sender_id&&a.coach_id===item.recipient_id))))return response({message:'RLS denied message'},403);
    const row={id:`${table}-${current.length+1}`,created_at:new Date().toISOString(),...item};
    if(table==='sleep_entries'){const old=current.find(r=>r.client_id===row.client_id&&r.night_date===row.night_date);if(old)Object.assign(old,row);else current.push(row)}else if(table==='goal_completions'){if(!current.some(r=>r.goal_id===row.goal_id&&r.client_id===row.client_id))current.push(row)}else current.push(row);
    created.push(row);
   }
   return response(created,201);
  }
  if(method==='DELETE'){
   const ids=Object.fromEntries([...u.searchParams.entries()].map(([k,v])=>[k,idsFromFilter(v)]));
   if(table==='goal_completions')db[table]=current.filter(r=>!(r.client_id===user.id&&(!ids.goal_id||ids.goal_id.includes(r.goal_id))));
   return response(null,204);
  }
  if(method==='PATCH'){
   const id=idsFromFilter(filters.id)?.[0],row=current.find(x=>x.id===id&&x.id===user.id);if(!row)return response({message:'RLS denied update'},403);Object.assign(row,JSON.parse(options.body));return response([row]);
  }
  return response({message:`Unsupported ${method}`},405);
 };
 for(const src of sources)window.eval(src);
 return {dom,window,db,requests};
}
const waitFor=async(predicate,message)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw new Error(`Timed out: ${message}`)};
async function login(f,email){const w=f.window;w.document.querySelector('[name="email"]').value=email;w.document.querySelector('[name="password"]').value='Pass12345!';w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>w.document.querySelector('#authGate').hidden,'auth gate to close')}

test('client login, goal completion, sleep diary and secure message use Supabase REST',async()=>{
 const f=fixture(),{window:w,db,requests}=f;
 await login(f,'client@example.test');
 assert.equal(w.document.documentElement.lang,'it');assert.equal(w.document.querySelector('#adminView').hidden,true);assert.match(w.document.querySelector('.welcome-row h1').textContent,/^Buongiorno, Marta/);
 assert.match(w.document.querySelector('#taskList').textContent,/Luce al mattino/);assert.doesNotMatch(w.document.querySelector('#diaryEntries').textContent,/private/);
 w.document.querySelector('[data-live-goal="goal-1"]').click();await waitFor(()=>db.goal_completions.some(x=>x.client_id==='client-1'),'goal completion insert');
 w.document.querySelector('#openDiary').click();const form=w.document.querySelector('#diaryForm');assert.ok(form);form.querySelector('[name="nightDate"]').value='2026-11-17';form.querySelector('[name="bed"]').value='22:30';form.querySelector('[name="wake"]').value='06:30';form.querySelector('[name="fall"]').value='15';form.querySelector('[name="awakenings"]').value='1';form.querySelector('[name="mood"]').value='Molto bene';form.querySelector('[name="notes"]').value='Test note';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>db.sleep_entries.some(x=>x.client_id==='client-1'&&x.night_date==='2026-11-17'),'sleep diary upsert');
 const input=w.document.querySelector('#messageInput');input.value='Test secure message';w.document.querySelector('#sendMessage').click();await waitFor(()=>db.messages.some(x=>x.body==='Test secure message'),'message insert');
 assert.ok(requests.some(r=>r.url.includes('/rest/v1/sleep_entries?on_conflict=')));assert.ok(requests.every(r=>r.headers.get('apikey')==='sb_publishable_duGp5FHGt8q_PT0Y2DIW4Q__0UGCmHk'));assert.deepEqual(await w.SRDB.select('sleep_entries',{client_id:'eq.client-2'}),[]);await assert.rejects(w.SRDB.insert('goal_completions',{goal_id:'another-client-goal',client_id:'client-2'}),/RLS denied/);w.document.querySelector('#languageToggle').click();assert.equal(w.document.documentElement.lang,'en');assert.match(w.document.querySelector('#taskList').textContent,/Morning light/);
 f.dom.window.close();
});

test('coach sees only assigned clients and can assign bilingual goals and send guidance',async()=>{
 const f=fixture(),{window:w,db}=f;await login(f,'coach@example.test');
 assert.equal(w.document.querySelector('#clientView').hidden,true);assert.equal(w.document.querySelector('#adminView').hidden,false);assert.equal(w.document.querySelectorAll('.client-row').length,1);assert.match(w.document.querySelector('#clientList').textContent,/Marta Cliente/);assert.doesNotMatch(w.document.querySelector('#clientList').textContent,/Other Client/);
 w.document.querySelector('.client-row').click();await waitFor(()=>w.document.querySelector('#createGoalForm'),'client detail goal editor');
 const form=w.document.querySelector('#createGoalForm');form.querySelector('[name="title_it"]').value='Routine luce';form.querySelector('[name="title_en"]').value='Light routine';form.querySelector('[name="description_it"]').value='Esci al mattino';form.querySelector('[name="description_en"]').value='Go outside in the morning';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>db.goals.some(g=>g.title_it==='Routine luce'),'coach goal insert');
 w.document.querySelector('.client-row').click();await waitFor(()=>w.document.querySelector('#liveAdvice'),'coach note editor');w.document.querySelector('#liveAdvice').value='Ottimo progresso';await w.document.querySelector('#saveLiveAdvice').onclick();assert.ok(db.coach_notes.some(n=>n.body==='Ottimo progresso'));
 w.document.querySelector('.client-row').click();await waitFor(()=>w.document.querySelector('#liveMessageClient'),'client detail conversation action');const chatButton=w.document.querySelector('#liveMessageClient');assert.equal(typeof w.openCoachConversation,'function');await chatButton.onclick();await waitFor(()=>w.document.querySelector('#coachReply'),'coach conversation modal');w.document.querySelector('#coachReply').value='Come procede la nuova abitudine?';w.document.querySelector('#coachSend').click();await waitFor(()=>db.messages.some(m=>m.body==='Come procede la nuova abitudine?'),'coach message send');
 assert.equal(db.goals.filter(g=>g.client_id==='client-2').length,0);await assert.rejects(w.SRDB.insert('goals',{client_id:'client-2',created_by:'coach-1',title_it:'No',title_en:'No'}),/RLS denied/);f.dom.window.close();
});

test('new signup enforces privacy acknowledgement and stores a client-only profile',async()=>{
 const f=fixture(),w=f.window;w.document.querySelector('[data-auth-mode="signup"]').click();w.document.querySelector('[name="full_name"]').value='New Client';w.document.querySelector('[name="email"]').value='new@example.test';w.document.querySelector('[name="password"]').value='Pass12345!';
 w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!w.document.querySelector('#authError').hidden,'consent validation error');assert.match(w.document.querySelector('#authError').textContent,/privacy/);
 w.document.querySelector('#authConsent').checked=true;w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>w.document.querySelector('#authGate').hidden,'signup profile login');assert.equal(f.db.profiles.find(p=>p.id==='client-new').role,'client');assert.ok(f.db.privacy_consents.some(c=>c.client_id==='client-new'));assert.ok(f.requests.some(r=>r.url.includes('redirect_to=https%3A%2F%2Fsonnonaturale.netlify.app')));f.dom.window.close();
});

test('invalid credentials stay on the auth gate and show a useful error',async()=>{
 const f=fixture(),w=f.window;w.document.querySelector('[name="email"]').value='missing@example.test';w.document.querySelector('[name="password"]').value='Wrong123!';w.document.querySelector('#authForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>!w.document.querySelector('#authError').hidden,'invalid login message');assert.equal(w.document.querySelector('#authGate').hidden,false);assert.match(w.document.querySelector('#authError').textContent,/non corretti/i);f.dom.window.close();
});
