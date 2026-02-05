
# Plano: Correcao P0 - Login e Resolucao de Empresa Ativa

## Problema Identificado

O `AuthContext.tsx` possui uma vulnerabilidade no fluxo de resolucao da empresa ativa:

1. Linha 77: `companyIds` pode ficar vazio se `role.company_id` for null/undefined
2. Linha 80-83: Query `.in('id', [])` com array vazio pode falhar ou retornar comportamento inesperado
3. Se `companiesData` vier vazio, `activeCompanyId` e `userRole` ficam null
4. Painel abre mas operacoes ficam bloqueadas

## Correcao Proposta

### Arquivo: `src/contexts/AuthContext.tsx`

Alteracoes na funcao `fetchUserData`:

```text
ANTES:
  const companyIds = rolesData.map((role) => role.company_id).filter(Boolean);
  const { data: companiesData } = await supabase
    .from('companies')
    .select('*')
    .in('id', companyIds);

DEPOIS:
  1. Verificar se companyIds tem itens ANTES de fazer query
  2. Se vazio, definir role/sellerId do primeiro registro de rolesData
  3. Adicionar logs de debug para facilitar diagnostico futuro
```

### Logica de Fallback

```typescript
// 1. Extrair company_ids validos
const companyIds = rolesData.map((role) => role.company_id).filter(Boolean);

// 2. Se nao houver company_ids validos, usar role/sellerId do primeiro registro
if (companyIds.length === 0) {
  const firstRole = rolesData[0];
  if (firstRole) {
    setUserRole(firstRole.role as UserRole);
    setSellerId(firstRole.seller_id);
  }
  setUserCompanies([]);
  setActiveCompanyId(null);
  setActiveCompany(null);
  return; // Sai cedo, evita query invalida
}

// 3. Continua fluxo normal so se tiver IDs validos
const { data: companiesData } = await supabase
  .from('companies')
  .select('*')
  .in('id', companyIds);
```

### Melhorias Adicionais

1. **Try-catch** envolvendo operacoes criticas
2. **Logs estruturados** para debug
3. **Timeout de loading** para evitar tela presa
4. **Tratamento de erro de rede** mais robusto

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/contexts/AuthContext.tsx` | Corrigir fluxo de resolucao de empresa |

## Checklist de Validacao

Apos a correcao:
- [ ] Login funciona normalmente
- [ ] Navegacao pelo painel OK
- [ ] Sem loop de login
- [ ] Console sem erros fatais
- [ ] Exportacao PDF/Excel continua funcionando

## Ordem de Implementacao

1. Adicionar guard para `companyIds` vazio
2. Implementar fallback para userRole/sellerId
3. Adicionar try-catch com logs de erro
4. Testar login end-to-end
