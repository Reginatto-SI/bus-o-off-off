
Plano de correção (focado e mínimo) para a tela preta em `/motorista/validar`

1) Diagnóstico consolidado (causa mais provável)
- O fluxo atual marca `cameraReady=true` mesmo quando `video.play()` falha.
- Pelo comportamento visto (overlay “Aponte a câmera...” aparece, mas preview preto), a UI entra em estado de “câmera pronta” sem confirmar que há frame real no `<video>`.
- Também faltam retomada robusta ao voltar da aba/PWA e retry de inicialização em mobile.

2) Arquivo a ajustar
- `src/pages/driver/DriverValidate.tsx` (apenas este, sem refatoração ampla).

3) Correção técnica proposta (mínima e segura)
- Extrair inicialização para `startCamera()` com fluxo explícito:
  - limpar stream anterior antes de abrir novo;
  - tentar constraints em cadeia (traseira ideal → fallback sem `facingMode`);
  - associar `video.srcObject`;
  - aguardar `loadedmetadata` + `play()` com timeout;
  - só então setar `cameraReady=true`.
- Não “engolir” erro de `play()`:
  - se falhar, manter `cameraReady=false`;
  - exibir `cameraError` claro;
  - preservar fallback manual por token.
- Validar frame real:
  - confirmar `videoWidth/videoHeight > 0` após metadata/play (evita falso positivo de “ready” com preview preto).
- Ciclo de vida mobile/PWA:
  - adicionar listener de `visibilitychange` para reabrir câmera ao retornar ao app;
  - garantir cleanup completo (interval + tracks + listeners) ao sair da tela.
- Manter leitura QR e fallback manual exatamente como estão (sem trocar arquitetura de scanner).

4) Ajuste de UX mínimo
- Em caso de erro de câmera, mostrar botão “Tentar novamente” (reinicializa `startCamera()`), sem alterar layout estrutural.
- Continuar exibindo campo de token manual sempre disponível.

5) Comentários no código (obrigatórios)
- Explicar:
  - diferença entre “stream criado” e “preview realmente pronto”;
  - por que `cameraReady` só deve subir após metadata/play/frame;
  - estratégia de fallback de câmera traseira;
  - motivo do cleanup e da retomada ao voltar da aba.

6) Validação final (fluxo real)
- Cenário A: conceder permissão → preview aparece e QR lê.
- Cenário B: sair/voltar para `/motorista/validar` → stream reinicia sem tela preta.
- Cenário C: negar permissão/erro de device → mensagem clara + token manual funcional.
- Cenário D: colar token manual → validação RPC segue funcionando.
