# Análise técnica — Viabilidade da Vitrine Virtual automática

## Escopo
Analisar a viabilidade de criar automaticamente a Vitrine Virtual no cadastro de novas empresas, sem quebrar `/admin/empresa`, sem fluxo paralelo e sem sobrescrever links já ativos.

## Diagnóstico

### Sintoma
Empresas recém-criadas podem não ter `public_slug`, dependendo de configuração manual posterior na tela `/admin/empresa`.

### Onde ocorre
- Criação de empresa pública: edge function `register-company` (insert em `companies` sem `public_slug`).
- Configuração manual posterior: `/admin/empresa` (campo de nick na aba Dados Gerais).

### Evidência
- O cadastro público não envia `public_slug` no insert.
- A vitrine pública (`/empresa/:nick` e `/:nick`) depende de `companies.public_slug`.
- Existe normalização e validação de disponibilidade, mas não geração automática de slug para novos registros.

### Causa raiz
Ausência de regra de geração automática e determinística de `public_slug` no momento da criação da empresa.

---

## Fluxo atual da vitrine
1. Empresa é criada.
2. Operador acessa `/admin/empresa` e configura manualmente o nick.
3. Sistema normaliza slug e valida disponibilidade.
4. Vitrine torna-se acessível por `/empresa/:slug` e `/:slug`.

Risco: se passo 2 não ocorrer, a empresa não recebe link público organizado.

---

## Viabilidade da implementação automática

## ✅ Viável com mudança mínima e segura
### Estratégia escolhida
Implementar no **banco** (trigger/função), porque cobre todos os pontos de criação de empresa (frontend, edge functions, scripts, inserts administrativos), sem duplicar regra em múltiplos lugares.

### Regras implementadas
- minúsculo;
- remoção de acentos;
- remoção de caracteres especiais;
- espaços/underscore -> hífen;
- remoção de hífens duplicados;
- trim de hífen início/fim;
- bloqueio de slugs reservados;
- unicidade com sufixo sequencial:
  - `empresa`
  - `empresa-2`
  - `empresa-3`

### Comportamento em criação
- Se `public_slug` vier vazio/nulo: gera automaticamente a partir de `trade_name` → `name` → `legal_name`.
- Se vier preenchido: normaliza e aplica unicidade sequencial determinística.

### Backfill
- Atualiza apenas empresas com `public_slug is null`.
- Não sobrescreve slugs existentes.
- Não altera links públicos já configurados.

---

## Impacto técnico

### Tabelas/funções afetadas
- `public.companies` (trigger de slug já existente, agora com lógica automática).
- Nova função auxiliar: `public.generate_unique_company_public_slug(...)`.

### Segurança / multiempresa / RLS
- Alteração não relaxa RLS.
- Não cria novo endpoint público.
- Regra atua só no write de `companies`, respeitando políticas atuais.

### Asaas
- Nenhuma mudança de regra de pagamento/Asaas.

---

## Riscos residuais
1. Empresas diferentes com nomes muito parecidos podem gerar sequência alta (`-2`, `-3`, ...), mas é esperado.
2. Se nome base normalizar para vazio, fallback vira `empresa`, com sufixo quando necessário.
3. Em altíssimo volume concorrente, o índice único continua sendo proteção final de integridade.

Mitigação: função sequencial + índice único parcial em `public_slug`.

---

## Recomendações operacionais
1. Executar query de conferência pós-migration:
```sql
select id, name, trade_name, public_slug
from public.companies
order by created_at desc
limit 100;
```
2. Validar criação de novas empresas via `/cadastro` e confirmar slug preenchido automaticamente.
3. Validar que edição manual em `/admin/empresa` permanece funcional.

---

## Conclusão
A criação automática da Vitrine Virtual é **segura e recomendada** com mudança mínima em banco (função + trigger + backfill pontual), mantendo compatibilidade com o fluxo manual atual e sem sobrescrever configurações existentes.

