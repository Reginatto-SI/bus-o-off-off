# Análise 68 — Falha de leitura de QR no iPhone na tela `/motorista/validar`

## 1) Resumo executivo

- **Sintoma confirmado:** no iPhone (Safari), a câmera abre com stream ativo, porém sem leitura automática de QR.
- **Evidência de causa raiz:** o fluxo atual depende de `window.BarcodeDetector` para iniciar o scanner. Em Safari iOS, essa API não está disponível, então o estado fica `scannerSupported=false` e o loop de leitura não é iniciado.
- **Por que Android funciona:** em dispositivos/navegadores Android com suporte a `BarcodeDetector`, o detector é instanciado e o loop de leitura roda normalmente.
- **Correção aplicada (mínima):** manter o fluxo existente e adicionar fallback local para `jsQR` apenas quando `BarcodeDetector` não existir. Isso preserva o caminho atual onde já funciona e ativa leitura compatível no iPhone.
- **Melhoria de UX/observabilidade:** mensagens explícitas de estado do scanner, log técnico de erro no loop de decode e tentativa de reinicialização controlada.

---

## 2) Fluxo técnico atual da leitura

1. A tela `/motorista/validar` inicializa câmera via `startCamera`.
2. O fluxo seleciona câmera traseira por `deviceId`, com fallbacks (`facingMode` e `video:true`).
3. Após câmera ativa (`cameraReady=true`), o scanner era condicionado a `window.BarcodeDetector`.
4. O loop de leitura (`setInterval`) só chamava `detector.detect(video)`.
5. Se `BarcodeDetector` estivesse indisponível, o scanner não iniciava, apesar do stream existir.

### Pontos validados no código

- Biblioteca/engine principal de leitura antes da correção: **API nativa `BarcodeDetector`**.
- O debug mostrar `scanner: não disponível` com stream ativo é coerente com o fluxo: câmera e scanner são etapas separadas.
- `playsInline`, `muted` e `autoPlay` já estavam configurados no `<video>`.
- A falha não estava no `getUserMedia` (stream/tamanho/track ok), e sim na **ausência da engine de decode ativa**.

---

## 3) Causa raiz identificada

**Causa raiz primária:** dependência exclusiva de `BarcodeDetector` para leitura automática, sem fallback de decode para Safari iOS.

### Como isso explica os sintomas

- iPhone Safari abre câmera (permissão + stream + track live), mas `window.BarcodeDetector` retorna indisponível.
- Sem detector, o loop de leitura não processa frames.
- Resultado final: usuário vê câmera funcionando, porém “nada acontece” ao apontar para QR.

---

## 4) Arquivos analisados

- `src/pages/driver/DriverValidate.tsx`
- `src/lib/driverPhaseConfig.ts` (mensagens operacionais já existentes)
- `package.json` (dependências do frontend)

---

## 5) Riscos da correção

1. **Performance em aparelhos antigos:** `jsQR` processa frame via canvas; pode exigir ajuste de intervalo se houver queda perceptível de FPS.
2. **Comportamento em baixa luz/QR difícil:** sensibilidade de decode pode variar entre engines (`BarcodeDetector` vs `jsQR`).
3. **Reinicialização após erro:** tentativa de restart no loop foi mantida controlada por mensagem e estado existente para evitar travamento silencioso.

Risco geral considerado **baixo/médio**, com impacto localizado somente na tela de validação do motorista.

---

## 6) Correção mínima proposta (e aplicada)

- Manter arquitetura e fluxo de câmera existentes.
- Adicionar fallback de scanner:
  - usar `BarcodeDetector` quando disponível;
  - usar `jsQR` quando `BarcodeDetector` estiver indisponível (caso típico do Safari iOS).
- Manter um único fluxo de leitura (mesma tela, mesma lógica de validação), mudando apenas a engine de decode.
- Adicionar logs e mensagens de estado para não deixar falhas silenciosas.

---

## 7) Logs e mensagens recomendadas

### Logs técnicos

- `console.warn('[SCAN] BarcodeDetector indisponível; fallback para jsQR ativado.')`
- `console.error('[SCAN] erro no loop de leitura', { engine, message, name })`

### Mensagens de UI

- “Usando modo de leitura compatível com este navegador.”
- “Erro ao iniciar leitura do QR. Tentando reinicializar...”
- “Câmera ativa, mas nenhum QR foi reconhecido ainda.”
- “Leitura indisponível neste navegador. Use o token manual do QR.”

Essas mensagens cobrem indisponibilidade, falha de inicialização e ausência de reconhecimento.

---

## 8) Checklist de validação manual

### iPhone Safari
- [ ] Abrir `/motorista/validar` e conceder permissão de câmera.
- [ ] Confirmar câmera traseira ativa.
- [ ] Confirmar no debug que scanner está `✅ jsqr` quando `BarcodeDetector` não existir.
- [ ] Ler QR válido e confirmar overlay de sucesso.
- [ ] Apontar para QR inválido/inexistente e confirmar feedback de “nenhum QR reconhecido”.

### Android
- [ ] Abrir `/motorista/validar` e conceder permissão.
- [ ] Confirmar scanner usando `BarcodeDetector` quando suportado.
- [ ] Ler QR válido com sucesso.
- [ ] Validar que fallback manual permanece funcional.

### Cenários de erro
- [ ] Negar permissão de câmera e validar mensagem de erro + botão “Tentar novamente”.
- [ ] Simular câmera ativa sem scanner funcional (forçando erro de decode) e validar mensagem de reinicialização.

---

## 9) Pontos que permanecem incertos

1. Não foi executado teste físico em iPhone real neste ambiente de CI; validação final depende de homologação em dispositivo.
2. Não foi identificado, neste escopo, impacto de diferenças entre preview/produção além da compatibilidade do browser.
3. Ajustes finos de performance (intervalo de scan) podem ser necessários em modelos iOS mais antigos, mas não são obrigatórios para correção funcional inicial.
