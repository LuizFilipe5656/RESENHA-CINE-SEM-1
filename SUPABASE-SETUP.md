# Hospedar contas e painel no Supabase

O servidor de contas roda como uma Supabase Edge Function e guarda logins, sessões, vencimentos e opções do app no banco de dados Supabase. O computador do usuário ou do administrador não precisa hospedar o backend nem ficar ligado. O painel continua sendo um aplicativo separado, mas suas operações administrativas são autenticadas no servidor online.

## 1. Criar e vincular o projeto Supabase

1. Crie um projeto em [supabase.com/dashboard](https://supabase.com/dashboard) e guarde a senha do banco em local seguro.
2. Na pasta do projeto, abra PowerShell e autentique a CLI:

   ```powershell
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref SEU_PROJECT_REF
   ```

   O `project ref` aparece na URL do projeto no dashboard.

3. Envie o esquema do banco:

   ```powershell
   pnpm dlx supabase db push
   ```

4. Gere uma chave aleatória de configuração inicial para o primeiro administrador e cadastre-a como segredo da Edge Function. Guarde-a temporariamente para digitá-la na primeira abertura do painel:

   ```powershell
   $setupKey = node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   pnpm dlx supabase secrets set "CINE_ADMIN_SETUP_KEY=$setupKey"
   Write-Output $setupKey
   ```

5. Publique a API:

   ```powershell
   pnpm dlx supabase functions deploy cine-api --no-verify-jwt
   ```

   A função usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` configurados no ambiente de funções do Supabase. A chave `service_role` nunca deve ser copiada para o app, o painel, `.env` ou GitHub.

## 2. Configurar e gerar os instaladores

1. No dashboard, abra **Project Settings → API** e copie a **Project URL** e a chave pública **Publishable** (ou a chave legada **anon**).
2. Copie o exemplo:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

3. Preencha `.env` com os valores públicos do seu projeto:

   ```dotenv
   CINE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
   CINE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_PUBLISHABLE_OU_ANON
   ```

   `.env` está ignorado pelo Git. A chave publishable/anon é destinada ao cliente; as tabelas não permitem acesso direto público e as operações passam pela Edge Function.

4. Execute `build.bat`. Ele gera:

   - `build\instaladores\usuarios\Cine-Resenha-Usuarios-Setup.exe`
   - `build\instaladores\painel-admin\Cine-Resenha-Painel-Admin-Setup.exe`

   O build valida que a URL e a chave pública foram configuradas antes de criar instaladores, para não distribuir um app sem backend.

No painel, defina a senha e a validade de cada usuário comum ao criar o login. A validade padrão é de 30 dias e pode ser ajustada em dias, semanas, meses ou anos. Qualquer conta com acesso ao painel vê a opção **Admin**; quando marcada, a conta fica sem vencimento e o mesmo login funciona tanto no app quanto no painel. A credencial principal `jhow` também funciona no app. O administrador principal pode suspender, editar o usuário, redefinir a senha, encerrar sessões e excluir outras contas admin criadas no painel; por segurança, senhas antigas não podem ser reveladas, apenas redefinidas. Outros administradores podem criar contas admin, mas apenas `jhow` pode gerenciar as contas administrativas existentes. Contas comuns permanentes que já existiam quando a nova migration for aplicada recebem 30 dias de validade a partir da aplicação, para não interromper o acesso de imediato.

Na opção **Manutenção** do painel, você pode ativar uma tela que bloqueia a entrada no app para todos os usuários, definir a mensagem exibida e desativá-la quando terminar. O app atualiza esse estado automaticamente.

## 3. Configurar o primeiro administrador

1. Instale o painel admin e abra-o em qualquer computador com internet.
2. Na primeira abertura, informe o nome de usuário e uma senha forte com pelo menos 12 caracteres, além da chave `CINE_ADMIN_SETUP_KEY` que foi gerada e cadastrada no passo 1.
3. Depois que o administrador for criado, a chave de configuração não é mais aceita. Remova-a do ambiente do Supabase:

   ```powershell
   pnpm dlx supabase secrets unset CINE_ADMIN_SETUP_KEY
   ```

4. Instale o app de usuários nos outros computadores. Os usuários entram com os logins criados no painel.

## 4. Publicar instaladores no GitHub

O GitHub distribui o código e os instaladores; a API de contas fica no Supabase. Crie um repositório privado ou público conforme sua preferência, não envie `.env`, a chave `service_role`, a chave de configuração inicial, nem cópias dos arquivos locais de contas. Publique os instaladores em uma GitHub Release para os outros computadores baixarem.

Para publicar mudanças no backend depois de uma alteração no esquema ou na função:

```powershell
pnpm dlx supabase db push
pnpm dlx supabase functions deploy cine-api --no-verify-jwt
```

Se os arquivos do app ou do painel mudarem, gere e publique novos instaladores também.

## Dados que já estavam no servidor local

Os logins que existem no arquivo `%APPDATA%\Cine Resenha Local Server\accounts.json` não são enviados automaticamente ao projeto online. Mantenha uma cópia privada desse arquivo e recrie as contas no painel conectado ao Supabase; gere novas senhas para os usuários. A configuração administrativa local antiga também não é transferida.

## Segurança e manutenção

- A chave `service_role` só deve existir nos segredos gerenciados do Supabase; nunca a inclua nos builds ou no repositório.
- A chave de configuração do primeiro administrador é temporária: remova-a depois de criar o administrador.
- Mantenha backups do projeto e teste a recuperação antes de depender do sistema para dados importantes.
- Use senha exclusiva e forte para o projeto Supabase e para o painel admin.
