# Configurar Google Login e Drive

## 1. Criar ou abrir um projeto no Google Cloud

Acesse o Google Cloud Console e selecione o projeto usado pelo Borion.

## 2. Ativar APIs

Ative:

- Google Drive API
- Google People API ou o acesso OpenID já disponível no OAuth

## 3. Configurar a tela de consentimento

Configure o nome do aplicativo como `Borion CNPJ` e adicione as contas de teste enquanto o aplicativo estiver em modo de testes.

## 4. Criar credencial OAuth

Crie um **OAuth Client ID do tipo Aplicativo da Web**.

Adicione em **Origens JavaScript autorizadas**:

```text
https://SEU-USUARIO.github.io
```

Quando o repositório usar domínio próprio, adicione também a origem desse domínio, sem caminho final.

Exemplo:

```text
https://cnpj.borionfinance.com.br
```

## 5. Colocar o Client ID

Abra `js/config.js` e preencha:

```js
googleClientId: '000000000000-xxxxxxxxxxxxxxxx.apps.googleusercontent.com'
```

Não coloque Client Secret no GitHub.

## 6. Primeira entrada

Na primeira entrada com Google, o sistema:

1. solicita acesso ao Drive;
2. procura uma pasta chamada `Borion CNPJ`;
3. cria a pasta quando ela ainda não existe;
4. cria as subpastas de Sistema, Cheques e Boletos;
5. cria `Sistema/Dados/current.json.borion`;
6. salva backups diários criptografados.

## 7. Usar a mesma base com outra conta

Para Pedro e o pai usarem os mesmos dados:

1. a conta proprietária cria a pasta;
2. compartilha a pasta `Borion CNPJ` com a outra conta como **Editor**;
3. no segundo computador, entre com a conta compartilhada;
4. em Configurações, cole o link ou ID da mesma pasta;
5. importe a mesma **chave da equipe** uma única vez.

Sem a mesma chave da equipe, os arquivos criptografados não abrem no segundo computador.
