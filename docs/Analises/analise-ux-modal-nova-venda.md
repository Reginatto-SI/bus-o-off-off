# Análise UX — Modal **Nova Venda** (`/admin/vendas`)

## Escopo desta análise

Esta análise cobre apenas o estado atual do modal `Nova Venda` e estratégias de melhoria **visual** com mudança mínima, sem alterar regras de negócio, integrações de pagamento, Asaas, criação de tickets ou arquitetura.

---

## 1) Diagnóstico da estrutura atual

## 1.1 Componente principal

O modal é centralizado em `src/components/admin/NewSaleModal.tsx` e usa uma estrutura de wizard em 3 etapas (mais um passo 4 de comprovante após confirmação):

- `step 1`: Evento
- `step 2`: Assentos
- `step 3`: Pagamento (dados de venda/passageiros)
- `step 4`: Comprovante de Reserva (após criação)

A raiz visual usa `Dialog` + `DialogContent` com altura fixa (`h-[90vh]`) e conteúdo em `ScrollArea`, mantendo header e footer separados.

## 1.2 Controle do tipo de operação (Venda Manual / Reserva / Bloqueio)

O tipo é controlado por:

- estado: `activeTab` (`manual | reserva | bloqueio`)
- UI: `Tabs`, `TabsList`, `TabsTrigger`
- reset de contexto ao trocar aba: `handleTabChange`

Comportamento atual da troca:

- ao mudar aba, sempre volta para `step = 1`
- limpa assentos selecionados, passageiros, snapshots de benefício, observação e dados de confirmação
- mantém o mesmo fluxo de etapas (wizard compartilhado entre abas)

## 1.3 Controle de etapas (Evento → Assentos → Pagamento)

As etapas são dirigidas por:

- estado numérico `step`
- metadata `stepMeta` com label + ícone (`Bus`, `Users`, `CreditCard`)
- validações de avanço:
  - `canGoStep2` (evento + transporte + embarque)
  - `canGoStep3` (ao menos 1 assento)
  - `canConfirm` (validação final por tipo de operação)

No rodapé:

- `Voltar` (quando `step > 1`)
- `Cancelar`
- `Continuar para assentos` (steps 1 e 2)
- `Confirmar` (step 3)

## 1.4 Cards/campos principais

No `step 1`, os blocos já são “cards” com `rounded + border + bg-muted/20`:

- Evento
- Transporte
- Local/Horário de embarque
- Resumos contextuais (evento, embarque, disponibilidade)

No `step 2`:

- mapa de assentos (`SeatMap`) com estados de loading/empty

No `step 3`:

- bloco específico por aba (`manual`, `reserva`, `bloqueio`)
- formulários de passageiro
- resumo financeiro e simulação

---

## 2) Pontos visuais fracos observados

1. **Topo de operação pouco expressivo**: as abas de tipo (`TabsTrigger`) estão funcionais, mas com baixa hierarquia visual para uma decisão importante do fluxo.

2. **Stepper com baixa percepção de progresso**: apesar de ter ícones e estados, o indicador atual se parece com “chips alinhados”, sem forte sensação de jornada.

3. **Peso visual homogêneo**: quase todos os blocos usam variações próximas de borda/fundo, reduzindo contraste entre:
   - decisão crítica (tipo de operação),
   - progresso (etapa),
   - preenchimento de dados.

4. **Copy de CTA não contextual no step 2**: o botão “Continuar para assentos” aparece também no `step 2`; funcionalmente funciona (avança para pagamento), mas o texto reduz clareza de microinteração.

5. **Densidade de informações no step 3**: para vendas com muitos passageiros, a pilha de cards cresce rápido e deixa a leitura menos “clean”.

---

## 3) Viabilidade de transformar as opções em cards de seleção

## 3.1 É viável?

**Sim, com baixo risco**, desde que a camada de interação continue usando o mesmo `Tabs`/`activeTab` já existente.

## 3.2 Como fazer sem mexer na lógica

Manter:

- `Tabs` como estado/fonte de verdade
- `handleTabChange` intacto
- regras de `disabled` da aba `reserva` intactas

Alterar só apresentação dos `TabsTrigger` para visual de card:

- ícone por tipo (ex.: manual, reserva, bloqueio)
- título
- descrição curta
- estado ativo com borda/fundo destacados
- check visual no ativo

Ou seja: **não criar novo fluxo**, apenas “skin” visual no bloco existente.

---

## 4) Stepper Evento → Assentos → Pagamento: melhoria visual sem mudar lógica

Também é viável com risco baixo:

- manter `step`, `stepMeta` e condições de avanço
- manter `setStep` e validações atuais
- mudar apenas composição visual (ex.: trilha mais evidente, número/ícone em círculo, estados ativo/concluído/pendente mais contrastantes)

Ponto importante: não mexer em handlers de navegação no footer.

---

## 5) Riscos ao mexer nessa tela

1. **Risco de regressão funcional ao trocar estrutura JSX** do topo/stepper se acoplar visual com lógica.
2. **Risco de perda de acessibilidade** ao substituir sem preservar comportamento de tabs (teclado/foco/aria).
3. **Risco de inconsistência entre abas** se estilos condicionais não respeitarem `disabled` (Reserva bloqueada por política).
4. **Risco de quebra de responsividade**: modal já é denso; cards grandes podem piorar em larguras menores.
5. **Risco de drift de padrão visual** se usar estilos não alinhados com tokens já utilizados (`border`, `bg-muted`, `text-muted-foreground`, etc.).

---

## 6) Menor melhoria visual segura (recomendação)

Sequência de menor risco (ordem sugerida):

1. **Melhorar apenas o bloco de tipo de operação** (`TabsList/TabsTrigger`) para “cards compactos” com ícone + descrição curta + check no ativo.
2. **Ajustar stepper** para aumentar contraste de estado e percepção de progresso, sem alterar `stepMeta` nem navegação.
3. **Ajustar microcopy do botão de avanço** por etapa (somente texto visual, sem alterar comportamento), para reduzir ambiguidade.

Essa combinação já tende a deixar o modal mais moderno/profissional mantendo 100% da regra atual.

---

## 7) Componentes/arquivos impactados (se a melhoria for executada depois)

Impacto principal (obrigatório):

- `src/components/admin/NewSaleModal.tsx`

Impacto opcional e mínimo (somente se necessário para padronização visual):

- tokens/classes utilitárias já existentes do projeto (sem criar arquitetura nova)

Não há necessidade de alterar:

- regras de venda
- integração Asaas
- geração de ticket
- serviços/backend

---

## 8) Recomendação final de caminho

Para deixar a tela mais interessante, moderna e clara **com segurança**:

1. Tratar o topo (tipo de operação) como a decisão principal do fluxo via cards visuais, mas mantendo `Tabs` como motor de estado.
2. Reforçar o stepper com hierarquia visual de progresso (ativo, concluído, pendente) sem alterar nenhuma condição de navegação.
3. Preservar integralmente os blocos de formulário e validações atuais, limitando mudanças a estilo/layout/rotulagem.
4. Executar em PR de escopo curto, com validação manual focada em:
   - troca de abas,
   - avanço/volta de etapas,
   - estado desabilitado de `Reserva`,
   - confirmação final em cada tipo (`manual`, `reserva`, `bloqueio`).

Esse é o melhor trade-off entre ganho visual e risco operacional para o modal atual.
