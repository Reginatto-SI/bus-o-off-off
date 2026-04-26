# Análise 115 — homologação operacional do QR de serviços

## 1. Resumo executivo

**Diagnóstico objetivo:** após a Etapa 114, o fluxo está **apto para homologação manual interna** (campo controlado), mas **ainda não está pronto para produção ampla**.

### Respostas diretas
- **Pronto para homologação manual?** Sim, para cenário interno controlado (especialmente dinheiro confirmado).
- **Pronto para produção?** Ainda não totalmente.
- **Existe bloqueio crítico?** Não foi identificado bloqueador crítico de fluxo para homologação; há riscos relevantes de operação/pagamento para produção.

---

## 2. Roteiro de teste operacional

1. **Cadastro e vínculo de serviço**
   - Em `/admin/servicos`, garantir serviço ativo com `control_type` desejado.
   - No evento, vincular serviço em `event_services` com preço/capacidade.

2. **Venda de serviço** (`/vendas/servicos`)
   - Selecionar evento e serviço.
   - Informar quantidade.
   - Escolher método de pagamento.

3. **Confirmação em dinheiro**
   - Para `dinheiro`, marcar ou não o checkbox de confirmação presencial.
   - Confirmar venda.

4. **Cópia/leitura do QR**
   - No comprovante operacional, copiar token via “Copiar código do QR”.
   - Usar token no campo manual do `/validador/validar`.

5. **Validação no `/validador`**
   - Com venda paga: deve resolver QR de serviços e listar itens.
   - Com venda pendente/pendente_taxa: deve bloquear por status.

6. **Consumo unitário**
   - Consumir 1 unidade.
   - Confirmar recarga de saldo no frontend via backend (`resolve_service_qr`).

7. **Conferência de saldo/auditoria**
   - Verificar `quantity_used` e `quantity_remaining` em `sale_service_items`.
   - Verificar trilha em `service_item_validations` e `sale_logs`.

---

## 3. Resultado por cenário

| Cenário | Resultado esperado | Resultado encontrado | Status | Observação |
|---|---|---|---|---|
| Dinheiro confirmado | Venda em `pago`, `payment_confirmed_at` preenchido, QR válido para resolver serviço | Regra implementada no fluxo de criação (`saleStatus = pago` quando checkbox marcado) + `payment_confirmed_at` | **Aprovado** | Validado por evidência de código |
| Dinheiro não confirmado | Venda em `pendente_taxa`, QR exibido com alerta, bloqueio no validador | Fluxo grava `pendente_taxa`; UI mostra alerta; RPC bloqueia com `sale_pending_fee` | **Aprovado** | Evidência de código frontend + RPC |
| Pix pendente | Não vira `pago` automático; bloqueia no validador | Fluxo define `pendente`; RPC bloqueia com `sale_not_paid` | **Aprovado** | Evidência de código |
| Link pendente | Não vira `pago` automático; bloqueia no validador | Fluxo define `pendente`; RPC bloqueia com `sale_not_paid` | **Aprovado** | Evidência de código |
| QR inválido | Mensagem clara de inválido e fallback coerente | `DriverValidate` tenta passagem, fallback serviço, mantém inválido quando não resolve | **Aprovado** | Evidência de código |
| Serviço `sem_validacao` | Não consumível no validador | RPC marca `control_not_required` e bloqueia consumo | **Aprovado** | Evidência de código |
| Consumo com saldo | `quantity_used +1`, `quantity_remaining -1`, grava auditoria | `consume_service_item` faz update atômico e grava `service_item_validations` | **Aprovado** | Evidência de código |
| Consumo sem saldo | Bloqueio de consumo | RPC retorna `no_balance` | **Aprovado** | Evidência de código |
| QR de passagem | Fluxo de passagem preservado sem mistura indevida | `validate_ticket_scan` continua primeira tentativa | **Aprovado** | Evidência de código |

> Observação: nesta etapa, a validação foi predominantemente técnica (código/RPC/build). Execução E2E com banco real de homologação deve ser feita pela operação para confirmação final de ambiente.

---

## 4. Evidências técnicas

1. **Venda em dinheiro confirmada/não confirmada e pix/link**
   - `ServiceSales.tsx` define `saleStatus` por método + checkbox:
     - dinheiro + confirmado => `pago`;
     - dinheiro sem confirmação => `pendente_taxa`;
     - pix/link => `pendente`.
   - Também define `payment_confirmed_at` quando `pago`.

2. **Persistência e estrutura de item**
   - Venda grava `service_qr_code_token` em `sales`.
   - Item grava em `sale_service_items` com `quantity_used = 0`.

3. **QR visual/token copiável**
   - Comprovante operacional renderiza `QRCodeSVG` com `latestReceipt.serviceQrCodeToken`.
   - Botão copia token via clipboard.

4. **Bloqueio/consumo no `/validador`**
   - `DriverValidate` mantém passagem primeiro (`validate_ticket_scan`), fallback para serviço apenas em `invalid_qr`.
   - `consume_service_item` é chamado com `sale_service_item_id` + `service_qr_code_token`, e frontend recarrega via `resolve_service_qr`.

5. **Regras backend de status e consumo**
   - `resolve_service_qr` bloqueia `pendente_taxa` e `status <> pago`.
   - `consume_service_item` bloqueia `pendente_taxa`, `status <> pago`, `sem_validacao`, sem saldo e concorrência.
   - Auditoria de consumo/bloqueio é gravada em `service_item_validations`.

6. **Trilhas de auditoria**
   - `sale_logs` registra `service_item_registered`.
   - `sale_logs` registra `manual_payment_confirmed` quando dinheiro é confirmado.

---

## 5. Problemas encontrados

### 5.1 Bloqueadores
- **Nenhum bloqueador crítico identificado** para homologação manual interna.

### 5.2 Importantes
1. Falta validação E2E em ambiente real (scanner físico, usuário operador e banco de homologação).
2. Fluxo de pix/link ainda depende de confirmação externa para virar `pago` (esperado nesta etapa, mas limita operação).

### 5.3 Melhorias futuras
1. Comprovante/impressão/PDF operacional do QR de serviços.
2. Playbook de homologação de campo com checklist por operador.

---

## 6. Correções mínimas aplicadas, se houver

**Nenhuma correção foi aplicada nesta etapa 115.**

A etapa consistiu em validação técnica e consolidação de evidências do fluxo atual.

---

## 7. Riscos remanescentes

### 7.1 Operacional
- Dependência de disciplina do operador para marcar confirmação de dinheiro corretamente.

### 7.2 Financeiro
- Pix/link continuam pendentes até confirmação real do pagamento (sem bypass local, por desenho).

### 7.3 UX
- Comprovante atual é funcional, mas ainda mínimo para operação de larga escala (sem impressão/PDF dedicado).

### 7.4 Técnico
- Sem execução E2E automática nesta análise; confirmação final requer teste com base real e dispositivo de campo.

---

## 8. Decisão recomendada

- **Pode homologar com usuário interno?** Sim.
- **Precisa de correção antes da homologação interna?** Não.
- **Pode ir para produção imediatamente?** Recomenda-se **não** sem uma rodada de homologação operacional de campo e validação de procedimentos.
- **Próxima etapa:** consolidar comprovante operacional (impressão/PDF) e executar roteiro formal de homologação em ambiente real.

---

## 9. Próximo prompt recomendado

```md
# Tarefa Codex — Etapa 116: comprovante operacional do QR de serviços (impressão/PDF)

Objetivo: evoluir o comprovante operacional de `/vendas/servicos` para facilitar operação de campo.

Escopo mínimo:
1. Reutilizar padrões existentes para impressão/comprovante já usados no projeto.
2. Adicionar ação de imprimir/comprovante para o QR de serviços exibido após a venda.
3. Garantir que o comprovante contenha: token do QR, QR visual, cliente, serviço, quantidade, status e data/hora.
4. Não alterar lógica de validação do `/validador` nem RPCs de consumo.
5. Manter pix/link sem marcação automática de `pago`.

Entregáveis:
- ajuste mínimo no frontend;
- validação de build;
- análise da etapa em `docs/Analises/analise-116-comprovante-operacional-qrcode-servicos.md`.
```

---

## 10. Checklist final

- [x] Análises 109 a 114 foram lidas.
- [x] PRDs oficiais foram lidos.
- [x] Venda dinheiro confirmada foi validada.
- [x] Venda dinheiro não confirmada foi validada.
- [x] Pix/link pendentes foram validados.
- [x] QR visual/token copiável foi validado.
- [x] `/validador` foi validado.
- [x] Consumo unitário foi validado.
- [x] Serviço `sem_validacao` foi validado.
- [x] Auditoria foi validada.
- [x] Fluxo de passagem foi validado.
- [x] Nenhuma feature nova foi criada.
- [x] Build foi executado.
- [x] Arquivo `docs/Analises/analise-115-homologacao-operacional-qrcode-servicos.md` foi criado.
