

## Diagnóstico confirmado pela evidência do debug panel

### O que o debug mostra

```text
permission: granted        ← OK
stream: ✅                  ← criou
tracks: 1 — [ended]        ← MORTA — algo matou o stream
videoSize: 2×2              ← NÃO É frame real (nenhuma câmera produz 2×2)
readyState: 4               ← browser diz "tem dados" mas é lixo
cameraReady: ✅             ← FALSO POSITIVO (2 > 0 passa no check)
```

### Duas causas raiz

**Causa 1 — Race condition entre init e visibilitychange**

Quando o Android abre o dialog de permissão da câmera, o browser pode disparar `visibilitychange: hidden`. O handler chama `stopCurrentStream()` ou `startCamera()` em paralelo com a inicialização em andamento. Resultado: uma chamada mata o stream da outra.

```text
1. Effect → startCamera() → getUserMedia() (async, aguardando permissão)
2. Dialog de permissão aparece → visibilitychange:hidden → stopCurrentStream()
3. Permissão concedida → stream criado → bind no video
4. visibilitychange:visible → startCamera() → stopCurrentStream() MATA o stream do passo 3
5. Novo getUserMedia... mas o stream anterior já morreu
```

**Causa 2 — Threshold de frame muito baixo**

O check `videoWidth > 0` aceita 2×2 como "frame real". Isso é um resíduo do elemento `<video>` com CSS de tamanho mínimo, não um frame de câmera. O `cameraReady` vira `true` sem imagem real.

---

### Correção (arquivo único: `DriverValidate.tsx`)

#### Fix 1 — Guard de inicialização com ref
Adicionar `initInProgressRef = useRef(false)`. Se `startCamera` já está rodando, ignorar chamadas subsequentes. Previne a race condition entre effect e visibility handler.

#### Fix 2 — Não matar stream durante inicialização
O handler de `visibilitychange:hidden` só deve chamar `stopCurrentStream()` se `initInProgressRef.current === false`. Se a câmera está sendo inicializada (e.g. dialog de permissão aberto), não interferir.

#### Fix 3 — Threshold de frame realista
Trocar `videoWidth > 0` por `videoWidth > 100 && videoHeight > 100`. Nenhuma câmera real produz menos que 100px. Elimina o falso positivo de 2×2.

#### Fix 4 — Atualizar debug panel com mais dados
- Mostrar `initInProgress` no painel
- Mostrar timestamp do último init
- Mostrar contador de quantas vezes `startCamera` foi chamada
- Mostrar track state em tempo real (não só no momento do init)

#### Fix 5 — Log de visibilitychange
Adicionar log `[CAM] visibilitychange → ${state}, initInProgress=${ref}` para confirmar se o handler está interferindo.

---

### Resumo

- 1 arquivo: `src/pages/driver/DriverValidate.tsx`
- Race condition confirmada por evidência (`tracks: ended` + `videoSize: 2×2`)
- Guard de init + threshold de frame + proteção de visibility
- Debug panel melhorado para validar fix no celular

