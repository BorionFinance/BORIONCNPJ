'use strict';
const assert=require('assert');

const OFFICIAL_ROOT='1UR5lLsUeBtv9Cc8jYj70HWhySuvqko0-';
function chooseRoot(configured, folders){
  if(configured)return folders.find(x=>x.id===configured)||null;
  return [...folders].sort((a,b)=>(b.records-a.records)||(b.revision-a.revision))[0]||null;
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
const folders=[
  {id:'pasta-vazia-recente',records:0,revision:99},
  {id:OFFICIAL_ROOT,records:7,revision:35}
];
assert.equal(chooseRoot(OFFICIAL_ROOT,folders).id,OFFICIAL_ROOT,'deve usar o ID oficial, não a pasta vazia mais recente');
const remote=Array.from({length:7},(_,i)=>({id:`c${i+1}`,updatedAt:'2026-08-04T15:55:43.561Z'}));
assert.equal(mergeList(remote,[]).length,7,'PWA vazio deve receber os 7 cheques do Drive');
assert.equal(mergeList(remote,[{id:'c8',updatedAt:'2026-08-04T16:00:00.000Z'}]).length,8,'alteração local pendente deve ser reunida sem apagar o Drive');
console.log('Sincronização v1.0.17: pasta oficial e carga remota aprovadas.');
