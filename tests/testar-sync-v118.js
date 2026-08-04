'use strict';
const assert=require('assert');

function compareCandidates(a,b){
  if(a.records!==b.records)return b.records-a.records;
  if(a.revision!==b.revision)return b.revision-a.revision;
  const rank=value=>value==='nested'?0:value==='system'?1:value==='root'?2:3;
  return rank(a.kind)-rank(b.kind);
}
function chooseBase(candidates){
  return [...candidates].sort(compareCandidates).find(x=>x.records>0)||null;
}
function mergeList(remote,local){
  const map=new Map();
  for(const item of remote||[])if(item?.id)map.set(item.id,item);
  for(const item of local||[]){
    if(!item?.id)continue;
    const prev=map.get(item.id);
    if(!prev||String(item.updatedAt||'')>=String(prev.updatedAt||''))map.set(item.id,item);
  }
  return [...map.values()];
}

const candidates=[
  {root:'id-antigo-configurado',kind:'nested',records:0,revision:99},
  {root:'pasta-correta',kind:'root',records:7,revision:35},
  {root:'pasta-correta',kind:'nested',records:7,revision:35}
];
const chosen=chooseBase(candidates);
assert.equal(chosen.root,'pasta-correta','um ID configurado vazio não pode bloquear a busca da base real');
assert.equal(chosen.kind,'nested','Sistema/Dados/current.json deve vencer o espelho da raiz no empate');
const remote=Array.from({length:7},(_,i)=>({id:`c${i+1}`,updatedAt:'2026-08-04T15:55:43.561Z'}));
assert.equal(mergeList(remote,[]).length,7,'um celular vazio deve receber os 7 cheques do Drive');
assert.equal(mergeList(remote,[{id:'c8',updatedAt:'2026-08-04T16:00:00.000Z'}]).length,8,'uma pendência local deve ser reunida sem apagar os dados remotos');
assert.equal(chooseBase([{root:'vazia',kind:'nested',records:0,revision:1}]),null,'uma pasta vazia não deve virar base oficial');
console.log('Sincronização v1.0.18: descoberta automática, duplicidade de pastas e recuperação aprovadas.');
