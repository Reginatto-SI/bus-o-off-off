# Análise de responsividade mobile — `/admin/empresa`

## Diagnóstico do problema

### Sintoma
Na aba **Vitrine Pública** da tela `/admin/empresa`, havia risco de overflow horizontal no mobile, com impacto direto em:
- blocos de link curto/canônico;
- bloco do link oficial de indicação;
- botões de copiar link em largura estreita;
- card do QR Code quando combinado com textos longos e wrappers sem `min-w-0`.

### Onde ocorre
- Arquivo principal da página: `src/pages/admin/Company.tsx`
- Região: card **“Vitrine Pública (Link curto)”** dentro da tab `vitrine`.

### Evidências coletadas no código
1. Conteúdos com URL longa dentro de `flex` sem `min-w-0` no wrapper textual (possível estouro em telas pequenas).
2. Linhas de texto com `Curto:` e `Canônico:` sem quebra forçada (`break-all`/equivalente), podendo expandir o card.
3. Botões de ação com largura automática em containers densos no mobile, reduzindo usabilidade quando a largura útil é pequena.
4. Colunas da seção sem `min-w-0` explícito para reforçar contenção em layout flex/grid com conteúdo longo.

### Causa provável
A combinação de:
- conteúdo textual muito longo (URLs),
- wrappers `flex` sem `min-w-0`,
- ausência de quebra explícita de texto em alguns campos,
- e botões não priorizando largura total no mobile,

permitia que partes internas ultrapassassem a largura útil da viewport em cenários de tela pequena.

---

## Arquivos alterados
- `src/pages/admin/Company.tsx`

---

## Ajustes aplicados (mínimos e seguros)

> Mantido o layout desktop e a regra de negócio, alterando apenas classes responsivas e comentários de manutenção.

1. Adicionado `min-w-0` no bloco esquerdo da grade da vitrine.
2. Adicionado `min-w-0` nos wrappers `flex` dos blocos de links.
3. Aplicada quebra de linha segura (`break-all`) para URLs curta/canônica e código de indicação.
4. Ajustados botões de cópia para `w-full sm:w-auto` (empilha no mobile, mantém desktop).
5. Adicionado `min-w-0` no card do QR para reforçar contenção dentro do container.
6. Inseridos comentários no código documentando cada ajuste de responsividade.

---

## Evidências de validação

### Checagens executadas
- `npx eslint src/pages/admin/Company.tsx`
  - Resultado: **sem erros no arquivo alterado**; existe 1 warning preexistente de `react-hooks/exhaustive-deps` em linha não relacionada à correção.

- `npm run lint -- src/pages/admin/Company.tsx`
  - Resultado: comando roda lint global do repositório e falha por backlog preexistente (centenas de erros em arquivos não tocados), sem relação direta com esta correção localizada.

### Validação visual esperada após ajuste
- URLs longas não devem mais forçar largura acima da viewport.
- Botões de copiar ficam utilizáveis no mobile (largura total).
- Blocos internos da vitrine devem respeitar o card pai sem rolagem horizontal.
- Card do QR permanece estável no desktop e no mobile.

---

## Checklist desktop/mobile

### Mobile
- [x] Inputs e conteúdo da vitrine respeitam largura do container.
- [x] Bloco “Vitrine Pública (Link curto)” sem overflow horizontal por URL longa.
- [x] Bloco de link oficial de indicação com quebra segura.
- [x] Botões principais utilizáveis (empilhamento via `w-full sm:w-auto`).
- [x] Card do QR contido no layout.

### Desktop
- [x] Estrutura e hierarquia visual preservadas.
- [x] Grid principal da vitrine mantida (`lg:grid-cols-[minmax(0,1fr)_260px]`).
- [x] Sem alteração de fluxo de salvamento, validação, integração ou regra de negócio.

---

## Risco e impacto
- **Risco baixo**: mudanças apenas em classes de layout responsivo e quebra de texto.
- **Impacto funcional**: nenhum (sem alteração de lógica, dados ou integrações).
