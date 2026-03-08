

## Diagnóstico profundo — Câmera preta no scanner do motorista

### Análise do código atual

O código já usa callback ref (`useState` + `setVideoEl`), constraint chain com fallback, e aguarda `loadedmetadata` + `play()` + polling de `videoWidth`. Estruturalmente está correto. O problema provável está em **detalhes de implementação** que não são visíveis sem dados reais do dispositivo.

### Suspeitas mais fortes (em ordem de probabilidade)

**1. Resolution constraints silenciosamente quebram o stream em Android**
A primeira constraint inclui `width: { ideal: 1280 }, height: { ideal: 720 }`. Alguns Android aceitam a constraint, retornam um stream, mas as tracks ficam com `readyState: 'live'` sem produzir frames. O fallback (`video: true`) nunca roda porque a primeira constraint não lança erro.

**2. `frameConfirmed = false` mas `cameraReady` é setado `true` mesmo assim**
Linhas 254-260: quando o polling não confirma frames, o código apenas loga um warning e segue marcando `cameraReady = true`. A UI mostra o overlay "Aponte a câmera" sobre um preview preto.

**3. Falta de evidência real** — sem dados do dispositivo é impossível confirmar qual etapa falha.

---

### Plano de correção (arquivo único: `DriverValidate.tsx`)

#### Etapa 1 — Painel de diagnóstico temporário

Adicionar um bloco colapsável (toggle) no final da tela que mostre em tempo real:

- `permission`: resultado de `navigator.permissions.query({name:'camera'})`
- `stream`: existe / null
- `tracks`: quantidade, estado (`live`/`ended`), label, deviceId
- `videoWidth × videoHeight`
- `video.readyState`
- `cameraReady` / `cameraError`
- `scannerSupported` (BarcodeDetector disponível?)
- constraint usada (qual da cadeia funcionou)
- último erro capturado

Isto será um `<details>` com `<summary>` discreto tipo "🔧 Debug" no rodapé — não altera o layout principal. Permite diagnosticar no celular real sem console.

#### Etapa 2 — Remover resolution constraints

Mudar a constraint chain para:

```typescript
const CAMERA_CONSTRAINTS_CHAIN: MediaStreamConstraints[] = [
  { video: { facingMode: { ideal: 'environment' } }, audio: false },
  { video: true, audio: false },
];
```

Elimina `width/height` ideal que pode causar stream sem frames em Android.

#### Etapa 3 — Não marcar `cameraReady` sem frames

Quando `frameConfirmed` for `false` após o polling, NÃO marcar `cameraReady = true`. Em vez disso, setar `cameraError` com mensagem e botão "Tentar novamente". Isso evita o falso positivo de "câmera pronta" com tela preta.

#### Etapa 4 — Log estruturado em cada etapa

Adicionar `console.log` com prefixo `[CAM]` em cada ponto crítico:
- antes de `getUserMedia`
- após stream criado (com track info)
- após `srcObject` atribuído
- após `loadedmetadata`
- após `play()`
- resultado do polling de frames
- erro capturado

#### Etapa 5 — Fallback por `enumerateDevices`

Se ambas constraints falharem, tentar `enumerateDevices()` para listar `videoinput` disponíveis e abrir explicitamente pelo `deviceId` da câmera traseira (label contendo "back"/"rear"/"environment").

---

### Resumo

- 1 arquivo modificado: `src/pages/driver/DriverValidate.tsx`
- Painel de debug temporário para diagnóstico em celular real
- Constraints simplificadas (sem resolution)
- `cameraReady` só sobe com frames confirmados
- Fallback extra via `enumerateDevices`
- 0 alterações de banco, 0 edge functions

