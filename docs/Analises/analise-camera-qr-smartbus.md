# Auditoria da câmera e da leitura de QR Code no SmartBus web

**Data:** 11/08/2026  
**Escopo:** frontend web em navegador. Android/iOS nativos, Capacitor e WebViews não foram investigados.

> Esta é uma auditoria estática, não uma correção. Nenhuma causa única pode ser declarada comprovada sem reprodução e log de campo.

## 1. Resumo executivo

`src/pages/driver/DriverValidate.tsx` é o único responsável por abrir, exibir, ler e fechar a câmera. Não há hook, componente filho ou biblioteca de QR abrindo outro stream. Apesar desse ownership único, a página acumula enumeração, bootstrap de permissão, classificação de labels, preferência persistida por `deviceId`, fila de câmeras, fallback, validação de quadro, delays, watchdog, reinício pelo scanner e vários modos diagnósticos.

O fluxo normal **não usa `facingMode: environment`**: usa `deviceId: { exact }` escolhido por heurística textual e termina em `video:true`. `facingMode` ideal/exato só é usado em testes brutos. Se labels não estiverem disponíveis, primeiro abre a câmera default (possivelmente frontal), para-a e então abre outra por ID.

As tentativas de uma inicialização são seriais e existe trava contra clique concorrente. Porém, há dois riscos relevantes: o scanner reinicia toda a câmera após três erros de decodificação, sem zerar o contador; e uma Promise de `getUserMedia` pendente não é invalidada no unmount. Todos os streams já recebidos têm caminhos de `stop()`, mas aquisições pendentes ficam fora de `streamRef` até resolverem.

**Complexidade:** excessivamente complexa.  
**Recomendação:** **SIMPLIFICAR A IMPLEMENTAÇÃO** para uma sessão, uma solicitação traseira padronizada, no máximo um fallback serial e um cleanup idempotente.

## 2. Arquivos envolvidos

### Runtime direto

| Arquivo | Papel |
|---|---|
| `src/pages/driver/DriverValidate.tsx` | Único owner: APIs de mídia, `<video>`, seleção, torch, lifecycle, `BarcodeDetector`, `jsQR`, token e validação. |
| `src/App.tsx` | Monta a página em `/validador/validar`; navegação determina unmount. |
| `src/main.tsx` | Ativa React Strict Mode em desenvolvimento. |
| `src/pages/driver/DriverHome.tsx` | Entrada e navegação ao validador. |
| `src/pages/driver/DriverValidate.test.ts` | Testes unitários de fila, constraints, descarte, preferência e tracks. |
| `src/lib/driverPhaseConfig.ts` | Ação operacional executada após ler o token. |
| `src/lib/driverPreferences.ts`, `src/lib/driverScannerFeedback.ts` | Modo, som e vibração após validação. |
| `src/contexts/AuthContext.tsx` | Auth/role que condicionam a permanência da página. |
| `package.json`, locks | Declaram `jsqr@1.4.0`; não há html5-qrcode, qr-scanner ou ZXing. |

### Contrato QR, sem controle de câmera

As migrations `20260403000000_add_driver_qr_validation_flow.sql`, `20260426143000_create_sale_service_items_and_service_qr.sql` e `20260426152000_create_service_qr_resolution_and_consumption_rpcs.sql` implementam validação/serviços. Os tipos Supabase e geradores/exibidores (`ticketImageGenerator`, `ticketPdfGenerator`, `ticketVisualRenderer`, `TicketCard`, `SellerQRCodeModal` e telas de venda/confirmação) produzem ou exibem o QR, mas não capturam vídeo.

Documentos históricos relevantes: `analise-camera-chrome-android-validador.md`, `implementacao-ajustes-camera-dominio-oficial.md`, `analise-camera-webview-selecao-dispositivo.md` e `analise-68-ios-scan-motorista.md`. Apenas o código atual foi tratado como fonte de verdade; conteúdo nativo ficou fora do escopo.

Busca global por APIs de mídia, tracks, facing mode, device ID, BarcodeDetector, scanner e câmera confirmou que somente `DriverValidate.tsx` chama captura em `src`.

## 3. Fluxo atual

```text
DriverHome → /validador/validar → DriverValidate monta <video>
→ usuário clica “Abrir câmera” (não há abertura automática)
→ startCamera: trava + initId + para stream anterior
→ consulta Permissions API apenas para diagnóstico
→ escolhe BarcodeDetector ou jsQR
→ enumerateDevices antes da autorização
  ├─ labels/IDs existem: monta fila
  └─ não existem: getUserMedia(video:true) bootstrap
       → valida preview → enumera de novo → stop → espera 800 ms
→ fila serial: ID traseiro salvo → demais traseiros → desconhecidos → video:true
→ getUserMedia por item → associa srcObject → play (até 2 vezes)
→ aguarda quadro >=16×16 por até 3 s
  ├─ inválido: stop → limpa srcObject → espera 800 ms → próximo
  └─ válido: mantém stream e inicia decoder a cada 300 ms
→ BarcodeDetector(video) ou canvas + jsQR
→ token → RPC Supabase → overlay
```

O overlay pausa o decoder, mas preserva a câmera para “Ler próximo”. Retry manual chama `startCamera`. Após três exceções do decoder, retry automático também chama `startCamera`. `visibilitychange=hidden` fecha câmera pronta, mas não fecha uma inicialização pendente e não reabre automaticamente no retorno.

Os modos `cameraDebug/cameraRaw` adicionam aquisições isoladas generic, ideal, exact e por ID; o modo mínimo usa a seleção normal sem decoder.

## 4. Responsável pela câmera

O único owner é `DriverValidate`: `streamRef` guarda o stream; `startCamera`/`startRawCamera` adquirem; `validateCandidate` liga ao vídeo; `stopStreamTracks`/`stopCurrentStream` fecham; efeitos cuidam de unmount, reanexo, visibility e scanner.

Não há manager global ou biblioteca abrindo câmera. A multiplicidade está dentro da página: bootstrap, fila, fallback, raw tests e reinício do scanner.

## 5. Chamadas de `getUserMedia`

1. Bootstrap normal com `{ video:true, audio:false }` quando labels/IDs não estão disponíveis.
2. Fila normal com `strategy.constraints`: N chamadas seriais até sucesso (`deviceId exact`, depois `video:true`).
3. `startRawCamera` com uma constraint escolhida pelo teste bruto.

`runRawCameraAcquisition` apenas encapsula uma função recebida. Não há chamada em efeito de montagem. Botão inicial, retry e scanner convergem em `startCamera`; `initInProgressRef` bloqueia uma segunda entrada simultânea.

## 6. Uso de `enumerateDevices`

É chamado antes da abertura normal, novamente depois do bootstrap e uma vez no catálogo raw. Antes da permissão, labels podem vir vazios; o bootstrap foi criado para liberá-los.

Labels são normalizados e filtrados por palavras como `back`, `rear`, `environment`, variações multilíngues de traseira, `front` e `user`. Não há regra explícita camera 0/1; um label só numérico fica “não classificado”. Frontais reconhecidas saem da fila por ID, mas `video:true` ainda pode selecioná-las.

Essa heurística só é necessária se testes comprovarem que `facingMode ideal` é insuficiente. Hoje ela cria autorização, abertura, parada e reabertura extras.

## 7. Seleção de câmera traseira

Fluxo normal: enumera → classifica nome → lê `smartbus.validator.lastWorkingBackCameraDeviceId` → tenta ID traseiro salvo → outros traseiros → não classificados → default. Cada ID usa `{video:{deviceId:{exact:id}},audio:false}`. Preferência só é salva após quadro válido e removida quando ausente/falha.

`{ ideal:'environment' }` e `{ exact:'environment' }` existem somente nos testes raw; a forma string não existe. O fluxo normal não combina device ID e facing mode.

Problemas: IDs podem mudar, labels variam por fabricante/idioma/permissão e câmeras lógicas podem virar vários inputs. `video:true` é apresentado como frontal, embora apenas peça o dispositivo default.

## 8. Biblioteca QR

1. `window.BarcodeDetector`, quando disponível, recebe o `<video>`.
2. `jsQR@1.4.0`, fallback, recebe pixels copiados para canvas.

Nenhum chama `getUserMedia`, enumera ou para tracks. Portanto a hipótese de “SmartBus + biblioteca abrindo streams paralelos” é excluída. O acoplamento problemático é o decoder reiniciar o hardware após erros.

## 9. Ciclo de vida do MediaStream

| Caso | Encerramento |
|---|---|
| Bootstrap | `finally` para todas as tracks, limpa ref/srcObject e espera. |
| Candidato inválido | `discard` para todas as tracks e limpa ref/srcObject. |
| Selecionado | nova init, falha, background ou unmount chamam `stopCurrentStream`. |
| Raw | nova execução, erro, retorno, modo ou unmount. |

Troca de página, retry, exceção conhecida e background após ready estão cobertos. Leitura concluída não fecha, intencionalmente, para leitura contínua. `stopCurrentStream` para tracks mas não zera sempre `video.srcObject`; isso não conserva hardware, porém deixa cleanup incompleto no elemento.

Lacuna: uma Promise pendente ainda não está em `streamRef`. O unmount não marca a sessão como cancelada nem verifica isso imediatamente depois de cada await. Uma resposta tardia tende a ser descartada ao notar vídeo desconectado, mas há janela pós-unmount e possível competição com nova montagem.

## 10. Possíveis streams concorrentes

1. Uma inicialização: baixo; bootstrap/fila são seriais.
2. Cliques durante init: baixo; a trava bloqueia.
3. Retry do scanner: **médio**; novos ticks podem reabrir após a init terminar porque o contador segue >=3.
4. Unmount/remount com Promise pendente: **médio**; instâncias têm refs independentes e podem se cruzar.
5. Strict Mode: baixo isoladamente, pois montagem não abre câmera; ajuda a expor cleanup em dev.
6. Raw versus normal: baixo, selecionados pela query/UI e mesma trava.
7. Outra aba/aplicativo: possível, mas externo e não comprovável pelo código.

## 11. Race conditions

* **RC-1:** `scanErrorCountRef >= 3` chama `startCamera` em intervalos de 300 ms; a trava evita simultaneidade enquanto pendente, não reinícios sucessivos depois.
* **RC-2:** unmount não cancela logicamente `getUserMedia`; resposta da instância antiga pode coincidir com nova montagem.
* **RC-3:** watchdog de 12 s só informa; não cancela, não libera a trava e mantém a solicitação viva.
* **RC-4:** background durante init é ignorado deliberadamente para não confundir prompt de permissão; uma solicitação real pode resolver em background.
* **RC-5:** candidato vira `streamRef` durante validação; visibility/unmount pode pará-lo enquanto metadata/quadro aguardam.
* **RC-6:** setters/finalização após awaits não verificam montagem ou sessão mais recente. O owner guard protege apenas a mesma instância.

## 12. Possíveis causas de “camera already in use”

Em ordem de probabilidade investigativa:

1. Reinício automático do scanner e sequência abre/para/reabre.
2. Aquisição antiga pendente após navegação, concorrendo com nova montagem.
3. Bootstrap seguido de ID antes de o driver liberar efetivamente, apesar dos 800 ms fixos.
4. Vários candidatos falhando, repetindo trocas de hardware.
5. Background durante inicialização pendente.
6. Outra aba/aplicativo usando câmera (externo, sem evidência atual).

Não foram encontrados dois managers, biblioteca QR capturando vídeo ou ausência geral de `stop()`.

## 13. Possíveis causas de frontal funcionar e traseira não

1. Heurística não reconhece label traseiro vazio/genérico/localizado.
2. `deviceId exact` persistido ficou instável/obsoleto.
3. Uma câmera traseira lógica retorna track encerrada/quadro inválido enquanto o default frontal funciona.
4. Bootstrap abre frontal e a troca imediata para traseira encontra hardware ainda liberando.
5. `video:true` é chamado de frontal sem garantir orientação, confundindo o diagnóstico.
6. Limitação do navegador/hardware; só um exemplo HTTPS mínimo no mesmo aparelho pode provar.

## 14. Complexidade desnecessária

**Excessivamente complexa:** enumeração dupla, bootstrap, regex multilíngue, ID persistido, fila N+1, polling de quadro, dois `play`, sleeps, watchdog não cancelável, scanner reinicializando hardware, quatro modos raw, modo mínimo e muitos refs/estados diagnósticos.

O histórico e comentários mostram código defensivo acrescentado progressivamente. Foi útil para diagnóstico, mas tornou o diagnóstico parte permanente do caminho produtivo.

## 15. Arquitetura mínima recomendada

```text
ação do usuário → sessionId/trava
→ getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})
→ confirmar sessão ainda ativa
→ um streamRef → um <video> → um decoder
→ token pausa somente decoder durante processamento
→ cleanup: timer → srcObject=null → stop todas tracks → ref=null
```

Se teste real provar necessário, usar **um** fallback serial `{video:true,audio:false}` somente após falha real da captura e após cleanup. Nunca abrir ideal/default juntos. Não usar `exact environment` no caminho comum. Erro do decoder não deve reiniciar câmera viva.

Essas APIs, `playsInline`, canvas e fallback jsQR são adequados para Chrome Android, Safari iPhone e desktop sob HTTPS, sem adaptação WebView.

## 16. Arquivos que precisariam ser alterados

1. `src/pages/driver/DriverValidate.tsx`: aquisição, lifecycle, retry e remoção de diagnóstico incorporado.
2. `src/pages/driver/DriverValidate.test.ts`: sessão única, resposta obsoleta, cleanup e fallback único.
3. Opcionalmente atualizar o documento histórico Chrome após homologação.

Não é necessário alterar App, backend, QR, Android ou iOS.

## 17. Código que poderia ser removido

Após aprovação: tipos/helpers de estratégia e classificação; preferência de device; bootstrap/discovery; fila serial; catálogo/aprovação raw; raw modes e modo mínimo; sleeps; watchdog atual; retry `startCamera` no catch do scanner; estados do painel diagnóstico.

Preservar: stream ref, stop de todas tracks, `playsInline`, BarcodeDetector/jsQR, torch se usado, validação de negócio e feedback.

## 18. Riscos da simplificação

* alguns aparelhos multilente podem escolher traseira diferente;
* navegador que ignore facing mode pode escolher frontal;
* remover ID pode perder workaround específico;
* reduzir validação demais pode sinalizar ready antes do frame;
* fechar após cada QR quebraria leitura contínua — deve-se pausar decoder, não stream;
* Safari exige gesto/playsInline;
* simplificar sem session guard deixaria resposta tardia vazar.

Mitigar com etapas, logs temporários e aparelhos reais antes da remoção definitiva.

## 19. Plano mínimo de correção

1. Reproduzir no Chrome Android com debug e capturar uma sessão completa.
2. Padronizar logs temporários por `cameraSessionId` se necessário.
3. Testar unmount pendente, resposta obsoleta, cleanup e decoder sem reabertura.
4. Remover primeiro o retry de hardware provocado pelo decoder.
5. Adicionar cancelamento lógico: resposta obsoleta para tracks imediatamente e não atualiza UI.
6. Usar facing mode ideal + no máximo fallback default serial.
7. Remover enumeração/classificação/preferência/fila do fluxo comum após homologação.
8. Validar navegação/background/reentrada.
9. Homologar Chrome Android, depois Safari/desktop; WebViews em tarefa separada.

Logs temporários mínimos: `CAMERA INIT`, `REQUEST`, `GRANTED`, `DEVICES` (só diagnóstico), `SELECTED`, `STREAM CREATED`, `TRACK STARTED`, `TRACK STOPPED`, `ERROR` e `COMPONENT UNMOUNT`, todos com o mesmo `cameraSessionId`, estágio, constraint e motivo. Não registrar ID completo, imagem, token ou passageiro; remover após o diagnóstico.

## 20. Testes necessários

### Automáticos

- [ ] uma ação gera uma chamada principal;
- [ ] clique duplo não duplica;
- [ ] fallback só começa após primeira tentativa e cleanup;
- [ ] resposta cancelada é parada imediatamente;
- [ ] cleanup para todas tracks, timer e srcObject idempotentemente;
- [ ] unmount pendente não associa stream/seta estado;
- [ ] erro BarcodeDetector/jsQR não chama getUserMedia;
- [ ] QR pausa/retoma decoder conforme modo;
- [ ] NotAllowed, NotFound, Overconstrained e NotReadable fecham sessão;
- [ ] Strict Mode não deixa timer/stream anterior.

### Manuais

- [ ] Chrome Android HTTPS;
- [ ] câmera traseira;
- [ ] frontal somente como fallback;
- [ ] QR de passagem e serviço;
- [ ] entrar/sair 10 vezes;
- [ ] trocar página e retornar;
- [ ] negar permissão e tentar novamente;
- [ ] bloquear/desbloquear aparelho;
- [ ] background e retorno;
- [ ] abrir/retry repetidamente;
- [ ] navegar durante prompt;
- [ ] erro do decoder não reabre câmera;
- [ ] indicador apaga ao sair;
- [ ] outra aplicação usa câmera depois;
- [ ] aparelho multilente;
- [ ] desktop com/sem câmera;
- [ ] Safari iPhone posteriormente.

Registrar session ID, DOMException.name, constraints, track state, dimensões e stop reason. Não concluir “already in use” apenas por texto traduzido.

## Conclusão: **SIMPLIFICAR A IMPLEMENTAÇÃO**

Há um único owner e cleanup explícito, portanto a auditoria não confirma dois managers simultâneos. Confirma, porém, aquisições/transições demais, retry do decoder que reinicia hardware e falta de cancelamento lógico de pedidos pendentes. A mudança mínima deve preservar página, vídeo, decoders e regras de negócio, removendo progressivamente enumeração/classificação/preferência/fila do fluxo comum em favor de uma sessão previsível com facing mode ideal e, apenas se comprovadamente necessário, um fallback serial.
