# Refinamento da validação de UUID no `asaas-webhook`

## 1. Resumo da melhoria

- Foi refinada a validação de `externalReference` no `asaas-webhook` para usar regex de UUID canônico (versões 1-5), substituindo o filtro anterior mais permissivo.
- A mudança foi necessária para aumentar precisão da triagem inicial e evitar falso-positivo de referência inválida com 36 caracteres hex/hífen.

## 2. Comparação antes/depois

### Antes

```ts
/^[0-9a-fA-F-]{36}$/
```

### Depois

```ts
/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
```

## 3. Impacto esperado

- **Melhoria de precisão:** apenas UUID em formato canônico é tratado como candidato válido de venda SmartBus.
- **Impacto zero no fluxo principal:** comportamento de ignore já implementado permanece igual:
  - UUID válido → fluxo normal
  - `platform_fee_<uuid>` válido → fluxo normal
  - demais casos → `ignored` com HTTP `200` e `incident_code=webhook_event_outside_smartbus_scope`

## 4. Risco de regressão

- **Baixo**.
- Há impacto apenas se algum fluxo externo estiver enviando `externalReference` fora do padrão UUID canônico; nesses casos, o evento continuará corretamente fora de escopo (ignored 200), o que é desejado para previsibilidade e auditoria.

## 5. Checklist de validação manual

- [ ] UUID válido continua funcionando
- [ ] `platform_fee_<uuid>` continua funcionando
- [ ] `externalReference` inválido continua sendo ignorado com `200`
- [ ] logs continuam sendo gerados corretamente
- [ ] nenhuma venda válida deixou de ser processada
