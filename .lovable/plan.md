

## Correção: Seleção de câmera traseira por deviceId com validação de stream

### Diagnóstico confirmado

O debug mostra que `facingMode: environment` seleciona `camera 2, facing back` que retorna track `ended` e resolução `2x2`. Existe `camera 0, facing back` disponível que nunca é testada porque a primeira constraint não lança erro.

### Mudança principal (arquivo único: `DriverValidate.tsx`)

Substituir a lógica de seleção de câmera (linhas 253-294) por um fluxo em duas fases:

**Fase 1 — Tentar câmeras traseiras por deviceId**

1. `enumerateDevices()` para listar todos `videoinput`
2. Filtrar câmeras traseiras (label contendo `back`/`rear`/`environment`/`traseira`)
3. Para cada uma, em sequência:
   - Abrir stream com `{ video: { deviceId: { exact: id } } }`
   - Bind no `<video>`, aguardar `loadedmetadata`, `play()`
   - Validar: track `live` + `videoWidth > 100` + `videoHeight > 100`
   - Se válida: usar essa câmera, parar
   - Se inválida: `stop()` tracks, registrar falha no debug, testar próxima

**Fase 2 — Fallbacks (se nenhuma traseira por deviceId funcionou)**

4. Tentar `facingMode: environment` (pode funcionar em outros dispositivos)
5. Tentar `video: true`
6. Se nada funcionar: erro claro

### Debug panel — campos adicionais

Adicionar ao `DebugInfo` e ao painel:
- `selectedDeviceId`: deviceId da câmera que funcionou
- `candidateBackCameras`: lista de câmeras traseiras encontradas
- `attemptResults`: array com resultado de cada tentativa (`{label, deviceId, result: 'success'|'track_ended'|'no_frames'|'error', detail}`)

O "Copiar log" incluirá esses campos novos.

### Estrutura do código

```typescript
// Nova função auxiliar
async function tryDeviceCamera(
  video: HTMLVideoElement, 
  deviceId: string
): Promise<{ stream: MediaStream; ok: boolean; reason: string }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId } }, audio: false
  });
  video.srcObject = stream;
  // wait metadata + play + validate frames
  // return { stream, ok, reason }
}

// No startCamera:
// 1. enumerate + filter back cameras
// 2. loop tryDeviceCamera for each
// 3. if none work, try facingMode fallbacks
// 4. if still nothing, error
```

### O que NÃO muda

- Nenhuma outra tela ou arquivo
- Fallback manual por token permanece
- BarcodeDetector só inicia após câmera validada (já funciona assim)
- Guard de inicialização (`initInProgressRef`) permanece

