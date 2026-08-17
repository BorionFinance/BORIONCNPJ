# CHANGELOG — PROTEÇÃO CONTRA DUPLICIDADE DE CHEQUES

**Borion CNPJ 1.0.26**

## Objetivo

Adicionar uma camada de segurança para detectar quando o mesmo cheque parece ter sido compensado/debitado mais de uma vez no extrato, sem confundir isso com reapresentação normal ou reimportação do mesmo evento.

## Regras implementadas

- O número do cheque continua sendo a identidade principal.
- Valor e conta são usados para reforçar a correspondência.
- Quando o extrato fornece `FITID`/identificador bancário, ele é usado como evidência forte de identidade da transação.
- O mesmo identificador bancário repetido é tratado como repetição do mesmo evento, não como segundo depósito.
- Duas compensações distintas para o mesmo cheque, sem devolução/reapresentação entre elas, geram alerta.
- Se as duas ocorrências têm identificadores bancários diferentes ou datas diferentes, o alerta é classificado como **forte indício**.
- Se não existem identificadores suficientes, o Borion mostra **Revisar duplicidade** e não afirma algo que o extrato não prova.
- Uma sequência `Compensado → Devolvido/Reapresentado → Compensado` é tratada como reapresentação coerente, não como duplicidade.
- Possíveis duplicidades nunca vêm selecionadas para aplicação automática.

## Interface

- Novo painel **Proteção contra duplicidade** dentro da análise do extrato.
- Indicadores: cheques verificados, sem alerta, reapresentações coerentes e possíveis duplicidades.
- Novo filtro **Inconsistências**.
- Novo cartão vermelho/amarelo comparando a ocorrência anterior com a ocorrência atual.
- Ação **Ver ocorrências** para abrir a linha do tempo bancária do cheque.
- O detalhe individual do cheque também mostra o resultado da proteção para o histórico já conciliado.

## Persistência e auditoria

- Eventos aplicados passam a armazenar uma `bankTransactionKey` mais forte.
- Conciliações aplicadas também podem guardar `alertasDuplicidade` detectados na análise.
- Compatibilidade mantida com conciliações 1.0.25 que ainda não possuem a nova chave.

## Segurança

- A análise continua sem alterar cheques.
- Alertas de duplicidade ficam fora da seleção automática.
- O Borion usa linguagem de **possível duplicidade** quando a evidência não é conclusiva.
- O sistema não tenta resolver sozinho uma suspeita bancária.

## PWA

A importação/conciliação de extrato continua oculta e indisponível na versão PWA. Os dados já conciliados continuam compatíveis com a base.

## Correção preservada

A posição da lista de cheques continua sendo restaurada após editar/salvar ou excluir um cheque, evitando voltar ao topo da lista.
