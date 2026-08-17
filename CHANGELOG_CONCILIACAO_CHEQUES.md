# CHANGELOG — Conciliação Bancária de Cheques

## Versão

**Borion CNPJ 1.0.25**

Esta versão foi construída sobre a base 1.0.24 recebida, sem recriar o aplicativo e sem substituir o mecanismo atual de persistência. A conciliação foi adicionada como uma camada integrada ao fluxo já existente de cheques.

## Escopo implementado

### 1. Conciliação bancária de cheques

Foi criada a área **Conciliação Bancária**, disponível somente no navegador fora do modo PWA instalado. O fluxo é:

1. selecionar/arrastar o extrato;
2. analisar o arquivo;
3. normalizar as movimentações;
4. localizar somente movimentações relacionadas a cheque;
5. cruzar as movimentações com os cheques já cadastrados;
6. apresentar compensados, devolvidos, reapresentados, duplicados, não encontrados e itens que exigem revisão;
7. permitir seleção do que será aplicado;
8. pedir confirmação;
9. somente então atualizar os cheques selecionados.

Selecionar ou analisar um arquivo **não altera** nenhum cheque.

### 2. Formatos de extrato

Implementados:

- OFX;
- CSV;
- TXT estruturado por linhas;
- XLSX;
- PDF com camada de texto pesquisável.

O formato `.xls` legado é rejeitado com orientação para salvar como XLSX, CSV ou OFX.

PDF não usa OCR nesta rotina. Isso é intencional: um PDF escaneado sem texto não é interpretado automaticamente, evitando uma conciliação baseada em reconhecimento frágil.

### 3. Padrões bancários reais adicionados

Foram adicionados testes e interpretação para os exemplos fornecidos no extrato real:

- `14/ago CH COMPENSADO 756 105791 -2.511,00`
- `14/ago CH COMPENSADO 033 105779 -4.500,00`
- `03/ago C - DEV CH105721 CONTR ORDEM 2.370,00`

Nos padrões de compensação, o parser entende que `756` / `033` são informações intermediárias e utiliza o número final de 4–10 dígitos como número do cheque quando apropriado.

No padrão de devolução `DEV CH105721 CONTR ORDEM`, o cheque `105721` é identificado e o motivo exibido como **Contraordem**, mantendo também a linha original do banco para auditoria.

### 4. Correspondência segura

A associação usa como chave principal o **número normalizado do cheque**. Quando disponíveis, também são considerados:

- valor;
- conta/banco;
- tipo de ocorrência;
- data;
- dados estruturados do arquivo.

Zeros à esquerda são normalizados para comparação, sem criar correspondências aproximadas perigosas.

Se houver mais de um candidato, diferença de valor ou tipo bancário não determinado, o item vai para **Revisão necessária**. Nenhuma escolha aleatória é feita.

Movimentação de um cheque que não existe no sistema é exibida como **não encontrada** e não cria um cheque automaticamente.

### 5. Compensação

Ao aplicar uma compensação aprovada, são registrados:

- status/situação bancária `Compensado`;
- data de compensação vinda do banco;
- data/hora da última conciliação;
- ID da conciliação de origem;
- evento no histórico do cheque;
- linha original do banco;
- chave do evento bancário;
- auditoria do status anterior para o novo.

A data do extrato é usada como data bancária; a data de importação não substitui a data real de compensação.

### 6. Devolução

Ao aplicar uma devolução aprovada, são registrados:

- status/situação bancária `Devolvido`;
- data da devolução;
- motivo interpretado, quando presente;
- código do motivo, quando presente;
- descrição original do banco;
- conciliação de origem;
- evento de devolução no histórico;
- início da regularização como `Em cobrança` quando ainda não havia situação anterior.

Quando não existe motivo confiável, o sistema usa **Motivo não identificado** em vez de inventar uma causa.

### 7. Regularização do cheque devolvido

No visualizador do cheque foi incluída a ação **Registrar regularização** com opções:

- Pix;
- Transferência;
- Dinheiro;
- Novo cheque;
- Reapresentação do mesmo cheque;
- Outro.

Também são registrados data, valor recebido e observação.

Dois estados foram mantidos independentes:

- **pagamento recebido**;
- **cheque físico recuperado**.

Assim, um cheque pode ficar corretamente como **Pago por outro meio** e ainda aparecer como **Aguardando recuperar cheque**.

Há ações para marcar o cheque físico como recuperado e, quando pagamento + recuperação física estiverem concluídos, encerrar a ocorrência.

### 8. Reapresentação

Foi adicionado suporte ao estado `Reapresentado`. Uma compensação posterior preserva os eventos anteriores; o histórico pode registrar:

`Devolvido → Reapresentado → Compensado após reapresentação`.

Quando um único extrato contém mais de um evento para o mesmo cheque, os itens selecionados são aplicados em ordem cronológica para preservar a sequência correta do ciclo de vida.

### 9. Histórico e auditoria

Foi adicionada a coleção `conciliacoes` ao estado persistido. Cada conciliação guarda, entre outros dados:

- ID;
- data/hora;
- arquivo;
- hash do arquivo;
- tamanho;
- banco/conta quando disponíveis;
- período;
- total de movimentos;
- movimentos relevantes;
- eventos aplicados;
- usuário.

Cada evento aplicado preserva:

- cheque;
- número;
- tipo;
- data bancária;
- valor;
- linha original;
- motivo/código;
- status anterior;
- status posterior;
- chave idempotente do evento.

O cheque também recebe `historicoEventos`, sem apagar eventos anteriores.

### 10. Proteção contra duplicação

A prevenção é feita em dois níveis:

1. **hash do arquivo**, para informar que o arquivo já foi analisado;
2. **chave idempotente do evento bancário**, para impedir que a mesma ocorrência seja aplicada novamente mesmo quando vier em outro arquivo/formato.

A chave do evento não depende do nome do arquivo, FITID ou texto exato do histórico. Depois que a correspondência segura é resolvida, ela usa data, ID interno do cheque, valor absoluto e tipo do evento. Isso evita que uma exportação do mesmo evento em OFX e depois CSV gere histórico duplicado e, ao mesmo tempo, não mistura cheques de contas diferentes que possam ter o mesmo número.

### 11. Painel de pendências, filtros e pesquisa

A área de cheques recebeu um resumo discreto de pendências no desktop, seguindo os componentes existentes.

Foram acrescentados filtros lógicos para:

- Em cobrança;
- Pago por outro meio;
- Aguardando recuperar cheque;
- Cheque recuperado;
- Encerrado.

A pesquisa passou a considerar também situação bancária, regularização, tipo de regularização, motivo/código de devolução e datas de compensação/devolução.

### 12. Correção da lista longa de cheques

Foi corrigido o comportamento informado em que, ao editar um cheque no meio/final de uma lista grande e salvar, a lista voltava ao topo.

Antes de abrir a edição, o Borion agora memoriza:

- ID do cheque;
- posição da rolagem da janela;
- posição vertical do contêiner da tabela;
- posição horizontal do contêiner da tabela.

Depois que o salvamento é realmente confirmado pela camada 1.0.24 e a lista é renderizada novamente, essas posições são restauradas. A linha salva recebe apenas um realce visual curto para facilitar a localização.

A mesma proteção de posição é usada na exclusão de um cheque; quando a linha deixa de existir, a região equivalente da lista é mantida.

### 13. Regra específica da PWA

A importação/conciliação por extrato **não foi adicionada ao modo PWA instalado**, conforme solicitado.

No modo PWA:

- o item de navegação `Conciliação` permanece oculto;
- o botão de conciliar extrato não aparece;
- a rota é protegida para não abrir o importador;
- o restante do aplicativo continua usando a mesma versão/cache 1.0.25.

Os campos de cheque resultantes de uma conciliação feita no desktop continuam fazendo parte do estado normal do Borion e podem ser visualizados/sincronizados sem transformar a PWA em um importador de extratos.

## Modelo de dados

Foram reutilizados os campos existentes sempre que possível. Novos dados são adicionados de maneira compatível, sem exigir migração manual dos cheques antigos.

Estruturas/campos adicionais usados quando necessários incluem:

- `conciliacoes`;
- `situacaoBancaria`;
- `dataUltimaConciliacao`;
- `conciliacaoOrigem`;
- `dataDevolucao`;
- `motivoDevolucao`;
- `codigoMotivoDevolucao`;
- `descricaoBancariaDevolucao`;
- `statusRegularizacao`;
- `tipoRegularizacao`;
- `dataRegularizacao`;
- `valorRegularizado`;
- `observacaoRegularizacao`;
- `chequeFisicoRecuperado`;
- `dataRecuperacaoFisica`;
- `ocorrenciaEncerrada`;
- `dataEncerramento`;
- `historicoEventos`.

A migração do estado garante `conciliacoes: []` para bases antigas.

## Arquivos alterados

- `index.html` — navegação/área da conciliação e versão 1.0.25.
- `404.html` — paridade da rota/navegação e versão 1.0.25.
- `js/app.js` — parser, análise, matching, aplicação, histórico, regularização, filtros, pesquisa, idempotência e preservação da posição da lista.
- `js/config.js` — versão 1.0.25.
- `css/cnpj.css` — estilos integrados para conciliação, resultados, pendências e realce pós-salvamento.
- `manifest.webmanifest` — versão/start URL 1.0.25.
- `service-worker.js` — cache 1.0.25.
- `RELEASE.json` — descrição da entrega 1.0.25.
- `README.md` — versão e resumo das novidades.
- `tests/validar-build.js` — validações da camada 1.0.25.

## Arquivo criado

- `tests/testar-conciliacao-v125.js` — testes dos padrões reais do extrato e das proteções centrais.
- `CHANGELOG_CONCILIACAO_CHEQUES.md` — este documento.

## Testes executados

### Testes automatizados

Executados com sucesso:

- `node --check js/app.js`
- `node --check service-worker.js`
- `node tests/testar-conciliacao-v125.js`
- `node tests/testar-edicao-v124.js`
- `node tests/validar-build.js`

O teste da 1.0.25 valida diretamente os três formatos visuais enviados do extrato, incluindo número do cheque, tipo da ocorrência, data, valor e motivo `Contraordem`.

O teste de regressão 1.0.24 continua validando a correção de edição real do número do cheque e as associações de fotos.

### Proteções verificadas no build

- módulo 1.0.25 presente;
- página/rota de conciliação presente;
- parser estruturado presente;
- aplicação condicionada à confirmação;
- bloqueio do importador na PWA;
- memória/restauração da posição da lista;
- versão/cache atualizados.

## Limitações conhecidas e deliberadas

- PDF precisa possuir camada de texto pesquisável. OCR não foi usado para conciliação bancária.
- `.xls` legado não é interpretado; deve ser exportado como `.xlsx`, CSV ou OFX.
- Bancos podem variar os textos do histórico. Padrões desconhecidos são encaminhados para revisão em vez de serem aplicados silenciosamente.
- Uma movimentação cujo número do cheque não existe no Borion não cria cadastro automático.
- Uma divergência de valor bloqueia a aplicação automática daquele item.
- O importador não aparece na PWA instalada, por solicitação específica desta versão.

## Resultado esperado desta versão

No desktop, o operador pode gerar o extrato, importar o arquivo, deixar o Borion localizar somente os cheques relevantes, conferir o resultado e aplicar somente os itens selecionados. Compensações recebem a data bancária real; devoluções preservam motivo e texto original; regularização e recuperação física ficam separadas; eventos anteriores permanecem no histórico; e reimportar o mesmo evento não gera duplicação.

Ao editar um cheque no meio de uma lista longa, salvar não deve mais devolver o usuário ao início da lista.
