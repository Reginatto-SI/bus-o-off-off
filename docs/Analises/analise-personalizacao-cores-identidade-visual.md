# Análise — Personalização de cores na Identidade Visual

## 1. Diagnóstico da estrutura atual

A aba **Identidade Visual** da tela `/admin/empresa` é renderizada pelo componente `BrandIdentityTab`, chamado pela página `CompanyPage` dentro da tab `identidade`.

A investigação mostrou que as cores já são mantidas no estado principal do formulário da empresa e salvas no próprio registro de `companies`, sem fluxo global de tema:

- `primary_color`: cor primária do sistema;
- `accent_color`: cor de destaque;
- `ticket_color`: cor principal da passagem.

Os campos já são do tipo `text` no banco e as migrations existentes indicam armazenamento em hexadecimal. Portanto, a limitação era de UI: a tela só oferecia cliques na paleta fixa, apesar dos campos já aceitarem qualquer HEX válido.

## 2. Arquivos alterados

- `src/components/admin/BrandIdentityTab.tsx`
  - Mantida a paleta atual.
  - Adicionado item visual **Personalizada** para Cor Primária, Cor de Destaque e Cor principal da passagem.
  - Adicionado popover com seletor nativo de cor, campo hexadecimal, prévia, aplicar/cancelar e aviso não bloqueante de contraste.
  - Normalização de HEX para `#RRGGBB` antes de atualizar o estado controlado pelo formulário pai.

- `docs/Analises/analise-personalizacao-cores-identidade-visual.md`
  - Relatório obrigatório da alteração.

## 3. Como as cores eram salvas antes

Antes da alteração, a UI permitia selecionar somente valores da paleta fixa em `BrandIdentityTab`. Ao salvar a empresa, `CompanyPage` persistia os valores do estado `brandColors` nos campos:

- `companies.primary_color`;
- `companies.accent_color`;
- `companies.ticket_color`.

Mesmo antes da alteração, esses campos já eram `text` e recebiam strings HEX, como `#F97316`.

## 4. Como as cores passam a ser salvas agora

A persistência continua exatamente nos mesmos campos da tabela `companies`.

A diferença é que a UI agora permite que o usuário escolha um HEX personalizado. Ao clicar em **Aplicar**, o componente normaliza o valor para o formato `#RRGGBB` e chama `onColorsChange`, atualizando o mesmo estado `brandColors` usado no submit da empresa.

Exemplos válidos:

- `#0F766E`;
- `0F766E` digitado no campo vira `#0F766E` ao sair do campo/aplicar;
- cores escolhidas no seletor nativo do navegador já chegam como HEX.

## 5. Necessidade de migration

Não houve necessidade de migration.

Motivos:

- `primary_color` já existia como `text DEFAULT '#F97316'` e possui comentário indicando uso como cor HEX;
- `accent_color` já existia como `text DEFAULT '#1D4ED8'`;
- `ticket_color` já existia como `text DEFAULT '#F97316'`;
- a alteração necessária era somente permitir entrada personalizada na UI.

## 6. Compatibilidade com empresas existentes

A compatibilidade foi mantida porque:

- os campos e payloads de persistência não mudaram;
- as cores prontas existentes não foram removidas nem renomeadas;
- se uma empresa já usa uma cor da paleta, a bolinha correspondente continua selecionada;
- se uma empresa já tiver um HEX fora da paleta, a opção **Personalizada** aparece selecionada e mostra a cor salva;
- o botão **Restaurar padrão** continua retornando para os mesmos defaults anteriores;
- as cores continuam armazenadas por registro de empresa, respeitando o isolamento multiempresa já existente.

## 7. Como testar a melhoria

1. Acessar `/admin/empresa` com uma empresa ativa.
2. Abrir a aba **Identidade Visual**.
3. Em **Cor Primária**:
   - selecionar uma cor pronta;
   - salvar;
   - selecionar **Personalizada**;
   - escolher/digitar um HEX válido;
   - aplicar, salvar e recarregar a tela;
   - confirmar que **Personalizada** fica selecionada quando o HEX não pertence à paleta.
4. Repetir o fluxo para **Cor de Destaque**.
5. Repetir o fluxo para **Cor principal da passagem**.
6. Gerar/visualizar passagem ou ticket e confirmar que a cor principal da passagem segue o valor de `ticket_color`.
7. Alternar para outra empresa e confirmar que ela mantém suas próprias cores.
8. Confirmar que empresas com valores antigos da paleta continuam exibindo a seleção correta.
9. Usar **Restaurar padrão**, salvar e confirmar retorno para as cores padrão.
10. Testar uma cor muito clara, como `#FFFFFF`, e confirmar que aparece o aviso não bloqueante de contraste.

## 8. Riscos restantes

- A validação de contraste é propositalmente simples e apenas não bloqueante; ela alerta cores muito claras, mas não calcula contraste completo contra todos os contextos de texto.
- Se houver registros antigos com valores que não sejam HEX válido, a aplicação existente já fazia fallback em alguns pontos; a UI nova prioriza edição para um HEX válido antes de aplicar.
- A geração de tickets não foi reescrita. Ela continua consumindo `ticket_color`/`primary_color` como já fazia antes.

## 9. Validação final pós-revisão

Revisão final realizada sobre a implementação da aba **Identidade Visual**, sem necessidade de refatoração, migration ou alteração em outras telas.

Resultado da validação:

- **Cor Primária**, **Cor de Destaque** e **Cor principal da passagem** usam o mesmo componente de cor personalizada, com `onApply` direcionado para os campos `primary`, `accent` e `ticket`, respectivamente.
- O campo hexadecimal aceita valor com `#` ou sem `#`, porque a normalização adiciona o prefixo quando necessário e converte para maiúsculas antes de aplicar.
- Ao salvar e recarregar, a cor permanece correta porque o fluxo continua usando `brandColors` no payload de `CompanyPage` e reidrata os mesmos campos `primary_color`, `accent_color` e `ticket_color` ao carregar a empresa.
- Ao escolher uma cor personalizada igual a uma cor da paleta, o comportamento visual permanece coerente: a cor da paleta correspondente aparece selecionada, pois a seleção visual compara o HEX final normalizado com a lista de cores prontas.
- O botão **Restaurar padrão** continua chamando os mesmos defaults anteriores (`#F97316`, `#2563EB`, `#F97316`).
- O isolamento multiempresa permanece preservado porque não houve mudança no modelo de persistência: as cores continuam salvas por registro da tabela `companies` e a empresa ativa é atualizada somente quando o registro salvo corresponde ao `activeCompanyId`.

Nenhum problema visual ou funcional pequeno foi identificado nesta revisão final.
