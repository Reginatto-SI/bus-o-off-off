# 🧠 PRD — Módulo de Passeios & Serviços (SmartBus BR)

## 🎯 Ação Desejada
Criar um módulo no SmartBus BR para permitir a **venda e controle de passeios/serviços turísticos durante excursões**, com operação rápida, simples e integrada ao sistema atual, sem alterar o fluxo de venda de passagens.

---

## 📌 Contexto

O SmartBus hoje atende a venda de passagens (pré-viagem).

Na prática das agências:
- Passeios são vendidos **durante a viagem ou no destino**
- Venda é **impulsiva e operacional**
- Nem todos compram antecipadamente
- É necessário:
  - controle financeiro
  - controle de capacidade
  - controle de vendas por vendedor

👉 Este módulo cobre esse momento sem alterar o core do sistema.

---

## 🧩 Premissas do Projeto

- Módulo **acoplado ao evento (excursão)**
- NÃO altera o checkout atual
- Reutiliza o motor de vendas existente
- Reutiliza lógica de pagamento (Asaas)
- Segue diretrizes:
  - sem fluxos paralelos desnecessários
  - comportamento previsível
  - reutilização de estrutura existente

---

## 🏗️ Estrutura do Sistema

---

## 1. Cadastro de Serviços (Base)

Tela:
👉 `/admin/servicos`

Objetivo:
Cadastrar serviços reutilizáveis.

Campos:

- nome
- descrição
- tipo de unidade (`unit_type`):
  - `pessoa`
  - `veiculo`
  - `unitario`
- tipo de controle:
  - `validacao_obrigatoria`
  - `sem_validacao`
- ativo/inativo

---

## 2. Serviços dentro do Evento

Tela:
👉 Evento → Aba **Serviços**

Objetivo:
Configurar serviços disponíveis naquela excursão.

Campos:

- serviço (referência ao cadastro base)
- valor base
- tipo de cobrança (herdado ou sobrescrito)
- capacidade total
- permite venda no checkout (sim/não)
- permite venda avulsa (sim/não)
- ativo/inativo

---

## 3. Controle de Capacidade

Para cada serviço no evento:

- quantidade vendida
- quantidade disponível
- bloqueio automático ao atingir limite

---

## 💰 Venda de Serviços

---

## 4. Novo fluxo operacional

Tela:
👉 `/vendas/servicos`

Fluxo:

1. Selecionar evento
2. Selecionar serviço
3. Informar quantidade (dinâmica por tipo)
4. Aplicar preço (automático)
5. Selecionar forma de pagamento:
   - Pix
   - Dinheiro
   - Link
6. Confirmar venda

Tempo ideal:
👉 menos de 10 segundos

---

## 5. Unidade de Venda (Regra Crítica)

Cada serviço possui `unit_type`:

---

### 🧍 Pessoa

Ex: mergulho, catamarã

- usuário informa quantidade de pessoas
- pode informar nomes (opcional)
- NÃO exigir CPF

---

### 🚗 Veículo

Ex: buggy

- usuário informa quantidade de veículos
- não exige dados adicionais no MVP

---

### 📦 Unitário

- quantidade simples

---

## 6. Estrutura da Venda

Reutilizar `sales` existente.

Adicionar conceito:

### `sale_items`

Campos:

- sale_id
- service_id
- unit_type
- quantidade
- valor_unitario
- valor_total

---

## 7. Pessoas na Venda (Opcional)

Para serviços tipo `pessoa`:

- permitir adicionar nomes (opcional)
- não obrigar CPF
- foco operacional

---

## 💸 Regras de Pagamento

---

## 8. Padrão de pagamento

Seguir fluxo atual:

- venda nasce como `pendente`
- confirmação via webhook
- fallback via verify

👉 sem alteração no gateway

---

## 9. Venda em dinheiro

Permitido:

- criar venda normalmente
- status inicial: `pendente_taxa`
- sistema só valida após regularização

---

## 🎫 Validação

---

## 10. QR Code

- gerar **QR único por venda**
- não gerar QR por pessoa

---

## 11. Regras de validação

### Quando `validacao_obrigatoria`:

- exige status válido (pago ou taxa ok)
- permite leitura/validação

---

### Quando `sem_validacao`:

- não gera QR
- apenas controle financeiro

---

## 💰 Preço e Variação

---

## 12. Regra de preço

O sistema deve permitir:

- preço base
- variação por quantidade

Ex:

- 1 buggy → R$ 250  
- 2 buggies → R$ 480  

Implementação:

- permitir ajuste manual no momento da venda
OU
- regra futura de tabela de preço

(MVP: ajuste manual permitido)

---

## 👤 Vendedor

- qualquer usuário autorizado pode vender
- reutilizar controle de vendedor existente
- comissão continua funcionando normalmente

---

## 📊 Relatórios

Adicionar:

- receita por serviço
- quantidade vendida por serviço
- vendas por vendedor (já existente)
- total por evento (passagem + serviços)

---

## 💸 Repasse (Manual)

Permitir:

- definir custo do serviço
- calcular margem
- visualizar valores

⚠️ Não implementar split automático nesta fase

---

## 🎯 Critérios de Sucesso

- venda realizada em menos de 10 segundos
- sistema não trava com venda em dinheiro
- controle de capacidade funciona corretamente
- não interfere no fluxo de passagens
- mantém consistência financeira

---

## 🚫 Restrições

- não alterar checkout atual
- não criar novo sistema de pagamento
- não exigir CPF
- não criar módulo de logística (guia, horário, veículo)
- não implementar split nesta fase

---

## 🔮 Evolução futura

- horários por passeio
- controle de guias
- controle de veículos
- split por serviço
- venda pública online
- operação independente de excursão

---
