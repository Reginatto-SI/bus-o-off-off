# Auditoria da câmera no Chrome Android — `/validador/validar`

**Data da análise:** 30/07/2026  
**Escopo:** acesso direto pelo Google Chrome no Android. Integrações empacotadas não fazem parte desta análise.  
**Natureza desta entrega:** diagnóstico e instrumentação; nenhuma correção funcional foi aplicada.

## 1. Resumo executivo

O log de campo prova que `getUserMedia()` **resolve**, às 12:35:50.401, com um stream e uma faixa identificável (`camera 2, facing back`, 640×480), mas a primeira leitura feita pelo SmartBus, no mesmo milissegundo do retorno, já encontra `readyState="ended"`. Na implementação atual não existe chamada SmartBus a `stop()` no caminho síncrono entre a resolução de `getUserMedia` e essa primeira leitura. O descarte de uma solicitação obsoleta fica antes do registro, mas não ocorreu: se tivesse ocorrido, não existiria a linha posterior “track criada”. O `stopCurrentStream('falha_inicializacao')` observado às 12:35:52 é consequência do `StreamEndedError`, 1,675 s depois, e não explica o primeiro `ended`.

Assim, **a evidência disponível favorece que o Chrome/serviço de câmera entregou a faixa já encerrada**, ou que alguma chamada externa a este módulo executou `MediaStreamTrack.stop()` enquanto a Promise estava pendente. A leitura estática exclui as origens SmartBus conhecidas, mas não permite provar negativamente que nenhuma biblioteca/código dinâmico chamou o método nativo. Para fechar essa lacuna foi adicionada instrumentação inicialmente limitada a `import.meta.env.DEV` e, no refinamento, disponibilizada somente quando `?cameraDebug=1` é explícito: interceptação de `MediaStreamTrack.prototype.stop`, stack completa, snapshots atômicos do stream e eventos de componente, vídeo, página, autenticação e cada chamada de `getUserMedia`.

**Causa mais provável, antes do novo log:** falha da captura no Chrome/CameraService do aparelho, que resolve a Promise com a track terminal. **Confiança: média-alta (80%)** sobre “já chegou `ended` ao código que recebe a Promise”; **confiança baixa** sobre a causa externa específica (ocupação, permissão inconsistente, câmera/driver ou defeito da versão do Chrome) até executar os controles no mesmo aparelho.

A frase causal exata exigida ainda não pode ser honestamente preenchida por leitura estática. O próximo log deve responder uma bifurcação objetiva:

* há `[CAM-DIAG] MediaStreamTrack.stop interceptado` antes do primeiro snapshot → a stack identifica a origem exata;
* não há interceptação e o snapshot `primeiro .then/retorno de getUserMedia` mostra `ended` → a faixa foi entregue terminal pelo navegador, antes de o SmartBus armazená-la ou vinculá-la ao vídeo.

## 2. Descrição exata e cronologia do incidente

1. 12:35:44.906: um único clique inicia a sessão `#1`; a trava é marcada antes de qualquer `await`.
2. 12:35:44.918: permissão ainda `prompt`; isto exclui negação como erro retornado.
3. 12:35:44.957: chamada única registrada com `facingMode.environment` ideal.
4. O diálogo leva 5,444 s. Esse intervalo é a diferença concreta em relação ao desktop e é onde eventos de página/Auth podem ocorrer.
5. 12:35:50.401: a Promise resolve, com uma track, label, settings 640×480; portanto não houve `NotAllowedError`, `NotFoundError` nem falha de constraint.
6. Ainda às 12:35:50.401: a primeira inspeção mostra `ended`. Não há atribuição a `streamRef`, `srcObject`, `play`, enumeração posterior ou watchdog entre a resolução e essa inspeção.
7. 12:35:50.411: `loadedmetadata` termina com `readyState=4`, mas isso é estado do elemento HTML, não prova track viva; o tamanho 2×2 confirma ausência de quadro útil.
8. 12:35:50.565: `enumerateDevices()` retorna zero. É diagnóstico e não encerra streams.
9. 12:35:50.566–12:35:52.076: espera de 1,5 s confirma que `ended` é terminal (uma track encerrada não retorna a `live`).
10. 12:35:52.076: somente agora o catch chama `stopCurrentStream('falha_inicializacao')`; ele chama `stop()` numa faixa que já estava `ended` e limpa a referência.

## 3. Arquivos e estrutura investigados

| Arquivo/área | Papel e conclusão |
|---|---|
| `src/pages/driver/DriverValidate.tsx` | Toda abertura, vínculo ao vídeo, scanner, guardas, visibility e encerramentos da câmera. Único arquivo atual em `src` que chama `MediaStreamTrack.stop()`. |
| `src/contexts/AuthContext.tsx` | `onAuthStateChange`, carga de profile/role/empresa e transições de `loading`; emite eventos diagnósticos somente quando `cameraDebug=1`. |
| `src/App.tsx` | Rotas são irmãs diretamente sob `AuthProvider`; `/validador/validar` não usa layout pai nem route guard wrapper. |
| `src/pages/driver/DriverHome.tsx` | Origem normal do clique/navegação para validar; não abre câmera. |
| `src/lib/driverTripStorage.ts` e `src/lib/driverPhaseConfig.ts` | Empresa/usuário escolhem apenas fase operacional e textos; não contêm APIs de mídia. |
| `src/lib/driverPreferences.ts`, `driverScannerFeedback.ts` | Preferências e feedback; não controlam stream. |
| busca global em `src` | Não há utilitário compartilhado de câmera, `video.srcObject = null` ou `setVideoEl(null)` explícitos. |

## 4. Histórico Git relevante

A história rastreada do arquivo começa em 01–02/07/2026 e concentra mudanças de câmera em 26–29/07. O commit `cdb9abe` (`fix(mobile): corrigir acesso ao validador e câmera`, 26/07) é o marco legível mais relevante:

* removeu tentativas automáticas por `deviceId` e suas várias paradas;
* deixou a abertura exclusivamente no botão;
* adicionou trava de concorrência;
* deixou de reiniciar automaticamente quando `visibilityState` volta a `visible`;
* preservou a inicialização durante o diálogo de permissão;
* trocou o fluxo para `facingMode:environment` e fallback `video:true`.

Revisões posteriores acrescentaram watchdog não destrutivo, ownership por init e tolerância a metadata/track. A versão imediatamente anterior a `cdb9abe` fazia mais solicitações e stops e, portanto, **não é evidência de uma versão mobile comprovadamente funcional**. Nenhum teste, tag ou commit do repositório afirma e demonstra uma última versão funcional no mesmo Chrome/aparelho; nome de commit não substitui ensaio de hardware. O repositório é shallow, o que também limita conclusões sobre história anterior.

## 5. Mapa completo da inicialização

`<Button onClick>` → `startCamera(videoEl)` → trava `initInProgressRef=true` → incrementa `initCountRef` → encerra apenas stream anterior → consulta permissão → configura engine de scanner → `enumerateDevices` diagnóstico → laço sequencial:

1. `getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})`;
2. somente se **rejeitar**, `getUserMedia({video:true,audio:false})`.

Se resolver: valida ownership → registra track → armazena `streamRef`/owner → atribui `srcObject` → aguarda metadata → `play()` → enumera → exige track `live` → aguarda primeiro quadro → marca `cameraReady` → inicia scanner por efeito.

Não há abertura no mount, `useEffect`, `pageshow`, `visibilitychange`, auth, troca de fase ou scanner. “Tentar novamente” e “Abrir câmera” chamam o mesmo handler humano. O laço de constraints é serial; a segunda chamada só nasce após rejeição da primeira.

### Evidência de concorrência existente e limite

A trava impede segundo clique enquanto `initInProgressRef=true`. O watchdog de 12 s pode soltá-la antes de uma Promise muito demorada resolver; nesse caso um segundo clique poderia criar uma chamada concorrente. Isso **não ocorreu no log**: a resposta veio em 5,4 s, `initCount=1`, watchdog não disparou e há uma tentativa. A instrumentação agora atribui `callId`, início/fim, constraint, stack, stream e estado inicial a cada chamada. Ela permitirá comprovação dinâmica, não apenas inferência.

## 6. Auditoria completa dos encerramentos

Resultado das buscas por `.stop()`, `getTracks().forEach`, `stopCurrentStream`, `srcObject=null` e `setVideoEl(null)` em todo `src`:

| Arquivo/linha lógica | Função/origem | Condição e motivo | Durante diálogo? | Após retorno? | Cleanup/estado/desmonte? |
|---|---|---|---|---|---|
| `DriverValidate.tsx`, `stopCurrentStream` | `stream.getTracks().forEach(t => t.stop())` | Há `streamRef.current`; motivo passado pelo chamador. Ownership opcional impede sessão antiga de matar nova. | Não para a sessão nova, pois ela ainda não está em `streamRef`; pode parar stream anterior no começo. | Sim, nos casos abaixo. | Sim, quando chamado pelo cleanup de rota. |
| `startCamera`, `nova_inicializacao` | `stopCurrentStream` | Antes do primeiro `await`, limpa sessão anterior. | Não é reexecutado por retorno da permissão; só novo clique. | Só em uma nova inicialização humana. | Mudança de estado comum não chama. |
| `startCamera`, descarte obsoleto | `stream.getTracks().forEach(track.stop)` | `thisInitId !== initCountRef.current`; resposta tardia perdeu ownership. | Executa apenas depois que a Promise resolve. | Sim; não ocorreu no log porque o registro posterior da track existe e `initCount=1`. | Não é cleanup; é defesa de concorrência. |
| catch de `startCamera` | `stopCurrentStream('falha_inicializacao', thisInitId)` | Qualquer erro após stream armazenado; no caso observado, `StreamEndedError`. | Não enquanto Promise aguarda. | Sim; consequência às 12:35:52.076. | Estado de erro dispara catch, não desmontagem. |
| efeito de vida da tela | `stopCurrentStream('desmontagem_da_tela')` | Cleanup do **componente** ao sair da rota/remover `DriverValidate`. | Possível somente se a rota realmente for desmontada durante o diálogo. | Possível se navegação/desmonte ocorrer. | Sim, exclusivamente desmonte. |
| handler `visibilitychange` | `stopCurrentStream('pagina_em_background')` | Apenas `hidden && !initInProgress && cameraReady`. | Não: durante a permissão `initInProgress=true` e ainda não ready. | Sim, depois de câmera pronta e ao ir a background. | Não é cleanup nem simples rerender. |
| instrumentação explícita (`cameraDebug=1`) | wrapper chama `originalStop.call(this)` | Não cria nova parada; apenas observa e delega cada chamada existente. | Observa qualquer chamada enquanto componente montado. | Idem. | Wrapper é restaurado no cleanup. |

**Ocorrências inexistentes no código atual:** `video.srcObject = null` e `setVideoEl(null)`. React chama o callback ref com `null` quando remove o DOM, mas isso apenas atualiza estado; não chama `stop()`. Não há outro `track.stop()` sob `src`.

## 7. Auth durante o diálogo

`AuthProvider` é pai estável das rotas. Todo evento Supabase chama `setSession`/`setUser`; com sessão chama `setLoading(true)` e agenda `fetchUserData`, cujo `finally` volta a `false`. Portanto `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED` e eventos equivalentes com sessão entram no mesmo caminho; não há filtro específico por nome do evento.

Na tela, porém, `loading` só substitui a árvore inteira quando `loading && !user`. Em refresh com usuário preservado, o comentário e a condição mantêm a árvore e o `<video>`. `userRole` antigo também não é zerado antes do fetch. Um `SIGNED_OUT` real zera `user`, role e empresa e pode renderizar redirect; isso mudaria a rota e o cleanup pararia a câmera, mas o log fornecido não mostra redirect, unmount ou motivo `desmontagem_da_tela`.

Importante: uma renderização condicional dentro de `DriverValidate` pode remover o `<video>`, mas não desmonta o componente `DriverValidate` em si; logo o efeito `[]` de encerramento não executa só por esse return. A saída de rota, sim, desmonta e para. A instrumentação `[AUTH-DIAG]` agora registra evento Supabase, loading, user, role, empresa, visibilidade e URL, permitindo correlacionar com o prompt Android.

## 8. Ciclo do elemento `<video>`

O elemento não possui `key`, não depende de `cameraReady`, `cameraError`, debug, overlay ou fase para existir na árvore principal. Esses estados alteram apenas overlays/controles. Seu callback ref é estável. O efeito de `videoEl` apenas reanexa `streamRef.current` se o DOM for recriado; não para stream.

As únicas condições anteriores ao return principal são auth/role/acesso. Assim, no fluxo nominal autenticado, o mesmo nó permanece de clique → prompt → resolução → metadata → play → quadro. O log anterior não registrava identidade/conectividade do nó e, portanto, não “prova” essa permanência. O novo callback registra mount/unmount e cada snapshot registra `video.isConnected`; estados React registram mudança de `videoEl`, `loading` e `user`.

## 9. Snapshots do stream e instrumentação de confirmação

Somente com o parâmetro explícito `cameraDebug=1`, são capturados:

* no primeiro retorno após o `await getUserMedia`, antes de qualquer armazenamento;
* antes e depois de `streamRef`;
* antes e depois de `srcObject`;
* depois de `loadedmetadata`;
* depois de `play()` resolvido;
* depois da espera pelo primeiro quadro.

Cada snapshot contém `stream.id`, `stream.active`, track id/label/kind, `readyState`, `enabled`, `muted`, `getSettings()`, `getCapabilities()` e estado/conectividade/dimensões do vídeo.

O wrapper temporário de `MediaStreamTrack.prototype.stop` registra timestamp ISO, id, label, estado anterior, stack e `console.trace`, URL, visibility, user, loading e init id. Eventos `visibilitychange`, `pagehide`, `pageshow`, `freeze` e `resume`, montagem/desmontagem do componente e do vídeo também são registrados. O wrapper existe apenas com `cameraDebug=1`, não envia logs, não persiste dados e restaura o prototype original no cleanup.

### Log adicional necessário

Executar a versão HTTPS publicada com `/validador/validar?cameraDebug=1` no aparelho e exportar, sem filtrar:

1. todas as linhas `[CAM-DIAG]` desde antes do clique até 3 s após o erro;
2. todas as linhas `[AUTH-DIAG]` no mesmo intervalo;
3. fabricante/modelo, versão Android e versão completa do Chrome (`chrome://version`);
4. se houver interceptação de stop, expandir o objeto e copiar a stack completa;
5. repetir uma vez com DevTools remoto aberto e uma sem DevTools, anotando qualquer diferença.

## 10. Hipóteses

| Hipótese | A favor | Contra / status |
|---|---|---|
| **A — SmartBus encerra** | Existem stops legítimos em erro, nova sessão, background e desmonte. | Nenhum cabe antes da primeira leitura no log. A parada de falha ocorre 1,675 s depois. Falta apenas excluir chamada dinâmica via stack. |
| **B — Chrome entrega encerrada** | Primeiro acesso após `await` já lê `ended`; nenhum código SmartBus intermediário; label/settings existem, comportamento compatível com captura que abriu e morreu no serviço nativo. | Não identifica por si só se foi câmera ocupada, estado de permissão, outra aba, Chrome, fabricante ou CameraService. Controle externo obrigatório. |
| **C — duas chamadas** | Watchdog pode liberar clique após 12 s e uma resposta ainda estar pendente. | Log: `initCount=1`, uma tentativa, resposta em 5,4 s; impossível neste episódio conhecido. Instrumentação confirmará no aparelho. |
| **D — vídeo desmontado** | Auth pode, em estados extremos, trocar a subárvore; rota pode desmontar componente. | Nó não é condicional no fluxo autenticado; remoção do vídeo isolada não chama stop; log não mostra cleanup. Agora observável diretamente. |
| **E — referência/cleanup antigo** | Races assíncronas são possíveis em geral. | owner init impede catch antigo de parar stream novo; novo stream só entra no ref após checagem; stream anterior é parado antes do prompt. |
| **F — novo ciclo ao voltar do prompt** | Android pode emitir page lifecycle/Auth refresh durante diálogo mais longo. | loading com user não remove a tela; visibility ignora init pendente; não há auto-start no retorno. Só SIGNED_OUT/navegação real desmontaria e deixaria motivo/stack. |

## 11. Desktop versus Android

Não há branch funcional por user-agent: ambos percorrem exatamente `startCamera`. A diferença concreta observada é ambiental e temporal: desktop concede e entrega uma track `live`; Android abre um diálogo por ~5,4 s, seleciona a traseira e entrega a mesma abstração já terminal. O intervalo maior permite eventos lifecycle/Auth, mas o SmartBus explicitamente não encerra em `hidden` enquanto init está pendente e não substitui a tela em refresh com user.

Desktop normalmente tem uma webcam e não alterna o CameraService entre múltiplas lentes; Android reportou `camera 2, facing back`, depois zero dispositivos, e passou por UI de permissão/retomada. Isso orienta os testes, mas não constitui causa. A comparação válida será pelos novos logs: quantidade/callId, eventos lifecycle/Auth, mount id, primeiro snapshot e stack de stop nos dois ambientes.

## 12. Testes manuais obrigatórios

Registrar primeiro snapshot e presença/ausência de stack em cada linha da matriz:

1. Mesmo aparelho/Chrome, amostra mínima oficial de `getUserMedia` em HTTPS.
2. SmartBus em aba anônima.
3. Uma página mínima em outro domínio HTTPS.
4. Fechar todas as abas e apps que usam câmera; repetir.
5. Reiniciar o aparelho; repetir primeiro a amostra e depois SmartBus.
6. Redefinir apenas a permissão de câmera do domínio; repetir.
7. Na amostra mínima, `{video:true,audio:false}` (frontal/padrão).
8. Depois `{video:{facingMode:{ideal:'environment'}},audio:false}`.
9. Mesmo SmartBus em outro aparelho Android/Chrome estável.
10. Build local diagnóstica com os cleanups temporariamente neutralizados **apenas para experimento**, nunca para commit/produção; comparar primeiro snapshot. Como a leitura já é `ended` antes do cleanup de falha, espera-se que isso apenas preserve uma faixa morta, o que é evidência útil, não correção.
11. Repetir no desktop capturando o mesmo conjunto de logs como controle positivo.

Interpretação: se amostra mínima também recebe `ended`, isola aparelho/Chrome/CameraService; se somente SmartBus falha e aparece stack, corrige-se a origem da stack; se somente SmartBus falha sem stack e o primeiro snapshot já é terminal, comparar constraints/origem segura/políticas e produzir reprodução mínima no mesmo domínio.

## 13. Proposta de correção mínima após confirmação

Nenhuma foi implementada nesta etapa.

* Se a stack apontar `desmontagem_da_tela`, manter a árvore da rota montada durante o evento exato ou adiar somente esse cleanup enquanto a init identificada estiver pendente.
* Se apontar `pagina_em_background`, ajustar somente a condição comprovada pelo evento (sem remover liberação normal do hardware).
* Se apontar descarte obsoleto, manter uma Promise única por init e não liberar a trava do watchdog enquanto ela estiver pendente.
* Se não houver `stop` e o primeiro snapshot for `ended`, a menor resposta no app é tratar a falha nativa de forma determinística e, **somente se o teste `video:true` provar funcionamento no mesmo aparelho**, tentar essa constraint após liberar completamente a faixa terminal. Se ambas falharem na amostra externa, não existe correção React honesta: registrar reprodução e tratar a causa Chrome/Android/aparelho.

### Riscos

Adiar/remover cleanup sem evidência pode manter LED/hardware ativos, vazar streams entre rotas e criar concorrência. Retry automático pode provocar novo prompt, selecionar lente errada ou piorar CameraService ocupado. Manter prototype patch em produção seria global e arriscado; por isso só é instalado pelo parâmetro explícito e é restaurado. Os logs não incluem user id, conteúdo do QR ou dados de passagem e não são enviados a telemetria.

## 14. Critérios de aceite

1. Exatamente um `callId` ativo por clique; nenhuma chamada de mount/Auth/pageshow.
2. Mesmo `<video>` (`isConnected=true`, sem unmount) do clique ao primeiro quadro.
3. Nenhum `stop()` antes de `cameraReady`, exceto descarte explicitamente identificado de sessão obsoleta.
4. Primeiro snapshot: `stream.active=true`, uma track `live`, enabled, settings coerentes.
5. Após `srcObject`, metadata e play a track continua `live`.
6. Primeiro quadro tem dimensões reais maiores que o placeholder 2×2.
7. Ir a background depois de pronta encerra com motivo `pagina_em_background`; sair da rota encerra com `desmontagem_da_tela`.
8. TOKEN_REFRESHED/SIGNED_IN com o mesmo usuário não desmonta vídeo nem para stream.
9. Chrome Android passa três ciclos abrir/fechar e um retry sem stream órfão; desktop continua passando como regressão.
10. Nenhuma alteração em banco, RLS, passagens, vendas, embarque, rotas ou engines de QR.

## 15. Conclusão: comprovado versus pendente

**Comprovado pelo log anterior:** uma única chamada registrada resolveu; o snapshot posterior à enumeração encontrou a track `ended`; nenhum `stop()` JavaScript foi interceptado durante a chamada. Como havia `enumerateDevices()` entre a resolução e aquele snapshot, o estado verdadeiramente inicial ainda depende dos novos ensaios brutos.

**Ainda hipótese:** por que o subsistema do Chrome/Android terminou a track e se houve chamada dinâmica a `stop()` durante a Promise; modelo/driver/ocupação/permissão específica; evento lifecycle/Auth exato no aparelho.

**Instrumentação temporária:** sim, somente quando `?cameraDebug=1` é informado, em `DriverValidate.tsx` e `AuthContext.tsx`. Ela é a mudança mínima necessária para obter a origem/stack, sem alterar o comportamento funcional da câmera.

## 16. Refinamento funcional após a auditoria

A recuperação mínima passou a considerar `getUserMedia()` resolvido apenas como **aquisição**, não como sucesso. Cada aquisição é validada por `stream.active`, track `live`, permanência do vídeo no DOM e quadro de pelo menos 16×16; portanto 2×2 é explicitamente inutilizável. A etapa inicial implementou uma fila ampla; após o novo log, o fluxo normal temporário foi reduzido a traseira `ideal` e `video:true`, deixando `exact` isolado no ensaio bruto. Um stream inutilizável recebe a classificação `stream_inutilizavel`, é parado com motivo, desvinculado do vídeo e aguarda brevemente a liberação do hardware antes da próxima Promise.

O watchdog deixou de liberar a trava enquanto uma chamada está pendente. Isso fecha a janela de concorrência identificada na auditoria. O diagnóstico não depende mais do tipo de build: fica totalmente desligado normalmente e é ativado explicitamente em `/validador/validar?cameraDebug=1`. O painel permite alternar para o teste mínimo, no qual scanner e processamento de QR não são inicializados, e copiar tanto o resumo quanto os eventos detalhados. A interceptação global de `stop()` somente existe nesse modo e é restaurada na saída.

A atribuição a Chrome/Android permanece condicionada à matriz de controle: ausência de stop interceptado, vídeo montado, uma chamada por vez, falha de todas as estratégias, falha do modo mínimo e falha da amostra externa no mesmo aparelho.

## 17. Refinamento final antes do teste Android

A preparação do vídeo agora segue track `live` → `srcObject` → espera limitada por `loadedmetadata`/`canplay` → `play()` →, em rejeição transitória, espera por estado reproduzível e uma única repetição → janela limitada do primeiro quadro. Rejeição nas duas chamadas de `play()` invalida a tentativa. O diagnóstico registra cada etapa e o estado contemporâneo da track.

A descoberta classifica labels multilíngues como traseira, frontal ou não classificada. Após os controles brutos confirmarem a limitação de `facingMode`, a seleção por `deviceId` retornou de forma dinâmica, sem IDs fixos; `video:true` continua como fallback final. O intervalo de liberação foi elevado de 350 para o teto conservador de 800 ms.

A orquestração serial foi isolada somente o suficiente para teste de contrato: aquisição pendente bloqueia a próxima, descarte antecede a próxima aquisição, stream válido encerra a fila e o fallback final é alcançável. O watchdog continua informativo e não libera a trava; o botão de retry permanece desabilitado e mostra a estratégia atual.

## 18. Snapshot atômico e ensaios brutos

O evento `getUserMedia:immediate_snapshot` agora é produzido na instrução síncrona imediatamente posterior ao `await getUserMedia`, antes de WeakMap, estado React, `streamRef`, `srcObject`, callback assíncrono ou enumeração. A validação completa de track/vídeo/quadro ocorre antes de `afterResolved`; `enumerateDevices` só é chamado depois que uma tentativa já foi considerada funcional.

Na etapa intermediária dos três controles, o fluxo normal deixou de iniciar por `exact`. Com a evidência de que `ideal` e `exact` escolhem o mesmo dispositivo encerrado, o fluxo normal passou a usar a fila dinâmica por `deviceId` descrita na seção seguinte. O modo bruto não usa essa fila. Cada URL (`cameraRaw=generic`, `ideal` ou `exact`) permite um clique e uma chamada, sem permissions query, enumeração, scanner, deviceId, fallback, watchdog ou retry. Para trocar de ensaio é necessário carregar outro link, o que também libera o stream pelo cleanup existente.

## 19. Seleção dinâmica por dispositivo físico

Os ensaios `ideal` e `exact` escolheram o mesmo deviceId da `camera 2`, enquanto `video:true` comprovou que a captura funciona com a frontal. Isso não determina o resultado da outra traseira. O catálogo `/validador/validar?cameraDebug=1&cameraRaw=devices` enumera uma vez, agrupa traseiras/frontais/não classificadas e permite uma única aquisição por `deviceId exact` a cada carregamento.

O fluxo normal não usa mais `facingMode`. Se a enumeração já expõe labels e IDs, prioriza a última traseira funcional ainda presente, depois as demais traseiras, não classificadas e `video:true`. Se os labels estiverem ocultos, faz um bootstrap único com `video:true`, valida o quadro, enumera, encerra o bootstrap, aguarda 800 ms e monta a mesma fila por deviceId. Uma traseira só é memorizada depois de track `live` e quadro real; preferência ausente ou que falha é removida do `localStorage` sem bloquear os demais dispositivos.


## 20. Promoção do teste individual para o fluxo normal

Uma câmera traseira aprovada no catálogo individual agora grava a mesma preferência tolerante a falhas usada pelo fluxo normal, mas somente após stream ativo, track `live`, vídeo conectado e quadro real. Câmeras frontais ou ensaios sem quadro não são gravados. A tela confirma label/ID reduzido e oferece retorno ao validador normal.

A preferência é uma otimização: leitura, escrita e remoção são protegidas; uma exceção do armazenamento vira apenas diagnóstico. A câmera preferida é validada na enumeração, removida se incompatível, ausente, rejeitada antes de criar stream ou inutilizável depois da aquisição. Falhas por dispositivo ficam em um `Set` somente durante a inicialização, aparecem no log e não se repetem. Toda falha com stream executa stop/desvínculo e toda próxima tentativa aguarda 800 ms. O primeiro dispositivo funcional encerra a fila; `video:true` permanece no final e nunca é salvo como traseira.
