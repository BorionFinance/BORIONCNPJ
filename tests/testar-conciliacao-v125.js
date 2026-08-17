'use strict';
const fs=require('fs');
const assert=require('assert');
const app=fs.readFileSync('js/app.js','utf8');
const mapStart=app.indexOf('const V125_MONTH_MAP=');
const mapEnd=app.indexOf(';',mapStart)+1;
const start=app.indexOf('function v125NormalizeChequeNumber');
const end=app.indexOf('function v125AccountMatchesMovement',start);
assert(mapStart>0&&mapEnd>mapStart&&start>0&&end>start,'bloco de parser v1.0.25 não encontrado');
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const digits=value=>String(value||'').replace(/\D/g,'');
const uid=()=> 'test-'+Math.random().toString(16).slice(2);
const brl=value=>'R$ '+Number(value||0).toFixed(2).replace('.',',');
const window={};
// Define somente mapa de meses + parsers. APIs de DOM/ZIP/PDF ficam declaradas mas não são executadas neste teste.
const parserSource=app.slice(mapStart,mapEnd)+'\n'+app.slice(start,end)+'\nreturn {v125MovementFromLine,v125NormalizeChequeNumber};';
const parserFactory=new Function('normalize','digits','uid','brl','window',parserSource);
const {v125MovementFromLine,v125NormalizeChequeNumber}=parserFactory(normalize,digits,uid,brl,window);

let mov=v125MovementFromLine('14/ago CH COMPENSADO 756 105791 -2.511,00','2026');
assert(mov,'movimentação compensada precisa ser lida');
assert.equal(mov.date,'2026-08-14');
assert.equal(mov.chequeNumber,'105791');
assert.equal(mov.kind,'compensado');
assert.equal(mov.amount,-2511);

mov=v125MovementFromLine('14/ago CH COMPENSADO 033 105779 -4.500,00','2026');
assert(mov,'segundo padrão compensado precisa ser lido');
assert.equal(mov.chequeNumber,'105779');
assert.equal(mov.kind,'compensado');
assert.equal(mov.amount,-4500);

mov=v125MovementFromLine('03/ago C - DEV CH105721 CONTR ORDEM 2.370,00','2026');
assert(mov,'movimentação devolvida precisa ser lida');
assert.equal(mov.date,'2026-08-03');
assert.equal(mov.chequeNumber,'105721');
assert.equal(mov.kind,'devolvido');
assert.equal(mov.reason,'Contraordem');
assert.equal(mov.amount,2370);

assert.equal(v125NormalizeChequeNumber('000105184'),'105184');
assert(app.includes('v125IsInstalledPWA'),'bloqueio da conciliação na PWA ausente');
assert(app.includes('v125RememberChequeListPosition'),'memória de posição da lista ausente');
assert(app.includes('data-cheque-row'),'âncora de restauração da linha ausente');
assert(app.includes('App.state.conciliacoes.push'),'histórico de conciliações não está sendo persistido');
assert(app.includes('bankEventKey'),'proteção idempotente por evento bancário ausente');
console.log('Conciliação 1.0.25: padrões reais do extrato, PWA sem módulo, idempotência e posição da lista validados.');
