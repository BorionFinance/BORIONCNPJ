'use strict';
const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('js/app.js','utf8');

// O bug real da 1.0.23: a correção estava depois de })(); e portanto fora do escopo do app.
const layer=app.indexOf("const V124_VERSION='1.0.24'");
const close=app.lastIndexOf('})();');
assert(layer>0,'camada 1.0.24 não encontrada');
assert(layer<close,'camada 1.0.24 precisa executar dentro do IIFE principal');
assert.equal(app.slice(close+5).trim(),'','não pode haver correção solta depois do fechamento do app');
const publicOverride=app.indexOf('Object.assign(window.Borion,{newFornecedor:()=>openFornecedor()',layer);
assert(publicOverride>layer&&publicOverride<close,'API pública precisa apontar para o editor 1.0.24 dentro do escopo');
assert(app.includes('v124PersistAndVerify'),'confirmação de persistência ausente');
assert(app.includes("cheque-editado-confirmado-v124"),'motivo de persistência do cheque ausente');

const clone=v=>JSON.parse(JSON.stringify(v));
const live=(list,id)=>list.find(x=>x.id===id&&!x.deleted)||null;
const replace=(list,id,next)=>{const i=list.findIndex(x=>x.id===id);if(i>=0)list[i]=next;else list.push(next)};

// Simula exatamente 105824 -> 105184 após a árvore de estado ter sido substituída.
let state={cheques:[{id:'c1',numero:'105824',updatedAt:'2026-08-07T14:00:00.000Z',attachments:[]}]};
const stale=state.cheques[0];
state={cheques:clone(state.cheques)};
stale.numero='105184';
assert.equal(state.cheques[0].numero,'105824','a referência velha não pode ser usada no commit');
const current=live(state.cheques,'c1');
const committed={...current,numero:'105184',updatedAt:'2026-08-07T14:01:00.000Z'};
replace(state.cheques,'c1',committed);
const persisted=JSON.parse(JSON.stringify(state));
assert.equal(live(persisted.cheques,'c1').numero,'105184','o JSON persistido precisa conter 105184');

// Simula 3 fotos / 3 cheques sem filtro de confirmação parcial.
state.cheques=[
  {id:'c1',numero:'105184',attachments:[]},
  {id:'c2',numero:'105185',attachments:[]},
  {id:'c3',numero:'105186',attachments:[]}
];
for(const [i,id] of ['c1','c2','c3'].entries()){
  const ch=clone(live(state.cheques,id));ch.attachments.push({id:`a${i+1}`,role:'frente'});replace(state.cheques,id,ch);
}
const persistedPhotos=JSON.parse(JSON.stringify(state));
assert.deepEqual(persistedPhotos.cheques.map(c=>c.attachments.length),[1,1,1],'3 cheques devem persistir 3 vínculos independentes');
console.log('Edição 1.0.24: escopo executável, 105824→105184 e 3/3 fotos aprovados.');
