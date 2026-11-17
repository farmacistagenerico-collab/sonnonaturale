/* Coach-side modal conversation helper. Loaded after app.js, which exposes the DB client. */
window.openCoachConversation=async function(client){
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function render(){
    const en=document.documentElement.lang==='en';
    let messages=[];
    try{messages=await SRDB.select('messages',{or:`(sender_id.eq.${window.SRDB.session()?.user?.id||''},recipient_id.eq.${window.SRDB.session()?.user?.id||''})`,order:'created_at.asc',limit:'100'});messages=messages.filter(m=>m.sender_id===client.id||m.recipient_id===client.id)}catch(e){/* RLS reports errors in the modal status */}
    const own=window.SRDB.session()?.user?.id;
    showModal(`<p class="eyebrow">${en?'SECURE CONVERSATION':'CONVERSAZIONE RISERVATA'}</p><h2 id="modalTitle">${esc(client.name)}</h2><div class="coach-modal-messages">${messages.map(m=>`<div class="message-bubble ${m.sender_id===own?'user-message':'coach-message'}"><p>${esc(m.body)}</p><small>${m.sender_id===own?(en?'You':'Tu'):esc(client.name)} · ${new Date(m.created_at).toLocaleString(en?'en-GB':'it-IT',{dateStyle:'short',timeStyle:'short'})}</small></div>`).join('')||`<p class="subheading">${en?'No messages yet.':'Nessun messaggio per ora.'}</p>`}</div><div class="message-compose"><textarea id="coachReply" rows="2" aria-label="${en?'Write a message':'Scrivi un messaggio'}" placeholder="${en?'Write a message…':'Scrivi un messaggio…'}"></textarea><button id="coachSend" class="send-btn" aria-label="${en?'Send message':'Invia messaggio'}">↑</button></div><p class="message-disclaimer">${en?'For urgent or medical concerns, contact the patient’s doctor.':'Per urgenze o questioni mediche, contatta il medico curante.'}</p>`);
    $('#coachSend').onclick=async()=>{const input=$('#coachReply'),body=input.value.trim();if(!body)return;try{await SRDB.insert('messages',{sender_id:own,recipient_id:client.id,body});await render()}catch(e){toast((en?'Message failed: ':'Invio non riuscito: ')+e.message)}};
  }
  await render();
};
