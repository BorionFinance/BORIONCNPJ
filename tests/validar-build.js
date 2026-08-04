const fs = require('fs');
function fail(message){ console.error('ERRO:',message); process.exitCode=1; }
function assert(condition,message){ if(!condition) fail(message); }
const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const config=fs.readFileSync('js/config.js','utf8');
const css=fs.readFileSync('css/cnpj.css','utf8');
assert(index.includes('1.0.15'),'index.html não está na versão 1.0.15');
assert(config.includes("version: '1.0.15'"),'config.js não está na versão 1.0.15');
assert(config.includes('946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com'),'Client ID ausente');
assert(app.includes("V104_LOCAL_STATE_KEY='borion_cnpj_state_v2'"),'salvamento local v2 ausente');

assert(app.includes("const V115_CURRENT_FILE='current.json'"),'arquivo oficial current.json v1.0.15 ausente');
assert(app.includes('Drive.runLocked'),'fila serial de sincronização ausente');
assert(app.includes('Drive.writeOperation'),'fila de operações do Drive ausente');
assert(app.includes('Drive.verifyCurrent'),'confirmação pós-gravação ausente');
assert(app.includes('v115AccountStateKey'),'estado local separado por conta ausente');
assert(app.includes('Sincronizando nova alteração'),'proteção contra alteração durante envio ausente');
assert(index.includes("updateViaCache:'none'"),'atualização forçada do service worker ausente');
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
assert(index.includes('manifest.webmanifest'),'manifesto PWA ausente');
assert(index.includes('service-worker.js'),'registro do service worker ausente');
assert(index.includes('data-page="importar"'),'menu Importar arquivos ausente');
assert(app.includes('buildImportPlan'),'análise de importação ausente');
assert(app.includes('duplicates.cheques'),'detecção de cheques duplicados ausente');
assert(app.includes('duplicates.boletos'),'detecção de boletos duplicados ausente');
assert(app.includes('renderChequesDesktopV105'),'visualização mobile de cheques ausente');
assert(css.includes('.mobile-record-card'),'cartões mobile ausentes');
assert(fs.existsSync('manifest.webmanifest'),'arquivo manifest ausente');
assert(fs.existsSync('service-worker.js'),'service worker ausente');
assert(index.includes('borion-cnpj-v111-emblem.png'),'emblema oficial v109 não referenciado');
assert(index.includes('borion-cnpj-v111-apple-touch-icon.png'),'ícone mobile oficial v109 não referenciado');
assert(fs.existsSync('borion-cnpj-v111-icon-192.png'),'ícone 192 oficial ausente');
assert(fs.existsSync('borion-cnpj-v111-icon-512.png'),'ícone 512 oficial ausente');
assert(fs.readFileSync('service-worker.js','utf8').includes("borion-cnpj-v1.0.15"),'cache PWA não está em 1.0.15');

if(!process.exitCode) console.log('BORION CNPJ 1.0.15 validado com sucesso.');
