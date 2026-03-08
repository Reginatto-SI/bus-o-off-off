

## Diagnostico: Camera preta no scanner do motorista

### Causa raiz identificada

O `useEffect` que inicializa a camera roda **uma unica vez no mount** (`[]` deps). Porem, quando o componente monta, o estado `loading` do AuthContext ainda e `true`, e o componente retorna um `<Loader2>` — o elemento `<video>` **nao existe no DOM ainda**.

Fluxo do bug:

```text
1. Componente monta → useEffect dispara startScanner()
2. loading=true → JSX renderiza <Loader2>, NÃO renderiza <video>
3. startScanner() chama getUserMedia() → stream criado com sucesso
4. videoRef.current é NULL → srcObject nunca é atribuído
5. setCameraReady(true) nunca é chamado
6. loading termina → <video> aparece, mas stream já foi perdido
7. Resultado: tela preta
```

O `videoRef` so e atribuido ao `<video>` quando a auth resolve e o JSX completo e renderizado. Mas a essa altura o effect ja rodou e falhou silenciosamente no `if (videoRef.current)`.

### Correcao

**Arquivo**: `src/pages/driver/DriverValidate.tsx`

1. **Separar a inicializacao da camera do mount** — usar um segundo `useEffect` que observa quando o `<video>` esta pronto (apos auth resolver), ou adicionar `loading` e `userRole` como dependencias para re-tentar.

2. **Solucao mais simples e segura**: mover a logica de camera para um effect que depende de um flag `videoMounted` (set via callback ref), ou simplesmente adicionar um state `videoReady` que so e `true` apos o JSX com `<video>` ser renderizado.

Implementacao concreta:
- Trocar `useRef<HTMLVideoElement>` por um **callback ref** que, quando o `<video>` e montado, dispara a inicializacao da camera
- Ou: adicionar `user` e `userRole` como deps do effect, para que ele re-execute quando a auth resolver e o `<video>` existir no DOM
- Garantir cleanup correto do stream anterior antes de re-inicializar
- Adicionar `autoPlay` ao `<video>` como fallback extra para mobile

3. **Melhorias menores para robustez mobile**:
- Adicionar `webkit-playsinline` para Safari iOS antigo
- Fallback de `facingMode` se a constraint falhar (tentar sem constraint)
- Log mais claro no console para depuracao

### Resumo

- 1 arquivo modificado: `DriverValidate.tsx`
- Causa: race condition entre useEffect e renderizacao condicional da auth
- Fix: garantir que a camera so inicia quando o `<video>` esta no DOM
- 0 alteracoes de banco, 0 edge functions

