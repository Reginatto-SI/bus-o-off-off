# PRD — Baseline da câmera do validador SmartBus

**Status:** fonte oficial do comportamento atual e contrato de não regressão
**Rota produtiva:** `/validador/validar`
**Baseline do repositório inspecionado:** `eea0f3dab3ea3c17b9545468731f1e9a709f84fa` (`eea0f3d`, *Fixed SEO and routing issues*)
**Marco da varredura de lentes presente no baseline:** `3f2ac4d` (*Implementou varredura de lentes*)
**Escopo deste PRD:** documentação do fluxo web existente; não especifica uma nova implementação.

## 1. Finalidade e autoridade deste documento

Este PRD é a fonte oficial de comportamento da câmera do validador. Antes de Codex, Lovable ou qualquer outra IA — assim como qualquer pessoa desenvolvedora — realizar mudança na câmera, deve:

1. ler este documento;
2. preservar as regras de não regressão;
3. identificar claramente se a mudança pertence ao SmartBus web ou ao container WebView;
4. evitar alterações não relacionadas.

O validador deve permitir que o operador escolha **câmera traseira** ou **câmera frontal**. A traseira é recomendada para QR Code; a frontal é uma alternativa operacional.

Fluxo funcional esperado:

> usuário escolhe câmera → câmera é aberta → preview é exibido → decoder analisa QR → passagem ou serviço é validado → a mesma câmera continua disponível para a próxima leitura → ao fechar, trocar ou sair, o hardware é liberado

## 2. Contrato arquitetural obrigatório

- Existe somente uma câmera produtiva ativa por vez. Frontal e traseira não são abertas simultaneamente.
- O componente do validador é proprietário do `MediaStream`; o decoder somente lê frames e **não** controla o hardware.
- Erro de leitura ou ausência de QR não reinicia nem encerra a câmera.
- A troca de câmera encerra completamente a sessão anterior antes de solicitar a seguinte.
- Fechamento, saída da tela, desmontagem e ida ao background encerram as tracks nas condições descritas neste PRD.
- Stream sem vídeo vivo e preview sem imagem plausível não tornam a câmera pronta.
- Respostas assíncronas obsoletas são descartadas e não podem interferir na sessão atual.
- O comportamento deve permanecer serial, pequeno e previsível; mudanças futuras devem ser mínimas e apoiadas em evidência.
- Não se criam fluxos paralelos de câmera sem necessidade comprovada.

## 3. Implementação atual da câmera frontal

1. O botão **Câmera frontal** chama o mesmo lifecycle central usado pela traseira, indicando `front`.
2. A seleção é delegada ao navegador com `getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: false })`. Não há enumeração, fila ou persistência de lente no fluxo frontal normal.
3. Antes da solicitação, o lifecycle encerra a sessão produtiva anterior. Durante a aquisição, uma trava impede outra abertura produtiva ou diagnóstica concorrente.
4. O stream recebido passa pelos guards de sessão, video track, `stream.active`, `track.readyState`, `video.play()` e dimensões de preview.
5. Quando aprovado, o stream é associado ao `srcObject` do `<video autoPlay muted playsInline>`. Só depois de uma imagem plausível o estado de câmera pronta e o decoder são habilitados.
6. O decoder usa `BarcodeDetector` quando disponível; caso contrário, usa `jsQR`.
7. Fechar, trocar, desmontar, sair da rota ou ir ao background executa o cleanup central descrito adiante.

Não existe hoje uma fila de `deviceId` para a frontal. Uma seleção manual exibida após erro pode, entretanto, abrir uma lente classificada como frontal por `deviceId` exato.

## 4. Implementação atual da câmera traseira

A traseira tem tratamento adicional porque alguns aparelhos expõem múltiplas lentes traseiras e nem toda entrada necessariamente entrega uma track viva e uma imagem utilizável. Essa complexidade não é genérica nem decorativa: ela evita considerar como sucesso uma lente que foi concedida pela API, mas não produz preview real.

### 4.1 Ordem real de abertura

Sem uma seleção manual forçada, o fluxo atual é:

1. consultar a preferência local da lente traseira aprovada;
2. se existir, tentar **somente ela primeiro**, com `deviceId: { exact: ... }`;
3. se ela falhar com erro que permite continuar, remover a preferência e descobrir as lentes atuais;
4. chamar `enumerateDevices()` e manter apenas entradas `videoinput` com `deviceId`;
5. se todas as lentes enumeradas estiverem sem label, fazer uma abertura curta com `{ video: true, audio: false }`, parar imediatamente todas as suas tracks e enumerar novamente, pois labels normalmente aparecem após permissão;
6. montar a fila com lentes classificadas como traseiras, seguidas das desconhecidas; lentes classificadas como frontais não entram nessa fila;
7. testar as candidatas **serialmente**, cada uma com `deviceId.exact`, até a primeira entregar stream e preview válidos;
8. se nenhuma candidata funcionar e a sessão continuar atual, usar o último fallback: `facingMode: { ideal: 'environment' }`, deixando o navegador escolher;
9. persistir o `deviceId` quando uma tentativa específica é aprovada. O fallback por `facingMode` não produz um `deviceId` aprovado para persistência.

Cada candidata termina sua aquisição e validação antes da próxima começar. Não há corrida paralela de lentes.

### 4.2 Erros que permitem avançar na fila

A varredura continua para a candidata seguinte somente em:

- `CameraStreamInvalidError`;
- `CameraPreviewUnavailableError`;
- `NotReadableError`;
- `OverconstrainedError`;
- `AbortError`;
- `NotFoundError`.

Outros erros interrompem a varredura. Não existem retry infinito, polling ou watchdog.

### 4.3 Seleção manual

Quando uma abertura resulta em erro e a lista de lentes foi descoberta, a interface normal apresenta **Escolher a lente manualmente**. Essa lista não está restrita ao role `developer` no código atual. O clique:

- grava o `deviceId` escolhido como preferência traseira;
- usa `deviceId.exact` na nova tentativa;
- trata uma lente classificada como frontal como `front` e as demais como `back`.

O PRD não registra nenhum `deviceId` real.

## 5. Preferência da lente traseira aprovada

O nome confirmado da chave é **`smartbus_driver_back_lens`**.

- **Onde fica:** `localStorage`, portanto é informação local ao navegador/WebView e ao armazenamento daquele aparelho/perfil de navegador. Não envolve backend, Supabase, banco ou sincronização entre aparelhos.
- **Quando é gravada:** quando uma lente específica entrega uma aquisição aprovada na fila traseira; também é gravada imediatamente ao escolher uma lente manualmente. Uma abertura traseira aprovada apenas pelo fallback `facingMode` não grava a chave.
- **Quando é usada:** antes de enumerar e testar outras lentes em uma futura abertura traseira.
- **Quando é removida:** quando a tentativa da lente lembrada não retorna uma aquisição aprovada e o fluxo segue para redescoberta.
- **Se deixar de funcionar:** a tentativa é encerrada; em erro continuável, a preferência é apagada, as demais lentes traseiras/desconhecidas são testadas serialmente e, por último, há o fallback por `facingMode`. Erro não continuável encerra o fluxo.
- **Falha de armazenamento:** leitura retorna `null`; falhas ao gravar ou remover são ignoradas para não bloquear a câmera.

## 6. Descoberta e classificação de lentes

`enumerateDevices()` é protegido contra indisponibilidade e exceções: nesses casos retorna lista vazia e o fallback final por `facingMode` continua possível.

Para cada `videoinput` com `deviceId`, o sistema mantém `deviceId`, label e classificação:

| Classificação | Evidência no label, sem diferenciar maiúsculas/minúsculas |
| --- | --- |
| Traseira | `back`, `rear`, `traseir` ou `environment` |
| Frontal | `front`, `frontal`, `user` ou `self` |
| Desconhecida | nenhum dos termos anteriores |

Label vazio recebe a apresentação **Câmera sem identificação**. Na fila automática traseira, a ordem é: preferência lembrada (em tentativa separada), traseiras na ordem da enumeração e desconhecidas na ordem da enumeração. Frontais classificadas não são candidatas automáticas à traseira.

## 7. Regra de simplicidade

O suporte a aparelhos multilente deve permanecer tão pequeno quanto possível. A arquitetura **não deve evoluir** para:

- tentativas paralelas ou vários streams simultâneos;
- retries infinitos, polling ou watchdog de hardware;
- delays arbitrários;
- lógica específica por fabricante;
- múltiplos managers de câmera;
- scanner controlando lifecycle ou hardware;
- implementações independentes de câmera sem necessidade comprovada.

O único timeout produtivo específico do preview é a janela limitada atual de 5 segundos para aguardar uma imagem plausível; ele não repete aquisição e não autoriza acrescentar delays arbitrários.

## 8. Lifecycle real do `MediaStream`

### 8.1 Caminho normal

> solicitação → stream recebido → validação da sessão e da track → associação ao vídeo → `play()` → validação da imagem do preview → câmera pronta → decoder → uso contínuo → cleanup

- Uma abertura começa chamando o cleanup central, incrementando a identidade da sessão anterior e criando uma nova identidade.
- `initInProgressRef` bloqueia cliques concorrentes. O diagnóstico isolado também bloqueia a câmera produtiva e vice-versa.
- O stream só é registrado em `streamRef` e anexado ao vídeo depois dos guards iniciais.
- O scanner só é configurado após `play()` e a confirmação de dimensões plausíveis.
- Após validar uma passagem/serviço, overlays podem pausar o intervalo do decoder, mas o stream permanece para a próxima leitura. Ao fechar o resultado, o decoder volta a ler a mesma câmera.

### 8.2 Troca, fechamento, rota e unmount

- **Troca frontal ↔ traseira:** a nova abertura começa por `cleanupCamera('new_session')`; intervalo do decoder, `srcObject` e tracks anteriores são encerrados antes do novo `getUserMedia`.
- **Fechamento manual:** o botão chama `cleanupCamera('user_closed')`.
- **Unmount/mudança de rota:** o cleanup do efeito marca o componente desmontado e chama `cleanupCamera('component_unmount')`. Navegar para fora desmonta a tela e libera o hardware.
- **Background:** em `visibilitychange` para `hidden`, se não houver aquisição em andamento e a câmera estiver pronta, chama `cleanupCamera('page_background')`. Não existe reabertura automática ao voltar.
- **Prompt durante aquisição:** um `hidden` enquanto `getUserMedia` está pendente não dispara cleanup imediato. Quando a Promise resolve, o stream só é aceito se a página estiver visível e a sessão ainda for atual; caso contrário, suas tracks são paradas.

### 8.3 Falhas e respostas obsoletas

- **Stream inválido:** é parado antes de ser publicado como pronto.
- **Erro em `play()` ou preview:** se aquele stream ainda estiver anexado, `srcObject` é limpo e as tracks são paradas; o ownership por referência impede limpar um stream posterior.
- **Resposta obsoleta antes do attach:** suas tracks são paradas sem associação ao vídeo.
- **Resposta obsoleta após preview:** só limpa `srcObject` se ele ainda aponta para o próprio stream antigo; para suas próprias tracks e não toca no stream novo.
- **Elemento de vídeo recriado:** se ainda houver stream produtivo, ele é reanexado e `play()` é chamado; uma rejeição nessa reanexação é ignorada e não cria nova aquisição.

## 9. Critérios atuais de stream e preview válidos

Uma aquisição produtiva só prossegue quando:

1. ainda pertence à sessão atual, o componente está montado e a página está visível;
2. existe ao menos uma video track (`getVideoTracks()[0]`);
3. `stream.active` é verdadeiro;
4. `track.readyState === 'live'`;
5. `video.play()` resolve;
6. `videoWidth >= 16` e `videoHeight >= 16`, imediatamente ou em eventos `loadeddata`, `canplay` ou `resize`, dentro de 5 segundos.

Dimensões como **2 × 2** são placeholders observados em navegadores e não demonstram que existe um preview real; por isso não satisfazem o limiar mínimo. `play()` isoladamente também não comprova que um frame utilizável chegou.

## 10. Decoder e leitura contínua

- Após o preview ser aprovado, o sistema prefere `BarcodeDetector({ formats: ['qr_code'] })` quando a API existe.
- Se `BarcodeDetector` não existir, usa `jsQR`: desenha o frame atual em canvas, obtém os pixels e decodifica sem tentativas de inversão.
- O loop ocorre a cada 300 ms enquanto câmera e scanner estão prontos e não há processamento, lock ou overlay bloqueando a leitura.
- O decoder é exclusivamente leitor de frames. Não possui, não substitui, não encerra e não readquire o `MediaStream`.
- Exceções consecutivas são registradas no console; após três, a UI avisa que não conseguiu ler e que a câmera continua ativa. Um ciclo de decode sem exceção zera o contador e recupera o aviso.
- Ausência de QR não é erro de hardware. Depois de 15 segundos sem sucesso pode aparecer um aviso operacional, sem reiniciar a câmera.
- A leitura válida chama o fluxo já existente de validação de passagem/serviço. Depois do resultado, a mesma câmera pode continuar para a próxima leitura.

**Regra absoluta:** erro do decoder não deve reiniciar o hardware da câmera.

## 11. Cleanup e ownership

O cleanup produtivo central:

1. incrementa `sessionIdRef`, invalidando respostas antigas;
2. cancela o intervalo do decoder;
3. atribui `null` ao `srcObject` do vídeo anexado;
4. chama `stop()` em **todas** as tracks do stream;
5. limpa `streamRef`, referência do vídeo anexado, detector, engine e flags de readiness/abertura/torch;
6. atualiza estado React somente enquanto o componente estiver montado.

O cleanup é idempotente. A identidade da sessão e as comparações de identidade do stream evitam que uma sessão antiga encerre, desassocie ou apague as refs de uma sessão nova.

O laboratório diagnóstico possui refs e cleanup próprios, mas é mutuamente exclusivo com o fluxo produtivo. Essa separação é uma ferramenta temporária de diagnóstico, não um segundo manager produtivo.

## 12. Ferramentas atuais de diagnóstico

### 12.1 Restritas a developer mobile autenticado

O mesmo guard usado pelo console móvel Eruda (`developer`, usuário autenticado, viewport mobile e autenticação já carregada) controla:

- **Eruda**, carregado dinamicamente como console de desenvolvimento móvel;
- logs `[CAMERA]` em `console.info`, com buffer em memória limitado aos 100 eventos mais recentes;
- **Copiar logs da câmera**, incluindo data, rota, user agent e eventos;
- **Limpar logs**;
- card **Diagnóstico isolado da câmera**, com teste frontal/traseiro, snapshot após aquisição, snapshot após `video.play()`, eventos `ended`/`mute`/`unmute`, fechamento e **Copiar resultado**.

O diagnóstico isolado exige fechar a câmera normal e usa ownership independente, constraints por `facingMode` iguais às do helper produtivo e cleanup próprio. Ele não executa o scanner.

### 12.2 Seleção manual

A seleção manual de lente é uma recuperação mostrada após erro quando há lentes disponíveis; **não está restrita a developer atualmente**. Não se deve documentá-la como ferramenta exclusiva de developer sem antes mudar conscientemente o produto em tarefa própria.

As ferramentas diagnósticas não fazem parte da experiência normal de roles comuns, não devem ser expostas a esses roles e podem ser removidas futuramente ao final da homologação. Essa afirmação não inclui a recuperação manual atualmente visível aos operadores.

## 13. Matriz oficial de compatibilidade

Esta tabela registra somente a evidência fornecida para este baseline; não transforma ausência de teste em aprovação.

| Ambiente | Frontal | Traseira | Estado |
| --- | --- | --- | --- |
| Chrome Android | Funcional | Funcional | Homologado no aparelho de teste |
| WebView Android | Funcional | Não funcional | Em investigação |
| Safari iPhone | Pendente de homologação | Pendente de homologação | Pendente de homologação |
| WebView iOS | Pendente de homologação | Pendente de homologação | Pendente de homologação |

Não há, no material desta tarefa, evidência suficiente para declarar Safari iPhone ou WebView iOS funcionais ou não funcionais.

## 14. **Proteção do baseline web durante correções de WebView**

> **A correção da câmera traseira no WebView Android ou iOS NÃO deve alterar o fluxo web produtivo sem evidência de necessidade.**

Preferência de responsabilidade:

| Camada | Responsabilidade preferencial |
| --- | --- |
| SmartBus web | escolher a câmera → gerenciar o stream → exibir preview → ler QR |
| WebView/container | fornecer permissões e suporte necessários → permitir que o fluxo web existente funcione |

Se o problema estiver exclusivamente no container WebView, a correção deve preferencialmente ocorrer no container, preservando o fluxo web já homologado. Qualquer mudança no fluxo web exige teste de regressão completo no navegador antes de ser aceita.

## 15. **NÃO REGREDIR**

Antes de qualquer mudança relacionada à câmera, garantir:

- Chrome Android frontal continua funcionando;
- Chrome Android traseira continua funcionando;
- lente traseira já aprovada continua sendo reutilizada;
- troca frontal → traseira continua funcional;
- troca traseira → frontal continua funcional;
- somente um stream fica ativo;
- fechar câmera libera hardware;
- sair da tela libera hardware;
- scanner continua lendo QR;
- erros do decoder não reiniciam câmera.

> Uma mudança que corrija WebView, mas quebre Chrome Android, é **REGRESSÃO E NÃO DEVE SER ACEITA**.

## 16. Checklist obrigatório antes de alterar a câmera

- [ ] Li este PRD antes de alterar a câmera
- [ ] Identifiquei se o problema está no web ou no container
- [ ] Preservei o baseline funcional do navegador
- [ ] Não criei segundo fluxo de câmera sem necessidade
- [ ] Não adicionei retry/polling sem evidência
- [ ] Não alterei regras de QR desnecessariamente
- [ ] Mantive comentários das decisões não óbvias
- [ ] Executei testes automatizados existentes
- [ ] Testei câmera frontal no Chrome Android
- [ ] Testei câmera traseira no Chrome Android
- [ ] Testei troca entre câmeras
- [ ] Confirmei cleanup
- [ ] Testei o ambiente alvo da nova alteração

## 17. Estratégia obrigatória para alterações futuras

1. reproduzir;
2. coletar log;
3. identificar a camada responsável;
4. aplicar a menor mudança;
5. testar o ambiente alvo;
6. executar regressão no baseline web;
7. somente então aceitar.

Nunca seguir o antipadrão:

> erro → adicionar fallback → adicionar retry → adicionar outro fluxo → testar depois

## 18. Comentários que devem preservar decisões

Decisões não óbvias devem possuir comentários curtos no código explicando **por que** existem, especialmente:

- seleção serial da lente traseira;
- preferência persistida da lente funcional;
- ownership do stream pelo lifecycle, não pelo decoder;
- descarte de sessão obsoleta por identidade;
- guards de stream e dimensões plausíveis;
- diferenças de WebView que forem inevitáveis e comprovadas.

Comentários devem proteger decisões, não narrar o óbvio nem justificar complexidade sem evidência.

## 19. Histórico resumido e baseline Git

A câmera traseira inicialmente funcionava no navegador enquanto o problema permanecia no WebView. Alterações posteriores provocaram regressões também no web e exigiram novas investigações para recuperar o fluxo. A exposição de múltiplas lentes por aparelhos Android tornou necessário selecionar serialmente uma lente traseira que realmente entregue vídeo, em vez de confiar apenas na concessão de `getUserMedia`. O estado recuperado passou a ser baseline protegido.

O snapshot oficial inspecionado por este PRD é o commit **`eea0f3dab3ea3c17b9545468731f1e9a709f84fa`**. Nesse snapshot, a versão atual da arquitetura de câmera veio do marco **`3f2ac4d`**, e não houve alteração posterior nos arquivos centrais de câmera até o baseline.

Commits relevantes para compreender a arquitetura presente, sem tratá-los como roteiro de reversão:

| Commit | Contribuição histórica identificada |
| --- | --- |
| `3f2ac4d` | varredura de lentes e preferência local presentes no baseline |
| `6374c94` | promoção de lente traseira aprovada e testes do validador |
| `ecf3a6e` | preparação/aquisição serial do vídeo |
| `9583381` | simplificação do tratamento de track encerrada |
| `d3ab0dd` | lifecycle de `visibilitychange` e simplificação do fluxo |
| `3c98aa6` | validação da imagem antes do scanner |
| `6ddf16d` | rejeição de stream inativo |
| `3158cf7` | buffer e cópia dos logs de câmera |
| `3770aa0` | diagnóstico isolado |

Esses hashes servem para comparação e contexto. Não autorizam revert, cherry-pick ou troca de branch.

## 20. Código-fonte e testes relacionados

Arquivos realmente presentes e relevantes ao baseline:

- `src/pages/driver/DriverValidate.tsx` — UI, aquisição, seleção/varredura, lifecycle, preview, decoder, cleanup e diagnóstico isolado;
- `src/lib/driverPreferences.ts` — preferência local `smartbus_driver_back_lens`;
- `src/lib/cameraDiagnostics.ts` — buffer, logs `[CAMERA]`, limpeza e formatação para cópia;
- `src/components/system/MobileDeveloperConsole.tsx` — Eruda e guard reutilizado pelas ferramentas de diagnóstico;
- `src/pages/driver/DriverValidate.test.ts` — testes de constraints, serialização, troca, background, stream obsoleto/inválido, preview, decoder e cleanup;
- `src/pages/driver/DriverValidate.diagnostics.test.tsx` — visibilidade por role e cleanup/cópia do diagnóstico;
- `src/lib/cameraDiagnostics.test.ts` — buffer, limite, serialização, formatação e limpeza dos logs;
- `src/components/system/MobileDeveloperConsole.test.tsx` e `src/components/system/MobileDeveloperConsole.race.test.tsx` — ativação, autorização e concorrência do Eruda;
- `src/App.tsx` — declaração da rota `/validador/validar`.

Análises históricas auxiliares, que não substituem este PRD:

- `docs/Analises/analise-camera-chrome-android-validador.md`;
- `docs/Analises/analise-camera-qr-smartbus.md`;
- `docs/Analises/analise-camera-webview-selecao-dispositivo.md`;
- `docs/Analises/implementacao-ajustes-camera-dominio-oficial.md`;
- `docs/Analises/refatoracao-camera-fase-1.md`.

## 21. Limites deste PRD

Este documento registra o comportamento encontrado no código e as evidências de homologação declaradas para o baseline. Ele não:

- altera câmera, WebView, Android, iOS, backend, banco ou testes;
- declara homologação que não ocorreu;
- propõe nova arquitetura;
- transforma ferramentas temporárias de diagnóstico em requisitos permanentes;
- autoriza mudanças oportunistas.
