# BORION CNPJ 1.0.3

Sistema web desktop para **Cheques, Boletos e Fornecedores**, construído sobre a identidade visual oficial do **Borion Finance 7.6.2**.

## Alterações da versão 1.0.3

- Removida a janela de configuração manual do Google Drive.
- Removidos os campos de Client ID e link/ID da pasta dentro do aplicativo.
- Login exclusivamente pelo Google OAuth.
- O Client ID é configurado somente em `js/config.js`.
- A pasta `Borion CNPJ` é procurada ou criada automaticamente na raiz do Drive da conta logada.
- Valores no padrão Borion: `0,00`, com digitação progressiva em centavos.
- CPF e CNPJ formatados automaticamente durante a digitação.
- Campos, selects e configurações corrigidos para o visual escuro oficial do Borion.

## Configuração do Google OAuth

Edite `js/config.js`:

```js
window.BORION_CONFIG = {
  appName: 'Borion CNPJ',
  version: '1.0.3',
  googleClientId: 'SEU_CLIENT_ID.apps.googleusercontent.com',
  driveRootFolderName: 'Borion CNPJ',
  authorizedEmails: [],
  desktopOnly: true
};
```

O Client ID pode ficar no GitHub. **Nunca coloque Client Secret no site.**

No Google Cloud:

1. Ative a Google Drive API.
2. Configure a tela de consentimento OAuth.
3. Crie um OAuth Client ID do tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione a origem do GitHub Pages, por exemplo:
   `https://seuusuario.github.io`
5. Adicione as contas de teste enquanto o aplicativo estiver em modo de teste.

## Google Drive

Depois do login, o Borion cria automaticamente:

```text
Borion CNPJ/
├── Sistema/
│   ├── Dados/
│   │   └── current.json.borion
│   ├── Backups/
│   │   └── ANO/
│   │       └── MM - Mês/
│   └── Histórico/
├── Cheques/
│   └── ANO/
│       └── MM - Mês/
└── Boletos/
    └── ANO/
        └── MM - Mês/
```

## Publicação no GitHub Pages

1. Extraia o ZIP.
2. Envie o conteúdo extraído para a raiz do repositório.
3. Abra `Settings > Pages`.
4. Selecione `Deploy from a branch`.
5. Escolha `main` e `/ (root)`.
6. Salve e aguarde a publicação.
7. Configure o Client ID em `js/config.js`.
