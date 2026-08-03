(() => {
'use strict';

const CFG = window.BORION_CONFIG || {};
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAGE_META = {
  dashboard:['Visão Geral','Acompanhe cheques, boletos e próximos vencimentos.'],
  cheques:['Cheques','Controle de cheques emitidos, recebidos, lotes e imagens.'],
  boletos:['Boletos','Cadastre por foto, PDF, linha digitável ou leitor USB.'],
  fornecedores:['Fornecedores','Pessoas e empresas vinculadas aos pagamentos.'],
  alertas:['Alertas','Vencimentos, atrasos e documentos que precisam de atenção.'],
  backup:['Backup','Exporte, restaure e proteja os dados da empresa.'],
  config:['Configurações','Google Drive, segurança e preferências do Borion.']
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().slice(0,10);
const brl = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const fmtDate = value => {
  if(!value) return '—';
  const d = new Date(String(value).length === 10 ? value+'T12:00:00' : value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const fmtDateTime = value => {
  if(!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
};
const digits = value => String(value||'').replace(/\D/g,'');
const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const addDays = (date, days) => {
  const d = new Date((date||todayISO())+'T12:00:00');
  d.setDate(d.getDate() + Number(days||0));
  return d.toISOString().slice(0,10);
};
const daysUntil = date => {
  const a = new Date(todayISO()+'T12:00:00');
  const b = new Date(date+'T12:00:00');
  return Math.round((b-a)/86400000);
};
const initials = name => String(name||'B').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const sizeText = bytes => bytes < 1024 ? bytes+' B' : bytes < 1048576 ? (bytes/1024).toFixed(1)+' KB' : (bytes/1048576).toFixed(1)+' MB';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function blankState(){
  return {
    meta:{version:CFG.version||'1.0.0',createdAt:nowISO(),updatedAt:nowISO()},
    settings:{companyName:'Borion CNPJ',rootFolderId:'',rootFolderName:CFG.driveRootFolderName||'Borion CNPJ',autoSync:true,keepOriginals:true,warningDays:7},
    fornecedores:[],cheques:[],boletos:[],audit:[],deleted:[]
  };
}

const App = {
  state:blankState(), page:'dashboard', chequeTab:'todos', boletoTab:'todos',
  user:null, localMode:true, db:null, teamKey:null,
  drive:{token:'',rootId:'',dataFileId:'',connected:false,syncing:false,tokenClient:null},
  saveTimer:null, syncTimer:null, search:{cheques:'',boletos:'',fornecedores:''}
};

function toast(message,type='ok',time=3200){
  const root=$('#toast-root');
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=message; root.appendChild(el);
  setTimeout(()=>el.remove(),time);
}
function logAudit(action,detail,entityType='',entityId=''){
  App.state.audit.unshift({id:uid(),action,detail,entityType,entityId,user:App.user?.email||'local',createdAt:nowISO()});
  App.state.audit=App.state.audit.slice(0,500);
}
function active(list){ return (list||[]).filter(x=>!x.deleted); }
function supplierById(id){ return active(App.state.fornecedores).find(x=>x.id===id); }
function statusClass(status){
  const s=normalize(status);
  if(s.includes('pago')||s.includes('compens')) return 'paid';
  if(s.includes('venc')||s.includes('devol')) return s.includes('devol')?'returned':'overdue';
  if(s.includes('cancel')) return 'cancelled';
  if(s.includes('receb')) return 'received';
  return 'open';
}
function recordTouch(record){ record.updatedAt=nowISO(); record.updatedBy=App.user?.email||'local'; }

// ---------- Criptografia e armazenamento local ----------
function bytesToB64(bytes){
  let s=''; const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  for(let i=0;i<arr.length;i+=0x8000) s += String.fromCharCode(...arr.subarray(i,i+0x8000));
  return btoa(s);
}
function b64ToBytes(b64){
  const s=atob(b64); const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i); return out;
}
async function loadTeamKey(){
  let raw=localStorage.getItem('borion_cnpj_team_key');
  if(!raw){ const bytes=crypto.getRandomValues(new Uint8Array(32)); raw=bytesToB64(bytes); localStorage.setItem('borion_cnpj_team_key',raw); }
  App.teamKey=await crypto.subtle.importKey('raw',b64ToBytes(raw),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return App.teamKey;
}
async function encryptBytes(input){
  if(!App.teamKey) await loadTeamKey();
  const data=input instanceof ArrayBuffer?input:input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},App.teamKey,data);
  return {v:1,iv:bytesToB64(iv),data:bytesToB64(cipher)};
}
async function decryptEnvelope(env){
  if(!App.teamKey) await loadTeamKey();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(env.iv)},App.teamKey,b64ToBytes(env.data));
  return plain;
}
async function encryptJson(obj){ return encryptBytes(new TextEncoder().encode(JSON.stringify(obj))); }
async function decryptJson(env){ return JSON.parse(new TextDecoder().decode(await decryptEnvelope(env))); }
async function saveLocal(){
  App.state.meta.updatedAt=nowISO();
  const env=await encryptJson(App.state);
  localStorage.setItem('borion_cnpj_state_enc',JSON.stringify(env));
  updateSyncUI(App.drive.connected?'ok':'local',App.drive.connected?'Google Drive conectado':'Modo local',App.drive.connected?'Alterações salvas localmente':'Salvamento neste navegador');
}
async function loadLocal(){
  await loadTeamKey();
  const raw=localStorage.getItem('borion_cnpj_state_enc');
  if(!raw){ App.state=blankState(); await saveLocal(); return; }
  try{ App.state=Object.assign(blankState(),await decryptJson(JSON.parse(raw))); }
  catch(err){ console.error(err); App.state=blankState(); toast('A chave deste dispositivo não abre os dados locais. Importe a chave da equipe.','error',6000); }
}
function scheduleSave(sync=true){
  clearTimeout(App.saveTimer); App.saveTimer=setTimeout(async()=>{ await saveLocal(); if(sync&&App.state.settings.autoSync&&App.drive.connected) scheduleSync(); },180);
}
function scheduleSync(){ clearTimeout(App.syncTimer); App.syncTimer=setTimeout(()=>Drive.sync().catch(e=>{console.error(e);toast('Falha ao sincronizar: '+e.message,'error',6000)}),1400); }

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('borion_cnpj_db',1);
    req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments',{keyPath:'id'}); };
    req.onsuccess=()=>{App.db=req.result;resolve(App.db)}; req.onerror=()=>reject(req.error);
  });
}
function idbTx(mode='readonly'){ return App.db.transaction('attachments',mode).objectStore('attachments'); }
async function storeAttachment(file){
  const id=uid(); const buf=await file.arrayBuffer(); const env=await encryptBytes(buf);
  const row={id,name:file.name||'arquivo',type:file.type||'application/octet-stream',size:file.size||buf.byteLength,iv:env.iv,data:env.data,createdAt:nowISO()};
  await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put(row);r.onsuccess=resolve;r.onerror=()=>reject(r.error)});
  return {id,name:row.name,type:row.type,size:row.size,createdAt:row.createdAt,driveFileId:'',driveName:'',pendingUpload:true,role:'documento'};
}
async function getAttachmentBlob(id){
  const row=await new Promise((resolve,reject)=>{const r=idbTx().get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  if(!row) throw new Error('Arquivo local não encontrado.');
  const plain=await decryptEnvelope({iv:row.iv,data:row.data});
  return new Blob([plain],{type:row.type});
}
async function deleteAttachmentLocal(id){ await new Promise((resolve,reject)=>{const r=idbTx('readwrite').delete(id);r.onsuccess=resolve;r.onerror=()=>reject(r.error)}); }
async function getAllAttachmentRows(){ return new Promise((resolve,reject)=>{const r=idbTx().getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)}); }

// ---------- Google Drive ----------
const Drive = {
  clientId(){ return localStorage.getItem('borion_cnpj_google_client_id') || CFG.googleClientId || ''; },
  requestToken(prompt=''){
    const clientId=this.clientId();if(!clientId)throw new Error('Google Client ID não configurado.');
    if(!window.google?.accounts?.oauth2)throw new Error('O Google ainda está carregando. Tente novamente em alguns segundos.');
    return new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'openid email profile https://www.googleapis.com/auth/drive',callback:resp=>resp.error?reject(new Error(resp.error)):resolve(resp)});App.drive.tokenClient=client;client.requestAccessToken({prompt});});
  },
  async login(){
    const clientId=this.clientId();
    if(!clientId){ openGoogleConfig(); return; }
    const resp=await this.requestToken('select_account'); App.drive.token=resp.access_token;
    const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');
    const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&& !allowed.includes(String(info.email).toLowerCase())) throw new Error('Esta conta não está autorizada.');
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''}; App.localMode=false; App.drive.connected=true;
    localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));
    await this.resolveRoot();
    showApp(); await this.sync(true); toast('Google Drive conectado.');
  },
  async api(url,opt={},retry=true){
    let res=await fetch(url,{...opt,headers:{Authorization:'Bearer '+App.drive.token,...(opt.headers||{})}});
    if(res.status===401&&retry){const fresh=await this.requestToken('');App.drive.token=fresh.access_token;return this.api(url,opt,false)}
    if(!res.ok){ const text=await res.text(); throw new Error('Google Drive '+res.status+': '+text.slice(0,240)); }
    if(res.status===204) return null;
    const ct=res.headers.get('content-type')||''; return ct.includes('application/json')?res.json():res.arrayBuffer();
  },
  q(value){return String(value).replace(/'/g,"\\'")},
  async findChild(parentId,name,mimeType=''){
    let q=`name='${this.q(name)}' and '${this.q(parentId)}' in parents and trashed=false`;
    if(mimeType) q+=` and mimeType='${mimeType}'`;
    const url='https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q='+encodeURIComponent(q);
    const data=await this.api(url); return data.files?.[0]||null;
  },
  async createFolder(parentId,name){
    const metadata={name,mimeType:'application/vnd.google-apps.folder'}; if(parentId) metadata.parents=[parentId];
    return this.api('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)});
  },
  async ensureFolder(parentId,name){ return (await this.findChild(parentId,name,'application/vnd.google-apps.folder')) || this.createFolder(parentId,name); },
  folderIdFromInput(value){
    const s=String(value||'').trim(); const m=s.match(/folders\/([a-zA-Z0-9_-]+)/); return m?m[1]:s;
  },
  async resolveRoot(){
    let rootId=this.folderIdFromInput(App.state.settings.rootFolderId||localStorage.getItem('borion_cnpj_root_folder_id')||'');
    if(rootId){
      try{ await this.api(`https://www.googleapis.com/drive/v3/files/${rootId}?supportsAllDrives=true&fields=id,name,mimeType`); }
      catch{ rootId=''; }
    }
    if(!rootId){
      const q=`name='${this.q(App.state.settings.rootFolderName||'Borion CNPJ')}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const data=await this.api('https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=20&fields=files(id,name)&q='+encodeURIComponent(q));
      rootId=data.files?.[0]?.id||'';
    }
    if(!rootId){ const folder=await this.createFolder('',App.state.settings.rootFolderName||'Borion CNPJ'); rootId=folder.id; }
    App.drive.rootId=rootId; App.state.settings.rootFolderId=rootId; localStorage.setItem('borion_cnpj_root_folder_id',rootId); await saveLocal();
    return rootId;
  },
  async uploadMultipart(parentId,name,blob,mimeType='application/octet-stream',existingId=''){
    const boundary='borion_'+Math.random().toString(16).slice(2);
    const metadata={name,mimeType}; if(parentId&&!existingId) metadata.parents=[parentId];
    const body=new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,blob,`\r\n--${boundary}--`
    ],{type:`multipart/related; boundary=${boundary}`});
    const url=existingId?`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&supportsAllDrives=true&fields=id,name,modifiedTime,webViewLink`:'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,modifiedTime,webViewLink';
    return this.api(url,{method:existingId?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  },
  async downloadFile(fileId){ return this.api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`); },
  async deleteFile(fileId){ if(!fileId)return; return this.api(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,{method:'DELETE'}); },
  async ensureStructure(){
    const root=App.drive.rootId||await this.resolveRoot();
    const system=await this.ensureFolder(root,'Sistema');
    await this.ensureFolder(system.id,'Backups');
    const cheques=await this.ensureFolder(root,'Cheques');
    const boletos=await this.ensureFolder(root,'Boletos');
    return {root,system:system.id,cheques:cheques.id,boletos:boletos.id};
  },
  async monthFolder(baseId,date){
    const d=new Date((date||todayISO())+'T12:00:00'); const year=String(d.getFullYear()); const month=String(d.getMonth()+1).padStart(2,'0')+' - '+MONTHS[d.getMonth()];
    const y=await this.ensureFolder(baseId,year); return (await this.ensureFolder(y.id,month)).id;
  },
  mergeState(local,remote){
    const merged=blankState(); merged.settings={...remote.settings,...local.settings};
    for(const key of ['fornecedores','cheques','boletos']){
      const map=new Map();
      for(const item of [...(remote[key]||[]),...(local[key]||[])]){
        const prev=map.get(item.id); if(!prev || String(item.updatedAt||'')>=String(prev.updatedAt||'')) map.set(item.id,item);
      }
      merged[key]=Array.from(map.values());
    }
    const audit=new Map(); for(const a of [...(remote.audit||[]),...(local.audit||[])]) audit.set(a.id,a);
    merged.audit=Array.from(audit.values()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,500);
    merged.deleted=Array.from(new Set([...(remote.deleted||[]),...(local.deleted||[])]));
    merged.meta={...remote.meta,...local.meta,updatedAt:nowISO()}; return merged;
  },
  async sync(forcePull=false){
    if(!App.drive.connected||App.drive.syncing) return;
    App.drive.syncing=true; updateSyncUI('busy','Sincronizando','Google Drive');
    try{
      const structure=await this.ensureStructure();
      let dataFile=await this.findChild(structure.system,'borion-cnpj.enc');
      let remote=null;
      if(dataFile){
        try{ remote=await decryptJson(JSON.parse(new TextDecoder().decode(await this.downloadFile(dataFile.id)))); }
        catch(err){ throw new Error('A chave da equipe não abre os dados do Drive. Importe a chave correta antes de sincronizar.'); }
      }
      if(remote) App.state=this.mergeState(forcePull?blankState():App.state,remote);
      await this.syncAttachments(structure);
      App.state.meta.updatedAt=nowISO();
      const env=await encryptJson(App.state); const blob=new Blob([JSON.stringify(env)],{type:'application/octet-stream'});
      dataFile=await this.uploadMultipart(structure.system,'borion-cnpj.enc',blob,'application/octet-stream',dataFile?.id||''); App.drive.dataFileId=dataFile.id;
      await saveLocal(); renderAll(); updateSyncUI('ok','Sincronizado','Agora · '+(App.user?.email||''));
    } finally { App.drive.syncing=false; }
  },
  async syncAttachments(structure){
    const records=[...active(App.state.cheques).map(x=>({type:'Cheque',record:x,base:structure.cheques})),...active(App.state.boletos).map(x=>({type:'Boleto',record:x,base:structure.boletos}))];
    for(const pack of records){
      for(const att of pack.record.attachments||[]){
        if(!att.pendingUpload||att.driveFileId) continue;
        let plain; try{plain=await getAttachmentBlob(att.id)}catch{continue}
        const env=await encryptBytes(await plain.arrayBuffer()); const encrypted=new Blob([JSON.stringify({v:1,name:att.name,type:att.type,iv:env.iv,data:env.data})],{type:'application/octet-stream'});
        const monthId=await this.monthFolder(pack.base,pack.record.createdAt?.slice(0,10)||pack.record.dataEmissao||pack.record.vencimento||todayISO());
        const safeNumber=(pack.record.numero||pack.record.documento||pack.record.id).replace(/[^a-zA-Z0-9_-]+/g,'_');
        const remoteName=`${safeNumber}_${att.role||'documento'}_${att.name}.borion`;
        const uploaded=await this.uploadMultipart(monthId,remoteName,encrypted,'application/octet-stream');
        att.driveFileId=uploaded.id;att.driveName=remoteName;att.pendingUpload=false;recordTouch(pack.record);
      }
    }
  },
  async fetchRemoteAttachment(att){
    if(!att.driveFileId) throw new Error('Documento não está no Drive.');
    const pack=JSON.parse(new TextDecoder().decode(await this.downloadFile(att.driveFileId)));
    const plain=await decryptEnvelope({iv:pack.iv,data:pack.data}); return new Blob([plain],{type:pack.type||att.type});
  }
};

// ---------- Janelas e formulários ----------
function openModal({title,subtitle='',body='',size='',saveLabel='',onSave=null,onDelete=null}){
  closeModal();
  const root=$('#modal-root');
  root.innerHTML=`<div class="modal-backdrop"><div class="modal ${size}">
    <div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="modal-close" type="button">×</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${onDelete?'<button type="button" class="btn btn-danger" data-modal-delete>Excluir</button>':'<span></span>'}<div class="right"><button type="button" class="btn btn-outline" data-modal-cancel>Cancelar</button>${onSave?`<button type="button" class="btn btn-primary" data-modal-save>${esc(saveLabel||'Salvar')}</button>`:''}</div></div>
  </div></div>`;
  const back=$('.modal-backdrop',root), modal=$('.modal',root);
  $('.modal-close',root).onclick=$('[data-modal-cancel]',root).onclick=closeModal;
  back.addEventListener('mousedown',e=>{if(e.target===back)closeModal()});
  if(onSave) $('[data-modal-save]',root).onclick=async()=>{ const btn=$('[data-modal-save]',root); try{btn.disabled=true;await onSave(modal,btn)}catch(e){console.error(e);toast(e.message||'Não foi possível salvar.','error',6000)}finally{btn.disabled=false} };
  if(onDelete) $('[data-modal-delete]',root).onclick=async()=>{if(confirm('Tem certeza que deseja excluir?')) await onDelete(modal)};
  return modal;
}
function closeModal(){ $('#modal-root').innerHTML=''; }
function field(name,label,value='',type='text',extra=''){
  return `<div class="field ${extra.includes('full')?'full':''}"><label for="f-${esc(name)}">${esc(label)}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra.replace('full','')}></div>`;
}
function selectField(name,label,options,value='',extra=''){
  return `<div class="field ${extra.includes('full')?'full':''}"><label for="f-${esc(name)}">${esc(label)}</label><select id="f-${esc(name)}" name="${esc(name)}" ${extra.replace('full','')}>${options.map(o=>{const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`}).join('')}</select></div>`;
}
function textArea(name,label,value='',extra='full'){
  return `<div class="field ${extra.includes('full')?'full':''}"><label for="f-${esc(name)}">${esc(label)}</label><textarea id="f-${esc(name)}" name="${esc(name)}">${esc(value)}</textarea></div>`;
}
function formDataObj(modal){ const out={}; $$('[name]',modal).forEach(el=>{out[el.name]=el.type==='checkbox'?el.checked:el.value}); return out; }
function supplierOptions(selected=''){
  const opts=[{value:'',label:'Selecione ou cadastre...'},...active(App.state.fornecedores).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(x=>({value:x.id,label:x.nome+(x.fantasia?' · '+x.fantasia:'') }))];
  return `<div class="field"><label for="f-fornecedorId">Fornecedor / pessoa</label><div style="display:flex;gap:6px"><select id="f-fornecedorId" name="fornecedorId" style="min-width:0">${opts.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(selected)?'selected':''}>${esc(o.label)}</option>`).join('')}</select><button type="button" class="btn btn-outline btn-sm" data-quick-supplier title="Cadastrar rapidamente">＋</button></div><div data-quick-supplier-box hidden style="margin-top:8px;padding:9px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02)"><input data-qs-name placeholder="Nome / razão social" style="margin-bottom:6px"><input data-qs-doc placeholder="CPF/CNPJ" style="margin-bottom:6px"><input data-qs-phone placeholder="Telefone"><button type="button" class="btn btn-primary btn-sm btn-block" data-qs-save>Salvar fornecedor</button></div></div>`;
}
function wireQuickSupplier(modal){
  const btn=$('[data-quick-supplier]',modal),box=$('[data-quick-supplier-box]',modal);if(!btn||!box)return;
  btn.onclick=()=>{box.hidden=!box.hidden;if(!box.hidden)$('[data-qs-name]',box).focus()};
  $('[data-qs-save]',box).onclick=()=>{const nome=$('[data-qs-name]',box).value.trim();if(!nome){toast('Informe o nome do fornecedor.','error');return}const item={id:uid(),tipo:'Pessoa jurídica',nome,cpfCnpj:$('[data-qs-doc]',box).value.trim(),telefone:$('[data-qs-phone]',box).value.trim(),fantasia:'',email:'',endereco:'',createdAt:nowISO()};recordTouch(item);App.state.fornecedores.push(item);const select=$('[name="fornecedorId"]',modal);select.insertAdjacentHTML('beforeend',`<option value="${item.id}">${esc(item.nome)}</option>`);select.value=item.id;box.hidden=true;logAudit('Fornecedor cadastrado',item.nome,'Fornecedor',item.id);scheduleSave();toast('Fornecedor adicionado à lista.')};
}
function attachmentDropHtml(accept='image/*,.pdf'){
  return `<div class="field full"><label>Fotos e documentos</label><div class="drop-zone" data-drop-zone><div class="drop-icon">⇧</div><b>Arraste fotos ou PDFs aqui</b><p>A foto selecionada ficará anexada ao registro depois da confirmação.</p><button type="button" class="btn btn-outline btn-sm" data-pick-files>Selecionar arquivos</button><input type="file" data-files hidden multiple accept="${esc(accept)}"></div><div class="attachment-grid" data-temp-attachments></div><div class="scan-progress" data-scan-progress hidden></div></div>`;
}
function wireDropZone(modal,onFiles){
  const zone=$('[data-drop-zone]',modal), input=$('[data-files]',modal);
  $('[data-pick-files]',modal).onclick=()=>input.click();
  input.onchange=()=>onFiles(Array.from(input.files||[]));
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag')}));
  zone.addEventListener('drop',e=>onFiles(Array.from(e.dataTransfer.files||[])));
}
function renderTempFiles(modal,tempFiles){
  const root=$('[data-temp-attachments]',modal); if(!root)return;
  root.innerHTML=tempFiles.map((x,i)=>`<div class="attachment-card"><button type="button" class="attachment-remove" data-remove-temp="${i}">×</button><div class="attachment-preview">${x.file.type.startsWith('image/')?`<img src="${x.url}" alt="">`:'<div class="pdf">PDF</div>'}</div><div class="attachment-info"><b>${esc(x.file.name)}</b><small>${sizeText(x.file.size)}</small><select data-temp-role="${i}" style="width:100%;margin-top:6px;background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:5px;font-size:9px">${['frente','verso','boleto','comprovante','documento'].map(r=>`<option ${x.role===r?'selected':''}>${r}</option>`).join('')}</select></div></div>`).join('');
  $$('[data-remove-temp]',root).forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.removeTemp);URL.revokeObjectURL(tempFiles[i].url);tempFiles.splice(i,1);renderTempFiles(modal,tempFiles)});
  $$('[data-temp-role]',root).forEach(sel=>sel.onchange=()=>{tempFiles[Number(sel.dataset.tempRole)].role=sel.value});
}
function existingAttachmentsHtml(record){
  const list=record.attachments||[];if(!list.length)return'';
  return `<div class="field full"><label>Documentos já anexados</label><div class="attachment-grid">${list.map((a,i)=>`<div class="attachment-card" data-existing-att="${i}"><button type="button" class="attachment-remove" data-remove-existing="${i}">×</button><div class="attachment-preview"><div class="pdf">${a.type?.startsWith('image/')?'IMG':'PDF'}</div></div><div class="attachment-info"><b>${esc(a.name)}</b><small>${esc(a.role||'documento')} · ${sizeText(a.size||0)}</small></div></div>`).join('')}</div></div>`;
}
function wireExistingRemovals(modal,record,removed){
  $$('[data-remove-existing]',modal).forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.removeExisting),att=(record.attachments||[])[i];if(!att)return;removed.push(att);$(`[data-existing-att="${i}"]`,modal)?.remove();});
}
async function attachFiles(record,tempFiles,defaultRole='documento'){
  record.attachments=record.attachments||[];
  for(const item of tempFiles){ const meta=await storeAttachment(item.file);meta.role=item.role||defaultRole;record.attachments.push(meta);URL.revokeObjectURL(item.url); }
}

// ---------- OCR e leitores ----------
async function pdfFirstPageToBlob(file){
  if(!window.pdfjsLib) throw new Error('Leitor de PDF não carregou. Verifique a internet.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise; const page=await pdf.getPage(1); const viewport=page.getViewport({scale:2});
  const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));
}
async function detectBarcode(file){
  if(!('BarcodeDetector' in window)||!file.type.startsWith('image/')) return '';
  try{
    const formats=await BarcodeDetector.getSupportedFormats(); const wanted=['itf','code_128','codabar'].filter(x=>formats.includes(x)); if(!wanted.length)return'';
    const detector=new BarcodeDetector({formats:wanted}); const bitmap=await createImageBitmap(file); const found=await detector.detect(bitmap); bitmap.close();
    return found.map(x=>x.rawValue).find(x=>[44,47,48].includes(digits(x).length))||found[0]?.rawValue||'';
  }catch{return''}
}
let ocrWorkerPromise=null,ocrProgressCallback=()=>{};
async function getOcrWorker(){
  if(ocrWorkerPromise)return ocrWorkerPromise;
  if(!window.Tesseract?.createWorker)throw new Error('OCR local não carregado.');
  const options={workerPath:'vendor/tesseract/worker.min.js',corePath:'vendor/tesseract/tesseract-core.wasm.js',langPath:'vendor/tesseract/lang-data',gzip:true,logger:m=>{if(m.status)ocrProgressCallback(`${m.status} ${m.progress?Math.round(m.progress*100)+'%':''}`)}};
  ocrWorkerPromise=(async()=>{try{return await Tesseract.createWorker('por',1,options)}catch(first){const worker=await Tesseract.createWorker(options);if(worker.load)await worker.load();if(worker.loadLanguage)await worker.loadLanguage('por');if(worker.initialize)await worker.initialize('por');return worker}})().catch(e=>{ocrWorkerPromise=null;throw e});
  return ocrWorkerPromise;
}
async function ocrFile(file,onProgress=()=>{}){
  let image=file; if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')) image=await pdfFirstPageToBlob(file);
  const barcode=await detectBarcode(image); onProgress('Lendo texto da imagem...');ocrProgressCallback=onProgress;
  const worker=await getOcrWorker();const result=await worker.recognize(image);ocrProgressCallback=()=>{};
  return {text:result.data?.text||'',barcode};
}
function mod10(number){
  let sum=0,m=2; for(let i=number.length-1;i>=0;i--){let p=Number(number[i])*m;if(p>9)p=Math.floor(p/10)+(p%10);sum+=p;m=m===2?1:2} const r=sum%10;return r===0?0:10-r;
}
function validateBoletoLine(line){
  const d=digits(line); const errors=[];
  if(![44,47,48].includes(d.length)) errors.push('O código precisa ter 44, 47 ou 48 dígitos.');
  if(d.length===47){ if(mod10(d.slice(0,9))!==Number(d[9]))errors.push('Dígito do campo 1 inválido.');if(mod10(d.slice(10,20))!==Number(d[20]))errors.push('Dígito do campo 2 inválido.');if(mod10(d.slice(21,31))!==Number(d[31]))errors.push('Dígito do campo 3 inválido.'); }
  return {valid:errors.length===0,digits:d,errors};
}
function boletoInfoFromDigits(line){
  const d=digits(line); const out={linhaDigitavel:d,valor:'',vencimento:''};
  if(d.length===47){
    const factor=Number(d.slice(33,37)); const amount=Number(d.slice(37,47))/100; if(amount)out.valor=amount.toFixed(2);
    if(factor>=1000){ const base=new Date('2025-02-22T12:00:00');base.setDate(base.getDate()+factor-1000);out.vencimento=base.toISOString().slice(0,10); }
  }
  return out;
}
function extractBoleto(text,barcode=''){
  const compact=String(text||'').replace(/[^0-9]/g,''); const candidates=[];
  if(barcode)candidates.push(digits(barcode));
  const spaced=String(text||'').match(/(?:\d[\s.\-]*){44,55}/g)||[]; spaced.forEach(x=>candidates.push(digits(x)));
  for(const n of [48,47,44]){ const hit=candidates.find(x=>x.length===n)||compact.match(new RegExp('\\d{'+n+'}'))?.[0]; if(hit)return boletoInfoFromDigits(hit); }
  return {linhaDigitavel:'',valor:'',vencimento:''};
}
function extractCheque(text){
  const clean=String(text||'').replace(/\s+/g,' '); const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const number=(clean.match(/\b([A-Z]{1,4})\s*[-.]?\s*(\d{5,10})\b/i)||[]); const money=[...clean.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map(x=>x[1]);
  const date=(clean.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{2,4})\b/)||[]);
  let iso=''; if(date.length){const y=date[3].length===2?'20'+date[3]:date[3];iso=`${y}-${date[2]}-${date[1]}`}
  return {numero:number.length?(number[1].toUpperCase()+' '+number[2]):'',valor:money.length?money[money.length-1].replace(/\./g,'').replace(',','.'):'',data:iso,ocrText:lines.slice(0,30).join('\n')};
}
async function scanIntoForm(modal,file,type){
  const progress=$('[data-scan-progress]',modal);progress.hidden=false;
  const result=await ocrFile(file,msg=>progress.textContent=msg);
  if(type==='boleto'){
    const found=extractBoleto(result.text,result.barcode); if(found.linhaDigitavel)$('[name="linhaDigitavel"]',modal).value=found.linhaDigitavel;if(found.valor)$('[name="valor"]',modal).value=found.valor;if(found.vencimento)$('[name="vencimento"]',modal).value=found.vencimento;
    progress.textContent=found.linhaDigitavel?'Código localizado. Confira os campos antes de salvar.':'Não encontrei a linha completa. O arquivo será anexado para conferência manual.';
  } else {
    const found=extractCheque(result.text); if(found.numero)$('[name="numero"]',modal).value=found.numero;if(found.valor)$('[name="valor"]',modal).value=found.valor;if(found.data)$('[name="dataEmissao"]',modal).value=found.data;
    progress.textContent=found.numero?'Número sugerido pelo OCR. Confira antes de salvar.':'A imagem foi lida, mas o número precisa ser conferido manualmente.';
  }
}

// ---------- Renderização ----------
function updateSyncUI(kind,label,detail){
  const dot=$('#sync-dot'); if(!dot)return; dot.className='sync-dot '+kind; $('#sync-label').textContent=label; $('#sync-detail').textContent=detail;
}
function setPage(page){
  App.page=page; $$('.sb-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page)); $$('.page').forEach(x=>x.classList.toggle('active',x.id==='page-'+page));
  const meta=PAGE_META[page]||PAGE_META.dashboard;$('#page-title').textContent=meta[0];$('#page-subtitle').textContent=meta[1]; renderPage(page);
}
function renderAll(){ renderDashboard();renderCheques();renderBoletos();renderFornecedores();renderAlertas();renderBackup();renderConfig(); }
function renderPage(page){ ({dashboard:renderDashboard,cheques:renderCheques,boletos:renderBoletos,fornecedores:renderFornecedores,alertas:renderAlertas,backup:renderBackup,config:renderConfig}[page]||renderDashboard)(); }
function upcomingRecords(){
  const arr=[];
  active(App.state.cheques).filter(x=>!['Compensado','Cancelado'].includes(x.status)).forEach(x=>x.dataBom&&arr.push({type:'Cheque',id:x.id,title:x.numero||'Sem número',party:supplierById(x.fornecedorId)?.nome||x.pessoa||'—',date:x.dataBom,value:x.valor,status:x.status}));
  active(App.state.boletos).filter(x=>!['Pago','Cancelado'].includes(x.status)).forEach(x=>x.vencimento&&arr.push({type:'Boleto',id:x.id,title:x.documento||x.beneficiario||'Boleto',party:supplierById(x.fornecedorId)?.nome||x.beneficiario||'—',date:x.vencimento,value:x.valor,status:x.status}));
  return arr.sort((a,b)=>a.date.localeCompare(b.date));
}
function alertRecords(){ return upcomingRecords().filter(x=>daysUntil(x.date)<=Number(App.state.settings.warningDays||7)); }
function renderDashboard(){
  const root=$('#page-dashboard'); if(!root)return;
  const cheques=active(App.state.cheques),boletos=active(App.state.boletos),openCh=cheques.filter(x=>!['Compensado','Cancelado'].includes(x.status)),openBo=boletos.filter(x=>!['Pago','Cancelado'].includes(x.status));
  const sum=a=>a.reduce((s,x)=>s+Number(x.valor||0),0), upcoming=upcomingRecords().slice(0,8), alerts=alertRecords();
  root.innerHTML=`<div class="kpi-grid">
    <div class="kpi gold"><div class="label">Cheques em aberto</div><div class="value">${brl(sum(openCh))}</div><div class="meta">${openCh.length} cheque(s)</div></div>
    <div class="kpi blue"><div class="label">Boletos em aberto</div><div class="value">${brl(sum(openBo))}</div><div class="meta">${openBo.length} boleto(s)</div></div>
    <div class="kpi green"><div class="label">Compensados e pagos</div><div class="value">${brl(sum(cheques.filter(x=>x.status==='Compensado'))+sum(boletos.filter(x=>x.status==='Pago')))}</div><div class="meta">Movimentação concluída</div></div>
    <div class="kpi red"><div class="label">Precisam de atenção</div><div class="value">${alerts.length}</div><div class="meta">Vencidos ou próximos</div></div>
  </div>
  <div class="page-toolbar"><div class="toolbar-left"><button class="btn btn-primary" onclick="Borion.newCheque()">＋ Novo cheque</button><button class="btn btn-outline" onclick="Borion.newBoleto()">＋ Novo boleto</button><button class="btn btn-outline" onclick="Borion.newLote()">Gerar cheques em lote</button></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.organizePhotos()">Organizar fotos de cheques</button></div></div>
  <div class="grid-2"><section class="panel"><div class="panel-head"><div class="panel-title">Próximos vencimentos</div><button class="action-btn" onclick="Borion.go('alertas')">Ver alertas</button></div><div class="panel-body">${upcoming.length?`<div class="quick-list">${upcoming.map(x=>`<div class="quick-item"><div><b>${esc(x.type)} · ${esc(x.title)}</b><small>${esc(x.party)}</small></div><div class="quick-date"><b>${fmtDate(x.date)}</b><small>${brl(x.value)}</small></div></div>`).join('')}</div>`:`<div class="empty"><div class="orb">✓</div><b>Nenhum vencimento cadastrado</b><p>Cadastre cheques e boletos para acompanhar por aqui.</p></div>`}</div></section>
  <section class="panel"><div class="panel-head"><div class="panel-title">Atividade recente</div></div><div class="panel-body">${App.state.audit.length?`<div class="quick-list">${App.state.audit.slice(0,7).map(a=>`<div class="quick-item"><div><b>${esc(a.action)}</b><small>${esc(a.detail)}</small></div><div class="quick-date"><small>${fmtDateTime(a.createdAt)}</small></div></div>`).join('')}</div>`:`<div class="empty"><div class="orb">◈</div><b>O histórico começa aqui</b><p>As alterações feitas por você e seu pai aparecerão nesta área.</p></div>`}</div></section></div>`;
}
function chequeMatches(x,q){ const s=normalize([x.numero,x.banco,x.status,x.pessoa,supplierById(x.fornecedorId)?.nome,x.cpfCnpj,x.lote].join(' '));return!q||s.includes(normalize(q)); }
function renderCheques(){
  const root=$('#page-cheques');if(!root)return; let items=active(App.state.cheques).filter(x=>chequeMatches(x,App.search.cheques));
  if(App.chequeTab==='emitidos')items=items.filter(x=>x.tipo==='Emitido'); if(App.chequeTab==='recebidos')items=items.filter(x=>x.tipo==='Recebido');if(App.chequeTab==='abertos')items=items.filter(x=>!['Compensado','Cancelado'].includes(x.status));
  items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar número, fornecedor, banco..." data-search-cheques></div><div class="tabs">${[['todos','Todos'],['emitidos','Emitidos'],['recebidos','Recebidos'],['abertos','Em aberto']].map(([v,l])=>`<button class="tab ${App.chequeTab===v?'active':''}" onclick="Borion.chequeTab('${v}')">${l}</button>`).join('')}</div></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.organizePhotos()">Fotos em massa</button><button class="btn btn-outline" onclick="Borion.newLote()">Cheques em lote</button><button class="btn btn-primary" onclick="Borion.newCheque()">＋ Novo cheque</button></div></div>
  ${items.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Número</th><th>Entregue por / para</th><th>Banco</th><th>Valor</th><th>Emissão</th><th>Bom para</th><th>Status</th><th>Imagem</th><th>Ações</th></tr></thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><span class="badge ${x.tipo==='Recebido'?'received':'open'}">${esc(x.tipo)}</span></td><td><b>${esc(x.numero||'—')}</b>${x.lote?`<div class="muted">${esc(x.lote)}</div>`:''}</td><td>${esc(sup?.nome||x.pessoa||'—')}</td><td>${esc(x.banco||'—')}</td><td class="money">${brl(x.valor)}</td><td>${fmtDate(x.dataEmissao)}</td><td class="${daysUntil(x.dataBom)<0&&!['Compensado','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.dataBom)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem foto</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editCheque('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody></table></div>`:`<div class="panel"><div class="empty"><div class="orb">▣</div><b>Nenhum cheque encontrado</b><p>Cadastre um cheque individual ou gere uma sequência em lote.</p><button class="btn btn-primary" onclick="Borion.newCheque()">Cadastrar cheque</button></div></div>`}`;
  $('[data-search-cheques]',root).oninput=e=>{App.search.cheques=e.target.value;renderCheques()};
}
function boletoMatches(x,q){ const s=normalize([x.documento,x.beneficiario,x.status,x.linhaDigitavel,supplierById(x.fornecedorId)?.nome,x.cpfCnpj].join(' '));return!q||s.includes(normalize(q)); }
function renderBoletos(){
  const root=$('#page-boletos');if(!root)return;let items=active(App.state.boletos).filter(x=>boletoMatches(x,App.search.boletos));if(App.boletoTab==='abertos')items=items.filter(x=>!['Pago','Cancelado'].includes(x.status));if(App.boletoTab==='pagos')items=items.filter(x=>x.status==='Pago');if(App.boletoTab==='vencidos')items=items.filter(x=>x.vencimento&&daysUntil(x.vencimento)<0&&!['Pago','Cancelado'].includes(x.status));items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.boletos)}" placeholder="Buscar beneficiário, documento, código..." data-search-boletos></div><div class="tabs">${[['todos','Todos'],['abertos','Em aberto'],['pagos','Pagos'],['vencidos','Vencidos']].map(([v,l])=>`<button class="tab ${App.boletoTab===v?'active':''}" onclick="Borion.boletoTab('${v}')">${l}</button>`).join('')}</div></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.focusBarcode()">Usar leitor USB</button><button class="btn btn-primary" onclick="Borion.newBoleto()">＋ Novo boleto</button></div></div>
  ${items.length?`<div class="table-wrap"><table><thead><tr><th>Beneficiário / fornecedor</th><th>Documento</th><th>Linha digitável</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Arquivo</th><th>Ações</th></tr></thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><b>${esc(sup?.nome||x.beneficiario||'—')}</b><div class="muted">${esc(x.cpfCnpj||'')}</div></td><td>${esc(x.documento||'—')}</td><td><span title="${esc(x.linhaDigitavel||'')}">${x.linhaDigitavel?esc(x.linhaDigitavel.slice(0,18))+'…':'—'}</span></td><td class="money">${brl(x.valor)}</td><td class="${x.vencimento&&daysUntil(x.vencimento)<0&&!['Pago','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.vencimento)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewBoleto('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem arquivo</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewBoleto('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editBoleto('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody></table></div>`:`<div class="panel"><div class="empty"><div class="orb">▤</div><b>Nenhum boleto encontrado</b><p>Envie uma foto ou PDF para o Borion tentar preencher os dados.</p><button class="btn btn-primary" onclick="Borion.newBoleto()">Cadastrar boleto</button></div></div>`}`;
  $('[data-search-boletos]',root).oninput=e=>{App.search.boletos=e.target.value;renderBoletos()};
}
function renderFornecedores(){
  const root=$('#page-fornecedores');if(!root)return;let list=active(App.state.fornecedores).filter(x=>!App.search.fornecedores||normalize([x.nome,x.fantasia,x.cpfCnpj,x.telefone,x.email].join(' ')).includes(normalize(App.search.fornecedores))).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.fornecedores)}" placeholder="Buscar nome, CPF/CNPJ, telefone..." data-search-fornecedores></div></div><div class="toolbar-right"><button class="btn btn-primary" onclick="Borion.newFornecedor()">＋ Novo fornecedor</button></div></div>
  ${list.length?`<div class="supplier-grid">${list.map(x=>{const related=[...active(App.state.cheques).filter(c=>c.fornecedorId===x.id),...active(App.state.boletos).filter(b=>b.fornecedorId===x.id)];const total=related.reduce((s,r)=>s+Number(r.valor||0),0);return`<div class="supplier-card"><div class="supplier-top"><div class="supplier-avatar">${esc(initials(x.nome))}</div><button class="action-btn" onclick="Borion.editFornecedor('${x.id}')">Editar</button></div><h3>${esc(x.nome)}</h3><div class="fantasy">${esc(x.fantasia||x.tipo||'Fornecedor')}</div><div class="supplier-meta"><div><span>CPF/CNPJ</span><b>${esc(x.cpfCnpj||'—')}</b></div><div><span>Telefone</span><b>${esc(x.telefone||'—')}</b></div><div><span>Movimentações</span><b>${related.length}</b></div><div><span>Total histórico</span><b>${brl(total)}</b></div></div><button class="btn btn-outline btn-sm btn-block" onclick="Borion.viewFornecedor('${x.id}')">Ver histórico</button></div>`}).join('')}</div>`:`<div class="panel"><div class="empty"><div class="orb">◆</div><b>Nenhum fornecedor cadastrado</b><p>Cadastre uma pessoa ou empresa para selecionar rapidamente nos cheques.</p><button class="btn btn-primary" onclick="Borion.newFornecedor()">Novo fornecedor</button></div></div>`}`;
  $('[data-search-fornecedores]',root).oninput=e=>{App.search.fornecedores=e.target.value;renderFornecedores()};
}
function renderAlertas(){
  const root=$('#page-alertas');if(!root)return;const list=alertRecords();$('#alert-count').hidden=!list.length;$('#alert-count').textContent=list.length;
  root.innerHTML=`<div class="panel"><div class="panel-head"><div class="panel-title">Vencidos e próximos ${App.state.settings.warningDays||7} dias</div></div><div class="panel-body">${list.length?`<div class="alert-list">${list.map(x=>{const days=daysUntil(x.date);return`<div class="alert-item"><div class="alert-icon">!</div><div><b>${esc(x.type)} · ${esc(x.title)}</b><p>${esc(x.party)} · ${days<0?Math.abs(days)+' dia(s) vencido':days===0?'vence hoje':'vence em '+days+' dia(s)'}</p></div><div class="alert-value"><b>${brl(x.value)}</b><small>${fmtDate(x.date)}</small></div></div>`}).join('')}</div>`:`<div class="empty"><div class="orb">✓</div><b>Nenhuma pendência próxima</b><p>Os próximos vencimentos aparecerão automaticamente aqui.</p></div>`}</div></div>`;
}
function renderBackup(){
  const root=$('#page-backup');if(!root)return;
  root.innerHTML=`<div class="grid-2"><section class="panel"><div class="panel-head"><div class="panel-title">Backup completo</div></div><div class="panel-body"><div class="config-section"><h3>Exportar todos os dados</h3><p>Gera um arquivo ZIP com os dados e todos os anexos descriptografados. Guarde em local seguro.</p><button class="btn btn-primary" onclick="Borion.exportBackup()">⇩ Exportar backup completo</button></div><div class="config-section"><h3>Restaurar backup</h3><p>Importa um backup gerado por este Borion. Os registros atuais serão mesclados pelo identificador.</p><button class="btn btn-outline" onclick="Borion.importBackup()">Selecionar backup ZIP</button></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Chave da equipe</div></div><div class="panel-body"><div class="config-section"><h3>Recuperação e novo computador</h3><p>Seu pai precisa importar a mesma chave uma única vez para abrir os arquivos criptografados no Drive. Não é uma senha mestra.</p><button class="btn btn-outline" onclick="Borion.exportTeamKey()">Exportar chave da equipe</button><button class="btn btn-outline btn-block" onclick="Borion.importTeamKey()">Importar chave da equipe</button></div><div class="status-line"><span class="sync-dot ok"></span><div><b>Criptografia AES-256-GCM</b><small>Dados e anexos são enviados criptografados ao Drive.</small></div></div></div></section></div>`;
}
function renderConfig(){
  const root=$('#page-config');if(!root)return;const client=Drive.clientId();
  root.innerHTML=`<div class="config-section"><h3>Google OAuth e contas</h3><p>O Client ID identifica o site para o Google. Ele não é uma senha e pode ficar no GitHub.</p><div class="form-grid"><div class="field full"><label>Google OAuth Client ID</label><input id="cfg-client-id" value="${esc(client)}" placeholder="000000000000-xxxx.apps.googleusercontent.com"></div></div><button class="btn btn-primary" onclick="Borion.saveGoogleConfig()">Salvar configuração</button>${App.drive.connected?'<button class="btn btn-outline" onclick="Borion.reconnectGoogle()">Trocar conta Google</button>':''}</div>
  <div class="config-section"><h3>Pasta oficial no Google Drive</h3><p>Use o link ou ID da pasta compartilhada pelo seu pai. Se ficar vazio, o Borion procura ou cria uma pasta “Borion CNPJ”.</p><div class="form-grid"><div class="field full"><label>Link ou ID da pasta raiz</label><input id="cfg-root-id" value="${esc(App.state.settings.rootFolderId||'')}" placeholder="https://drive.google.com/drive/folders/..."></div><div class="field"><label>Nome da empresa</label><input id="cfg-company" value="${esc(App.state.settings.companyName||'Borion CNPJ')}"></div><div class="field"><label>Dias de antecedência dos alertas</label><input id="cfg-warning" type="number" min="1" max="90" value="${esc(App.state.settings.warningDays||7)}"></div></div><label class="checkbox-row"><input id="cfg-auto-sync" type="checkbox" ${App.state.settings.autoSync?'checked':''}> Sincronizar automaticamente depois de cada alteração</label><div style="height:12px"></div><button class="btn btn-primary" onclick="Borion.saveDriveConfig()">Salvar pasta e preferências</button>${App.drive.connected?'<button class="btn btn-outline" onclick="Borion.prepareDrive()">Criar/verificar estrutura agora</button>':''}</div>
  <div class="config-section"><h3>Estrutura usada pelo Borion</h3><p>As pastas de ano e mês são criadas automaticamente conforme os documentos forem enviados.</p><div class="code-path">Borion CNPJ / Cheques / 2026 / 08 - Agosto<br>Borion CNPJ / Boletos / 2026 / 08 - Agosto<br>Borion CNPJ / Sistema / borion-cnpj.enc</div></div>`;
}

// ---------- CRUD de fornecedores ----------
function openFornecedor(id=''){
  const existing=id?active(App.state.fornecedores).find(x=>x.id===id):null;const x=existing||{tipo:'Pessoa jurídica'};
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Pessoa jurídica','Pessoa física'],x.tipo)}${field('nome','Nome / razão social',x.nome||'','text','required')}${field('fantasia','Nome fantasia',x.fantasia||'')}${field('cpfCnpj','CPF / CNPJ',x.cpfCnpj||'')}${field('telefone','Telefone / WhatsApp',x.telefone||'')}${field('email','E-mail',x.email||'','email')}${field('cep','CEP',x.cep||'')}${field('cidade','Cidade',x.cidade||'')}${field('uf','Estado',x.uf||'')}${field('endereco','Endereço completo',x.endereco||'','text','full')}${textArea('observacoes','Observações',x.observacoes||'')}</div>`;
  openModal({title:existing?'Editar fornecedor':'Novo fornecedor',subtitle:'Os dados ficam disponíveis na seleção rápida de cheques e boletos.',body,saveLabel:existing?'Salvar alterações':'Cadastrar fornecedor',onSave:async modal=>{const v=formDataObj(modal);if(!v.nome.trim())throw new Error('Informe o nome ou razão social.');const item=existing||{id:uid(),createdAt:nowISO()};Object.assign(item,v);recordTouch(item);if(!existing)App.state.fornecedores.push(item);logAudit(existing?'Fornecedor atualizado':'Fornecedor cadastrado',item.nome,'Fornecedor',item.id);scheduleSave();closeModal();renderAll();toast('Fornecedor salvo.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Fornecedor excluído',existing.nome,'Fornecedor',existing.id);scheduleSave();closeModal();renderAll()}:null});
}
function viewFornecedor(id){
  const x=supplierById(id);if(!x)return;const cheques=active(App.state.cheques).filter(c=>c.fornecedorId===id),boletos=active(App.state.boletos).filter(b=>b.fornecedorId===id);const rows=[...cheques.map(r=>({...r,_type:'Cheque',_date:r.dataBom})),...boletos.map(r=>({...r,_type:'Boleto',_date:r.vencimento}))].sort((a,b)=>String(b._date).localeCompare(String(a._date)));
  const body=`<div class="detail-box"><h4>Dados</h4>${[['Razão social / nome',x.nome],['Nome fantasia',x.fantasia],['CPF/CNPJ',x.cpfCnpj],['Telefone',x.telefone],['E-mail',x.email],['Endereço',[x.endereco,x.cidade,x.uf].filter(Boolean).join(' · ')]].map(([a,b])=>`<div class="detail-row"><span>${a}</span><b>${esc(b||'—')}</b></div>`).join('')}</div><div style="height:12px"></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Número/documento</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r._type}</td><td>${esc(r.numero||r.documento||'—')}</td><td>${fmtDate(r._date)}</td><td class="money">${brl(r.valor)}</td><td><span class="badge ${statusClass(r.status)}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><b>Sem movimentações</b><p>Este fornecedor ainda não está vinculado a cheques ou boletos.</p></div>`}`;
  openModal({title:x.nome,subtitle:`${rows.length} movimentação(ões) · ${brl(rows.reduce((s,r)=>s+Number(r.valor||0),0))}`,body,size:'large'});
}

// ---------- CRUD de cheques ----------
function openCheque(id=''){
  const existing=id?active(App.state.cheques).find(x=>x.id===id):null;const x=existing||{tipo:'Emitido',status:'Em aberto',dataEmissao:todayISO(),dataBom:todayISO(),valor:'',attachments:[]};const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],x.tipo)}${field('numero','Número do cheque',x.numero||'')}${field('valor','Valor',x.valor||'','number','step="0.01" min="0"')}${supplierOptions(x.fornecedorId||'')}${field('pessoa','Nome livre (opcional)',x.pessoa||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${field('banco','Banco / conta',x.banco||'')}${field('agencia','Agência',x.agencia||'')}${field('conta','Conta',x.conta||'')}${field('cmc7','CMC7',x.cmc7||'')}${field('dataEmissao','Data de emissão/recebimento',x.dataEmissao||todayISO(),'date')}${field('dataBom','Bom para / vencimento',x.dataBom||todayISO(),'date')}${selectField('status','Status',['Em aberto','Compensado','Devolvido','Cancelado'],x.status)}${field('lote','Lote',x.lote||'')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({title:existing?'Editar cheque':'Novo cheque',subtitle:'Cadastre os dados e anexe frente, verso ou comprovantes.',body,saveLabel:existing?'Salvar alterações':'Cadastrar cheque',onSave:async modal=>{const v=formDataObj(modal);if(!v.numero.trim())throw new Error('Informe o número do cheque.');const item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};Object.assign(item,v,{valor:Number(v.valor)||0});item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}recordTouch(item);await attachFiles(item,temp,'frente');if(!existing)App.state.cheques.push(item);logAudit(existing?'Cheque atualizado':'Cheque cadastrado',`${item.numero} · ${brl(item.valor)}`,'Cheque',item.id);scheduleSave();closeModal();renderAll();toast('Cheque salvo.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Cheque excluído',existing.numero,'Cheque',existing.id);scheduleSave();closeModal();renderAll()}:null});
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);
  wireDropZone(modal,files=>{files.filter(f=>f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')).forEach(file=>temp.push({file,url:URL.createObjectURL(file),role:'frente'}));renderTempFiles(modal,temp);if(temp.length){const progress=$('[data-scan-progress]',modal);progress.hidden=false;progress.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo e sugerir dados</button>'; $('[data-scan-now]',modal).onclick=()=>scanIntoForm(modal,temp[0].file,'cheque').catch(e=>toast(e.message,'error',6000));}});
}
function parseChequeSequence(first,count){
  const m=String(first||'').trim().match(/^(.*?)(\d+)$/);if(!m)throw new Error('O primeiro número precisa terminar em números, por exemplo SU 105120.');const prefix=m[1],base=Number(m[2]),pad=m[2].length;return Array.from({length:count},(_,i)=>prefix+String(base+i).padStart(pad,'0'));
}
function parseDaySequence(text,count){
  let arr=String(text||'').split(/[,;\s]+/).map(Number).filter(Number.isFinite);if(!arr.length)arr=[30];if(arr.length===1)return Array.from({length:count},(_,i)=>arr[0]*(i+1));const step=arr.length>1?arr[arr.length-1]-arr[arr.length-2]:30;while(arr.length<count)arr.push(arr[arr.length-1]+(step||30));return arr.slice(0,count);
}
function openLote(){
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],'Emitido')}${field('primeiroNumero','Primeiro número','SU 105120','','required')}${field('quantidade','Quantidade','5','number','min="1" max="120"')}${supplierOptions('')}${field('banco','Banco / conta','')}${field('valor','Valor de cada cheque','','number','step="0.01" min="0"')}${field('dataBase','Data base',todayISO(),'date')}${field('prazos','Prazos em dias','30, 45, 60','text','full')}<div class="field full"><div class="field-help">Exemplo: 30, 45, 60. Se houver mais cheques, o Borion continua 75, 90... Você poderá editar individualmente depois.</div></div>${field('nomeLote','Nome do lote','Lote '+new Date().toLocaleDateString('pt-BR'),'text','full')}${textArea('observacoes','Observações','')}</div><div id="lote-preview"></div>`;
  const modal=openModal({title:'Gerar cheques em lote',subtitle:'Numeração sequencial e datas calculadas automaticamente.',body,size:'large',saveLabel:'Gerar cheques',onSave:async modal=>{const v=formDataObj(modal),q=Math.max(1,Math.min(120,Number(v.quantidade)||1)),nums=parseChequeSequence(v.primeiroNumero,q),ds=parseDaySequence(v.prazos,q);for(let i=0;i<q;i++){const item={id:uid(),tipo:v.tipo,status:'Em aberto',numero:nums[i],fornecedorId:v.fornecedorId,pessoa:'',cpfCnpj:'',banco:v.banco,valor:Number(v.valor)||0,dataEmissao:v.dataBase,dataBom:addDays(v.dataBase,ds[i]),lote:v.nomeLote,observacoes:v.observacoes,attachments:[],createdAt:nowISO()};recordTouch(item);App.state.cheques.push(item)}logAudit('Lote de cheques criado',`${q} cheques · ${v.nomeLote}`,'Lote','');scheduleSave();closeModal();App.chequeTab=v.tipo==='Emitido'?'emitidos':'recebidos';setPage('cheques');toast(`${q} cheques gerados.`);}});
  wireQuickSupplier(modal);
  const update=()=>{try{const v=formDataObj(modal),q=Math.max(1,Math.min(20,Number(v.quantidade)||1)),nums=parseChequeSequence(v.primeiroNumero,q),ds=parseDaySequence(v.prazos,q);$('#lote-preview',modal).innerHTML=`<div style="height:14px"></div><div class="table-wrap"><table><thead><tr><th>Número</th><th>Prazo</th><th>Data calculada</th><th>Valor</th></tr></thead><tbody>${nums.map((n,i)=>`<tr><td><b>${esc(n)}</b></td><td>${ds[i]} dias</td><td>${fmtDate(addDays(v.dataBase,ds[i]))}</td><td class="money">${brl(v.valor)}</td></tr>`).join('')}</tbody></table></div>`;}catch{$('#lote-preview',modal).innerHTML=''}};
  $$('[name="primeiroNumero"],[name="quantidade"],[name="dataBase"],[name="prazos"],[name="valor"]',modal).forEach(x=>x.addEventListener('input',update));update();
}

// ---------- CRUD de boletos ----------
function openBoleto(id=''){
  const existing=id?active(App.state.boletos).find(x=>x.id===id):null;const x=existing||{status:'Em aberto',vencimento:todayISO(),valor:'',attachments:[]};const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${supplierOptions(x.fornecedorId||'')}${field('beneficiario','Beneficiário / nome livre',x.beneficiario||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${field('documento','Número do documento',x.documento||'')}${field('nossoNumero','Nosso número',x.nossoNumero||'')}${field('banco','Banco',x.banco||'')}${field('valor','Valor original',x.valor||'','number','step="0.01" min="0"')}${field('vencimento','Vencimento',x.vencimento||todayISO(),'date')}${selectField('status','Status',['Em aberto','Pago','Vencido','Cancelado'],x.status)}${field('juros','Juros',x.juros||'','number','step="0.01" min="0"')}${field('multa','Multa',x.multa||'','number','step="0.01" min="0"')}${field('desconto','Desconto',x.desconto||'','number','step="0.01" min="0"')}${field('linhaDigitavel','Linha digitável / código de barras',x.linhaDigitavel||'','text','full autocomplete="off"')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({title:existing?'Editar boleto':'Novo boleto',subtitle:'Envie uma foto ou PDF para tentar preencher código, valor e vencimento.',body,saveLabel:existing?'Salvar alterações':'Cadastrar boleto',onSave:async modal=>{const v=formDataObj(modal);if(!v.linhaDigitavel.trim()&&!temp.length&&!existing?.attachments?.length)throw new Error('Informe a linha digitável ou anexe uma foto/PDF.');const validation=v.linhaDigitavel?validateBoletoLine(v.linhaDigitavel):{valid:true,errors:[]};if(v.linhaDigitavel&&!validation.valid&&!confirm('A linha digitável apresenta aviso: '+validation.errors.join(' ')+' Salvar mesmo assim?'))return;const item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};Object.assign(item,v,{valor:Number(v.valor)||0,juros:Number(v.juros)||0,multa:Number(v.multa)||0,desconto:Number(v.desconto)||0,linhaDigitavel:digits(v.linhaDigitavel)});item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}recordTouch(item);await attachFiles(item,temp,'boleto');if(!existing)App.state.boletos.push(item);logAudit(existing?'Boleto atualizado':'Boleto cadastrado',`${item.documento||item.beneficiario||'Boleto'} · ${brl(item.valor)}`,'Boleto',item.id);scheduleSave();closeModal();renderAll();toast('Boleto salvo.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Boleto excluído',existing.documento||existing.beneficiario,'Boleto',existing.id);scheduleSave();closeModal();renderAll()}:null});
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);
  const line=$('[name="linhaDigitavel"]',modal);line.addEventListener('input',()=>{const info=boletoInfoFromDigits(line.value);if(info.valor&&!$('[name="valor"]',modal).value)$('[name="valor"]',modal).value=info.valor;if(info.vencimento&&!$('[name="vencimento"]',modal).value)$('[name="vencimento"]',modal).value=info.vencimento});
  wireDropZone(modal,files=>{files.filter(f=>f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')).forEach(file=>temp.push({file,url:URL.createObjectURL(file),role:'boleto'}));renderTempFiles(modal,temp);if(temp.length){const progress=$('[data-scan-progress]',modal);progress.hidden=false;progress.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo agora</button>'; $('[data-scan-now]',modal).onclick=()=>scanIntoForm(modal,temp[0].file,'boleto').catch(e=>toast(e.message,'error',6000));}});
}
function focusBarcode(){ openBoleto();setTimeout(()=>$('#modal-root [name="linhaDigitavel"]')?.focus(),120); }

// ---------- Visualização de documentos ----------
async function attachmentBlob(att){
  try{return await getAttachmentBlob(att.id)}catch(localErr){if(att.driveFileId&&App.drive.connected)return Drive.fetchRemoteAttachment(att);throw localErr}
}
async function showViewer(record,type){
  const atts=record.attachments||[];const party=supplierById(record.fornecedorId)?.nome||record.pessoa||record.beneficiario||'—';
  const body=`<div class="viewer-layout"><div><div class="document-viewer" data-doc-viewer>${atts.length?'<div class="muted">Carregando documento...</div>':'<div class="empty"><div class="orb">▣</div><b>Sem documento anexado</b><p>Edite o registro para adicionar foto ou PDF.</p></div>'}</div>${atts.length>1?`<div class="attachment-grid" data-viewer-thumbs></div>`:''}</div><div class="viewer-side"><div class="detail-box"><h4>${esc(type)}</h4>${[['Número / documento',record.numero||record.documento],['Fornecedor / pessoa',party],['Valor',brl(record.valor)],['Data',fmtDate(record.dataBom||record.vencimento)],['Status',record.status],['Banco',record.banco],['Lote',record.lote]].filter(x=>x[1]).map(([a,b])=>`<div class="detail-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><div class="detail-box"><h4>Documentos</h4>${atts.length?atts.map((a,i)=>`<div class="detail-row"><span>${esc(a.role||'documento')}</span><b><button class="action-btn" data-open-att="${i}">${esc(a.name)}</button></b></div>`).join(''):'<div class="muted">Nenhum anexo.</div>'}</div><button class="btn btn-outline" data-download-current ${atts.length?'':'disabled'}>Baixar documento aberto</button></div></div>`;
  const modal=openModal({title:type==='Cheque'?`Cheque ${record.numero||''}`:(record.documento||record.beneficiario||'Boleto'),subtitle:'Visualização protegida dentro do Borion.',body,size:'large'});let current=0,currentUrl='';
  const openAtt=async index=>{current=index;const att=atts[index];if(!att)return;const viewer=$('[data-doc-viewer]',modal);viewer.innerHTML='<div class="muted">Abrindo documento...</div>';try{const blob=await attachmentBlob(att);if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(blob);viewer.innerHTML=blob.type==='application/pdf'?`<iframe src="${currentUrl}" title="PDF"></iframe>`:`<img src="${currentUrl}" alt="${esc(att.name)}">`;}catch(e){viewer.innerHTML=`<div class="empty"><b>Não foi possível abrir</b><p>${esc(e.message)}</p></div>`}};
  $$('[data-open-att]',modal).forEach(b=>b.onclick=()=>openAtt(Number(b.dataset.openAtt)));$('[data-download-current]',modal)?.addEventListener('click',async()=>{const att=atts[current];if(!att)return;const blob=await attachmentBlob(att);downloadBlob(blob,att.name)});if(atts.length)openAtt(0);
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name||'arquivo';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}

// ---------- Organização de fotos em massa ----------
const Organizer={modal:null,photos:new Map(),assignments:new Map(),cheques:[],dragId:'',
  async open(){
    this.photos.clear();this.assignments.clear();this.cheques=active(App.state.cheques).filter(x=>!['Compensado','Cancelado'].includes(x.status)).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true}));
    if(!this.cheques.length){toast('Crie primeiro os cheques do lote.','error');return}
    const body=`<div class="page-toolbar"><div class="toolbar-left"><button class="btn btn-primary" data-org-pick>Selecionar fotos</button><button class="btn btn-outline" data-org-analyze>Analisar e associar automaticamente</button></div><div class="toolbar-right"><span class="muted" data-org-status>Nenhuma foto selecionada</span></div></div><input type="file" data-org-files accept="image/*" multiple hidden><div class="organizer"><div class="unmatched" data-unmatched><h3>Fotos não identificadas</h3><div class="organizer-list" data-unmatched-list></div></div><div class="cheque-slots" data-cheque-slots></div></div>`;
    this.modal=openModal({title:'Organizar fotos dos cheques',subtitle:'Arraste cada foto para a frente ou o verso do cheque correto.',body,size:'large',saveLabel:'Confirmar associações',onSave:()=>this.save()});
    const input=$('[data-org-files]',this.modal);$('[data-org-pick]',this.modal).onclick=()=>input.click();input.onchange=()=>this.addFiles(Array.from(input.files||[]));$('[data-org-analyze]',this.modal).onclick=()=>this.analyze();this.render();
  },
  addFiles(files){for(const file of files.filter(f=>f.type.startsWith('image/'))){const id=uid();this.photos.set(id,{id,file,url:URL.createObjectURL(file),text:'',suggestion:''})}this.autoByFilename();this.render()},
  autoByFilename(){for(const p of this.photos.values()){if(this.assignments.has(p.id))continue;const name=digits(p.file.name);const ch=this.cheques.find(c=>{const n=digits(c.numero);return n&&name.includes(n)});if(ch)this.assign(p.id,ch.id,this.firstEmptyRole(ch.id))}},
  firstEmptyRole(chequeId){const vals=[...this.assignments.values()].filter(x=>x.chequeId===chequeId).map(x=>x.role);return vals.includes('frente')?'verso':'frente'},
  assign(photoId,chequeId,role){this.assignments.set(photoId,{chequeId,role});this.render()},unassign(photoId){this.assignments.delete(photoId);this.render()},
  render(){if(!this.modal)return;const un=$('[data-unmatched-list]',this.modal);const slots=$('[data-cheque-slots]',this.modal);const unmatched=[...this.photos.values()].filter(p=>!this.assignments.has(p.id));un.innerHTML=unmatched.length?unmatched.map(p=>this.photoHtml(p)).join(''):'<div class="muted" style="font-size:10px;padding:10px">Nenhuma foto pendente.</div>';slots.innerHTML=this.cheques.map(ch=>{const front=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch.id&&a.role==='frente');const back=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch.id&&a.role==='verso');return`<div class="slot-row"><div class="slot-meta"><b>${esc(ch.numero)}</b><small>${esc(supplierById(ch.fornecedorId)?.nome||ch.pessoa||'—')}</small><small>${brl(ch.valor)} · ${fmtDate(ch.dataBom)}</small></div>${this.slotHtml(ch.id,'frente',front?.[0])}${this.slotHtml(ch.id,'verso',back?.[0])}</div>`}).join('');$('[data-org-status]',this.modal).textContent=`${this.photos.size} foto(s) · ${this.assignments.size} associada(s)`;this.wireDrag()},
  photoHtml(p){return`<div class="drag-photo" draggable="true" data-photo-id="${p.id}"><img src="${p.url}" alt=""><div>${esc(p.file.name)}</div></div>`},
  slotHtml(ch,role,pid){const p=pid?this.photos.get(pid):null;return`<div class="photo-slot" data-slot-cheque="${ch}" data-slot-role="${role}">${p?`<img src="${p.url}" draggable="true" data-photo-id="${p.id}"><span>${role}</span>`:`<div>${role==='frente'?'Solte a frente aqui':'Solte o verso aqui'}</div>`}</div>`},
  wireDrag(){$$('[data-photo-id]',this.modal).forEach(el=>el.addEventListener('dragstart',e=>{this.dragId=el.dataset.photoId;e.dataTransfer.setData('text/plain',this.dragId)}));$$('[data-slot-cheque]',this.modal).forEach(slot=>{slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('dragover')});slot.addEventListener('dragleave',()=>slot.classList.remove('dragover'));slot.addEventListener('drop',e=>{e.preventDefault();slot.classList.remove('dragover');const id=e.dataTransfer.getData('text/plain')||this.dragId;if(id)this.assign(id,slot.dataset.slotCheque,slot.dataset.slotRole)})});const un=$('[data-unmatched]',this.modal);un.addEventListener('dragover',e=>e.preventDefault());un.addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain')||this.dragId;if(id)this.unassign(id)})},
  async analyze(){const btn=$('[data-org-analyze]',this.modal);btn.disabled=true;let done=0;for(const p of this.photos.values()){if(this.assignments.has(p.id))continue;$('[data-org-status]',this.modal).textContent=`Analisando ${++done}/${this.photos.size}...`;try{const result=await ocrFile(p.file,()=>{});p.text=result.text;const ch=this.cheques.find(c=>{const n=digits(c.numero);return n&&digits(result.text).includes(n)});if(ch)this.assignments.set(p.id,{chequeId:ch.id,role:this.firstEmptyRole(ch.id)})}catch(e){console.warn(e)}}btn.disabled=false;this.render();toast('Análise concluída. Confira as associações.')},
  async save(){if(!this.assignments.size)throw new Error('Associe pelo menos uma foto.');for(const [photoId,a] of this.assignments){const p=this.photos.get(photoId),ch=this.cheques.find(x=>x.id===a.chequeId);if(!p||!ch)continue;const meta=await storeAttachment(p.file);meta.role=a.role;ch.attachments=ch.attachments||[];const old=ch.attachments.find(x=>x.role===a.role);if(old)old.role='documento';ch.attachments.push(meta);recordTouch(ch);URL.revokeObjectURL(p.url)}logAudit('Fotos de cheques organizadas',`${this.assignments.size} associação(ões)`,'Cheque','');scheduleSave();closeModal();renderAll();toast('Fotos vinculadas aos cheques.')}
};

// ---------- Backup e configuração ----------
async function exportBackup(){
  if(!window.JSZip)throw new Error('Biblioteca de backup não carregou.');toast('Preparando backup...');const zip=new JSZip();zip.file('borion-cnpj-dados.json',JSON.stringify(App.state,null,2));const folder=zip.folder('anexos');const rows=await getAllAttachmentRows();for(const row of rows){try{const blob=await getAttachmentBlob(row.id);folder.file(`${row.id}__${row.name}`,blob)}catch(e){console.warn(e)}}const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(out,`BORION_CNPJ_BACKUP_${todayISO()}.zip`);logAudit('Backup exportado',`${rows.length} anexo(s)`);scheduleSave(false);toast('Backup concluído.');
}
async function importBackup(){
  const input=document.createElement('input');input.type='file';input.accept='.zip';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(!window.JSZip)throw new Error('Biblioteca de backup não carregou.');toast('Restaurando backup...');const zip=await JSZip.loadAsync(file);const dataFile=zip.file('borion-cnpj-dados.json');if(!dataFile)throw new Error('Este ZIP não contém dados do Borion.');const imported=JSON.parse(await dataFile.async('text'));App.state=Drive.mergeState(App.state,imported);const files=Object.values(zip.files||{}).filter(x=>!x.dir&&x.name.startsWith('anexos/'));for(const entry of files){const name=entry.name.split('/').pop();const [id,...rest]=name.split('__');const blob=await entry.async('blob');const f=new File([blob],rest.join('__')||'arquivo',{type:blob.type||'application/octet-stream'});const buf=await f.arrayBuffer();const env=await encryptBytes(buf);await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put({id,name:f.name,type:f.type,size:f.size,iv:env.iv,data:env.data,createdAt:nowISO()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}logAudit('Backup restaurado',file.name);await saveLocal();renderAll();toast('Backup restaurado com sucesso.');};input.click();
}
function exportTeamKey(){
  const key=localStorage.getItem('borion_cnpj_team_key');const payload={app:'Borion CNPJ',version:1,createdAt:nowISO(),key};downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`CHAVE_EQUIPE_BORION_CNPJ_${todayISO()}.json`);toast('Guarde este arquivo em local seguro.');
}
function importTeamKey(){
  const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const payload=JSON.parse(await file.text());if(!payload.key||b64ToBytes(payload.key).length!==32)throw new Error('Arquivo de chave inválido.');if(!confirm('A chave local será substituída. Continue somente se este arquivo pertencer à mesma empresa.'))return;localStorage.setItem('borion_cnpj_team_key',payload.key);App.teamKey=null;await loadTeamKey();toast('Chave importada. Recarregando...');setTimeout(()=>location.reload(),700)};input.click();
}
function openGoogleConfig(){
  const body=`<div class="form-grid"><div class="field full"><label>Google OAuth Client ID</label><input name="clientId" value="${esc(Drive.clientId())}" placeholder="000000000000-xxxx.apps.googleusercontent.com"><div class="field-help">No Google Cloud, adicione o endereço do seu GitHub Pages em “Origens JavaScript autorizadas”.</div></div><div class="field full"><label>Link ou ID da pasta Borion CNPJ no Drive (opcional)</label><input name="rootId" value="${esc(App.state.settings.rootFolderId||'')}" placeholder="https://drive.google.com/drive/folders/..."></div></div>`;
  openModal({title:'Configurar Google Drive',subtitle:'Faça esta configuração uma única vez neste navegador.',body,size:'small',saveLabel:'Salvar e entrar',onSave:async modal=>{const v=formDataObj(modal);if(!v.clientId.trim())throw new Error('Informe o Client ID.');localStorage.setItem('borion_cnpj_google_client_id',v.clientId.trim());if(v.rootId.trim()){App.state.settings.rootFolderId=Drive.folderIdFromInput(v.rootId);localStorage.setItem('borion_cnpj_root_folder_id',App.state.settings.rootFolderId)}await saveLocal();closeModal();await Drive.login();}});
}
async function saveGoogleConfig(){const v=$('#cfg-client-id')?.value.trim();if(!v){toast('Informe o Google Client ID.','error');return}localStorage.setItem('borion_cnpj_google_client_id',v);toast('Client ID salvo.');renderConfig()}
async function saveDriveConfig(){App.state.settings.rootFolderId=Drive.folderIdFromInput($('#cfg-root-id')?.value||'');App.state.settings.companyName=$('#cfg-company')?.value.trim()||'Borion CNPJ';App.state.settings.warningDays=Math.max(1,Math.min(90,Number($('#cfg-warning')?.value)||7));App.state.settings.autoSync=$('#cfg-auto-sync')?.checked;localStorage.setItem('borion_cnpj_root_folder_id',App.state.settings.rootFolderId);App.drive.rootId=App.state.settings.rootFolderId;await saveLocal();renderAll();toast('Configurações salvas.');if(App.drive.connected)scheduleSync()}
async function prepareDrive(){App.drive.rootId='';await Drive.resolveRoot();await Drive.ensureStructure();toast('Estrutura do Drive verificada.');renderConfig()}

// ---------- Inicialização ----------
function showGate(){ $('#boot').hidden=true;$('#app').hidden=true;$('#gate').hidden=false;const has=!!Drive.clientId();$('#gate-config-note').textContent=has?'Google configurado. Entre com a conta que tem acesso à pasta da empresa.':'O Google ainda precisa de um Client ID. Você também pode testar o sistema localmente agora.'; }
function showApp(){ $('#boot').hidden=true;$('#gate').hidden=true;$('#app').hidden=false;const u=App.user||{name:'Modo local',email:'Neste navegador'};$('#user-name').textContent=u.name;$('#user-email').textContent=u.email;$('#user-avatar').textContent=initials(u.name);renderAll();setPage(App.page); }
async function boot(){
  try{await openDB();await loadLocal();$('#boot-detail').textContent='Preparando cheques e boletos';await sleep(250);const last=localStorage.getItem('borion_cnpj_last_user');if(last)try{App.user=JSON.parse(last)}catch{}showGate();}
  catch(e){console.error(e);$('#boot-detail').textContent='Falha ao iniciar: '+e.message;toast(e.message,'error',8000)}
}
function logout(){App.drive={token:'',rootId:'',dataFileId:'',connected:false,syncing:false,tokenClient:null};App.user=null;App.localMode=true;showGate()}
function localLogin(){App.user={name:'Modo local',email:'Neste navegador'};App.localMode=true;App.drive.connected=false;showApp();updateSyncUI('local','Modo local','Salvamento neste navegador')}
function reconnectGoogle(){logout();setTimeout(()=>Drive.login().catch(e=>toast(e.message,'error',6000)),100)}

// Delegação e API pública
window.Borion={
  go:setPage,chequeTab:v=>{App.chequeTab=v;renderCheques()},boletoTab:v=>{App.boletoTab=v;renderBoletos()},
  newFornecedor:()=>openFornecedor(),editFornecedor:openFornecedor,viewFornecedor,
  newCheque:()=>openCheque(),editCheque:openCheque,viewCheque:id=>{const x=active(App.state.cheques).find(r=>r.id===id);if(x)showViewer(x,'Cheque')},newLote:openLote,
  newBoleto:()=>openBoleto(),editBoleto:openBoleto,viewBoleto:id=>{const x=active(App.state.boletos).find(r=>r.id===id);if(x)showViewer(x,'Boleto')},focusBarcode,
  organizePhotos:()=>Organizer.open(),exportBackup,importBackup,exportTeamKey,importTeamKey,saveGoogleConfig,saveDriveConfig,prepareDrive,reconnectGoogle
};

$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setPage(b.dataset.page)});
$('#btn-google-login').onclick=()=>Drive.login().catch(e=>toast(e.message,'error',7000));
$('#btn-local-login').onclick=localLogin;$('#btn-gate-config').onclick=openGoogleConfig;$('#btn-logout').onclick=logout;$('#btn-sync').onclick=()=>App.drive.connected?Drive.sync().catch(e=>toast(e.message,'error',6000)):toast('Entre com o Google para sincronizar.','error');
window.addEventListener('beforeunload',()=>{if(App.saveTimer)saveLocal()});
boot();
})();
