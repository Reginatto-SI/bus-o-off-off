# Fase 2 — Refinamento mobile (telas A)

## 1. Objetivo
Aplicar refinamentos mobile leves e localizados nas telas administrativas de alta viabilidade (`/admin/locais`, `/admin/minha-conta`, `/admin/indicacoes`), sem alterar componentes globais, fluxo de negócio, validações ou arquitetura.

## 2. Telas ajustadas
- `/admin/locais`
- `/admin/minha-conta`
- `/admin/indicacoes`

## 3. O que foi melhorado por tela

### `/admin/locais`
- **Problema no mobile antes:** ações do cabeçalho e rodapé do modal podiam ficar comprimidas em largura reduzida; tabela com excesso de informação simultânea.
- **Ajuste realizado:** ações do cabeçalho empilhadas no mobile; ações do formulário empilhadas no modal; coluna secundária `Cidade/UF` oculta em telas menores; aumento de respiro vertical nas linhas.
- **Impacto esperado:** leitura mais limpa, toque mais confortável e manutenção dos dados críticos (nome, status e ação) com menor “aperto” visual.

### `/admin/minha-conta`
- **Problema no mobile antes:** abas e ações finais competiam por espaço horizontal.
- **Ajuste realizado:** abas empilhadas no mobile para ampliar área de toque; botões de ação final empilhados no mobile; mantido grid responsivo existente sem alterar regra de formulário.
- **Impacto esperado:** navegação mais clara por seção, menor chance de toque incorreto e fluxo de edição mais previsível.

### `/admin/indicacoes`
- **Problema no mobile antes:** alta densidade de colunas na tabela e botões de cópia concorrendo no mesmo eixo horizontal.
- **Ajuste realizado:** ações principais (copiar link/código) empilhadas no mobile; ocultação de colunas secundárias (`Meta`, `Data da indicação`, `Elegível em`) em breakpoints menores; maior espaçamento vertical nas linhas.
- **Impacto esperado:** foco nos dados mais importantes (empresa, status, progresso, recompensa e ações) com melhor leitura vertical e operação por toque.

## 4. O que NÃO foi alterado (por segurança)
- `AppLayout` / `AdminLayout`
- `AdminSidebar`
- estrutura global de `PageHeader`
- componente base `FilterCard`
- componente base `Table`
- componente base `Dialog`
- `index.css` global
- fluxo de negócio, regras de elegibilidade, validações e integrações de backend

## 5. Riscos identificados
- Baixo risco funcional: mudanças focadas em classes utilitárias de layout responsivo por tela.
- Risco visual baixo em desktop: mitigado por uso de classes com breakpoint (`sm`, `md`, `lg`, `xl`) preservando layout existente em telas maiores.

## 6. Checklist de regressão desktop
- [x] layout intacto
- [x] tabelas intactas
- [x] modais intactos
- [x] navegação intacta

## 7. Checklist mobile
- [x] leitura melhorou
- [x] ações acessíveis
- [x] fluxo mais claro

## 8. Próximo passo recomendado
Executar validação assistida com usuários internos em dispositivo real (Android/iOS) para confirmar conforto de toque e priorização de informação antes de avançar para telas de viabilidade média.

## Instrução final
Quando surgir dúvida sobre ajustes globais ou componentes base, manter abordagem conservadora: não alterar estrutura compartilhada e registrar pendências para fases futuras.
