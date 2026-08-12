# Câmera traseira no validador — seleção por dispositivo

## Diagnóstico

O fluxo atual (`src/pages/driver/DriverValidate.tsx`) abre a câmera com uma única chamada:

```text
getUserMedia({ video: { facingMode: { ideal: "environment" } } })
```

`ideal` é apenas uma preferência: o navegador aceita a solicitação, escolhe sozinho qual lente entregar e, em aparelhos Android com múltiplas câmeras traseiras (grande angular / macro / lentes lógicas), pode devolver uma lente que o sistema encerra imediatamente. Isso bate exatamente com o laboratório isolado: a Promise demora ~4,7 s, resolve, `facingMode: environment`, mas `trackReadyState: ended` e `streamActive: false` já no primeiro snapshot. A frontal funciona porque normalmente existe uma única lente frontal, sem ambiguidade de escolha.

Ou seja: não é lifecycle, scanner nem concorrência — é a **estratégia de seleção da lente**, que hoje é delegada ao navegador sem controle.

## Estratégia adotada

Substituir a seleção implícita por `facingMode` por uma seleção explícita de dispositivo, usando apenas APIs padrão:

```text
usuário escolhe traseira/frontal
→ libera totalmente a câmera anterior
→ resolve o deviceId alvo (enumerateDevices, filtrando por facingMode das capabilities)
→ UMA chamada getUserMedia com deviceId exact (ou facingMode exact quando não houver lista)
→ se a track chegar encerrada, o próximo deviceId compatível é tentado (lista finita, sem loop)
→ preview → scanner consome o stream → fechar/trocar libera tudo
```

Pontos da estratégia:

- A enumeração só acontece depois que a permissão já foi concedida uma vez; na primeira abertura o pedido usa `facingMode: { exact: ... }`, que falha de forma explícita em vez de entregar uma lente errada.
- A classificação da lente usa `getCapabilities().facingMode` (dado padrão do navegador), nunca texto do label nem regra por fabricante.
- Uma track que chega `ended` nunca é publicada — isso já existe e é mantido.
- Só há tentativa adicional dentro de uma lista finita e determinística de lentes daquela orientação, na mesma ação do usuário. Nenhum retry automático depois disso, nenhum fallback para a outra orientação, nenhum polling ou watchdog.

Por que é mais confiável: em vez de esperar que o navegador acerte a lente, o sistema escolhe uma lente concreta e verificável, e descarta objetivamente as lentes que o sistema operacional recusa.

## O que será simplificado/removido

- `getCameraConstraints` deixa de usar `ideal` e passa a produzir constraints por `deviceId exact` ou `facingMode exact`.
- Remoção do caminho de constraint genérica que aceitava qualquer lente.
- Nada é duplicado: o cleanup central (`cleanupCamera`), o controle de sessão (`cameraSessionId`), a espera por primeiro quadro (`waitForVideoImage`), a validação de track encerrada e o desacoplamento decoder/hardware permanecem como estão.

## Mensagens ao usuário

Mantidas curtas, sem detalhe técnico. Quando nenhuma lente da orientação escolhida abrir: "Não foi possível abrir a câmera traseira neste aparelho. Tente novamente ou use a câmera frontal." Sem troca automática de câmera.

## Diagnóstico (somente developer)

Preservados sem alteração de acesso: Eruda, logs `[CAMERA]`, "Copiar logs da câmera", diagnóstico isolado e "Copiar resultado". O laboratório isolado passa a usar a mesma estratégia de seleção, para refletir o fluxo real. Nenhuma rota nova.

## Detalhes técnicos

Arquivos alterados:

- `src/pages/driver/DriverValidate.tsx` — seleção de lente, constraints, mensagens de erro e laboratório isolado.
- `src/pages/driver/DriverValidate.test.ts` — novos contratos: constraints por `deviceId exact`, filtro por `facingMode` das capabilities, avanço para a próxima lente quando a track chega encerrada, ausência de fallback cruzado, cleanup antes de troca.

Logs adicionados (sem deviceId completo, apenas índice/quantidade e estado da track): `CAMERA LENS LIST`, `CAMERA LENS TRY`, `CAMERA LENS REJECTED`, além dos existentes.

Nada de backend, RPC, validação de passagens/serviços, permissões ou outras telas é tocado.

## Como testar no Chrome Android

1. Abrir `/validador/validar`, escolher "Câmera frontal" e confirmar preview e leitura de QR.
2. Fechar, escolher "Câmera traseira" e confirmar preview e leitura.
3. Alternar traseira ↔ frontal algumas vezes e confirmar que o indicador de câmera do aparelho apaga entre as trocas.
4. Sair da tela e voltar; abrir de novo.
5. Copiar os logs da câmera e enviar.

Nos logs, esperar: `CAMERA LENS LIST` com a quantidade de lentes traseiras; eventualmente `CAMERA LENS REJECTED` para a lente que chega encerrada; e `CAMERA PREVIEW READY` na lente aceita.
