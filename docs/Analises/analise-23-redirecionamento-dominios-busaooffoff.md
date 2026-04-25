# 1. Objetivo

Registrar uma análise técnico-funcional, investigativa e conclusiva sobre o comportamento atual dos domínios públicos relacionados à operação Busão Off Off no projeto Smartbus BR, sem aplicar correção automática nesta etapa.

A análise busca responder:
- o que já existe hoje no código e na publicação;
- por que o comportamento esperado não está funcionando de forma confiável;
- se a estratégia desejada é viável no modelo atual do Lovable;
- qual é a tática correta, mínima e auditável para corrigir depois.

---

# 2. Cenário atual encontrado

## 2.1 O que existe no app hoje

Foi encontrada **uma tentativa explícita de roteamento por hostname no código**, criada para o domínio `busaooffoff.com.br`.

Essa lógica faz o seguinte:
- na rota raiz `/`, lê `window.location.hostname`;
- consulta um mapa estático de hostname -> slug;
- se o hostname for `busaooffoff.com.br` ou `www.busaooffoff.com.br`, retorna redirect interno para `/empresa/busaooffoff`;
- se não houver mapeamento, mantém a landing page principal.

Também existe **configuração de redirect em arquivos de publicação**:
- `public/_redirects` com redirect 301 para `https://smartbusbr.com.br/busaooffoff/:splat`;
- `vercel.json` com redirects por host para `https://smartbusbr.com.br/busaooffoff/$1`.

Ou seja, hoje coexistem **duas estratégias diferentes e incompatíveis entre si**:
1. redirect **em código** para `/empresa/busaooffoff`;
2. redirect **de infraestrutura/publicação** para `/busaooffoff`.

## 2.2 O que o app publica como entrada pública

A aplicação usa `react-router-dom` e declara:
- `/` -> `PublicRootRedirect`;
- `/empresa/:nick` -> vitrine pública da empresa;
- `/:nick` -> short link público, que valida slug e redireciona para `/empresa/:nick`;
- `/eventos` -> vitrine geral;
- rota fallback `*` -> `NotFound`.

## 2.3 O ponto mais importante do diagnóstico

**Não existe rota declarada para `/busaooffoff` como destino fixo de domínio.**

O que existe é:
- uma rota dinâmica `/:nick`, que pode aceitar `/busaooffoff` **somente se** houver empresa com `public_slug = busaooffoff` no banco;
- uma rota canônica explícita `/empresa/busaooffoff`, que é a forma mais estável já assumida pelo próprio código de redirect por hostname.

Portanto, o destino pedido no enunciado (`https://smartbusbr.com.br/busaooffoff`) **não está garantido apenas por roteamento estático**; ele depende de dados válidos no banco e de a lógica do short link continuar funcionando.

---

# 3. Mapeamento dos domínios e rotas

## 3.1 Domínios identificados no repositório

Confirmados no código/configuração:
- `busaooffoff.com.br`
- `www.busaooffoff.com.br`
- `smartbusbr.com.br`
- `www.smartbusbr.com.br`
- referência a preview `preview.lovable.app`

**Não foi encontrada configuração em código para `busaonacional.com.br` nem `www.busaonacional.com.br`.**

## 3.2 Rotas públicas relevantes

### Landing / entrada principal
- `/` -> `PublicRootRedirect`
- comportamento padrão sem hostname mapeado: renderiza `LandingPage`

### Vitrine geral
- `/eventos`

### Vitrine pública por empresa
- `/empresa/:nick`
- é a rota pública explícita para carregar dados da empresa por `public_slug`

### Short link público
- `/:nick`
- se o slug existir e não for reservado, redireciona para `/empresa/:nick`
- se não existir, mostra estado de página não encontrada

## 3.3 Destino esperado validado

### `/empresa/busaooffoff`
Sim: existe como rota explícita e pública.

### `/busaooffoff`
Não existe como rota dedicada. Ela só funciona indiretamente pela rota dinâmica `/:nick`, e apenas se:
- `busaooffoff` não colidir com rotas reservadas; e
- a empresa existir no banco com `public_slug = 'busaooffoff'`.

## 3.4 Mapeamento observado por hostname

Hoje o código só diferencia estes hosts:
- `busaooffoff.com.br`
- `www.busaooffoff.com.br`

Para qualquer outro hostname, inclusive `busaonacional.com.br`, o app localmente não aplica regra especial e cai no fluxo padrão da home pública.

---

# 4. Evidências encontradas no código/publicação

## 4.1 Evidência de redirect em código

Arquivo: `src/lib/companyDomainRouting.ts`

Achados:
- mapa estático `COMPANY_DOMAIN_SLUG_MAP` com `busaooffoff.com.br` e `www.busaooffoff.com.br` -> `busaooffoff`;
- função `resolveCompanyDomainRedirect` só atua quando `pathname === '/'`;
- retorno do redirect: `/empresa/${companySlug}`.

Conclusão: o código atual foi desenhado para transformar a raiz do domínio secundário em **vitrine da empresa**, não em `/busaooffoff`.

## 4.2 Evidência de aplicação do redirect em runtime do app

Arquivo: `src/pages/public/PublicRootRedirect.tsx`

Achados:
- a rota `/` chama `resolveCompanyDomainRedirect(...)` usando `window.location.hostname` e `window.location.pathname`;
- se houver match, retorna `<Navigate to={redirectPath} replace />`;
- sem match, renderiza a `LandingPage`.

Conclusão: existe tentativa real de redirect client-side dentro do app.

## 4.3 Evidência de rotas públicas existentes

Arquivo: `src/App.tsx`

Achados relevantes:
- `/` -> `PublicRootRedirect`;
- `/empresa/:nick` -> `PublicCompanyShowcase`;
- `/:nick` -> `PublicCompanyShortLink`.

Conclusão: a vitrine oficial está ancorada em `/empresa/:nick`, enquanto `/:nick` é um atalho dependente de banco.

## 4.4 Evidência de dependência do short link em relação ao banco

Arquivo: `src/pages/public/PublicCompanyShortLink.tsx`

Achados:
- a página consulta `companies.public_slug` no Supabase;
- se existir, redireciona para `/empresa/${normalizedNick}`;
- se não existir, mostra erro de página não encontrada.

Conclusão: `/busaooffoff` não é destino estruturalmente garantido; ele depende de registro válido no banco.

## 4.5 Evidência de canonical/short link assumidos pela área administrativa

Arquivo: `src/pages/admin/Company.tsx`

Achados:
- short link mostrado no admin: `https://www.smartbusbr.com.br/{nick}`;
- link canônico mostrado no admin: `https://www.smartbusbr.com.br/empresa/{nick}`.

Conclusão: o próprio backoffice já trata `/empresa/:nick` como caminho canônico e `/:nick` como atalho.

## 4.6 Evidência de tentativa de redirect em publicação/infrastrutura

Arquivos:
- `public/_redirects`
- `vercel.json`

Achados:
- ambos configuram redirect do host `busaooffoff.com.br` / `www.busaooffoff.com.br` para `https://smartbusbr.com.br/busaooffoff`.

Conclusão: há uma segunda tentativa, fora do roteamento React, mas apontando para um destino **diferente** do que o código considera canônico.

## 4.7 Evidência operacional obtida por probe HTTP

Comandos executados na investigação:
- `curl -I -L https://busaooffoff.com.br/`
- `curl -I -L https://busaooffoff.com.br/foo`
- `curl -I -L https://busaooffoff.com.br/empresa/busaooffoff`
- `curl -I -L http://busaooffoff.com.br/`
- `curl -I -L https://busaonacional.com.br/`
- `curl -I -L https://smartbusbr.com.br/`

Resultado observado em 2026-03-23 (UTC):
- `busaooffoff.com.br` respondeu com redirect para `https://www.smartbusbr.com.br/...` preservando o path, **não** para `/busaooffoff`;
- os probes para `www.busaooffoff.com.br`, `busaonacional.com.br`, `www.busaonacional.com.br` e também `smartbusbr.com.br` retornaram `503 Service Unavailable` neste ambiente de investigação, o que impede concluir por HTTP direto qual conteúdo final o navegador humano está recebendo agora;
- `getent ahosts` retornou IP apenas para `busaooffoff.com.br`; os demais hosts não ficaram confirmados por DNS neste container.

Conclusão: existe sinal forte de que a publicação ativa não está refletindo o redirect definido em `_redirects`/`vercel.json` e que, pelo menos para `busaooffoff.com.br`, o comportamento ativo parece ser um **redirect de domínio primário** para `www.smartbusbr.com.br`, sem escolha de rota interna.

## 4.8 Evidência oficial da limitação/plataforma Lovable

Documentação oficial do Lovable validada durante a investigação:
- custom domains podem ser conectados individualmente;
- `www` precisa ser adicionado separadamente;
- um único domínio pode ser marcado como primary;
- se um domínio é primary, **todos os outros domínios redirecionam para ele**;
- se o primary for removido/unsetado, todos os domínios passam a servir o mesmo projeto igualmente;
- para usar CDN/reverse proxy com roteamento próprio, a recomendação oficial é **não** conectar o domínio em `Project -> Settings -> Domains`, e sim apontar o DNS/proxy para a URL `*.lovable.app`, deixando proxy/CDN gerenciar SSL e routing.

Conclusão: o recurso de `primary domain` do Lovable resolve redirect **entre domínios**, mas não documenta redirect de um domínio secundário para um **caminho interno específico** dentro do domínio primário.

---

# 5. Causa raiz mais provável

A causa raiz mais provável é a combinação dos fatores abaixo:

## 5.1 Estratégia duplicada e conflitante
Hoje existem duas táticas concorrentes:
- tática A: redirect client-side por hostname para `/empresa/busaooffoff`;
- tática B: redirect de infraestrutura/publicação para `https://smartbusbr.com.br/busaooffoff`.

Isso fere previsibilidade e auditabilidade, porque o sistema passa a depender de **quem intercepta primeiro**: a plataforma de domínio/publicação ou o app React.

## 5.2 Uso incorreto ou insuficiente do “primary domain” para este caso
Se `smartbusbr.com.br` ou `www.smartbusbr.com.br` estiver marcado como primary no Lovable, a própria plataforma tende a redirecionar os demais domínios apenas para o domínio primário, preservando o path, mas **sem aplicar inteligência de rota por operação**.

Nesse cenário:
- `busaooffoff.com.br/` -> `www.smartbusbr.com.br/`
- `busaooffoff.com.br/foo` -> `www.smartbusbr.com.br/foo`

Isso bate com o probe HTTP coletado e explica por que o usuário pode cair em landing genérica ou em rota errada.

## 5.3 Destino desejado não está alinhado com a rota canônica do app
O destino solicitado no enunciado é `/busaooffoff`, mas o app já assume `/empresa/:nick` como rota canônica de vitrine.

Isso é importante porque:
- `/empresa/busaooffoff` é estável e declarada em router;
- `/busaooffoff` é um atalho dinâmico que depende de banco;
- a tentativa de infraestrutura hoje aponta para o atalho, enquanto o app por hostname aponta para a canônica.

## 5.4 `busaonacional.com.br` não está coberto pelo código
Como não há nenhuma regra em código para `busaonacional.com.br`, se esse domínio estiver conectado ao mesmo projeto e sem proxy/redirect externo, o comportamento natural do app será servir `/` como landing page.

Isso encaixa exatamente na hipótese de “domínio conectado ao mesmo projeto, mas sem regra específica”.

---

# 6. Hipóteses secundárias

## 6.1 Publicação desatualizada/parcial
Existe precedente documentado no próprio repositório de ambiente Lovable publicado não refletindo imediatamente tudo que existe no código. Portanto, é possível que `_redirects` e/ou `vercel.json` existam no repositório, mas **não sejam a fonte efetiva** do ambiente atualmente servindo os domínios.

## 6.2 Domínio conectado em local errado ou a projeto diferente
A documentação do Lovable informa que um domínio pode ser removido/reconectado e que `Removed` ocorre inclusive quando o domínio foi adicionado a outro projeto. Sem acesso ao painel do Lovable, não dá para afirmar se algum domínio está anexado ao projeto correto.

## 6.3 Problema de DNS / SSL / proxy em hosts secundários
Os retornos `503` e a ausência de resolução consistente por `getent` sugerem que ao menos parte dos hosts secundários pode estar com camada de DNS/proxy/SSL inconsistente neste momento. Isso não prova causa única, mas impede cravar que o problema é só do app.

---

# 7. Limitações da estratégia atual

## 7.1 Lovable primary domain não resolve rota interna específica
O recurso oficial de primary domain redireciona domínios para o domínio principal, mas não há documentação oficial dizendo que ele consegue transformar:
- `dominio-secundario.com/` -> `dominio-principal.com/rota-especifica`

Portanto, usar apenas primary domain para este caso é insuficiente.

## 7.2 Redirect client-side depende de o app ser servido antes
A lógica em `PublicRootRedirect` só roda depois que:
- o domínio já entregou o app corretamente;
- a rota `/` chegou ao React;
- o JavaScript carregou.

Se a plataforma estiver redirecionando o host para outro domínio antes disso, o app nunca terá chance de aplicar sua regra por hostname.

## 7.3 `/busaooffoff` é mais frágil que `/empresa/busaooffoff`
Porque depende de `public_slug` válido e da rota dinâmica `/:nick`, enquanto `/empresa/:nick` é rota explícita e canônica.

## 7.4 Múltiplos domínios no mesmo projeto sem política clara geram ambiguidade
No Lovable, se o primary domain estiver unsetado, todos os domínios servem o mesmo projeto igualmente. Se não houver regra por hostname no app, todos caem no mesmo comportamento padrão. Se houver rule mix de app + plataforma, o comportamento fica frágil.

---

# 8. Opções viáveis de implementação

## Opção A — Recomendada
**Padronizar o destino oficial como `/empresa/busaooffoff` e tratar o domínio secundário fora do recurso de primary domain.**

Tática:
1. assumir `/empresa/busaooffoff` como destino oficial/canônico;
2. manter `smartbusbr.com.br` / `www.smartbusbr.com.br` como domínios principais da app;
3. retirar o domínio operacional secundário do mecanismo que apenas “redireciona para o primary”;
4. implementar o redirect do domínio secundário em camada própria de infraestrutura compatível com roteamento por host + path (CDN, reverse proxy, ou outro edge layer) **ou** servir esse domínio como alias do mesmo projeto sem primary e deixar o app fazer a decisão por hostname;
5. escolher apenas uma das duas abordagens, não ambas.

Vantagens:
- mais previsível;
- mais alinhada ao caminho canônico já existente no app;
- evita depender do short link `/:nick`.

Riscos:
- exige validar onde o domínio está configurado hoje no Lovable;
- se optar por proxy externo, há mudança operacional fora do código.

## Opção B — Segunda melhor
**Usar o domínio secundário como alias do mesmo projeto, sem primary redirect para esse host, e deixar o app fazer redirect por hostname para `/empresa/busaooffoff`.**

Tática:
1. conectar `busaooffoff.com.br` ao mesmo projeto;
2. garantir que ele não seja forçado a redirecionar automaticamente para o primary domain;
3. usar somente `PublicRootRedirect` + `companyDomainRouting.ts` para a raiz `/`.

Vantagens:
- reaproveita o padrão já existente no código;
- mudança mínima no app;
- auditável.

Riscos:
- só resolve a raiz `/` no estado atual; paths profundos (`/foo`) continuariam sem tática definida;
- se o domínio continuar submetido ao primary domain do Lovable, essa estratégia não dispara;
- depende de o app carregar antes da regra rodar.

## Opção C — Menos recomendada
**Manter redirect externo, mas apontando para `/busaooffoff`.**

Só é aceitável se a equipe confirmar que:
- o slug `busaooffoff` existirá de forma permanente;
- o short link `/:nick` é intencionalmente suportado como endereço público estável.

Risco principal:
- apoiar a estratégia em uma rota não-canônica e dependente de banco.

---

# 9. Recomendação final

## 9.1 Recomendação objetiva
A abordagem final recomendada é:

**adotar `/empresa/busaooffoff` como destino oficial, eliminar a duplicidade entre redirect em código e redirect em infraestrutura, e não depender do recurso de primary domain do Lovable para fazer redirect para rota interna específica.**

## 9.2 Interpretação prática

### O que é responsabilidade de domínio/publicação
- conectar domínio;
- verificar DNS/SSL/status Live;
- decidir qual domínio é primary;
- definir se um domínio secundário será apenas alias ou se será tratado por proxy externo.

### O que é responsabilidade do app/código
- decidir para qual rota pública da vitrine a operação deve ir quando o hostname chegar ao app;
- manter a rota canônica estável;
- evitar lógica duplicada e divergente.

### O que não deve ser misturado
- um redirect de primary domain para domínio principal;
- mais um redirect client-side para outra rota;
- mais um redirect em `_redirects`/`vercel.json` apontando para destino diferente.

## 9.3 Respostas objetivas pedidas

1. **Hoje já existe alguma tentativa de implementação de redirect?**  
   **SIM.** Existe no código (`PublicRootRedirect` + `companyDomainRouting`) e também em `public/_redirects` / `vercel.json`.

2. **Essa tentativa está no código ou na configuração do domínio?**  
   **SIM, nos dois lugares.** E esse é parte do problema.

3. **`busaooffoff.com.br` pode redirecionar para `smartbusbr.com.br/busaooffoff` apenas com configuração atual?**  
   **NÃO de forma confiável.** O repositório tenta isso, mas o probe real sugere que o ambiente ativo está redirecionando apenas para o domínio primário (`www.smartbusbr.com.br`) e não para a rota `/busaooffoff`.

4. **O recurso de domínio primário resolve esse cenário específico?**  
   **NÃO.** Ele resolve domínio -> domínio principal, mas não há evidência oficial de que resolva domínio -> rota interna específica.

5. **O problema atual é de código?**  
   **PARCIALMENTE SIM.** O código participa do problema por coexistir com uma segunda estratégia divergente e por usar `/empresa/busaooffoff`, enquanto a infra aponta para `/busaooffoff`.

6. **O problema atual é de publicação/domínio?**  
   **SIM.** Os sinais mais fortes apontam que a publicação/domínio ativo não está entregando a estratégia pretendida e provavelmente está sob efeito do primary domain ou configuração externa divergente.

7. **O problema atual é de estratégia?**  
   **SIM.** Há conflito entre rota canônica, short link, primary domain e redirect em código.

8. **O destino correto realmente é `/busaooffoff`?**  
   **PROVAVELMENTE NÃO como destino canônico.** O destino estruturalmente mais correto no app atual é `/empresa/busaooffoff`.

9. **Existe risco de quebrar a landing principal se mexermos errado?**  
   **SIM.** A rota `/` é a entrada pública principal e qualquer mudança mal posicionada pode desviar todos os hosts para a vitrine errada ou quebrar a landing.

10. **Qual é a abordagem recomendada final?**  
   **Padronizar a vitrine da operação em `/empresa/busaooffoff` e escolher uma única camada responsável pelo redirect do domínio secundário, preferencialmente evitando usar primary domain do Lovable para um caso que exige rota interna específica.**

---

# 10. Riscos e cuidados antes de corrigir

Antes de qualquer correção, é necessário validar no painel do Lovable:
- quais domínios estão cadastrados em `Project -> Settings -> Domains`;
- qual está marcado como `primary`;
- se `busaooffoff.com.br`, `www.busaooffoff.com.br`, `busaonacional.com.br` e `www.busaonacional.com.br` estão todos conectados ao **mesmo projeto**;
- qual o status de cada um (`Live`, `Offline`, `Removed`, etc.);
- se há CDN/proxy externo intermediando algum deles.

Cuidados essenciais:
- não corrigir sem decidir qual é a rota canônica oficial;
- não manter ao mesmo tempo redirect por app e redirect por infra apontando para destinos diferentes;
- não presumir que `_redirects` ou `vercel.json` estão sendo honrados pelo runtime atual do Lovable;
- não mexer no primary domain sem mapear impacto em `smartbusbr.com.br` e `www.smartbusbr.com.br`.

---

# 11. Arquivos inspecionados

Arquivos principais inspecionados nesta investigação:
- `src/App.tsx`
- `src/lib/companyDomainRouting.ts`
- `src/pages/public/PublicRootRedirect.tsx`
- `src/pages/public/PublicCompanyShowcase.tsx`
- `src/pages/public/PublicCompanyShortLink.tsx`
- `src/pages/public/LandingPage.tsx`
- `src/pages/admin/Company.tsx`
- `src/lib/publicSlug.ts`
- `src/test/companyDomainRouting.test.ts`
- `public/_redirects`
- `vercel.json`
- `README.md`
- `docs/step-02-validacao-publicacao-lovable-cloud-2026-03-21-13-35.md`
- `docs/step-03-diagnostico-pipeline-publicacao-lovable-cloud-2026-03-21-14-15.md`

Comandos/validações operacionais executados:
- `rg -n "hostname|host|window.location|redirect|Navigate|domain|busaooffoff|busaonacional|smartbusbr" src public README.md`
- `curl -I -L https://busaooffoff.com.br/`
- `curl -I -L https://busaooffoff.com.br/foo`
- `curl -I -L https://busaooffoff.com.br/empresa/busaooffoff`
- `curl -I -L https://busaonacional.com.br/`
- `curl -I -L https://smartbusbr.com.br/`
- `getent ahosts busaooffoff.com.br`
- `getent ahosts www.busaooffoff.com.br`
- `getent ahosts busaonacional.com.br`
- `getent ahosts www.busaonacional.com.br`
- `getent ahosts smartbusbr.com.br`

Documentação oficial consultada:
- Lovable — `Connect a custom domain`
- Lovable — `Publish your app`
- Lovable — `Implement SEO and GEO best practices`

---

# 12. Perguntas em aberto, se houver

1. No painel do Lovable, quais domínios estão efetivamente em status `Live` hoje?
2. Qual domínio está marcado como `primary` neste projeto?
3. `busaonacional.com.br` está conectado a este mesmo projeto ou a outro projeto/publicação?
4. Existe algum CDN/proxy externo entre esses domínios e o Lovable?
5. A equipe quer oficializar como endereço público da operação:
   - o caminho canônico `/empresa/busaooffoff`, ou
   - o atalho `/busaooffoff`?
6. O comportamento esperado deve valer apenas para a raiz `/` ou também para qualquer path profundo do domínio secundário?

