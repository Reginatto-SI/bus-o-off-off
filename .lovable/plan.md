
# Correção da câmera em `/validador/validar`

## 1. Causa provável identificada (confirmada por leitura de código)

O diagnóstico do seu prompt está correto: alguém encerra a track logo depois do `getUserMedia`. O ponto exato é uma combinação de dois trechos em `src/pages/driver/DriverValidate.tsx`:

1. **Guarda de autenticação desmonta a tela inteira** (linha ~774):
```text
if (loading) return <Loader2 />;
```
`AuthContext` volta a `setLoading(true)` dentro de `onAuthStateChange` (linha 256 de `src/contexts/AuthContext.tsx`). No Android, o diálogo de permissão manda a página para background; ao voltar, o Supabase dispara `TOKEN_REFRESHED`/`SIGNED_IN` → `loading = true` → a árvore inteira é substituída pelo loader → o `<video>` é **desmontado**.

2. **Cleanup do efeito mata o stream** (linhas 605-609):
```text
useEffect(() => { if (!videoEl) return; return () => stopCurrentStream(); }, [videoEl, stopCurrentStream]);
```
Ao desmontar o `<video>`, `setVideoEl(null)` roda o cleanup → `track.stop()`. Quando o `startCamera` (ainda em execução) chega na validação da linha 561, encontra `readyState !== 'live'` e lança `NotReadableError: O stream não possui faixa de vídeo ativa` — exatamente o log apresentado. O `videoSize: 2×2` e `devices: 0` são consequência do elemento novo/remontado, não a causa.

Ou seja: **não é permissão, HTTPS, facingMode nem scanner** — é remontagem do componente durante a inicialização.

## 2. Correção mínima proposta (somente câmera, em 1 arquivo)

`src/pages/driver/DriverValidate.tsx`:

1. **Manter o `<video>` montado durante `loading`**: não retornar cedo por `loading` quando `user` já existe; renderizar o spinner como overlay sobre a mesma árvore. Guardas que realmente saem da tela (`!user`, sem permissão) continuam iguais.
2. **Cleanup só no desmonte real**: trocar o efeito por `useEffect(() => () => stopCurrentStream(), [])` (deps vazias), sem depender de `videoEl`. Re-render nunca mais encerra o stream.
3. **Reanexar o stream ao elemento**: se o `<video>` for recriado por qualquer motivo, um efeito reatribui `streamRef.current` ao novo elemento em vez de reiniciar/parar a câmera.
4. **Guarda de sessão no encerramento**: `stopCurrentStream(motivo)` passa a receber motivo e só encerra o stream se ele pertencer à inicialização atual (`initCountRef`), evitando que uma sessão antiga mate uma nova.
5. **Não falhar imediatamente por track não-live**: se a track não estiver `live`, aguardar curto período (até ~1,5s) e reavaliar; só então erro.
6. **Esperar quadro real** antes de `cameraReady`: `playing`/`canplay` + `requestVideoFrameCallback` quando existir, com fallback ao polling atual de dimensões (limite de 3s). Nada de espera infinita.
7. **`enumerateDevices` não bloqueia nada**: mantido apenas como diagnóstico; lista vazia com stream ativo segue normalmente.
8. **`visibilitychange`**: só encerra quando `hidden` **e** não há init pendente **e** já existe stream pronto (`cameraReady`), evitando o falso "abandono" causado pelo diálogo de permissão.
9. **Mensagens de erro diferenciadas**: permissão negada, câmera ocupada (`NotReadableError`/`TrackStartError`), sem câmera (`NotFoundError`), stream encerrado inesperadamente, navegador sem suporte, WebView sem resposta, falha genérica — sem citar "aplicativo não liberou" quando o ambiente for navegador/PWA.

## 3. Instrumentação temporária (conforme solicitado)

- Para cada track: `initId`, `track.id`, `label`, `readyState`, `muted`, `getSettings()`, timestamp; listeners `ended`, `mute`, `unmute` alimentando a timeline de debug.
- Em todo `stopCurrentStream(reason)`: motivo, `initId` atual, `document.visibilityState`, nº de tracks, `readyState` antes/depois.
- Nada de imagem, conteúdo de QR ou dado pessoal nos logs.

## 4. Riscos

- Baixo/médio, restrito à tela do validador. Risco principal: manter o `<video>` montado durante `loading` altera a ordem de render dessa tela — mitigado mantendo as demais guardas e o overlay de loading.
- Espera por primeiro quadro pode adicionar até ~1s na abertura em aparelhos lentos.

## 5. Fora de escopo (não será tocado)

Banco, RLS, migrations, vendas, embarque, validação de passagens, rotas, engines de leitura (BarcodeDetector/jsQR), validação manual.

## 6. Testes

- Vitest: nenhum teste de câmera existe; a verificação real é manual em desktop Chrome, Chrome Android (permissão já concedida e primeira autorização), PWA Android, Safari/PWA iPhone, permissão negada, câmera ocupada, sair/voltar da tela, rotação, "Tentar novamente" e leitura real de QR.
- O painel de debug da própria tela passa a mostrar exatamente quem e quando encerrou a track.
