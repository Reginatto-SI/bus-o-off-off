# 🧠 PRD — Módulo de Passeios & Serviços (SmartBus BR)

---

## 🎯 Ação Desejada

Criar um módulo para permitir a **venda, controle e validação de passeios/serviços turísticos** dentro do SmartBus BR, com operação simples, rápida e integrada ao sistema atual, sem alterar o fluxo de venda de passagens.

---

## 📌 Contexto

Atualmente o SmartBus atende apenas a venda de passagens (pré-viagem).

Na prática das agências:
- Passeios são vendidos **durante a viagem ou no destino**
- Venda é **impulsiva**
- Nem todos compram antecipadamente
- Existe necessidade de:
  - controle financeiro
  - controle de capacidade
  - controle de consumo (uso do serviço)

👉 Este módulo cobre o momento **durante a excursão**, sem impactar o fluxo atual.

---

## 🧩 Premissas do Projeto

- Módulo **acoplado ao evento**
- NÃO altera o checkout de passagens
- Reutiliza:
  - `sales`
  - pagamento (Asaas)
  - controle de vendedor
- NÃO implementa logística (guia, horário, veículo)
- NÃO implementa split nesta fase
- Sistema deve ser:
  - previsível
  - simples
  - rápido

---

# 🏗️ ESTRUTURA DO SISTEMA

---

## 1. Cadastro de Serviços (Base)

Tela:
👉 `/admin/servicos`

Campos:

- nome
- descrição
- `unit_type`:
  - `pessoa`
  - `veiculo`
  - `unitario`
- `tipo_controle`:
  - `validacao_obrigatoria`
  - `sem_validacao`
- ativo/inativo

---

## 2. Serviços dentro do Evento

Tela:
👉 Evento → Aba **Serviços**

Campos:

- serviço_id
- valor_base
- capacidade_total
- permite_checkout (sim/não)
- permite_venda_avulsa (sim/não)
- ativo/inativo

---

## 3. Controle de Capacidade

Para cada serviço no evento:

- quantidade_total
- quantidade_vendida
- quantidade_disponivel

Regra:

- bloquear venda ao atingir limite

---

# 💰 VENDA DE SERVIÇOS

---

## 4. Fluxos de Venda

### 4.1 Venda Casada (checkout)

- usuário compra passagem
- seleciona serviços adicionais
- valor total somado

---

### 4.2 Venda Avulsa

Tela:
👉 `/vendas/servicos`

Fluxo:

1. selecionar evento
2. selecionar serviço
3. informar quantidade
4. confirmar pagamento

---

## 5. Unidade de Venda (CRÍTICO)

Cada serviço define `unit_type`:

---

### 🧍 Pessoa

- informar quantidade de pessoas
- pode adicionar nomes (opcional)
- não exigir CPF

---

### 🚗 Veículo

- informar quantidade de veículos

---

### 📦 Unitário

- quantidade simples

---

## 6. Estrutura da Venda

Reutilizar `sales`

Adicionar:

### `sale_items`

Campos:

- sale_id
- service_id
- unit_type
- quantidade
- valor_unitario
- valor_total
- tipo: `passagem` ou `servico`

---

## 7. Pessoas (Opcional)

Para `unit_type = pessoa`:

- permitir lista de nomes (opcional)
- não obrigatório

---

# 💸 PAGAMENTO

---

## 8. Regra de pagamento

- status inicial: `pendente`
- confirmação via webhook (Asaas)
- fallback via verify

---

## 9. Venda em dinheiro

- permitido
- status: `pendente_taxa`
- validação só liberada após regularização

---

# 🎫 VALIDAÇÃO E USO DO SERVIÇO

---

## 10. Geração de QR Code

- gerar QR por **item validável (serviço)**
- NÃO usar QR único da venda

---

## 11. Modelo de Uso (CRÉDITO)

Cada item possui:

- `quantidade_total`
- `quantidade_utilizada`
- `quantidade_restante`

---

## 12. Regra de validação

Ao ler QR:

- se restante > 0 → permitir uso
- decrementa 1
- registra log

Se restante = 0:

- bloquear uso
- mostrar “já utilizado”

---

## 13. Serviços sem validação

- não geram QR
- apenas controle financeiro

---

# 🧾 EXPERIÊNCIA DO USUÁRIO

---

## 14. Layout único (OBRIGATÓRIO)

O sistema terá **um único layout de comprovante**

---

### Estrutura:

#### 🔹 Bloco 1 — Passagem
- QR embarque
- dados da viagem

---

#### 🔹 Bloco 2 — Serviços

Lista:

- Nome do serviço
- quantidade
- QR (se aplicável)

---

## 15. Venda avulsa

Mesmo layout:

- sem bloco de passagem
- apenas serviços

---

# 💰 PREÇO

---

## 16. Regra de preço

- valor base definido no evento
- pode ser ajustado manualmente na venda

Ex:

- 1 buggy → 250  
- 2 buggy → 480  

(MVP: ajuste manual)

---

# 👤 VENDEDOR

---

## 17. Regras

- qualquer usuário autorizado pode vender
- reutilizar controle existente
- comissão já existente continua válida

---

# 📊 RELATÓRIOS

---

## 18. Novos indicadores

- receita por serviço
- quantidade vendida por serviço
- total por evento (passagem + serviços)

---

# 💸 REPASSE

---

## 19. Controle financeiro

- permitir informar custo do serviço
- calcular margem

⚠️ repasse manual nesta fase

---

# 🎯 CRITÉRIOS DE SUCESSO

- venda em menos de 10 segundos
- sistema não trava operação em campo
- controle de capacidade funcional
- QR funciona com consumo parcial
- não interfere no fluxo de passagens

---

# 🚫 RESTRIÇÕES

- não alterar checkout atual
- não exigir CPF
- não implementar logística
- não criar múltiplos layouts
- não implementar split

---

# 🔮 EVOLUÇÕES FUTURAS

- controle de horários
- guias e fornecedores
- veículos
- split por serviço
- venda pública de passeios
- operação independente de excursão

---
