const fs = require('fs');
function fail(message){ console.error('ERRO:',message); process.exitCode=1; }
function assert(condition,message){ if(!condition) fail(message); }
const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const config=fs.readFileSync('js/config.js','utf8');
const css=fs.readFileSync('css/cnpj.css','utf8');
assert(index.includes('1.0.4'),'index.html não está na versão 1.0.4');
assert(config.includes("version: '1.0.4'"),'config.js não está na versão 1.0.4');
assert(config.includes('946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com'),'Client ID ausente');
assert(app.includes("V104_LOCAL_STATE_KEY='borion_cnpj_state_v2'"),'salvamento local v2 ausente');
assert(app.includes("'current.json'"),'current.json do Drive ausente');
assert(app.includes("Drive.createSnapshot"),'snapshots do Drive ausentes');
assert(app.includes("'AUTO'"),'backup automático por sincronização ausente');
assert(app.includes("'DIARIO'"),'backup diário ausente');
assert(app.includes("'MENSAL'"),'backup mensal ausente');
assert(app.includes('chequeAccountSelectField'),'seleção de conta ausente');
assert(app.includes("label:'--'"),'opção -- ausente');
assert(app.includes('exportChequesImport'),'exportação de cheques ausente');
assert(app.includes('importChequesFile'),'importação de cheques ausente');
assert(app.includes('data-money'),'máscara monetária ausente');
assert(app.includes('formatDoc'),'máscara CPF/CNPJ ausente');
assert(css.includes('.settings-card'),'estética Borion de configurações ausente');
if(!process.exitCode) console.log('BORION CNPJ 1.0.4 validado com sucesso.');
