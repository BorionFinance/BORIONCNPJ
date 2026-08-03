# BORION CNPJ 1.0.4

Sistema web desktop para Cheques, Boletos e Fornecedores, usando a identidade visual do Borion Finance 7.6.2.

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

A versão 1.0.4 remove a dependência da chave de equipe para os novos dados compartilhados. A proteção é feita pelas permissões, autenticação e criptografia do Google Drive. Arquivos antigos criptografados são preservados para recuperação e nunca são apagados automaticamente.

## Contas de cheque

Banco, agência e conta são cadastrados somente em Configurações. No cheque aparece um selecionável. Sem conta cadastrada, o valor exibido é `--`.

## Importação de cheques

Em Backup existem os botões `Exportar cheques atuais` e `Importar arquivo de cheques`. O JSON leva cheques, fornecedores e contas, sem fotos, para que as imagens sejam adicionadas depois em Editar.

## Publicação

Extraia o ZIP e envie todo o conteúdo para a raiz do repositório do GitHub Pages. O Client ID já está em `js/config.js`. Não publique Client Secret.
