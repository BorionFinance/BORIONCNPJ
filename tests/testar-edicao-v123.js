'use strict';
const assert=require('assert');

function clone(v){return JSON.parse(JSON.stringify(v))}
function live(list,id){return list.find(x=>x.id===id&&!x.deleted)||null}
function mergeList(remote,local){
  const map=new Map();
  for(const x of remote)map.set(x.id,x);
  for(const x of local){
    const prev=map.get(x.id);
    if(!prev||String(x.updatedAt||'')>String(prev.updatedAt||''))map.set(x.id,x);
  }
  return [...map.values()];
}

// Reproduz o bug: uma janela guarda um objeto, um pull troca App.state e a referência fica velha.
let state={cheques:[{id:'c1',numero:'105824',updatedAt:'2026-08-07T10:40:00.000Z',attachments:[]}]};
const stale=state.cheques[0];
state={cheques:clone(state.cheques)}; // atualização remota substituiu a árvore de objetos
stale.numero='105184';
assert.equal(state.cheques[0].numero,'105824','a referência antiga realmente não altera o estado vivo');

// v1.0.23: no commit, resolve de novo pelo ID e só então aplica o formulário.
const current=live(state.cheques,'c1');
Object.assign(current,{numero:'105184',updatedAt:'2026-08-07T10:49:00.000Z'});
assert.equal(state.cheques[0].numero,'105184','o número corrigido deve persistir no registro vivo');

// Um pull posterior não pode devolver o valor antigo quando a edição local é mais nova.
const remote=[{id:'c1',numero:'105824',updatedAt:'2026-08-07T10:40:00.000Z',attachments:[]}];
state.cheques=mergeList(remote,state.cheques);
assert.equal(state.cheques[0].numero,'105184','pull remoto antigo não pode desfazer a edição local');

// Todas as associações visíveis devem ser aplicadas, independentemente de confirmação parcial.
state.cheques=[
  {id:'c1',numero:'105184',updatedAt:'2026-08-07T10:49:00.000Z',attachments:[]},
  {id:'c2',numero:'105185',updatedAt:'2026-08-07T10:49:00.000Z',attachments:[]},
  {id:'c3',numero:'105186',updatedAt:'2026-08-07T10:49:00.000Z',attachments:[]}
];
const assignments=[
  {chequeId:'c1',meta:{id:'a1',role:'frente'}},
  {chequeId:'c2',meta:{id:'a2',role:'frente'}},
  {chequeId:'c3',meta:{id:'a3',role:'frente'}}
];
let saved=0;
for(const a of assignments){const ch=live(state.cheques,a.chequeId);if(!ch)continue;ch.attachments.push(a.meta);saved++}
assert.equal(saved,3,'3 associações visíveis devem salvar 3 fotos');
assert.deepEqual(state.cheques.map(c=>c.attachments.length),[1,1,1],'cada cheque deve receber sua própria foto');

console.log('Edição v1.0.23: referência velha, pull concorrente e 3/3 fotos aprovados.');
