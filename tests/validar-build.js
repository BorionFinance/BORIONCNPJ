const fs = require('fs');

function fail(message) {
  console.error('ERRO:', message);
  process.exitCode = 1;
}
function assert(condition, message) {
  if (!condition) fail(message);
}

const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const config = fs.readFileSync('js/config.js', 'utf8');
const css = fs.readFileSync('css/cnpj.css', 'utf8');

assert(index.includes('1.0.3'), 'index.html não está na versão 1.0.3');
assert(config.includes("version: '1.0.3'"), 'config.js não está na versão 1.0.3');
assert(!index.includes('btn-local-login'), 'modo local ainda aparece na tela de acesso');
assert(!index.includes('btn-gate-config'), 'configuração manual ainda aparece na tela de acesso');
assert(!app.includes('openGoogleConfig'), 'função de configuração manual ainda existe');
assert(!app.includes('cfg-client-id'), 'campo de Client ID ainda existe dentro do aplicativo');
assert(!app.includes('cfg-root-id'), 'campo de link/ID da pasta ainda existe dentro do aplicativo');
assert(app.includes("clientId(){ return String(CFG.googleClientId||'').trim(); }"), 'OAuth não está lendo exclusivamente js/config.js');
assert(app.includes("'root' in parents"), 'pasta Borion CNPJ não está limitada à raiz do Drive');
assert(app.includes('data-money'), 'máscara monetária não foi encontrada');
assert(app.includes('moneyFromTyping'), 'digitação em centavos não foi encontrada');
assert(app.includes('data-document'), 'máscara de CPF/CNPJ não foi encontrada');
assert(app.includes('formatDoc'), 'formatador de CPF/CNPJ não foi encontrado');
assert(css.includes('.money-field'), 'visual monetário Borion não foi encontrado');
assert(css.includes('.settings-card'), 'novo visual das configurações não foi encontrado');

if (!process.exitCode) console.log('BORION CNPJ 1.0.3 validado com sucesso.');
