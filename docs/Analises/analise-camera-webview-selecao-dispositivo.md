# Auditoria técnica da seleção de câmera no SmartBus BR

**Data:** 31/07/2026  
**Escopo:** fotografia estática do repositório atual, evidências diagnósticas já versionadas e verificação HTTP das duas origens.  
**Natureza:** investigação e diagnóstico. **Nenhuma correção funcional foi implementada.**

## 1. Resumo executivo

O frontend atual **influencia e, no fluxo normal, escolhe explicitamente a câmera web**. Ele enumera `videoinput`, classifica os labels, monta uma fila e chama `getUserMedia()` serialmente com `deviceId: { exact: <id retornado por MediaDevices> }`. A última traseira previamente aprovada pode ser priorizada por um `deviceId` salvo em `localStorage`; depois vêm as demais traseiras na ordem original de `enumerateDevices()`, dispositivos não classificados e, por último, `{ video: true, audio: false }`. Não há `devices[1]`, `devices[2]`, ordenação numérica nem literal `deviceId: "2"`.

A afirmação “o frontend detecta quatro câmeras e escolhe a câmera nativa 2 primeiro” é, portanto, **rejeitada na forma apresentada**. O código pode tentar primeiro o primeiro item classificado como traseiro (ou a preferência persistida), e um log anterior registra que `facingMode` ideal/exato resolveu para label web `camera 2, facing back`; isso não estabelece que o índice JavaScript era 2 nem que o `deviceId` web corresponde ao ID Camera2 `2`. O mapeamento entre a abstração WebRTC/MediaDevices e câmera lógica/física é feito abaixo do JavaScript pelo Chromium/WebView e pela pilha Android.

A melhor evidência dinâmica já existente é mais importante: no ensaio relatado, o primeiro snapshot após `await getUserMedia()` encontrou a track em `ended`, antes de `streamRef`, `srcObject`, `video.play()` ou scanner. Isso torna cleanup React, `jsQR` e associação ao `<video>` causas improváveis para aquele episódio. As mensagens nativas `notifyError errorCode=4` e falha de características, combinadas à diferença Chrome versus WebView e ao sucesso ocasional da frontal, deixam como **fortemente provável** uma incompatibilidade no caminho Android System WebView ↔ CameraService/Camera2 ↔ câmera lógica traseira multicâmera/HAL Samsung. Ainda não é possível separar WebView de HAL porque **o wrapper Android não existe neste repositório** e não foram fornecidos seus fontes nem um Logcat correlacionado completo.

Há ainda uma inconsistência de domínio concreta, mas não uma causa de câmera comprovada: em 31/07/2026, `https://www.smartbus.com.br/` respondeu `302` para `https://www.smartbusbr.com.br/`, enquanto o domínio antigo respondeu `200`. O frontend também conserva referências ao domínio antigo. Isso contradiz a origem oficial declarada e pode ser bloqueante se o wrapper validar `PermissionRequest.getOrigin()` apenas contra `smartbus.com.br`; porém não há código Android aqui para confirmar tal allowlist. Não se deve atribuir o stream `ended` a essa divergência sem o origin e a decisão de permissão no Logcat.

## 2. Conclusão preliminar

1. **Camada que pede/ordena candidatos:** frontend React (`DriverValidate`).
2. **Biblioteca de QR:** não abre câmera. `BarcodeDetector` ou `jsQR` somente consomem frames do `<video>` depois de `cameraReady`.
3. **Camada que resolve `deviceId` web para hardware:** Chromium/Android System WebView.
4. **Camada hospedeira que deve conceder o recurso web:** `WebChromeClient.onPermissionRequest`; não auditável neste checkout porque o APK/wrapper não está presente.
5. **Camadas que abrem/controlam fisicamente:** CameraService/Camera2 e Camera HAL Samsung.
6. **Causa mais provável do sintoma específico:** interação WebView/pilha nativa com a traseira lógica multicâmera Samsung, não um índice fixo criado pelo frontend. Confiança moderada, pendente dos testes controlados.
7. **Fator frontend relevante, mas não causa fechada:** a fila por label/deviceId pode tentar uma traseira problemática antes de outra; o fallback deveria descartá-la, aguardar 800 ms e continuar. É necessário observar se a falha do HAL contamina as tentativas seguintes no mesmo renderer/processo.

## 3. Arquivos e superfícies investigados

| Área | Arquivos | Resultado |
|---|---|---|
| Fluxo de câmera e QR | `src/pages/driver/DriverValidate.tsx` | Único módulo de produção em `src` com `getUserMedia`, `enumerateDevices`, `srcObject` e `track.stop()` para a tela auditada. |
| Contratos do fluxo | `src/pages/driver/DriverValidate.test.ts` | Confirma serialização, constraints brutas, fila por `deviceId`, preferência e descarte. |
| Entrada/rotas | `src/App.tsx`, `src/pages/driver/DriverHome.tsx` | Rota atual `/validador/validar`; `/motorista/validar` apenas redireciona. |
| Auth/lifecycle React | `src/contexts/AuthContext.tsx` | Refresh de sessão altera `loading`, mas a tela preserva o vídeo quando ainda há usuário; diagnóstico emite eventos no modo debug. |
| Scanner | `package.json`, `DriverValidate.tsx` | `jsqr` é dependência; `BarcodeDetector` nativo é preferido. Nenhum deles solicita stream próprio. |
| Metadados, origem e configuração | `index.html`, `.env`, `vite.config.ts`, `public/robots.txt`, `public/sitemap.xml`, `src/lib/usePageMeta.ts` | Mistura entre domínio novo e antigo; nenhum CSP, service worker próprio, regra CORS de câmera ou variável de URL do wrapper. |
| Backend relacionado a URLs | `supabase/functions/auth-email-hook/index.ts`, `supabase/functions/_shared/auth-email-resend.ts`, `supabase/functions/admin-user-auth-support/index.ts`, `supabase/functions/create-user/index.ts`, `supabase/functions/_shared/runtime-env.ts` | Há fallbacks e classificação de produção com `smartbusbr.com.br`; não participam da aquisição da câmera. |
| Evidência anterior | `docs/Analises/analise-camera-chrome-android-validador.md` | Registra cronologia, snapshot terminal, ensaios brutos e evolução do diagnóstico. O título fala em Chrome; não deve ser tratado como prova de comportamento do wrapper. |
| Android nativo | busca por `AndroidManifest.xml`, `*.kt`, `*.java`, Gradle e diretórios Android | **Ausente.** Manifest, Activity, WebView e callback de permissão não podem ser confirmados ou descartados por este repositório. |

## 4. Mapa completo do fluxo da câmera

### 4.1 Entrada e autorização de tela

1. O usuário navega para `/validador/validar`; o legado `/motorista/validar` redireciona para essa rota.
2. `DriverValidate` lê usuário, role, empresa ativa e fase operacional. Somente `motorista`, `operador`, `gerente` e `developer` permanecem na tela.
3. O `<video>` é renderizado de forma estável, com `autoPlay`, `muted` e `playsInline`. A abertura **não ocorre no mount**; exige clique em “Abrir câmera”.
4. O callback ref registra mount/unmount no modo debug e guarda o nó em `videoEl`.

### 4.2 Inicialização normal

Clique → `startCamera(videoEl)`:

1. `initInProgressRef` bloqueia outro início enquanto uma Promise está pendente.
2. É criado um `initId`; um stream anterior é encerrado com motivo `nova_inicializacao`.
3. Um watchdog de 12 s mostra aviso, mas **não rejeita a Promise, não libera a trava e não dispara fallback**.
4. Confirma contexto seguro/API, consulta `navigator.permissions.query('camera')` apenas para diagnóstico e seleciona engine de decode.
5. Chama `enumerateDevices()` antes da abertura.
6. Se labels/IDs ainda estiverem ocultos, faz um bootstrap único com `{ video: true, audio: false }`, valida quadro, enumera novamente, encerra o bootstrap e aguarda 800 ms.
7. Lê a preferência `smartbus.validator.lastWorkingBackCameraDeviceId` do `localStorage` e monta a fila.
8. Para cada estratégia, em série: chama `getUserMedia`; captura snapshot imediato; valida track; vincula `srcObject`; aguarda `loadedmetadata`/`canplay`; chama `play()` (até duas tentativas); aguarda até 3 s por quadro de pelo menos 16×16.
9. Se inútil, chama `stop()` em todas as tracks, limpa `srcObject`, registra falha, remove a preferência se ela falhou e aguarda 800 ms.
10. No primeiro quadro válido, salva a preferência apenas se a estratégia era classificada como traseira, marca `cameraReady` e inicia o decoder.

### 4.3 Criação, associação e destruição do vídeo

* O `<video>` é criado pelo JSX uma vez na árvore principal e não recebe `key`.
* `video.srcObject = candidate` ocorre somente depois de track inicialmente `live` e vídeo conectado.
* Se o nó for recriado enquanto ainda existe stream, um efeito reanexa `streamRef.current` e tenta `play()`.
* O overlay de resultado é posicionado sobre o vídeo; não substitui nem desmonta o nó.
* Não há listener de `playing` no fluxo normal. Há espera por `loadedmetadata` e `canplay`; dimensões/`readyState` são amostrados.
* No fluxo normal, `ended` é instalado **apenas após o candidato já ter passado a validação** (`afterResolved`). Nos ensaios brutos existem listeners `ended`, `mute` e `unmute` antes do play. Logo um `ended` muito precoce é observado pelo snapshot/estado, mas pode não gerar evento normal dedicado.

### 4.4 Scanner de QR

Após `cameraReady`, um efeito cria intervalo de 300 ms:

* usa `BarcodeDetector.detect(videoEl)` quando disponível;
* caso contrário desenha o frame em canvas e executa `jsQR`;
* após três erros de decode, solicita `startCamera(videoEl)`, mas a trava impede concorrência se uma inicialização ainda estiver aberta;
* ao ler token, chama RPCs de validação. Essas chamadas não alteram constraints nem criam stream.

Não há biblioteca como ZXing/Quagga/Html5Qrcode criando câmera por conta própria.

### 4.5 Cleanup, rota, visibilidade e autenticação

* Desmonte real da tela: `stopCurrentStream('desmontagem_da_tela')`.
* `visibilitychange` para `hidden`: para somente quando não há inicialização e a câmera já está pronta. O prompt de permissão durante init não deveria parar o stream.
* Nova tentativa humana: para o stream anterior antes de adquirir outro.
* Falha da inicialização: para apenas o stream pertencente ao mesmo `initId`; sessão velha não mata sessão nova.
* Auth: refresh com `user` ainda presente não substitui a tela pelo loader; `roleResolvedRef` evita desmontagem por role transitório. `SIGNED_OUT` real ou mudança de rota desmonta e para.
* Não há `onPause`/`onResume` nativo auditável. O comportamento de foco/renderer do WebView permanece desconhecido.

## 5. Constraints exatas

### 5.1 Fluxo normal com dispositivos conhecidos

Para cada traseira ou não classificada escolhida dinamicamente:

```ts
{
  video: { deviceId: { exact: device.deviceId } },
  audio: false
}
```

Não são enviados `width`, `height`, `frameRate`, `aspectRatio`, `advanced` nem `facingMode` nessa fila.

Fallback final:

```ts
{ video: true, audio: false }
```

### 5.2 Bootstrap de autorização

Quando enumeração ainda não expõe label/ID:

```ts
{ video: true, audio: false }
```

Esse stream pode ser a frontal/padrão escolhida pelo WebView. Ele é validado, usado para liberar labels, encerrado e substituído por outra aquisição.

### 5.3 Modos diagnósticos brutos

Disponíveis apenas com `cameraDebug=1&cameraRaw=...`:

```ts
generic = { video: true, audio: false }
ideal   = { video: { facingMode: { ideal: 'environment' } }, audio: false }
exact   = { video: { facingMode: { exact: 'environment' } }, audio: false }
```

Cada modo bruto faz uma única chamada por carregamento, sem fallback. O catálogo `cameraRaw=devices` enumera e cada botão testa exatamente o `deviceId` retornado pela API.

### 5.4 `advanced`

O único `advanced` encontrado é `track.applyConstraints({ advanced: [{ torch: boolean }] })`, executado depois da câmera pronta para ligar/desligar a lanterna. Não participa da seleção inicial.

## 6. Enumeração e seleção de dispositivos

### Respostas objetivas

| Pergunta | Resposta baseada no código |
|---|---|
| Escolhe segunda/terceira câmera por índice? | **Não.** Não há acesso posicional `devices[n]`. |
| Há ordenação? | Há **agrupamento estável**, não `sort`: preferência traseira válida → demais traseiras na ordem de enumeração → não classificadas na ordem de enumeração → `video:true`. Frontais explícitas são excluídas da fila por ID. |
| Há tentativa sequencial? | **Sim**, estritamente serial, até o primeiro quadro válido. |
| Há preferência por label? | **Sim.** Regex multilíngue aceita `back`, `rear`, `environment`, variantes de traseira/trasera e alguns idiomas. Não há preferência especial por `wide`, `ultra`, `telephoto` ou número. |
| Há deviceId persistido? | **Sim**, em `localStorage`; somente após traseira classificada produzir quadro válido. É removido se ausente ou falhar. |
| Há chamada inicial sem seleção? | **Sim**, somente bootstrap se label/ID estiver oculto; e `video:true` é fallback final. |
| Há segunda chamada que substitui a primeira? | Pode haver, mas apenas depois de o bootstrap ou candidato falho ser parado/desvinculado e de uma espera de 800 ms. |
| Há resolução/frame rate rígidos? | **Não.** O código aceita o que a implementação aplicar. |

### Risco real na seleção atual

A regex só conhece orientação, não lente lógica/física. Em aparelhos multicâmera, múltiplos labels podem conter “back”; sem preferência validada, conserva-se a ordem fornecida pelo WebView. Portanto o frontend **pode tentar primeiro** uma traseira que o WebView exponha primeiro e que falhe no S24 Ultra. Isso é diferente de “selecionar índice 2” e deveria ser provado pelo evento `devices:classified`, seguido de `getUserMedia:start`, `immediate_snapshot` e `track.getSettings()`.

## 7. Divisão de responsabilidades

### Frontend

* pede vídeo e desabilita áudio;
* enumera dispositivos e mantém `deviceId` web opaco;
* classifica por label, ordena candidatos e guarda preferência;
* valida stream/quadro, associa ao vídeo, executa fallback e cleanup;
* decodifica QR somente depois do frame.

### Biblioteca de QR

`BarcodeDetector`/`jsQR` recebem pixels do elemento já aberto. Não chamam `getUserMedia`, não enumeram dispositivos e não selecionam lente. Falha anterior ao primeiro frame não é causada pelo decoder.

### Chromium / Android System WebView

* implementa MediaDevices/WebRTC;
* decide o dispositivo padrão de `video:true` e resolve `facingMode`/`deviceId` web;
* traduz a solicitação para a pilha Android;
* administra renderer, permissões por origem e lifecycle do conteúdo web.

### Wrapper Android

Deve declarar a permissão Android, solicitá-la em runtime e responder ao pedido web no `WebChromeClient`. O host concede/nega `RESOURCE_VIDEO_CAPTURE`; ele normalmente não escolhe lente quando apenas executa `request.grant(...)`. Poderia influenciar se injeta JavaScript, muda UA/origem, sobrescreve APIs, recria/pausa o WebView ou filtra recursos.

### CameraService / Camera2 / Camera HAL Samsung

Abrem a câmera lógica, configuram sessão/streams e coordenam lentes físicas. `notifyError errorCode=4` e track terminal são compatíveis com falha abaixo do frontend, mas o trecho de Logcat isolado não identifica sozinho a câmera efetivamente aberta nem a causa do driver.

## 8. Auditoria do wrapper Android: resultado e lacunas

Não há `AndroidManifest.xml`, Activity, Kotlin/Java, Gradle ou módulo Android neste checkout. Assim, ficam **não verificáveis**, e não “corretos por ausência de achado”:

* `android.permission.CAMERA` e `RECORD_AUDIO`;
* `uses-feature`, `android:hardwareAccelerated` e configuração do provider;
* `WebChromeClient.onPermissionRequest`, recursos pedidos, `grant()` na UI thread e `request.getOrigin()`;
* allowlist de `https://www.smartbus.com.br`/`https://www.smartbusbr.com.br`;
* URL passada a `loadUrl`, redirects nativos, intent filters e App Links;
* `onPause`, `onResume`, `onStop`, `onDestroy`, `WebView.onPause/onResume`;
* recriação/destruição do WebView, `onRenderProcessGone`, overlays/splash/foco;
* aceleração, UA customizado, bridge e scripts injetados;
* interceptação/sobrescrita de `getUserMedia` ou `enumerateDevices`.

Checklist mínimo para o repositório do wrapper:

1. declarar `CAMERA`; `RECORD_AUDIO` só é necessário se o produto solicitar áudio (o frontend atual envia `audio:false`);
2. solicitar `CAMERA` em runtime antes de conceder o recurso web;
3. em `onPermissionRequest`, registrar origin e recursos, validar exatamente HTTPS/origem oficial e conceder somente `RESOURCE_VIDEO_CAPTURE` na UI thread;
4. negar explicitamente origens/recursos não esperados;
5. registrar URL final após redirects e `request.getOrigin()`;
6. correlacionar lifecycle/renderer com o `callId` do frontend;
7. confirmar que não há JavaScript injetado nem UA branch alterando MediaDevices.

## 9. Hipótese da câmera nativa ID 2

### Conceitos que não podem ser confundidos

* **Índice JavaScript:** posição transitória em um array. O código não a usa para selecionar.
* **`deviceId` MediaDevices:** string opaca, potencialmente vinculada à origem e implementação; não é contrato Camera2.
* **ID Camera2:** identificador nativo usado por CameraManager/CameraService, frequentemente uma string como `"0"`, `"1"`, `"2"`, mas sem equivalência pública com `deviceId` web.
* **Câmera lógica traseira:** endpoint Camera2 que pode combinar várias câmeras físicas.
* **Lentes físicas:** wide/ultrawide/teleobjetiva associadas a uma lógica; o HAL pode escolher/transicionar entre elas.

### Evidência disponível

O relatório anterior registra que:

* `facingMode` ideal e exato selecionaram o mesmo `deviceId` com label `camera 2, facing back`;
* `video:true` funcionou com a frontal;
* no incidente registrado, o snapshot imediato encontrou track `ended` antes de vínculo ao vídeo;
* não havia `stop()` SmartBus interceptado durante aquela chamada.

Isso prova uma **label web e um resultado terminal**, não o ID Camera2 aberto. A mensagem “Not able to get camera characteristics for camera id 2” pode ocorrer durante enumeração/probing, inclusive sem abertura final. Para provar abertura é preciso correlacionar timestamps e tags de `CameraManagerGlobal`, `CameraService`, `CameraDeviceClient`, PID/UID do WebView e o `callId` frontend.

### Veredito

“O frontend escolhe a câmera nativa ID 2 primeiro”: **descartada pelo código como afirmação determinística**.  
“O WebView resolve a primeira solicitação traseira para uma câmera lógica/endpoint que acaba associado ao texto nativo `2` e falha”: **possível e coerente**, mas ainda não comprovado.

## 10. Domínios, origem e permissão

### Achados no repositório

O domínio oficial novo aparece em sitemap, robots, metadados canônicos e links públicos. O antigo ainda aparece em:

* JSON-LD de organização/site em `index.html`;
* defaults de URLs em funções de autenticação/criação de usuário;
* remetentes `@smartbusbr.com.br` (e-mail não é origem web, mas confirma legado nominal);
* listas que classificam `smartbusbr.com.br` como produção;
* testes e comentários.

Não foram encontrados no checkout:

* CSP (`Content-Security-Policy`) ou `Permissions-Policy` versionada;
* registro de service worker da aplicação. `use-version-check` apenas consulta/desregistra registrations eventualmente existentes;
* manifest web/PWA;
* configuração CORS ligada à câmera;
* callback nativo de permissão ou allowlist de origin.

### Verificação HTTP em 31/07/2026

`curl -sSIL` mostrou:

```text
https://www.smartbus.com.br/   -> HTTP 302 Location: https://www.smartbusbr.com.br/
https://www.smartbusbr.com.br/ -> HTTP 200
```

Logo um wrapper que carrega a URL oficialmente declarada hoje termina, por redirect, na origem antiga. Cookies e permissões web são particionados por origem; a permissão solicitada deve corresponder à origem final que executa `getUserMedia`. Se o wrapper só concede `https://www.smartbus.com.br`, mas `PermissionRequest.getOrigin()` for `https://www.smartbusbr.com.br`, o pedido pode ser negado. Por outro lado, um pedido negado normalmente produz `NotAllowedError`; ele não explica automaticamente uma Promise resolvida com track `ended` e erro HAL.

Não há evidência de iframe ou de `getUserMedia()` em uma terceira origem: a chamada está no bundle principal. CORS não governa acesso local à câmera. Sessão/cookies podem provocar redirect/login e consequente desmonte, mas isso deixaria eventos de rota/auth/cleanup no diagnóstico.

### Correção mínima recomendada para domínio (não aplicada)

1. Tornar `https://www.smartbus.com.br/` o endpoint `200` canônico.
2. Redirecionar permanentemente o legado para o oficial, e não o inverso.
3. Atualizar JSON-LD e defaults web para o oficial.
4. Durante transição, permitir no wrapper **apenas** as duas origens HTTPS explicitamente conhecidas, com log de origin; remover o legado após migração de sessão/links.
5. Não mudar Application ID e não usar permissões amplas (`grant(request.resources)` sem filtro).

## 11. Concorrência e encerramento prematuro

| Cenário | Avaliação |
|---|---|
| Duas chamadas simultâneas | Trava antes do primeiro `await`; orquestrador aguarda cada aquisição/validação. **Improvável no fluxo atual.** |
| Watchdog vence Promise | Apenas muda UI; não rejeita, não chama `finish` e não habilita retry. **Não descarta stream tardio.** |
| Bootstrap + fila | Há duas ou mais chamadas ao longo do tempo, mas bootstrap é parado/desvinculado e há 800 ms antes da próxima. **Sequencial confirmado.** |
| Cleanup durante prompt | Visibility ignora `hidden` enquanto init está pendente. Desmonte/route/sign-out ainda pode parar. **Possível somente com evento observável.** |
| Retry para track falha | Para/desvincula candidato, espera 800 ms e tenta próximo. Um HAL em mau estado pode não se recuperar nesse intervalo. **Possível causa de falhas em cascata.** |
| Scanner reinicializa | Só após câmera pronta e três erros; chama a mesma rotina, respeitando trava e para stream anterior. **Não explica track já terminal no primeiro retorno.** |
| Overlay/loader remove vídeo | Overlay não remove vídeo; refresh auth com usuário preserva árvore. **Improvável.** |
| Background após pronta | Encerra deliberadamente; não existe reinício automático no retorno. Usuário deve abrir novamente. **Comportamento confirmado e potencial diferença operacional no WebView.** |
| Renderer perdido | Não há callback nativo disponível. **Possível; precisa Logcat/onRenderProcessGone.** |

## 12. Chrome versus WebView

No frontend, ambos executam o mesmo `startCamera`. A detecção de WebView usa somente UA `Dalvik` ou `; wv)` para preencher uma mensagem/diagnóstico; comentário e uso confirmam que ela **não decide constraints nem fila**. Não há branch por query string, bridge, Android, PWA/standalone ou wrapper no fluxo normal. Query strings `cameraDebug`/`cameraRaw` são exclusivamente modos diagnósticos explícitos.

Diferenças reais ficam abaixo ou ao redor do bundle:

* Chrome possui seu próprio lifecycle/UI de permissão; WebView depende do `WebChromeClient` do host;
* versões/providers Chromium podem diferir;
* armazenamento/permissão são associados à origem e ao perfil do WebView;
* host pode pausar/recriar renderer, customizar UA ou injetar scripts;
* ambos usam CameraService/HAL, mas podem pedir/configurar sessões diferentes.

O fato de Chrome funcionar e WebView falhar no mesmo aparelho reduz a probabilidade de defeito puramente React e aumenta a do wrapper/provider WebView. Não elimina HAL: uma combinação específica de constraints/cliente WebRTC pode acionar defeito do HAL que a versão do Chrome não aciona.

## 13. Matriz obrigatória de hipóteses

| Hipótese | Classificação | Fundamentação |
|---|---|---|
| Frontend selecionando a câmera errada | **Possível** | Ele prioriza preferência/primeira label traseira e não sabe qual lente lógica é estável; porém tenta outras em série e não escolhe número fixo. |
| Array usando índice incorreto | **Descartada** | Não há acesso posicional; filtros preservam ordem e seleção usa objeto/ID. |
| `deviceId` web confundido com ID Camera2 | **Descartada no código** | O código trata o ID como string opaca e nunca converte para número/`2`; a confusão permanece apenas como risco de interpretação dos logs. |
| Duas chamadas simultâneas | **Improvável** | Trava e laço serial; testes automatizados cobrem Promise pendente. |
| Cleanup encerrando stream válido | **Improvável para o incidente conhecido** | Snapshot já terminal antes de `srcObject`; ownership protege stream novo. Continua possível sob sign-out/rota/background após pronta. |
| Timeout descartando stream tardio | **Descartada** | Watchdog é visual e mantém trava/Promise. Timeout de frame descarta apenas stream já resolvido que não produziu quadro em 3 s. |
| WebView sem `onPermissionRequest` correto | **Possível** | Wrapper ausente. Frontal ocasional e Promise resolvida enfraquecem negação total, mas não excluem grant/lifecycle incorreto. |
| Origem/domínio não autorizado | **Possível** | Redirect oficial→legado é confirmado; allowlist/origin nativos são desconhecidos. Sem log de negação, não é causa provada. |
| Renderer do WebView encerrado | **Possível** | Não há `onRenderProcessGone` auditável nem Logcat correlacionado. |
| Android System WebView × Camera HAL Samsung | **Fortemente provável** | Diferença Chrome/WebView, S24 multicâmera, erro nativo e track terminal precoce convergem; falta matriz de versões para confirmar. |
| Falha específica da câmera lógica traseira multicâmera | **Fortemente provável** | Frontal já funcionou e traseira/facing environment terminou; ainda falta testar individualmente todos os IDs web e Camera2 nativo. |
| Constraints de resolução/frame rate incompatíveis | **Improvável** | Fluxo não exige resolução/frame rate; settings anteriores indicaram 640×480. Pode haver configuração interna do WebView não visível ao JS. |
| `jsQR`/BarcodeDetector abre ou troca câmera | **Descartada** | Engines apenas leem o vídeo após `cameraReady`. |
| Preferência persistida mantém câmera ruim para sempre | **Descartada** | Preferência falha é removida e a fila continua. |
| Primeira traseira falha e deixa CameraService indisponível para a seguinte | **Possível** | Há stop + 800 ms, mas a recuperação do HAL Samsung não está comprovada. |

Nenhuma hipótese de raiz externa pode ser classificada como “confirmada pelo código”; o que é **confirmado pelo código** são os mecanismos (fila por ID web, serialização, persistência, cleanup e redirect/referências de domínio). “Fortemente provável” aqui expressa convergência das evidências, não confirmação do fornecedor culpado.

## 14. Evidências e lacunas diagnósticas

### Já registrável com `cameraDebug=1`

* label, ID web reduzido, classificação e ordem dos dispositivos;
* constraint e `callId` de cada aquisição;
* snapshot imediato com label, estado e `getSettings()` completo;
* `stream.active`, track state, capabilities, dimensões e conectividade do vídeo;
* atribuição/remoção de `srcObject`, metadata, canplay, play e primeiro quadro;
* `ended` pós-sucesso; `mute`/`unmute` nos modos brutos;
* stack de toda chamada JavaScript a `MediaStreamTrack.stop()`;
* auth, visibility, pagehide/pageshow/freeze/resume, mount/unmount.

### Limitações

* IDs são reduzidos no painel em alguns eventos; exportar objeto DevTools expandido para o ID/settings completos.
* O fluxo normal adiciona listener `ended` tarde demais para uma track entregue já terminal; o snapshot imediato é a prova apropriada.
* Não existe telemetria persistida; o operador precisa copiar o diagnóstico.
* Não há versão do provider WebView, pacote/versão do APK, origin nativa nem CameraService client PID no relatório disponível.

## 15. Riscos das possíveis correções

| Correção tentadora | Risco |
|---|---|
| Fixar `deviceId: "0"` ou índice | ID web é opaco/por origem; quebra outros aparelhos e pode selecionar frontal/inexistente. |
| Ocultar câmeras secundárias/reescrever `enumerateDevices` | Mascara hardware, quebra fallback e cria divergência Chrome/WebView. |
| Usar sempre a primeira/última traseira | Ordem não é contrato de estabilidade nem de lente. |
| Retry imediato/infinito | Mantém HAL ocupado, gera prompts/LED, bateria e concorrência. |
| Remover todos os `stop()` | Vaza câmera entre rotas/background e piora disputa do CameraService. |
| Aumentar arbitrariamente resolução/frame rate | Pode agravar incompatibilidade e não há evidência de necessidade. |
| Alterar UA | Pode mudar branches do Chromium/sites, é frágil e não corrige HAL/permissão. |
| Conceder todas as origins/recursos | Vulnerabilidade: qualquer conteúdo navegável no WebView poderia capturar câmera/microfone. |
| Trocar leitor QR | Não atua antes do primeiro frame e adiciona regressão sem tratar raiz. |
| Forçar CameraX dentro do app como correção imediata | Duplica arquitetura/fluxo e muda contrato; deve ser apenas controle diagnóstico primeiro. |

## 16. Proposta de correção mínima, condicionada à prova

Nenhuma alteração deve ser feita antes da matriz abaixo.

1. **Se um `deviceId` traseiro web funcionar isoladamente e outro falhar:** manter seleção dinâmica e promover apenas o ID comprovado pela sessão de teste existente; não usar índice/número. Verificar se a preferência já resolve o cenário antes de mudar algoritmo.
2. **Se o primeiro candidato mata o HAL e o segundo só funciona em novo carregamento:** ajustar apenas política de tentativa/liberação após medir o tempo necessário; evitar fila agressiva, sem esconder dispositivos globalmente.
3. **Se `PermissionRequest` for negado por origin:** consolidar domínio e corrigir allowlist/grant estritamente para `RESOURCE_VIDEO_CAPTURE` na UI thread.
4. **Se renderer/lifecycle parar a câmera:** corrigir apenas o callback nativo comprovado (`onPause`, recriação, overlay ou `onRenderProcessGone`).
5. **Se Stable falhar e Beta funcionar:** registrar versão e atualizar/testar provider suportado; não mudar frontend sem necessidade.
6. **Se CameraX/Camera2 nativo também falhar na mesma traseira:** abrir reprodução Samsung/Android com logs; um workaround web não é causa-raiz.

## 17. Plano de testes controlados

### Protocolo comum

* Mesmo S24 Ultra, mesma carga/bateria e nenhum outro app usando câmera.
* Forçar parada do app entre grupos; dentro do grupo alterar **uma variável por vez**.
* Limpar permissão/storage apenas quando essa for a variável declarada.
* Gravar tela, diagnóstico completo e Logcat de 3 s antes do clique até 5 s após sucesso/falha.
* Registrar origem final, WebView version, APK version e `callId`.

### Matriz web mínima

| Teste | Constraint única | Objetivo |
|---|---|---|
| A | `{ video: true, audio: false }` | Controle padrão/frontal provável. |
| B | `{ video: { facingMode: { ideal: "user" } }, audio: false }` | Isolar frontal. |
| C | `{ video: { facingMode: { ideal: "environment" } }, audio: false }` | Isolar resolução padrão traseira. |
| D | traseira ideal + `width: { ideal: 640 }, height: { ideal: 480 }` | Baixa resolução. |
| E | traseira ideal + `width: { ideal: 1280 }, height: { ideal: 720 }` | 1280×720. |
| F | `video:true`, sem `deviceId` | Confirmar escolha default do provider. |
| G1…Gn | `{ video: { deviceId: { exact: idDaAPI } }, audio:false }` | Um carregamento novo por cada ID retornado pela própria API; registrar label/settings. |

Não misturar `facingMode` e `deviceId` nos testes G. Não reutilizar array/ID coletado em outra origem ou após limpar storage.

### Matriz wrapper/provider

1. Build atual, scripts injetados atuais.
2. Mesmo build sem scripts injetados (se existirem), sem outras mudanças.
3. Mesmo build com UA padrão, se houver UA customizado.
4. Android System WebView Stable, mesma constraint C.
5. Android System WebView Beta, mesma constraint C.
6. Chrome no mesmo aparelho, mesma página/constraint C como controle.
7. Página HTML mínima HTTPS na origem final, fora do React, mesma constraint C.
8. CameraX nativo no mesmo APK e câmera traseira lógica.
9. Camera2 nativo enumerando IDs/lógicas/físicas, abrindo um por execução.

### Critérios de interpretação

* Falha na página mínima WebView, mas sucesso Chrome: provider/wrapper/pilha WebView.
* Falha apenas no SmartBus e stack `stop()`: frontend/lifecycle indicado pela stack.
* `getUserMedia` rejeita antes de stream + origin negada: permissão/allowlist.
* Promise resolve já `ended`, sem stop JS, e Logcat reporta device error: abaixo do JavaScript.
* Camera2/CameraX falha no mesmo endpoint: Samsung HAL/câmera lógica fortemente isolada.
* Beta passa e Stable falha: regressão do provider WebView provável.

## 18. Logcat e dados adicionais necessários

Coletar sem filtro destrutivo e depois recortar por timestamp:

* versão completa de Android System WebView (`dumpsys package com.google.android.webview`, e provider efetivo);
* versão do Chrome, Android, One UI, firmware/baseband e modelo exato;
* pacote/UID/PID do app e PID do renderer/sandbox;
* `adb shell dumpsys media.camera` antes e depois;
* tags `CameraService`, `CameraProviderManager`, `CameraManagerGlobal`, `CameraDeviceClient`, `Camera3-Device`, `Camera3Stream`, `ACamera*`, `chromium`, `cr_*`, `WebView`, `ActivityTaskManager` e `AndroidRuntime`;
* `onPermissionRequest`: timestamp, `getOrigin()`, resources recebidos, decisão, thread e resultado da permissão Android;
* `WebViewClient`: URL inicial/final e cadeia de redirects;
* Activity: `onPause/onResume/onStop/onDestroy`, foco da janela e `onRenderProcessGone`;
* frontend: `callId`, constraints completas, label/deviceId web completo, `getSettings()`/`getCapabilities()`, stream active e track state;
* timestamp de `srcObject_assigned`, `loadedmetadata`, `canplay`, `play`, primeiro frame, `mute`, `unmute`, `ended` e todo `stop()` interceptado;
* Camera2: disponibilidade, características/lens facing/capabilities de cada câmera lógica, physical IDs e ID realmente aberto;
* erro completo anterior e posterior a `notifyError errorCode=4`, não somente a linha isolada.

## 19. Conclusão final

O frontend **não usa o terceiro item nem força Camera2 ID 2**, mas o frontend atual faz seleção ativa por labels e `deviceId` web: preferência traseira validada, demais traseiras na ordem do WebView, não classificadas e fallback default. Portanto ele influencia qual endpoint o WebView tentará, sem controlar a tradução para câmera lógica/física Samsung.

Para o episódio em que a track já apareceu `ended` no primeiro snapshot, cleanup, scanner, vídeo e timeout frontend são causas improváveis. O conjunto “Chrome funciona, WebView falha, frontal às vezes funciona, traseira multicâmera falha e CameraService/HAL emite erro” posiciona a causa mais provavelmente na integração **Android System WebView ↔ CameraService/Camera HAL Samsung**, possivelmente numa câmera lógica traseira específica. O wrapper continua uma variável importante porque concede permissão, controla lifecycle/renderer e hoje pode atravessar um redirect de origem; sem seus fontes não é possível inocentá-lo.

Prioridade diagnóstica: (1) obter wrapper/Manifest/Activity, origin e grant; (2) executar um `deviceId` por carregamento com snapshot/Logcat correlacionado; (3) comparar WebView Stable/Beta; (4) executar CameraX/Camera2 nativo. Somente esses controles permitem decidir entre ajuste mínimo de origem/lifecycle, política de seleção web ou defeito do provider/HAL, preservando o comportamento já funcional no navegador.

