## Causa raiz da regressão no navegador

Comparação entre a versão atual de `src/pages/driver/DriverValidate.tsx` e a última versão funcional (`cdb9abed`), função `startCamera`:

1. **Timeout reduzido de 15s → 8s aplicado diretamente sobre `getUserMedia`** (`GET_USER_MEDIA_TIMEOUT_MS = 8000`, linha 160). No navegador, enquanto o diálogo nativo de permissão está aberto a promessa fica pendente por design. Se o usuário demora mais de 8s para tocar em "Permitir", o `Promise.race` rejeita com `TimeoutError`.
2. **Stream tardio descartado**: quando o timeout dispara, o `.then` marca `timedOut` e faz `lateStream.getTracks().forEach(stop)`. Ou seja, mesmo que o usuário autorize depois, o stream válido é destruído e a tela fica em erro.
3. **Segunda tentativa dispara novo `getUserMedia`** enquanto a primeira ainda está pendente no navegador — Chrome/Safari tratam isso mal (segunda solicitação enfileirada/negada), agravando a falha.
4. **Interrupção do fallback por user-agent** (`pendingInWebView`) — regra correta em WebView, mas a detecção `Android && !Chrome/` pode classificar navegadores legítimos como WebView e abortar o fallback.
5. **Faltam etapas de prontidão do vídeo**: `video.play()` é chamado logo após `srcObject`, sem aguardar `loadedmetadata` nem validar `videoWidth/videoHeight > 0`. Em alguns navegadores `play()` rejeita com `AbortError`, caindo no `catch` e derrubando todo o fluxo.

Nada disso é do WebView: são mudanças que passaram a valer também no navegador.

## Comportamento que será restaurado

Fluxo do navegador volta a ser o da versão funcional, sem timeout que cancele a solicitação:

- clique em "Abrir câmera" → `getUserMedia` com `facingMode: environment`;
- aguarda o retorno **real** da promessa (sem corrida com timeout que rejeite e descarte o stream);
- fallback para `video: true` apenas quando a primeira tentativa **rejeitar de fato**;
- `srcObject` → aguarda `loadedmetadata` → `video.play()` (com `catch` tolerante) → confirma track `live` e `videoWidth/videoHeight > 0`;
- inicia o scanner (BarcodeDetector, fallback jsQR — inalterados);
- em erro, libera a trava e permite "Tentar novamente".

## Trechos revertidos

Em `src/pages/driver/DriverValidate.tsx`, apenas dentro de `startCamera` e constantes correlatas:

- remover `GET_USER_MEDIA_TIMEOUT_MS` como timeout de rejeição do `getUserMedia`;
- remover o descarte do stream tardio;
- remover `pendingInWebView` como interruptor do fallback;
- remover a dependência do user-agent para decidir o fluxo.

## Proteções mantidas / novas (mínimas)

- `initInProgressRef` impedindo inicializações simultâneas;
- `stopCurrentStream()` antes de abrir novo stream e no unmount;
- liberação da trava no `finally`;
- `timeline` de diagnóstico e painel de debug (apenas registro, nunca decisão de fluxo);
- validação manual, rota `/validador` e `/validador/embarque` intocadas;
- **watchdog visual (não cancelador)**: após 12s sem resposta, a tela sai do estado "abrindo…", exibe mensagem e mantém "Tentar novamente" — mas a promessa original continua viva e, se resolver depois, o stream é aceito e a câmera liga normalmente.
- **mensagem específica do WebInto**: exibida somente quando o watchdog disparar **e** o user-agent contiver `Dalvik` ou `; wv)` (detecção estrita; `Android sem Chrome/` deixa de contar). Fora disso, mensagem genérica de erro. O texto é apenas cosmético — não altera o fluxo.

## Detalhes técnicos

- Arquivo alterado: `src/pages/driver/DriverValidate.tsx` (somente `startCamera`, `detectCameraEnvironment` e a constante de timeout).
- Nova função interna `attachStream(video, stream)`: `srcObject` → `await once('loadedmetadata')` com guarda de 5s → `await video.play().catch(...)` → verifica `videoWidth/videoHeight`.
- Sem mudanças em banco, RLS, vendas, embarque, rotas, biblioteca de QR ou validação manual.

## Testes

Playwright em `localhost:8080/validador/validar` com câmera fake do Chromium (`--use-fake-device-for-media-stream`) para validar: permissão concedida, permissão negada, "Tentar novamente", dimensões reais do vídeo e ausência de erro no console. Cenários com prompt real e WebInto exigem validação no aparelho.
