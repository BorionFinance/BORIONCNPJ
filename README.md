# BORION CNPJ 1.0.2

Sistema web desktop para **Cheques, Boletos e Fornecedores**, construído sobre a identidade visual oficial do **Borion Finance 7.6.2**.

## Fidelidade visual

O arquivo `css/borion-7.6.2.css` é uma cópia binariamente idêntica do `css/styles.css` da base oficial BORION Finance 7.6.2 fornecida para este projeto.

SHA-256 do CSS oficial usado:

```text
824f0e807bcf39e66b8a35b6f807545c576de1078c064197c6ee36fe94edadd8
```

A camada `css/cnpj.css` apenas encaixa os módulos específicos de Cheques, Boletos e Fornecedores nos componentes oficiais: sidebar, topbar, botões, formulários, tabelas, modais, cards, splash, boot, scroll e animações.

## Recursos

- Login Google OAuth.
- Google Drive como armazenamento oficial.
- Criação automática da pasta `Borion CNPJ`.
- JSON atual e backups criptografados.
- Fotos e PDFs criptografados no Drive.
- Cheques emitidos e recebidos.
- Emissão em lote com numeração sequencial.
- Datas automáticas por prazos em dias.
- Importação em massa de fotos e organização por arrastar.
- Frente e verso de cheque.
- Leitura OCR local em português.
- Leitura de boletos por foto, PDF, linha digitável ou leitor USB.
- Validação de 44, 47 e 48 dígitos.
- Cadastro e histórico de fornecedores.
- Alertas de vencimento.
- Backup diário no Drive e exportação ZIP.
- Uso exclusivo em computador.

## Estrutura criada no Google Drive

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
2. Envie **o conteúdo extraído** para a raiz do repositório.
3. Não envie apenas o ZIP fechado.
4. No GitHub, abra `Settings > Pages`.
5. Em `Build and deployment`, selecione `Deploy from a branch`.
6. Selecione a branch `main` e a pasta `/ (root)`.
7. Salve e aguarde a publicação.
8. Configure o Google OAuth conforme `CONFIGURAR_GOOGLE_DRIVE.md`.

## Configuração principal

Edite `js/config.js` e informe o OAuth Client ID:

```js
googleClientId: 'SEU_CLIENT_ID.apps.googleusercontent.com'
```

O Client ID é público e não é uma senha. Nunca coloque Client Secret no site.
