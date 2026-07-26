## Diagnóstico (baseado no código e no log enviado)

Análise de `src/pages/driver/DriverValidate.tsx` (linhas 354–490), `index.html` e `vite.config.ts`.

O que o log prova:

- `stream: ❌`, `tracks: 0`, `readyState: 0` → `getUserMedia` nunca resolveu nem rejeitou; só o nosso timeout de 15s disparou (`lastError: TimeoutError`).
- `permission: prompt` → a Permissions API do WebView continua em `prompt` mesmo após o usuário autorizar no diálogo do Android.
- `devices: unnamed []` → `enumerateDevices` retorna dispositivo sem label e sem `deviceId`, ou seja, o WebView nunca concedeu acesso de mídia à página.
- `initInProgress: ⏳ sim` com `tentativas: nenhuma` → o loop ainda estava na 2ª constraint (`video:true`) quando o log foi copiado; `attemptResults` só é gravado no debug no fim do fluxo.
- `userAgent: Dalvik/...` (sem `wv`, sem Chrome) → é WebView embarcado do WebInto.app, não Chrome Android.

Não há nada no projeto bloqueando a câmera: não existe `Permissions-Policy`, nem `allow=`, nem iframe, nem CSP restritiva; o `<video>` já usa `autoPlay muted playsInline`; o fluxo já é disparado por gesto do usuário e já tem fallback de constraints.

**Causa mais provável (a confirmar com os testes abaixo):** em Android WebView, a permissão de câmera do app (manifest/Android) **não basta**. O app nativo precisa implementar `WebChromeClient.onPermissionRequest()` e chamar `request.grant(request.getResources())` para o recurso `VIDEO_CAPTURE`. Sem isso, a promise de `getUserMedia` fica **pendente para sempre** — exatamente o sintoma observado (sem erro, sem stream, permissão travada em `prompt`). Isso é do WebInto.app, não do SmartBus.

## O que será feito no projeto (frontend, mínimo)

Somente em `src/pages/driver/DriverValidate.tsx`:

1. **Detecção de WebView** (`Dalvik`, `; wv`, ausência de `Chrome/` em UA Android) exposta no debug e usada nas mensagens.
2. **Timeout reduzido para 8s por tentativa** (hoje 15s × 2 = até 30s de tela travada) e encerramento imediato do loop quando a 1ª tentativa der `TimeoutError` dentro de WebView — nesse caso a 2ª constraint também ficará pendente.
3. **Diagnóstico passo a passo em tempo real** (`attemptResults` e um novo campo `timeline` gravados a cada etapa, não só no fim):
   - clique no botão → `getUserMedia chamado (constraint X)` → `pendente…` → `timeout 8s` → `fallback iniciado` → `retorno tardio (stream descartado)` → `stream criado` → `vídeo com dimensões WxH`.
   - Marcação explícita `ambiente: WebView Android` vs `navegador`.
4. **Mensagem de erro específica para WebView**: quando houver `TimeoutError` + UA de WebView, exibir texto claro dizendo que o aplicativo não liberou a câmera para a página e orientar (a) validação manual e (b) abrir `/validador/validar` no Chrome para confirmar.
5. **Preservados sem alteração**: botão "Abrir câmera", "Tentar novamente", validação manual, biblioteca de leitura (BarcodeDetector + jsQR), tela e rotas atuais. Nada de banco, RLS, vendas ou embarques.

## Como confirmar que a falha é do WebInto.app

Teste decisivo: abrir a mesma URL `/validador/validar` no **Chrome Android** no mesmo aparelho (SM-S928B).

- Funciona no Chrome e falha no app → bloqueio no WebView do WebInto.app; solução obrigatoriamente do lado nativo (`onPermissionRequest` → `grant`), além da permissão `android.permission.CAMERA`.
- Falha nos dois → volto a investigar o SmartBus.

## Entrega final

Ao concluir, informo: causa, arquivos analisados, arquivo alterado, correção aplicada, testes realizados, o que depende do WebInto.app e o resultado do teste no Chrome.
