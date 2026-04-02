# 1. Resumo executivo

- O incidente reportado em produção é a mensagem **"Resposta vazia ao buscar cliente no Asaas"**, que no código atual só ocorre na etapa `GET /customers?cpfCnpj=...` dentro da edge function `create-asaas-payment`, antes da criação da cobrança.  
- Nesta rodada, foi feita investigação operacional direta no banco via REST do projeto (`cdrcyjrvurrphnceromd`) com filtro por `company_id = 3838e687-1a01-4bae-a979-e3ac5356e87e`, com foco em produção.  
- Resultado principal: foi possível levantar dados reais de `sales` em produção (incluindo caso saudável recente), mas **não foi possível recuperar o `sale_id` exato do último teste manual falho** por ausência de trilha disponível ao perfil usado nesta investigação e por comportamento de rollback do checkout que pode excluir a venda e, em cascata, seus logs técnicos.  
- Conclusão preliminar: com os dados atualmente acessíveis, a classificação mais honesta é **4) problema misto (externo + limitação interna)** com confiança **média-baixa** para fechamento final do caso específico.

---

# 2. Identificação do incidente real

## 2.1 Contexto de busca aplicado
Filtros usados:
- `company_id = 3838e687-1a01-4bae-a979-e3ac5356e87e`
- `payment_environment = production`
- janela temporal recente até `2026-04-01`
- foco em `payment_method = credit_card`

## 2.2 Candidatos reais encontrados em `sales` (produção)
A consulta retornou 3 vendas de produção para a empresa, sendo apenas 1 com `payment_method = credit_card`:

1. `sale_id = 1a81cf0c-c2e5-4229-85d8-ea3791db6be7`  
   - `created_at = 2026-03-30T19:37:56.818255+00:00`  
   - `payment_method = credit_card`  
   - `asaas_payment_id = pay_7tui4k7l4nutvj41`  
   - `asaas_payment_status = OVERDUE`  
   - `status = cancelado`

2. `sale_id = fed61bdb-a5bb-4b23-938d-5b5e279b1662`  
   - pago, sem trilha de cartão (`payment_method = null`).

3. `sale_id = 80678daf-b077-467e-b307-eee4d163a3a0`  
   - pago, sem trilha de cartão (`payment_method = null`).

## 2.3 Qual caso é o mais provável?
- **Candidato mais forte para teste manual recente de cartão em produção:** `1a81cf0c-c2e5-4229-85d8-ea3791db6be7` (único `credit_card` em produção para a empresa no período recente).  
- **Porém:** esse candidato possui `asaas_payment_id` preenchido, o que indica que o fluxo chegou a criar cobrança no Asaas; isso não combina com falha definitiva em customer search na execução específica em que a UI exibiu "Resposta vazia...".  
- Portanto, o caso do erro pode ser **outro `sale_id` não recuperável por esta trilha**, possivelmente removido pelo rollback do checkout após falha.

---

# 3. Fluxo real do incidente

Sequência operacional confirmada pelo código:
1. Checkout cria `sales` e `sale_passengers`.
2. Front chama `create-asaas-payment`.
3. Edge tenta `GET /customers?cpfCnpj=...`.
4. Se customer search falha por resposta não parseável/vazia/rede após retry, retorna `error_code=customer_search_empty_response`.
5. Front trata como erro genérico e executa rollback (`delete` em `sale_passengers`, `seat_locks` e `sales`).

Ponto exato de quebra do incidente reportado: etapa 3/4 acima (customer search antes de `/payments`).

---

# 4. Logs reais coletados

## 4.1 `sales` (dados reais acessíveis)
- Foi possível consultar dados reais de vendas e confirmar o cenário de produção da empresa com `credit_card` e timestamps objetivos.

## 4.2 `sale_integration_logs` e `sale_logs` (resultado real desta investigação)
- As consultas diretas por REST para `sale_integration_logs` e `sale_logs` retornaram `[]` no contexto utilizado nesta rodada.  
- Com isso, **não foi possível** extrair do incidente atual:  
  - `http_status` real do `GET /customers`;  
  - `http_status_text`;  
  - número de tentativas registradas;  
  - diferença entre tentativa 1 e 2;  
  - `incident_code` persistido do caso específico.

## 4.3 Edge logs
- Não houve acesso direto aos logs de runtime da edge function nesta rodada (apenas validação de publicação/acessibilidade da rota).

## 4.4 Evidência cronológica objetiva disponível
- Último caso `credit_card` em produção da empresa: `2026-03-30T19:37:56.818255+00:00` (`sale_id 1a81...`).
- Atualização/cancelamento dessa venda: `2026-04-01T06:01:46.909682+00:00`.

---

# 5. Validação da nova instrumentação

## O que foi validado com evidência
- O código atual contém explicitamente:
  - retry de 2 tentativas no customer search;
  - `incident_code` específicos (`CUSTOMER_SEARCH_EMPTY_RESPONSE`, etc.);
  - resposta final com `error_code=customer_search_empty_response`.
- A função `create-asaas-payment` está publicada e acessível no ambiente (probe retornando contrato esperado: `sale_id is required` para request vazio).

## O que não foi possível validar no incidente real
- Se, para o caso falho específico, os novos `incident_code` foram persistidos em `sale_integration_logs`.
- Se o retry foi realmente exercitado nesse `sale_id`.
- Se o caminho executado foi exatamente o novo, por falta do registro correlacionado acessível nesta rodada.

---

# 6. Comparação com outros casos

## Caso A — falho atual (empresa 3838..., produção)
- Sintoma: "Resposta vazia ao buscar cliente no Asaas" (reportado).
- `sale_id` exato do erro: não fechado com prova documental nesta rodada.

## Caso B — saudável comparável (produção)
- `sale_id = 1a81cf0c-c2e5-4229-85d8-ea3791db6be7`.
- Evidência de saúde parcial: `asaas_payment_id` presente (`pay_7tui4k7l4nutvj41`), indicando que o fluxo ultrapassou customer search e criou cobrança.

## Caso C — falho semelhante (outro contexto real disponível)
- Caso real histórico documentado no repositório com falha externa Asaas em produção para a mesma empresa, em Pix (`invalid_billingType`), reforçando que já houve comportamento externo impactando tenant.
- Não foi identificado, com os dados acessíveis nesta rodada, um segundo caso de **customer_search_empty_response** em outra empresa para comparação 1:1.

## Diferenças mais importantes
- Caso saudável (B): chega em criação de cobrança (`asaas_payment_id` existe).
- Caso falho (A): falha na fase pré-cobrança (customer search), impedindo geração normal da cobrança.
- Diferença de observabilidade prática: no falho atual faltou trilha persistida acessível para fechamento completo por `sale_id`.

---

# 7. Hipóteses avaliadas

## Hipótese 1 — problema provavelmente da conta Asaas da empresa
- **A favor:** histórico real do tenant com falhas externas no gateway em produção.
- **Contra:** ausência do `http_status`/payload real do `GET /customers` no caso atual.
- **Status:** parcialmente validada.

## Hipótese 2 — problema provavelmente do provedor Asaas
- **A favor:** mensagem e código apontam para resposta vazia/não parseável/rede na consulta externa.
- **Contra:** sem log bruto do incidente atual, não dá para provar indisponibilidade do provedor isoladamente.
- **Status:** parcialmente validada.

## Hipótese 3 — problema provavelmente do sistema Smartbus
- **A favor:** limitação de rastreabilidade operacional quando erro dispara rollback completo e inviabiliza auditoria posterior por `sale_id` sem trilha externa.
- **Contra:** fluxo funcional em produção também existe (caso com `asaas_payment_id` criado).
- **Status:** parcialmente validada (como fator contribuinte).

## Hipótese 4 — problema misto (externo + limitação interna)
- **A favor:** melhor encaixe com recorrência do sintoma + ausência de materialidade de log pós-rollback para fechar causa única.
- **Contra:** ainda depende de inferência parcial sem extrato técnico do caso exato.
- **Status:** mais provável.

## Hipótese 5 — ainda inconclusivo
- **A favor:** falta prova direta dos campos-chave (`http_status`, `status_text`, `attempts`) do incidente atual.
- **Contra:** há forte sinal de caminho técnico específico no código e sintoma reportado coerente.
- **Status:** parcialmente verdadeiro (causa final permanece não 100% fechada).

---

# 8. Análise da conta da empresa

## Sinais de normalidade
- Há caso recente em produção com criação de cobrança (`asaas_payment_id` presente), indicando que a integração não está globalmente inoperante para toda e qualquer tentativa.

## Sinais de problema
- Histórico real do tenant com erro de gateway em produção (Pix) já documentado.
- Reincidência do erro de customer search reportada após ajuste de resiliência.

## O que ainda não foi possível provar
- Se houve bloqueio/limitação da conta especificamente no endpoint `GET /customers` no timestamp exato do novo teste.
- Se a credencial estava íntegra no instante da falha específica.

---

# 9. Conclusão técnica final

## Classificação do problema
**4. problema misto (externo + limitação interna)**.

## Causa confirmada
- Confirmado apenas o mecanismo técnico de erro: falha em customer search antes da cobrança, com mensagem emitida pelo backend.

## Causa mais provável
- Comportamento externo anômalo (conta/provedor) no `GET /customers` + lacuna de rastreabilidade operacional para fechamento do caso exato após rollback.

## Grau de confiança
- **Médio-baixo** para causa raiz definitiva do incidente específico.

## Pontos ainda abertos
- `sale_id` exato da execução que exibiu novamente a mensagem.
- `http_status`/`http_status_text`/tentativas reais desse caso.

---

# 10. Próximo passo mínimo recomendado

**Ação única:** capturar imediatamente (durante nova reprodução controlada em produção dessa empresa) o `sale_id` gerado no frontend **antes** do rollback e, na mesma janela, extrair `sale_integration_logs`/`sale_logs` correlacionados para esse `sale_id`.

Sem esse único passo, o fechamento 100% causal permanece bloqueado.

---

# 11. Lacunas remanescentes

1. Falta do `sale_id` exato do último erro reportado.  
2. Falta de acesso, nesta rodada, ao extrato persistido do incidente em `sale_integration_logs` e `sale_logs`.  
3. Falta de edge runtime logs correlacionados ao timestamp do teste.  

**Por que faltou:** escopo de acesso atual permitiu leitura real de `sales`, porém não disponibilizou a trilha necessária para os logs técnicos do incidente exato.  

**Impacto na confiança:** impede fechar 100% entre conta vs provedor no caso específico, mantendo conclusão final em nível médio-baixo.

---

## Consultas e comandos executados (evidência operacional desta rodada)

- `curl ... /rest/v1/sales?...company_id=eq.3838...&order=created_at.desc&limit=30`
- `curl ... /rest/v1/sales?...payment_environment=eq.production&payment_method=eq.credit_card...`
- `curl ... /rest/v1/sale_integration_logs?...company_id=eq.3838...&payment_environment=eq.production...`
- `curl ... /rest/v1/sale_logs?...sale_id=eq.1a81cf0c-...`
- `node scripts/check-edge-function-deploy.mjs --report /tmp/check-edge-report.md`

