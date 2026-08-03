# BORION CNPJ 1.0.6

Sistema web/PWA para Cheques, Boletos e Fornecedores, com visual completo no computador e consulta simplificada no celular.

## Google Drive é a fonte oficial

Ao entrar com o Google, o sistema cria ou reutiliza `Borion CNPJ` na raiz do Drive da conta. Não existe tela manual para digitar pasta.

Estrutura principal:

```text
Borion CNPJ/
├── Sistema/
│   ├── Dados/current.json
│   ├── Backups/ANO/MM - Mês/
│   ├── Histórico/
│   └── Operações/
├── Cheques/ANO/MM - Mês/
└── Boletos/ANO/MM - Mês/
```

Cada alteração é salva imediatamente no navegador. Cada sincronização cria um snapshot completo no Drive antes de atualizar `current.json`. Há também backup diário, mensal e manual. Se a internet cair, os dados permanecem no computador e entram novamente na fila.

A versão 1.0.6 remove a dependência da chave de equipe para os novos dados compartilhados. A proteção é feita pelas permissões, autenticação e criptografia do Google Drive. Arquivos antigos criptografados são preservados para recuperação e nunca são apagados automaticamente.

## Contas de cheque

Banco, agência e conta são cadastrados somente em Configurações. No cheque aparece um selecionável. Sem conta cadastrada, o valor exibido é `--`.

## Importar arquivos

Existe um módulo próprio **Importar arquivos**, separado de perfil e configurações. Ele aceita um ou vários JSON/ZIP, mostra uma conferência antes de salvar e ignora cheques, boletos, fornecedores, contas e anexos já existentes. O módulo também mantém a exportação leve de cheques sem fotos.

## Publicação

Extraia o ZIP e envie todo o conteúdo para a raiz do repositório do GitHub Pages. O Client ID já está em `js/config.js`. Não publique Client Secret.


## Novidades 1.0.6
- Menu próprio **Importar arquivos**.
- Aceita um ou vários JSON/ZIP do Borion.
- Analisa cheques, boletos, fornecedores, contas e anexos antes de salvar.
- Duplicidades são ignoradas; registros existentes não são sobrescritos.
- PWA responsivo para celular, com cartões simples para consulta.
- Instalação pela tela inicial do Android/iPhone quando suportada pelo navegador.
