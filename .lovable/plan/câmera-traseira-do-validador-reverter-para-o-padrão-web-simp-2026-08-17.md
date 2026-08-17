# Câmera traseira do validador — reverter para o padrão web simples

## O que a investigação mostrou

Comparei a versão mais antiga do validador (`git show 9f5d67a0:src/pages/driver/DriverValidate.tsx`) com a atual (`src/pages/driver/DriverValidate.tsx`, 1398 linhas).

Versão antiga, época em que a traseira funcionava no Chrome Android:

```text
getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
→ video.srcObject = stream
→ video.play()
→ pronto
```

Uma chamada, sem enumeração, sem `exact`, sem validação de track, sem espera por dimensões.

Versão atual (linhas 104-148, 214-267, 736-800):

- `getCameraConstraints` usa `facingMode: { exact: ... }`;
- `selectLensDeviceIds` chama `enumerateDevices()` + `getCapabilities().facingMode` antes de cada abertura;
- `buildCameraCandidates` monta uma lista de lentes e `startCamera` percorre essa lista, uma aquisição por lente;
- `acquireCameraSession` rejeita o stream se `track.readyState !== 'live'` e depois exige `videoWidth >= 16` via `waitForVideoImage` (5 s).

Ou seja: a arquitetura de enumeração/`deviceId`/fila — que já havia sido removida — voltou. Ela é a diferença mais relevante entre a versão funcional e a atual, e é ela que produz o `deviceId: { exact: ... }` que aparece no seu log.

Auditoria confirmada no código atual: `getUserMedia` só existe em `DriverValidate.tsx` (fluxo produtivo + laboratório isolado); nenhum outro componente toca em `MediaStream`; o decoder não abre nem fecha câmera.

## Diagnóstico (hipótese, ainda não confirmada no aparelho)

O log mostra `stream.active: false` e `trackReadyState: ended` já no primeiro snapshot, com **4938 ms** até `getUserMedia` resolver, tanto com `facingMode: exact` quanto com `deviceId: exact`. Um atraso desses seguido de track morta é o padrão do Android quando o HAL da câmera traseira **ainda está ocupado** — normalmente pela sessão anterior da mesma página (a frontal, que você testa antes) ou por outro app — e não característica de uma constraint específica. A frontal funciona porque é outra lente, geralmente livre.

Não vou afirmar isso como causa provada. O plano trata as duas frentes: remove a complexidade que comprovadamente divergiu da versão funcional e instrumenta o log para confirmar ou descartar a hipótese de ocupação no seu aparelho.

## O que será feito

1. **Voltar à constraint padrão da versão funcional**: `facingMode: { ideal: 'environment' | 'user' }`, uma única chamada `getUserMedia` por clique. É o que MDN/W3C recomendam para escolher orientação; `exact` só serve para falhar quando a orientação não existe, e `deviceId` transfere para o app uma escolha de lente que o navegador faz melhor.
2. **Remover** `selectLensDeviceIds`, `buildCameraCandidates`, `getDeviceCameraConstraints`, `LENS_RETRYABLE_ERRORS` e o laço de lentes em `startCamera`. Fica uma constraint, uma aquisição, um stream.
3. **Liberação verificável antes de abrir**: `cleanupCamera` continua sendo o único cleanup; a mudança é apenas registrar, em log, o estado das tracks anteriores no momento do encerramento, para sabermos se a lente estava realmente livre quando a traseira foi pedida. Sem sleeps, sem espera artificial, sem retry.
4. **Manter** a rejeição de track já encerrada (`CameraStreamInvalidError`) — sem ela o preview fica preto e mudo. A mensagem ao usuário continua uma frase curta, sem troca automática de câmera.
5. **Laboratório isolado** passa a usar exatamente a mesma constraint simples, para refletir o fluxo real.
6. **Log de homologação** (developer): constraint usada, tempo de aquisição, `stream.active`, `track.readyState`, `facingMode`, dimensões e estado do preview — mais o estado das tracks no cleanup anterior.

## O que não será feito

Sem cadeia de fallbacks, sem retry, loop, polling, watchdog, sleep, fila de câmeras, múltiplos streams, regra por fabricante, manager global ou state machine. A troca frontal/traseira continua 100 % manual.

## Detalhes técnicos

Arquivos alterados:

- `src/pages/driver/DriverValidate.tsx` — constraints, remoção da enumeração/lista de lentes, logs de homologação, laboratório isolado.
- `src/pages/driver/DriverValidate.test.ts` — remover contratos de `deviceId`/lista de lentes; manter e validar: constraint traseira/frontal, aquisição única, cleanup antes da troca nos dois sentidos, ausência de dois streams, unmount encerra tracks, falha do decoder não reinicia câmera, tentativa repetida não acumula stream.

Diagnóstico (Eruda, copiar/limpar logs, diagnóstico isolado, copiar resultado) permanece restrito a developer, sem rota nova. Nada de backend, banco, pagamentos, vendas, relatórios, regras de embarque ou autenticação é tocado.

## Teste físico (Android 10 / Chrome)

Importante para confirmar a hipótese de ocupação:

1. Fechar todos os apps de câmera, recarregar a página **e abrir a TRASEIRA primeiro**, antes de qualquer uso da frontal.
2. Fechar, abrir frontal, fechar, abrir traseira de novo.
3. Copiar os logs da câmera nos dois casos.

Se a traseira funcionar no passo 1 e falhar no passo 3, a causa é liberação/ocupação da lente e tratamos isso na sequência. Se falhar já no passo 1, a causa está na entrega do navegador e o log dirá com qual constraint e em quanto tempo.
