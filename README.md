# Borion CNPJ — Cheques e Boletos

Aplicação HTML para computador, criada com a identidade visual da base oficial Borion Finance 7.6.2.

## O que já está incluído

- Login Google e acesso a pasta compartilhada do Google Drive.
- Modo local para testar antes de configurar o Google.
- Cheques emitidos e recebidos.
- Geração de cheques em lote com numeração sequencial.
- Cálculo automático de datas por prazos em dias.
- Cadastro rápido e completo de fornecedores/pessoas.
- Fotos da frente, verso, comprovantes e PDFs.
- Importação em massa de fotos com associação automática e arrastar/soltar.
- Boletos por foto, PDF, linha digitável e leitor USB que funcione como teclado.
- OCR local em português com Tesseract.js.
- Validação básica de linhas de 44, 47 e 48 dígitos.
- Alertas de vencimento.
- Backup completo em ZIP.
- Criptografia AES-256-GCM antes do envio ao Drive.
- Histórico de ações por conta Google.

## Publicação

Envie **o conteúdo desta pasta** para a raiz do repositório e ative o GitHub Pages. Não envie apenas o ZIP.

## Google Drive

Leia `CONFIGURAR_GOOGLE_DRIVE.md`. O site precisa de um OAuth Client ID criado no Google Cloud para o domínio do GitHub Pages.

## Estrutura do Drive

```text
Borion CNPJ
├── Sistema
│   ├── borion-cnpj.enc
│   └── Backups
├── Cheques
│   └── 2026
│       └── 08 - Agosto
└── Boletos
    └── 2026
        └── 08 - Agosto
```

Os documentos são enviados com extensão `.borion`, pois ficam criptografados e são visualizados dentro do próprio sistema.
