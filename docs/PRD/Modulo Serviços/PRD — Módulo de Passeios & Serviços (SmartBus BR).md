# 🧠 PRD — Módulo de Passeios & Serviços (SmartBus BR)

## 🎯 Ação Desejada
Criar um novo módulo no SmartBus BR para permitir a **venda e controle de passeios/serviços turísticos** durante excursões, com operação simples, rápida e integrada ao sistema atual, sem alterar o fluxo de venda de passagens.

---

## 📌 Contexto

Atualmente, o SmartBus BR atende a venda de passagens de excursão (pré-viagem).

Na prática operacional dos clientes (agências):
- Muitos passeios são vendidos **durante a viagem ou no destino**
- A venda é **impulsiva e descentralizada (ônibus, praia, guia, etc.)**
- Nem todos os passageiros compram antecipadamente
- Existe necessidade de:
  - controle financeiro
  - controle de capacidade
  - controle operacional (quem comprou o quê)

👉 O sistema hoje não cobre esse momento da jornada.

Este módulo resolve isso sem alterar o fluxo principal de passagens.

---

## 🧩 Premissas do Projeto

- O módulo é **complementar ao evento (excursão)**, não independente neste momento
- NÃO altera o fluxo de checkout de passagens
- Reutiliza o motor de vendas existente
- Segue todas as diretrizes do projeto:
  - sem fluxos paralelos desnecessários
  - comportamento previsível
  - reutilização de componentes

---

## 🏗️ Estrutura Funcional

### 1. Novo conceito: Serviço / Passeio

Cada evento poderá possuir **serviços vinculados**, como:

- Buggy
- Lancha
- Tirolesa
- Mergulho
- Outros

---

### 2. Cadastro de Serviço (no evento)

Cada serviço deve conter:

- Nome
- Descrição
- Preço
- Tipo de controle:
  - `validacao_obrigatoria`
  - `sem_validacao`
- Capacidade total (número máximo)
- Ativo / Inativo

---

### 3. Controle de Capacidade

O sistema deve:

- Controlar quantidade vendida
- Calcular vagas disponíveis
- Bloquear venda ao atingir limite

---

## 💰 Venda de Serviços

### 4. Novo fluxo: Venda Operacional

Criar uma nova tela:

👉 `/vendas/servicos`

Com foco em operação rápida:

- Selecionar evento
- Selecionar serviço
- Informar quantidade
- Selecionar forma de pagamento:
  - Pix
  - Dinheiro
  - Link
- Confirmar venda

---

### 5. Tipos de venda

#### Venda avulsa
- Não depende de passagem
- Pode ser feita a qualquer momento

#### Venda durante excursão
- Associada ao evento

---

### 6. Regras de pagamento

O sistema deve seguir o padrão atual:

- Venda nasce como `pendente`
- Só é considerada válida quando:
  - pagamento confirmado  
  OU  
  - taxa da plataforma paga

👉 Reutilizar fluxo atual do Asaas (sem alterações)

---

### 7. Venda em dinheiro

Permitido:

- Registrar venda manual
- Status inicial: `pendente_taxa`
- Só libera validação (se houver) após regularização

---

## 🎫 Validação de Serviço

### 8. Serviços com validação

Quando `validacao_obrigatoria`:

- Gerar ingresso (QR Code ou código)
- Permitir leitura/validação
- Exigir status válido (pago/taxa ok)

---

### 9. Serviços sem validação

- Não gerar ingresso
- Apenas controle de venda

---

## 👤 Vendedor

- Qualquer usuário com permissão pode vender
- Utilizar sistema de vendedor já existente
- Comissão já existente deve ser aplicada normalmente

---

## 📊 Relatórios

Reutilizar estrutura existente, adicionando:

- Receita por serviço
- Quantidade vendida por serviço
- Vendas por vendedor (já existente)
- Total arrecadado por evento (incluindo serviços)

---

## 💸 Repasse (Manual)

O sistema deve permitir:

- Definir valor de custo do serviço
- Calcular margem da empresa
- Exibir valores para controle

⚠️ Não implementar split automático neste momento

---

## 🎯 Critérios de Sucesso

- Vendedor consegue registrar uma venda em menos de 10 segundos
- Sistema não trava operação mesmo com venda em dinheiro
- Controle de capacidade evita overbooking
- Não interfere no fluxo de venda de passagens
- Mantém consistência com sistema atual de pagamento e vendas

---

## 🚫 Restrições

- Não alterar o checkout atual
- Não criar novo sistema de pagamento
- Não criar fluxo separado de vendas (reutilizar `sales`)
- Não implementar split financeiro nesta fase
- Não criar dependência obrigatória com passageiro/CPF

---

## 🔮 Evoluções Futuras (fora deste escopo)

- Split por serviço
- Controle de fornecedor (parceiros)
- Agenda de horários por passeio
- Venda online pública de serviços
- Operação independente de excursão

---
