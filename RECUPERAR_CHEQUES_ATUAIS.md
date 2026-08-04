# Recuperar os cheques existentes — versão 1.0.18

Não apague pastas do Google Drive e não limpe o navegador antes de confirmar a recuperação.

A versão 1.0.18 procura automaticamente a base válida, inclusive quando existem:

- várias pastas chamadas `Borion CNPJ`;
- mais de uma pasta `Sistema` ou `Dados`;
- `current.json` em uma estrutura antiga;
- espelho `BORION_CNPJ_CURRENT.json` na raiz;
- cópias como `current (1).json`;
- base antiga `current.json.borion`.

Ao encontrar uma base válida, o aplicativo escolhe a que contém registros reais. Se o Drive não tiver base, mas o computador ainda possuir cheques locais, esses dados ficam preparados para recuperar o arquivo remoto sem apagá-los.
