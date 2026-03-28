# Implementação — `/admin/programas-beneficio`

## 1. Resumo executivo
Foi implementada a migração do CRUD principal de Programas de Benefício para tela dedicada, removendo o modal como fluxo central. A listagem em `/admin/programas-beneficio` permaneceu como hub (KPIs, filtros, tabela e ações), e os fluxos de criação/edição/gerenciamento agora ocorrem em:
- `/admin/programas-beneficio/novo`
- `/admin/programas-beneficio/:id`

## 2. Arquivos principais alterados
- `src/App.tsx`
- `src/pages/admin/BenefitPrograms.tsx`
- `src/pages/admin/BenefitProgramEditor.tsx`

## 3. Mudanças de navegação
- `Adicionar Programa` agora navega para `/admin/programas-beneficio/novo`.
- `Editar` agora navega para `/admin/programas-beneficio/:id?tab=dados`.
- `Gerenciar eventos vinculados` agora navega para `/admin/programas-beneficio/:id?tab=eventos`.
- `Gerenciar CPFs elegíveis` agora navega para `/admin/programas-beneficio/:id?tab=cpfs`.
- A tela dedicada lê `tab` por query param para abrir a seção correta, substituindo o comportamento anterior de abertura de aba no modal.

## 4. Estrutura da nova tela
A nova tela dedicada (`BenefitProgramEditor`) foi organizada com padrão admin existente:
- `AdminLayout` + `PageHeader` com ações (voltar, salvar, ativar/inativar em edição).
- Conteúdo dividido por `Tabs` e `Cards`, com melhor uso horizontal em desktop.
- Blocos funcionais:
  - Dados do programa
  - Configuração do benefício
  - Vigência
  - Aplicação
  - Eventos vinculados
  - CPFs elegíveis (cadastro manual, importação CSV/XLSX, colagem rápida, busca e tabela com ações)

## 5. Reaproveitamento de lógica existente
Foram preservados e reaproveitados:
- regras de validação de formulário do programa;
- regras de vigência;
- regras de CPF (normalização/validação);
- importação CSV/XLSX + template + resumo de importação;
- operações de CPFs (insert/update/delete/upsert);
- vínculo com eventos;
- padrão de status ativo/inativo;
- filtro de multiempresa por `company_id` em leitura e escrita.

## 6. O que deixou de usar modal
- O modal grande de create/edit/gerenciamento completo do programa foi removido da tela de listagem.
- O CRUD principal (dados, eventos e CPFs) passou integralmente para tela dedicada.
- Não foi mantido fluxo paralelo modal + página para o mesmo escopo.

## 7. Validação funcional
Validações executadas nesta implementação:
- build do projeto para garantir compilação da nova estrutura de rotas e páginas;
- lint geral (com falhas preexistentes no repositório, fora do escopo da mudança).

Checklist validado por implementação:
- `/admin/programas-beneficio` continua como listagem/hub.
- `/admin/programas-beneficio/novo` criado e funcional para cadastro.
- `/admin/programas-beneficio/:id` criado e funcional para edição.
- ações da listagem redirecionam para a tela dedicada correta.
- lógica de `company_id` preservada no fluxo migrado.

## 8. Riscos ou pendências
- O repositório possui dívida de lint preexistente global; não foi tratada para manter escopo mínimo.
- Não foi adicionado screenshot automatizado porque o ambiente atual não expõe ferramenta de browser/screenshot.
