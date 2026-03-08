

## Diagnóstico

O log confirma um problema clássico do Android 10 + Chrome: após `tryDeviceCamera` falhar para `camera 2` e fazer `track.stop()`, o hardware fica "travado" temporariamente. Todas as chamadas seguintes (`camera 0`, `facingMode`, `video:true`) falham com **"NotFoundError / Requested device not found"** porque o driver da câmera ainda não liberou o recurso.

## Correção (arquivo único: `DriverValidate.tsx`)

### 1. Delay entre tentativas de câmera

Após parar as tracks de uma câmera que falhou, aguardar **800ms** antes de tentar a próxima. Isso dá tempo ao driver Android para liberar o hardware.

Em `tryDeviceCamera`, após `stream.getTracks().forEach(t => t.stop())`, **não** fazer nada adicional — o delay será no loop chamador.

No loop de `startCamera`, entre cada tentativa falhada:
```typescript
// após result falho
await new Promise(r => setTimeout(r, 800));
```

### 2. Inverter a ordem das câmeras traseiras

Priorizar `camera 0` (normalmente a câmera traseira principal no Android) antes de `camera 2`. Ordenar as candidatas: câmeras com índice menor no label primeiro, ou simplesmente reverter a lista.

```typescript
backCameras.sort((a, b) => {
  const numA = parseInt(a.label.match(/\d+/)?.[0] ?? '99');
  const numB = parseInt(b.label.match(/\d+/)?.[0] ?? '99');
  return numA - numB;
});
```

### 3. Fallback alternativo: abrir stream genérico antes de testar deviceIds

Se o loop por deviceId falhar totalmente, antes dos fallbacks atuais, tentar uma abordagem diferente: abrir `facingMode: environment` **sem** ter parado nenhum stream antes (fresh request). Para isso, mover os fallbacks para fora do bloco try/catch principal, com um delay de 1s.

### 4. Adicionar ao debug: ordem testada e delays

Registrar a ordem final das câmeras candidatas e indicar os delays aplicados.

### Resumo das mudanças

- `tryDeviceCamera`: sem alteração
- Loop em `startCamera`:
  - Ordenar `backCameras` pelo número no label (menor primeiro)
  - Adicionar `await sleep(800)` entre tentativas falhadas
  - Adicionar `await sleep(1000)` antes dos fallbacks de fase 2/3
- Debug: registrar ordem final

