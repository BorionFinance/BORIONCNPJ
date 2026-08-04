'use strict';
const assert=require('assert');

function mergeList(left,right,remoteWins=false){
  const map=new Map();
  for(const item of left||[])if(item?.id)map.set(item.id,item);
  for(const item of right||[]){
    if(!item?.id)continue;
    const prev=map.get(item.id);if(!prev){map.set(item.id,item);continue}
    const pt=String(prev.updatedAt||prev.createdAt||''),it=String(item.updatedAt||item.createdAt||'');
    if(it>pt||(it===pt&&remoteWins))map.set(item.id,item);
  }
  return [...map.values()];
}
function merge(local,remote,prefer='local'){
  return {cheques:mergeList(local.cheques,remote.cheques,prefer==='remote')};
}
const seven={cheques:Array.from({length:7},(_,i)=>({id:`c${i+1}`,updatedAt:'2026-08-04T12:00:00Z'}))};
const empty={cheques:[]};
assert.equal(merge(seven,empty).cheques.length,7,'Drive vazio não pode apagar os 7 cheques locais');
assert.equal(merge(empty,seven,'remote').cheques.length,7,'Celular vazio deve receber os 7 cheques do Drive');
const local={cheques:[{id:'c1',updatedAt:'2026-08-04T12:00:00Z',valor:10}]};
const remote={cheques:[{id:'c1',updatedAt:'2026-08-04T13:00:00Z',valor:20}]};
assert.equal(merge(local,remote).cheques[0].valor,20,'Registro mais recente deve vencer');
console.log('Sincronização v1.0.16: simulações lógicas aprovadas.');
