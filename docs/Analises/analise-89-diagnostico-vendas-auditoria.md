# Análise 89 — Diagnóstico de vendas com auditoria de divergências

## Problema original
A tela `/admin/diagnostico-vendas` e o popup **Diagnóstico técnico de webhooks (v1)** já exibiam sinais de alerta, porém sem profundidade operacional para auditoria.

Na prática, o operador visualizava divergências sem conseguir responder rapidamente:
- quando começou e quando ocorreu a última vez
- qual etapa do fluxo foi afetada
- se o incidente ainda está ativo, intermitente ou resolvido
- qual impacto operacional e quais vendas estão em risco
- qual evidência técnica sustenta a conclusão

## Limitações da versão anterior
- Divergências exibidas apenas com título, severidade, detalhe e `sale_id` (quando havia).
- Sem classificação por tipo (técnica, operacional, integridade).
- Sem status operacional do incidente (ativo/intermitente/resolvido).
- Sem trilha temporal por incidente com eventos em ordem cronológica.
- Resumo com cópia técnica genérica e pouca linguagem operacional.
- Filtros da aba de divergências inexistentes (sem recorte por status, tipo, IDs técnicos).
- Sem menu de ações rápidas para cópia, exportação e navegação da investigação.
- Evidência bruta não vinculada diretamente ao incidente.

## Melhorias implementadas
1. **Enriquecimento estrutural da divergência**
   - Novo modelo com: `incident_code`, tipo, status do incidente, etapa do fluxo, impacto operacional, IDs técnicos, ambiente, status da venda/gateway, primeira e última detecção, último log e recorrência.
   - Campos ausentes são mostrados como **“não disponível”**, sem inferência artificial.

2. **Classificação semântica por tipo**
   - Divergências agrupadas em:
     - técnica
     - operacional
     - integridade
   - Organização visual por bloco, com contagem por tipo.

3. **Timeline auditável por incidente**
   - Seleção de divergência abre visão detalhada com eventos cronológicos.
   - Cada evento evidencia: horário, origem, etapa, status, mensagem, ambiente, IDs de pagamento/referência, direção, warning/incident code e HTTP.

4. **Resumo mais operacional**
   - Última falha relevante com título humano, etapa, horário, ambiente e número de vendas impactadas.
   - Estado atual do monitoramento textual (ativo/intermitente/sem ativo) orientado para operação.

5. **Filtros compactos na aba Divergências**
   - Período
   - Severidade
   - Tipo de divergência
   - Status do incidente
   - Ambiente
   - Busca por `sale_id`, `external_reference`, `asaas_payment_id`
   - Toggles: somente ativos e somente reincidentes

6. **Ações rápidas seguras por divergência**
   - Copiar diagnóstico completo
   - Copiar JSON bruto
   - Abrir venda (reuso do modal existente)
   - Abrir timeline
   - Reexecutar verificação manual (reuso da ação já existente de recarga)
   - Exportar incidente em Markdown e JSON

7. **Evidência bruta vinculada**
   - Bloco “Ver evidência bruta” por evento de timeline, com payload/response e metadados do log.

## Possíveis pontos ainda pendentes
- Recorte de período hoje é aplicado no frontend sobre snapshot já carregado (limitado ao conjunto consultado).
- Linha temporal depende da disponibilidade dos logs persistidos no recorte atual.
- “Abrir venda” permanece no contexto da tela (modal), sem deep-link dedicado por incidente.

## Checklist de validação
- [x] A tela ficou mais auditável
- [x] Divergências exibem tempo, contexto e impacto
- [x] Mantido escopo por empresa (`company_id`) no snapshot técnico
- [x] Mantida separação por ambiente (`payment_environment`) sem mistura
- [x] Sem criação de fluxo paralelo de pagamento
- [x] Sem refatoração arquitetural ampla
- [x] Mudanças localizadas na UI/camada de diagnóstico do popup
