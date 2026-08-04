# Google Drive — Borion CNPJ 1.0.11

O Client ID já está configurado em `js/config.js`. A origem `https://cnpj.borionfinance.com.br` deve permanecer em Origens JavaScript autorizadas e a Google Drive API deve estar ativada.

O aplicativo cria automaticamente a pasta `Borion CNPJ` na raiz da conta conectada.

Os novos JSONs, fotos e PDFs não usam a antiga chave local de equipe. Isso evita bloqueio entre computadores e mantém o compartilhamento pelo próprio Google Drive. O Drive aplica autenticação, controle de acesso, TLS e criptografia de armazenamento.
