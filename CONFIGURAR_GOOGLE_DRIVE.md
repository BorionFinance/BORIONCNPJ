# Configurar login Google e Drive

O sistema pode ser testado sem Google pelo botão **Testar em modo local**. Para você e seu pai acessarem os mesmos dados, faça a configuração abaixo.

## 1. Criar o projeto no Google Cloud

1. Entre em `https://console.cloud.google.com/`.
2. Crie um projeto, por exemplo **Borion CNPJ**.
3. Abra **APIs e serviços > Biblioteca**.
4. Ative a **Google Drive API**.
5. Abra **APIs e serviços > Tela de consentimento OAuth**.
6. Selecione **Externo**.
7. Enquanto estiver em modo de teste, adicione seu e-mail e o e-mail do seu pai como **usuários de teste**.

## 2. Criar o Client ID

1. Abra **APIs e serviços > Credenciais**.
2. Clique em **Criar credenciais > ID do cliente OAuth**.
3. Escolha **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione o endereço do GitHub Pages sem barra no final. Exemplo:

```text
https://seuusuario.github.io
```

Se o site estiver em domínio próprio, adicione também:

```text
https://seudominio.com.br
```

5. Copie o Client ID terminado em `.apps.googleusercontent.com`.

## 3. Colocar o Client ID no Borion

Há duas formas:

### Pela tela do sistema

Abra o site, clique em **Configurar Google e pasta do Drive**, cole o Client ID e salve.

### Pelo arquivo

Edite `js/config.js` antes de subir:

```js
window.BORION_CONFIG = {
  googleClientId: 'COLE-AQUI.apps.googleusercontent.com'
};
```

O Client ID é público por natureza. Ele não é uma senha.

## 4. Definir a pasta da empresa

Seu pai pode criar uma pasta chamada **Borion CNPJ** no Drive e compartilhar com sua conta como **Editor**.

Depois, copie o link da pasta e cole em:

**Configurações > Pasta oficial no Google Drive**

O sistema salva o ID da pasta e cria automaticamente:

- Cheques por ano e mês;
- Boletos por ano e mês;
- Sistema e backups.

## 5. Compartilhar a chave da equipe

No primeiro computador:

1. Entre no Borion.
2. Abra **Backup**.
3. Clique em **Exportar chave da equipe**.
4. Leve esse arquivo ao computador do seu pai por pendrive ou outro meio seguro.

No computador do seu pai:

1. Abra o mesmo site.
2. Entre primeiro em modo local.
3. Abra **Backup > Importar chave da equipe**.
4. Selecione o arquivo exportado.
5. Depois entre com a conta Google dele.

Sem a mesma chave, o segundo computador não consegue abrir os arquivos criptografados.

## Observações

- A conta usada precisa ter acesso à pasta compartilhada.
- Durante o modo de teste do Google Cloud, somente os e-mails cadastrados como usuários de teste conseguem entrar.
- O navegador pode solicitar novamente a autorização do Google depois de algum tempo.
