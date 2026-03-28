# Tarefa: Ajuste visual do topo da vitrine da empresa em mobile (/empresa/:slug)

## Contexto
Na vitrine pública da empresa (`/empresa/busaooffoff`), o bloco superior (hero com capa + título + textos + selos + CTA) apresenta aparência de topo “estranho” em celular, com percepção de corte/colisão visual no título.

## Diagnóstico
### Sintoma
- Título do hero aparenta pouca folga no topo em viewport móvel.
- Em empresas com nome mais longo, o bloco superior fica visualmente comprimido.

### Onde ocorre
- Página: `src/pages/public/PublicCompanyShowcase.tsx`
- Região: section do hero quando `hasCover === true`.

### Evidência no código
- Hero com altura fixa em mobile (`h-[320px]`) enquanto concentra múltiplos elementos no mesmo bloco (título, parágrafo, selos e CTA).
- Título sem controle explícito de `leading`/largura máxima para cenários de nome comercial longo.

### Causa provável
- Relação entre altura fixa reduzida no mobile + densidade de conteúdo do hero.
- Resultado: sensação de clipping/compressão visual no topo.

## Correção mínima aplicada
1. Aumentada a altura do hero em mobile de `320px` para `420px` (mantendo `480px` em `sm+`).
2. Ajustado espaçamento interno do container (`space-y-4` em mobile).
3. Ajustado título com `max-w-2xl` e `leading-snug` em mobile para melhorar legibilidade e evitar sensação de corte.

## Impacto esperado
- Hero com melhor respiro vertical em celular.
- Título mais estável visualmente em nomes de empresa longos.
- Sem alteração de regras de negócio, dados, queries ou fluxo de compra.

## Riscos
- Hero ocupa mais altura em mobile (mudança intencional para estabilidade visual).
