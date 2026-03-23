

# Plano: Redirecionamento do dominio busaooffoff.com.br + Correcao de build errors

## Parte 1 — Dominio busaooffoff.com.br

### Diagnostico

O comportamento desejado e que `www.busaooffoff.com.br` redirecione para `https://www.smartbusbr.com.br/empresa/busaooffoff`. Isso e um **redirecionamento entre dominios diferentes** (de busaooffoff.com.br para smartbusbr.com.br).

### Limitacao da plataforma

Lovable permite conectar dominios customizados a um projeto, mas **nao suporta redirecionamento entre dominios diferentes nativamente**. Quando voce conecta `www.busaooffoff.com.br` ao projeto Lovable, ele serve o **mesmo app** nesse dominio — nao redireciona para outro dominio.

### Opcoes viaveis

Existem duas abordagens possiveis:

**Opcao A — Manter o redirecionamento via codigo React (ja implementado)**
O codigo atual em `PublicRootRedirect` + `companyDomainRouting.ts` ja faz exatamente isso: quando o hostname e `busaooffoff.com.br`, redireciona para `/empresa/busaooffoff`. Porem isso e um redirecionamento **interno** (dentro do mesmo app), nao um redirecionamento para `smartbusbr.com.br`. O usuario ficaria em `www.busaooffoff.com.br/empresa/busaooffoff` — nao em `www.smartbusbr.com.br/empresa/busaooffoff`.

**Opcao B — Redirecionamento externo via DNS/registrador (recomendado)**
Configurar no registrador de dominio (onde `busaooffoff.com.br` esta registrado) um **redirecionamento HTTP 301** de `www.busaooffoff.com.br` para `https://www.smartbusbr.com.br/empresa/busaooffoff`. Isso e feito fora do Lovable, no painel do registrador (ex: Registro.br, GoDaddy, Cloudflare, etc.).

### Recomendacao

**A solucao correta para o seu caso e a Opcao B** — configurar o redirecionamento no registrador de dominio. Lovable nao consegue fazer um dominio apontar para uma URL em outro dominio. Isso precisa ser feito na camada de DNS/hosting.

Passos:
1. Acesse o painel do registrador onde `busaooffoff.com.br` esta configurado
2. Configure um **redirecionamento 301** (permanente) de `busaooffoff.com.br` e `www.busaooffoff.com.br` para `https://www.smartbusbr.com.br/empresa/busaooffoff`
3. **Nao conecte** esse dominio ao projeto Lovable — ele deve redirecionar externamente
4. Remova a logica de redirecionamento por hostname do codigo React (simplificar `PublicRootRedirect` para apenas renderizar `LandingPage`, e remover `companyDomainRouting.ts`)

## Parte 2 — Correcao dos build errors em SalesDiagnostic.tsx

Problema: a propriedade `operationalPriority` foi adicionada ao tipo `DiagnosticOperationalView` mas nao foi incluida nos objetos retornados pela funcao de classificacao.

Correcao: adicionar `operationalPriority` (derivado do campo `priority` ja existente) em cada objeto retornado nas ~14 ocorrencias dentro de `SalesDiagnostic.tsx`.

## Resumo de alteracoes

| Arquivo | Acao |
|---|---|
| `src/pages/public/PublicRootRedirect.tsx` | Simplificar — remover logica de hostname, apenas renderizar LandingPage |
| `src/lib/companyDomainRouting.ts` | Remover arquivo (logica nao sera mais necessaria) |
| `src/test/companyDomainRouting.test.ts` | Remover arquivo de teste correspondente |
| `src/pages/admin/SalesDiagnostic.tsx` | Adicionar `operationalPriority` em todos os objetos de retorno |

### Acao necessaria do seu lado (fora do Lovable)

Configurar no registrador de dominio o redirecionamento 301:
- `busaooffoff.com.br` → `https://www.smartbusbr.com.br/empresa/busaooffoff`
- `www.busaooffoff.com.br` → `https://www.smartbusbr.com.br/empresa/busaooffoff`

