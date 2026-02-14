

# Ajuste Visual -- Foco na Empresa Organizadora

## Resumo

Todas as telas publicas de passagem (Confirmacao, Consulta, PDF e imagem QR) passarao a exibir a identidade da empresa organizadora do evento em vez do aplicativo. O evento ja esta vinculado a uma empresa via `company_id`, entao basta carregar esses dados e propaga-los.

---

## 1. Dados da empresa -- como obter

O evento possui `company_id`. Nas telas publicas, ao carregar o evento, faremos um join com `companies` para obter:
- `logo_url`
- `trade_name` (ou `name` como fallback)
- `city`, `state`
- `primary_color`

A tabela `companies` nao tem politica SELECT publica. Sera necessario adicionar uma politica RLS que permita leitura publica limitada (somente campos de identidade visual) para empresas ativas com eventos publicos.

---

## 2. Migracao de banco

Adicionar politica RLS na tabela `companies`:

```sql
CREATE POLICY "Public can view companies with public events"
  ON public.companies FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.company_id = companies.id
      AND e.status = 'a_venda'
    )
  );
```

Isso permite que o frontend consulte dados da empresa organizadora sem autenticacao.

---

## 3. Ampliar TicketCardData com dados da empresa

Adicionar campos ao tipo `TicketCardData`:
- `companyName: string`
- `companyLogoUrl: string | null`
- `companyCity: string | null`
- `companyState: string | null`
- `companyPrimaryColor: string | null`

**Arquivo:** `src/components/public/TicketCard.tsx`

---

## 4. Tela de Confirmacao (`Confirmation.tsx`)

### Alteracoes:
- Buscar `company` junto com o evento (join ou query separada via `sale.event.company_id`)
- Propagar dados da empresa para cada `TicketCard`
- No topo da secao de passagens, exibir bloco com:
  - Logo da empresa (se disponivel)
  - Nome fantasia
  - Cidade/UF
  - Texto "Transporte oficial do evento"
- Remover qualquer referencia visual ao aplicativo

---

## 5. Componente TicketCard (visual)

### Alteracoes:
- Adicionar no topo do card: logo + nome da empresa com estilo discreto
- Usar `primary_color` da empresa como cor de destaque na barra superior ou lateral do card
- Manter QR Code, dados do passageiro e botoes de acao
- Badge de status com visual mais refinado

---

## 6. PDF da Passagem (`ticketPdfGenerator.ts`)

### Cabecalho novo:
- Logo da empresa organizadora (lado esquerdo) em vez do logo do app
- Nome da empresa em destaque
- Cidade/UF abaixo
- Frase motivacional fixa (rotativa entre opcoes):
  - "Prepare-se para a melhor viagem da sua vida!"
  - "Nos vemos no embarque!"
  - "Partiu viver essa experiencia!"
- Cor do cabecalho usando `primary_color` da empresa

### Layout:
- Informacoes em blocos visuais claros e organizados
- QR Code centralizado com bom tamanho
- Badge "PAGA" mais elegante (com cantos arredondados e cor solida)
- Blocos separados: Evento, Data, Passageiro, CPF, Assento, Local, Horario

### Rodape:
- Apenas "Emitido digitalmente" (sem propaganda do app)

### Tecnico:
- Receber dados da empresa como parametro adicional
- Usar `loadImageAsBase64` de `pdfUtils.ts` para carregar logo da empresa via URL
- Fallback: se logo nao disponivel, exibir apenas nome textual

---

## 7. Imagem QR Code (PNG)

### Alteracoes no `handleDownloadImage` do TicketCard:
- Topo: logo da empresa (se disponivel) + nome da empresa
- Centro: QR Code grande
- Abaixo: Evento + Assento + Nome do passageiro
- Layout equilibrado com fundo branco e boa tipografia
- Parecer um "ingresso oficial"

### Tecnico:
- Carregar logo da empresa via Image() e desenhar no canvas
- Se logo indisponivel, exibir nome da empresa em texto grande

---

## 8. Tela Consultar Passagens (`TicketLookup.tsx`)

### Alteracoes:
- Ao buscar tickets, carregar tambem os dados da empresa vinculada ao evento
- Exibir no topo dos resultados: logo + nome da empresa
- Cada card de passagem recebe dados da empresa
- Melhorar espacamento e hierarquia visual
- Deve parecer que a consulta e feita no sistema da empresa

---

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/public/TicketCard.tsx` | Adicionar campos da empresa ao tipo, exibir logo/nome/cor no card, melhorar visual da imagem QR |
| `src/lib/ticketPdfGenerator.ts` | Cabecalho com empresa, frase motivacional, layout profissional, rodape discreto |
| `src/pages/public/Confirmation.tsx` | Buscar dados da empresa, propagar para TicketCards, bloco de identidade no topo |
| `src/pages/public/TicketLookup.tsx` | Buscar empresa, exibir identidade, melhorar layout |

## Migracao de banco

| Alteracao | Descricao |
|-----------|-----------|
| Politica RLS em `companies` | Permitir SELECT publico para empresas ativas com eventos a venda |

## O que NAO sera alterado

- Logica de pagamento, QR Code ou webhook
- Estrutura de rotas
- Logica de validacao de assentos
- Componentes do painel administrativo

