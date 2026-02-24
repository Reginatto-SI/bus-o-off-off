

# Ajuste UX — Tela /cadastro-empresa (Slim Desktop)

## Resumo

Compactar a tela de cadastro de empresa para caber 100% na viewport desktop (1366x768+) sem scroll, mantendo visual SaaS profissional.

---

## Mudancas

### 1. Remover icone decorativo do card esquerdo
- Remover o bloco `<div className="bg-primary/10 rounded-full p-2.5 w-fit">` (linhas 128-130)
- Titulo sobe diretamente para o topo do aside

### 2. Compactar espacamento do aside (card esquerdo)
- Reduzir `gap-7` para `gap-4` no flex column
- Reduzir `space-y-3.5` para `space-y-2` no bloco titulo/subtitulo
- Reduzir `space-y-4` para `space-y-2.5` na lista de beneficios
- Reduzir padding: `p-5 lg:p-6` para `p-4 lg:p-5`

### 3. Compactar formulario (card direito)
- Reduzir padding do CardHeader: `pt-7 md:pt-8` para `pt-5 md:pt-5`
- Reduzir `space-y-2` do header para `space-y-1`
- Reduzir padding do CardContent: `pb-7 md:pb-8` para `pb-5 md:pb-5`
- Reduzir `space-y-4` do form para `space-y-3`
- Reduzir `gap-4` dos grids para `gap-3`
- Reduzir `space-y-2` de cada campo para `space-y-1.5`
- Reduzir altura dos inputs: `h-11` para `h-9`
- Reduzir tamanho do titulo: `text-2xl md:text-[1.75rem]` para `text-xl md:text-2xl`

### 4. Compactar container externo
- Reduzir `py-6` para `py-4`
- Reduzir `gap-5 lg:gap-7` para `gap-4 lg:gap-5`

### 5. Texto inferior (prova social)
- Manter inline, reduzir margem com o botao
- Usar separadores visuais: "Sem cartao de credito · Sem cobranca · Seus dados protegidos"

---

## Arquivo afetado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/public/CompanyRegistration.tsx` | Reducao de padding, gaps, alturas de input e remocao do icone decorativo |

Nenhuma logica, validacao ou campo e alterado. Apenas espacamento e proporções visuais.

