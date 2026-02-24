

# Refinamento do Popup de Conexao Stripe

## Resumo

Redesenhar o modal de conexao Stripe na tela `/admin/eventos` para ter visual mais profissional, inspirado no estilo do proprio Stripe (limpo, confiavel, premium). Adicionar texto complementar sobre o que acontece apos a conexao.

---

## Mudancas no modal (linhas ~3791-3826)

### 1. Icone e header
- Trocar `ShieldCheck` por icone de `CreditCard` ou manter `ShieldCheck` mas com fundo mais elegante (gradiente sutil roxo-para-azul ao inves de flat)
- Aumentar levemente o icone container para `h-14 w-14`
- Adicionar um badge "Seguro" ou "SSL" pequeno abaixo do icone

### 2. Titulo
- Manter: "Conecte sua conta Stripe para comecar a vender"
- Adicionar subtitulo mais forte com `font-medium` ao inves de `text-muted-foreground`

### 3. Corpo do modal - layout tipo Stripe
- Adicionar lista de beneficios com checkmarks verdes:
  - "Receba pagamentos via Pix e Cartao"
  - "Valores transferidos direto para sua conta"
  - "Processo 100% seguro e criptografado"
- Adicionar bloco de texto complementar:
  - "Apos conectar, voce podera criar eventos, definir precos e comecar a vender passagens imediatamente."
- Separador visual (linha sutil) antes dos botoes
- Texto de confianca no rodape: "Protegido por Stripe · Criptografia de ponta a ponta"

### 4. Botoes
- Manter "Cancelar" e "Conectar com Stripe"
- Botao principal com gradiente sutil `bg-gradient-to-r from-[#635BFF] to-[#7C3AED]`
- Botao maior: `h-11` ao inves de default

### 5. Container
- Aumentar largura maxima: `sm:max-w-lg` (de `sm:max-w-md`)
- Adicionar `p-6` extra no conteudo

---

## Arquivo afetado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/admin/Events.tsx` | Redesenhar bloco do modal Stripe (linhas 3791-3826) |

Nenhuma logica e alterada. Apenas visual e textos do modal.
