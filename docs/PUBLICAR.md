# Como publicar o Roda Nova (passo a passo)

Marque cada item quando terminar. O que está marcado **[eu já fiz]** já está no código.

## 0. Já pronto no código
- [x] **[eu já fiz]** Cadastro com e-mail/senha, aceite de Termos e Privacidade (com data e versão guardadas)
- [x] **[eu já fiz]** Créditos por usuário (3 grátis), planos, saldo, bloqueio quando acaba, devolução se a geração falhar
- [x] **[eu já fiz]** Recuperar senha por código de e-mail (15 min, 5 tentativas)
- [x] **[eu já fiz]** Excluir conta dentro do app (apaga usuário, biblioteca, histórico e fotos)
- [x] **[eu já fiz]** Limites contra abuso: por IP, por usuário e bloqueio de e-mail após 8 senhas erradas
- [x] **[eu já fiz]** Foto reduzida e endireitada antes de ir para a IA (mais rápido e barato)
- [x] **[eu já fiz]** Histórico de imagens, salvar na galeria, compartilhar
- [x] **[eu já fiz]** Servidor se recusa a subir em produção com configuração insegura
- [x] **[eu já fiz]** Dockerfile, `render.yaml`, `eas.json`, textos de loja (`docs/LOJA.md`)
- [x] **[eu já fiz]** Páginas públicas `/privacidade` e `/termos` (as lojas pedem uma URL)

## 1. Contas (só você pode criar)
- [ ] MEI regularizado (confirme com contador se a sua atividade é permitida)
- [ ] Conta **Apple Developer** (~US$ 99/ano): developer.apple.com/programs
- [ ] Conta **Google Play Console** (~US$ 25, uma vez): play.google.com/console
- [ ] Conta **Expo** (já tem: `wheelia`) – gera os apps na nuvem, sem precisar de Mac
- [ ] Hospedagem (Render, Railway ou Fly.io) e um **domínio** (ex.: rodanova.com.br)
- [ ] Serviço de e-mail: **Resend** (resend.com), com o domínio verificado

## 2. Segredos (faça antes de tudo)
- [ ] **Troque todas as chaves que foram coladas no chat** (OpenAI, OpenRouter, Gemini, Inworld) e use só as novas
- [ ] Gere o `JWT_SECRET` de produção:
  ```
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- [ ] Configure um **limite de gasto/alerta** no OpenRouter (Settings → Limits)

## 3. Servidor na nuvem
1. Suba a pasta `server` (o Dockerfile já está pronto). Exemplo com Render: use o `render.yaml` da raiz.
2. **Disco persistente** montado em `/data` (banco e fotos ficam lá; sem disco, tudo some a cada reinício).
3. Variáveis de ambiente: copie de `server/.env.production.example` e preencha.
   Preencha **LEGAL_COMPANY, LEGAL_CNPJ e LEGAL_EMAIL** (aparecem na Política de Privacidade e nos Termos).
4. Aponte o domínio (ex.: `api.rodanova.com.br`) para o serviço e confirme o HTTPS.
5. Teste: abra `https://api.seudominio.com.br/health` (deve mostrar `ok`) e `https://api.seudominio.com.br/privacidade`.
6. **Backup**: copie `/data` (arquivo `wheelai.db` e pasta `uploads`) com frequência (snapshot do disco da hospedagem).

## 4. Pagamento (falta, depende de você)
Hoje o botão "Assinar" mostra "em breve". Para cobrar:
- Compra **dentro do app** (obrigatória nas lojas para créditos/assinaturas de serviço digital): sugiro o **RevenueCat** (revenuecat.com) com App Store / Google Play.
- Crie os produtos (Básico, Pro, Estúdio) nas duas lojas com os mesmos preços de `server/src/plans.ts`.
- Falta ligar o webhook do RevenueCat no servidor para conceder os créditos (a função de conceder plano já existe: veja `/plans/select` em `server/src/app.ts`).
- Na renovação mensal, os créditos do plano devem ser somados de novo (o campo `subscription_until` já existe).

## 5. App
1. Em `app/eas.json`, troque `https://api.SEUDOMINIO.com.br` pelo endereço real da API.
2. Opcional: crie `app/.env` com `EXPO_PUBLIC_SUPPORT_WHATSAPP` e/ou `EXPO_PUBLIC_SUPPORT_EMAIL`.
3. Confirme o nome livre (INPI, App Store, Play) e o identificador `com.rodanova.app` em `app/app.json`.
4. Gere o app (na pasta `app`):
   ```
   npx eas-cli@latest login
   npx eas-cli@latest build --platform android --profile preview
   npx eas-cli@latest build --platform ios --profile preview
   ```
5. Envie para testes: **TestFlight** (iPhone) e **teste fechado** (Android). Depois `build --profile production` e `eas submit`.

## 6. Lojas
- Preencha as fichas com os textos de `docs/LOJA.md` (nome, descrição, palavras-chave, respostas de privacidade).
- Crie uma **conta de demonstração** para os revisores e dê créditos a ela:
  ```
  cd server
  npm run grant -- revisor@seudominio.com.br 100
  ```
  (crie a conta antes pelo app, normalmente). Coloque e-mail e senha nas "notas para o revisor".
- Informe a URL da política de privacidade: `https://api.seudominio.com.br/privacidade`.

## 7. Revisão jurídica
Os textos de **Termos** e **Privacidade** são um rascunho. Peça a um advogado (ou use um modelo revisado) antes de publicar.
