# Câmera traseira: o problema está fora do código do validador

## O que os dois logs provam

Os logs são conclusivos e apontam para o mesmo comportamento nos dois caminhos:

- **Fluxo produtivo** (sessão 4): constraint `{ video: { facingMode: { ideal: 'environment' } }, audio: false }`, uma única chamada, `getUserMedia` demora **4753 ms** e resolve com `streamActive: false` e `trackReadyState: "ended"`.
- **Laboratório isolado**: mesma constraint mínima, sem React, sem decoder, sem scanner — `4583 ms` e novamente `ended`, com `videoWidth: 2` após o play (imagem morta).
- **Frontal**: `533 ms`, `live`, 480x640, preview normal.

O laboratório isolado é praticamente o `getUserMedia` puro. Ele reproduz a falha. Isso descarta código de sessão, cleanup, decoder, layout, lifecycle e constraints como causa: **o navegador está entregando uma track já encerrada para a lente traseira deste aparelho**. Nenhuma reescrita adicional no `DriverValidate.tsx` muda isso — as tentativas anteriores (enumeração, `deviceId: exact`, fila de lentes, `ideal`) já cobriram o espaço de constraints e todas terminaram no mesmo `ended`.

O padrão (4-5 s de espera seguidos de track morta, só na traseira) é o comportamento típico do Android quando o HAL da câmera traseira não consegue abrir: lente ocupada por outro app/serviço, câmera do sistema em estado inconsistente, ou falha específica do aparelho/versão do Chrome.

## O que proponho fazer

### 1. Confirmar fora do SmartBus (você, no aparelho — 2 minutos)

Antes de qualquer alteração de código, precisamos saber se é o aparelho ou o Chrome:

1. Reiniciar o aparelho (libera o HAL da câmera de forma confiável).
2. Abrir o app **Câmera** nativo e confirmar que a traseira funciona; fechar o app completamente.
3. No mesmo Chrome, abrir `https://webcamtests.com` (site neutro, nada do SmartBus) e testar a câmera traseira.
4. Se possível, repetir em um segundo aparelho Android.

Resultado esperado:

- **Falha também no webcamtests** → é o aparelho/navegador. O código do validador está correto e não será alterado; a saída é operacional (reiniciar, atualizar Chrome, usar outro aparelho, ou o app nativo Android que já existe no projeto).
- **Funciona no webcamtests e falha no SmartBus** → aí sim existe algo específico da nossa página. Nesse caso investigo em seguida com foco em Permissions-Policy/iframe de preview, contexto de origem e ciclo de vida — e trago a correção mínima.

### 2. Ajuste mínimo no validador, independente do resultado

Uma única mudança de produto, sem tocar na lógica de aquisição:

- Quando a traseira retornar track encerrada, a tela passa a exibir uma mensagem objetiva e acionável no lugar do erro técnico atual: "A câmera traseira foi liberada pelo navegador, mas encerrada pelo sistema do aparelho. Feche outros apps que usem a câmera, reinicie o aparelho e tente novamente. Enquanto isso, use a câmera frontal ou o token manual."
- Botão de atalho para alternar para a frontal ao lado da mensagem (troca continua manual e explícita).

## O que não será feito

Sem retry automático, sleep, watchdog, fila de lentes, `enumerateDevices`, `deviceId`, resolução forçada, fallback silencioso ou regra por fabricante. Esse caminho já foi percorrido e não é a causa.

## Detalhes técnicos

Arquivo alterado no item 2: `src/pages/driver/DriverValidate.tsx` (apenas o texto de `CameraStreamInvalidError` e o botão de troca na área de erro). Nada de backend, banco, pagamentos, vendas ou autenticação é tocado. O laboratório isolado e o log de homologação permanecem como estão, restritos a developer.
