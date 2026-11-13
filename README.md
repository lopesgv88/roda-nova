# Roda Nova

App mobile (Expo / React Native) que pinta rodas de carros com IA + biblioteca inteligente de trabalhos feitos.

```
app/     app mobile (Expo Router, TypeScript)
server/  API (Fastify + SQLite) – guarda a chave da IA, a guarda de escopo e a biblioteca
```

> Para publicar nas lojas, siga o passo a passo em [`docs/PUBLICAR.md`](docs/PUBLICAR.md). Textos de loja em [`docs/LOJA.md`](docs/LOJA.md).

## Rodar

### 1. Servidor
```bash
cd server
copy .env.example .env      # edite JWT_SECRET, IMAGE_PROVIDER e a chave da IA
npm run dev
```
- `IMAGE_PROVIDER=mock` devolve a própria foto (só para testar o fluxo do app sem chave).
- `IMAGE_PROVIDER=gemini` + `GEMINI_API_KEY=...` ou `IMAGE_PROVIDER=openai` + `OPENAI_API_KEY=...` para IA de verdade.
- Dados ficam em `server/data/` (SQLite + fotos). Em produção, hospede o servidor com HTTPS e troque o `JWT_SECRET`.

### 2. App
```bash
cd app
npx expo start
```
Abra no celular com o Expo Go (mesma rede Wi-Fi do PC). O app acha o servidor sozinho em `http://<IP-do-PC>:3000`; para outro endereço defina `EXPO_PUBLIC_API_URL`.

> **Voz:** o botão de microfone usa `expo-speech-recognition` (módulo nativo). No Expo Go ele não existe; use um development build: `npx expo run:android` (ou `eas build --profile development`). Sem ele, a busca por texto continua funcionando.

## Como funciona
- **Estúdio**: foto + cor + acabamento + detalhes → `POST /ai/wheel-paint`.
- **Guarda de escopo** (`server/src/scope.ts`): filtro de texto + classificador de visão. Se a foto não é carro, não mostra roda ou o pedido não é sobre pintura de roda, responde 422 com aviso e **não gera imagem**. O gerador usa um prompt rígido (só altera as rodas).
- **Biblioteca**: ao adicionar, pergunta modelo, ano e cor pintada. A busca ("civic 2018", "hb 20", "vw gol preto") entende apelidos, ano e cor (`server/src/cars.ts`). Por voz, o texto reconhecido cai na mesma busca.
- **Trocar a IA**: implemente `ImageProvider` (`server/src/providers/types.ts`) e registre em `providers/index.ts`.

## Testes
```bash
cd server && npm test
```
Cobrem a recusa de fotos/pedidos fora de escopo (sem chamar o gerador), o fluxo gerar → salvar → buscar e o parser de nomes de carros.

## Limitações conhecidas
- A qualidade da pintura depende do provedor/modelo escolhido; só dá para avaliar com chave real.
- Fotos são servidas por URL com nome aleatório (sem login); para dados sensíveis, mova para storage privado com URLs assinadas.
