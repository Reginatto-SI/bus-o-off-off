# Retorno da autorização PagBank para a origem correta

## O que foi encontrado na investigação

Sim, faz sentido — e a causa está localizada, em dois pontos independentes.

**1. Por que volta para `www.smartbus.com.br`**

`supabase/functions/pagbank-connect-callback/index.ts`, função `adminRedirect` (linha 11-17):

```text
const base = Deno.env.get("PAGBANK_ADMIN_RETURN_URL") ?? "https://www.smartbus.com.br/admin/empresa";
```

A variável `PAGBANK_ADMIN_RETURN_URL` não existe entre os segredos do backend (confirmado). Logo, o retorno cai sempre no endereço fixo de Produção, qualquer que seja a origem do fluxo.

**2. Por que a origem do Preview é descartada**

Em `pagbank-connection/index.ts`, ação `connect_start`, o `state` é gravado em `pagbank_connect_states` apenas com `state`, `company_id`, `environment`, `user_id`, `expires_at` (colunas confirmadas na tabela). Nada sobre a origem de navegação. Ou seja: o Preview não é "perdido no caminho" — ele nunca é registrado.

**3. Por que a tela final é `/admin/eventos`**

Não há retorno configurado para `/admin/eventos`. O callback devolve para `/admin/empresa`; é a própria tela da empresa que reencaminha:

`src/pages/admin/Company.tsx:1290` — `if (!isGerente && !isOperador) return <Navigate to="/admin/eventos" replace />`

No domínio de Produção a sessão do navegador é outra (o Preview tem armazenamento próprio), então o perfil não é reconhecido e a tela empurra para eventos. Não existe motivo histórico para `/admin/eventos` neste fluxo: é só um efeito colateral do domínio errado.

**4. Risco de misturar ambiente financeiro com domínio**

Não existe hoje e não será introduzido. O ambiente vem de `pagbank_connect_states.environment`, gravado no início, e o callback já recusa qualquer coisa diferente de `sandbox`. A origem de navegação continuará servindo apenas para decidir o endereço de volta.

## Correção mínima proposta

Preservar a origem no próprio `state` (mecanismo de CSRF já existente, sem fluxo paralelo):

1. **Migração aditiva**: nova coluna `return_origin text` em `pagbank_connect_states` (nulável, sem impacto em registros existentes).
2. **No início da autorização** (`connect_start`): identificar o host do navegador com o `classifyRequestOrigin` já existente em `_shared/payment-environment-policy.ts` e gravar o **origin** apenas quando reconhecido (domínios oficiais SmartBus, `smartbusbr.lovable.app`, `preview--smartbusbr.lovable.app` e demais hosts de desenvolvimento já classificados). Origem não reconhecida grava `null`.
3. **No callback**: montar o retorno como `<return_origin gravado>/admin/empresa?tab=pagamentos`. Sem origem gravada, usa o padrão atual de Produção com o caminho corrigido.
4. **Rota de retorno**: passa a ser `/admin/empresa?tab=pagamentos` (hoje é `/admin/empresa`, sem a aba).

Proteção contra open redirect: o frontend não envia nenhuma URL. O host vem de headers, é validado contra a lista fechada no momento da gravação e o caminho é fixo no código. Nada arbitrário chega ao `Location`.

## O que não muda

Aplicação Connect, `client_id`, `client_secret`, conta da plataforma, conta vendedora, callback técnico cadastrado no PagBank, troca de `code`, guarda cifrada dos tokens, isolamento por empresa, bloqueio de Produção e todo o Asaas permanecem exatamente como estão.

## Validação

`bunx tsgo -p tsconfig.app.json --noEmit`, `bun run test`, deploy das duas funções e, por fim, o teste real: iniciar no Preview, autorizar no PagBank Sandbox e conferir o retorno em `preview--smartbusbr.lovable.app/admin/empresa?tab=pagamentos` com o ambiente ainda em Sandbox. Uma execução iniciada em `www.smartbus.com.br` continua voltando para o mesmo domínio.
