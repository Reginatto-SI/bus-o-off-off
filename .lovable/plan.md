

## Plano: Refinamento de UX na tela de consulta de passagens

### Arquivo: `src/pages/public/TicketLookup.tsx`

### Mudanças pontuais (apenas textos e espaçamento)

#### 1. Ícone e cabeçalho (linhas 302-308)
- Reduzir ícone de `w-16 h-16` para `w-14 h-14` e de `h-8 w-8` para `h-7 w-7`
- Reduzir espaço entre ícone e título de `mb-4` para `mb-3`
- Título: `"Consultar Passagens"` → `"Encontrar minha passagem"`
- Subtítulo: → `"Informe o evento e o CPF utilizado na compra para localizar suas passagens."`

#### 2. Card header (linha 312)
- `"Buscar Passagens"` → remover o CardTitle ou manter algo mais leve como manter sem alteração (o card já tem contexto pelo cabeçalho). Manter `"Buscar Passagens"` como está para não quebrar estrutura — o foco é nos campos.

#### 3. Label do evento (linha 316)
- `"Evento"` → `"Evento da viagem"`
- Placeholder (linha 329): `"Selecione o evento"` → `"Selecionar evento"`

#### 4. Campo CPF (linhas 341-348)
- Manter label `"CPF do Passageiro"`
- Adicionar texto auxiliar abaixo do Input: `<p className="text-xs text-muted-foreground mt-1">Use o CPF do passageiro ou o CPF utilizado na compra.</p>`

#### 5. Botão (linhas 351-358)
- Texto: `"Buscar Passagens"` → `"Ver minhas passagens"`

#### 6. Dica no rodapé do card (após o botão, antes do fechamento de CardContent)
- Adicionar: `<p className="text-xs text-muted-foreground text-center pt-2">Dica: utilize o CPF informado no momento da compra da passagem.</p>`

### Nenhuma alteração de lógica, API, rotas ou banco de dados.

