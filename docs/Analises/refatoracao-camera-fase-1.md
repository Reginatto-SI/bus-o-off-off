# Refatoração da câmera — fase 1

## Resumo

A fase 1 substitui o seletor implícito e heurístico por uma escolha explícita entre câmera traseira e frontal. O validador continua sendo o único proprietário do `MediaStream`, preserva `BarcodeDetector`, `jsQR`, torch, leitura contínua, token manual, RPCs e regras operacionais.

Nenhum código Android, iOS, Capacitor ou WebView foi alterado.

## Comportamento anterior

A abertura enumerava devices antes da permissão, podia criar um stream de bootstrap, enumerava novamente, classificava labels com regex multilíngue, lia uma preferência persistida de `deviceId`, percorria uma fila de câmeras físicas e usava `video:true` no final. Candidatos eram abertos e fechados com delays. Três erros do decoder reiniciavam todo o hardware.

## Complexidades removidas

Foram removidos do caminho e do componente:

- `enumerateDevices` e o bootstrap para liberar labels;
- classificação por nome, idioma, índice ou regex;
- seleção e fila por `deviceId`;
- preferência da última traseira no `localStorage`;
- múltiplas tentativas automáticas, delay entre lentes e fallback genérico automático;
- watchdog meramente informativo;
- testes raw, catálogo de devices, aprovação manual e painel diagnóstico antigo;
- polling de primeiro quadro e duas tentativas de `video.play()`;
- reinicialização da câmera em resposta a erro do decoder.

Não foi mantido fallback automático: se uma orientação falhar, a interface oferece retry ou a escolha consciente da outra câmera. Isso evita uma troca invisível e garante uma solicitação por sessão.

## Novo fluxo

```text
Usuário escolhe traseira ou frontal
→ cleanup completo da sessão anterior
→ cria cameraSessionId
→ uma chamada getUserMedia com facingMode ideal
→ descarta imediatamente resposta obsoleta
→ associa um stream ao vídeo
→ BarcodeDetector ou jsQR analisa o mesmo preview
→ QR é validado; decoder pausa durante overlay/processamento
→ “Ler próximo” reutiliza o stream
→ cleanup encerra timer, srcObject, tracks e sessão
```

## Arquivos alterados

- `src/pages/driver/DriverValidate.tsx`: núcleo, lifecycle, seleção e UX de erro;
- `src/pages/driver/DriverValidate.test.ts`: testes do novo contrato simples;
- `docs/Analises/refatoracao-camera-fase-1.md`: registro desta fase.

## Seleção frontal e traseira

Dois botões mobile substituem a descoberta implícita. “Câmera traseira” solicita `facingMode: { ideal: "environment" }`; “Câmera frontal” solicita `facingMode: { ideal: "user" }`. Não há dropdown, device ID, enumeração ou preload. Trocar a escolha encerra completamente o stream atual antes da nova aquisição.

## Lifecycle e sessão obsoleta

`cleanupCamera` é a rotina central e idempotente: invalida o ID corrente, para o intervalo do decoder, desassocia `video.srcObject`, chama `stop()` em todas as tracks, limpa refs, detector, torch e estados de câmera.

Cada aquisição captura um `cameraSessionId`. Depois de `getUserMedia` e depois de `video.play`, a implementação confirma que o componente continua montado e que o ID ainda é o atual. Caso contrário, para imediatamente todas as tracks sem associar/atualizar a nova sessão.

O mesmo cleanup atende nova sessão, troca manual, erro de captura, background e unmount/rota. Uma trava impede cliques repetidos durante aquisição.

## Decoder desacoplado

`BarcodeDetector` e `jsQR` continuam apenas analisando frames. Exceção do decoder atualiza uma mensagem operacional depois de ocorrências repetidas, mas não chama `getUserMedia`, não fecha track e não reinicia a câmera. Overlays e processamento pausam somente o intervalo; “Ler próximo” retoma com o stream atual.

## Logs temporários

Os logs `[CAMERA]` contêm apenas session ID, orientação, estágio, contagem de tracks, motivo e nome de erro: SESSION START/END, REQUEST, GRANTED, STREAM ATTACHED, DECODER START/STOP, TRACK STOP, ERROR e STALE STREAM DISCARDED. Não registram imagem, QR, token, passageiro ou device ID.

## Riscos restantes

- `facingMode ideal` é uma preferência e o navegador pode escolher outro dispositivo;
- aparelhos com múltiplas lentes escolhem a lente segundo política do navegador;
- uma Promise nativa de captura não é cancelável, embora sua resposta tardia seja imediatamente descartada;
- background durante o prompt permanece dependente do lifecycle do navegador;
- Safari iPhone e aparelhos Android reais ainda exigem homologação.

## Testes automatizados

A suíte cobre constraints traseira/frontal, uma solicitação, stop de todas as tracks, limpeza de `srcObject`, idempotência, ordem de troca, identificação/descarte de stream obsoleto, ausência de captura em erro do decoder e reutilização do stream para a próxima leitura. TypeScript e build também devem ser executados no CI.

## Checklist manual

### Chrome Android

- [ ] abrir traseira e ler QR;
- [ ] ler vários QR consecutivos no mesmo stream;
- [ ] fechar e abrir novamente;
- [ ] trocar traseira → frontal e frontal → traseira;
- [ ] sair da página e retornar;
- [ ] bloquear/desbloquear;
- [ ] background/foreground;
- [ ] negar permissão e escolher novamente;
- [ ] confirmar indicador de câmera desligado ao sair;
- [ ] confirmar que outro aplicativo usa a câmera depois.

### Safari iPhone

- [ ] repetir os mesmos cenários após homologação Android;
- [ ] confirmar `playsInline`, gesto do usuário e retomada.

### Desktop

- [ ] câmera presente, ausente e permissão negada.

## Fases posteriores

Homologar a matriz física, avaliar se mensagens precisam de refinamento e remover logs temporários após estabilização. WebViews Android/iOS devem reutilizar exatamente este fluxo web; permissões/containers nativos pertencem a tarefas posteriores.

## Refinamento final da Fase 1

### Problemas encontrados e correções

A revisão encontrou duas lacunas concretas de lifecycle. Primeiro, uma sessão A que ficasse obsoleta enquanto aguardava `video.play()` poderia limpar o `srcObject` já ocupado pela sessão B, embora parasse somente as tracks de A. O descarte agora compara a identidade do stream: A só desassocia o vídeo se o vídeo ainda apontar para A e sempre para exclusivamente suas próprias tracks.

Segundo, no unmount o callback de ref do React pode entregar `null` antes do cleanup do efeito. Apenas conservar o elemento montado em uma ref não garantia a limpeza de `srcObject` do elemento que recebeu o stream. Uma referência separada ao vídeo efetivamente associado é mantida até o cleanup central e limpa junto com o stream.

Também foram corrigidos: rejeição de `video.play()` agora desassocia e para o stream adquirido antes de propagar o erro; e o contador do decoder agora representa somente falhas consecutivas, sendo zerado no primeiro ciclo de decode sem exceção.

### Lifecycle final

`startCamera` continua protegido contra clique concorrente, encerra a sessão anterior e cria um único ID antes da única chamada a `getUserMedia`. A aquisição testável executa verificações de sessão logo após `getUserMedia` e depois do único `video.play()`. Apenas a sessão corrente pode publicar o stream, habilitar decoder/torch ou alterar estados visuais.

`cleanupCamera` permanece o único cleanup global. Ele invalida o ID, para o timer do decoder, limpa o `srcObject` associado, para todas as tracks, limpa stream/detector/torch e libera a trava. `selectedCamera` continua representando somente a escolha do usuário; atividade real é indicada por `cameraReady` e `streamRef`.

### Erros e nova tentativa

`NotAllowedError`, `NotFoundError`, `OverconstrainedError`, `NotReadableError`, `SecurityError` e `AbortError` possuem mensagens curtas e operacionais. O nome DOM permanece no log `[CAMERA]`, sem stack ou dados do QR. Nenhum erro abre automaticamente outra orientação: retry e troca continuam ações explícitas.

### Sessão obsoleta, background e unmount

Uma resposta obsoleta antes do play não é associada. Uma resposta obsoleta depois do play só desassocia se ainda for dona do `srcObject`; ela nunca chama o cleanup global nem toca no stream, estados, decoder ou torch da sessão nova. No background, câmera já ativa é encerrada. Durante uma aquisição pendente, `hidden` não invalida a sessão imediatamente porque pode representar o prompt de permissão: se a página voltar a `visible` antes da resolução, o stream é aceito normalmente; se a Promise resolver enquanto ainda estiver `hidden`, somente esse stream é parado e não é publicado. O retorno ao foreground não inicia nova captura. No unmount, o componente é marcado como desmontado antes do cleanup, o vídeo associado é limpo, timers/tracks são encerrados e respostas posteriores são descartadas sem setters.

### Decoder

Testes sobre o componente confirmam que erros repetidos de `BarcodeDetector` não readquirem nem param a câmera. O mesmo catch abrange `jsQR`: ele somente contabiliza e apresenta aviso. Um ciclo posterior sem exceção zera o contador e remove o aviso, mantendo o mesmo `MediaStream`.

### Testes fortalecidos

A suíte passou a montar o `DriverValidate` com mídia simulada e exercitar cliques concorrentes, troca real traseira/frontal com ordem de stop, unmount ativo e pendente, seis DOMExceptions, background ativo e pendente e decoder repetidamente falho. O helper de aquisição cobre ainda obsolescência antes e depois de `video.play()`, proteção do stream novo e rejeição de play sem órfão. Permanecem testes puros apenas para constraints, mensagens e idempotência, que são contratos puros.

### Riscos dependentes de homologação física

Permanecem dependentes de aparelhos reais: comportamento do prompt de permissão ao emitir `visibilitychange`, política de escolha de lente para `facingMode: ideal`, lifecycle de Safari após bloqueio do aparelho e tempo de liberação imposto pelo sistema operacional. Nenhum desses riscos justifica reintroduzir enumeração, IDs, filas, delays ou fallback automático nesta fase.
