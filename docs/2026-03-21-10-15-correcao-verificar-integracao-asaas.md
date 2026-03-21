# Correção pontual — verificar integração Asaas em `/admin/empresa`

## 1. Objetivo
Aplicar a correção final e mínima no fluxo **Verificar integração** para garantir leitura determinística da `companies` por ambiente ativo, mensagens claras e coerência entre card visual e verificação manual.

## 2. Problema corrigido
- A verificação já estava próxima do comportamento correto, mas ainda havia mensagens que não refletiam exatamente o contexto esperado para:
  - empresa atual ausente;
  - ambiente inválido;
  - empresa não encontrada;
  - pendência local de `account_id`.
- Isso podia reduzir a clareza operacional mesmo com o fluxo técnico já segregado por ambiente.

## 3. Causa raiz
A causa residual era de **mensageria e contrato de retorno**, não de arquitetura:
- o backend ainda usava mensagens genéricas ou pouco alinhadas ao contexto validado;
- o frontend ainda tratava a ausência de empresa/ambiente com uma mensagem conjunta;
- a pendência de `account_id` ainda usava um texto técnico menos claro para o usuário final.

## 4. Arquivos alterados
- `supabase/functions/check-asaas-integration/index.ts`
- `src/pages/admin/Company.tsx`

## 5. Regra final por ambiente
1. Resolver a empresa atual.
2. Resolver o ambiente operacional ativo.
3. Montar o `select` apenas com as colunas daquele ambiente:
   - produção → `*_production`
   - sandbox → `*_sandbox`
4. Validar somente com os dados daquele ambiente.
5. Se houver `api_key + wallet_id`, a chamada ao gateway pode continuar mesmo sem `account_id` local.
6. Sem `account_id` local, o retorno deve ser de **configuração pendente**, não de sucesso pleno.
7. O ambiente oposto não pode influenciar status, razões ou retorno da validação.

## 6. Mensagens finais de retorno
### Sucesso real
- `Integração Asaas validada com sucesso.`

### Gateway validado, mas cadastro local incompleto
- `Conta Asaas validada no gateway, mas falta salvar o identificador da conta deste ambiente no cadastro da empresa.`

### Faltam dados obrigatórios
- `A conta Asaas deste ambiente ainda não está completamente configurada: faltando [campos].`

### Empresa/contexto ausente
- `Empresa atual não localizada para validar a integração.`

### Ambiente inconsistente
- `O ambiente operacional informado não é válido para esta verificação.`

## 7. Testes ajustados
- Os testes do snapshot visual continuam cobrindo:
  - ausência de configuração no ambiente atual;
  - ambiente oposto não influenciando o card;
  - conexão completa apenas com `account_id` local presente;
  - pendência visual quando falta `account_id` local.
- Foi reexecutado o teste unitário do snapshot e o build da aplicação.

## 8. Como validar manualmente
1. Abrir `/admin/empresa`.
2. Ir para a guia **Pagamentos**.
3. Confirmar o ambiente operacional atual.
4. Clicar em **Verificar integração**.
5. Validar os cenários:
   - sem empresa carregada → mensagem de empresa atual não localizada;
   - sem ambiente válido → mensagem de ambiente inválido;
   - com `api_key + wallet_id`, mas sem `account_id` local → warning de configuração pendente;
   - com tudo correto no ambiente ativo → sucesso real;
   - faltando `api_key` ou `wallet_id` → mensagem específica de configuração incompleta.
