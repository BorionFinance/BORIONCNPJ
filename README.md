# BORION CNPJ 1.0.26

Sistema web/PWA para Cheques, Boletos e Fornecedores, com Google Drive como fonte compartilhada entre computador e celular.



## Novidades da 1.0.26

- Proteção contra possível compensação/deposição duplicada do mesmo cheque durante a conciliação bancária.
- Diferencia repetição do mesmo evento bancário, reapresentação legítima e possível duplicidade real.
- Usa identificador bancário/FITID quando disponível; sem evidência suficiente, mostra **Revisão necessária** em vez de afirmar algo que o extrato não prova.
- Painel de segurança com cheques verificados, sem alerta, reapresentações coerentes e possíveis duplicidades.
- Filtro **Inconsistências** na conferência do extrato.
- Tela de **Ocorrências bancárias do cheque** para comparar datas, valores, texto original e identificadores.
- Possíveis duplicidades ficam desmarcadas e nunca são aplicadas automaticamente.
- A importação/conciliação continua fora da versão PWA, como solicitado.
- Mantida a correção da posição da lista após editar/salvar cheque.

## Novidades da 1.0.25

- Conciliação bancária de cheques por extrato disponível no navegador desktop, com etapa de análise e conferência antes de aplicar qualquer mudança.
- Reconhecimento de compensações, devoluções e reapresentações, com histórico/auditoria e proteção contra eventos duplicados.
- Regularização financeira e recuperação física de cheque devolvido são controles independentes.
- Ao salvar um cheque no meio de uma lista longa, a tela retorna à mesma posição em vez de saltar para o topo.
- O importador de extrato não é disponibilizado no modo PWA instalado.

## Sincronização e recuperação

A base atual mantém o mecanismo de recuperação que não depende mais de um único ID fixo. Ao entrar com o Google, o aplicativo:

1. verifica IDs conhecidos apenas como preferência;
2. procura todas as pastas `Borion CNPJ` acessíveis;
3. inspeciona estruturas `Sistema/Dados` duplicadas;
4. procura arquivos `current.json` e espelhos compatíveis;
5. escolhe a base válida com mais registros e maior revisão;
6. preserva dados locais e remotos sem excluir pastas automaticamente.

Estrutura preferencial:

```text
Borion CNPJ/
├── Sistema/
│   ├── Dados/current.json
│   ├── Backups/ANO/MM - Mês/
│   ├── Histórico/
│   └── Operações/
├── BORION_CNPJ_CURRENT.json
├── Cheques/ANO/MM - Mês/
└── Boletos/ANO/MM - Mês/
```

## Segurança contra perda

Cada alteração é salva primeiro no navegador. O `current.json` é relido depois da gravação para confirmar que o Drive recebeu os registros. Uma pasta vazia não substitui uma base remota com dados. Arquivos antigos e estruturas duplicadas são preservados para recuperação.

## Publicação

Extraia o ZIP e envie todo o conteúdo para a raiz do repositório do GitHub Pages. Não publique Client Secret. O Google Client ID público permanece em `js/config.js`.

## Teste local

Abra o `index.html` da pasta extraída. O login Google pode depender dos endereços autorizados no Google Cloud; a validação definitiva do PWA deve ser feita no domínio publicado.
