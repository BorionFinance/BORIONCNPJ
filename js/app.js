(() => {
'use strict';

const CFG = window.BORION_CONFIG || {};
const applyBorionVersion=()=>{const badge=document.getElementById('borion_version_badge');if(badge)badge.textContent=CFG.version||'1.0.23';};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyBorionVersion,{once:true});else applyBorionVersion();
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PAGE_META = {
  dashboard:['Visão Geral','Acompanhe cheques, boletos e próximos vencimentos.'],
  cheques:['Cheques','Controle de cheques emitidos, recebidos, lotes e imagens.'],
  boletos:['Boletos','Cadastre por foto, PDF, linha digitável ou leitor USB.'],
  fornecedores:['Fornecedores','Pessoas e empresas vinculadas aos pagamentos.'],
  alertas:['Alertas','Vencimentos, atrasos e documentos que precisam de atenção.'],
  importar:['Importar arquivos','Importe cheques, boletos, fornecedores e backups sem criar duplicidades.'],
  backup:['Backup','Exporte, restaure e proteja os dados da empresa.'],
  config:['Configurações','Google Drive, segurança e preferências do Borion.']
};

const $ = (sel, root=document) => { const scope=typeof root==='string'?document.querySelector(root):root; return scope?.querySelector?.(sel)||null; };
const $$ = (sel, root=document) => { const scope=typeof root==='string'?document.querySelector(root):root; return scope?.querySelectorAll?Array.from(scope.querySelectorAll(sel)):[]; };
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
function withTimeout(promise,ms,message){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(message||'A operação demorou demais e foi cancelada.')),ms);
    promise.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});
  });
}

const MONEY_FIELDS = new Set(['valor','valorPago','juros','multa','desconto']);
function moneyNumber(value){
  if(typeof value==='number'&&Number.isFinite(value))return value;
  const raw=String(value??'').trim();
  if(!raw)return 0;
  if(raw.includes(','))return Number(raw.replace(/\./g,'').replace(',','.'))||0;
  const parsed=Number(raw);
  return Number.isFinite(parsed)?parsed:0;
}
function moneyDisplay(value){
  return moneyNumber(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function moneyFromTyping(value){
  const d=digits(value);
  return (Number(d||0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function moneyInputNumber(value){ return Number(digits(value)||0)/100; }
function setMoneyInputValue(input,value){
  if(!input)return;
  input.value=moneyDisplay(value);
  input.dispatchEvent(new Event('change',{bubbles:true}));
}
function wireSmartInputs(root=document){
  $$('[data-money]',root).forEach(input=>{
    input.value=moneyDisplay(input.value);
    input.addEventListener('input',()=>{input.value=moneyFromTyping(input.value)});
    input.addEventListener('focus',()=>requestAnimationFrame(()=>input.select()));
  });
  $$('[data-document]',root).forEach(input=>{
    input.value=formatDoc(input.value);
    input.addEventListener('input',()=>{input.value=formatDoc(input.value)});
  });
  $$('[data-phone]',root).forEach(input=>{
    input.value=formatPhone(input.value);
    input.addEventListener('input',()=>{input.value=formatPhone(input.value)});
  });
}


function blankState(){
  return {
    meta:{version:CFG.version||'1.0.23',createdAt:nowISO(),updatedAt:nowISO()},
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
  updateSyncUI(App.drive.connected?'ok':'local',App.drive.connected?'Google Drive conectado':'Modo demonstração',App.drive.connected?'Alterações na fila do Google Drive':'Demonstração sem sincronização');
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
function scheduleSync(){ clearTimeout(App.syncTimer); App.syncTimer=setTimeout(()=>{App.syncTimer=null;Drive.sync().catch(e=>{console.error(e);toast('Falha ao sincronizar: '+e.message,'error',6000)});},1400); }

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
  clientId(){ return String(CFG.googleClientId||'').trim(); },
  requestToken(prompt=''){
    const clientId=this.clientId();if(!clientId)throw new Error('Google Client ID não configurado.');
    if(!window.google?.accounts?.oauth2)throw new Error('O Google ainda está carregando. Tente novamente em alguns segundos.');
    const raw=new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'openid email profile https://www.googleapis.com/auth/drive',callback:resp=>resp.error?reject(new Error(resp.error)):resolve(resp)});App.drive.tokenClient=client;client.requestAccessToken({prompt});});
    return withTimeout(raw,prompt?90000:12000,'A sessão do Google não respondeu. Saia da conta e entre novamente.');
  },
  async login(){
    const clientId=this.clientId();
    if(!clientId) throw new Error('Google OAuth não configurado. Cole o Client ID em js/config.js antes de publicar.');
    const resp=await this.requestToken('select_account'); App.drive.token=resp.access_token;
    const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');
    const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&& !allowed.includes(String(info.email).toLowerCase())) throw new Error('Esta conta não está autorizada.');
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''}; App.localMode=false; App.drive.connected=true;
    localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));
    await this.resolveRoot();
    showApp(); await this.sync(false); startDriveRefreshLoop(); toast('Google Drive conectado.');
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
    const folderName=App.state.settings.rootFolderName||CFG.driveRootFolderName||'Borion CNPJ';
    const q=`name='${this.q(folderName)}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const data=await this.api('https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=20&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)&q='+encodeURIComponent(q));
    let rootId=data.files?.[0]?.id||'';
    if(!rootId){ const folder=await this.createFolder('',folderName); rootId=folder.id; }
    App.drive.rootId=rootId;
    App.state.settings.rootFolderId=rootId;
    await saveLocal();
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
  root.innerHTML=`<div class="modal-backdrop modal-overlay"><div class="modal modal-box ${size}">
    <div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="modal-close" type="button">×</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${onDelete?'<button type="button" class="btn btn-danger" data-modal-delete>Excluir</button>':'<span></span>'}<div class="right"><button type="button" class="btn btn-outline" data-modal-cancel>Cancelar</button>${onSave?`<button type="button" class="btn btn-primary" data-modal-save>${esc(saveLabel||'Salvar')}</button>`:''}</div></div>
  </div></div>`;
  const back=$('.modal-backdrop',root), modal=$('.modal',root);
  $('.modal-close',root).onclick=$('[data-modal-cancel]',root).onclick=closeModal;
  back.addEventListener('mousedown',e=>{if(e.target===back)closeModal()});
  if(onSave) $('[data-modal-save]',root).onclick=async()=>{ const btn=$('[data-modal-save]',root); try{btn.disabled=true;await onSave(modal,btn)}catch(e){console.error(e);toast(e.message||'Não foi possível salvar.','error',6000)}finally{btn.disabled=false} };
  if(onDelete) $('[data-modal-delete]',root).onclick=async()=>{if(confirm('Tem certeza que deseja excluir?')) await onDelete(modal)};
  wireSmartInputs(modal);
  return modal;
}
function closeModal(){ $('#modal-root').innerHTML=''; }
function field(name,label,value='',type='text',extra=''){
  const classes=extra.includes('full')?' full':'';
  const cleanExtra=extra.replace(/\bfull\b/g,'').trim();
  if(MONEY_FIELDS.has(name)){
    return `<div class="field${classes}"><label for="f-${esc(name)}">${esc(label)}</label><div class="money-field"><span>R$</span><input id="f-${esc(name)}" name="${esc(name)}" type="text" inputmode="numeric" autocomplete="off" data-money value="${esc(moneyDisplay(value))}" ${cleanExtra.replace(/type="number"|step="[^"]*"|min="[^"]*"/g,'')}></div></div>`;
  }
  const isDoc=name==='cpfCnpj';
  const isPhone=['telefone','whatsapp'].includes(name);
  const attrs=[isDoc?'data-document inputmode="numeric" maxlength="18" autocomplete="off"':'',isPhone?'data-phone inputmode="tel" maxlength="16" autocomplete="off"':'',cleanExtra].filter(Boolean).join(' ');
  return `<div class="field${classes}"><label for="f-${esc(name)}">${esc(label)}</label><input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type||'text')}" value="${esc(isDoc?formatDoc(value):isPhone?formatPhone(value):value)}" ${attrs}></div>`;
}
function selectField(name,label,options,value='',extra=''){
  return `<div class="field ${extra.includes('full')?'full':''}"><label for="f-${esc(name)}">${esc(label)}</label><select id="f-${esc(name)}" name="${esc(name)}" ${extra.replace('full','')}>${options.map(o=>{const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`}).join('')}</select></div>`;
}
function textArea(name,label,value='',extra='full'){
  return `<div class="field ${extra.includes('full')?'full':''}"><label for="f-${esc(name)}">${esc(label)}</label><textarea id="f-${esc(name)}" name="${esc(name)}">${esc(value)}</textarea></div>`;
}
function formDataObj(modal){
  const out={};
  $$('[name]',modal).forEach(el=>{
    if(el.type==='checkbox')out[el.name]=el.checked;
    else if(el.dataset.money!==undefined)out[el.name]=String(moneyInputNumber(el.value));
    else out[el.name]=el.value;
  });
  return out;
}
function supplierOptions(selected=''){
  const opts=[{value:'',label:'Selecione ou cadastre...'},...active(App.state.fornecedores).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(x=>({value:x.id,label:x.nome+(x.fantasia?' · '+x.fantasia:'') }))];
  return `<div class="field"><label for="f-fornecedorId">Fornecedor / pessoa</label><div style="display:flex;gap:6px"><select id="f-fornecedorId" name="fornecedorId" style="min-width:0">${opts.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(selected)?'selected':''}>${esc(o.label)}</option>`).join('')}</select><button type="button" class="btn btn-outline btn-sm" data-quick-supplier title="Cadastrar rapidamente">＋</button></div><div data-quick-supplier-box hidden style="margin-top:8px;padding:9px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02)"><input data-qs-name placeholder="Nome / razão social" style="margin-bottom:6px"><input data-qs-doc data-document inputmode="numeric" maxlength="18" autocomplete="off" placeholder="CPF/CNPJ" style="margin-bottom:6px"><input data-qs-phone data-phone inputmode="tel" maxlength="16" autocomplete="off" placeholder="Telefone"><button type="button" class="btn btn-primary btn-sm btn-block" data-qs-save>Salvar fornecedor</button></div></div>`;
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
    const found=extractBoleto(result.text,result.barcode); if(found.linhaDigitavel)$('[name="linhaDigitavel"]',modal).value=found.linhaDigitavel;if(found.valor)setMoneyInputValue($('[name="valor"]',modal),found.valor);if(found.vencimento)$('[name="vencimento"]',modal).value=found.vencimento;
    progress.textContent=found.linhaDigitavel?'Código localizado. Confira os campos antes de salvar.':'Não encontrei a linha completa. O arquivo será anexado para conferência manual.';
  } else {
    const found=extractCheque(result.text); if(found.numero)$('[name="numero"]',modal).value=found.numero;if(found.valor)setMoneyInputValue($('[name="valor"]',modal),found.valor);if(found.data)$('[name="dataEmissao"]',modal).value=found.data;
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
  const calBtn=$('#btn-dashboard-calendar');if(calBtn){calBtn.hidden=page!=='dashboard';calBtn.classList.toggle('has-date',page==='dashboard'&&!!App.dashboardDate)}
}
function renderAll(){ renderDashboard();renderCheques();renderBoletos();renderFornecedores();renderAlertas();renderImport();renderBackup();renderConfig(); }
function renderPage(page){ ({dashboard:renderDashboard,cheques:renderCheques,boletos:renderBoletos,fornecedores:renderFornecedores,alertas:renderAlertas,importar:renderImport,backup:renderBackup,config:renderConfig}[page]||renderDashboard)(); }
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
function renderConfig(){}

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
  const line=$('[name="linhaDigitavel"]',modal);line.addEventListener('input',()=>{const info=boletoInfoFromDigits(line.value);if(info.valor&&moneyInputNumber($('[name="valor"]',modal).value)===0)setMoneyInputValue($('[name="valor"]',modal),info.valor);if(info.vencimento&&!$('[name="vencimento"]',modal).value)$('[name="vencimento"]',modal).value=info.vencimento});
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
async function saveDriveConfig(){
  App.state.settings.companyName=$('#cfg-company')?.value.trim()||'Borion CNPJ';
  App.state.settings.warningDays=Math.max(1,Math.min(90,Number($('#cfg-warning')?.value)||7));
  App.state.settings.autoSync=$('#cfg-auto-sync')?.checked;
  App.state.settings.imageQuality=Math.max(.6,Math.min(.95,Number($('#cfg-image-quality')?.value)||.86));
  App.state.settings.maxImageDimension=Math.max(1200,Math.min(5000,Number($('#cfg-image-max')?.value)||2400));
  await saveLocal();
  renderAll();
  toast('Preferências salvas.');
  if(App.drive.connected)scheduleSync();
}
async function prepareDrive(){
  if(!App.drive.connected)throw new Error('Entre com o Google primeiro.');
  App.drive.rootId='';
  await Drive.resolveRoot();
  await Drive.ensureStructure();
  toast('Estrutura do Drive verificada.');
  renderConfig();
}

// ---------- Melhorias v1.0.1: Drive oficial, OCR, lotes, fornecedores e backups ----------
App.filters={chequeSupplier:'',chequeStatus:'',chequeMonth:'',boletoSupplier:'',boletoStatus:'',boletoMonth:''};
App.state.settings.imageQuality=Number(App.state.settings.imageQuality||0.86);
App.state.settings.maxImageDimension=Number(App.state.settings.maxImageDimension||2400);
App.state.settings.lastDriveBackupDate=App.state.settings.lastDriveBackupDate||'';

function safeFilePart(value){return String(value||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'arquivo'}
function recordMovementDate(record,type){
  if(type==='Cheque')return record.dataEmissao||record.dataEntrega||record.dataBom||String(record.createdAt||'').slice(0,10)||todayISO();
  return record.dataCadastro||record.vencimento||record.dataPagamento||String(record.createdAt||'').slice(0,10)||todayISO();
}
async function sha256Hex(file){const buf=await file.arrayBuffer();const hash=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function imageBlobFromFile(file,{max=2400,quality=.86,rotation=0,grayscale=false,contrast=1.14}={}){
  const bitmap=await createImageBitmap(file);const rad=((rotation%360)+360)%360;const swap=rad===90||rad===270;
  let w=bitmap.width,h=bitmap.height;const scale=Math.min(1,max/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement('canvas');canvas.width=swap?h:w;canvas.height=swap?w:h;const ctx=canvas.getContext('2d',{willReadFrequently:grayscale});
  ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rad*Math.PI/180);ctx.drawImage(bitmap,-w/2,-h/2,w,h);ctx.restore();bitmap.close();
  if(grayscale){const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];y=(y-128)*contrast+128;d[i]=d[i+1]=d[i+2]=Math.max(0,Math.min(255,y))}ctx.putImageData(img,0,0)}
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao processar imagem.')),'image/jpeg',quality));
}
async function prepareImageAttachment(file){
  if(!file.type.startsWith('image/'))return {main:file,thumb:null,originalSize:file.size};
  const max=Number(App.state.settings.maxImageDimension||2400),quality=Number(App.state.settings.imageQuality||.86);
  let main=file;try{main=await imageBlobFromFile(file,{max,quality})}catch(e){console.warn('Compressão ignorada',e)}
  let thumb=null;try{thumb=await imageBlobFromFile(file,{max:360,quality:.72})}catch(e){console.warn('Miniatura ignorada',e)}
  const base=file.name.replace(/\.[^.]+$/,'');
  if(main!==file)main=new File([main],base+'.jpg',{type:'image/jpeg',lastModified:file.lastModified||Date.now()});
  return {main,thumb,originalSize:file.size};
}
storeAttachment=async function(file){
  const id=uid(),prepared=await prepareImageAttachment(file),buf=await prepared.main.arrayBuffer(),env=await encryptBytes(buf);
  const row={id,name:prepared.main.name||file.name||'arquivo',originalName:file.name||'arquivo',type:prepared.main.type||file.type||'application/octet-stream',size:prepared.main.size||buf.byteLength,originalSize:prepared.originalSize,iv:env.iv,data:env.data,createdAt:nowISO()};
  if(prepared.thumb){const t=await encryptBytes(await prepared.thumb.arrayBuffer());row.thumbIv=t.iv;row.thumbData=t.data;row.thumbType='image/jpeg'}
  await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put(row);r.onsuccess=resolve;r.onerror=()=>reject(r.error)});
  return {id,name:row.name,originalName:row.originalName,type:row.type,size:row.size,originalSize:row.originalSize,createdAt:row.createdAt,driveFileId:'',driveThumbFileId:'',driveName:'',pendingUpload:true,role:'documento'};
};
async function getAttachmentThumbnailBlob(id){const row=await new Promise((resolve,reject)=>{const r=idbTx().get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!row?.thumbData)return null;const plain=await decryptEnvelope({iv:row.thumbIv,data:row.thumbData});return new Blob([plain],{type:row.thumbType||'image/jpeg'})}

function cpfValid(v){const d=digits(v);if(d.length!==11||/^(\d)\1+$/.test(d))return false;let s=0;for(let i=0;i<9;i++)s+=Number(d[i])*(10-i);let r=(s*10)%11;if(r===10)r=0;if(r!==Number(d[9]))return false;s=0;for(let i=0;i<10;i++)s+=Number(d[i])*(11-i);r=(s*10)%11;if(r===10)r=0;return r===Number(d[10])}
function cnpjValid(v){const d=digits(v);if(d.length!==14||/^(\d)\1+$/.test(d))return false;const calc=len=>{const w=len===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const s=d.slice(0,len).split('').reduce((a,n,i)=>a+Number(n)*w[i],0);const r=s%11;return r<2?0:11-r};return calc(12)===Number(d[12])&&calc(13)===Number(d[13])}
function docValid(v){const d=digits(v);return !d||d.length===11?cpfValid(d):d.length===14?cnpjValid(d):false}
function formatDoc(v){const d=digits(v).slice(0,14);if(d.length<=11)return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');return d.replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2')}
function formatPhone(v){const d=digits(v).slice(0,11);return d.length>10?d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3'):d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3')}
function wireSupplierMasks(modal){const doc=$('[name="cpfCnpj"]',modal),phone=$('[name="telefone"]',modal);if(doc)doc.oninput=()=>doc.value=formatDoc(doc.value);if(phone)phone.oninput=()=>phone.value=formatPhone(phone.value)}
wireQuickSupplier=function(modal){
  const btn=$('[data-quick-supplier]',modal),box=$('[data-quick-supplier-box]',modal);if(!btn||!box)return;btn.onclick=()=>{box.hidden=!box.hidden;if(!box.hidden)$('[data-qs-name]',box).focus()};
  const doc=$('[data-qs-doc]',box),phone=$('[data-qs-phone]',box);doc.oninput=()=>doc.value=formatDoc(doc.value);phone.oninput=()=>phone.value=formatPhone(phone.value);
  $('[data-qs-save]',box).onclick=()=>{const nome=$('[data-qs-name]',box).value.trim(),cpfCnpj=doc.value.trim();if(!nome){toast('Informe o nome do fornecedor.','error');return}if(cpfCnpj&&!docValid(cpfCnpj)){toast('CPF/CNPJ inválido.','error');return}const duplicate=active(App.state.fornecedores).find(x=>cpfCnpj&&digits(x.cpfCnpj)===digits(cpfCnpj));if(duplicate){$('[name="fornecedorId"]',modal).value=duplicate.id;box.hidden=true;toast('Fornecedor já existia e foi selecionado.');return}const item={id:uid(),tipo:digits(cpfCnpj).length===11?'Pessoa física':'Pessoa jurídica',status:'Ativo',nome,cpfCnpj,telefone:phone.value.trim(),fantasia:'',email:'',endereco:'',createdAt:nowISO()};recordTouch(item);App.state.fornecedores.push(item);const select=$('[name="fornecedorId"]',modal);select.insertAdjacentHTML('beforeend',`<option value="${item.id}">${esc(item.nome)}</option>`);select.value=item.id;box.hidden=true;logAudit('Fornecedor cadastrado',item.nome,'Fornecedor',item.id);scheduleSave();toast('Fornecedor adicionado à lista.')};
};

function mod11Bank(number){let sum=0,w=2;for(let i=number.length-1;i>=0;i--){sum+=Number(number[i])*w;w=w===9?2:w+1}const d=11-(sum%11);return d===0||d===10||d===11?1:d}
function mod11Utility(number){let sum=0,w=2;for(let i=number.length-1;i>=0;i--){sum+=Number(number[i])*w;w=w===9?2:w+1}const r=sum%11;if(r===0||r===1)return 0;const d=11-r;return d>=10?0:d}
function line47ToBarcode(d){return d.slice(0,4)+d[32]+d.slice(33,47)+d.slice(4,9)+d.slice(10,20)+d.slice(21,31)}
validateBoletoLine=function(line){
  const d=digits(line),errors=[],warnings=[];if(![44,47,48].includes(d.length))errors.push('O código precisa ter 44, 47 ou 48 dígitos.');
  if(d.length===47){if(mod10(d.slice(0,9))!==Number(d[9]))errors.push('Dígito do campo 1 inválido.');if(mod10(d.slice(10,20))!==Number(d[20]))errors.push('Dígito do campo 2 inválido.');if(mod10(d.slice(21,31))!==Number(d[31]))errors.push('Dígito do campo 3 inválido.');const b=line47ToBarcode(d);if(mod11Bank(b.slice(0,4)+b.slice(5))!==Number(b[4]))errors.push('Dígito geral do boleto inválido.');}
  if(d.length===48){if(d[0]!=='8')warnings.push('A linha de 48 dígitos normalmente começa com 8.');const use10=['6','7'].includes(d[2]);for(let i=0;i<4;i++){const block=d.slice(i*12,i*12+11),dv=Number(d[i*12+11]),calc=use10?mod10(block):mod11Utility(block);if(calc!==dv)errors.push(`Dígito do bloco ${i+1} inválido.`)}}
  if(d.length===44&&d[0]!=='8'){if(mod11Bank(d.slice(0,4)+d.slice(5))!==Number(d[4]))errors.push('Dígito geral do código de barras inválido.');}
  return {valid:errors.length===0,digits:d,errors,warnings};
};
boletoInfoFromDigits=function(line){const d=digits(line),out={linhaDigitavel:d,valor:'',vencimento:'',codigoBarras:''};let b='';if(d.length===47)b=line47ToBarcode(d);else if(d.length===44)b=d;out.codigoBarras=b;if(b&&b[0]!=='8'){const factor=Number(b.slice(5,9)),amount=Number(b.slice(9,19))/100;if(amount)out.valor=amount.toFixed(2);if(factor>=1000){const base=new Date('2025-02-22T12:00:00');base.setDate(base.getDate()+factor-1000);out.vencimento=base.toISOString().slice(0,10)}}return out};

async function pdfPagesToBlobs(file,maxPages=3){if(!window.pdfjsLib)throw new Error('Leitor de PDF não carregou.');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,out=[];for(let i=1;i<=Math.min(maxPages,pdf.numPages);i++){const page=await pdf.getPage(i),viewport=page.getViewport({scale:2});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;out.push(await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92)))}return out}
ocrFile=async function(file,onProgress=()=>{}){
  const pages=(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf'))?await pdfPagesToBlobs(file,3):[file];let texts=[],barcode='',confidence=0;
  for(let i=0;i<pages.length;i++){onProgress(`Preparando página ${i+1}/${pages.length}...`);let img=pages[i];try{img=await imageBlobFromFile(img,{max:2200,quality:.92,grayscale:true,contrast:1.22})}catch{}if(!barcode)barcode=await detectBarcode(img);ocrProgressCallback=msg=>onProgress(`Página ${i+1}: ${msg}`);const worker=await getOcrWorker();let result=await worker.recognize(img);let conf=Number(result.data?.confidence||0);if(conf<40&&pages.length===1){try{const rotated=await imageBlobFromFile(file,{max:2200,quality:.92,rotation:180,grayscale:true,contrast:1.22});const retry=await worker.recognize(rotated);if(Number(retry.data?.confidence||0)>conf)result=retry}catch{}}texts.push(result.data?.text||'');confidence=Math.max(confidence,Number(result.data?.confidence||0))}
  ocrProgressCallback=()=>{};return {text:texts.join('\n\n'),barcode,confidence};
};
extractCheque=function(text){const clean=String(text||'').replace(/\s+/g,' '),lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const number=(clean.match(/\b([A-Z]{1,4})\s*[-.]?\s*(\d{5,10})\b/i)||[]),money=[...clean.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map(x=>x[1]),date=(clean.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/)||[]);let iso='';if(date.length){const y=date[3].length===2?'20'+date[3]:date[3];iso=`${y}-${date[2]}-${date[1]}`}const digitRuns=(String(text||'').match(/(?:\d[\s<>{}:;|IlO]*){20,40}/g)||[]).map(digits).filter(x=>x.length>=20);const cmc7=digitRuns.sort((a,b)=>b.length-a.length)[0]||'';return {numero:number.length?(number[1].toUpperCase()+' '+number[2]):'',valor:money.length?money[money.length-1].replace(/\./g,'').replace(',','.'):'',data:iso,cmc7,ocrText:lines.slice(0,40).join('\n')}};
scanIntoForm=async function(modal,file,type){const progress=$('[data-scan-progress]',modal);progress.hidden=false;const result=await ocrFile(file,msg=>progress.textContent=msg);if(type==='boleto'){const found=extractBoleto(result.text,result.barcode);if(found.linhaDigitavel)$('[name="linhaDigitavel"]',modal).value=found.linhaDigitavel;if(found.valor)setMoneyInputValue($('[name="valor"]',modal),found.valor);if(found.vencimento)$('[name="vencimento"]',modal).value=found.vencimento;const val=found.linhaDigitavel?validateBoletoLine(found.linhaDigitavel):null;progress.innerHTML=found.linhaDigitavel?`Código localizado · confiança OCR ${Math.round(result.confidence)}% · ${val.valid?'válido':'confira os dígitos'}.`:`Não encontrei a linha completa · confiança OCR ${Math.round(result.confidence)}%. O arquivo continuará anexado.`}else{const found=extractCheque(result.text);if(found.numero)$('[name="numero"]',modal).value=found.numero;if(found.valor)setMoneyInputValue($('[name="valor"]',modal),found.valor);if(found.data)$('[name="dataEmissao"]',modal).value=found.data;if(found.cmc7)$('[name="cmc7"]',modal).value=found.cmc7;progress.textContent=`Leitura concluída · confiança ${Math.round(result.confidence)}%. Confira número, CMC7, valor e data antes de salvar.`}};

openFornecedor=function(id=''){const existing=id?active(App.state.fornecedores).find(x=>x.id===id):null,x=existing||{tipo:'Pessoa jurídica',status:'Ativo'};const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Pessoa jurídica','Pessoa física'],x.tipo)}${selectField('status','Situação',['Ativo','Inativo'],x.status||'Ativo')}${field('nome','Nome / razão social',x.nome||'','text','required')}${field('fantasia','Nome fantasia',x.fantasia||'')}${field('cpfCnpj','CPF / CNPJ',x.cpfCnpj||'')}${field('telefone','Telefone',x.telefone||'')}${field('whatsapp','WhatsApp',x.whatsapp||'')}${field('email','E-mail',x.email||'','email')}${field('contato','Contato principal',x.contato||'')}${field('cep','CEP',x.cep||'')}${field('cidade','Cidade',x.cidade||'')}${field('uf','Estado',x.uf||'')}${field('endereco','Endereço completo',x.endereco||'','text','full')}${field('dadosBancarios','Dados bancários (opcional)',x.dadosBancarios||'','text','full')}${textArea('observacoes','Observações internas',x.observacoes||'')}</div>`;const modal=openModal({title:existing?'Editar fornecedor':'Novo fornecedor',subtitle:'Cadastro reutilizado nos cheques e boletos.',body,saveLabel:existing?'Salvar alterações':'Cadastrar fornecedor',onSave:async modal=>{const v=formDataObj(modal);if(!v.nome.trim())throw new Error('Informe o nome ou razão social.');if(v.cpfCnpj&&!docValid(v.cpfCnpj))throw new Error('CPF/CNPJ inválido.');const duplicate=active(App.state.fornecedores).find(s=>s.id!==existing?.id&&digits(s.cpfCnpj)&&digits(s.cpfCnpj)===digits(v.cpfCnpj));if(duplicate)throw new Error(`CPF/CNPJ já cadastrado para ${duplicate.nome}.`);const item=existing||{id:uid(),createdAt:nowISO()};Object.assign(item,v);recordTouch(item);if(!existing)App.state.fornecedores.push(item);logAudit(existing?'Fornecedor atualizado':'Fornecedor cadastrado',item.nome,'Fornecedor',item.id);scheduleSave();closeModal();renderAll();toast('Fornecedor salvo e enviado à fila do Drive.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Fornecedor excluído',existing.nome,'Fornecedor',existing.id);scheduleSave();closeModal();renderAll()}:null});wireSupplierMasks(modal)};
renderFornecedores=function(){const root=$('#page-fornecedores');if(!root)return;let list=active(App.state.fornecedores).filter(x=>!App.search.fornecedores||normalize([x.nome,x.fantasia,x.cpfCnpj,x.telefone,x.email].join(' ')).includes(normalize(App.search.fornecedores))).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.fornecedores)}" placeholder="Buscar nome, CPF/CNPJ, telefone..." data-search-fornecedores></div></div><div class="toolbar-right"><button class="btn btn-primary" onclick="Borion.newFornecedor()">＋ Novo fornecedor</button></div></div>${list.length?`<div class="supplier-grid">${list.map(x=>{const ch=active(App.state.cheques).filter(c=>c.fornecedorId===x.id),bo=active(App.state.boletos).filter(b=>b.fornecedorId===x.id),all=[...ch,...bo],total=all.reduce((s,r)=>s+Number(r.valor||0),0),open=[...ch.filter(r=>!['Compensado','Cancelado'].includes(r.status)),...bo.filter(r=>!['Pago','Cancelado'].includes(r.status))].reduce((s,r)=>s+Number(r.valor||0),0);return`<div class="supplier-card ${x.status==='Inativo'?'supplier-inactive':''}"><div class="supplier-top"><div class="supplier-avatar">${esc(initials(x.nome))}</div><button class="action-btn" onclick="Borion.editFornecedor('${x.id}')">Editar</button></div><h3>${esc(x.nome)}</h3><div class="fantasy">${esc(x.fantasia||x.tipo||'Fornecedor')} · ${esc(x.status||'Ativo')}</div><div class="supplier-meta"><div><span>CPF/CNPJ</span><b>${esc(x.cpfCnpj||'—')}</b></div><div><span>Telefone</span><b>${esc(x.telefone||x.whatsapp||'—')}</b></div><div><span>Em aberto</span><b>${brl(open)}</b></div><div><span>Total histórico</span><b>${brl(total)}</b></div></div><button class="btn btn-outline btn-sm btn-block" onclick="Borion.viewFornecedor('${x.id}')">Ver resumo e histórico</button></div>`}).join('')}</div>`:`<div class="panel"><div class="empty"><div class="orb">◆</div><b>Nenhum fornecedor cadastrado</b><p>Cadastre uma pessoa ou empresa para selecionar rapidamente.</p><button class="btn btn-primary" onclick="Borion.newFornecedor()">Novo fornecedor</button></div></div>`}`;$('[data-search-fornecedores]',root).oninput=e=>{App.search.fornecedores=e.target.value;renderFornecedores()}};
viewFornecedor=function(id){const x=supplierById(id);if(!x)return;const cheques=active(App.state.cheques).filter(c=>c.fornecedorId===id),boletos=active(App.state.boletos).filter(b=>b.fornecedorId===id),rows=[...cheques.map(r=>({...r,_type:'Cheque',_date:r.dataBom})),...boletos.map(r=>({...r,_type:'Boleto',_date:r.vencimento}))].sort((a,b)=>String(b._date).localeCompare(String(a._date))),sum=a=>a.reduce((s,r)=>s+Number(r.valor||0),0),openCh=cheques.filter(r=>!['Compensado','Cancelado'].includes(r.status)),doneCh=cheques.filter(r=>r.status==='Compensado'),returned=cheques.filter(r=>r.status==='Devolvido'),openBo=boletos.filter(r=>!['Pago','Cancelado'].includes(r.status));const body=`<div class="mini-kpis"><div><span>Total movimentado</span><b>${brl(sum(rows))}</b></div><div><span>Em aberto</span><b>${brl(sum([...openCh,...openBo]))}</b></div><div><span>Compensado/pago</span><b>${brl(sum([...doneCh,...boletos.filter(r=>r.status==='Pago')]))}</b></div><div><span>Devolvidos</span><b>${returned.length}</b></div></div><div class="detail-box"><h4>Dados</h4>${[['Razão social / nome',x.nome],['Nome fantasia',x.fantasia],['CPF/CNPJ',x.cpfCnpj],['Telefone',x.telefone||x.whatsapp],['E-mail',x.email],['Endereço',[x.endereco,x.cidade,x.uf].filter(Boolean).join(' · ')]].map(([a,b])=>`<div class="detail-row"><span>${a}</span><b>${esc(b||'—')}</b></div>`).join('')}</div><div style="height:12px"></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Número/documento</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r._type}</td><td>${esc(r.numero||r.documento||'—')}</td><td>${fmtDate(r._date)}</td><td class="money">${brl(r.valor)}</td><td><span class="badge ${statusClass(r.status)}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><b>Sem movimentações</b></div>'}`;openModal({title:x.nome,subtitle:`${rows.length} movimentação(ões) vinculada(s)`,body,size:'large'})};

openCheque=function(id=''){const existing=id?active(App.state.cheques).find(x=>x.id===id):null,x=existing||{tipo:'Emitido',status:'Em aberto',dataEmissao:todayISO(),dataBom:todayISO(),attachments:[]},temp=[],removed=[];const statuses=['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'];const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],x.tipo)}${field('numero','Número do cheque',x.numero||'','text','required')}${field('valor','Valor',x.valor||'','number','step="0.01" min="0"')}${supplierOptions(x.fornecedorId||'')}${field('pessoa','Nome livre (opcional)',x.pessoa||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${field('banco','Banco / conta',x.banco||'')}${field('agencia','Agência',x.agencia||'')}${field('conta','Conta',x.conta||'')}${field('cmc7','CMC7',x.cmc7||'')}${field('dataEmissao','Data de emissão/recebimento',x.dataEmissao||todayISO(),'date')}${field('dataBom','Bom para / vencimento',x.dataBom||todayISO(),'date')}${field('dataCompensacao','Data de compensação',x.dataCompensacao||'','date')}${selectField('status','Status',statuses,x.status)}${field('lote','Lote',x.lote||'')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;const modal=openModal({title:existing?'Editar cheque':'Novo cheque',subtitle:'Os dados, fotos e PDFs serão sincronizados com o Google Drive.',body,saveLabel:existing?'Salvar alterações':'Cadastrar cheque',onSave:async modal=>{const v=formDataObj(modal);if(!v.numero.trim())throw new Error('Informe o número do cheque.');const dup=active(App.state.cheques).find(c=>c.id!==existing?.id&&normalize(c.numero)===normalize(v.numero)&&c.banco===v.banco);if(dup&&!confirm(`Já existe o cheque ${dup.numero}. Deseja salvar mesmo assim?`))return;const oldStatus=existing?.status||'',item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};Object.assign(item,v,{valor:Number(v.valor)||0});item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}recordTouch(item);await attachFiles(item,temp,'frente');if(!existing)App.state.cheques.push(item);logAudit(existing?'Cheque atualizado':'Cheque cadastrado',`${item.numero} · ${brl(item.valor)}`,'Cheque',item.id);if(oldStatus&&oldStatus!==item.status)logAudit('Status do cheque alterado',`${oldStatus} → ${item.status}`,'Cheque',item.id);scheduleSave();closeModal();renderAll();toast('Cheque salvo; sincronização com o Drive agendada.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Cheque excluído',existing.numero,'Cheque',existing.id);scheduleSave();closeModal();renderAll()}:null});wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);wireSupplierMasks(modal);wireDropZone(modal,files=>{files.filter(f=>f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')).forEach(file=>temp.push({file,url:URL.createObjectURL(file),role:temp.some(t=>t.role==='frente')?'verso':'frente'}));renderTempFiles(modal,temp);if(temp.length){const p=$('[data-scan-progress]',modal);p.hidden=false;p.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo e sugerir dados</button>';$('[data-scan-now]',modal).onclick=()=>scanIntoForm(modal,temp[0].file,'cheque').catch(e=>toast(e.message,'error',6000))}})};

openLote=function(){let rows=[];const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],'Emitido')}${field('primeiroNumero','Primeiro número','SU 105120','','required')}${field('quantidade','Quantidade','5','number','min="1" max="120"')}${supplierOptions('')}${field('banco','Banco / conta','')}${field('valor','Valor padrão','','number','step="0.01" min="0"')}${field('dataBase','Data base',todayISO(),'date')}${field('prazos','Prazos em dias','30, 45, 60','text','full')}${field('nomeLote','Nome do lote','Lote '+new Date().toLocaleDateString('pt-BR'),'text','full')}${textArea('observacoes','Observações','')}</div><div class="lote-actions"><button type="button" class="btn btn-outline btn-sm" data-lote-regerar>Regerar grade</button><button type="button" class="btn btn-outline btn-sm" data-lote-add>Adicionar linha</button><span class="muted" data-lote-total></span></div><div class="table-wrap lote-grid"><table><thead><tr><th>Número</th><th>Prazo</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody data-lote-rows></tbody></table></div>`;const modal=openModal({title:'Gerar cheques em lote',subtitle:'Confira e edite cada número, prazo, data e valor antes de salvar.',body,size:'large',saveLabel:'Gerar cheques confirmados',onSave:async modal=>{const v=formDataObj(modal),current=readRows();if(!current.length)throw new Error('A grade está vazia.');const nums=current.map(r=>normalize(r.numero));if(new Set(nums).size!==nums.length)throw new Error('Existem números repetidos na grade.');const existingNumbers=new Set(active(App.state.cheques).map(c=>normalize(c.numero)));const found=current.find(r=>existingNumbers.has(normalize(r.numero)));if(found&&!confirm(`O cheque ${found.numero} já existe. Continuar mesmo assim?`))return;for(const r of current){const item={id:uid(),tipo:v.tipo,status:'Em aberto',numero:r.numero,fornecedorId:v.fornecedorId,pessoa:'',cpfCnpj:'',banco:v.banco,valor:Number(r.valor)||0,dataEmissao:v.dataBase,dataBom:r.data,lote:v.nomeLote,observacoes:v.observacoes,attachments:[],createdAt:nowISO()};recordTouch(item);App.state.cheques.push(item)}logAudit('Lote de cheques criado',`${current.length} cheques · ${v.nomeLote}`,'Lote','');scheduleSave();closeModal();App.chequeTab=v.tipo==='Emitido'?'emitidos':'recebidos';setPage('cheques');toast(`${current.length} cheques gerados e enviados à fila do Drive.`)}});wireQuickSupplier(modal);
  const tbody=$('[data-lote-rows]',modal),total=$('[data-lote-total]',modal);function readRows(){return $$('tr',tbody).map(tr=>({numero:$('[data-r-num]',tr).value.trim(),prazo:Number($('[data-r-days]',tr).value)||0,data:$('[data-r-date]',tr).value,valor:moneyInputNumber($('[data-r-value]',tr).value)})).filter(r=>r.numero)}function draw(data){rows=data;tbody.innerHTML=data.map((r,i)=>`<tr><td><input data-r-num value="${esc(r.numero)}"></td><td><input data-r-days type="number" value="${r.prazo}" min="0"></td><td><input data-r-date type="date" value="${esc(r.data)}"></td><td><div class="money-field compact"><span>R$</span><input data-r-value data-money type="text" inputmode="numeric" value="${esc(moneyDisplay(r.valor))}"></div></td><td><button type="button" class="action-btn danger-text" data-r-remove="${i}">Excluir</button></td></tr>`).join('');wireSmartInputs(tbody);$$('[data-r-days]',tbody).forEach((el,i)=>el.oninput=()=>{const base=$('[name="dataBase"]',modal).value||todayISO();$('[data-r-date]',el.closest('tr')).value=addDays(base,el.value)});$$('[data-r-remove]',tbody).forEach(b=>b.onclick=()=>{const arr=readRows();arr.splice(Number(b.dataset.rRemove),1);draw(arr)});$$('input',tbody).forEach(i=>i.oninput=updateTotal);updateTotal()}function updateTotal(){const a=readRows();total.textContent=`${a.length} cheque(s) · total ${brl(a.reduce((s,r)=>s+r.valor,0))}`}
  function regenerate(){const v=formDataObj(modal),q=Math.max(1,Math.min(120,Number(v.quantidade)||1)),nums=parseChequeSequence(v.primeiroNumero,q),ds=parseDaySequence(v.prazos,q);draw(nums.map((n,i)=>({numero:n,prazo:ds[i],data:addDays(v.dataBase,ds[i]),valor:Number(v.valor)||0})))}$('[data-lote-regerar]',modal).onclick=regenerate;$('[data-lote-add]',modal).onclick=()=>{const arr=readRows(),last=arr[arr.length-1]||{numero:$('[name="primeiroNumero"]',modal).value,prazo:0,data:$('[name="dataBase"]',modal).value,valor:moneyInputNumber($('[name="valor"]',modal).value)};let next=parseChequeSequence(last.numero,2)[1];arr.push({numero:next,prazo:last.prazo+30,data:addDays($('[name="dataBase"]',modal).value,last.prazo+30),valor:last.valor});draw(arr)};regenerate()};

openBoleto=function(id=''){const existing=id?active(App.state.boletos).find(x=>x.id===id):null,x=existing||{status:'Em aberto',dataCadastro:todayISO(),vencimento:todayISO(),valor:'',attachments:[]},temp=[],removed=[];const body=`<div class="form-grid cols-3">${supplierOptions(x.fornecedorId||'')}${field('beneficiario','Beneficiário / nome livre',x.beneficiario||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${field('documento','Número do documento',x.documento||'')}${field('nossoNumero','Nosso número',x.nossoNumero||'')}${field('banco','Banco',x.banco||'')}${field('dataCadastro','Data de cadastro',x.dataCadastro||todayISO(),'date')}${field('valor','Valor original',x.valor||'','number','step="0.01" min="0"')}${field('vencimento','Vencimento',x.vencimento||todayISO(),'date')}${selectField('status','Status',['Em aberto','Pago','Vencido','Cancelado'],x.status)}${field('dataPagamento','Data do pagamento',x.dataPagamento||'','date')}${field('valorPago','Valor pago',x.valorPago||'','number','step="0.01" min="0"')}${field('juros','Juros',x.juros||'','number','step="0.01" min="0"')}${field('multa','Multa',x.multa||'','number','step="0.01" min="0"')}${field('desconto','Desconto',x.desconto||'','number','step="0.01" min="0"')}${field('formaPagamento','Forma de pagamento',x.formaPagamento||'')}${field('linhaDigitavel','Linha digitável / código de barras',x.linhaDigitavel||'','text','full autocomplete="off"')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;const modal=openModal({title:existing?'Editar boleto':'Novo boleto',subtitle:'Foto, PDF e código serão conferidos antes de salvar no Drive.',body,saveLabel:existing?'Salvar alterações':'Cadastrar boleto',onSave:async modal=>{const v=formDataObj(modal);if(!v.linhaDigitavel.trim()&&!temp.length&&!existing?.attachments?.length)throw new Error('Informe a linha digitável ou anexe uma foto/PDF.');const validation=v.linhaDigitavel?validateBoletoLine(v.linhaDigitavel):{valid:true,errors:[],warnings:[]};if(v.linhaDigitavel&&!validation.valid&&!confirm('A linha digitável apresenta erro: '+validation.errors.join(' ')+' Salvar mesmo assim?'))return;const code=digits(v.linhaDigitavel),dup=active(App.state.boletos).find(b=>b.id!==existing?.id&&code&&digits(b.linhaDigitavel)===code);if(dup&&!confirm('Este boleto já está cadastrado. Salvar duplicado mesmo assim?'))return;if(v.status==='Pago'&&!v.dataPagamento)v.dataPagamento=todayISO();const oldStatus=existing?.status||'',item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};Object.assign(item,v,{valor:Number(v.valor)||0,valorPago:Number(v.valorPago)||0,juros:Number(v.juros)||0,multa:Number(v.multa)||0,desconto:Number(v.desconto)||0,linhaDigitavel:code});item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}recordTouch(item);await attachFiles(item,temp,'boleto');if(!existing)App.state.boletos.push(item);logAudit(existing?'Boleto atualizado':'Boleto cadastrado',`${item.documento||item.beneficiario||'Boleto'} · ${brl(item.valor)}`,'Boleto',item.id);if(oldStatus&&oldStatus!==item.status)logAudit('Status do boleto alterado',`${oldStatus} → ${item.status}`,'Boleto',item.id);scheduleSave();closeModal();renderAll();toast('Boleto salvo; sincronização com o Drive agendada.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Boleto excluído',existing.documento||existing.beneficiario,'Boleto',existing.id);scheduleSave();closeModal();renderAll()}:null});wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);wireSupplierMasks(modal);const line=$('[name="linhaDigitavel"]',modal);line.addEventListener('input',()=>{line.value=digits(line.value).slice(0,48);const info=boletoInfoFromDigits(line.value);if(info.valor&&moneyInputNumber($('[name="valor"]',modal).value)===0)setMoneyInputValue($('[name="valor"]',modal),info.valor);if(info.vencimento&&!$('[name="vencimento"]',modal).value)$('[name="vencimento"]',modal).value=info.vencimento;const p=$('[data-scan-progress]',modal);if([44,47,48].includes(digits(line.value).length)){const val=validateBoletoLine(line.value);p.hidden=false;p.textContent=val.valid?'Código válido.':'Atenção: '+val.errors.join(' ')}});wireDropZone(modal,files=>{files.filter(f=>f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')).forEach(file=>temp.push({file,url:URL.createObjectURL(file),role:'boleto'}));renderTempFiles(modal,temp);if(temp.length){const p=$('[data-scan-progress]',modal);p.hidden=false;p.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo agora</button>';$('[data-scan-now]',modal).onclick=()=>scanIntoForm(modal,temp[0].file,'boleto').catch(e=>toast(e.message,'error',6000))}})};

showViewer=async function(record,type){const atts=record.attachments||[],party=supplierById(record.fornecedorId)?.nome||record.pessoa||record.beneficiario||'—',history=App.state.audit.filter(a=>a.entityId===record.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const body=`<div class="viewer-layout"><div><div class="document-viewer" data-doc-viewer>${atts.length?'<div class="muted">Carregando documento...</div>':'<div class="empty"><div class="orb">▣</div><b>Sem documento anexado</b></div>'}</div></div><div class="viewer-side"><div class="detail-box"><h4>${esc(type)}</h4>${[['Número / documento',record.numero||record.documento],['Fornecedor / pessoa',party],['Valor',brl(record.valor)],['Data',fmtDate(record.dataBom||record.vencimento)],['Status',record.status],['Banco',record.banco],['Lote',record.lote]].filter(x=>x[1]).map(([a,b])=>`<div class="detail-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><div class="detail-box"><h4>Documentos</h4>${atts.length?atts.map((a,i)=>`<div class="detail-row"><span>${esc(a.role||'documento')}</span><b><button class="action-btn" data-open-att="${i}">${esc(a.name)}</button></b></div>`).join(''):'<div class="muted">Nenhum anexo.</div>'}</div><div class="detail-box timeline"><h4>Histórico</h4>${history.length?history.map(a=>`<div class="timeline-item"><b>${esc(a.action)}</b><span>${esc(a.detail||'')}</span><small>${fmtDateTime(a.createdAt)} · ${esc(a.user||'')}</small></div>`).join(''):'<div class="muted">Sem alterações registradas.</div>'}</div><button class="btn btn-outline" data-edit-record>Editar registro</button><button class="btn btn-outline" data-download-current ${atts.length?'':'disabled'}>Baixar documento aberto</button></div></div>`;const modal=openModal({title:type==='Cheque'?`Cheque ${record.numero||''}`:(record.documento||record.beneficiario||'Boleto'),subtitle:'Documento e histórico dentro do Borion.',body,size:'large'});let current=0,currentUrl='';const openAtt=async index=>{current=index;const att=atts[index];if(!att)return;const viewer=$('[data-doc-viewer]',modal);viewer.innerHTML='<div class="muted">Abrindo documento...</div>';try{const blob=await attachmentBlob(att);if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(blob);viewer.innerHTML=blob.type==='application/pdf'?`<iframe src="${currentUrl}" title="PDF"></iframe>`:`<img src="${currentUrl}" alt="${esc(att.name)}">`}catch(e){viewer.innerHTML=`<div class="empty"><b>Não foi possível abrir</b><p>${esc(e.message)}</p></div>`}};$$('[data-open-att]',modal).forEach(b=>b.onclick=()=>openAtt(Number(b.dataset.openAtt)));$('[data-edit-record]',modal).onclick=()=>{closeModal();type==='Cheque'?openCheque(record.id):openBoleto(record.id)};$('[data-download-current]',modal)?.addEventListener('click',async()=>{const att=atts[current];if(!att)return;downloadBlob(await attachmentBlob(att),att.name)});if(atts.length)openAtt(0)};

Organizer.confirmed=new Set();Organizer.hashes=new Map();Organizer.open=async function(){this.photos.clear();this.assignments.clear();this.confirmed.clear();this.hashes.clear();this.cheques=active(App.state.cheques).filter(x=>!['Compensado','Cancelado'].includes(x.status)).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true}));if(!this.cheques.length){toast('Crie primeiro os cheques do lote.','error');return}const body=`<div class="page-toolbar"><div class="toolbar-left"><button class="btn btn-primary" data-org-pick>Selecionar fotos</button><button class="btn btn-outline" data-org-analyze>Analisar OCR</button><button class="btn btn-outline" data-org-confirm-all>Confirmar todos associados</button></div><div class="toolbar-right"><span class="muted" data-org-status>Nenhuma foto selecionada</span></div></div><input type="file" data-org-files accept="image/*" multiple hidden><div class="organizer"><div class="unmatched" data-unmatched><h3>Fotos não identificadas</h3><div class="organizer-list" data-unmatched-list></div></div><div class="cheque-slots" data-cheque-slots></div></div>`;this.modal=openModal({title:'Organizar fotos dos cheques',subtitle:'Gire, visualize, arraste e confirme cada cheque antes de salvar.',body,size:'large',saveLabel:'Salvar cheques confirmados',onSave:()=>this.save()});const input=$('[data-org-files]',this.modal);$('[data-org-pick]',this.modal).onclick=()=>input.click();input.onchange=()=>this.addFiles(Array.from(input.files||[]));$('[data-org-analyze]',this.modal).onclick=()=>this.analyze();$('[data-org-confirm-all]',this.modal).onclick=()=>{for(const c of this.cheques){if([...this.assignments.values()].some(a=>a.chequeId===c.id))this.confirmed.add(c.id)}this.render()};this.render()};
Organizer.addFiles=async function(files){for(const file of files.filter(f=>f.type.startsWith('image/'))){const hash=await sha256Hex(file);if(this.hashes.has(hash)){toast(`Foto duplicada ignorada: ${file.name}`,'error');continue}const id=uid();this.hashes.set(hash,id);this.photos.set(id,{id,file,url:URL.createObjectURL(file),text:'',confidence:0,rotation:0,hash})}this.autoByFilename();this.render()};
Organizer.rotate=async function(id){const p=this.photos.get(id);if(!p)return;const blob=await imageBlobFromFile(p.file,{max:2600,quality:.9,rotation:90});URL.revokeObjectURL(p.url);p.file=new File([blob],p.file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'});p.url=URL.createObjectURL(p.file);this.render()};
Organizer.remove=function(id){const p=this.photos.get(id);if(!p)return;URL.revokeObjectURL(p.url);this.photos.delete(id);this.assignments.delete(id);this.render()};
Organizer.swap=function(ch){const front=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch&&a.role==='frente'),back=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch&&a.role==='verso');if(front)this.assignments.set(front[0],{chequeId:ch,role:'verso'});if(back)this.assignments.set(back[0],{chequeId:ch,role:'frente'});this.render()};
Organizer.photoHtml=function(p){return`<div class="drag-photo" draggable="true" data-photo-id="${p.id}"><img src="${p.url}" alt=""><div class="photo-tools"><button type="button" data-org-view="${p.id}">Ampliar</button><button type="button" data-org-rotate="${p.id}">Girar</button><button type="button" data-org-remove="${p.id}">Excluir</button></div><div>${esc(p.file.name)}${p.confidence?` · ${Math.round(p.confidence)}%`:''}</div></div>`};
Organizer.slotHtml=function(ch,role,pid){const p=pid?this.photos.get(pid):null;return`<div class="photo-slot" data-slot-cheque="${ch}" data-slot-role="${role}">${p?`<img src="${p.url}" draggable="true" data-photo-id="${p.id}"><span>${role}</span>`:`<div>${role==='frente'?'Solte a frente aqui':'Solte o verso aqui'}</div>`}</div>`};
Organizer.render=function(){if(!this.modal)return;const un=$('[data-unmatched-list]',this.modal),slots=$('[data-cheque-slots]',this.modal),unmatched=[...this.photos.values()].filter(p=>!this.assignments.has(p.id));un.innerHTML=unmatched.length?unmatched.map(p=>this.photoHtml(p)).join(''):'<div class="muted" style="font-size:10px;padding:10px">Nenhuma foto pendente.</div>';slots.innerHTML=this.cheques.map(ch=>{const front=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch.id&&a.role==='frente'),back=[...this.assignments.entries()].find(([,a])=>a.chequeId===ch.id&&a.role==='verso'),confirmed=this.confirmed.has(ch.id);return`<div class="slot-row ${confirmed?'confirmed':''}"><div class="slot-meta"><b>${esc(ch.numero)}</b><small>${esc(supplierById(ch.fornecedorId)?.nome||ch.pessoa||'—')}</small><small>${brl(ch.valor)} · ${fmtDate(ch.dataBom)}</small><div class="slot-buttons"><button type="button" data-org-swap="${ch.id}">Trocar frente/verso</button><button type="button" data-org-confirm="${ch.id}">${confirmed?'Confirmado ✓':'Confirmar cheque'}</button></div></div>${this.slotHtml(ch.id,'frente',front?.[0])}${this.slotHtml(ch.id,'verso',back?.[0])}</div>`}).join('');$('[data-org-status]',this.modal).textContent=`${this.photos.size} foto(s) · ${this.assignments.size} associada(s) · ${this.confirmed.size} cheque(s) confirmado(s)`;this.wireDrag();$$('[data-org-rotate]',this.modal).forEach(b=>b.onclick=e=>{e.stopPropagation();this.rotate(b.dataset.orgRotate)});$$('[data-org-remove]',this.modal).forEach(b=>b.onclick=e=>{e.stopPropagation();this.remove(b.dataset.orgRemove)});$$('[data-org-view]',this.modal).forEach(b=>b.onclick=e=>{e.stopPropagation();window.open(this.photos.get(b.dataset.orgView)?.url,'_blank')});$$('[data-org-swap]',this.modal).forEach(b=>b.onclick=()=>this.swap(b.dataset.orgSwap));$$('[data-org-confirm]',this.modal).forEach(b=>b.onclick=()=>{const id=b.dataset.orgConfirm;this.confirmed.has(id)?this.confirmed.delete(id):this.confirmed.add(id);this.render()})};
Organizer.analyze=async function(){const btn=$('[data-org-analyze]',this.modal);btn.disabled=true;let done=0;for(const p of this.photos.values()){if(this.assignments.has(p.id))continue;$('[data-org-status]',this.modal).textContent=`Analisando ${++done}/${this.photos.size}...`;try{const result=await ocrFile(p.file,()=>{});p.text=result.text;p.confidence=result.confidence;const extracted=extractCheque(result.text),tokens=[digits(extracted.numero),digits(extracted.cmc7),digits(result.text)];const ch=this.cheques.find(c=>{const n=digits(c.numero);return n&&tokens.some(t=>t.includes(n))});if(ch)this.assignments.set(p.id,{chequeId:ch.id,role:this.firstEmptyRole(ch.id)})}catch(e){console.warn(e)}}btn.disabled=false;this.render();toast('Análise concluída. Confira e confirme cada cheque.')};
Organizer.save=async function(){if(!this.confirmed.size)throw new Error('Confirme pelo menos um cheque.');let saved=0;for(const [photoId,a] of this.assignments){if(!this.confirmed.has(a.chequeId))continue;const p=this.photos.get(photoId),ch=this.cheques.find(x=>x.id===a.chequeId);if(!p||!ch)continue;const meta=await storeAttachment(p.file);meta.role=a.role;ch.attachments=ch.attachments||[];const old=ch.attachments.find(x=>x.role===a.role);if(old)old.role='documento';ch.attachments.push(meta);recordTouch(ch);saved++;URL.revokeObjectURL(p.url)}for(const chId of this.confirmed)logAudit('Fotos do cheque confirmadas','Frente/verso conferidos','Cheque',chId);scheduleSave();closeModal();renderAll();toast(`${saved} foto(s) vinculada(s) e enviada(s) à fila do Drive.`)};

function optionsForSuppliers(selected=''){return `<option value="">Todos os fornecedores</option>${active(App.state.fornecedores).map(s=>`<option value="${s.id}" ${selected===s.id?'selected':''}>${esc(s.nome)}</option>`).join('')}`}
renderCheques=function(){const root=$('#page-cheques');if(!root)return;let items=active(App.state.cheques).filter(x=>chequeMatches(x,App.search.cheques));if(App.chequeTab==='emitidos')items=items.filter(x=>x.tipo==='Emitido');if(App.chequeTab==='recebidos')items=items.filter(x=>x.tipo==='Recebido');if(App.chequeTab==='abertos')items=items.filter(x=>!['Compensado','Cancelado'].includes(x.status));if(App.filters.chequeSupplier)items=items.filter(x=>x.fornecedorId===App.filters.chequeSupplier);if(App.filters.chequeStatus)items=items.filter(x=>x.status===App.filters.chequeStatus);if(App.filters.chequeMonth)items=items.filter(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)===App.filters.chequeMonth);items.sort((a,b)=>String(b.dataEmissao||b.createdAt).localeCompare(String(a.dataEmissao||a.createdAt)));const months=[...new Set(active(App.state.cheques).map(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)).filter(Boolean))].sort().reverse();root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar número, fornecedor, banco..." data-search-cheques></div><select class="filter-select" data-filter-ch-supplier>${optionsForSuppliers(App.filters.chequeSupplier)}</select><select class="filter-select" data-filter-ch-status><option value="">Todos os status</option>${['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'].map(s=>`<option ${App.filters.chequeStatus===s?'selected':''}>${s}</option>`).join('')}</select><select class="filter-select" data-filter-ch-month><option value="">Todos os meses</option>${months.map(m=>`<option value="${m}" ${App.filters.chequeMonth===m?'selected':''}>${m.split('-').reverse().join('/')}</option>`).join('')}</select></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.organizePhotos()">Fotos em massa</button><button class="btn btn-outline" onclick="Borion.newLote()">Cheques em lote</button><button class="btn btn-primary" onclick="Borion.newCheque()">＋ Novo cheque</button></div></div><div class="tabs tabs-inline">${[['todos','Todos'],['emitidos','Emitidos'],['recebidos','Recebidos'],['abertos','Em aberto']].map(([v,l])=>`<button class="tab ${App.chequeTab===v?'active':''}" onclick="Borion.chequeTab('${v}')">${l}</button>`).join('')}</div>${items.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Número</th><th>Entregue por / para</th><th>Banco</th><th>Valor</th><th>Emissão</th><th>Bom para</th><th>Status</th><th>Imagem</th><th>Ações</th></tr></thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><span class="badge ${x.tipo==='Recebido'?'received':'open'}">${esc(x.tipo)}</span></td><td><b>${esc(x.numero||'—')}</b>${x.lote?`<div class="muted">${esc(x.lote)}</div>`:''}</td><td>${esc(sup?.nome||x.pessoa||'—')}</td><td>${esc(x.banco||'—')}</td><td class="money">${brl(x.valor)}</td><td>${fmtDate(x.dataEmissao)}</td><td class="${daysUntil(x.dataBom)<0&&!['Compensado','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.dataBom)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem foto</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editCheque('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="panel"><div class="empty"><b>Nenhum cheque encontrado</b></div></div>'}`;$('[data-search-cheques]',root).oninput=e=>{App.search.cheques=e.target.value;renderCheques()};$('[data-filter-ch-supplier]',root).onchange=e=>{App.filters.chequeSupplier=e.target.value;renderCheques()};$('[data-filter-ch-status]',root).onchange=e=>{App.filters.chequeStatus=e.target.value;renderCheques()};$('[data-filter-ch-month]',root).onchange=e=>{App.filters.chequeMonth=e.target.value;renderCheques()}};
renderBoletos=function(){const root=$('#page-boletos');if(!root)return;let items=active(App.state.boletos).filter(x=>boletoMatches(x,App.search.boletos));if(App.boletoTab==='abertos')items=items.filter(x=>!['Pago','Cancelado'].includes(x.status));if(App.boletoTab==='pagos')items=items.filter(x=>x.status==='Pago');if(App.boletoTab==='vencidos')items=items.filter(x=>x.vencimento&&daysUntil(x.vencimento)<0&&!['Pago','Cancelado'].includes(x.status));if(App.filters.boletoSupplier)items=items.filter(x=>x.fornecedorId===App.filters.boletoSupplier);if(App.filters.boletoStatus)items=items.filter(x=>x.status===App.filters.boletoStatus);if(App.filters.boletoMonth)items=items.filter(x=>String(x.dataCadastro||x.vencimento||'').slice(0,7)===App.filters.boletoMonth);items.sort((a,b)=>String(b.dataCadastro||b.createdAt).localeCompare(String(a.dataCadastro||a.createdAt)));const months=[...new Set(active(App.state.boletos).map(x=>String(x.dataCadastro||x.vencimento||'').slice(0,7)).filter(Boolean))].sort().reverse();root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.boletos)}" placeholder="Buscar beneficiário, documento, código..." data-search-boletos></div><select class="filter-select" data-filter-bo-supplier>${optionsForSuppliers(App.filters.boletoSupplier)}</select><select class="filter-select" data-filter-bo-status><option value="">Todos os status</option>${['Em aberto','Pago','Vencido','Cancelado'].map(s=>`<option ${App.filters.boletoStatus===s?'selected':''}>${s}</option>`).join('')}</select><select class="filter-select" data-filter-bo-month><option value="">Todos os meses</option>${months.map(m=>`<option value="${m}" ${App.filters.boletoMonth===m?'selected':''}>${m.split('-').reverse().join('/')}</option>`).join('')}</select></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.focusBarcode()">Usar leitor USB</button><button class="btn btn-primary" onclick="Borion.newBoleto()">＋ Novo boleto</button></div></div><div class="tabs tabs-inline">${[['todos','Todos'],['abertos','Em aberto'],['pagos','Pagos'],['vencidos','Vencidos']].map(([v,l])=>`<button class="tab ${App.boletoTab===v?'active':''}" onclick="Borion.boletoTab('${v}')">${l}</button>`).join('')}</div>${items.length?`<div class="table-wrap"><table><thead><tr><th>Beneficiário / fornecedor</th><th>Documento</th><th>Linha digitável</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Arquivo</th><th>Ações</th></tr></thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><b>${esc(sup?.nome||x.beneficiario||'—')}</b><div class="muted">${esc(x.cpfCnpj||'')}</div></td><td>${esc(x.documento||'—')}</td><td><span title="${esc(x.linhaDigitavel||'')}">${x.linhaDigitavel?esc(x.linhaDigitavel.slice(0,18))+'…':'—'}</span></td><td class="money">${brl(x.valor)}</td><td class="${x.vencimento&&daysUntil(x.vencimento)<0&&!['Pago','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.vencimento)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewBoleto('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem arquivo</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewBoleto('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editBoleto('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="panel"><div class="empty"><b>Nenhum boleto encontrado</b></div></div>'}`;$('[data-search-boletos]',root).oninput=e=>{App.search.boletos=e.target.value;renderBoletos()};$('[data-filter-bo-supplier]',root).onchange=e=>{App.filters.boletoSupplier=e.target.value;renderBoletos()};$('[data-filter-bo-status]',root).onchange=e=>{App.filters.boletoStatus=e.target.value;renderBoletos()};$('[data-filter-bo-month]',root).onchange=e=>{App.filters.boletoMonth=e.target.value;renderBoletos()}};

renderBackup=function(){const root=$('#page-backup');if(!root)return;root.innerHTML=`<div class="grid-2"><section class="panel"><div class="panel-head"><div class="panel-title">Backups no Google Drive</div></div><div class="panel-body"><div class="config-section"><h3>Backup automático diário</h3><p>O Borion salva um JSON criptografado por dia em Sistema / Backups / ano / mês. Fotos e PDFs permanecem nas pastas mensais e são referenciados pelo backup.</p><div class="status-line"><span class="sync-dot ${App.drive.connected?'ok':'error'}"></span><div><b>${App.drive.connected?'Drive conectado':'Entre com o Google'}</b><small>Último backup: ${esc(App.state.settings.lastDriveBackupDate||'ainda não criado')}</small></div></div><button class="btn btn-primary btn-block" onclick="Borion.driveBackup()">Criar backup no Drive agora</button></div><div class="config-section"><h3>Exportação externa</h3><p>Gera um ZIP descriptografado para guardar em pendrive ou outra pasta.</p><button class="btn btn-outline" onclick="Borion.exportBackup()">Exportar ZIP completo</button><button class="btn btn-outline" onclick="Borion.importBackup()">Restaurar ZIP</button></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Chave da equipe</div></div><div class="panel-body"><div class="config-section"><h3>Novo computador</h3><p>O computador do seu pai importa esta chave uma única vez para abrir os arquivos criptografados. Não há senha mestra diária.</p><button class="btn btn-outline" onclick="Borion.exportTeamKey()">Exportar chave da equipe</button><button class="btn btn-outline btn-block" onclick="Borion.importTeamKey()">Importar chave da equipe</button></div></div></section></div>`};
renderConfig=function(){
  const root=$('#page-config');if(!root)return;
  const rootId=App.drive.rootId||App.state.settings.rootFolderId||'';
  const connected=App.drive.connected;
  root.innerHTML=`
    <div class="settings-grid">
      <section class="settings-card drive-primary">
        <div class="settings-card-head">
          <div class="settings-icon">☁</div>
          <div><h3>Google Drive oficial</h3><p>O acesso é feito exclusivamente pelo Google OAuth configurado no projeto.</p></div>
          <span class="connection-pill ${connected?'connected':'disconnected'}">${connected?'Conectado':'Desconectado'}</span>
        </div>
        <div class="settings-details">
          <div><span>Conta conectada</span><b>${esc(App.user?.email||'Entre novamente com o Google')}</b></div>
          <div><span>Pasta automática</span><b>Borion CNPJ</b></div>
          <div><span>ID da pasta</span><b class="mono">${esc(rootId||'Criado no primeiro acesso')}</b></div>
          <div><span>Armazenamento</span><b>JSON, backups, fotos e PDFs</b></div>
        </div>
        <div class="settings-actions">
          ${connected?'<button class="btn btn-outline" onclick="Borion.reconnectGoogle()">Trocar conta Google</button>':''}
          <button class="btn btn-primary" onclick="Borion.prepareDrive()">Verificar estrutura no Drive</button>
        </div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="settings-icon">⚙</div>
          <div><h3>Preferências da empresa</h3><p>Ajustes visuais e operacionais salvos junto ao Borion.</p></div>
        </div>
        <div class="form-grid settings-form">
          <div class="field full"><label for="cfg-company">Nome da empresa</label><input id="cfg-company" value="${esc(App.state.settings.companyName||'Borion CNPJ')}" autocomplete="organization"></div>
          <div class="field"><label for="cfg-warning">Alertar com antecedência</label><select id="cfg-warning">${[3,5,7,10,15,30].map(v=>`<option value="${v}" ${Number(App.state.settings.warningDays||7)===v?'selected':''}>${v} dias</option>`).join('')}</select></div>
          <div class="field"><label for="cfg-image-quality">Qualidade das fotos</label><select id="cfg-image-quality">${[[.72,'Econômica'],[.82,'Equilibrada'],[.86,'Alta'],[.92,'Máxima']].map(([v,l])=>`<option value="${v}" ${Math.abs(Number(App.state.settings.imageQuality||.86)-v)<.001?'selected':''}>${l} · ${String(v).replace('.',',')}</option>`).join('')}</select></div>
          <div class="field"><label for="cfg-image-max">Resolução máxima</label><select id="cfg-image-max">${[[1600,'1600 px'],[2000,'2000 px'],[2400,'2400 px'],[3200,'3200 px'],[4000,'4000 px']].map(([v,l])=>`<option value="${v}" ${Number(App.state.settings.maxImageDimension||2400)===v?'selected':''}>${l}</option>`).join('')}</select></div>
          <label class="borion-switch full"><input id="cfg-auto-sync" type="checkbox" ${App.state.settings.autoSync?'checked':''}><span class="switch-track"></span><span><b>Sincronização automática</b><small>Enviar cada alteração ao Drive assim que ela for salva.</small></span></label>
        </div>
        <div class="settings-actions"><button class="btn btn-primary" onclick="Borion.saveDriveConfig()">Salvar preferências</button></div>
      </section>

      <section class="settings-card full-width">
        <div class="settings-card-head">
          <div class="settings-icon">▦</div>
          <div><h3>Estrutura criada automaticamente</h3><p>Nenhum link ou ID precisa ser digitado manualmente.</p></div>
        </div>
        <div class="drive-tree">
          <div><b>Borion CNPJ</b></div>
          <div class="level-1">Sistema / Dados / current.json.borion</div>
          <div class="level-1">Sistema / Backups / ano / mês</div>
          <div class="level-1">Cheques / ano / mês</div>
          <div class="level-1">Boletos / ano / mês</div>
        </div>
      </section>
    </div>`;
};




// ---------- Versão 1.0.15: Drive resiliente, redundância e contas de cheque ----------
const V104_LOCAL_STATE_KEY='borion_cnpj_state_v2';
const V104_LOCAL_LAST_GOOD_KEY='borion_cnpj_state_v2_last_good';

function migrateStateV104(raw){
  const base=blankState();
  const out=Object.assign(base,raw||{});
  out.meta={...base.meta,...(raw?.meta||{}),version:CFG.version||'1.0.23'};
  out.settings={...base.settings,...(raw?.settings||{})};
  out.settings.chequeAccounts=Array.isArray(out.settings.chequeAccounts)?out.settings.chequeAccounts:[];
  out.settings.autoSync=out.settings.autoSync!==false;
  out.settings.warningDays=Number(out.settings.warningDays||7);
  out.fornecedores=Array.isArray(out.fornecedores)?out.fornecedores:[];
  out.cheques=Array.isArray(out.cheques)?out.cheques:[];
  out.boletos=Array.isArray(out.boletos)?out.boletos:[];
  out.audit=Array.isArray(out.audit)?out.audit:[];
  out.deleted=Array.isArray(out.deleted)?out.deleted:[];
  const accounts=out.settings.chequeAccounts;
  const byLegacy=new Map(accounts.map(a=>[[a.banco,a.agencia,a.conta].map(v=>normalize(v)).join('|'),a]));
  for(const cheque of out.cheques){
    if(cheque.contaId) continue;
    const legacy=[cheque.banco,cheque.agencia,cheque.conta];
    if(!legacy.some(Boolean)){ cheque.contaId=''; continue; }
    const key=legacy.map(v=>normalize(v)).join('|');
    let account=byLegacy.get(key);
    if(!account){
      account={id:uid(),nome:cheque.banco||'Conta de cheque',banco:cheque.banco||'',agencia:cheque.agencia||'',conta:cheque.conta||'',ativo:true,createdAt:nowISO(),updatedAt:nowISO()};
      accounts.push(account);byLegacy.set(key,account);
    }
    cheque.contaId=account.id;
  }
  return out;
}

function chequeAccounts(includeInactive=false){
  const list=App.state?.settings?.chequeAccounts||[];
  return includeInactive?list:list.filter(x=>x.ativo!==false);
}
function accountById(id){return chequeAccounts(true).find(x=>x.id===id)||null}
function accountLabel(account){
  if(!account)return '--';
  const title=account.nome||account.banco||'Conta de cheque';
  const detail=[account.banco,account.agencia?`Ag. ${account.agencia}`:'',account.conta?`Conta ${account.conta}`:''].filter(Boolean).join(' · ');
  return detail&&normalize(detail)!==normalize(title)?`${title} · ${detail}`:title;
}
function accountLabelForCheque(cheque){
  const found=accountById(cheque?.contaId);
  if(found)return accountLabel(found);
  const legacy=[cheque?.banco,cheque?.agencia?`Ag. ${cheque.agencia}`:'',cheque?.conta?`Conta ${cheque.conta}`:''].filter(Boolean).join(' · ');
  return legacy||'--';
}
function chequeAccountSelectField(name='contaId',label='Conta de cheque',selected='',extra=''){
  const options=[{value:'',label:'--'},...chequeAccounts(true).map(a=>({value:a.id,label:accountLabel(a)+(a.ativo===false?' · inativa':'')}))];
  return selectField(name,label,options,selected,extra);
}

openDB=function(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('borion_cnpj_db',2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('attachments'))db.createObjectStore('attachments',{keyPath:'id'});
      if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});
    };
    req.onsuccess=()=>{App.db=req.result;resolve(App.db)};
    req.onerror=()=>reject(req.error);
  });
};
async function persistLocalSnapshot(reason='alteracao'){
  if(!App.db||!App.db.objectStoreNames.contains('snapshots'))return;
  const row={id:`${Date.now()}_${uid()}`,createdAt:nowISO(),reason,revision:Number(App.state.meta?.revision||0),state:JSON.stringify(App.state)};
  await new Promise((resolve,reject)=>{const r=App.db.transaction('snapshots','readwrite').objectStore('snapshots').put(row);r.onsuccess=resolve;r.onerror=()=>reject(r.error)});
  const all=await new Promise((resolve,reject)=>{const r=App.db.transaction('snapshots').objectStore('snapshots').getAllKeys();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
  if(all.length>80){const remove=all.sort().slice(0,all.length-80);await new Promise((resolve,reject)=>{const tx=App.db.transaction('snapshots','readwrite'),st=tx.objectStore('snapshots');remove.forEach(k=>st.delete(k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
}
saveLocal=async function(reason='alteracao',bumpRevision=true){
  App.state=migrateStateV104(App.state);
  App.state.meta.updatedAt=nowISO();
  if(bumpRevision)App.state.meta.revision=Number(App.state.meta.revision||0)+1;
  const json=JSON.stringify(App.state);
  localStorage.setItem(V104_LOCAL_STATE_KEY,json);
  localStorage.setItem(V104_LOCAL_LAST_GOOD_KEY,json);
  try{await persistLocalSnapshot(reason)}catch(e){console.warn('Snapshot local não criado',e)}
  updateSyncUI(App.drive.connected?'ok':'local',App.drive.connected?'Salvo localmente · enviando ao Drive':'Salvo neste computador',App.drive.connected?'Nenhuma alteração será perdida se a internet cair.':'Entre com o Google para copiar ao Drive.');
};
loadLocal=async function(){
  let raw=localStorage.getItem(V104_LOCAL_STATE_KEY)||localStorage.getItem(V104_LOCAL_LAST_GOOD_KEY);
  if(raw){
    try{App.state=migrateStateV104(JSON.parse(raw));return}catch(e){console.warn('Estado v2 inválido',e)}
  }
  const legacy=localStorage.getItem('borion_cnpj_state_enc');
  if(legacy){
    try{await loadTeamKey();App.state=migrateStateV104(await decryptJson(JSON.parse(legacy)));await saveLocal('migracao-1.0.3',false);toast('Cheques antigos preservados e migrados para a versão nova.');return}catch(e){console.warn('Migração antiga falhou',e)}
  }
  App.state=migrateStateV104(blankState());
  await saveLocal('primeiro-acesso',false);
};
scheduleSave=function(sync=true){
  clearTimeout(App.saveTimer);
  App.saveTimer=setTimeout(()=>{App.saveTimer=null;saveLocal('alteracao').catch(e=>console.error(e))},0);
  if(sync&&App.state.settings.autoSync&&App.drive.connected)scheduleSync();
};
scheduleSync=function(){
  clearTimeout(App.syncTimer);
  App.syncTimer=setTimeout(()=>{App.syncTimer=null;Drive.sync().catch(e=>{console.error(e);updateSyncUI('error','Salvo localmente','Falha no Drive · os dados continuam neste computador');toast('Falha no Drive. Seus dados continuam salvos neste computador. '+e.message,'error',7000)});},900);
};

storeAttachment=async function(file){
  const id=uid(),prepared=await prepareImageAttachment(file);
  const row={id,name:prepared.main.name||file.name||'arquivo',originalName:file.name||'arquivo',type:prepared.main.type||file.type||'application/octet-stream',size:prepared.main.size||file.size||0,originalSize:prepared.originalSize,blob:prepared.main,thumbBlob:prepared.thumb||null,createdAt:nowISO()};
  await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put(row);r.onsuccess=resolve;r.onerror=()=>reject(r.error)});
  return {id,name:row.name,originalName:row.originalName,type:row.type,size:row.size,originalSize:row.originalSize,createdAt:row.createdAt,driveFileId:'',driveThumbFileId:'',driveName:'',pendingUpload:true,role:'documento',encrypted:false};
};
getAttachmentBlob=async function(id){
  const row=await new Promise((resolve,reject)=>{const r=idbTx().get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  if(!row)throw new Error('Anexo local não encontrado.');
  if(row.blob)return row.blob;
  if(row.data){const plain=await decryptEnvelope({iv:row.iv,data:row.data});return new Blob([plain],{type:row.type||'application/octet-stream'})}
  throw new Error('Formato de anexo local desconhecido.');
};
getAttachmentThumbnailBlob=async function(id){
  const row=await new Promise((resolve,reject)=>{const r=idbTx().get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  if(!row)return null;
  if(row.thumbBlob)return row.thumbBlob;
  if(row.thumbData){const plain=await decryptEnvelope({iv:row.thumbIv,data:row.thumbData});return new Blob([plain],{type:row.thumbType||'image/jpeg'})}
  return null;
};

Drive.ensureStructure=async function(){
  const root=App.drive.rootId||await Drive.resolveRoot();
  const system=await Drive.ensureFolder(root,'Sistema');
  const data=await Drive.ensureFolder(system.id,'Dados');
  const backups=await Drive.ensureFolder(system.id,'Backups');
  const history=await Drive.ensureFolder(system.id,'Histórico');
  const operations=await Drive.ensureFolder(system.id,'Operações');
  const cheques=await Drive.ensureFolder(root,'Cheques');
  const boletos=await Drive.ensureFolder(root,'Boletos');
  return {root,system:system.id,data:data.id,backups:backups.id,history:history.id,operations:operations.id,cheques:cheques.id,boletos:boletos.id};
};
Drive.uploadJson=async function(parentId,name,obj,existingId=''){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  return Drive.uploadMultipart(parentId,name,blob,'application/json',existingId);
};
Drive.readJson=async function(file){
  if(!file)return null;
  const raw=new TextDecoder().decode(await Drive.downloadFile(file.id));
  return JSON.parse(raw);
};
Drive.syncAttachments=async function(structure){
  const records=[...active(App.state.cheques).map(x=>({type:'Cheque',record:x,base:structure.cheques})),...active(App.state.boletos).map(x=>({type:'Boleto',record:x,base:structure.boletos}))];
  for(const pack of records){
    for(const att of pack.record.attachments||[]){
      if(!att.pendingUpload||att.driveFileId)continue;
      let plain;try{plain=await getAttachmentBlob(att.id)}catch(e){console.warn(e);continue}
      const monthId=await Drive.monthFolder(pack.base,recordMovementDate(pack.record,pack.type));
      const safeNumber=safeFilePart(pack.record.numero||pack.record.documento||pack.record.id);
      const ext=(att.name.match(/\.[a-zA-Z0-9]{1,6}$/)||[''])[0];
      const remoteName=`${safeNumber}_${safeFilePart(att.role||'documento')}_${safeFilePart((att.name||'arquivo').replace(ext,''))}${ext}`;
      const uploaded=await Drive.uploadMultipart(monthId,remoteName,plain,att.type||plain.type||'application/octet-stream');
      att.driveFileId=uploaded.id;att.driveName=remoteName;att.pendingUpload=false;att.encrypted=false;recordTouch(pack.record);
    }
  }
};
Drive.fetchRemoteAttachment=async function(att){
  if(!att.driveFileId)throw new Error('Documento não está no Drive.');
  const bytes=await Drive.downloadFile(att.driveFileId);
  if(att.encrypted||String(att.driveName||'').endsWith('.borion')){
    const pack=JSON.parse(new TextDecoder().decode(bytes));
    const plain=await decryptEnvelope({iv:pack.iv,data:pack.data});return new Blob([plain],{type:pack.type||att.type});
  }
  return new Blob([bytes],{type:att.type||'application/octet-stream'});
};
Drive.createSnapshot=async function(structure,prefix='AUTO'){
  const folder=await Drive.monthFolder(structure.backups,todayISO());
  const stamp=nowISO().replace(/[:.]/g,'-');
  const name=`${prefix}_${todayISO()}_${stamp}_R${Number(App.state.meta.revision||0)}.json`;
  await Drive.uploadJson(folder,name,{app:'Borion CNPJ',version:CFG.version||'1.0.23',kind:prefix,createdAt:nowISO(),user:App.user?.email||'',state:App.state});
  return name;
};
let driveRefreshTimer=0;
function startDriveRefreshLoop(){
  clearInterval(driveRefreshTimer);
  setTimeout(()=>{if(App.drive.connected&&navigator.onLine)Drive.pull(false,true).catch(console.warn)},900);
  driveRefreshTimer=setInterval(()=>{
    if(App.drive.connected && !document.hidden && navigator.onLine)Drive.pull(false,false).catch(e=>console.warn('Atualização automática falhou',e));
  },10000);
}
function stopDriveRefreshLoop(){clearInterval(driveRefreshTimer);driveRefreshTimer=0;}
function refreshDriveOnResume(){
  if(App.drive.connected && !document.hidden && navigator.onLine)Drive.pull(false,true).catch(e=>console.warn('Atualização ao retomar falhou',e));
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDriveOnResume()});
window.addEventListener('focus',refreshDriveOnResume);
window.addEventListener('online',refreshDriveOnResume);
window.addEventListener('pageshow',refreshDriveOnResume);
document.addEventListener('resume',refreshDriveOnResume);

Drive.manualBackup=async function(){
  if(!App.drive.connected)throw new Error('Entre com o Google primeiro.');
  const structure=await Drive.ensureStructure();await Drive.createSnapshot(structure,'MANUAL');App.state.settings.lastDriveBackupDate=nowISO();await saveLocal('backup-manual',false);renderBackup();toast('Backup manual criado no Google Drive.');
};

function openChequeAccount(id=''){
  const existing=id?chequeAccounts(true).find(x=>x.id===id):null;
  const x=existing||{ativo:true};
  const body=`<div class="form-grid cols-2">${field('nome','Nome da conta',x.nome||'')}${field('banco','Banco',x.banco||'')}${field('agencia','Agência',x.agencia||'')}${field('conta','Conta',x.conta||'')}<label class="borion-switch full"><input name="ativo" type="checkbox" ${x.ativo!==false?'checked':''}><span class="switch-track"></span><span><b>Conta ativa</b><small>Contas inativas continuam aparecendo nos cheques antigos.</small></span></label></div>`;
  openModal({title:existing?'Editar conta de cheque':'Nova conta de cheque',subtitle:'Cadastre uma vez e apenas selecione nos cheques.',body,saveLabel:'Salvar conta',onSave:async modal=>{const v=formDataObj(modal);if(!v.nome.trim()&&!v.banco.trim())throw new Error('Informe um nome ou banco para a conta.');const item=existing||{id:uid(),createdAt:nowISO()};Object.assign(item,v,{ativo:v.ativo!==false});recordTouch(item);if(!existing)App.state.settings.chequeAccounts.push(item);logAudit(existing?'Conta atualizada':'Conta cadastrada',accountLabel(item),'Conta',item.id);scheduleSave();closeModal();renderConfig();toast('Conta de cheque salva.');},onDelete:existing?async()=>{existing.ativo=false;recordTouch(existing);scheduleSave();closeModal();renderConfig();toast('Conta desativada.');}:null});
}

openCheque=function(id=''){
  const existing=id?active(App.state.cheques).find(x=>x.id===id):null;
  const x=existing||{tipo:'Emitido',status:'Em aberto',dataEmissao:todayISO(),dataBom:todayISO(),valor:'',attachments:[],contaId:''};
  const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],x.tipo)}${field('numero','Número do cheque',x.numero||'')}${field('valor','Valor',x.valor||'')}${supplierOptions(x.fornecedorId||'')}${field('pessoa','Nome livre (opcional)',x.pessoa||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${chequeAccountSelectField('contaId','Conta de cheque',x.contaId||'')}${field('cmc7','CMC7',x.cmc7||'')}${field('dataEmissao','Data de emissão/recebimento',x.dataEmissao||todayISO(),'date')}${field('dataBom','Bom para / vencimento',x.dataBom||todayISO(),'date')}${field('dataCompensacao','Data de compensação',x.dataCompensacao||'','date')}${selectField('status','Status',['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'],x.status)}${field('lote','Lote',x.lote||'')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({title:existing?'Editar cheque':'Novo cheque',subtitle:'A conta é selecionada entre as cadastradas em Configurações.',body,saveLabel:existing?'Salvar alterações':'Cadastrar cheque',onSave:async modal=>{const v=formDataObj(modal);if(!v.numero.trim())throw new Error('Informe o número do cheque.');if(v.cpfCnpj&&!docValid(v.cpfCnpj))throw new Error('CPF/CNPJ inválido.');const item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};Object.assign(item,v,{valor:Number(v.valor)||0,contaId:v.contaId||''});delete item.banco;delete item.agencia;delete item.conta;item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}recordTouch(item);await attachFiles(item,temp,'frente');if(!existing)App.state.cheques.push(item);logAudit(existing?'Cheque atualizado':'Cheque cadastrado',`${item.numero} · ${brl(item.valor)}`,'Cheque',item.id);await saveLocal(existing?'cheque-editado':'cheque-cadastrado');if(App.drive.connected)scheduleSync();closeModal();renderAll();toast('Cheque salvo neste computador e enviado à fila do Drive.');},onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Cheque excluído',existing.numero,'Cheque',existing.id);scheduleSave();closeModal();renderAll()}:null});
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);
  wireDropZone(modal,files=>{files.filter(f=>f.type.startsWith('image/')||f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf')).forEach(file=>temp.push({file,url:URL.createObjectURL(file),role:'frente'}));renderTempFiles(modal,temp);if(temp.length){const progress=$('[data-scan-progress]',modal);progress.hidden=false;progress.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo e sugerir dados</button>'; $('[data-scan-now]',modal).onclick=()=>scanIntoForm(modal,temp[0].file,'cheque').catch(e=>toast(e.message,'error',6000));}});
};

openLote=function(){
  let rows=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],'Emitido')}${field('primeiroNumero','Primeiro número','SU 105120','','required')}${field('quantidade','Quantidade','5','number','min="1" max="120"')}${supplierOptions('')}${chequeAccountSelectField('contaId','Conta de cheque','')}${field('valor','Valor padrão','')}${field('dataBase','Data base',todayISO(),'date')}${field('prazos','Prazos em dias','30, 45, 60','text','full')}${field('nomeLote','Nome do lote','Lote '+new Date().toLocaleDateString('pt-BR'),'text','full')}${textArea('observacoes','Observações','')}</div><div class="lote-actions"><button type="button" class="btn btn-outline btn-sm" data-lote-regerar>Regerar grade</button><button type="button" class="btn btn-outline btn-sm" data-lote-add>Adicionar linha</button><span class="muted" data-lote-total></span></div><div class="table-wrap lote-grid"><table><thead><tr><th>Número</th><th>Prazo</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody data-lote-rows></tbody></table></div>`;
  const modal=openModal({title:'Gerar cheques em lote',subtitle:'Confira e edite cada número, prazo, data e valor antes de salvar.',body,size:'large',saveLabel:'Gerar cheques confirmados',onSave:async modal=>{const v=formDataObj(modal),current=readRows();if(!current.length)throw new Error('A grade está vazia.');const nums=current.map(r=>normalize(r.numero));if(new Set(nums).size!==nums.length)throw new Error('Existem números repetidos na grade.');const existingNumbers=new Set(active(App.state.cheques).map(c=>normalize(c.numero)));const found=current.find(r=>existingNumbers.has(normalize(r.numero)));if(found&&!confirm(`O cheque ${found.numero} já existe. Continuar mesmo assim?`))return;for(const r of current){const item={id:uid(),tipo:v.tipo,status:'Em aberto',numero:r.numero,fornecedorId:v.fornecedorId,pessoa:'',cpfCnpj:'',contaId:v.contaId||'',valor:Number(r.valor)||0,dataEmissao:v.dataBase,dataBom:r.data,lote:v.nomeLote,observacoes:v.observacoes,attachments:[],createdAt:nowISO()};recordTouch(item);App.state.cheques.push(item)}logAudit('Lote de cheques criado',`${current.length} cheques · ${v.nomeLote}`,'Lote','');await saveLocal('lote-de-cheques');if(App.drive.connected)scheduleSync();closeModal();App.chequeTab=v.tipo==='Emitido'?'emitidos':'recebidos';setPage('cheques');toast(`${current.length} cheques salvos localmente e enviados à fila do Drive.`)}});
  wireQuickSupplier(modal);
  const readRows=()=>$$('[data-lote-row]',modal).map(tr=>({numero:$('[data-r-numero]',tr).value.trim(),prazo:Number($('[data-r-prazo]',tr).value)||0,data:$('[data-r-data]',tr).value,valor:moneyInputNumber($('[data-r-valor]',tr).value)})).filter(r=>r.numero);
  const renderRows=()=>{const tbody=$('[data-lote-rows]',modal);tbody.innerHTML=rows.map((r,i)=>`<tr data-lote-row><td><input data-r-numero value="${esc(r.numero)}"></td><td><input data-r-prazo type="number" value="${r.prazo}"></td><td><input data-r-data type="date" value="${esc(r.data)}"></td><td><div class="money-field compact"><span>R$</span><input data-r-valor data-money inputmode="numeric" value="${esc(moneyDisplay(r.valor))}"></div></td><td><button type="button" class="action-btn" data-r-remove="${i}">Excluir</button></td></tr>`).join('');wireSmartInputs(tbody);$$('[data-r-remove]',tbody).forEach(b=>b.onclick=()=>{rows.splice(Number(b.dataset.rRemove),1);renderRows()});$('[data-lote-total]',modal).textContent=`${rows.length} cheque(s) · ${brl(rows.reduce((s,r)=>s+Number(r.valor||0),0))}`};
  const regenerate=()=>{const v=formDataObj(modal),q=Math.max(1,Math.min(120,Number(v.quantidade)||1)),nums=parseChequeSequence(v.primeiroNumero,q),ds=parseDaySequence(v.prazos,q);rows=nums.map((numero,i)=>({numero,prazo:ds[i],data:addDays(v.dataBase,ds[i]),valor:Number(v.valor)||0}));renderRows()};
  $('[data-lote-regerar]',modal).onclick=regenerate;$('[data-lote-add]',modal).onclick=()=>{const last=rows[rows.length-1]||{numero:'',prazo:0,data:todayISO(),valor:0};let numero=last.numero;try{numero=parseChequeSequence(last.numero,2)[1]}catch{}rows.push({numero,prazo:last.prazo+30,data:addDays(last.data,last.prazo?30:0),valor:last.valor});renderRows()};regenerate();
};

chequeMatches=function(x,q){const s=normalize([x.numero,accountLabelForCheque(x),x.status,x.pessoa,supplierById(x.fornecedorId)?.nome,x.cpfCnpj,x.lote].join(' '));return!q||s.includes(normalize(q))};
renderCheques=function(){
  const root=$('#page-cheques');if(!root)return;let items=active(App.state.cheques).filter(x=>chequeMatches(x,App.search.cheques));if(App.chequeTab==='emitidos')items=items.filter(x=>x.tipo==='Emitido');if(App.chequeTab==='recebidos')items=items.filter(x=>x.tipo==='Recebido');if(App.chequeTab==='abertos')items=items.filter(x=>!['Compensado','Cancelado'].includes(x.status));if(App.filters.chequeSupplier)items=items.filter(x=>x.fornecedorId===App.filters.chequeSupplier);if(App.filters.chequeStatus)items=items.filter(x=>x.status===App.filters.chequeStatus);if(App.filters.chequeMonth)items=items.filter(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)===App.filters.chequeMonth);items.sort((a,b)=>String(b.dataEmissao||b.createdAt).localeCompare(String(a.dataEmissao||a.createdAt)));const months=[...new Set(active(App.state.cheques).map(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)).filter(Boolean))].sort().reverse();root.innerHTML=`<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar número, fornecedor, conta..." data-search-cheques></div><select class="filter-select" data-filter-ch-supplier>${optionsForSuppliers(App.filters.chequeSupplier)}</select><select class="filter-select" data-filter-ch-status><option value="">Todos os status</option>${['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'].map(s=>`<option ${App.filters.chequeStatus===s?'selected':''}>${s}</option>`).join('')}</select><select class="filter-select" data-filter-ch-month><option value="">Todos os meses</option>${months.map(m=>`<option value="${m}" ${App.filters.chequeMonth===m?'selected':''}>${m.split('-').reverse().join('/')}</option>`).join('')}</select></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.organizePhotos()">Fotos em massa</button><button class="btn btn-outline" onclick="Borion.newLote()">Cheques em lote</button><button class="btn btn-primary" onclick="Borion.newCheque()">＋ Novo cheque</button></div></div><div class="tabs tabs-inline">${[['todos','Todos'],['emitidos','Emitidos'],['recebidos','Recebidos'],['abertos','Em aberto']].map(([v,l])=>`<button class="tab ${App.chequeTab===v?'active':''}" onclick="Borion.chequeTab('${v}')">${l}</button>`).join('')}</div>${items.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Número</th><th>Entregue por / para</th><th>Conta</th><th>Valor</th><th>Emissão</th><th>Bom para</th><th>Status</th><th>Imagem</th><th>Ações</th></tr></thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><span class="badge ${x.tipo==='Recebido'?'received':'open'}">${esc(x.tipo)}</span></td><td><b>${esc(x.numero||'—')}</b>${x.lote?`<div class="muted">${esc(x.lote)}</div>`:''}</td><td>${esc(sup?.nome||x.pessoa||'—')}</td><td>${esc(accountLabelForCheque(x))}</td><td class="money">${brl(x.valor)}</td><td>${fmtDate(x.dataEmissao)}</td><td class="${daysUntil(x.dataBom)<0&&!['Compensado','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.dataBom)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem foto</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editCheque('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="panel"><div class="empty"><b>Nenhum cheque encontrado</b></div></div>'}`;$('[data-search-cheques]',root).oninput=e=>{App.search.cheques=e.target.value;renderCheques()};$('[data-filter-ch-supplier]',root).onchange=e=>{App.filters.chequeSupplier=e.target.value;renderCheques()};$('[data-filter-ch-status]',root).onchange=e=>{App.filters.chequeStatus=e.target.value;renderCheques()};$('[data-filter-ch-month]',root).onchange=e=>{App.filters.chequeMonth=e.target.value;renderCheques()};
};

showViewer=async function(record,type){
  const atts=record.attachments||[],party=supplierById(record.fornecedorId)?.nome||record.pessoa||record.beneficiario||'—',history=App.state.audit.filter(a=>a.entityId===record.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const details=[['Número / documento',record.numero||record.documento],['Fornecedor / pessoa',party],['Conta',type==='Cheque'?accountLabelForCheque(record):record.banco||'--'],['Valor',brl(record.valor)],['Data',fmtDate(record.dataBom||record.vencimento)],['Status',record.status],['Lote',record.lote]].filter(x=>x[1]);
  const body=`<div class="viewer-layout"><div><div class="document-viewer" data-doc-viewer>${atts.length?'<div class="muted">Carregando documento...</div>':'<div class="empty"><div class="orb">▣</div><b>Sem documento anexado</b></div>'}</div></div><div class="viewer-side"><div class="detail-box"><h4>${esc(type)}</h4>${details.map(([a,b])=>`<div class="detail-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><div class="detail-box"><h4>Documentos</h4>${atts.length?atts.map((a,i)=>`<div class="detail-row"><span>${esc(a.role||'documento')}</span><b><button class="action-btn" data-open-att="${i}">${esc(a.name)}</button></b></div>`).join(''):'<div class="muted">Nenhum anexo.</div>'}</div><div class="detail-box timeline"><h4>Histórico</h4>${history.length?history.map(a=>`<div class="timeline-item"><b>${esc(a.action)}</b><span>${esc(a.detail||'')}</span><small>${fmtDateTime(a.createdAt)} · ${esc(a.user||'')}</small></div>`).join(''):'<div class="muted">Sem alterações registradas.</div>'}</div><button class="btn btn-outline" data-edit-record>Editar registro</button><button class="btn btn-outline" data-download-current ${atts.length?'':'disabled'}>Baixar documento aberto</button></div></div>`;
  const modal=openModal({title:type==='Cheque'?`Cheque ${record.numero||''}`:(record.documento||record.beneficiario||'Boleto'),subtitle:'Documento e histórico dentro do Borion.',body,size:'large'});let current=0,currentUrl='';const openAtt=async index=>{current=index;const att=atts[index];if(!att)return;const viewer=$('[data-doc-viewer]',modal);viewer.innerHTML='<div class="muted">Abrindo documento...</div>';try{const blob=await attachmentBlob(att);if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl=URL.createObjectURL(blob);viewer.innerHTML=blob.type==='application/pdf'?`<iframe src="${currentUrl}" title="PDF"></iframe>`:`<img src="${currentUrl}" alt="${esc(att.name)}">`}catch(e){viewer.innerHTML=`<div class="empty"><b>Não foi possível abrir</b><p>${esc(e.message)}</p></div>`}};$$('[data-open-att]',modal).forEach(b=>b.onclick=()=>openAtt(Number(b.dataset.openAtt)));$('[data-edit-record]',modal).onclick=()=>{closeModal();type==='Cheque'?openCheque(record.id):openBoleto(record.id)};$('[data-download-current]',modal)?.addEventListener('click',async()=>{const att=atts[current];if(!att)return;downloadBlob(await attachmentBlob(att),att.name)});if(atts.length)openAtt(0);
};

async function exportChequesImport(){
  const supplierIds=new Set(active(App.state.cheques).map(c=>c.fornecedorId).filter(Boolean));
  const accountIds=new Set(active(App.state.cheques).map(c=>c.contaId).filter(Boolean));
  const payload={app:'Borion CNPJ',format:'cheques-importacao',version:1,exportedAt:nowISO(),fornecedores:active(App.state.fornecedores).filter(f=>supplierIds.has(f.id)),contas:chequeAccounts(true).filter(a=>accountIds.has(a.id)),cheques:active(App.state.cheques).map(c=>({...c,attachments:[]}))};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`BORION_CNPJ_CHEQUES_IMPORTACAO_${todayISO()}.json`);toast(`${payload.cheques.length} cheque(s) exportados para importação.`);
}
async function importChequesFile(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const payload=JSON.parse(await file.text());if(payload.format!=='cheques-importacao'||!Array.isArray(payload.cheques))throw new Error('Arquivo de importação de cheques inválido.');const supplierMap=new Map(),accountMap=new Map();for(const f of payload.fornecedores||[]){let local=active(App.state.fornecedores).find(x=>digits(x.cpfCnpj)&&digits(x.cpfCnpj)===digits(f.cpfCnpj))||active(App.state.fornecedores).find(x=>normalize(x.nome)===normalize(f.nome));if(!local){local={...f,id:uid(),createdAt:f.createdAt||nowISO()};recordTouch(local);App.state.fornecedores.push(local)}supplierMap.set(f.id,local.id)}for(const a of payload.contas||[]){let local=chequeAccounts(true).find(x=>normalize([x.banco,x.agencia,x.conta].join('|'))===normalize([a.banco,a.agencia,a.conta].join('|')));if(!local){local={...a,id:uid(),createdAt:a.createdAt||nowISO()};recordTouch(local);App.state.settings.chequeAccounts.push(local)}accountMap.set(a.id,local.id)}let added=0,updated=0;for(const c of payload.cheques){const key=`${normalize(c.tipo)}|${normalize(c.numero)}|${c.dataEmissao||''}`;let local=active(App.state.cheques).find(x=>`${normalize(x.tipo)}|${normalize(x.numero)}|${x.dataEmissao||''}`===key);const data={...c,id:local?.id||uid(),fornecedorId:supplierMap.get(c.fornecedorId)||'',contaId:accountMap.get(c.contaId)||'',attachments:local?.attachments||[],createdAt:local?.createdAt||c.createdAt||nowISO()};recordTouch(data);if(local){Object.assign(local,data);updated++}else{App.state.cheques.push(data);added++}}logAudit('Cheques importados',`${added} novos · ${updated} atualizados`,'Cheque','');await saveLocal('importacao-cheques');if(App.drive.connected)scheduleSync();renderAll();toast(`${added} cheque(s) importados e ${updated} atualizado(s).`)};input.click();
}

importBackup=async function(){
  const input=document.createElement('input');input.type='file';input.accept='.zip';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(!window.JSZip)throw new Error('Biblioteca de backup não carregou.');toast('Restaurando backup...');const zip=await JSZip.loadAsync(file);const dataFile=zip.file('borion-cnpj-dados.json');if(!dataFile)throw new Error('Este ZIP não contém dados do Borion.');const imported=migrateStateV104(JSON.parse(await dataFile.async('text')));App.state=migrateStateV104(Drive.mergeState(App.state,imported));const files=Object.values(zip.files||{}).filter(x=>!x.dir&&x.name.startsWith('anexos/'));for(const entry of files){const name=entry.name.split('/').pop();const [id,...rest]=name.split('__');const blob=await entry.async('blob');await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put({id,name:rest.join('__')||'arquivo',type:blob.type||'application/octet-stream',size:blob.size,blob,createdAt:nowISO()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}logAudit('Backup restaurado',file.name);await saveLocal('backup-restaurado');if(App.drive.connected)scheduleSync();renderAll();toast('Backup restaurado com sucesso.');};input.click();
};

renderBackup=function(){
  const root=$('#page-backup');if(!root)return;root.innerHTML=`<div class="grid-2"><section class="panel"><div class="panel-head"><div class="panel-title">Proteção automática no Google Drive</div></div><div class="panel-body"><div class="config-section"><h3>Várias camadas de salvamento</h3><p>Cada alteração é salva imediatamente neste aparelho. Antes de atualizar o arquivo principal, o Borion cria snapshots no Drive, além de backups diário e mensal.</p><div class="status-line"><span class="sync-dot ${App.drive.connected?'ok':'error'}"></span><div><b>${App.drive.connected?'Drive conectado':'Entre com o Google'}</b><small>Último backup: ${esc(App.state.settings.lastDriveBackupDate?fmtDateTime(App.state.settings.lastDriveBackupDate):'ainda não criado')}</small></div></div><button class="btn btn-primary btn-block" onclick="Borion.driveBackup()">Criar backup no Drive agora</button></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Backup externo</div></div><div class="panel-body"><div class="config-section"><h3>Arquivo completo</h3><p>Exporte dados e anexos para guardar fora do Drive.</p><button class="btn btn-outline btn-block" onclick="Borion.exportBackup()">Exportar ZIP completo</button></div><div class="config-section"><h3>Importar sem duplicar</h3><p>A restauração segura agora fica em Importar arquivos e sempre mostra uma conferência antes de salvar.</p><button class="btn btn-outline btn-block" onclick="Borion.go('importar')">Abrir Importar arquivos</button></div></div></section></div>`;
};

renderConfig=function(){
  const root=$('#page-config');if(!root)return;const rootId=App.drive.rootId||App.state.settings.rootFolderId||'',connected=App.drive.connected;const accounts=chequeAccounts(true);
  root.innerHTML=`<div class="settings-grid"><section class="settings-card drive-primary"><div class="settings-card-head"><div class="settings-icon">☁</div><div><h3>Google Drive oficial</h3><p>A pasta Borion CNPJ é criada automaticamente na conta conectada.</p></div><span class="connection-pill ${connected?'connected':'disconnected'}">${connected?'Conectado':'Desconectado'}</span></div><div class="settings-details"><div><span>Conta conectada</span><b>${esc(App.user?.email||'Entre novamente com o Google')}</b></div><div><span>Pasta automática</span><b>Borion CNPJ</b></div><div><span>ID da pasta</span><b class="mono">${esc(rootId||'Criado no primeiro acesso')}</b></div><div><span>Proteção</span><b>Google Drive + snapshots locais e remotos</b></div></div><div class="settings-actions">${connected?'<button class="btn btn-outline" onclick="Borion.reconnectGoogle()">Trocar conta Google</button>':''}<button class="btn btn-primary" onclick="Borion.prepareDrive()">Verificar estrutura no Drive</button></div></section><section class="settings-card"><div class="settings-card-head"><div class="settings-icon">⚙</div><div><h3>Preferências da empresa</h3><p>Ajustes visuais e operacionais.</p></div></div><div class="form-grid settings-form"><div class="field full"><label for="cfg-company">Nome da empresa</label><input id="cfg-company" value="${esc(App.state.settings.companyName||'Borion CNPJ')}" autocomplete="organization"></div><div class="field"><label for="cfg-warning">Alertar com antecedência</label><select id="cfg-warning">${[3,5,7,10,15,30].map(v=>`<option value="${v}" ${Number(App.state.settings.warningDays||7)===v?'selected':''}>${v} dias</option>`).join('')}</select></div><div class="field"><label for="cfg-image-quality">Qualidade das fotos</label><select id="cfg-image-quality">${[[.72,'Econômica'],[.82,'Equilibrada'],[.86,'Alta'],[.92,'Máxima']].map(([v,l])=>`<option value="${v}" ${Math.abs(Number(App.state.settings.imageQuality||.86)-v)<.001?'selected':''}>${l} · ${String(v).replace('.',',')}</option>`).join('')}</select></div><div class="field"><label for="cfg-image-max">Resolução máxima</label><select id="cfg-image-max">${[[1600,'1600 px'],[2000,'2000 px'],[2400,'2400 px'],[3200,'3200 px'],[4000,'4000 px']].map(([v,l])=>`<option value="${v}" ${Number(App.state.settings.maxImageDimension||2400)===v?'selected':''}>${l}</option>`).join('')}</select></div><label class="borion-switch full"><input id="cfg-auto-sync" type="checkbox" ${App.state.settings.autoSync?'checked':''}><span class="switch-track"></span><span><b>Sincronização automática</b><small>Salvar no Drive depois de cada alteração.</small></span></label></div><div class="settings-actions"><button class="btn btn-primary" onclick="Borion.saveDriveConfig()">Salvar preferências</button></div></section><section class="settings-card full-width"><div class="settings-card-head"><div class="settings-icon">▣</div><div><h3>Contas de cheque</h3><p>Banco, agência e conta são cadastrados somente aqui. No cheque aparece apenas um selecionável.</p></div><button class="btn btn-primary" onclick="Borion.newChequeAccount()">＋ Nova conta</button></div>${accounts.length?`<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Banco</th><th>Agência</th><th>Conta</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${accounts.map(a=>`<tr><td><b>${esc(a.nome||'--')}</b></td><td>${esc(a.banco||'--')}</td><td>${esc(a.agencia||'--')}</td><td>${esc(a.conta||'--')}</td><td><span class="badge ${a.ativo===false?'cancelled':'paid'}">${a.ativo===false?'Inativa':'Ativa'}</span></td><td><button class="action-btn" onclick="Borion.editChequeAccount('${a.id}')">Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact"><b>Nenhuma conta cadastrada</b><p>Os cheques mostrarão “--” até você cadastrar uma conta.</p></div>'}</section><section class="settings-card full-width"><div class="settings-card-head"><div class="settings-icon">▦</div><div><h3>Estrutura automática de segurança</h3><p>Nenhum link ou ID precisa ser digitado.</p></div></div><div class="drive-tree"><div><b>Borion CNPJ</b></div><div class="level-1">Sistema / Dados / current.json</div><div class="level-1">Sistema / Backups / ano / mês / snapshots automáticos</div><div class="level-1">Sistema / Histórico / arquivos preservados</div><div class="level-1">Cheques / ano / mês / fotos e PDFs</div><div class="level-1">Boletos / ano / mês / fotos e PDFs</div></div></section></div>`;
};



// ---------- Versão 1.0.15: importação segura e PWA mobile ----------
App.installPrompt=null;
App.lastImportAnalysis=null;
const isMobileView=()=>window.matchMedia('(max-width: 900px)').matches;

function supplierImportKey(x){
  const doc=digits(x?.cpfCnpj);
  return doc?`doc:${doc}`:`nome:${normalize(x?.nome)}|${digits(x?.telefone)}`;
}
function accountImportKey(x){
  return normalize([x?.nome,x?.banco,x?.agencia,x?.conta].join('|'));
}
function chequeImportKey(x,accountLabel=''){
  return [normalize(x?.tipo||'Emitido'),normalize(x?.numero),normalize(accountLabel||x?.contaId||''),String(x?.dataBom||x?.dataEmissao||'')].join('|');
}
function boletoImportKey(x){
  const code=digits(x?.linhaDigitavel||x?.codigoBarras);
  if(code)return `codigo:${code}`;
  return `fallback:${normalize(x?.documento)}|${normalize(x?.beneficiario)}|${x?.vencimento||''}|${moneyNumber(x?.valor).toFixed(2)}`;
}
function extractImportState(raw){
  if(!raw||typeof raw!=='object')throw new Error('O arquivo não contém dados válidos.');
  if(raw.format==='cheques-importacao'){
    return migrateStateV104({settings:{chequeAccounts:raw.contas||[]},fornecedores:raw.fornecedores||[],cheques:raw.cheques||[],boletos:[]});
  }
  if(raw.state&&typeof raw.state==='object')return migrateStateV104(raw.state);
  if(raw.data?.state&&typeof raw.data.state==='object')return migrateStateV104(raw.data.state);
  if(Array.isArray(raw.cheques)||Array.isArray(raw.boletos)||Array.isArray(raw.fornecedores))return migrateStateV104(raw);
  throw new Error('Formato não reconhecido. Use JSON ou ZIP exportado pelo Borion CNPJ.');
}
async function readImportSource(file){
  const lower=file.name.toLowerCase();
  if(lower.endsWith('.zip')){
    if(!window.JSZip)throw new Error('Leitor de ZIP não carregado.');
    const zip=await JSZip.loadAsync(file);
    const candidates=['borion-cnpj-dados.json','current.json','dados.json'];
    let entry=candidates.map(n=>zip.file(n)).find(Boolean);
    if(!entry)entry=Object.values(zip.files).find(x=>!x.dir&&x.name.toLowerCase().endsWith('.json'));
    if(!entry)throw new Error(`${file.name}: nenhum JSON de dados encontrado.`);
    const raw=JSON.parse(await entry.async('text'));
    const attachments=new Map();
    for(const item of Object.values(zip.files)){
      if(item.dir||!item.name.startsWith('anexos/'))continue;
      const filename=item.name.split('/').pop()||'';
      const sep=filename.indexOf('__');
      const id=sep>=0?filename.slice(0,sep):filename;
      if(id)attachments.set(id,{entry,name:sep>=0?filename.slice(sep+2):'arquivo'});
    }
    return {name:file.name,state:extractImportState(raw),attachments};
  }
  if(lower.endsWith('.json')||file.type.includes('json')){
    return {name:file.name,state:extractImportState(JSON.parse(await file.text())),attachments:new Map()};
  }
  throw new Error(`${file.name}: tipo não suportado. Selecione JSON ou ZIP.`);
}
async function buildImportPlan(files){
  const sources=[];for(const file of files)sources.push(await readImportSource(file));
  const localAttachmentRows=await getAllAttachmentRows();
  const usedAttachmentIds=new Set(localAttachmentRows.map(x=>x.id));
  const usedRecordIds=new Set([...App.state.fornecedores,...App.state.cheques,...App.state.boletos,...chequeAccounts(true)].map(x=>x.id).filter(Boolean));
  const supplierByKey=new Map(active(App.state.fornecedores).map(x=>[supplierImportKey(x),x]));
  const accountByKey=new Map(chequeAccounts(true).map(x=>[accountImportKey(x),x]));
  const chequeKeys=new Set(active(App.state.cheques).map(x=>chequeImportKey(x,accountLabelForCheque(x))));
  const boletoKeys=new Set(active(App.state.boletos).map(boletoImportKey));
  const plan={sources:[],newSuppliers:[],newAccounts:[],newCheques:[],newBoletos:[],attachmentJobs:[],duplicates:{fornecedores:0,contas:0,cheques:0,boletos:0,anexos:0}};
  for(const source of sources){
    const state=source.state,sourceAccounts=state.settings?.chequeAccounts||[];
    const sourceAccountById=new Map(sourceAccounts.map(x=>[x.id,x]));
    const supplierMap=new Map(),accountMap=new Map();
    for(const f of active(state.fornecedores)){
      const key=supplierImportKey(f);let local=supplierByKey.get(key);
      if(local){plan.duplicates.fornecedores++;supplierMap.set(f.id,local.id);continue;}
      const id=f.id&&!usedRecordIds.has(f.id)?f.id:uid();usedRecordIds.add(id);
      local={...f,id,attachments:undefined,createdAt:f.createdAt||nowISO()};recordTouch(local);
      plan.newSuppliers.push(local);supplierByKey.set(key,local);supplierMap.set(f.id,id);
    }
    for(const a of sourceAccounts){
      const key=accountImportKey(a);let local=accountByKey.get(key);
      if(local){plan.duplicates.contas++;accountMap.set(a.id,local.id);continue;}
      const id=a.id&&!usedRecordIds.has(a.id)?a.id:uid();usedRecordIds.add(id);
      local={...a,id,createdAt:a.createdAt||nowISO()};recordTouch(local);
      plan.newAccounts.push(local);accountByKey.set(key,local);accountMap.set(a.id,id);
    }
    const prepareAttachments=(record,newRecord)=>{
      const kept=[];
      for(const meta of record.attachments||[]){
        const zipped=source.attachments.get(meta.id);
        if(!zipped&&!meta.driveFileId)continue;
        let newId=meta.id&&!usedAttachmentIds.has(meta.id)?meta.id:uid();
        if(usedAttachmentIds.has(meta.id))plan.duplicates.anexos++;
        usedAttachmentIds.add(newId);
        const out={...meta,id:newId,pendingUpload:Boolean(zipped)||Boolean(meta.pendingUpload),createdAt:meta.createdAt||nowISO()};
        if(zipped){out.driveFileId='';out.driveThumbFileId='';out.driveName='';}
        kept.push(out);
        if(zipped)plan.attachmentJobs.push({oldId:meta.id,newId,entry:zipped.entry,name:zipped.name||meta.name||'arquivo',type:meta.type||'application/octet-stream'});
      }
      newRecord.attachments=kept;
    };
    for(const c of active(state.cheques)){
      const sourceAccount=sourceAccountById.get(c.contaId);
      const key=chequeImportKey(c,sourceAccount?accountLabel(sourceAccount):accountLabelForCheque(c));
      if(chequeKeys.has(key)){plan.duplicates.cheques++;continue;}
      chequeKeys.add(key);
      const id=c.id&&!usedRecordIds.has(c.id)?c.id:uid();usedRecordIds.add(id);
      const item={...c,id,fornecedorId:supplierMap.get(c.fornecedorId)||'',contaId:accountMap.get(c.contaId)||'',createdAt:c.createdAt||nowISO()};
      delete item.banco;delete item.agencia;delete item.conta;recordTouch(item);prepareAttachments(c,item);plan.newCheques.push(item);
    }
    for(const b of active(state.boletos)){
      const key=boletoImportKey(b);if(boletoKeys.has(key)){plan.duplicates.boletos++;continue;}
      boletoKeys.add(key);
      const id=b.id&&!usedRecordIds.has(b.id)?b.id:uid();usedRecordIds.add(id);
      const item={...b,id,fornecedorId:supplierMap.get(b.fornecedorId)||'',createdAt:b.createdAt||nowISO()};recordTouch(item);prepareAttachments(b,item);plan.newBoletos.push(item);
    }
    plan.sources.push(source.name);
  }
  return plan;
}
function importPlanHtml(plan){
  const totalNew=plan.newCheques.length+plan.newBoletos.length+plan.newSuppliers.length+plan.newAccounts.length;
  const totalDup=Object.values(plan.duplicates).reduce((a,b)=>a+b,0);
  return `<div class="import-summary"><div class="import-source"><b>${plan.sources.length} arquivo(s) analisado(s)</b><small>${plan.sources.map(esc).join(' · ')}</small></div><div class="import-kpis"><div><span>Cheques novos</span><b>${plan.newCheques.length}</b></div><div><span>Boletos novos</span><b>${plan.newBoletos.length}</b></div><div><span>Fornecedores novos</span><b>${plan.newSuppliers.length}</b></div><div><span>Contas novas</span><b>${plan.newAccounts.length}</b></div></div><div class="duplicate-box"><span>Duplicidades encontradas e ignoradas</span><b>${totalDup}</b><small>${plan.duplicates.cheques} cheque(s), ${plan.duplicates.boletos} boleto(s), ${plan.duplicates.fornecedores} fornecedor(es), ${plan.duplicates.contas} conta(s)</small></div><div class="status-line"><span class="sync-dot ${totalNew?'ok':'local'}"></span><div><b>${totalNew?'Importação pronta':'Nada novo para importar'}</b><small>Registros existentes não serão alterados nem duplicados.</small></div></div></div>`;
}
async function commitImportPlan(plan){
  if(!plan)return;
  await saveLocal('antes-importacao',false);
  if(App.drive.connected){try{const structure=await Drive.ensureStructure();await Drive.createSnapshot(structure,'PRE_IMPORT')}catch(e){console.warn('Snapshot pré-importação não criado',e)}}
  App.state.fornecedores.push(...plan.newSuppliers);
  App.state.settings.chequeAccounts.push(...plan.newAccounts);
  App.state.cheques.push(...plan.newCheques);
  App.state.boletos.push(...plan.newBoletos);
  for(const job of plan.attachmentJobs){
    const blob=await job.entry.async('blob'),buf=await blob.arrayBuffer(),env=await encryptBytes(buf);
    await new Promise((resolve,reject)=>{const r=idbTx('readwrite').put({id:job.newId,name:job.name,type:blob.type||job.type,size:blob.size,iv:env.iv,data:env.data,createdAt:nowISO()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)});
  }
  const imported=plan.newCheques.length+plan.newBoletos.length;
  const skipped=plan.duplicates.cheques+plan.duplicates.boletos;
  App.state.settings.lastImport={at:nowISO(),files:plan.sources,cheques:plan.newCheques.length,boletos:plan.newBoletos.length,fornecedores:plan.newSuppliers.length,duplicates:skipped};
  logAudit('Arquivos importados',`${imported} registro(s) novos · ${skipped} duplicado(s) ignorado(s)`,'Importação','');
  v115SetPending(true);v115MarkDirty();await saveLocal('importacao-concluida',false);
  if(App.drive.connected)await Drive.sync();renderAll();setPage('importar');toast(`${imported} registro(s) importados e confirmados no Drive. ${skipped} duplicado(s) ignorado(s).`,'ok',6000);
}
async function previewImportFiles(files){
  if(!files?.length)return;
  toast('Analisando arquivos e procurando duplicidades...');
  const plan=await buildImportPlan(Array.from(files));App.lastImportAnalysis=plan;
  const total=plan.newCheques.length+plan.newBoletos.length+plan.newSuppliers.length+plan.newAccounts.length;
  openModal({title:'Conferir importação',subtitle:'O Borion compara tudo antes de salvar.',body:importPlanHtml(plan),saveLabel:total?'Importar somente os novos':'Fechar',onSave:async()=>{if(!total){closeModal();return}await commitImportPlan(plan);closeModal();}});
}
function selectImportFiles(){
  const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.json,.zip,application/json,application/zip';input.onchange=()=>previewImportFiles(input.files).catch(e=>toast(e.message,'error',7000));input.click();
}
function renderImport(){
  const root=$('#page-importar');if(!root)return;const last=App.state.settings.lastImport;
  root.innerHTML=`<div class="import-layout"><section class="panel import-main"><div class="panel-head"><div><div class="panel-title">Importar arquivos</div><p class="muted">Selecione um ou vários JSON/ZIP do Borion CNPJ. Antes de salvar, o sistema confere cheques, boletos, fornecedores e contas.</p></div></div><div class="panel-body"><div class="import-drop" data-import-drop><div class="import-drop-icon">⇧</div><h3>Solte os arquivos aqui</h3><p>Ou escolha backups ZIP e arquivos JSON exportados pelo Borion.</p><button class="btn btn-primary" onclick="Borion.selectImportFiles()">Selecionar arquivos</button><small>Nenhum registro existente será sobrescrito. Duplicidades são ignoradas.</small></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Exportações rápidas</div></div><div class="panel-body"><div class="config-section"><h3>Cheques sem fotos</h3><p>Gera um JSON leve para levar cheques, fornecedores e contas.</p><button class="btn btn-outline btn-block" onclick="Borion.exportChequesImport()">Exportar cheques atuais</button></div><div class="config-section"><h3>Backup completo</h3><p>Inclui todos os dados e anexos.</p><button class="btn btn-outline btn-block" onclick="Borion.exportBackup()">Exportar ZIP completo</button></div></div></section>${last?`<section class="panel full-span"><div class="panel-head"><div class="panel-title">Última importação</div></div><div class="panel-body"><div class="quick-list"><div class="quick-item"><div><b>${esc(last.files?.join(' · ')||'Arquivo importado')}</b><small>${last.cheques||0} cheque(s), ${last.boletos||0} boleto(s), ${last.fornecedores||0} fornecedor(es)</small></div><div class="quick-date"><b>${last.duplicates||0} duplicado(s)</b><small>${fmtDateTime(last.at)}</small></div></div></div></div></section>`:''}</div>`;
  const drop=$('[data-import-drop]',root);drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragover')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');previewImportFiles(e.dataTransfer.files).catch(err=>toast(err.message,'error',7000))});
}

// No celular, prioriza leitura rápida em cartões.
const renderChequesDesktopV105=renderCheques;
renderCheques=function(){
  if(!isMobileView())return renderChequesDesktopV105();
  const root=$('#page-cheques');if(!root)return;let items=active(App.state.cheques).filter(x=>chequeMatches(x,App.search.cheques));
  if(App.chequeTab==='emitidos')items=items.filter(x=>x.tipo==='Emitido');if(App.chequeTab==='recebidos')items=items.filter(x=>x.tipo==='Recebido');if(App.chequeTab==='abertos')items=items.filter(x=>!['Compensado','Cancelado'].includes(x.status));
  items.sort((a,b)=>String(b.dataEmissao||b.createdAt).localeCompare(String(a.dataEmissao||a.createdAt)));
  root.innerHTML=`<div class="mobile-list-head"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar cheque ou fornecedor" data-search-cheques></div><button class="mobile-add" onclick="Borion.newCheque()">＋</button></div><div class="tabs mobile-tabs">${[['todos','Todos'],['emitidos','Emitidos'],['recebidos','Recebidos'],['abertos','Em aberto']].map(([v,l])=>`<button class="tab ${App.chequeTab===v?'active':''}" onclick="Borion.chequeTab('${v}')">${l}</button>`).join('')}</div><div class="mobile-record-list">${items.length?items.map(x=>{const party=supplierById(x.fornecedorId)?.nome||x.pessoa||'—';return`<button class="mobile-record-card" onclick="Borion.viewCheque('${x.id}')"><div class="mobile-record-top"><div><span class="eyebrow">${esc(x.tipo)} · ${esc(accountLabelForCheque(x))}</span><h3>${esc(x.numero||'Sem número')}</h3></div><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></div><div class="mobile-record-party">${esc(party)}</div><div class="mobile-record-bottom"><div><span>Bom para</span><b>${fmtDate(x.dataBom)}</b></div><div class="mobile-record-value">${brl(x.valor)}</div></div>${(x.attachments||[]).length?`<div class="mobile-file-count">▣ ${x.attachments.length} arquivo(s)</div>`:''}</button>`}).join(''):'<div class="empty"><b>Nenhum cheque encontrado</b></div>'}</div>`;
  $('[data-search-cheques]',root).oninput=e=>{App.search.cheques=e.target.value;renderCheques()};
};
const renderBoletosDesktopV105=renderBoletos;
renderBoletos=function(){
  if(!isMobileView())return renderBoletosDesktopV105();
  const root=$('#page-boletos');if(!root)return;let items=active(App.state.boletos).filter(x=>boletoMatches(x,App.search.boletos));if(App.boletoTab==='abertos')items=items.filter(x=>!['Pago','Cancelado'].includes(x.status));if(App.boletoTab==='pagos')items=items.filter(x=>x.status==='Pago');if(App.boletoTab==='vencidos')items=items.filter(x=>x.vencimento&&daysUntil(x.vencimento)<0&&!['Pago','Cancelado'].includes(x.status));items.sort((a,b)=>String(b.dataCadastro||b.createdAt).localeCompare(String(a.dataCadastro||a.createdAt)));
  root.innerHTML=`<div class="mobile-list-head"><div class="search-box"><input value="${esc(App.search.boletos)}" placeholder="Buscar boleto ou fornecedor" data-search-boletos></div><button class="mobile-add" onclick="Borion.newBoleto()">＋</button></div><div class="tabs mobile-tabs">${[['todos','Todos'],['abertos','Em aberto'],['pagos','Pagos'],['vencidos','Vencidos']].map(([v,l])=>`<button class="tab ${App.boletoTab===v?'active':''}" onclick="Borion.boletoTab('${v}')">${l}</button>`).join('')}</div><div class="mobile-record-list">${items.length?items.map(x=>{const party=supplierById(x.fornecedorId)?.nome||x.beneficiario||'—';return`<button class="mobile-record-card" onclick="Borion.viewBoleto('${x.id}')"><div class="mobile-record-top"><div><span class="eyebrow">Boleto</span><h3>${esc(x.documento||party)}</h3></div><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></div><div class="mobile-record-party">${esc(party)}</div><div class="mobile-record-bottom"><div><span>Vencimento</span><b>${fmtDate(x.vencimento)}</b></div><div class="mobile-record-value">${brl(x.valor)}</div></div>${(x.attachments||[]).length?`<div class="mobile-file-count">▣ ${x.attachments.length} arquivo(s)</div>`:''}</button>`}).join(''):'<div class="empty"><b>Nenhum boleto encontrado</b></div>'}</div>`;
  $('[data-search-boletos]',root).oninput=e=>{App.search.boletos=e.target.value;renderBoletos()};
};
function openMobileMore(){
  const install=App.installPrompt?'<button class="mobile-menu-link" data-mobile-install>Instalar no celular <span>›</span></button>':'';
  const body=`<div class="mobile-more-menu"><button class="mobile-menu-link" data-mobile-refresh>Atualizar agora <span>↻</span></button><button class="mobile-menu-link" data-mobile-go="fornecedores">Fornecedores <span>›</span></button><button class="mobile-menu-link" data-mobile-go="importar">Importar arquivos <span>›</span></button><button class="mobile-menu-link" data-mobile-go="backup">Backup <span>›</span></button><button class="mobile-menu-link" data-mobile-go="config">Configurações <span>›</span></button>${install}<button class="mobile-menu-link danger" data-mobile-logout>Sair da conta <span>›</span></button><div class="mobile-menu-version">Borion CNPJ · versão ${esc(CFG.version||'1.0.23')}</div></div>`;
  const modal=openModal({title:'Mais opções',subtitle:'Ferramentas do Borion CNPJ',body});$$('[data-mobile-go]',modal).forEach(b=>b.onclick=()=>{closeModal();setPage(b.dataset.mobileGo)});$('[data-mobile-refresh]',modal)?.addEventListener('click',async()=>{closeModal();try{await Drive.pull(true,true)}catch(e){toast(e.message,'error',6500)}});$('[data-mobile-logout]',modal).onclick=()=>{closeModal();logout()};$('[data-mobile-install]',modal)?.addEventListener('click',async()=>{await installPwa();closeModal()});
}
async function installPwa(){if(!App.installPrompt){toast('No navegador, use “Adicionar à tela inicial”.');return}App.installPrompt.prompt();await App.installPrompt.userChoice;App.installPrompt=null;}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();App.installPrompt=e});
let resizeTimer=0;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderPage(App.page),180)});

// ---------- Inicialização ----------


// ---------- Versão 1.0.15: sincronização transacional entre PC, celular e Drive ----------
const V115_VERSION='1.0.23';
const V115_CURRENT_FILE='current.json';
const V115_ROOT_MIRROR='BORION_CNPJ_CURRENT.json';
const V115_PENDING_PREFIX='borion_cnpj_pending_sync_v115_';
const V115_DIRTY_PREFIX='borion_cnpj_dirty_seq_v115_';
const V115_ROOT_PREFIX='borion_cnpj_drive_root_v115_';
const V115_ACCOUNT_STATE_PREFIX='borion_cnpj_state_v115_';
const V115_DEVICE_KEY='borion_cnpj_device_v115';

function v115AccountKey(email=App.user?.email||'sem-conta'){return normalize(email||'sem-conta')}
function v115PendingKey(){return V115_PENDING_PREFIX+v115AccountKey()}
function v115DirtyKey(){return V115_DIRTY_PREFIX+v115AccountKey()}
function v115RootKey(){return V115_ROOT_PREFIX+v115AccountKey()}
function v115AccountStateKey(email=App.user?.email||'sem-conta'){return V115_ACCOUNT_STATE_PREFIX+v115AccountKey(email)}
function v115Pending(){return localStorage.getItem(v115PendingKey())==='1'}
function v115SetPending(value){if(value)localStorage.setItem(v115PendingKey(),'1');else localStorage.removeItem(v115PendingKey())}
function v115DirtySeq(){return Number(localStorage.getItem(v115DirtyKey())||0)}
function v115MarkDirty(){const next=v115DirtySeq()+1;localStorage.setItem(v115DirtyKey(),String(next));v115SetPending(true);return next}
function v115DeviceId(){let id=localStorage.getItem(V115_DEVICE_KEY);if(!id){id=uid();localStorage.setItem(V115_DEVICE_KEY,id)}return id}
function stateRecordCount(state){const s=migrateStateV104(state||blankState());return (s.cheques?.length||0)+(s.boletos?.length||0)+(s.fornecedores?.length||0)+(s.settings?.chequeAccounts?.length||0)}
function stateActiveChequeCount(state){return active(migrateStateV104(state||blankState()).cheques).length}
function stateUpdatedAt(state){return String(state?.meta?.updatedAt||'')}
function uniqueTail(values,max=300){return Array.from(new Set((values||[]).filter(Boolean))).slice(-max)}
function operationIdsFromState(state){return uniqueTail(state?.meta?.appliedOperationIds||[])}
function stateSignature(state){
  const s=migrateStateV104(state||blankState());
  const listSignature=list=>(list||[]).map(x=>[x.id||'',x.updatedAt||x.createdAt||'',Boolean(x.deleted)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify({
    fornecedores:listSignature(s.fornecedores),cheques:listSignature(s.cheques),boletos:listSignature(s.boletos),
    contas:listSignature(s.settings?.chequeAccounts||[]),deleted:[...(s.deleted||[])].sort()
  });
}
function compareRemoteCandidates(a,b){
  const ac=Number(a?.recordCount||0),bc=Number(b?.recordCount||0);
  if(ac!==bc)return bc-ac;
  const ar=Number(a?.revision||0),br=Number(b?.revision||0);if(ar!==br)return br-ar;
  const au=String(a?.updatedAt||''),bu=String(b?.updatedAt||'');if(au!==bu)return bu.localeCompare(au);
  return String(b?.modifiedTime||'').localeCompare(String(a?.modifiedTime||''));
}

// Estado local passa a ser também separado por conta Google. Mantemos a chave antiga para migração/recuperação.
const saveLocalV114=saveLocal;
saveLocal=async function(reason='alteracao',bumpRevision=true){
  const result=await saveLocalV114(reason,bumpRevision);
  if(App.user?.email){
    try{localStorage.setItem(v115AccountStateKey(),JSON.stringify(App.state))}catch(e){console.warn('Cópia local por conta não pôde ser gravada',e)}
  }
  if(bumpRevision)v115MarkDirty();
  return result;
};
function loadAccountLocalState(email,previousEmail=''){
  const own=localStorage.getItem(v115AccountStateKey(email));
  if(own){try{App.state=migrateStateV104(JSON.parse(own));return}catch(e){console.warn('Estado local da conta inválido',e)}}
  const samePrevious=!previousEmail||normalize(previousEmail)===normalize(email);
  if(!samePrevious)App.state=migrateStateV104(blankState());
  try{localStorage.setItem(v115AccountStateKey(email),JSON.stringify(App.state))}catch{}
}

scheduleSave=function(sync=true){
  clearTimeout(App.saveTimer);
  App.saveTimer=setTimeout(()=>{App.saveTimer=null;saveLocal('alteracao').catch(e=>console.error(e))},0);
  if(sync&&App.state.settings.autoSync&&App.drive.connected)scheduleSync();
};
scheduleSync=function(){
  v115SetPending(true);
  clearTimeout(App.syncTimer);
  App.syncTimer=setTimeout(()=>{App.syncTimer=null;Drive.sync().catch(e=>{
    console.error(e);updateSyncUI('error','Pendente no Drive','Os dados continuam seguros neste aparelho');
    toast('Não foi possível confirmar no Google Drive. O Borion tentará novamente. '+(e.message||''),'error',7000);
  })},500);
};

Drive.api=async function(url,opt={},retry=true){
  const method=String(opt.method||'GET').toUpperCase();
  const request={...opt,headers:{Authorization:'Bearer '+App.drive.token,...(opt.headers||{})}};
  if(method==='GET')request.cache='no-store';
  let res=await fetch(url,request);
  if(res.status===401&&retry){
    try{const fresh=await this.requestToken('');App.drive.token=fresh.access_token;return this.api(url,opt,false)}
    catch(e){updateSyncUI('error','Reconecte o Google','A autorização expirou neste aparelho');throw new Error('A sessão Google expirou. Entre novamente para sincronizar.')}
  }
  if(!res.ok){const text=await res.text();throw new Error('Google Drive '+res.status+': '+text.slice(0,300))}
  if(res.status===204)return null;
  const ct=res.headers.get('content-type')||'';
  return ct.includes('application/json')?res.json():res.arrayBuffer();
};

Drive.listChildren=async function(parentId,name='',mimeType=''){
  let q=`'${this.q(parentId)}' in parents and trashed=false`;
  if(name)q+=` and name='${this.q(name)}'`;
  if(mimeType)q+=` and mimeType='${this.q(mimeType)}'`;
  const out=[];let pageToken='';
  do{
    const params=new URLSearchParams({spaces:'drive',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,parents,appProperties)',q});
    if(pageToken)params.set('pageToken',pageToken);
    const data=await this.api('https://www.googleapis.com/drive/v3/files?'+params.toString());
    out.push(...(data.files||[]));pageToken=data.nextPageToken||'';
  }while(pageToken&&out.length<1000);
  return out;
};
Drive.findChild=async function(parentId,name,mimeType=''){return (await this.listChildren(parentId,name,mimeType))[0]||null};

Drive.mergeState=function(local,remote,prefer='newest'){
  const l=migrateStateV104(local||blankState()),r=migrateStateV104(remote||blankState());
  const remoteWins=prefer==='remote';
  const merged=blankState();
  merged.settings=remoteWins?{...l.settings,...r.settings}:{...r.settings,...l.settings};
  const mergeList=(left,right)=>{
    const map=new Map();
    for(const item of left||[])if(item?.id)map.set(item.id,item);
    for(const item of right||[]){
      if(!item?.id)continue;
      const prev=map.get(item.id);if(!prev){map.set(item.id,item);continue}
      const pt=String(prev.updatedAt||prev.createdAt||''),it=String(item.updatedAt||item.createdAt||'');
      if(it>pt||(it===pt&&remoteWins))map.set(item.id,item);
    }
    return Array.from(map.values());
  };
  merged.fornecedores=mergeList(l.fornecedores,r.fornecedores);
  merged.cheques=mergeList(l.cheques,r.cheques);
  merged.boletos=mergeList(l.boletos,r.boletos);
  merged.settings.chequeAccounts=mergeList(l.settings.chequeAccounts||[],r.settings.chequeAccounts||[]);
  const audit=new Map();for(const a of [...(l.audit||[]),...(r.audit||[])])if(a?.id)audit.set(a.id,a);
  merged.audit=Array.from(audit.values()).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,1000);
  merged.deleted=Array.from(new Set([...(l.deleted||[]),...(r.deleted||[])]));
  const lu=stateUpdatedAt(l),ru=stateUpdatedAt(r);
  merged.meta={...l.meta,...r.meta,version:V115_VERSION,revision:Math.max(Number(l.meta?.revision||0),Number(r.meta?.revision||0)),updatedAt:ru>lu?ru:lu,
    appliedOperationIds:uniqueTail([...operationIdsFromState(l),...operationIdsFromState(r)])};
  return migrateStateV104(merged);
};

Drive.readStateCandidate=async function(file){
  if(!file)return null;
  try{
    const raw=new TextDecoder().decode(await this.downloadFile(file.id));
    const parsed=JSON.parse(raw);const state=migrateStateV104(parsed.state||parsed);
    return {file,state,revision:Number(parsed.revision??state.meta?.revision??0),updatedAt:String(parsed.updatedAt||state.meta?.updatedAt||file.modifiedTime||''),modifiedTime:file.modifiedTime||'',recordCount:stateRecordCount(state),operationIds:uniqueTail(parsed.appliedOperationIds||state.meta?.appliedOperationIds||[])};
  }catch(e){console.warn('Arquivo de dados inválido preservado',file?.id,e);return null}
};
Drive.loadCurrentFromStructure=async function(structure){
  const candidates=[];
  for(const file of await this.listChildren(structure.data,V115_CURRENT_FILE)){const c=await this.readStateCandidate(file);if(c)candidates.push({...c,kind:'nested'})}
  for(const file of await this.listChildren(structure.root,V115_ROOT_MIRROR)){const c=await this.readStateCandidate(file);if(c)candidates.push({...c,kind:'mirror'})}
  if(!candidates.length){
    const legacy=await this.findChild(structure.data,'current.json.borion');
    if(legacy){try{const raw=new TextDecoder().decode(await this.downloadFile(legacy.id));const state=migrateStateV104(await decryptJson(JSON.parse(raw)));candidates.push({file:null,legacy,state,revision:Number(state.meta?.revision||0),updatedAt:stateUpdatedAt(state),modifiedTime:legacy.modifiedTime||'',recordCount:stateRecordCount(state),kind:'legacy'})}catch(e){console.warn('Base criptografada antiga não abre neste aparelho; current.json será usado quando existir.',e)}}
  }
  candidates.sort(compareRemoteCandidates);
  const best=candidates[0]||null;
  const nestedFiles=await this.listChildren(structure.data,V115_CURRENT_FILE);
  const mirrorFiles=await this.listChildren(structure.root,V115_ROOT_MIRROR);
  if(best){best.nestedFile=nestedFiles[0]||null;best.mirrorFile=mirrorFiles[0]||null}
  return best;
};
Drive.loadOperationStates=async function(structure,appliedIds=[]){
  const applied=new Set(appliedIds||[]),files=(await this.listChildren(structure.operations)).filter(f=>String(f.name||'').startsWith('OP_'));
  const missing=[];
  for(const file of files){
    if(missing.length>=120)break;
    const operationId=String(file.name||file.id);if(applied.has(operationId))continue;
    try{
      const raw=new TextDecoder().decode(await this.downloadFile(file.id));const parsed=JSON.parse(raw);
      const state=migrateStateV104(parsed.state||parsed);missing.push({operationId,state,createdAt:parsed.createdAt||file.modifiedTime||''});
    }catch(e){console.warn('Operação inválida preservada',file.id,e)}
  }
  missing.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  return missing;
};
Drive.loadRemoteBundle=async function(structure){
  const current=await this.loadCurrentFromStructure(structure);
  let state=current?.state||null;let revision=Number(current?.revision||0);
  const applied=operationIdsFromState(state||{});
  const operations=await this.loadOperationStates(structure,applied);
  for(const op of operations){state=state?this.mergeState(state,op.state,'remote'):migrateStateV104(op.state);applied.push(op.operationId);revision=Math.max(revision,Number(op.state?.meta?.revision||0))}
  if(state){state.meta.appliedOperationIds=uniqueTail(applied);state.meta.revision=Math.max(Number(state.meta.revision||0),revision)}
  return {state,current,revision:Number(state?.meta?.revision??revision??0),updatedAt:stateUpdatedAt(state),operationIds:uniqueTail(applied),operationCount:operations.length};
};

Drive.listRootFolders=async function(){
  const folderName=App.state.settings.rootFolderName||CFG.driveRootFolderName||'Borion CNPJ';
  const q=`name='${this.q(folderName)}' and 'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const params=new URLSearchParams({spaces:'drive',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'files(id,name,modifiedTime,createdTime,appProperties)',q});
  const data=await this.api('https://www.googleapis.com/drive/v3/files?'+params.toString());return data.files||[];
};
Drive.inspectRoot=async function(root){
  const result={root,revision:-1,updatedAt:'',modifiedTime:root.modifiedTime||'',recordCount:0,hasState:false};
  try{
    const system=await this.findChild(root.id,'Sistema','application/vnd.google-apps.folder');if(!system)return result;
    const data=await this.findChild(system.id,'Dados','application/vnd.google-apps.folder');if(!data)return result;
    const operations=await this.findChild(system.id,'Operações','application/vnd.google-apps.folder');
    const structure={root:root.id,system:system.id,data:data.id,operations:operations?.id||'',backups:'',history:'',cheques:'',boletos:''};
    const current=await this.loadCurrentFromStructure(structure);
    if(current){Object.assign(result,{hasState:true,state:current.state,revision:current.revision,updatedAt:current.updatedAt,modifiedTime:current.modifiedTime||result.modifiedTime,recordCount:current.recordCount,current})}
  }catch(e){console.warn('Falha ao inspecionar pasta Borion CNPJ',root.id,e)}
  return result;
};
Drive.markOfficialRoot=async function(rootId){
  try{await this.api(`https://www.googleapis.com/drive/v3/files/${rootId}?supportsAllDrives=true&fields=id,appProperties`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{borionApp:'cnpj',borionOfficial:'true',borionVersion:V115_VERSION}})})}
  catch(e){console.warn('Não foi possível marcar a pasta oficial',e)}
};
Drive.resolveRoot=async function(forceScan=false){
  const now=Date.now();if(!forceScan&&App.drive.rootId&&now-Number(App.drive.lastRootScanAt||0)<30000)return App.drive.rootId;
  const roots=await this.listRootFolders(),inspected=[];for(const root of roots)inspected.push(await this.inspectRoot(root));
  const cached=localStorage.getItem(v115RootKey())||'';
  const valid=inspected.filter(x=>x.hasState).sort(compareRemoteCandidates);
  let chosen=valid[0]||null;
  if(chosen&&cached){const tied=valid.find(x=>x.root.id===cached&&Number(x.revision||0)===Number(chosen.revision||0)&&Number(x.recordCount||0)===Number(chosen.recordCount||0));if(tied)chosen=tied}
  if(!chosen&&inspected.length)chosen=inspected.find(x=>x.root.id===cached)||inspected.find(x=>x.root.appProperties?.borionOfficial==='true')||inspected[0];
  if(!chosen){const created=await this.createFolder('',App.state.settings.rootFolderName||CFG.driveRootFolderName||'Borion CNPJ');chosen={root:created,revision:-1,recordCount:0,hasState:false}}
  App.drive.rootId=chosen.root.id;App.drive.lastRootScanAt=now;App.drive.officialRevision=Number(chosen.revision||0);App.state.settings.rootFolderId=chosen.root.id;
  localStorage.setItem(v115RootKey(),chosen.root.id);await this.markOfficialRoot(chosen.root.id);await saveLocal('pasta-oficial',false);return chosen.root.id;
};

Drive.writeOperation=async function(structure,state,baseRevision){
  const name=`OP_${nowISO().replace(/[:.]/g,'-')}_${safeFilePart(v115DeviceId())}_${uid()}.json`;const operationId=name;
  const payload={app:'Borion CNPJ',version:V115_VERSION,operationId,deviceId:v115DeviceId(),createdAt:nowISO(),user:App.user?.email||'',baseRevision:Number(baseRevision||0),state};
  const saved=await this.uploadJson(structure.operations,name,payload);return {operationId,file:saved};
};
Drive.writeCurrentFiles=async function(structure,payload,current){
  const nestedFile=current?.nestedFile||((current?.kind==='nested'&&current.file)?current.file:null)||await this.findChild(structure.data,V115_CURRENT_FILE);
  const nestedSaved=await this.uploadJson(structure.data,V115_CURRENT_FILE,payload,nestedFile?.id||'');
  let mirrorSaved=null;
  try{const mirrorFile=current?.mirrorFile||((current?.kind==='mirror'&&current.file)?current.file:null)||await this.findChild(structure.root,V115_ROOT_MIRROR);mirrorSaved=await this.uploadJson(structure.root,V115_ROOT_MIRROR,payload,mirrorFile?.id||'')}
  catch(e){console.warn('Espelho da raiz não foi atualizado; current.json segue oficial.',e)}
  return {nestedSaved,mirrorSaved};
};
Drive.verifyCurrent=async function(file,expectedState,expectedRevision){
  const raw=new TextDecoder().decode(await this.downloadFile(file.id));const parsed=JSON.parse(raw),state=migrateStateV104(parsed.state||parsed);
  const revision=Number(parsed.revision??state.meta?.revision??-1);
  if(revision!==Number(expectedRevision)||stateSignature(state)!==stateSignature(expectedState))throw new Error('O Google Drive não confirmou todos os registros desta sincronização.');
  return state;
};

Drive._lock=Promise.resolve();
Drive.runLocked=function(kind,task){
  const run=(this._lock||Promise.resolve()).catch(()=>{}).then(async()=>{
    if(!App.drive.connected)return false;
    App.drive.syncing=true;App.drive.operation=kind;
    try{return await withTimeout(task(),60000,'A sincronização com o Google Drive demorou demais e foi cancelada.')}
    finally{App.drive.syncing=false;App.drive.operation=''}
  });
  this._lock=run;return run;
};
Drive._pullOnce=async function(showMessage=false,forceRootScan=false){
  updateSyncUI('busy','Atualizando','Lendo a base oficial do Google Drive');
  await this.resolveRoot(forceRootScan||!App.drive.rootId);const structure=await this.ensureStructure();const remote=await this.loadRemoteBundle(structure);
  if(!remote.state){
    if(stateRecordCount(App.state)>0){v115SetPending(true);updateSyncUI('local','Dados locais prontos','A primeira cópia será enviada ao Google Drive');setTimeout(()=>this.sync().catch(console.error),100);return false}
    updateSyncUI('error','Drive sem dados','Nenhum current.json válido foi encontrado');if(showMessage)toast('Nenhuma base de dados foi encontrada nesta conta Google.','error',5500);return false;
  }
  const before=stateSignature(App.state),pending=v115Pending();
  App.state=pending?this.mergeState(App.state,remote.state,'remote'):migrateStateV104(remote.state);
  App.state.meta.appliedOperationIds=uniqueTail(remote.operationIds);App.drive.officialRevision=Number(remote.revision||0);
  await saveLocal('carregado-do-drive',false);renderAll();
  const changed=before!==stateSignature(App.state);updateSyncUI('ok','Sincronizado',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision||0}`);
  if(showMessage)toast(changed?`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`:'Este aparelho já está atualizado.','ok',3500);
  if(pending)setTimeout(()=>this.sync().catch(console.error),120);return changed;
};
Drive.pull=function(showMessage=false,forceRootScan=false){
  if(this._pullPromise){this._pullAgain=this._pullAgain||forceRootScan;return this._pullPromise}
  this._pullPromise=this.runLocked('pull',()=>this._pullOnce(showMessage,forceRootScan)).finally(()=>{
    this._pullPromise=null;if(this._pullAgain){const again=this._pullAgain;this._pullAgain=false;setTimeout(()=>this.pull(false,again).catch(console.error),100)}
  });
  return this._pullPromise;
};
Drive._syncOnce=async function(){
  updateSyncUI('busy','Sincronizando','Salvando e conferindo no Google Drive');
  const dirtyAtStart=v115DirtySeq();await this.resolveRoot(!App.drive.rootId);const structure=await this.ensureStructure();const remote=await this.loadRemoteBundle(structure);
  if(remote.state)App.state=this.mergeState(App.state,remote.state,'local');
  try{await this.syncAttachments(structure)}catch(e){console.warn('Anexos ficaram pendentes, mas os dados serão sincronizados.',e)}
  const baseRevision=Math.max(Number(App.state.meta?.revision||0),Number(remote.revision||0));
  App.state.meta.revision=baseRevision+1;App.state.meta.updatedAt=nowISO();App.state.meta.lastSyncedBy=App.user?.email||'';
  const stateForWrite=migrateStateV104(JSON.parse(JSON.stringify(App.state)));const operation=await this.writeOperation(structure,stateForWrite,baseRevision);
  stateForWrite.meta.appliedOperationIds=uniqueTail([...operationIdsFromState(stateForWrite),...remote.operationIds,operation.operationId]);
  App.state.meta.appliedOperationIds=[...stateForWrite.meta.appliedOperationIds];
  const payload={app:'Borion CNPJ',version:V115_VERSION,updatedAt:stateForWrite.meta.updatedAt,revision:stateForWrite.meta.revision,user:App.user?.email||'',deviceId:v115DeviceId(),appliedOperationIds:stateForWrite.meta.appliedOperationIds,state:stateForWrite};
  const saved=await this.writeCurrentFiles(structure,payload,remote.current);await this.verifyCurrent(saved.nestedSaved,stateForWrite,stateForWrite.meta.revision);
  App.drive.dataFileId=saved.nestedSaved.id;App.drive.officialRevision=Number(stateForWrite.meta.revision||0);
  const clean=v115DirtySeq()===dirtyAtStart;
  if(clean){
    App.state=stateForWrite;v115SetPending(false);
  }else{
    // Uma alteração aconteceu enquanto o Drive respondia. Mantém o estado vivo do aparelho
    // e incorpora apenas a confirmação remota, sem devolver a tela para uma cópia antiga.
    App.state=this.mergeState(App.state,stateForWrite,'local');
    App.state.meta.appliedOperationIds=uniqueTail([...operationIdsFromState(App.state),...operationIdsFromState(stateForWrite)]);
    v115SetPending(true);
  }
  await saveLocal('sincronizado-confirmado',false);renderAll();updateSyncUI('ok',clean?'Sincronizado':'Sincronizando nova alteração',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision}`);
  // Backups nunca bloqueiam o current.json. Falhas aqui são apenas registradas para nova tentativa.
  try{
    const now=Date.now(),lastAuto=Number(App.state.settings.lastAutoBackupAt||0);if(now-lastAuto>10*60*1000){await this.createSnapshot(structure,'AUTO');App.state.settings.lastAutoBackupAt=now}
    const day=todayISO(),month=day.slice(0,7);if(App.state.settings.lastDailyBackup!==day){await this.createSnapshot(structure,'DIARIO');App.state.settings.lastDailyBackup=day}if(App.state.settings.lastMonthlyBackup!==month){await this.createSnapshot(structure,'MENSAL');App.state.settings.lastMonthlyBackup=month}
    App.state.settings.lastDriveBackupDate=nowISO();await saveLocal('backups-confirmados',false);
  }catch(e){console.warn('Backup adiado; current.json já foi confirmado.',e)}
  return clean;
};
Drive.sync=function(){
  v115SetPending(true);this._syncAgain=true;
  if(this._syncPromise)return this._syncPromise;
  this._syncPromise=this.runLocked('sync',async()=>{
    let loops=0,result=false;
    do{this._syncAgain=false;result=await this._syncOnce();loops++}while((this._syncAgain||v115Pending())&&loops<4);
    return result;
  }).catch(e=>{v115SetPending(true);updateSyncUI('error','Pendente no Drive','Dados preservados neste aparelho');throw e}).finally(()=>{
    this._syncPromise=null;if(this._syncAgain||v115Pending()){this._retryDelay=Math.min(Math.max(Number(this._retryDelay||5000)*1.6,5000),60000);if(navigator.onLine)setTimeout(()=>this.sync().catch(console.error),this._retryDelay)}else this._retryDelay=5000;
  });
  return this._syncPromise;
};
Drive.refreshNow=async function(showMessage=true){await this.pull(false,true);if(v115Pending())await this.sync();if(showMessage)toast(`${stateActiveChequeCount(App.state)} cheque(s) confirmados neste aparelho.`,'ok',3500);return true};

function showGate(){ $('#boot').hidden=true;$('#app').hidden=true;$('#gate').hidden=false;const note=$('#gate-config-note');if(note)note.textContent=Drive.clientId()?'Entre com a mesma conta Google usada no computador.':'Google OAuth ainda não configurado: cole o Client ID em js/config.js antes de publicar.'; }
function showApp(){ $('#boot').hidden=true;$('#gate').hidden=true;$('#app').hidden=false;const u=App.user||{name:'Modo local',email:'Neste navegador'};$('#user-name').textContent=u.name;$('#user-email').textContent=u.email;$('#user-avatar').textContent=initials(u.name);renderAll();setPage(App.page); }
async function boot(){
  try{await openDB();await loadLocal();$('#boot-detail').textContent='Preparando cheques e boletos';await sleep(200);const last=localStorage.getItem('borion_cnpj_last_user');if(last)try{App.user=JSON.parse(last)}catch{}showGate()}
  catch(e){console.error(e);$('#boot-detail').textContent='Falha ao iniciar: '+e.message;toast(e.message,'error',8000)}
}
function logout(){stopDriveRefreshLoop();App.drive={token:'',rootId:'',dataFileId:'',connected:false,syncing:false,tokenClient:null};App.user=null;App.localMode=true;showGate()}
function localLogin(){App.user={name:'Modo local',email:'Neste navegador'};App.localMode=true;App.drive.connected=false;showApp();updateSyncUI('local','Modo local','Salvamento neste navegador')}
function reconnectGoogle(){logout();setTimeout(()=>Drive.login().catch(e=>toast(e.message,'error',6000)),100)}

Drive.login=async function(){
  const clientId=this.clientId();if(!clientId)throw new Error('Google OAuth não configurado.');
  const resp=await this.requestToken('select_account');showAccountLoading(true,'Carregando dados do Google Drive');
  try{
    App.drive.token=resp.access_token;const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&&!allowed.includes(String(info.email).toLowerCase()))throw new Error('Esta conta não está autorizada.');
    let previous='';try{previous=JSON.parse(localStorage.getItem('borion_cnpj_last_user')||'{}').email||''}catch{}
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''};App.localMode=false;App.drive.connected=true;loadAccountLocalState(info.email,previous);
    localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));App.drive.rootId='';App.drive.lastRootScanAt=0;
    // Migra somente uma pendência antiga que realmente contenha dados locais.
    if((localStorage.getItem('borion_cnpj_pending_sync_v109')==='1'||localStorage.getItem('borion_cnpj_pending_sync_v111_'+normalize(info.email))==='1')&&stateRecordCount(App.state)>0)v115SetPending(true);
    await this.pull(false,true);if(v115Pending())await this.sync();showAccountLoading(false);showApp();startDriveRefreshLoop();
  }catch(e){
    showAccountLoading(false);
    if(App.user&&stateRecordCount(App.state)>0){showApp();updateSyncUI('error','Falha ao atualizar','Dados locais preservados');startDriveRefreshLoop()}else showGate();
    throw e;
  }
};


function flushPendingLocalNow(){
  if(!App.saveTimer)return;
  clearTimeout(App.saveTimer);App.saveTimer=null;
  App.state=migrateStateV104(App.state);App.state.meta.updatedAt=nowISO();App.state.meta.revision=Number(App.state.meta.revision||0)+1;v115MarkDirty();
  const json=JSON.stringify(App.state);
  try{localStorage.setItem(V104_LOCAL_STATE_KEY,json);localStorage.setItem(V104_LOCAL_LAST_GOOD_KEY,json);if(App.user?.email)localStorage.setItem(v115AccountStateKey(),json)}catch(e){console.warn('Falha ao concluir salvamento local ao fechar',e)}
}


// ---------- Versão 1.0.16: fonte oficial real no Drive e recuperação PC/celular ----------
const V116_VERSION='1.0.23';
const V116_RECOVERY_PREFIX='borion_cnpj_recovery_v116_';
const V116_LAST_REMOTE_PREFIX='borion_cnpj_last_remote_v116_';

function v116RecoveryKey(){return V116_RECOVERY_PREFIX+v115AccountKey()}
function v116LastRemoteKey(){return V116_LAST_REMOTE_PREFIX+v115AccountKey()}
function v116CloneState(state){return migrateStateV104(JSON.parse(JSON.stringify(state||blankState())))}
function v116AttachmentCount(state){
  const s=migrateStateV104(state||blankState());let total=0;
  for(const record of [...(s.cheques||[]),...(s.boletos||[])])total+=(record.attachments||[]).length;
  return total;
}
function v116PendingAttachmentCount(state=App.state){
  const s=migrateStateV104(state||blankState());let total=0;
  for(const record of [...active(s.cheques),...active(s.boletos)])for(const att of record.attachments||[])if(att.pendingUpload||!att.driveFileId)total++;
  return total;
}
function v116StateSignature(state){
  const s=migrateStateV104(state||blankState());
  const row=x=>({
    id:String(x.id||''),updatedAt:String(x.updatedAt||x.createdAt||''),deleted:Boolean(x.deleted),
    attachments:(x.attachments||[]).map(a=>({id:String(a.id||''),driveFileId:String(a.driveFileId||''),pendingUpload:Boolean(a.pendingUpload),role:String(a.role||''),name:String(a.name||'')})).sort((a,b)=>a.id.localeCompare(b.id))
  });
  const sort=list=>(list||[]).map(row).sort((a,b)=>a.id.localeCompare(b.id));
  return JSON.stringify({
    fornecedores:sort(s.fornecedores),cheques:sort(s.cheques),boletos:sort(s.boletos),
    contas:sort(s.settings?.chequeAccounts||[]),deleted:[...(s.deleted||[])].sort(),
    companyName:String(s.settings?.companyName||''),warningDays:Number(s.settings?.warningDays||0)
  });
}
function v116PrepareState(state,revision){
  const out=v116CloneState(state);out.meta.version=V116_VERSION;out.meta.revision=Number(revision||0);out.meta.updatedAt=nowISO();out.meta.lastSyncedBy=App.user?.email||'';return out;
}
async function v116RecoverLocalStateIfNeeded(){
  if(stateRecordCount(App.state)>0||localStorage.getItem(v116RecoveryKey())==='1')return false;
  localStorage.setItem(v116RecoveryKey(),'1');
  const candidates=[];
  const add=raw=>{try{const parsed=typeof raw==='string'?JSON.parse(raw):raw;if(parsed)candidates.push(migrateStateV104(parsed.state||parsed))}catch{}};
  add(localStorage.getItem(V104_LOCAL_STATE_KEY));add(localStorage.getItem(V104_LOCAL_LAST_GOOD_KEY));add(localStorage.getItem(v115AccountStateKey()));
  try{
    if(App.db?.objectStoreNames.contains('snapshots')){
      const rows=await new Promise((resolve,reject)=>{const r=App.db.transaction('snapshots').objectStore('snapshots').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
      for(const item of rows.slice(-80))add(item.state);
    }
  }catch(e){console.warn('Recuperação local v1.0.23 não conseguiu ler snapshots',e)}
  candidates.sort((a,b)=>stateRecordCount(b)-stateRecordCount(a)||String(stateUpdatedAt(b)).localeCompare(String(stateUpdatedAt(a)))||Number(b.meta?.revision||0)-Number(a.meta?.revision||0));
  const best=candidates[0];if(!best||stateRecordCount(best)===0)return false;
  App.state=v116CloneState(best);v115SetPending(true);await saveLocal('recuperacao-local-v116',false);return true;
}

// A base oficial é somente Sistema/Dados/current.json. Operações antigas continuam preservadas,
// mas deixam de ser varridas em toda abertura, evitando travamento e repetição infinita.
Drive.loadRemoteBundle=async function(structure){
  const current=await this.loadCurrentFromStructure(structure);
  const state=current?.state?migrateStateV104(current.state):null;
  return {state,current,revision:Number(current?.revision??state?.meta?.revision??0),updatedAt:stateUpdatedAt(state),operationIds:operationIdsFromState(state||{}),operationCount:0};
};

Drive.verifyCurrentV116=async function(file,expectedState,expectedRevision){
  if(!file?.id)throw new Error('O Drive não retornou o arquivo current.json gravado.');
  const raw=new TextDecoder().decode(await this.downloadFile(file.id));
  const parsed=JSON.parse(raw),state=migrateStateV104(parsed.state||parsed),revision=Number(parsed.revision??state.meta?.revision??-1);
  if(revision!==Number(expectedRevision))throw new Error(`O Drive confirmou a revisão ${revision}, mas o Borion enviou a revisão ${expectedRevision}.`);
  if(v116StateSignature(state)!==v116StateSignature(expectedState))throw new Error('O current.json foi lido novamente, mas não contém todos os cheques e anexos enviados.');
  return state;
};

Drive.writeCanonicalV116=async function(structure,state,current=null){
  const payload={app:'Borion CNPJ',version:V116_VERSION,updatedAt:state.meta.updatedAt,revision:Number(state.meta.revision||0),user:App.user?.email||'',deviceId:v115DeviceId(),state};
  const saved=await this.writeCurrentFiles(structure,payload,current);
  await this.verifyCurrentV116(saved.nestedSaved,state,state.meta.revision);
  App.drive.dataFileId=saved.nestedSaved.id;App.drive.officialRevision=Number(state.meta.revision||0);
  localStorage.setItem(v116LastRemoteKey(),v116StateSignature(state));
  return saved;
};

// Reaproveita fotos já existentes no Drive antes de criar outra cópia.
Drive.syncAttachments=async function(structure){
  const records=[...active(App.state.cheques).map(x=>({type:'Cheque',record:x,base:structure.cheques})),...active(App.state.boletos).map(x=>({type:'Boleto',record:x,base:structure.boletos}))];
  const result={uploaded:0,reused:0,failed:0,errors:[]};
  for(const pack of records){
    for(const att of pack.record.attachments||[]){
      if(att.driveFileId&&!att.pendingUpload)continue;
      try{
        const monthId=await this.monthFolder(pack.base,recordMovementDate(pack.record,pack.type));
        const ext=((att.name||'').match(/\.[a-zA-Z0-9]{1,8}$/)||[''])[0];
        const baseName=safeFilePart((att.name||'arquivo').replace(ext,''));
        const safeNumber=safeFilePart(pack.record.numero||pack.record.documento||pack.record.id);
        const legacyName=att.driveName||`${safeNumber}_${safeFilePart(att.role||'documento')}_${baseName}${ext}`;
        let existing=await this.findChild(monthId,legacyName);
        if(!existing&&att.driveName&&att.driveName!==legacyName)existing=await this.findChild(monthId,att.driveName);
        if(existing){att.driveFileId=existing.id;att.driveName=existing.name||legacyName;att.pendingUpload=false;att.encrypted=false;att.syncedAt=nowISO();result.reused++;continue}
        const plain=await getAttachmentBlob(att.id);
        const uploaded=await this.uploadMultipart(monthId,legacyName,plain,att.type||plain.type||'application/octet-stream');
        att.driveFileId=uploaded.id;att.driveName=legacyName;att.pendingUpload=false;att.encrypted=false;att.syncedAt=nowISO();result.uploaded++;
      }catch(e){att.pendingUpload=true;result.failed++;result.errors.push(`${pack.type} ${pack.record.numero||pack.record.documento||''}: ${e.message||e}`);console.warn('Anexo pendente',e)}
    }
  }
  return result;
};

Drive._syncOnceV116=async function(){
  const dirtyAtStart=v115DirtySeq();
  updateSyncUI('busy','Salvando dados','1 de 2 · confirmando cheques no current.json');
  await this.resolveRoot(!App.drive.rootId);
  const structure=await this.ensureStructure();
  const remote=await this.loadRemoteBundle(structure);
  const liveBefore=v116CloneState(App.state);
  const merged=remote.state?this.mergeState(liveBefore,remote.state,'local'):liveBefore;
  const firstRevision=Math.max(Number(merged.meta?.revision||0),Number(remote.revision||0),Number(App.drive.officialRevision||0))+1;
  const metadataState=v116PrepareState(merged,firstRevision);

  // Primeiro grava os registros. Assim o celular vê os cheques mesmo se uma foto for lenta ou falhar.
  const firstSaved=await this.writeCanonicalV116(structure,metadataState,remote.current);
  if(v115DirtySeq()===dirtyAtStart)App.state=metadataState;else App.state=this.mergeState(App.state,metadataState,'local');
  await saveLocal('current-confirmado-v116',false);renderAll();

  updateSyncUI('busy','Salvando fotos','2 de 2 · vinculando anexos aos cheques');
  const attachmentResult=await this.syncAttachments(structure);
  const needsSecondWrite=attachmentResult.uploaded>0||attachmentResult.reused>0||v116StateSignature(App.state)!==v116StateSignature(metadataState);
  if(needsSecondWrite){
    const snapshot=v116PrepareState(App.state,firstRevision+1);
    const dirtyBeforeSecond=v115DirtySeq();
    await this.writeCanonicalV116(structure,snapshot,{...remote.current,nestedFile:firstSaved.nestedSaved,mirrorFile:firstSaved.mirrorSaved});
    if(v115DirtySeq()===dirtyBeforeSecond)App.state=snapshot;else App.state=this.mergeState(App.state,snapshot,'local');
    await saveLocal('anexos-confirmados-v116',false);renderAll();
  }

  const clean=v115DirtySeq()===dirtyAtStart;
  if(clean)v115SetPending(false);else v115SetPending(true);
  const pendingPhotos=v116PendingAttachmentCount(App.state);
  if(pendingPhotos){
    updateSyncUI('local','Dados sincronizados',`${stateActiveChequeCount(App.state)} cheque(s) · ${pendingPhotos} foto(s) pendente(s)`);
  }else if(clean){
    updateSyncUI('ok','Salvo no Google Drive',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision||0}`);
  }else{
    updateSyncUI('busy','Nova alteração encontrada','O Borion fará mais uma confirmação');
  }
  return {clean,pendingPhotos,attachmentResult};
};

Drive.sync=function(){
  if(!App.drive.connected)return Promise.resolve(false);
  this._syncRequested=true;
  if(this._syncPromise)return this._syncPromise;
  this._syncPromise=this.runLocked('sync',async()=>{
    let passes=0,last=null;
    do{
      this._syncRequested=false;last=await this._syncOnceV116();passes++;
    }while((this._syncRequested||!last.clean)&&passes<2);
    return last;
  }).catch(e=>{
    v115SetPending(true);updateSyncUI('error','Não salvo no Drive',String(e.message||e).slice(0,120));throw e;
  }).finally(()=>{
    this._syncPromise=null;
    const shouldRetry=App.drive.connected&&navigator.onLine&&(v115Pending()||v116PendingAttachmentCount(App.state)>0);
    if(shouldRetry){clearTimeout(this._v116RetryTimer);this._v116RetryTimer=setTimeout(()=>this.sync().catch(console.warn),30000)}
  });
  return this._syncPromise;
};

Drive._pullOnceV116=async function(showMessage=false,forceRootScan=false){
  updateSyncUI('busy','Atualizando','Lendo Sistema/Dados/current.json');
  await this.resolveRoot(forceRootScan||!App.drive.rootId);
  const structure=await this.ensureStructure();
  const remote=await this.loadRemoteBundle(structure);
  const local=v116CloneState(App.state),localSig=v116StateSignature(local);
  if(!remote.state){
    if(stateRecordCount(local)>0){v115SetPending(true);updateSyncUI('local','Dados deste aparelho',`${stateActiveChequeCount(local)} cheque(s) serão enviados ao Drive`);return {changed:false,needsPush:true,remote:null}}
    updateSyncUI('error','Drive sem base','current.json não foi encontrado ou está inválido');
    if(showMessage)toast('O Drive ainda não possui uma base válida.','error',5000);
    return {changed:false,needsPush:false,remote:null};
  }
  const merged=this.mergeState(local,remote.state,v115Pending()?'local':'remote');
  const mergedSig=v116StateSignature(merged),remoteSig=v116StateSignature(remote.state);
  App.state=merged;App.drive.officialRevision=Number(remote.revision||0);
  await saveLocal('carregado-do-drive-v116',false);renderAll();
  const needsPush=mergedSig!==remoteSig;
  if(needsPush)v115SetPending(true);
  else if(v116PendingAttachmentCount(merged)===0)v115SetPending(false);
  const changed=localSig!==mergedSig;
  updateSyncUI('ok',needsPush?'Dados reunidos':'Sincronizado',`${stateActiveChequeCount(merged)} cheque(s) · revisão ${remote.revision||0}`);
  if(showMessage)toast(changed?`${stateActiveChequeCount(merged)} cheque(s) carregados do Google Drive.`:'Este aparelho já está atualizado.','ok',3500);
  return {changed,needsPush,remote};
};

Drive.pull=function(showMessage=false,forceRootScan=false){
  if(this._pullPromise){this._pullAgain=this._pullAgain||forceRootScan;return this._pullPromise}
  this._pullPromise=this.runLocked('pull',()=>this._pullOnceV116(showMessage,forceRootScan)).finally(()=>{
    this._pullPromise=null;
    if(this._pullAgain){const again=this._pullAgain;this._pullAgain=false;setTimeout(()=>this.pull(false,again).catch(console.warn),100)}
  });
  return this._pullPromise;
};

Drive.refreshNow=async function(showMessage=true){
  const pulled=await this.pull(false,true);
  if(pulled?.needsPush||v115Pending()||v116PendingAttachmentCount(App.state)>0)await this.sync();
  if(showMessage)toast(`${stateActiveChequeCount(App.state)} cheque(s) confirmados no Google Drive.`,v116PendingAttachmentCount(App.state)?'local':'ok',4000);
  return true;
};

Drive.login=async function(){
  const clientId=this.clientId();if(!clientId)throw new Error('Google OAuth não configurado.');
  const resp=await this.requestToken('select_account');showAccountLoading(true,'Abrindo a mesma base do computador');
  try{
    App.drive.token=resp.access_token;
    const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');
    const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&&!allowed.includes(String(info.email).toLowerCase()))throw new Error('Esta conta não está autorizada.');
    let previous='';try{previous=JSON.parse(localStorage.getItem('borion_cnpj_last_user')||'{}').email||''}catch{}
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''};App.localMode=false;App.drive.connected=true;
    loadAccountLocalState(info.email,previous);await v116RecoverLocalStateIfNeeded();
    localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));App.drive.rootId='';App.drive.lastRootScanAt=0;
    const pulled=await this.pull(false,true);
    if(pulled?.needsPush||v115Pending()||v116PendingAttachmentCount(App.state)>0){
      showAccountLoading(true,'Confirmando os cheques no Google Drive');
      try{await this.sync()}catch(e){console.error('Sincronização inicial v1.0.23',e)}
    }
    showAccountLoading(false);showApp();startDriveRefreshLoop();
    if(v115Pending())updateSyncUI('error','Pendente no Drive','Clique em atualizar para tentar novamente');
  }catch(e){
    showAccountLoading(false);
    if(App.user&&stateRecordCount(App.state)>0){showApp();updateSyncUI('error','Falha ao atualizar','Dados locais preservados');startDriveRefreshLoop()}else showGate();
    throw e;
  }
};


// ---------- Versão 1.0.23: descoberta automática da base real e recuperação segura ----------
// O ID configurado passa a ser apenas uma preferência. O aplicativo procura a base válida,
// inclusive quando existem pastas Sistema/Dados duplicadas, e nunca escolhe uma pasta vazia
// apenas porque ela foi modificada mais recentemente.
const V118_VERSION='1.0.23';
const V118_PREFERRED_ROOT_ID=String(CFG.driveRootFolderId||'').trim();
const V118_ROOT_MIRROR='BORION_CNPJ_CURRENT.json';
const V118_FOLDER_MIME='application/vnd.google-apps.folder';
const v118ResolveRootLegacy=Drive.resolveRoot.bind(Drive);
const v118EnsureStructureLegacy=Drive.ensureStructure.bind(Drive);

function v118PrepareState(state,revision){
  const out=v116CloneState(state);
  out.meta.version=V118_VERSION;
  out.meta.revision=Number(revision||0);
  out.meta.updatedAt=nowISO();
  out.meta.lastSyncedBy=App.user?.email||'';
  out.settings.rootFolderId=App.drive.rootId||out.settings.rootFolderId||'';
  out.settings.rootFolderName=CFG.driveRootFolderName||'Borion CNPJ';
  return out;
}
function v118ClearLegacyPending(){
  localStorage.removeItem('borion_cnpj_pending_sync_v109');
  localStorage.removeItem('borion_cnpj_pending_sync_v111_'+v115AccountKey());
}
function v118LooksLikeDataFile(name=''){
  const value=String(name||'').trim().toLowerCase();
  return value==='current.json'||value==='borion_cnpj_current.json'||value==='borion-cnpj-dados.json'||value==='dados.json'||value==='current.json.borion'||/^current\s*\(\d+\)\.json$/.test(value);
}
function v118CandidatePathKey(path={}){return [path.rootId||'',path.systemId||'',path.dataId||''].join('|')}
function v118CompareCandidates(a,b){
  const base=compareRemoteCandidates(a,b);if(base)return base;
  const rank=value=>value==='nested'?0:value==='system'?1:value==='root'||value==='root-mirror'?2:3;
  return rank(a?.kind||a?.path?.source)-rank(b?.kind||b?.path?.source);
}
function v118HasBorionShape(raw){
  const state=raw?.state||raw;
  return Boolean(state&&typeof state==='object'&&(Array.isArray(state.cheques)||Array.isArray(state.boletos)||Array.isArray(state.fornecedores)||Array.isArray(state.settings?.chequeAccounts)));
}

Drive.getMetadataV118=async function(fileId){
  if(!fileId)throw new Error('ID do arquivo não informado.');
  return this.api(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,parents,modifiedTime,createdTime,capabilities(canEdit,canDownload)`);
};
Drive.listFoldersByNameV118=async function(name){
  const q=`name='${this.q(name)}' and mimeType='${V118_FOLDER_MIME}' and trashed=false`;
  const params=new URLSearchParams({spaces:'drive',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,parents,appProperties)',q});
  const out=[];let pageToken='';
  do{
    if(pageToken)params.set('pageToken',pageToken);else params.delete('pageToken');
    const data=await this.api('https://www.googleapis.com/drive/v3/files?'+params.toString());
    out.push(...(data.files||[]));pageToken=data.nextPageToken||'';
  }while(pageToken&&out.length<500);
  return out;
};
Drive.listLikelyDataFilesV118=async function(){
  const q=`(name contains 'current' or name='BORION_CNPJ_CURRENT.json' or name='borion-cnpj-dados.json' or name='dados.json') and trashed=false`;
  const params=new URLSearchParams({spaces:'drive',pageSize:'200',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,parents,appProperties)',q});
  const out=[];let pageToken='';
  do{
    if(pageToken)params.set('pageToken',pageToken);else params.delete('pageToken');
    const data=await this.api('https://www.googleapis.com/drive/v3/files?'+params.toString());
    out.push(...(data.files||[]));pageToken=data.nextPageToken||'';
  }while(pageToken&&out.length<600);
  return out.filter(file=>v118LooksLikeDataFile(file.name));
};
Drive.readDataCandidateV118=async function(file){
  if(!file)return null;
  try{
    const rawText=new TextDecoder().decode(await this.downloadFile(file.id));
    const parsed=JSON.parse(rawText);
    if(String(file.name||'').toLowerCase().endsWith('.borion')){
      const decrypted=await decryptJson(parsed);if(!v118HasBorionShape(decrypted))return null;
      const state=migrateStateV104(decrypted);
      return {file,state,revision:Number(state.meta?.revision||0),updatedAt:stateUpdatedAt(state)||file.modifiedTime||'',modifiedTime:file.modifiedTime||'',recordCount:stateRecordCount(state),operationIds:operationIdsFromState(state)};
    }
    if(!v118HasBorionShape(parsed))return null;
    const state=migrateStateV104(parsed.state||parsed);
    return {file,state,revision:Number(parsed.revision??state.meta?.revision??0),updatedAt:String(parsed.updatedAt||state.meta?.updatedAt||file.modifiedTime||''),modifiedTime:file.modifiedTime||'',recordCount:stateRecordCount(state),operationIds:uniqueTail(parsed.appliedOperationIds||state.meta?.appliedOperationIds||[])};
  }catch(e){console.warn('Arquivo de dados inválido preservado',file?.id,e);return null}
};
Drive.inferPathFromFileV118=async function(file){
  const parentId=file?.parents?.[0]||'';if(!parentId)return null;
  try{
    const parent=await this.getMetadataV118(parentId);if(parent?.trashed)return null;
    const parentName=normalize(parent.name||'');
    if(String(file.name||'').toLowerCase()===V118_ROOT_MIRROR.toLowerCase()||parentName===normalize(CFG.driveRootFolderName||'Borion CNPJ')){
      return {rootId:parent.id,rootName:parent.name||'Borion CNPJ',systemId:'',dataId:'',source:'root-mirror'};
    }
    if(parentName==='dados'){
      const systemId=parent.parents?.[0]||'';if(!systemId)return null;
      const system=await this.getMetadataV118(systemId);const rootId=system.parents?.[0]||'';if(!rootId)return null;
      const root=await this.getMetadataV118(rootId);
      return {rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:system.id,dataId:parent.id,source:'nested'};
    }
    if(parentName==='sistema'){
      const rootId=parent.parents?.[0]||'';if(!rootId)return null;const root=await this.getMetadataV118(rootId);
      return {rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:parent.id,dataId:'',source:'system'};
    }
    return {rootId:parent.id,rootName:parent.name||'Borion CNPJ',systemId:'',dataId:'',source:'direct'};
  }catch(e){console.warn('Não foi possível reconstruir o caminho da base',file?.id,e);return null}
};
Drive.readCandidatesFromFolderV118=async function(parentId,kind,path){
  if(!parentId)return [];
  const files=(await this.listChildren(parentId)).filter(file=>v118LooksLikeDataFile(file.name));
  const out=[];
  for(const file of files){
    const candidate=await this.readDataCandidateV118(file);
    if(candidate)out.push({...candidate,kind,path});
  }
  return out;
};
Drive.inspectRootV118=async function(root){
  const candidates=[];const paths=[];
  if(!root?.id)return {root,candidates,paths,best:null};
  const rootPath={rootId:root.id,rootName:root.name||CFG.driveRootFolderName||'Borion CNPJ',systemId:'',dataId:'',source:'root'};
  const systems=await this.listChildren(root.id,'Sistema',V118_FOLDER_MIME);
  for(const system of systems){
    const dataFolders=await this.listChildren(system.id,'Dados',V118_FOLDER_MIME);
    if(!dataFolders.length)paths.push({...rootPath,systemId:system.id,source:'system'});
    for(const data of dataFolders){
      const path={...rootPath,systemId:system.id,dataId:data.id,source:'nested'};paths.push(path);
      candidates.push(...await this.readCandidatesFromFolderV118(data.id,'nested',path));
    }
    candidates.push(...await this.readCandidatesFromFolderV118(system.id,'system',{
      ...rootPath,systemId:system.id,source:'system'
    }));
  }
  candidates.push(...await this.readCandidatesFromFolderV118(root.id,'root',rootPath));
  candidates.sort(v118CompareCandidates);
  return {root,candidates,paths,best:candidates[0]||null};
};
Drive.discoverOfficialV118=async function(forceScan=false){
  if(!forceScan&&this._v118Discovery&&Date.now()-Number(this._v118Discovery.at||0)<30000)return this._v118Discovery;
  const roots=new Map();
  const addRoot=meta=>{if(meta?.id&&!meta.trashed&&meta.mimeType===V118_FOLDER_MIME)roots.set(meta.id,meta)};
  const preferredIds=[App.drive.rootId,localStorage.getItem(v115RootKey()),App.state.settings?.rootFolderId,V118_PREFERRED_ROOT_ID].filter(Boolean);
  for(const id of preferredIds){try{addRoot(await this.getMetadataV118(id))}catch(e){console.warn('Pasta preferida do Drive não pôde ser aberta',id,e)}}
  try{for(const folder of await this.listFoldersByNameV118(CFG.driveRootFolderName||'Borion CNPJ'))addRoot(folder)}catch(e){console.warn('Busca de pastas Borion CNPJ falhou',e)}

  const found=[];
  for(const root of roots.values()){
    try{
      const inspected=await this.inspectRootV118(root);
      for(const candidate of inspected.candidates)found.push(candidate);
    }catch(e){console.warn('Pasta Borion CNPJ ignorada durante a inspeção',root.id,e)}
  }

  try{
    for(const file of await this.listLikelyDataFilesV118()){
      const candidate=await this.readDataCandidateV118(file);if(!candidate)continue;
      const path=await this.inferPathFromFileV118(file);if(!path?.rootId)continue;
      found.push({...candidate,kind:path.source||'discovered',path});
      if(!roots.has(path.rootId))try{addRoot(await this.getMetadataV118(path.rootId))}catch{}
    }
  }catch(e){console.warn('Busca global de current.json falhou',e)}

  const unique=new Map();
  for(const candidate of found){
    const key=String(candidate.file?.id||candidate.legacy?.id||'')+'|'+v118CandidatePathKey(candidate.path);
    if(key&&!unique.has(key))unique.set(key,candidate);
  }
  const valid=Array.from(unique.values()).sort(v118CompareCandidates);
  const best=valid.find(item=>Number(item.recordCount||0)>0)||valid[0]||null;
  let root=null,path=null;
  if(best?.path?.rootId){
    path=best.path;root=roots.get(path.rootId)||null;
    if(!root)try{root=await this.getMetadataV118(path.rootId)}catch{}
  }
  if(!root){
    const preferred=preferredIds.find(id=>roots.has(id));root=(preferred&&roots.get(preferred))||Array.from(roots.values())[0]||null;
    if(root)path={rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:'',dataId:'',source:'empty-root'};
  }
  if(!root){
    const created=await this.createFolder('',CFG.driveRootFolderName||'Borion CNPJ');
    root={...created,mimeType:V118_FOLDER_MIME};path={rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:'',dataId:'',source:'created'};
  }
  const result={at:Date.now(),root,path,best,candidates:valid};this._v118Discovery=result;return result;
};
Drive.resolveRoot=async function(forceScan=false){
  const discovered=await this.discoverOfficialV118(forceScan);
  App.drive.rootId=discovered.root.id;App.drive.lastRootScanAt=Date.now();App.drive.officialRevision=Number(discovered.best?.revision||0);
  App.drive._v118Path=discovered.path||null;App.drive._v118Current=discovered.best||null;
  App.state.settings.rootFolderId=discovered.root.id;App.state.settings.rootFolderName=discovered.root.name||CFG.driveRootFolderName||'Borion CNPJ';
  localStorage.setItem(v115RootKey(),discovered.root.id);await saveLocal('pasta-real-v118',false);return discovered.root.id;
};
Drive.ensureStructure=async function(){
  const root=App.drive.rootId||await this.resolveRoot();let path=App.drive._v118Path;
  let system=null,data=null;
  if(path?.rootId===root&&path.systemId){try{system=await this.getMetadataV118(path.systemId)}catch{system=null}}
  if(!system)system=await this.ensureFolder(root,'Sistema');
  if(path?.rootId===root&&path.dataId){try{data=await this.getMetadataV118(path.dataId)}catch{data=null}}
  if(!data)data=await this.ensureFolder(system.id,'Dados');
  const backups=await this.ensureFolder(system.id,'Backups');
  const history=await this.ensureFolder(system.id,'Histórico');
  const operations=await this.ensureFolder(system.id,'Operações');
  const cheques=await this.ensureFolder(root,'Cheques');
  const boletos=await this.ensureFolder(root,'Boletos');
  App.drive._v118Path={rootId:root,rootName:App.state.settings.rootFolderName||'Borion CNPJ',systemId:system.id,dataId:data.id,source:path?.source||'ensured'};
  return {root,system:system.id,data:data.id,backups:backups.id,history:history.id,operations:operations.id,cheques:cheques.id,boletos:boletos.id};
};
Drive.readCanonicalV118=async function(structure){
  const candidates=[];
  const add=async(file,kind,path)=>{const candidate=await this.readDataCandidateV118(file);if(candidate)candidates.push({...candidate,kind,path})};
  const nestedFiles=(await this.listChildren(structure.data)).filter(file=>v118LooksLikeDataFile(file.name));
  const rootFiles=(await this.listChildren(structure.root)).filter(file=>v118LooksLikeDataFile(file.name));
  for(const file of nestedFiles)await add(file,'nested',App.drive._v118Path);
  for(const file of rootFiles)await add(file,'root',App.drive._v118Path);
  const discovered=App.drive._v118Current;
  if(discovered?.state&&discovered.path?.rootId===structure.root)candidates.push(discovered);
  candidates.sort(v118CompareCandidates);
  const best=candidates[0]||null;
  if(best){
    best.nestedFile=nestedFiles.find(file=>String(file.name||'').toLowerCase()===V115_CURRENT_FILE)||null;
    best.mirrorFile=rootFiles.find(file=>String(file.name||'').toLowerCase()===V118_ROOT_MIRROR.toLowerCase())||null;
  }
  return best;
};
Drive.loadRemoteBundle=async function(structure){
  const current=await this.readCanonicalV118(structure);const state=current?.state?v116CloneState(current.state):null;
  return {state,current,revision:Number(current?.revision??state?.meta?.revision??0),updatedAt:stateUpdatedAt(state),operationIds:operationIdsFromState(state||{}),operationCount:0};
};
Drive.writeCanonicalV118=async function(structure,state,current=null){
  const payload={app:'Borion CNPJ',version:V118_VERSION,updatedAt:state.meta.updatedAt,revision:Number(state.meta.revision||0),user:App.user?.email||'',deviceId:v115DeviceId(),state};
  const saved=await this.writeCurrentFiles(structure,payload,current);await this.verifyCurrentV116(saved.nestedSaved,state,state.meta.revision);
  App.drive.dataFileId=saved.nestedSaved.id;App.drive.officialRevision=Number(state.meta.revision||0);localStorage.setItem(v116LastRemoteKey(),v116StateSignature(state));return saved;
};
Drive._pullOnceV118=async function(showMessage=false,forceRootScan=false){
  updateSyncUI('busy','Carregando','Procurando a base válida no Google Drive');
  await this.resolveRoot(forceRootScan||!App.drive.rootId);const structure=await this.ensureStructure();const remote=await this.loadRemoteBundle(structure);const local=v116CloneState(App.state);
  if(!remote.state){
    if(stateRecordCount(local)>0){v115SetPending(true);updateSyncUI('local','Dados deste aparelho',`${stateActiveChequeCount(local)} cheque(s) prontos para recuperar o Drive`);return {changed:false,needsPush:true,remote:null}}
    updateSyncUI('error','Base não encontrada','Nenhum current.json válido foi localizado');
    throw new Error('Não foi encontrada uma base válida do Borion CNPJ nesta conta. Não apague as pastas: os dados locais e os arquivos do Drive foram preservados.');
  }
  const localPending=v115Pending()&&stateRecordCount(local)>0;const next=localPending?this.mergeState(remote.state,local,'local'):v116CloneState(remote.state);
  next.settings.rootFolderId=App.drive.rootId;next.settings.rootFolderName=CFG.driveRootFolderName||'Borion CNPJ';
  const changed=v116StateSignature(local)!==v116StateSignature(next);const needsPush=localPending&&v116StateSignature(next)!==v116StateSignature(remote.state);
  App.state=next;App.drive.officialRevision=Number(remote.revision||0);await saveLocal('carregado-da-base-real-v118',false);renderAll();
  if(needsPush)v115SetPending(true);else{v115SetPending(false);v118ClearLegacyPending()}
  updateSyncUI('ok',needsPush?'Dados reunidos':'Sincronizado',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${remote.revision||0}`);
  if(showMessage)toast(changed?`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`:'Este aparelho já está atualizado.','ok',4200);
  return {changed,needsPush,remote};
};
Drive.pull=function(showMessage=false,forceRootScan=false){
  if(!App.drive.connected)return Promise.reject(new Error('Entre com o Google para atualizar.'));
  if(this._pullPromise)return this._pullPromise;
  this._pullPromise=this.runLocked('pull',()=>this._pullOnceV118(showMessage,forceRootScan)).finally(()=>{this._pullPromise=null});return this._pullPromise;
};
Drive._syncOnceV118=async function(){
  const dirtyAtStart=v115DirtySeq();updateSyncUI('busy','Salvando no Drive','Confirmando os registros');
  await this.resolveRoot(!App.drive.rootId);const structure=await this.ensureStructure();const remote=await this.loadRemoteBundle(structure);const local=v116CloneState(App.state);
  if(!remote.state&&stateRecordCount(local)===0)throw new Error('Não existe base no Drive e este aparelho não possui dados para recuperar.');
  const merged=remote.state?this.mergeState(remote.state,local,'local'):local;const firstRevision=Math.max(Number(merged.meta?.revision||0),Number(remote.revision||0),Number(App.drive.officialRevision||0))+1;
  const firstState=v118PrepareState(merged,firstRevision);const firstSaved=await this.writeCanonicalV118(structure,firstState,remote.current);
  if(v115DirtySeq()===dirtyAtStart)App.state=firstState;else App.state=this.mergeState(firstState,App.state,'local');await saveLocal('registros-confirmados-v118',false);renderAll();
  updateSyncUI('busy','Salvando fotos','Conferindo anexos já existentes');const attachmentResult=await this.syncAttachments(structure);
  const attachmentChanged=attachmentResult.uploaded>0||attachmentResult.reused>0||v116StateSignature(App.state)!==v116StateSignature(firstState);
  if(attachmentChanged){
    const secondState=v118PrepareState(App.state,firstRevision+1);const dirtyBeforeSecond=v115DirtySeq();
    await this.writeCanonicalV118(structure,secondState,{...remote.current,nestedFile:firstSaved.nestedSaved,mirrorFile:firstSaved.mirrorSaved});
    if(v115DirtySeq()===dirtyBeforeSecond)App.state=secondState;else App.state=this.mergeState(secondState,App.state,'local');await saveLocal('fotos-confirmadas-v118',false);renderAll();
  }
  const clean=v115DirtySeq()===dirtyAtStart;const pendingPhotos=v116PendingAttachmentCount(App.state);
  if(clean&&pendingPhotos===0){v115SetPending(false);v118ClearLegacyPending()}else v115SetPending(true);
  if(pendingPhotos)updateSyncUI('local','Dados salvos no Drive',`${stateActiveChequeCount(App.state)} cheque(s) · ${pendingPhotos} foto(s) ainda pendente(s)`);
  else if(clean)updateSyncUI('ok','Salvo no Google Drive',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision||0}`);
  else updateSyncUI('local','Alteração local pendente','Toque em atualizar para confirmar a última mudança');
  this._v118Discovery=null;return {clean,pendingPhotos,attachmentResult};
};
Drive.sync=function(){
  if(!App.drive.connected)return Promise.resolve(false);this._syncRequested=true;if(this._syncPromise)return this._syncPromise;
  this._syncPromise=this.runLocked('sync',async()=>{let result=null;for(let pass=0;pass<2;pass++){this._syncRequested=false;result=await this._syncOnceV118();if(!this._syncRequested&&result.clean)break}return result})
    .catch(e=>{v115SetPending(true);updateSyncUI('error','Não salvo no Drive',String(e.message||e).slice(0,150));throw e})
    .finally(()=>{this._syncPromise=null;this._syncRequested=false});return this._syncPromise;
};
Drive.refreshNow=async function(showMessage=true){
  const pulled=await this.pull(false,true);if(pulled.needsPush||v115Pending())await this.sync();if(showMessage)toast(`${stateActiveChequeCount(App.state)} cheque(s) confirmados no Google Drive.`,v115Pending()?'local':'ok',4200);return true;
};
Drive.login=async function(){
  const clientId=this.clientId();if(!clientId)throw new Error('Google OAuth não configurado.');const resp=await this.requestToken('select_account');showAccountLoading(true,'CARREGANDO . . .');
  try{
    App.drive.token=resp.access_token;const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&&!allowed.includes(String(info.email).toLowerCase()))throw new Error('Esta conta não está autorizada.');
    let previous='';try{previous=JSON.parse(localStorage.getItem('borion_cnpj_last_user')||'{}').email||''}catch{}
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''};App.localMode=false;App.drive.connected=true;App.drive.rootId='';App.drive.lastRootScanAt=0;App.drive._v118Path=null;App.drive._v118Current=null;this._v118Discovery=null;
    loadAccountLocalState(info.email,previous);await v116RecoverLocalStateIfNeeded();localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));
    const pulled=await this.pull(false,true);if(pulled.needsPush)await this.sync();showAccountLoading(false);showApp();startDriveRefreshLoop();toast(`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`,'ok',4200);
  }catch(e){
    showAccountLoading(false);if(App.user&&stateRecordCount(App.state)>0){showApp();updateSyncUI('error','Falha ao abrir o Drive','Dados locais preservados');startDriveRefreshLoop()}else showGate();throw e;
  }
};

// ---------- Versão 1.0.15: carregamento simples e visão geral limpa ----------
App.dashboardMonth=App.dashboardMonth||todayISO().slice(0,7);
App.dashboardDate=App.dashboardDate||'';
PAGE_META.dashboard=['Visão Geral','Cheques emitidos e depositados por data.'];

function showAccountLoading(show=true,detail='CARREGANDO . . .'){
  const layer=$('#account-loading');if(!layer)return;layer.hidden=!show;const text=$('[data-account-loading-text]',layer);if(text)text.textContent='CARREGANDO . . .';if(show){$('#gate').hidden=true;$('#app').hidden=true;$('#boot').hidden=true;}
}

function chequeDepositado(x){
  const st=normalize(x.status||'');
  return x.tipo==='Recebido'||st.includes('depositad')||st.includes('compensad');
}
function chequeDashboardDate(x,depositado=false){
  return depositado?(x.dataCompensacao||x.dataEntrega||x.dataBom||x.dataEmissao||''):(x.dataBom||x.dataEmissao||'');
}
function dashboardMonthLabel(month){
  const [y,m]=String(month).split('-').map(Number);return `${MONTHS[(m||1)-1]} de ${y}`;
}
function dashboardMonthMove(delta){
  const [y,m]=App.dashboardMonth.split('-').map(Number);const d=new Date(y,m-1+delta,1);App.dashboardMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;App.dashboardDate='';renderDashboard();refreshDashboardCalendarModal();
}
function dashboardSelectDate(date){
  App.dashboardDate=App.dashboardDate===date?'':date;renderDashboard();
  $('#btn-dashboard-calendar')?.classList.toggle('has-date',!!App.dashboardDate);
  if($('[data-dashboard-calendar-modal]'))closeModal();
}
function dashboardCalendarMarkup(){
  const all=active(App.state.cheques);
  return dashboardCalendar(App.dashboardMonth,all.filter(x=>x.tipo==='Emitido'),all.filter(chequeDepositado));
}
function refreshDashboardCalendarModal(){
  const holder=$('[data-dashboard-calendar-modal]');
  if(holder)holder.innerHTML=dashboardCalendarMarkup();
}
function openDashboardCalendar(){
  openModal({title:'Selecionar um dia',subtitle:'Toque em um dia para ver os cheques daquela data. Toque de novo para voltar ao mês inteiro.',body:`<div data-dashboard-calendar-modal>${dashboardCalendarMarkup()}</div>`,size:'small'});
}
function dashboardRows(items,depositado=false){
  if(!items.length)return `<div class="empty dashboard-empty"><div class="orb">✓</div><b>Nenhum cheque nesta seleção</b><p>Escolha outro dia ou veja o mês inteiro.</p></div>`;
  return `<div class="dashboard-cheque-list">${items.map(x=>{const party=supplierById(x.fornecedorId)?.nome||x.pessoa||'—';return `<button class="dashboard-cheque-row" onclick="Borion.viewCheque('${x.id}')"><div><span>${esc(x.numero||'Sem número')}</span><small>${esc(party)}</small></div><div><b>${brl(x.valor)}</b><small>${fmtDate(chequeDashboardDate(x,depositado))}</small></div></button>`}).join('')}</div>`;
}
function dashboardCalendar(month,emitted,deposited){
  const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),offset=first.getDay();
  const counts=new Map();
  for(const x of emitted){const d=chequeDashboardDate(x,false);if(d?.startsWith(month))counts.set(d,(counts.get(d)||0)+1)}
  for(const x of deposited){const d=chequeDashboardDate(x,true);if(d?.startsWith(month))counts.set(d,(counts.get(d)||0)+1)}
  const cells=[];for(let i=0;i<offset;i++)cells.push('<span class="calendar-day empty-day"></span>');
  for(let day=1;day<=last.getDate();day++){
    const date=`${month}-${String(day).padStart(2,'0')}`,count=counts.get(date)||0;
    cells.push(`<button class="calendar-day ${App.dashboardDate===date?'selected':''} ${count?'has-items':''}" onclick="Borion.dashboardSelectDate('${date}')"><span>${day}</span>${count?`<b>${count}</b>`:''}</button>`);
  }
  return `<section class="panel dashboard-calendar"><div class="panel-head"><button class="calendar-nav" onclick="Borion.dashboardMonthMove(-1)" aria-label="Mês anterior">‹</button><div><div class="panel-title">${dashboardMonthLabel(month)}</div><p class="muted">Toque em um dia para ver quantos cheques caem nele.</p></div><button class="calendar-nav" onclick="Borion.dashboardMonthMove(1)" aria-label="Próximo mês">›</button></div><div class="calendar-week"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="calendar-grid">${cells.join('')}</div>${App.dashboardDate?`<button class="action-btn calendar-clear" onclick="Borion.dashboardSelectDate('${App.dashboardDate}')">Ver o mês inteiro</button>`:''}</section>`;
}

renderDashboard=function(){
  const root=$('#page-dashboard');if(!root)return;
  const all=active(App.state.cheques);
  const emittedAll=all.filter(x=>x.tipo==='Emitido');
  const depositedAll=all.filter(chequeDepositado);
  const dateMatch=(x,dep)=>{const d=chequeDashboardDate(x,dep);return App.dashboardDate?d===App.dashboardDate:String(d||'').startsWith(App.dashboardMonth)};
  const emitted=emittedAll.filter(x=>dateMatch(x,false)).sort((a,b)=>String(chequeDashboardDate(a,false)).localeCompare(String(chequeDashboardDate(b,false))));
  const deposited=depositedAll.filter(x=>dateMatch(x,true)).sort((a,b)=>String(chequeDashboardDate(a,true)).localeCompare(String(chequeDashboardDate(b,true))));
  const sum=arr=>arr.reduce((t,x)=>t+Number(x.valor||0),0);
  const selection=App.dashboardDate?fmtDate(App.dashboardDate):dashboardMonthLabel(App.dashboardMonth);
  root.innerHTML=`<div class="dashboard-clean-summary"><div><span>Período selecionado</span><b>${esc(selection)}</b></div><div><span>Cheques que caem</span><b>${emitted.length}</b><small>${brl(sum(emitted))}</small></div><div><span>Cheques depositados</span><b>${deposited.length}</b><small>${brl(sum(deposited))}</small></div></div>${dashboardCalendar(App.dashboardMonth,emittedAll,depositedAll)}<div class="dashboard-two-lists"><section class="panel"><div class="panel-head"><div><div class="panel-title">Cheques emitidos</div><p class="muted">${emitted.length} cheque(s) no período selecionado.</p></div></div><div class="panel-body">${dashboardRows(emitted,false)}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Cheques depositados</div><p class="muted">${deposited.length} cheque(s) no período selecionado.</p></div></div><div class="panel-body">${dashboardRows(deposited,true)}</div></section></div>`;
};

// No celular, as ações ficam dentro das abas corretas.
const renderChequesV111Base=renderCheques;
renderCheques=function(){
  renderChequesV111Base();
  if(!isMobileView())return;
  const root=$('#page-cheques');
  const tabs=$('.mobile-tabs',root);
  if(tabs&&!$('[data-mobile-cheque-actions]',root))tabs.insertAdjacentHTML('afterend','<div class="mobile-tab-actions" data-mobile-cheque-actions><button class="btn btn-outline" onclick="Borion.newLote()">Gerar lote</button><button class="btn btn-outline" onclick="Borion.organizePhotos()">Organizar fotos</button></div>');
};


// ---------- Versão 1.0.23: leitura binária correta, token estável e descoberta enxuta ----------
const V119_VERSION='1.0.23';
const V119_EXACT_DATA_NAMES=['current.json','BORION_CNPJ_CURRENT.json','dados.json','borion-cnpj-dados.json','current.json.borion'];
const V119_MAX_GLOBAL_READS=40;
const V119_MAX_FILE_BYTES=12*1024*1024;

function v119ToArrayBuffer(value){
  if(value instanceof ArrayBuffer)return value;
  if(ArrayBuffer.isView(value))return value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength);
  if(typeof value==='string')return new TextEncoder().encode(value).buffer;
  if(value&&typeof value==='object')return new TextEncoder().encode(JSON.stringify(value)).buffer;
  return new ArrayBuffer(0);
}
async function v119MapLimit(items,limit,task){
  const list=Array.from(items||[]),out=[];let index=0;
  const workers=Array.from({length:Math.max(1,Math.min(limit,list.length||1))},async()=>{
    while(index<list.length){const current=index++;try{const value=await task(list[current],current);if(value)out.push(value)}catch(e){console.warn('Item ignorado durante a leitura do Drive',e)}}
  });
  await Promise.all(workers);
  return out;
}

/* CORREÇÃO PRINCIPAL 1.0.23
   Drive.api devolvia res.json() sempre que o Content-Type era application/json.
   Como o current.json é gravado justamente com mimeType application/json, o alt=media
   voltava um OBJETO já convertido e o TextDecoder().decode(objeto) estourava TypeError.
   Todo leitor tratava isso como "arquivo inválido" e devolvia null: no celular virava
   "base não encontrada" e no computador virava falha na verificação após gravar.
   Agora o download é sempre binário puro. */
Drive.downloadFile=async function(fileId,retry=true){
  if(!fileId)throw new Error('Arquivo do Drive não informado.');
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  let res;
  try{res=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+App.drive.token}})}
  catch(e){throw new Error('Sem conexão com o Google Drive ao baixar o arquivo.')}
  if(res.status===401&&retry){
    if(await this.refreshTokenSafely())return this.downloadFile(fileId,false);
    throw new Error('A sessão do Google expirou neste aparelho. Entre novamente para sincronizar.');
  }
  if(!res.ok){const text=await res.text().catch(()=>'');throw new Error('Google Drive '+res.status+': '+String(text).slice(0,240))}
  return v119ToArrayBuffer(await res.arrayBuffer());
};
Drive.downloadText=async function(fileId){return new TextDecoder().decode(await this.downloadFile(fileId))};

/* Token: guarda o vencimento e renova antes de expirar, em vez de descobrir
   pelo 401 no meio da sincronização (no celular a renovação silenciosa costuma
   ser bloqueada porque não parte de um toque do usuário). */
const v119RequestTokenBase=Drive.requestToken.bind(Drive);
Drive.requestToken=async function(prompt=''){
  const resp=await v119RequestTokenBase(prompt);
  const life=Number(resp?.expires_in)||3600;
  App.drive.tokenExpiresAt=Date.now()+Math.max(60,life-300)*1000;
  return resp;
};
Drive.refreshTokenSafely=async function(){
  try{
    const fresh=await this.requestToken('');
    if(fresh?.access_token){App.drive.token=fresh.access_token;return true}
  }catch(e){console.warn('Renovação silenciosa do Google não foi permitida',e)}
  updateSyncUI('error','Reconecte o Google','Toque em atualizar ou entre novamente');
  return false;
};
Drive.ensureFreshToken=async function(){
  if(!App.drive.connected)return false;
  if(!App.drive.tokenExpiresAt||Date.now()<App.drive.tokenExpiresAt)return true;
  return this.refreshTokenSafely();
};
Drive.api=async function(url,opt={},retry=true){
  const method=String(opt.method||'GET').toUpperCase();
  const request={...opt,headers:{Authorization:'Bearer '+App.drive.token,...(opt.headers||{})}};
  if(method==='GET')request.cache='no-store';
  let res;
  try{res=await fetch(url,request)}
  catch(e){throw new Error('Sem conexão com o Google Drive. Verifique a internet do aparelho.')}
  if(res.status===401&&retry){
    if(await this.refreshTokenSafely())return this.api(url,opt,false);
    throw new Error('A sessão do Google expirou neste aparelho. Entre novamente para sincronizar.');
  }
  if(!res.ok){const text=await res.text().catch(()=>'');throw new Error('Google Drive '+res.status+': '+String(text).slice(0,300))}
  if(res.status===204)return null;
  const ct=res.headers.get('content-type')||'';
  return ct.includes('application/json')?res.json():res.arrayBuffer();
};

/* Pastas: cache por sessão e fila por nome. Antes, cada anexo refazia
   Cheques > ano > mês do zero (4 chamadas por foto) e duas chamadas simultâneas
   para o mesmo mês criavam duas pastas com o mesmo nome. */
Drive._folderCache=new Map();
Drive._folderLocks=new Map();
Drive.clearFolderCache=function(){this._folderCache.clear();this._folderLocks.clear()};
Drive.ensureFolder=function(parentId,name){
  const key=String(parentId||'root')+'/'+normalize(name);
  const cached=this._folderCache.get(key);
  if(cached)return Promise.resolve(cached);
  const running=this._folderLocks.get(key);
  if(running)return running;
  const task=(async()=>{
    const found=await this.findChild(parentId,name,V118_FOLDER_MIME);
    const folder=found||await this.createFolder(parentId,name);
    this._folderCache.set(key,folder);
    return folder;
  })().finally(()=>this._folderLocks.delete(key));
  this._folderLocks.set(key,task);
  return task;
};
Drive.monthFolder=async function(baseId,date){
  const parsed=new Date(String(date||todayISO()).slice(0,10)+'T12:00:00');
  const safe=isNaN(parsed.getTime())?new Date():parsed;
  const year=String(safe.getFullYear());
  const month=String(safe.getMonth()+1).padStart(2,'0')+' - '+MONTHS[safe.getMonth()];
  const yearFolder=await this.ensureFolder(baseId,year);
  return (await this.ensureFolder(yearFolder.id,month)).id;
};

/* Descoberta enxuta: a pasta preferida é testada primeiro e, quando ela já tem
   registros, a varredura global nem chega a rodar. A varredura antiga pedia
   "name contains current" no Drive inteiro (2 TB) e baixava até 600 arquivos:
   era o minuto e meio de espera do celular. */
Drive.readCandidatesFromFolderV118=async function(parentId,kind,path){
  if(!parentId)return [];
  const files=(await this.listChildren(parentId)).filter(file=>v118LooksLikeDataFile(file.name));
  return v119MapLimit(files,4,async file=>{
    const candidate=await this.readDataCandidateV118(file);
    return candidate?{...candidate,kind,path}:null;
  });
};
Drive.listLikelyDataFilesV118=async function(){
  const exact=V119_EXACT_DATA_NAMES.map(name=>`name='${this.q(name)}'`).join(' or ');
  const run=async q=>{
    const params=new URLSearchParams({spaces:'drive',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents)',q});
    const out=[];let pageToken='';
    do{
      if(pageToken)params.set('pageToken',pageToken);else params.delete('pageToken');
      const data=await this.api('https://www.googleapis.com/drive/v3/files?'+params.toString());
      out.push(...(data.files||[]));pageToken=data.nextPageToken||'';
    }while(pageToken&&out.length<200);
    return out.filter(file=>v118LooksLikeDataFile(file.name)&&Number(file.size||0)<=V119_MAX_FILE_BYTES);
  };
  let files=await run(`(${exact}) and trashed=false`);
  if(!files.length)files=await run(`name contains 'current' and trashed=false`);
  return files.slice(0,V119_MAX_GLOBAL_READS);
};
Drive.discoverOfficialV119=async function(forceScan=false){
  if(!forceScan&&this._v119Discovery&&Date.now()-Number(this._v119Discovery.at||0)<30000)return this._v119Discovery;
  const roots=new Map();
  const addRoot=meta=>{if(meta?.id&&!meta.trashed&&meta.mimeType===V118_FOLDER_MIME&&!roots.has(meta.id))roots.set(meta.id,meta)};
  const finish=(root,path,best,candidates)=>{
    const result={at:Date.now(),root:root||null,path:path||null,best:best||null,candidates:candidates||[],roots:Array.from(roots.values())};
    this._v119Discovery=result;this._v118Discovery=result;return result;
  };
  const withRecords=list=>(list||[]).find(item=>Number(item.recordCount||0)>0)||null;

  const preferredIds=Array.from(new Set([App.drive.rootId,localStorage.getItem(v115RootKey()),App.state.settings?.rootFolderId,V118_PREFERRED_ROOT_ID].filter(Boolean)));
  let fallback=null,fallbackRoot=null,pool=[];

  // 1) pastas já conhecidas por este aparelho ou pelo config.js
  for(const id of preferredIds){
    let meta=null;
    try{meta=await this.getMetadataV118(id)}catch(e){console.warn('Pasta preferida do Drive não pôde ser aberta',id,e);continue}
    if(!meta||meta.trashed||meta.mimeType!==V118_FOLDER_MIME)continue;
    addRoot(meta);
    let inspected=null;
    try{inspected=await this.inspectRootV118(meta)}catch(e){console.warn('Pasta preferida ignorada na inspeção',id,e);continue}
    pool=pool.concat(inspected.candidates||[]);
    const best=withRecords(inspected.candidates);
    if(best)return finish(meta,best.path,best,inspected.candidates);
    if(!fallback&&inspected.candidates?.length){fallback=inspected.candidates[0];fallbackRoot=meta}
    if(!fallbackRoot)fallbackRoot=meta;
  }

  // 2) qualquer pasta com o nome oficial na conta
  try{for(const folder of await this.listFoldersByNameV118(CFG.driveRootFolderName||'Borion CNPJ'))addRoot(folder)}
  catch(e){console.warn('Busca de pastas Borion CNPJ falhou',e)}
  for(const root of roots.values()){
    if(preferredIds.includes(root.id))continue;
    let inspected=null;
    try{inspected=await this.inspectRootV118(root)}catch(e){console.warn('Pasta Borion CNPJ ignorada na inspeção',root.id,e);continue}
    pool=pool.concat(inspected.candidates||[]);
    const best=withRecords(inspected.candidates);
    if(best)return finish(root,best.path,best,inspected.candidates);
    if(!fallback&&inspected.candidates?.length){fallback=inspected.candidates[0];fallbackRoot=root}
    if(!fallbackRoot)fallbackRoot=root;
  }

  // 3) último recurso: varredura limitada por nome exato de arquivo
  try{
    const files=await this.listLikelyDataFilesV118();
    const found=await v119MapLimit(files,4,async file=>{
      const candidate=await this.readDataCandidateV118(file);
      if(!candidate)return null;
      const path=await this.inferPathFromFileV118(file);
      if(!path?.rootId)return null;
      return {...candidate,kind:path.source||'discovered',path};
    });
    pool=pool.concat(found);
    const sorted=found.slice().sort(v118CompareCandidates);
    const best=withRecords(sorted)||sorted[0]||null;
    if(best?.path?.rootId){
      let root=roots.get(best.path.rootId)||null;
      if(!root)try{root=await this.getMetadataV118(best.path.rootId);addRoot(root)}catch{}
      if(root)return finish(root,best.path,best,pool);
    }
  }catch(e){console.warn('Varredura global de current.json falhou',e)}

  // Nada com registros: devolve o melhor vazio, sem criar pasta nenhuma.
  pool.sort(v118CompareCandidates);
  const root=fallbackRoot||Array.from(roots.values())[0]||null;
  const path=fallback?.path||(root?{rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:'',dataId:'',source:'empty-root'}:null);
  return finish(root,path,fallback,pool);
};
Drive.applyDiscoveryV119=async function(discovered){
  if(!discovered?.root)return '';
  App.drive.rootId=discovered.root.id;App.drive.lastRootScanAt=Date.now();
  App.drive.officialRevision=Number(discovered.best?.revision||0);
  App.drive._v118Path=discovered.path||null;App.drive._v118Current=discovered.best||null;
  App.state.settings.rootFolderId=discovered.root.id;
  App.state.settings.rootFolderName=discovered.root.name||CFG.driveRootFolderName||'Borion CNPJ';
  localStorage.setItem(v115RootKey(),discovered.root.id);
  await saveLocal('pasta-real-v119',false);
  return discovered.root.id;
};
Drive.resolveRootV119=async function(forceScan=false,allowCreate=false){
  let discovered=await this.discoverOfficialV119(forceScan);
  if(!discovered.root&&allowCreate){
    const created=await this.createFolder('',CFG.driveRootFolderName||'Borion CNPJ');
    const root={...created,mimeType:V118_FOLDER_MIME};
    discovered={...discovered,root,path:{rootId:root.id,rootName:root.name||'Borion CNPJ',systemId:'',dataId:'',source:'created'}};
    this._v119Discovery=discovered;this._v118Discovery=discovered;
    this.clearFolderCache();
  }
  return this.applyDiscoveryV119(discovered);
};
Drive.resolveRoot=function(forceScan=false){return this.resolveRootV119(forceScan,false)};

/* Leitura: a descoberta já traz o current.json lido, então o pull não refaz
   o caminho nem cria a estrutura de pastas. Só a gravação cria pasta. */
Drive._pullOnceV119=async function(showMessage=false,forceRootScan=false){
  updateSyncUI('busy','Carregando','Procurando a base no Google Drive');
  if(!await this.ensureFreshToken())throw new Error('A sessão do Google expirou neste aparelho. Entre novamente para sincronizar.');
  const discovered=await this.discoverOfficialV119(forceRootScan||!App.drive.rootId);
  await this.applyDiscoveryV119(discovered);
  const local=v116CloneState(App.state);
  const best=discovered.best;
  if(!best?.state){
    if(stateRecordCount(local)>0){
      v115SetPending(true);
      updateSyncUI('local','Dados deste aparelho',`${stateActiveChequeCount(local)} cheque(s) prontos para enviar ao Drive`);
      return {changed:false,needsPush:true,remote:null};
    }
    updateSyncUI('error','Base não encontrada','Nenhum current.json com registros foi localizado');
    throw new Error('Não foi encontrada uma base do Borion CNPJ com registros nesta conta Google. Confira se é a mesma conta usada no computador. Nada foi apagado.');
  }
  const remoteState=best.state;
  const localPending=v115Pending()&&stateRecordCount(local)>0;
  const next=localPending?this.mergeState(remoteState,local,'local'):v116CloneState(remoteState);
  next.settings.rootFolderId=App.drive.rootId;
  next.settings.rootFolderName=discovered.root?.name||CFG.driveRootFolderName||'Borion CNPJ';
  const changed=v116StateSignature(local)!==v116StateSignature(next);
  const needsPush=localPending&&v116StateSignature(next)!==v116StateSignature(remoteState);
  App.state=next;App.drive.officialRevision=Number(best.revision||0);
  await saveLocal('carregado-da-base-real-v119',false);renderAll();
  if(needsPush)v115SetPending(true);else{v115SetPending(false);v118ClearLegacyPending()}
  updateSyncUI('ok',needsPush?'Dados reunidos':'Sincronizado',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${best.revision||0}`);
  if(showMessage)toast(changed?`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`:'Este aparelho já está atualizado.','ok',4200);
  return {changed,needsPush,remote:{state:remoteState,current:best,revision:Number(best.revision||0)}};
};
Drive.pull=function(showMessage=false,forceRootScan=false){
  if(!App.drive.connected)return Promise.reject(new Error('Entre com o Google para atualizar.'));
  if(this._pullPromise)return this._pullPromise;
  this._pullPromise=this.runLocked('pull',()=>this._pullOnceV119(showMessage,forceRootScan)).finally(()=>{this._pullPromise=null});
  return this._pullPromise;
};
Drive._syncOnceV119=async function(){
  const dirtyAtStart=v115DirtySeq();
  updateSyncUI('busy','Salvando no Drive','Confirmando os registros');
  if(!await this.ensureFreshToken())throw new Error('A sessão do Google expirou neste aparelho. Entre novamente para salvar.');
  await this.resolveRootV119(!App.drive.rootId,true);
  if(!App.drive.rootId)throw new Error('Não foi possível abrir nem criar a pasta Borion CNPJ no Drive.');
  const structure=await this.ensureStructure();
  const remote=await this.loadRemoteBundle(structure);
  const local=v116CloneState(App.state);
  if(!remote.state&&stateRecordCount(local)===0)throw new Error('Não existe base no Drive e este aparelho não possui dados para enviar.');
  const merged=remote.state?this.mergeState(remote.state,local,'local'):local;
  const firstRevision=Math.max(Number(merged.meta?.revision||0),Number(remote.revision||0),Number(App.drive.officialRevision||0))+1;
  const firstState=v118PrepareState(merged,firstRevision);
  firstState.meta.version=V119_VERSION;
  const firstSaved=await this.writeCanonicalV118(structure,firstState,remote.current);
  if(v115DirtySeq()===dirtyAtStart)App.state=firstState;else App.state=this.mergeState(firstState,App.state,'local');
  await saveLocal('registros-confirmados-v119',false);renderAll();
  updateSyncUI('busy','Salvando fotos','Conferindo anexos já existentes');
  const attachmentResult=await this.syncAttachments(structure);
  const attachmentChanged=attachmentResult.uploaded>0||attachmentResult.reused>0||v116StateSignature(App.state)!==v116StateSignature(firstState);
  if(attachmentChanged){
    const secondState=v118PrepareState(App.state,firstRevision+1);
    secondState.meta.version=V119_VERSION;
    const dirtyBeforeSecond=v115DirtySeq();
    await this.writeCanonicalV118(structure,secondState,{...remote.current,nestedFile:firstSaved.nestedSaved,mirrorFile:firstSaved.mirrorSaved});
    if(v115DirtySeq()===dirtyBeforeSecond)App.state=secondState;else App.state=this.mergeState(secondState,App.state,'local');
    await saveLocal('fotos-confirmadas-v119',false);renderAll();
  }
  const clean=v115DirtySeq()===dirtyAtStart,pendingPhotos=v116PendingAttachmentCount(App.state);
  if(clean&&pendingPhotos===0){v115SetPending(false);v118ClearLegacyPending()}else v115SetPending(true);
  if(pendingPhotos)updateSyncUI('local','Dados salvos no Drive',`${stateActiveChequeCount(App.state)} cheque(s) · ${pendingPhotos} foto(s) pendente(s)`);
  else if(clean)updateSyncUI('ok','Salvo no Google Drive',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision||0}`);
  else updateSyncUI('local','Alteração local pendente','Toque em atualizar para confirmar a última mudança');
  this._v119Discovery=null;this._v118Discovery=null;
  return {clean,pendingPhotos,attachmentResult};
};
Drive.sync=function(){
  if(!App.drive.connected)return Promise.resolve(false);
  this._syncRequested=true;
  if(this._syncPromise)return this._syncPromise;
  this._syncPromise=this.runLocked('sync',async()=>{
    let result=null;
    for(let pass=0;pass<2;pass++){this._syncRequested=false;result=await this._syncOnceV119();if(!this._syncRequested&&result.clean)break}
    return result;
  }).catch(e=>{v115SetPending(true);updateSyncUI('error','Não salvo no Drive',String(e.message||e).slice(0,150));throw e})
    .finally(()=>{this._syncPromise=null;this._syncRequested=false});
  return this._syncPromise;
};
Drive.refreshNow=async function(showMessage=true){
  const pulled=await this.pull(false,true);
  if(pulled.needsPush||v115Pending())await this.sync();
  if(showMessage)toast(`${stateActiveChequeCount(App.state)} cheque(s) confirmados no Google Drive.`,v115Pending()?'local':'ok',4200);
  return true;
};
Drive.login=async function(){
  const clientId=this.clientId();
  if(!clientId)throw new Error('Google OAuth não configurado.');
  const resp=await this.requestToken('select_account');
  showAccountLoading(true,'CARREGANDO . . .');
  try{
    App.drive.token=resp.access_token;
    const info=await this.api('https://www.googleapis.com/oauth2/v3/userinfo');
    const allowed=(CFG.authorizedEmails||[]).map(x=>x.toLowerCase());
    if(allowed.length&&!allowed.includes(String(info.email).toLowerCase()))throw new Error('Esta conta não está autorizada.');
    let previous='';try{previous=JSON.parse(localStorage.getItem('borion_cnpj_last_user')||'{}').email||''}catch{}
    App.user={name:info.name||info.email,email:info.email,picture:info.picture||''};
    App.localMode=false;App.drive.connected=true;App.drive.rootId='';App.drive.lastRootScanAt=0;
    App.drive._v118Path=null;App.drive._v118Current=null;this._v118Discovery=null;this._v119Discovery=null;
    this.clearFolderCache();
    loadAccountLocalState(info.email,previous);
    await v116RecoverLocalStateIfNeeded();
    localStorage.setItem('borion_cnpj_last_user',JSON.stringify(App.user));
    const pulled=await this.pull(false,true);
    if(pulled.needsPush)await this.sync();
    showAccountLoading(false);showApp();startDriveRefreshLoop();
    toast(`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`,'ok',4200);
  }catch(e){
    showAccountLoading(false);
    if(App.user&&stateRecordCount(App.state)>0){showApp();updateSyncUI('error','Falha ao abrir o Drive','Dados locais preservados');startDriveRefreshLoop()}
    else showGate();
    throw e;
  }
};

/* A tela CARREGANDO nunca mais fica presa: se algo travar, o aplicativo volta
   para a tela de entrada com a mensagem em vez de girar para sempre. */
const v119ShowAccountLoadingBase=showAccountLoading;
let v119LoadingGuard=0;
showAccountLoading=function(show=true,detail='CARREGANDO . . .'){
  clearTimeout(v119LoadingGuard);
  if(show)v119LoadingGuard=setTimeout(()=>{
    v119ShowAccountLoadingBase(false);
    if(App.user&&stateRecordCount(App.state)>0)showApp();else showGate();
    toast('O Google Drive demorou demais para responder. Tente entrar novamente.','error',6000);
  },75000);
  return v119ShowAccountLoadingBase(show,detail);
};

// Delegação e API pública
window.Borion={
  go:setPage,chequeTab:v=>{App.chequeTab=v;renderCheques()},boletoTab:v=>{App.boletoTab=v;renderBoletos()},
  newFornecedor:()=>openFornecedor(),editFornecedor:openFornecedor,viewFornecedor,
  newCheque:()=>openCheque(),editCheque:openCheque,viewCheque:id=>{const x=active(App.state.cheques).find(r=>r.id===id);if(x)showViewer(x,'Cheque')},newLote:openLote,
  newBoleto:()=>openBoleto(),editBoleto:openBoleto,viewBoleto:id=>{const x=active(App.state.boletos).find(r=>r.id===id);if(x)showViewer(x,'Boleto')},focusBarcode,
  organizePhotos:()=>Organizer.open(),exportBackup,importBackup,exportChequesImport,importChequesFile,selectImportFiles,previewImportFiles,installPwa,newChequeAccount:()=>openChequeAccount(),editChequeAccount:openChequeAccount,saveDriveConfig,prepareDrive,reconnectGoogle,refreshFromDrive:()=>Drive.pull(true,true),driveBackup:()=>Drive.manualBackup(),
  dashboardMonthMove,dashboardSelectDate,openDashboardCalendar
};


// ---------- Versão 1.0.23: ordenação por coluna, visão geral enxuta e menu reorganizado ----------
const V120_COLLATOR=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
App.sort=App.sort||{cheques:{key:'',dir:0},fornecedor:{key:'',dir:0}};

function v120CycleSort(scope,key,kind){
  const state=App.sort[scope]||(App.sort[scope]={key:'',dir:0});
  if(state.key!==key){state.key=key;state.dir=kind==='text'?1:-1;}
  else if(state.dir===(kind==='text'?1:-1))state.dir=kind==='text'?-1:1;
  else {state.key='';state.dir=0;}
  return state;
}
function v120SortArrow(scope,key){
  const state=App.sort[scope]||{};
  if(state.key!==key)return '<i class="sort-arrow">⇅</i>';
  return `<i class="sort-arrow active">${state.dir===1?'▲':'▼'}</i>`;
}
function v120Head(scope,key,label,kind='text'){
  const state=App.sort[scope]||{};
  return `<th class="${state.key===key?'sorted':''}"><span class="sort-head" data-sort-key="${key}" data-sort-kind="${kind}" role="button" tabindex="0">${esc(label)}${v120SortArrow(scope,key)}</span></th>`;
}
function v120PlainHead(label){return `<th>${esc(label)}</th>`}
function v120ApplySort(scope,items,accessors,fallback){
  const state=App.sort[scope]||{};
  if(!state.key||!state.dir||!accessors[state.key])return items.slice().sort(fallback);
  const {get,kind}=accessors[state.key];
  return items.slice().sort((a,b)=>{
    const va=get(a),vb=get(b);
    let cmp;
    if(kind==='number')cmp=(Number(va)||0)-(Number(vb)||0);
    else if(kind==='date')cmp=String(va||'').localeCompare(String(vb||''));
    else cmp=V120_COLLATOR.compare(String(va??''),String(vb??''));
    return cmp*state.dir;
  });
}
function v120WireSort(root,scope,rerender){
  $$('.sort-head',root).forEach(el=>{
    const fire=()=>{v120CycleSort(scope,el.dataset.sortKey,el.dataset.sortKind||'text');rerender()};
    el.onclick=fire;
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fire()}};
  });
}

/* ----- Cheques: cabeçalhos clicáveis e mês corrente por padrão ----- */
const V120_CHEQUE_SORT={
  tipo:{kind:'text',get:x=>x.tipo||''},
  numero:{kind:'text',get:x=>x.numero||''},
  parte:{kind:'text',get:x=>supplierById(x.fornecedorId)?.nome||x.pessoa||''},
  conta:{kind:'text',get:x=>accountLabelForCheque(x)||''},
  valor:{kind:'number',get:x=>Number(x.valor||0)},
  emissao:{kind:'date',get:x=>x.dataEmissao||''},
  bomPara:{kind:'date',get:x=>x.dataBom||''},
  status:{kind:'text',get:x=>x.status||''},
  imagem:{kind:'number',get:x=>(x.attachments||[]).length}
};
const v120ChequeFallback=(a,b)=>String(b.dataEmissao||b.createdAt).localeCompare(String(a.dataEmissao||a.createdAt));
function v120ChequeMonths(){
  return [...new Set(active(App.state.cheques).map(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)).filter(Boolean))].sort().reverse();
}
function v120MonthOptions(selected){
  const months=v120ChequeMonths(),current=todayISO().slice(0,7);
  if(!months.includes(current))months.unshift(current);
  return `<option value="">Todos os meses</option>${months.map(m=>`<option value="${m}" ${selected===m?'selected':''}>${m.split('-').reverse().join('/')}</option>`).join('')}`;
}
function v120FilterCheques(){
  let items=active(App.state.cheques).filter(x=>chequeMatches(x,App.search.cheques));
  if(App.chequeTab==='emitidos')items=items.filter(x=>x.tipo==='Emitido');
  if(App.chequeTab==='recebidos')items=items.filter(x=>x.tipo==='Recebido');
  if(App.chequeTab==='abertos')items=items.filter(x=>!['Compensado','Cancelado'].includes(x.status));
  if(App.filters.chequeSupplier)items=items.filter(x=>x.fornecedorId===App.filters.chequeSupplier);
  if(App.filters.chequeStatus)items=items.filter(x=>x.status===App.filters.chequeStatus);
  if(App.filters.chequeMonth)items=items.filter(x=>String(x.dataEmissao||x.dataBom||'').slice(0,7)===App.filters.chequeMonth);
  return v120ApplySort('cheques',items,V120_CHEQUE_SORT,v120ChequeFallback);
}
function v120ChequeToolbar(){
  return `<div class="page-toolbar"><div class="toolbar-left"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar número, fornecedor, conta..." data-search-cheques></div><select class="filter-select" data-filter-ch-supplier>${optionsForSuppliers(App.filters.chequeSupplier)}</select><select class="filter-select" data-filter-ch-status><option value="">Todos os status</option>${['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'].map(s=>`<option ${App.filters.chequeStatus===s?'selected':''}>${s}</option>`).join('')}</select><select class="filter-select" data-filter-ch-month>${v120MonthOptions(App.filters.chequeMonth)}</select></div><div class="toolbar-right"><button class="btn btn-outline" onclick="Borion.organizePhotos()">Fotos em massa</button><button class="btn btn-outline" onclick="Borion.newLote()">Cheques em lote</button><button class="btn btn-primary" onclick="Borion.newCheque()">＋ Novo cheque</button></div></div>`;
}
function v120ChequeTabs(){
  return `<div class="tabs tabs-inline">${[['todos','Todos'],['emitidos','Emitidos'],['recebidos','Recebidos'],['abertos','Em aberto']].map(([v,l])=>`<button class="tab ${App.chequeTab===v?'active':''}" onclick="Borion.chequeTab('${v}')">${l}</button>`).join('')}</div>`;
}
function v120WireChequeFilters(root){
  $('[data-search-cheques]',root).oninput=e=>{App.search.cheques=e.target.value;renderCheques()};
  $('[data-filter-ch-supplier]',root)&&($('[data-filter-ch-supplier]',root).onchange=e=>{App.filters.chequeSupplier=e.target.value;renderCheques()});
  $('[data-filter-ch-status]',root)&&($('[data-filter-ch-status]',root).onchange=e=>{App.filters.chequeStatus=e.target.value;renderCheques()});
  $('[data-filter-ch-month]',root)&&($('[data-filter-ch-month]',root).onchange=e=>{App.filters.chequeMonth=e.target.value;renderCheques()});
}
renderCheques=function(){
  const root=$('#page-cheques');if(!root)return;
  const items=v120FilterCheques();
  const total=items.reduce((s,x)=>s+Number(x.valor||0),0);
  if(isMobileView()){
    root.innerHTML=`<div class="mobile-list-head"><div class="search-box"><input value="${esc(App.search.cheques)}" placeholder="Buscar cheque ou fornecedor" data-search-cheques></div><button class="mobile-add" onclick="Borion.newCheque()">＋</button></div><div class="mobile-filter-row"><select class="filter-select" data-filter-ch-month>${v120MonthOptions(App.filters.chequeMonth)}</select><select class="filter-select" data-filter-ch-status><option value="">Todos os status</option>${['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'].map(s=>`<option ${App.filters.chequeStatus===s?'selected':''}>${s}</option>`).join('')}</select></div>${v120ChequeTabs().replace('tabs tabs-inline','tabs mobile-tabs')}<div class="mobile-total-strip"><span>${items.length} cheque(s)</span><b>${brl(total)}</b></div><div class="mobile-record-list">${items.length?items.map(x=>{const party=supplierById(x.fornecedorId)?.nome||x.pessoa||'—';return`<button class="mobile-record-card" onclick="Borion.viewCheque('${x.id}')"><div class="mobile-record-top"><div><span class="eyebrow">${esc(x.tipo)} · ${esc(accountLabelForCheque(x))}</span><h3>${esc(x.numero||'Sem número')}</h3></div><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></div><div class="mobile-record-party">${esc(party)}</div><div class="mobile-record-bottom"><div><span>Bom para</span><b>${fmtDate(x.dataBom)}</b></div><div class="mobile-record-value">${brl(x.valor)}</div></div>${(x.attachments||[]).length?`<div class="mobile-file-count">▣ ${x.attachments.length} arquivo(s)</div>`:''}</button>`}).join(''):'<div class="empty"><b>Nenhum cheque encontrado</b></div>'}</div>`;
    v120WireChequeFilters(root);
    const tabs=$('.mobile-tabs',root);
    if(tabs&&!$('[data-mobile-cheque-actions]',root))tabs.insertAdjacentHTML('afterend','<div class="mobile-tab-actions" data-mobile-cheque-actions><button class="btn btn-outline" onclick="Borion.newLote()">Gerar lote</button><button class="btn btn-outline" onclick="Borion.organizePhotos()">Organizar fotos</button></div>');
    return;
  }
  const head=`<tr>${v120Head('cheques','tipo','Tipo')}${v120Head('cheques','numero','Número')}${v120Head('cheques','parte','Entregue por / para')}${v120Head('cheques','conta','Conta')}${v120Head('cheques','valor','Valor','number')}${v120Head('cheques','emissao','Emissão','date')}${v120Head('cheques','bomPara','Bom para','date')}${v120Head('cheques','status','Status')}${v120Head('cheques','imagem','Imagem','number')}${v120PlainHead('Ações')}</tr>`;
  root.innerHTML=`${v120ChequeToolbar()}${v120ChequeTabs()}${items.length?`<div class="table-wrap"><table class="sortable-table"><thead>${head}</thead><tbody>${items.map(x=>{const sup=supplierById(x.fornecedorId);return`<tr><td><span class="badge ${x.tipo==='Recebido'?'received':'open'}">${esc(x.tipo)}</span></td><td><b>${esc(x.numero||'—')}</b>${x.lote?`<div class="muted">${esc(x.lote)}</div>`:''}</td><td>${esc(sup?.nome||x.pessoa||'—')}</td><td>${esc(accountLabelForCheque(x))}</td><td class="money">${brl(x.valor)}</td><td>${fmtDate(x.dataEmissao)}</td><td class="${daysUntil(x.dataBom)<0&&!['Compensado','Cancelado'].includes(x.status)?'danger-text':''}">${fmtDate(x.dataBom)}</td><td><span class="badge ${statusClass(x.status)}">${esc(x.status)}</span></td><td>${(x.attachments||[]).length?`<button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Visualizar (${x.attachments.length})</button>`:'<span class="muted">Sem foto</span>'}</td><td><div class="actions"><button class="action-btn" onclick="Borion.viewCheque('${x.id}')">Abrir</button><button class="action-btn" onclick="Borion.editCheque('${x.id}')">Editar</button></div></td></tr>`}).join('')}</tbody><tfoot><tr><td colspan="4">${items.length} cheque(s) no filtro atual</td><td class="money">${brl(total)}</td><td colspan="5"></td></tr></tfoot></table></div>`:'<div class="panel"><div class="empty"><b>Nenhum cheque encontrado</b></div></div>'}`;
  v120WireChequeFilters(root);
  v120WireSort(root,'cheques',renderCheques);
};

/* ----- Visão geral: sem calendário gigante, com totais do mês e da semana ----- */
App.dashboardDates=Array.isArray(App.dashboardDates)?App.dashboardDates:[];
function v120WeekRange(base=new Date()){
  const d=new Date(base.getFullYear(),base.getMonth(),base.getDate());
  const start=new Date(d);start.setDate(d.getDate()-d.getDay());
  const end=new Date(start);end.setDate(start.getDate()+6);
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  return {start:iso(start),end:iso(end)};
}
dashboardSelectDate=function(date){
  const list=App.dashboardDates;
  const index=list.indexOf(date);
  if(index>=0)list.splice(index,1);else list.push(date);
  list.sort();
  App.dashboardDate=list.length===1?list[0]:'';
  renderDashboard();refreshDashboardCalendarModal();
  $('#btn-dashboard-calendar')?.classList.toggle('has-date',list.length>0);
};
function v120ClearDashboardDates(){
  App.dashboardDates.length=0;App.dashboardDate='';
  renderDashboard();refreshDashboardCalendarModal();
  $('#btn-dashboard-calendar')?.classList.remove('has-date');
}
dashboardCalendar=function(month,emitted,deposited){
  const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),offset=first.getDay();
  const counts=new Map();
  for(const x of emitted){const d=chequeDashboardDate(x,false);if(d?.startsWith(month))counts.set(d,(counts.get(d)||0)+1)}
  for(const x of deposited){const d=chequeDashboardDate(x,true);if(d?.startsWith(month))counts.set(d,(counts.get(d)||0)+1)}
  const cells=[];for(let i=0;i<offset;i++)cells.push('<span class="calendar-day empty-day"></span>');
  for(let day=1;day<=last.getDate();day++){
    const date=`${month}-${String(day).padStart(2,'0')}`,count=counts.get(date)||0;
    cells.push(`<button class="calendar-day ${App.dashboardDates.includes(date)?'selected':''} ${count?'has-items':''}" onclick="Borion.dashboardSelectDate('${date}')"><span>${day}</span>${count?`<b>${count}</b>`:''}</button>`);
  }
  return `<section class="panel dashboard-calendar"><div class="panel-head"><button class="calendar-nav" onclick="Borion.dashboardMonthMove(-1)" aria-label="Mês anterior">‹</button><div><div class="panel-title">${dashboardMonthLabel(month)}</div><p class="muted">Toque nos dias que quiser somar. Toque de novo para tirar.</p></div><button class="calendar-nav" onclick="Borion.dashboardMonthMove(1)" aria-label="Próximo mês">›</button></div><div class="calendar-week"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="calendar-grid">${cells.join('')}</div>${App.dashboardDates.length?`<button class="action-btn calendar-clear" onclick="Borion.clearDashboardDates()">Ver o mês inteiro</button>`:''}</section>`;
};
dashboardMonthMove=function(delta){
  const [y,m]=App.dashboardMonth.split('-').map(Number);const d=new Date(y,m-1+delta,1);
  App.dashboardMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  App.dashboardDates.length=0;App.dashboardDate='';
  renderDashboard();refreshDashboardCalendarModal();
};
openDashboardCalendar=function(){
  openModal({title:'Selecionar dias',subtitle:'Toque em um ou vários dias para somar. Use “Ver o mês inteiro” para limpar.',body:`<div data-dashboard-calendar-modal>${dashboardCalendarMarkup()}</div>`,size:'small'});
};
renderDashboard=function(){
  const root=$('#page-dashboard');if(!root)return;
  const all=active(App.state.cheques);
  const emittedAll=all.filter(x=>x.tipo==='Emitido');
  const depositedAll=all.filter(chequeDepositado);
  const picked=App.dashboardDates;
  const dateMatch=(x,dep)=>{const d=chequeDashboardDate(x,dep);return picked.length?picked.includes(d):String(d||'').startsWith(App.dashboardMonth)};
  const emitted=emittedAll.filter(x=>dateMatch(x,false)).sort((a,b)=>String(chequeDashboardDate(a,false)).localeCompare(String(chequeDashboardDate(b,false))));
  const deposited=depositedAll.filter(x=>dateMatch(x,true)).sort((a,b)=>String(chequeDashboardDate(a,true)).localeCompare(String(chequeDashboardDate(b,true))));
  const sum=arr=>arr.reduce((t,x)=>t+Number(x.valor||0),0);
  const monthCheques=emittedAll.filter(x=>String(chequeDashboardDate(x,false)||'').startsWith(App.dashboardMonth));
  const week=v120WeekRange();
  const weekCheques=emittedAll.filter(x=>{const d=chequeDashboardDate(x,false);return d&&d>=week.start&&d<=week.end});
  const selection=picked.length?(picked.length===1?fmtDate(picked[0]):`${picked.length} dias selecionados`):dashboardMonthLabel(App.dashboardMonth);
  root.innerHTML=`<div class="dashboard-totals">
    <div class="total-card"><span>Cheques que caem no mês</span><b>${brl(sum(monthCheques))}</b><small>${monthCheques.length} cheque(s) · ${esc(dashboardMonthLabel(App.dashboardMonth))}</small></div>
    <div class="total-card week"><span>Cheques da semana</span><b>${brl(sum(weekCheques))}</b><small>${weekCheques.length} cheque(s) · ${fmtDate(week.start)} a ${fmtDate(week.end)}</small></div>
    <div class="total-card"><span>Depositados no mês</span><b>${brl(sum(depositedAll.filter(x=>String(chequeDashboardDate(x,true)||'').startsWith(App.dashboardMonth))))}</b><small>${depositedAll.filter(x=>String(chequeDashboardDate(x,true)||'').startsWith(App.dashboardMonth)).length} cheque(s)</small></div>
  </div>
  <div class="dashboard-clean-summary"><div><span>Seleção atual</span><b>${esc(selection)}</b>${picked.length?'<button class="action-btn" onclick="Borion.clearDashboardDates()">Ver o mês inteiro</button>':''}</div><div><span>Cheques que caem</span><b>${emitted.length}</b><small>${brl(sum(emitted))}</small></div><div><span>Cheques depositados</span><b>${deposited.length}</b><small>${brl(sum(deposited))}</small></div></div>
  <div class="dashboard-two-lists"><section class="panel"><div class="panel-head"><div><div class="panel-title">Cheques emitidos</div><p class="muted">${emitted.length} cheque(s) · ${brl(sum(emitted))}</p></div></div><div class="panel-body">${dashboardRows(emitted,false)}</div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Cheques depositados</div><p class="muted">${deposited.length} cheque(s) · ${brl(sum(deposited))}</p></div></div><div class="panel-body">${dashboardRows(deposited,true)}</div></section></div>`;
};

/* ----- Fornecedores: histórico ordenável ----- */
const V120_FORNECEDOR_SORT={
  tipo:{kind:'text',get:r=>r._type||''},
  numero:{kind:'text',get:r=>r.numero||r.documento||''},
  data:{kind:'date',get:r=>r._date||''},
  valor:{kind:'number',get:r=>Number(r.valor||0)},
  status:{kind:'text',get:r=>r.status||''}
};
viewFornecedor=function(id){
  const x=supplierById(id);if(!x)return;
  const cheques=active(App.state.cheques).filter(c=>c.fornecedorId===id),boletos=active(App.state.boletos).filter(b=>b.fornecedorId===id);
  const base=[...cheques.map(r=>({...r,_type:'Cheque',_date:r.dataBom})),...boletos.map(r=>({...r,_type:'Boleto',_date:r.vencimento}))];
  const sum=a=>a.reduce((s,r)=>s+Number(r.valor||0),0);
  const openCh=cheques.filter(r=>!['Compensado','Cancelado'].includes(r.status)),doneCh=cheques.filter(r=>r.status==='Compensado'),returned=cheques.filter(r=>r.status==='Devolvido'),openBo=boletos.filter(r=>!['Pago','Cancelado'].includes(r.status));
  App.sort.fornecedor={key:'',dir:0};
  const tableHtml=()=>{
    const rows=v120ApplySort('fornecedor',base,V120_FORNECEDOR_SORT,(a,b)=>String(b._date).localeCompare(String(a._date)));
    if(!rows.length)return '<div class="empty"><b>Sem movimentações</b></div>';
    return `<div class="table-wrap"><table class="sortable-table"><thead><tr>${v120Head('fornecedor','tipo','Tipo')}${v120Head('fornecedor','numero','Número/documento')}${v120Head('fornecedor','data','Data','date')}${v120Head('fornecedor','valor','Valor','number')}${v120Head('fornecedor','status','Status')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r._type}</td><td>${esc(r.numero||r.documento||'—')}</td><td>${fmtDate(r._date)}</td><td class="money">${brl(r.valor)}</td><td><span class="badge ${statusClass(r.status)}">${esc(r.status)}</span></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">${rows.length} movimentação(ões)</td><td class="money">${brl(sum(rows))}</td><td></td></tr></tfoot></table></div>`;
  };
  const body=`<div class="mini-kpis"><div><span>Total movimentado</span><b>${brl(sum(base))}</b></div><div><span>Em aberto</span><b>${brl(sum([...openCh,...openBo]))}</b></div><div><span>Compensado/pago</span><b>${brl(sum([...doneCh,...boletos.filter(r=>r.status==='Pago')]))}</b></div><div><span>Devolvidos</span><b>${returned.length}</b></div></div><div class="detail-box"><h4>Dados</h4>${[['Razão social / nome',x.nome],['Nome fantasia',x.fantasia],['CPF/CNPJ',x.cpfCnpj],['Telefone',x.telefone||x.whatsapp],['E-mail',x.email],['Endereço',[x.endereco,x.cidade,x.uf].filter(Boolean).join(' · ')]].map(([a,b])=>`<div class="detail-row"><span>${a}</span><b>${esc(b||'—')}</b></div>`).join('')}</div><div style="height:12px"></div><div data-fornecedor-historico>${tableHtml()}</div>`;
  const modal=openModal({title:x.nome,subtitle:`${base.length} movimentação(ões) vinculada(s)`,body,size:'large'});
  const rewire=()=>{const holder=$('[data-fornecedor-historico]',modal);if(!holder)return;holder.innerHTML=tableHtml();v120WireSort(holder,'fornecedor',rewire)};
  v120WireSort(modal,'fornecedor',rewire);
};

/* ----- Visualizador: várias fotos lado a lado ----- */
showViewer=async function(record,type){
  const atts=record.attachments||[];
  const party=supplierById(record.fornecedorId)?.nome||record.pessoa||record.beneficiario||'—';
  const history=App.state.audit.filter(a=>a.entityId===record.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const multi=atts.length>1;
  const viewerHtml=multi
    ? `<div class="document-viewer-multi" data-doc-multi>${atts.map((a,i)=>`<figure class="doc-tile" data-doc-tile="${i}"><div class="doc-tile-body"><div class="muted">Carregando…</div></div><figcaption>${esc(a.role||'documento')}</figcaption></figure>`).join('')}</div>`
    : `<div class="document-viewer" data-doc-viewer>${atts.length?'<div class="muted">Carregando documento...</div>':'<div class="empty"><div class="orb">▣</div><b>Sem documento anexado</b></div>'}</div>`;
  const details=[['Número / documento',record.numero||record.documento],['Fornecedor / pessoa',party],['Valor',brl(record.valor)],['Emissão',fmtDate(record.dataEmissao||record.dataCadastro)],['Bom para / vencimento',fmtDate(record.dataBom||record.vencimento)],['Status',record.status],['Conta',type==='Cheque'?accountLabelForCheque(record):record.banco],['Lote',record.lote]].filter(r=>r[1]&&r[1]!=='—');
  const body=`<div class="viewer-layout ${multi?'viewer-multi':''}"><div>${viewerHtml}</div><div class="viewer-side"><div class="detail-box"><h4>${esc(type)}</h4>${details.map(([a,b])=>`<div class="detail-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><div class="detail-box"><h4>Documentos</h4>${atts.length?atts.map((a,i)=>`<div class="detail-row"><span>${esc(a.role||'documento')}</span><b><button class="action-btn" data-open-att="${i}">${esc(a.name)}</button></b></div>`).join(''):'<div class="muted">Nenhum anexo.</div>'}</div><div class="detail-box timeline"><h4>Histórico</h4>${history.length?history.map(a=>`<div class="timeline-item"><b>${esc(a.action)}</b><span>${esc(a.detail||'')}</span><small>${fmtDateTime(a.createdAt)} · ${esc(a.user||'')}</small></div>`).join(''):'<div class="muted">Sem alterações registradas.</div>'}</div><button class="btn btn-outline" data-edit-record>Editar registro</button><button class="btn btn-outline" data-download-current ${atts.length?'':'disabled'}>Baixar documento aberto</button></div></div>`;
  const modal=openModal({title:type==='Cheque'?`Cheque ${record.numero||''}`:(record.documento||record.beneficiario||'Boleto'),subtitle:multi?`${atts.length} documentos lado a lado.`:'Documento e histórico dentro do Borion.',body,size:'large'});
  let current=0;const urls=[];
  const revokeAll=()=>{urls.forEach(u=>{try{URL.revokeObjectURL(u)}catch{}});urls.length=0};
  const fillTile=async(index)=>{
    const tile=$(`[data-doc-tile="${index}"] .doc-tile-body`,modal);if(!tile)return;
    try{
      const blob=await attachmentBlob(atts[index]);const url=URL.createObjectURL(blob);urls.push(url);
      tile.innerHTML=blob.type==='application/pdf'?`<iframe src="${url}" title="PDF"></iframe>`:`<img src="${url}" alt="${esc(atts[index].name)}" data-zoom="${index}">`;
      const img=$('[data-zoom]',tile);if(img)img.onclick=()=>{current=index;window.open(url,'_blank')};
    }catch(e){tile.innerHTML=`<div class="empty"><b>Não foi possível abrir</b><p>${esc(e.message)}</p></div>`}
  };
  const openSingle=async index=>{
    current=index;const att=atts[index];if(!att)return;
    const viewer=$('[data-doc-viewer]',modal);if(!viewer)return;
    viewer.innerHTML='<div class="muted">Abrindo documento...</div>';
    try{
      const blob=await attachmentBlob(att);revokeAll();const url=URL.createObjectURL(blob);urls.push(url);
      viewer.innerHTML=blob.type==='application/pdf'?`<iframe src="${url}" title="PDF"></iframe>`:`<img src="${url}" alt="${esc(att.name)}">`;
    }catch(e){viewer.innerHTML=`<div class="empty"><b>Não foi possível abrir</b><p>${esc(e.message)}</p></div>`}
  };
  $$('[data-open-att]',modal).forEach(b=>b.onclick=()=>{const i=Number(b.dataset.openAtt);if(multi){current=i;$(`[data-doc-tile="${i}"]`,modal)?.scrollIntoView({behavior:'smooth',block:'nearest'})}else openSingle(i)});
  $('[data-edit-record]',modal).onclick=()=>{revokeAll();closeModal();type==='Cheque'?openCheque(record.id):openBoleto(record.id)};
  $('[data-download-current]',modal)?.addEventListener('click',async()=>{const att=atts[current];if(!att)return;downloadBlob(await attachmentBlob(att),att.name)});
  if(multi){for(let i=0;i<atts.length;i++)await fillTile(i)}
  else if(atts.length)openSingle(0);
};

/* ----- Gravação: a tela muda na hora, o Drive vai atrás ----- */
scheduleSave=function(sync=true){
  clearTimeout(App.saveTimer);
  renderAll();
  App.saveTimer=setTimeout(async()=>{
    try{await saveLocal('alteracao-local-v120')}catch(e){console.warn(e)}
    if(sync&&App.state.settings.autoSync!==false&&App.drive.connected)scheduleSync();
  },60);
};
Drive.forceSave=async function(){
  if(!App.drive.connected){toast('Entre com o Google para salvar no Drive.','error',5000);return false}
  v115MarkDirty();
  try{
    await saveLocal('forcar-salvamento-v120',false);
    this._v119Discovery=null;this._v118Discovery=null;this.clearFolderCache();
    await this.sync();
    const pendentes=v116PendingAttachmentCount(App.state);
    toast(pendentes?`Dados salvos. Ainda faltam ${pendentes} foto(s) — toque de novo em alguns segundos.`:`Tudo salvo no Google Drive · ${stateActiveChequeCount(App.state)} cheque(s) · revisão ${App.state.meta.revision||0}.`,pendentes?'local':'ok',6000);
    renderConfig();
    return true;
  }catch(e){toast('Não foi possível forçar o salvamento: '+(e.message||e),'error',7000);throw e}
};

/* ----- Configurações concentra backup e importação ----- */
const v120RenderConfigBase=renderConfig;
renderConfig=function(){
  v120RenderConfigBase();
  const root=$('#page-config');if(!root)return;
  const grid=$('.settings-grid',root)||root;
  const last=App.lastImportAnalysis;
  const pendentes=v116PendingAttachmentCount(App.state);
  grid.insertAdjacentHTML('beforeend',`
  <section class="settings-card full-width">
    <div class="settings-card-head"><div class="settings-icon">⇩</div><div><h3>Backup e salvamento</h3><p>Backups no Drive, exportação externa e salvamento forçado.</p></div></div>
    <div class="settings-split">
      <div class="config-section">
        <h3>Salvamento forçado</h3>
        <p>Reenvia todos os cheques, boletos e fotos ao Google Drive e confere se chegou tudo. Use quando quiser ter certeza.</p>
        <div class="status-line"><span class="sync-dot ${App.drive.connected?(pendentes?'local':'ok'):'error'}"></span><div><b>${App.drive.connected?(pendentes?`${pendentes} foto(s) pendente(s)`:'Tudo confirmado'):'Drive desconectado'}</b><small>${stateActiveChequeCount(App.state)} cheque(s) · revisão ${esc(String(App.state.meta.revision||0))}</small></div></div>
        <button class="btn btn-primary btn-block" onclick="Borion.forceSave()">Forçar salvamento agora</button>
      </div>
      <div class="config-section">
        <h3>Backup no Google Drive</h3>
        <p>Cria um snapshot em Sistema / Backups / ano / mês.</p>
        <small class="muted">Último backup: ${esc(App.state.settings.lastDriveBackupDate||'ainda não criado')}</small>
        <button class="btn btn-outline btn-block" onclick="Borion.driveBackup()">Criar backup no Drive agora</button>
      </div>
      <div class="config-section">
        <h3>Exportação externa</h3>
        <p>ZIP descriptografado para pendrive ou outra pasta.</p>
        <button class="btn btn-outline btn-block" onclick="Borion.exportBackup()">Exportar ZIP completo</button>
        <button class="btn btn-outline btn-block" onclick="Borion.importBackup()">Restaurar ZIP</button>
      </div>
      <div class="config-section">
        <h3>Chave da equipe</h3>
        <p>Importada uma única vez em cada computador novo.</p>
        <button class="btn btn-outline btn-block" onclick="Borion.exportTeamKey()">Exportar chave</button>
        <button class="btn btn-outline btn-block" onclick="Borion.importTeamKey()">Importar chave</button>
      </div>
    </div>
  </section>
  <section class="settings-card full-width">
    <div class="settings-card-head"><div class="settings-icon">⇧</div><div><h3>Importar arquivos</h3><p>JSON e ZIP do Borion. Duplicidades são conferidas e ignoradas antes de salvar.</p></div></div>
    <div class="settings-split">
      <div class="config-section">
        <h3>Importar</h3>
        <p>Selecione um ou vários arquivos exportados pelo Borion CNPJ.</p>
        <button class="btn btn-primary btn-block" onclick="Borion.selectImportFiles()">Selecionar arquivos</button>
        <small class="muted">Nenhum registro existente é sobrescrito.</small>
      </div>
      <div class="config-section">
        <h3>Exportações rápidas</h3>
        <p>Leve os cheques para outro aparelho sem as fotos.</p>
        <button class="btn btn-outline btn-block" onclick="Borion.exportChequesImport()">Exportar cheques atuais</button>
      </div>
      ${last?`<div class="config-section"><h3>Última importação</h3><p>${esc(last.files?.join(' · ')||'Arquivo importado')}</p><small class="muted">${last.cheques||0} cheque(s), ${last.boletos||0} boleto(s), ${last.fornecedores||0} fornecedor(es) · ${last.duplicates||0} duplicado(s) · ${fmtDateTime(last.at)}</small></div>`:''}
    </div>
  </section>`);
};

/* ----- Menu do celular sem Backup e Importar soltos ----- */
openMobileMore=function(){
  const install=App.installPrompt?'<button class="mobile-menu-link" data-mobile-install>Instalar no celular <span>›</span></button>':'';
  const body=`<div class="mobile-more-menu"><button class="mobile-menu-link" data-mobile-refresh>Atualizar agora <span>↻</span></button><button class="mobile-menu-link" data-mobile-force>Forçar salvamento <span>⇧</span></button><button class="mobile-menu-link" data-mobile-go="fornecedores">Fornecedores <span>›</span></button><button class="mobile-menu-link" data-mobile-go="config">Configurações <span>›</span></button>${install}<button class="mobile-menu-link danger" data-mobile-logout>Sair da conta <span>›</span></button><div class="mobile-menu-version">Borion CNPJ · versão ${esc(CFG.version||'1.0.23')}</div></div>`;
  const modal=openModal({title:'Mais opções',subtitle:'Ferramentas do Borion CNPJ',body});
  $$('[data-mobile-go]',modal).forEach(b=>b.onclick=()=>{closeModal();setPage(b.dataset.mobileGo)});
  $('[data-mobile-refresh]',modal)?.addEventListener('click',async()=>{closeModal();try{await Drive.pull(true,true)}catch(e){toast(e.message,'error',6500)}});
  $('[data-mobile-force]',modal)?.addEventListener('click',async()=>{closeModal();try{await Drive.forceSave()}catch(e){console.warn(e)}});
  $('[data-mobile-logout]',modal).onclick=()=>{closeModal();logout()};
  $('[data-mobile-install]',modal)?.addEventListener('click',async()=>{await installPwa();closeModal()});
};

// Mês corrente já filtrado na abertura, no computador e no celular.
if(!App.filters.chequeMonth)App.filters.chequeMonth=todayISO().slice(0,7);



// ---------- Versão 1.0.23: fotos de cheques persistentes, lote com anexos e drag-and-drop real ----------
function v122IsImageFile(file){
  if(!file)return false;
  return String(file.type||'').startsWith('image/')||/\.(jpe?g|png|webp|heic|heif|bmp|gif|tiff?)$/i.test(String(file.name||''));
}
function v122IsChequeAttachment(file){
  if(!file)return false;
  return v122IsImageFile(file)||String(file.type||'')==='application/pdf'||/\.pdf$/i.test(String(file.name||''));
}
function v122TempFile(file,role='documento'){
  return {file,url:URL.createObjectURL(file),role};
}
function v122NextChequeRole(record,temp=[]){
  const roles=[...(record?.attachments||[]).map(a=>a.role),...temp.map(a=>a.role)];
  if(!roles.includes('frente'))return'frente';
  if(!roles.includes('verso'))return'verso';
  return'documento';
}

// O drop de anexos passa a aceitar também arquivos com MIME vazio e impede o navegador de "engolir" o drop.
wireDropZone=function(modal,onFiles){
  const zone=$('[data-drop-zone]',modal),input=$('[data-files]',modal),pick=$('[data-pick-files]',modal);
  if(!zone||!input||!pick)return;
  const send=files=>{const list=Array.from(files||[]);if(list.length)onFiles(list)};
  pick.onclick=()=>{input.value='';input.click()};
  input.onchange=()=>send(input.files);
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();zone.classList.add('drag');if(e.dataTransfer)e.dataTransfer.dropEffect='copy'}));
  ['dragleave','dragend'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag')}));
  zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('drag');send(e.dataTransfer?.files)});
};

// Edição individual: anexa primeiro, confirma no armazenamento local e somente depois fecha a janela.
openCheque=function(id=''){
  const existing=id?active(App.state.cheques).find(x=>x.id===id):null;
  const x=existing||{tipo:'Emitido',status:'Em aberto',dataEmissao:todayISO(),dataBom:todayISO(),valor:'',attachments:[],contaId:''};
  const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],x.tipo)}${field('numero','Número do cheque',x.numero||'')}${field('valor','Valor',x.valor||'')}${supplierOptions(x.fornecedorId||'')}${field('pessoa','Nome livre (opcional)',x.pessoa||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${chequeAccountSelectField('contaId','Conta de cheque',x.contaId||'')}${field('cmc7','CMC7',x.cmc7||'')}${field('dataEmissao','Data de emissão/recebimento',x.dataEmissao||todayISO(),'date')}${field('dataBom','Bom para / vencimento',x.dataBom||todayISO(),'date')}${field('dataCompensacao','Data de compensação',x.dataCompensacao||'','date')}${selectField('status','Status',['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'],x.status)}${field('lote','Lote',x.lote||'')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({
    title:existing?'Editar cheque':'Novo cheque',
    subtitle:'Fotos e PDFs são salvos neste aparelho antes da sincronização com o Google Drive.',
    body,saveLabel:existing?'Salvar alterações':'Cadastrar cheque',
    onSave:async modal=>{
      const v=formDataObj(modal);
      if(!v.numero.trim())throw new Error('Informe o número do cheque.');
      if(v.cpfCnpj&&!docValid(v.cpfCnpj))throw new Error('CPF/CNPJ inválido.');
      const dup=active(App.state.cheques).find(c=>c.id!==existing?.id&&normalize(c.numero)===normalize(v.numero)&&String(c.contaId||'')===String(v.contaId||''));
      if(dup&&!confirm(`Já existe o cheque ${dup.numero}. Deseja salvar mesmo assim?`))return;
      const item=existing||{id:uid(),createdAt:nowISO(),attachments:[]};
      Object.assign(item,v,{valor:Number(v.valor)||0,contaId:v.contaId||''});
      delete item.banco;delete item.agencia;delete item.conta;
      item.attachments=(item.attachments||[]).filter(a=>!removed.some(r=>r.id===a.id));
      for(const r of removed){
        try{await deleteAttachmentLocal(r.id)}catch{}
        if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{});
      }
      await attachFiles(item,temp,'frente');
      recordTouch(item);
      if(!existing)App.state.cheques.push(item);
      logAudit(existing?'Cheque atualizado':'Cheque cadastrado',`${item.numero} · ${brl(item.valor)} · ${(item.attachments||[]).length} anexo(s)`,'Cheque',item.id);
      await saveLocal(existing?'cheque-editado-com-foto-v122':'cheque-cadastrado-com-foto-v122');
      if(App.drive.connected)scheduleSync();
      closeModal();renderAll();
      toast(`Cheque salvo${(item.attachments||[]).length?` com ${(item.attachments||[]).length} foto(s)/arquivo(s)`:''}.`,'ok',4200);
    },
    onDelete:existing?async()=>{existing.deleted=true;recordTouch(existing);logAudit('Cheque excluído',existing.numero,'Cheque',existing.id);await saveLocal('cheque-excluido-v122');if(App.drive.connected)scheduleSync();closeModal();renderAll()}:null
  });
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);
  const queueFiles=files=>{
    const valid=Array.from(files||[]).filter(v122IsChequeAttachment);
    for(const file of valid)temp.push(v122TempFile(file,v122NextChequeRole(x,temp)));
    renderTempFiles(modal,temp);
    const p=$('[data-scan-progress]',modal);
    if(valid.length&&p){p.hidden=false;p.innerHTML=`${valid.length} arquivo(s) pronto(s) para salvar. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo</button>`;const b=$('[data-scan-now]',modal);if(b)b.onclick=()=>scanIntoForm(modal,temp[0].file,'cheque').catch(e=>toast(e.message,'error',6000))}
    if(!valid.length&&files?.length)toast('Use uma foto (JPG/PNG/WEBP/HEIC etc.) ou PDF.','error',5000);
  };
  wireDropZone(modal,queueFiles);
};

// Lote: cada cheque pode receber frente/verso antes de ser criado, por seleção ou arrastando do Windows.
openLote=function(){
  let rows=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],'Emitido')}${field('primeiroNumero','Primeiro número','SU 105120','','required')}${field('quantidade','Quantidade','5','number','min="1" max="120"')}${supplierOptions('')}${chequeAccountSelectField('contaId','Conta de cheque','')}${field('valor','Valor padrão','')}${field('dataBase','Data base',todayISO(),'date')}${field('prazos','Prazos em dias','30, 45, 60','text','full')}${field('nomeLote','Nome do lote','Lote '+new Date().toLocaleDateString('pt-BR'),'text','full')}${textArea('observacoes','Observações','')}</div><div class="field-help lote-photo-help">Cada linha aceita fotos. Clique em <b>＋ Foto</b> ou arraste a frente/verso diretamente sobre a coluna Fotos.</div><div class="lote-actions"><button type="button" class="btn btn-outline btn-sm" data-lote-regerar>Regerar grade</button><button type="button" class="btn btn-outline btn-sm" data-lote-add>Adicionar linha</button><span class="muted" data-lote-total></span></div><div class="table-wrap lote-grid"><table><thead><tr><th>Número</th><th>Prazo</th><th>Data</th><th>Valor</th><th>Fotos</th><th></th></tr></thead><tbody data-lote-rows></tbody></table></div>`;
  const modal=openModal({
    title:'Gerar cheques em lote',subtitle:'Crie o lote já com as fotos vinculadas a cada cheque.',body,size:'large',saveLabel:'Gerar cheques confirmados',
    onSave:async modal=>{
      syncRowsFromDom();
      const v=formDataObj(modal),current=rows.filter(r=>String(r.numero||'').trim());
      if(!current.length)throw new Error('A grade está vazia.');
      const nums=current.map(r=>normalize(r.numero));if(new Set(nums).size!==nums.length)throw new Error('Existem números repetidos na grade.');
      const existingNumbers=new Set(active(App.state.cheques).map(c=>normalize(c.numero))),found=current.find(r=>existingNumbers.has(normalize(r.numero)));
      if(found&&!confirm(`O cheque ${found.numero} já existe. Continuar mesmo assim?`))return;
      const staged=[];
      for(const r of current){
        const item={id:uid(),tipo:v.tipo,status:'Em aberto',numero:r.numero,fornecedorId:v.fornecedorId,pessoa:'',cpfCnpj:'',contaId:v.contaId||'',valor:Number(r.valor)||0,dataEmissao:v.dataBase,dataBom:r.data,lote:v.nomeLote,observacoes:v.observacoes,attachments:[],createdAt:nowISO()};
        await attachFiles(item,r.files||[],'frente');recordTouch(item);staged.push(item);
      }
      App.state.cheques.push(...staged);
      const photoCount=staged.reduce((n,c)=>n+(c.attachments||[]).length,0);
      logAudit('Lote de cheques criado',`${staged.length} cheques · ${photoCount} foto(s) · ${v.nomeLote}`,'Lote','');
      await saveLocal('lote-de-cheques-com-fotos-v122');if(App.drive.connected)scheduleSync();
      closeModal();App.chequeTab=v.tipo==='Emitido'?'emitidos':'recebidos';setPage('cheques');
      toast(`${staged.length} cheques salvos${photoCount?` com ${photoCount} foto(s) vinculada(s)`:''}.`,'ok',5000);
    }
  });
  wireQuickSupplier(modal);
  const syncRowsFromDom=()=>{
    $$('[data-lote-row]',modal).forEach((tr,i)=>{if(!rows[i])return;rows[i].numero=$('[data-r-numero]',tr)?.value.trim()||'';rows[i].prazo=Number($('[data-r-prazo]',tr)?.value)||0;rows[i].data=$('[data-r-data]',tr)?.value||todayISO();rows[i].valor=moneyInputNumber($('[data-r-valor]',tr)?.value)});
  };
  const addFilesToRow=(index,files)=>{
    syncRowsFromDom();const row=rows[index];if(!row)return;row.files=row.files||[];
    const valid=Array.from(files||[]).filter(v122IsImageFile);
    for(const file of valid){const roles=row.files.map(x=>x.role),role=!roles.includes('frente')?'frente':!roles.includes('verso')?'verso':'documento';row.files.push(v122TempFile(file,role))}
    if(!valid.length&&files?.length)toast('Solte uma foto válida do cheque.','error',4500);
    renderRows();
  };
  const renderRows=()=>{
    const tbody=$('[data-lote-rows]',modal);
    tbody.innerHTML=rows.map((r,i)=>{const files=r.files||[],names=files.slice(0,2).map(x=>`${x.role}: ${x.file.name}`).join(' · ');return`<tr data-lote-row><td><input data-r-numero value="${esc(r.numero)}"></td><td><input data-r-prazo type="number" value="${r.prazo}"></td><td><input data-r-data type="date" value="${esc(r.data)}"></td><td><div class="money-field compact"><span>R$</span><input data-r-valor data-money inputmode="numeric" value="${esc(moneyDisplay(r.valor))}"></div></td><td><div class="lote-photo-cell" data-lote-photo-drop="${i}"><div class="lote-photo-actions"><button type="button" class="action-btn" data-lote-photo-pick="${i}">＋ Foto</button>${files.length?`<button type="button" class="action-btn" data-lote-photo-clear="${i}">Limpar</button>`:''}</div><input type="file" accept="image/*" multiple hidden data-lote-photo-input="${i}"><small>${files.length?`${files.length} foto(s) · ${esc(names)}`:'Arraste aqui'}</small></div></td><td><button type="button" class="action-btn" data-r-remove="${i}">Excluir</button></td></tr>`}).join('');
    wireSmartInputs(tbody);
    $$('[data-r-remove]',tbody).forEach(b=>b.onclick=()=>{syncRowsFromDom();const i=Number(b.dataset.rRemove);for(const f of rows[i]?.files||[])try{URL.revokeObjectURL(f.url)}catch{}rows.splice(i,1);renderRows()});
    $$('[data-lote-photo-pick]',tbody).forEach(b=>b.onclick=()=>{const input=$(`[data-lote-photo-input="${b.dataset.lotePhotoPick}"]`,tbody);if(input){input.value='';input.click()}});
    $$('[data-lote-photo-input]',tbody).forEach(input=>input.onchange=()=>addFilesToRow(Number(input.dataset.lotePhotoInput),input.files));
    $$('[data-lote-photo-clear]',tbody).forEach(b=>b.onclick=()=>{syncRowsFromDom();const row=rows[Number(b.dataset.lotePhotoClear)];for(const f of row?.files||[])try{URL.revokeObjectURL(f.url)}catch{}if(row)row.files=[];renderRows()});
    $$('[data-lote-photo-drop]',tbody).forEach(cell=>{
      cell.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();cell.classList.add('dragover');if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});
      cell.addEventListener('dragleave',()=>cell.classList.remove('dragover'));
      cell.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();cell.classList.remove('dragover');addFilesToRow(Number(cell.dataset.lotePhotoDrop),e.dataTransfer?.files)});
    });
    const totalPhotos=rows.reduce((n,r)=>n+(r.files||[]).length,0);
    $('[data-lote-total]',modal).textContent=`${rows.length} cheque(s) · ${brl(rows.reduce((s,r)=>s+Number(r.valor||0),0))}${totalPhotos?` · ${totalPhotos} foto(s)`:''}`;
  };
  const regenerate=()=>{
    syncRowsFromDom();
    const oldRows=rows.slice(),oldByNumber=new Map(rows.map(r=>[normalize(r.numero),r.files||[]]));
    const v=formDataObj(modal),q=Math.max(1,Math.min(120,Number(v.quantidade)||1)),nums=parseChequeSequence(v.primeiroNumero,q),ds=parseDaySequence(v.prazos,q);
    rows=nums.map((numero,i)=>({numero,prazo:ds[i],data:addDays(v.dataBase,ds[i]),valor:Number(v.valor)||0,files:oldByNumber.get(normalize(numero))||oldRows[i]?.files||[]}));renderRows();
  };
  $('[data-lote-regerar]',modal).onclick=regenerate;
  $('[data-lote-add]',modal).onclick=()=>{syncRowsFromDom();const last=rows[rows.length-1]||{numero:'',prazo:0,data:todayISO(),valor:0};let numero=last.numero;try{numero=parseChequeSequence(last.numero,2)[1]}catch{}rows.push({numero,prazo:last.prazo+30,data:addDays(last.data,30),valor:last.valor,files:[]});renderRows()};
  regenerate();
};

// Organizador em massa: aceita soltar arquivos diretamente do Explorer e também diretamente em frente/verso.
Organizer.addFiles=async function(files){
  const added=[];
  for(const file of Array.from(files||[]).filter(v122IsImageFile)){
    let hash='';try{hash=await sha256Hex(file)}catch{}
    if(hash&&this.hashes.has(hash)){toast(`Foto duplicada ignorada: ${file.name}`,'error',3500);continue}
    const id=uid();if(hash)this.hashes.set(hash,id);this.photos.set(id,{id,file,url:URL.createObjectURL(file),text:'',confidence:0,rotation:0,hash});added.push(id);
  }
  this.autoByFilename();this.render();return added;
};
Organizer.open=async function(){
  this.photos.clear();this.assignments.clear();this.confirmed.clear();this.hashes.clear();
  this.cheques=active(App.state.cheques).filter(x=>!['Compensado','Cancelado'].includes(x.status)).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true}));
  if(!this.cheques.length){toast('Crie primeiro os cheques do lote.','error');return}
  const body=`<div class="page-toolbar"><div class="toolbar-left"><button class="btn btn-primary" data-org-pick>Selecionar fotos</button><button class="btn btn-outline" data-org-analyze>Analisar OCR</button><button class="btn btn-outline" data-org-confirm-all>Confirmar todos associados</button></div><div class="toolbar-right"><span class="muted" data-org-status>Nenhuma foto selecionada</span></div></div><input type="file" data-org-files accept="image/*" multiple hidden><div class="drop-zone organizer-import-drop" data-org-file-drop><div class="drop-icon">⇧</div><b>Arraste as fotos do Windows para cá</b><p>Elas entram imediatamente no organizador. Você também pode soltar uma foto direto no campo Frente ou Verso de um cheque.</p></div><div class="organizer"><div class="unmatched" data-unmatched><h3>Fotos ainda não vinculadas</h3><div class="organizer-list" data-unmatched-list></div></div><div class="cheque-slots" data-cheque-slots></div></div>`;
  this.modal=openModal({title:'Organizar fotos dos cheques',subtitle:'Arraste, associe, leia por OCR e salve os vínculos.',body,size:'large',saveLabel:'Salvar fotos vinculadas',onSave:()=>this.save()});
  const input=$('[data-org-files]',this.modal),drop=$('[data-org-file-drop]',this.modal);
  $('[data-org-pick]',this.modal).onclick=()=>{input.value='';input.click()};input.onchange=()=>this.addFiles(input.files);
  $('[data-org-analyze]',this.modal).onclick=()=>this.analyze();
  $('[data-org-confirm-all]',this.modal).onclick=()=>{for(const c of this.cheques){if([...this.assignments.values()].some(a=>a.chequeId===c.id))this.confirmed.add(c.id)}this.render()};
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();drop.classList.add('drag');if(e.dataTransfer)e.dataTransfer.dropEffect='copy'}));
  ['dragleave','dragend'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();drop.classList.remove('drag');const ids=await this.addFiles(e.dataTransfer?.files);if(ids.length)toast(`${ids.length} foto(s) adicionada(s). Você pode analisar por OCR ou arrastar para o cheque.`,'ok',4200)});
  this.render();
};
Organizer.wireDrag=function(){
  $$('[data-photo-id]',this.modal).forEach(el=>el.addEventListener('dragstart',e=>{this.dragId=el.dataset.photoId;e.dataTransfer.setData('text/plain',this.dragId);e.dataTransfer.effectAllowed='move'}));
  $$('[data-slot-cheque]',this.modal).forEach(slot=>{
    slot.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();slot.classList.add('dragover');if(e.dataTransfer)e.dataTransfer.dropEffect=e.dataTransfer.files?.length?'copy':'move'});
    slot.addEventListener('dragleave',()=>slot.classList.remove('dragover'));
    slot.addEventListener('drop',async e=>{
      e.preventDefault();e.stopPropagation();slot.classList.remove('dragover');const chequeId=slot.dataset.slotCheque,role=slot.dataset.slotRole;
      if(e.dataTransfer?.files?.length){
        const ids=await this.addFiles(e.dataTransfer.files);ids.forEach((id,i)=>this.assignments.set(id,{chequeId,role:i===0?role:this.firstEmptyRole(chequeId)}));this.confirmed.add(chequeId);this.render();return;
      }
      const id=e.dataTransfer?.getData('text/plain')||this.dragId;if(id){this.assignments.set(id,{chequeId,role});this.confirmed.add(chequeId);this.render()}
    });
  });
  const un=$('[data-unmatched]',this.modal);if(un){un.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=e.dataTransfer.files?.length?'copy':'move'});un.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();if(e.dataTransfer?.files?.length){await this.addFiles(e.dataTransfer.files);return}const id=e.dataTransfer?.getData('text/plain')||this.dragId;if(id)this.unassign(id)})}
};
Organizer.save=async function(){
  if(!this.assignments.size)throw new Error('Associe pelo menos uma foto a um cheque.');
  const targetChequeIds=this.confirmed.size?new Set(this.confirmed):new Set([...this.assignments.values()].map(a=>a.chequeId));
  let saved=0;
  for(const [photoId,a] of this.assignments){
    if(!targetChequeIds.has(a.chequeId))continue;
    const p=this.photos.get(photoId),ch=this.cheques.find(x=>x.id===a.chequeId);if(!p||!ch)continue;
    const meta=await storeAttachment(p.file);meta.role=a.role;ch.attachments=ch.attachments||[];
    const old=ch.attachments.find(x=>x.role===a.role);if(old)old.role='documento';ch.attachments.push(meta);recordTouch(ch);saved++;
    try{URL.revokeObjectURL(p.url)}catch{}
  }
  for(const chId of targetChequeIds)logAudit('Fotos do cheque vinculadas','Frente/verso salvos localmente','Cheque',chId);
  await saveLocal('fotos-em-massa-v122');if(App.drive.connected)scheduleSync();
  closeModal();renderAll();toast(`${saved} foto(s) vinculada(s) e salvas. Sincronização com o Drive iniciada.`,'ok',5000);
};

Object.assign(window.Borion,{newCheque:()=>openCheque(),editCheque:openCheque,newLote:openLote,organizePhotos:()=>Organizer.open()});


// ---------- Versão 1.0.23: visão geral só de cheques emitidos e faixa de mês no topo ----------
function v121DashboardStrip(){
  const picked=App.dashboardDates;
  const sub=picked.length
    ? (picked.length===1?`Dia ${fmtDate(picked[0])} selecionado`:`${picked.length} dias selecionados`)
    : (App.state.meta?.updatedAt?`Atualizado em ${fmtDateTime(App.state.meta.updatedAt)}`:'Toque no mês para escolher dias');
  return `<div class="dashboard-month-strip">
    <div class="month-nav-wrap">
      <div class="month-nav">
        <button type="button" onclick="Borion.dashboardMonthMove(-1)" aria-label="Mês anterior">‹</button>
        <button type="button" class="mlabel month-pick" onclick="Borion.openDashboardCalendar()" title="Escolher um ou mais dias">${esc(dashboardMonthLabel(App.dashboardMonth))}</button>
        <button type="button" onclick="Borion.dashboardMonthMove(1)" aria-label="Próximo mês">›</button>
      </div>
      <span class="clock-label">${esc(sub)}</span>
    </div>
    ${picked.length?'<button class="action-btn" onclick="Borion.clearDashboardDates()">Ver o mês inteiro</button>':''}
  </div>`;
}

// O calendário conta apenas os cheques emitidos.
dashboardCalendarMarkup=function(){
  return dashboardCalendar(App.dashboardMonth,active(App.state.cheques).filter(x=>x.tipo==='Emitido'),[]);
};

renderDashboard=function(){
  const root=$('#page-dashboard');if(!root)return;
  const emittedAll=active(App.state.cheques).filter(x=>x.tipo==='Emitido');
  const picked=App.dashboardDates;
  const dateOf=x=>chequeDashboardDate(x,false);
  const emitted=emittedAll
    .filter(x=>{const d=dateOf(x);return picked.length?picked.includes(d):String(d||'').startsWith(App.dashboardMonth)})
    .sort((a,b)=>String(dateOf(a)).localeCompare(String(dateOf(b))));
  const sum=arr=>arr.reduce((t,x)=>t+Number(x.valor||0),0);
  const monthCheques=emittedAll.filter(x=>String(dateOf(x)||'').startsWith(App.dashboardMonth));
  const week=v120WeekRange();
  const weekCheques=emittedAll.filter(x=>{const d=dateOf(x);return d&&d>=week.start&&d<=week.end});
  const selection=picked.length?(picked.length===1?fmtDate(picked[0]):`${picked.length} dias selecionados`):dashboardMonthLabel(App.dashboardMonth);
  root.innerHTML=`${v121DashboardStrip()}
  <div class="dashboard-totals">
    <div class="total-card"><span>Cheques que caem no mês</span><b>${brl(sum(monthCheques))}</b><small>${monthCheques.length} cheque(s) · ${esc(dashboardMonthLabel(App.dashboardMonth))}</small></div>
    <div class="total-card week"><span>Cheques da semana</span><b>${brl(sum(weekCheques))}</b><small>${weekCheques.length} cheque(s) · ${fmtDate(week.start)} a ${fmtDate(week.end)}</small></div>
    <div class="total-card"><span>Seleção atual</span><b>${brl(sum(emitted))}</b><small>${emitted.length} cheque(s) · ${esc(selection)}</small></div>
  </div>
  <section class="panel dashboard-single-list"><div class="panel-head"><div><div class="panel-title">Cheques emitidos</div><p class="muted">${emitted.length} cheque(s) · ${brl(sum(emitted))} em ${esc(selection)}</p></div></div><div class="panel-body">${dashboardRows(emitted,false)}</div></section>`;
};

Object.assign(window.Borion,{
  dashboardSelectDate,openDashboardCalendar,clearDashboardDates:v120ClearDashboardDates,
  viewFornecedor,forceSave:()=>Drive.forceSave().catch(e=>console.warn(e))
});

$('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setPage(b.dataset.page)});
$('#mobile-more')?.addEventListener('click',openMobileMore);
$('#btn-google-login').onclick=()=>Drive.login().catch(e=>toast(e.message,'error',7000));
$('#btn-logout').onclick=logout;
$('#btn-sync').onclick=()=>{
  if(!App.drive.connected){toast('Entre com o Google para sincronizar.','error');return}
  if(App.drive.syncing){toast('Já está sincronizando, aguarde um instante…','local',2500);return}
  Drive.refreshNow(true).catch(e=>toast(e.message,'error',6500));
};
window.addEventListener('pagehide',flushPendingLocalNow);
window.addEventListener('beforeunload',flushPendingLocalNow);
boot();
})();

// ---------- Versão 1.0.23: edição transacional e proteção contra atualização concorrente ----------
const V123_VERSION='1.0.23';
function v123HasActiveEditor(){
  return Boolean($('#modal-root .modal[data-borion-edit-session="1"]'));
}
function v123LiveRecord(list,id){
  return (list||[]).find(x=>x&&x.id===id&&!x.deleted)||null;
}
function v123Clone(value){return JSON.parse(JSON.stringify(value||{}))}
async function v123StoreTempFiles(tempFiles,defaultRole='documento'){
  const metas=[];
  for(const item of tempFiles||[]){
    const meta=await storeAttachment(item.file);
    meta.role=item.role||defaultRole;
    metas.push(meta);
  }
  return metas;
}
function v123ReleaseTempUrls(tempFiles){
  for(const item of tempFiles||[])try{if(item.url)URL.revokeObjectURL(item.url)}catch{}
}
async function v123PersistNow(reason){
  await saveLocal(reason||'edicao-imediata-v123');
  renderAll();
  if(App.drive.connected)scheduleSync();
}

// Todo modal que possui botão Salvar vira uma sessão protegida. Atualizações automáticas
// do Drive ficam adiadas até o usuário confirmar ou cancelar a edição.
const v123OpenModalBase=openModal;
openModal=function(options){
  const modal=v123OpenModalBase(options);
  if(options?.onSave&&modal)modal.dataset.borionEditSession='1';
  return modal;
};

// Pull v1.0.23: nunca substitui a memória enquanto há formulário aberto. Se uma alteração
// acontecer enquanto o Drive responde, o estado vivo do aparelho é reunido no final e vence.
Drive._pullOnceV123=async function(showMessage=false,forceRootScan=false){
  if(v123HasActiveEditor()){
    this._v123DeferredPull=true;
    updateSyncUI('local','Edição em andamento','Atualização do Drive pausada até salvar ou cancelar');
    return {changed:false,needsPush:v115Pending(),remote:null,deferred:true};
  }
  const dirtyAtStart=v115DirtySeq();
  updateSyncUI('busy','Carregando','Procurando a base no Google Drive');
  if(!await this.ensureFreshToken())throw new Error('A sessão do Google expirou neste aparelho. Entre novamente para sincronizar.');
  const discovered=await this.discoverOfficialV119(forceRootScan||!App.drive.rootId);
  if(v123HasActiveEditor()){
    this._v123DeferredPull=true;
    updateSyncUI('local','Edição em andamento','A atualização recebida será aplicada depois da edição');
    return {changed:false,needsPush:v115Pending(),remote:null,deferred:true};
  }
  await this.applyDiscoveryV119(discovered);
  const best=discovered.best;
  const liveLocal=v116CloneState(App.state);
  if(!best?.state){
    if(stateRecordCount(liveLocal)>0){
      v115SetPending(true);
      updateSyncUI('local','Dados deste aparelho',`${stateActiveChequeCount(liveLocal)} cheque(s) prontos para enviar ao Drive`);
      return {changed:false,needsPush:true,remote:null};
    }
    updateSyncUI('error','Base não encontrada','Nenhum current.json com registros foi localizado');
    throw new Error('Não foi encontrada uma base do Borion CNPJ com registros nesta conta Google. Confira se é a mesma conta usada no computador. Nada foi apagado.');
  }
  const remoteState=best.state;
  const changedDuringPull=v115DirtySeq()!==dirtyAtStart;
  const preserveLocal=(changedDuringPull||v115Pending())&&stateRecordCount(liveLocal)>0;
  const next=preserveLocal?this.mergeState(remoteState,liveLocal,'local'):v116CloneState(remoteState);
  next.settings.rootFolderId=App.drive.rootId;
  next.settings.rootFolderName=discovered.root?.name||CFG.driveRootFolderName||'Borion CNPJ';
  const changed=v116StateSignature(liveLocal)!==v116StateSignature(next);
  const needsPush=preserveLocal&&v116StateSignature(next)!==v116StateSignature(remoteState);
  App.state=next;App.drive.officialRevision=Number(best.revision||0);
  await saveLocal('carregado-sem-sobrescrever-edicao-v123',false);renderAll();
  if(needsPush)v115SetPending(true);else if(!changedDuringPull){v115SetPending(false);v118ClearLegacyPending()}
  updateSyncUI('ok',needsPush?'Alterações locais preservadas':'Sincronizado',`${stateActiveChequeCount(App.state)} cheque(s) · revisão ${best.revision||0}`);
  if(showMessage)toast(changed?`${stateActiveChequeCount(App.state)} cheque(s) carregados do Google Drive.`:'Este aparelho já está atualizado.','ok',4200);
  return {changed,needsPush,remote:{state:remoteState,current:best,revision:Number(best.revision||0)}};
};
Drive.pull=function(showMessage=false,forceRootScan=false){
  if(!App.drive.connected)return Promise.reject(new Error('Entre com o Google para atualizar.'));
  if(v123HasActiveEditor()){
    this._v123DeferredPull=true;
    return Promise.resolve({changed:false,needsPush:v115Pending(),remote:null,deferred:true});
  }
  if(this._pullPromise)return this._pullPromise;
  this._pullPromise=this.runLocked('pull',()=>this._pullOnceV123(showMessage,forceRootScan)).finally(()=>{this._pullPromise=null});
  return this._pullPromise;
};

// Fornecedor: resolve novamente pelo ID no instante do commit e salva localmente antes de fechar.
openFornecedor=function(id=''){
  const snapshot=id?v123LiveRecord(App.state.fornecedores,id):null;
  const x=snapshot?v123Clone(snapshot):{tipo:'Pessoa jurídica',status:'Ativo'};
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Pessoa jurídica','Pessoa física'],x.tipo)}${selectField('status','Situação',['Ativo','Inativo'],x.status||'Ativo')}${field('nome','Nome / razão social',x.nome||'','text','required')}${field('fantasia','Nome fantasia',x.fantasia||'')}${field('cpfCnpj','CPF / CNPJ',x.cpfCnpj||'')}${field('telefone','Telefone',x.telefone||'')}${field('whatsapp','WhatsApp',x.whatsapp||'')}${field('email','E-mail',x.email||'','email')}${field('contato','Contato principal',x.contato||'')}${field('cep','CEP',x.cep||'')}${field('cidade','Cidade',x.cidade||'')}${field('uf','Estado',x.uf||'')}${field('endereco','Endereço completo',x.endereco||'','text','full')}${field('dadosBancarios','Dados bancários (opcional)',x.dadosBancarios||'','text','full')}${textArea('observacoes','Observações internas',x.observacoes||'')}</div>`;
  const modal=openModal({title:id?'Editar fornecedor':'Novo fornecedor',subtitle:'As alterações são gravadas neste aparelho no instante em que você salva.',body,saveLabel:id?'Salvar alterações':'Cadastrar fornecedor',onSave:async modal=>{
    const v=formDataObj(modal);if(!v.nome.trim())throw new Error('Informe o nome ou razão social.');if(v.cpfCnpj&&!docValid(v.cpfCnpj))throw new Error('CPF/CNPJ inválido.');
    const duplicate=active(App.state.fornecedores).find(s=>s.id!==id&&digits(s.cpfCnpj)&&digits(s.cpfCnpj)===digits(v.cpfCnpj));if(duplicate)throw new Error(`CPF/CNPJ já cadastrado para ${duplicate.nome}.`);
    let item=id?v123LiveRecord(App.state.fornecedores,id):null;
    if(id&&!item)throw new Error('Este fornecedor foi alterado em outro dispositivo. Atualize e tente novamente.');
    if(!item){item={id:uid(),createdAt:nowISO()};App.state.fornecedores.push(item)}
    Object.assign(item,v);recordTouch(item);logAudit(id?'Fornecedor atualizado':'Fornecedor cadastrado',item.nome,'Fornecedor',item.id);
    await v123PersistNow(id?'fornecedor-editado-imediato-v123':'fornecedor-cadastrado-v123');closeModal();renderAll();toast('Fornecedor salvo imediatamente.');
  },onDelete:id?async()=>{const item=v123LiveRecord(App.state.fornecedores,id);if(!item)return;item.deleted=true;recordTouch(item);logAudit('Fornecedor excluído',item.nome,'Fornecedor',item.id);await v123PersistNow('fornecedor-excluido-v123');closeModal();renderAll()}:null});
  wireSupplierMasks(modal);
};

// Conta de cheque: mesma regra transacional por ID.
openChequeAccount=function(id=''){
  const snapshot=id?chequeAccounts(true).find(x=>x.id===id):null;
  const x=snapshot?v123Clone(snapshot):{ativo:true};
  const body=`<div class="form-grid cols-2">${field('nome','Nome da conta',x.nome||'')}${field('banco','Banco',x.banco||'')}${field('agencia','Agência',x.agencia||'')}${field('conta','Conta',x.conta||'')}<label class="borion-switch full"><input name="ativo" type="checkbox" ${x.ativo!==false?'checked':''}><span class="switch-track"></span><span><b>Conta ativa</b><small>Contas inativas continuam aparecendo nos cheques antigos.</small></span></label></div>`;
  openModal({title:id?'Editar conta de cheque':'Nova conta de cheque',subtitle:'A alteração fica salva localmente antes da sincronização.',body,saveLabel:'Salvar conta',onSave:async modal=>{
    const v=formDataObj(modal);if(!v.nome.trim()&&!v.banco.trim())throw new Error('Informe um nome ou banco para a conta.');
    let item=id?chequeAccounts(true).find(x=>x.id===id):null;if(id&&!item)throw new Error('Esta conta mudou em outro dispositivo. Atualize e tente novamente.');
    if(!item){item={id:uid(),createdAt:nowISO()};App.state.settings.chequeAccounts.push(item)}
    Object.assign(item,v,{ativo:v.ativo!==false});recordTouch(item);logAudit(id?'Conta atualizada':'Conta cadastrada',accountLabel(item),'Conta',item.id);
    await v123PersistNow(id?'conta-cheque-editada-v123':'conta-cheque-cadastrada-v123');closeModal();renderConfig();toast('Conta de cheque salva imediatamente.');
  },onDelete:id?async()=>{const item=chequeAccounts(true).find(x=>x.id===id);if(!item)return;item.ativo=false;recordTouch(item);await v123PersistNow('conta-cheque-desativada-v123');closeModal();renderConfig();toast('Conta desativada.');}:null});
};

// Cheque: prepara anexos primeiro e só então faz um commit síncrono no registro vivo pelo ID.
openCheque=function(id=''){
  const snapshot=id?v123LiveRecord(App.state.cheques,id):null;
  const x=snapshot?v123Clone(snapshot):{tipo:'Emitido',status:'Em aberto',dataEmissao:todayISO(),dataBom:todayISO(),valor:'',attachments:[],contaId:''};
  const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${selectField('tipo','Tipo',['Emitido','Recebido'],x.tipo)}${field('numero','Número do cheque',x.numero||'')}${field('valor','Valor',x.valor||'')}${supplierOptions(x.fornecedorId||'')}${field('pessoa','Nome livre (opcional)',x.pessoa||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${chequeAccountSelectField('contaId','Conta de cheque',x.contaId||'')}${field('cmc7','CMC7',x.cmc7||'')}${field('dataEmissao','Data de emissão/recebimento',x.dataEmissao||todayISO(),'date')}${field('dataBom','Bom para / vencimento',x.dataBom||todayISO(),'date')}${field('dataCompensacao','Data de compensação',x.dataCompensacao||'','date')}${selectField('status','Status',['Em preparação','Emitido','Entregue','Em aberto','Compensado','Devolvido','Reapresentado','Cancelado'],x.status)}${field('lote','Lote',x.lote||'')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({title:id?'Editar cheque':'Novo cheque',subtitle:'Número, dados e fotos são gravados imediatamente neste aparelho; o Drive sincroniza depois.',body,saveLabel:id?'Salvar alterações':'Cadastrar cheque',onSave:async modal=>{
    const v=formDataObj(modal);if(!v.numero.trim())throw new Error('Informe o número do cheque.');if(v.cpfCnpj&&!docValid(v.cpfCnpj))throw new Error('CPF/CNPJ inválido.');
    const dup=active(App.state.cheques).find(c=>c.id!==id&&normalize(c.numero)===normalize(v.numero)&&String(c.contaId||'')===String(v.contaId||''));if(dup&&!confirm(`Já existe o cheque ${dup.numero}. Deseja salvar mesmo assim?`))return;
    // Todo await fica antes do commit para não deixar uma referência velha ser alterada no meio da operação.
    const newMetas=await v123StoreTempFiles(temp,'frente');
    const removedIds=new Set(removed.map(r=>r.id));
    let item=id?v123LiveRecord(App.state.cheques,id):null;
    if(id&&!item){v123ReleaseTempUrls(temp);throw new Error('Este cheque mudou em outro dispositivo. Atualize e tente novamente.');}
    const oldStatus=item?.status||snapshot?.status||'';
    if(!item){item={id:uid(),createdAt:nowISO(),attachments:[]};App.state.cheques.push(item)}
    const kept=(item.attachments||[]).filter(a=>!removedIds.has(a.id));
    Object.assign(item,v,{valor:Number(v.valor)||0,contaId:v.contaId||''});delete item.banco;delete item.agencia;delete item.conta;
    item.attachments=[...kept,...newMetas];recordTouch(item);
    logAudit(id?'Cheque atualizado':'Cheque cadastrado',`${item.numero} · ${brl(item.valor)} · ${(item.attachments||[]).length} anexo(s)`,'Cheque',item.id);
    if(oldStatus&&oldStatus!==item.status)logAudit('Status do cheque alterado',`${oldStatus} → ${item.status}`,'Cheque',item.id);
    await v123PersistNow(id?'cheque-editado-imediato-v123':'cheque-cadastrado-v123');
    v123ReleaseTempUrls(temp);
    for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}
    closeModal();renderAll();toast(`Cheque ${item.numero} salvo imediatamente${newMetas.length?` com ${newMetas.length} novo(s) anexo(s)`:''}.`,'ok',5000);
  },onDelete:id?async()=>{const item=v123LiveRecord(App.state.cheques,id);if(!item)return;item.deleted=true;recordTouch(item);logAudit('Cheque excluído',item.numero,'Cheque',item.id);await v123PersistNow('cheque-excluido-v123');closeModal();renderAll()}:null});
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);
  const queueFiles=files=>{const valid=Array.from(files||[]).filter(v122IsChequeAttachment);for(const file of valid)temp.push(v122TempFile(file,v122NextChequeRole(x,temp)));renderTempFiles(modal,temp);const p=$('[data-scan-progress]',modal);if(valid.length&&p){p.hidden=false;p.innerHTML=`${valid.length} arquivo(s) pronto(s) para salvar. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo</button>`;const b=$('[data-scan-now]',modal);if(b)b.onclick=()=>scanIntoForm(modal,temp[0].file,'cheque').catch(e=>toast(e.message,'error',6000))}if(!valid.length&&files?.length)toast('Use uma foto ou PDF válido.','error',5000)};
  wireDropZone(modal,queueFiles);
};

// Boleto: também resolve o registro vivo pelo ID no instante do commit.
openBoleto=function(id=''){
  const snapshot=id?v123LiveRecord(App.state.boletos,id):null;
  const x=snapshot?v123Clone(snapshot):{status:'Em aberto',dataCadastro:todayISO(),vencimento:todayISO(),valor:'',attachments:[]};
  const temp=[],removed=[];
  const body=`<div class="form-grid cols-3">${supplierOptions(x.fornecedorId||'')}${field('beneficiario','Beneficiário / nome livre',x.beneficiario||'')}${field('cpfCnpj','CPF/CNPJ',x.cpfCnpj||'')}${field('documento','Número do documento',x.documento||'')}${field('nossoNumero','Nosso número',x.nossoNumero||'')}${field('banco','Banco',x.banco||'')}${field('dataCadastro','Data de cadastro',x.dataCadastro||todayISO(),'date')}${field('valor','Valor original',x.valor||'')}${field('vencimento','Vencimento',x.vencimento||todayISO(),'date')}${selectField('status','Status',['Em aberto','Pago','Vencido','Cancelado'],x.status)}${field('dataPagamento','Data do pagamento',x.dataPagamento||'','date')}${field('valorPago','Valor pago',x.valorPago||'')}${field('juros','Juros',x.juros||'')}${field('multa','Multa',x.multa||'')}${field('desconto','Desconto',x.desconto||'')}${field('formaPagamento','Forma de pagamento',x.formaPagamento||'')}${field('linhaDigitavel','Linha digitável / código de barras',x.linhaDigitavel||'','text','full autocomplete="off"')}${textArea('observacoes','Observações',x.observacoes||'')}${existingAttachmentsHtml(x)}${attachmentDropHtml('image/*,.pdf')}</div>`;
  const modal=openModal({title:id?'Editar boleto':'Novo boleto',subtitle:'As alterações são confirmadas localmente antes de sincronizar com o Drive.',body,saveLabel:id?'Salvar alterações':'Cadastrar boleto',onSave:async modal=>{
    const v=formDataObj(modal);const liveBefore=id?v123LiveRecord(App.state.boletos,id):null;const existingAttachments=liveBefore?.attachments||snapshot?.attachments||[];
    if(!v.linhaDigitavel.trim()&&!temp.length&&!existingAttachments.length)throw new Error('Informe a linha digitável ou anexe uma foto/PDF.');
    const validation=v.linhaDigitavel?validateBoletoLine(v.linhaDigitavel):{valid:true,errors:[],warnings:[]};if(v.linhaDigitavel&&!validation.valid&&!confirm('A linha digitável apresenta erro: '+validation.errors.join(' ')+' Salvar mesmo assim?'))return;
    const code=digits(v.linhaDigitavel),dup=active(App.state.boletos).find(b=>b.id!==id&&code&&digits(b.linhaDigitavel)===code);if(dup&&!confirm('Este boleto já está cadastrado. Salvar duplicado mesmo assim?'))return;if(v.status==='Pago'&&!v.dataPagamento)v.dataPagamento=todayISO();
    const newMetas=await v123StoreTempFiles(temp,'boleto');const removedIds=new Set(removed.map(r=>r.id));
    let item=id?v123LiveRecord(App.state.boletos,id):null;if(id&&!item){v123ReleaseTempUrls(temp);throw new Error('Este boleto mudou em outro dispositivo. Atualize e tente novamente.');}
    const oldStatus=item?.status||snapshot?.status||'';if(!item){item={id:uid(),createdAt:nowISO(),attachments:[]};App.state.boletos.push(item)}
    const kept=(item.attachments||[]).filter(a=>!removedIds.has(a.id));Object.assign(item,v,{valor:Number(v.valor)||0,valorPago:Number(v.valorPago)||0,juros:Number(v.juros)||0,multa:Number(v.multa)||0,desconto:Number(v.desconto)||0,linhaDigitavel:code});item.attachments=[...kept,...newMetas];recordTouch(item);
    logAudit(id?'Boleto atualizado':'Boleto cadastrado',`${item.documento||item.beneficiario||'Boleto'} · ${brl(item.valor)}`,'Boleto',item.id);if(oldStatus&&oldStatus!==item.status)logAudit('Status do boleto alterado',`${oldStatus} → ${item.status}`,'Boleto',item.id);
    await v123PersistNow(id?'boleto-editado-imediato-v123':'boleto-cadastrado-v123');v123ReleaseTempUrls(temp);for(const r of removed){try{await deleteAttachmentLocal(r.id)}catch{}if(r.driveFileId&&App.drive.connected)Drive.deleteFile(r.driveFileId).catch(()=>{})}
    closeModal();renderAll();toast('Boleto salvo imediatamente.');
  },onDelete:id?async()=>{const item=v123LiveRecord(App.state.boletos,id);if(!item)return;item.deleted=true;recordTouch(item);logAudit('Boleto excluído',item.documento||item.beneficiario,'Boleto',item.id);await v123PersistNow('boleto-excluido-v123');closeModal();renderAll()}:null});
  wireQuickSupplier(modal);wireExistingRemovals(modal,x,removed);wireSupplierMasks(modal);
  const line=$('[name="linhaDigitavel"]',modal);if(line)line.addEventListener('input',()=>{line.value=digits(line.value).slice(0,48);const info=boletoInfoFromDigits(line.value);if(info.valor&&moneyInputNumber($('[name="valor"]',modal).value)===0)setMoneyInputValue($('[name="valor"]',modal),info.valor);if(info.vencimento&&!$('[name="vencimento"]',modal).value)$('[name="vencimento"]',modal).value=info.vencimento;const p=$('[data-scan-progress]',modal);if(p&&[44,47,48].includes(digits(line.value).length)){const val=validateBoletoLine(line.value);p.hidden=false;p.textContent=val.valid?'Código válido.':'Atenção: '+val.errors.join(' ')}});
  wireDropZone(modal,files=>{const valid=Array.from(files||[]).filter(v122IsChequeAttachment);for(const file of valid)temp.push(v122TempFile(file,'boleto'));renderTempFiles(modal,temp);if(valid.length){const p=$('[data-scan-progress]',modal);p.hidden=false;p.innerHTML='Arquivo pronto. <button type="button" class="action-btn" data-scan-now>Ler primeiro arquivo agora</button>';const b=$('[data-scan-now]',modal);if(b)b.onclick=()=>scanIntoForm(modal,temp[0].file,'boleto').catch(e=>toast(e.message,'error',6000))}});
};

// Fotos em massa: qualquer associação visível é salva; confirmação deixa de filtrar registros.
Organizer.save=async function(){
  if(!this.assignments.size)throw new Error('Associe pelo menos uma foto a um cheque.');
  const staged=[];
  for(const [photoId,a] of this.assignments){
    const p=this.photos.get(photoId);if(!p)continue;
    const meta=await storeAttachment(p.file);meta.role=a.role;staged.push({photoId,chequeId:a.chequeId,meta,url:p.url});
  }
  let saved=0;const touched=new Set();
  for(const entry of staged){
    const ch=v123LiveRecord(App.state.cheques,entry.chequeId);if(!ch)continue;
    ch.attachments=ch.attachments||[];const old=ch.attachments.find(x=>x.role===entry.meta.role);if(old)old.role='documento';ch.attachments.push(entry.meta);recordTouch(ch);touched.add(ch.id);saved++;
  }
  if(!saved)throw new Error('Nenhuma associação pôde ser aplicada aos cheques atuais. Atualize a tela e tente novamente.');
  for(const chId of touched)logAudit('Fotos do cheque vinculadas','Associações visíveis salvas localmente','Cheque',chId);
  await v123PersistNow('fotos-em-massa-todas-associacoes-v123');
  for(const entry of staged)try{URL.revokeObjectURL(entry.url)}catch{}
  closeModal();renderAll();toast(`${saved} foto(s) vinculada(s) e salvas imediatamente.`,'ok',5200);
};

Object.assign(window.Borion,{newFornecedor:()=>openFornecedor(),editFornecedor:openFornecedor,newCheque:()=>openCheque(),editCheque:openCheque,newBoleto:()=>openBoleto(),editBoleto:openBoleto,newChequeAccount:()=>openChequeAccount(),editChequeAccount:openChequeAccount,newLote:openLote,organizePhotos:()=>Organizer.open()});
