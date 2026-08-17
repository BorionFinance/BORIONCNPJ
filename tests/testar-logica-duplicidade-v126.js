'use strict';
const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('js/app.js','utf8');
function extract(startNeedle,endNeedle){
  const start=app.indexOf(startNeedle);const end=app.indexOf(endNeedle,start);
  assert(start>=0&&end>start,`bloco não encontrado: ${startNeedle}`);
  return app.slice(start,end);
}
const appliedSrc=extract('function v126AppliedEventsForCheque','function v126AlreadyProcessedMovement');
const auditSrc=extract('function v126DuplicateStrength','async function v126AnalyzeReconciliationFile');
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmtDate=s=>s||'';
const brl=n=>'R$ '+Math.abs(Number(n||0)).toFixed(2);
const v125NormalizeChequeNumber=v=>String(v||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
const v126BankTransactionKey=e=>'k-'+[e.date,e.chequeId||e.chequeNumber,e.amount,e.kind,e.fitId||'',e.sourceLine||''].join('|');
const active=list=>(list||[]).filter(x=>!x.deleted);
const App={state:{cheques:[],conciliacoes:[]}};
const factory=new Function('App','active','v125NormalizeChequeNumber','v126BankTransactionKey','fmtDate','brl','normalize',appliedSrc+'\n'+auditSrc+'\nreturn {v126AuditDuplicateCompensations};');
const {v126AuditDuplicateCompensations}=factory(App,active,v125NormalizeChequeNumber,v126BankTransactionKey,fmtDate,brl,normalize);
function baseState(){App.state.cheques=[{id:'c1',numero:'105791',valor:2511}];App.state.conciliacoes=[];}
function mov(id,kind,date,idx,fit=''){return {id,chequeId:'c1',chequeNumber:'105791',kind,date,amount:-2511,fitId:fit,sourceLine:`${date} CH COMPENSADO 105791 ${fit}`.trim(),state:'matched',selected:true,_statementIndex:idx};}

// 1) Duas compensações em datas diferentes, sem devolução: forte indício.
baseState();
let a=mov('a','compensado','2026-08-14',0,'FIT-A');let b=mov('b','compensado','2026-08-18',1,'FIT-B');
v126AuditDuplicateCompensations([a,b]);
assert.equal(a.state,'matched');assert.equal(b.state,'duplicate_alert');assert.equal(b.selected,false);assert.equal(b.duplicateLevel,'high');

// 2) Compensado -> devolvido -> compensado: reapresentação coerente, sem alerta.
baseState();
a=mov('a','compensado','2026-08-14',0,'FIT-A');const d={...mov('d','devolvido','2026-08-15',1,'FIT-D'),amount:2511,sourceLine:'15/08 DEV CH105791'};b=mov('b','compensado','2026-08-18',2,'FIT-B');
v126AuditDuplicateCompensations([a,d,b]);
assert.equal(b.state,'matched');assert.equal(b.reapresentationNormal,true);assert.equal(b.selected,true);

// 3) Duas linhas iguais no mesmo dia sem ID bancário: revisão, não afirma duplicidade.
baseState();
a=mov('a','compensado','2026-08-14',0,'');b=mov('b','compensado','2026-08-14',1,'');
v126AuditDuplicateCompensations([a,b]);
assert.equal(b.state,'duplicate_review');assert.equal(b.selected,false);assert.equal(b.duplicateLevel,'review');

// 4) Compensação histórica com FITID A + nova com FITID B, sem devolução: forte indício.
baseState();
App.state.conciliacoes=[{id:'r1',createdAt:'2026-08-14T12:00:00Z',bank:'033',account:'123',aplicados:[{chequeId:'c1',chequeNumber:'105791',kind:'compensado',date:'2026-08-14',amount:2511,fitId:'FIT-A',sourceLine:'14/08 CH COMPENSADO 105791'}]}];
b=mov('b','compensado','2026-08-18',0,'FIT-B');
v126AuditDuplicateCompensations([b]);
assert.equal(b.state,'duplicate_alert');assert.equal(b.duplicateWith.fitId,'FIT-A');

console.log('Lógica v1.0.26: 4 cenários reais de duplicidade/reapresentação aprovados.');
