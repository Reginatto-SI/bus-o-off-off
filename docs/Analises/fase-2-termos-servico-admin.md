# Fase 2 — Administração de Termos e Políticas da Empresa

## 1. Resumo do que foi implementado

A Fase 2 criou a área administrativa para que a empresa ativa gerencie seus próprios termos e políticas usando as tabelas da Fase 1 (`company_terms`, `company_term_versions` e `company_term_audit_logs`).

A implementação permite:

- listar termos filtrados por `company_id` da empresa ativa;
- criar termo lógico com primeira versão em rascunho;
- editar versões em rascunho;
- publicar rascunhos;
- criar nova versão a partir de versão publicada/vigente anterior;
- marcar versão publicada como vigente;
- visualizar histórico de versões;
- visualizar conteúdo completo em modo leitura;
- registrar logs básicos de auditoria administrativa.

Não houve alteração em checkout público, eventos, Asaas, webhook, split, venda manual, confirmação, ticket ou fluxo financeiro.

## 2. Telas/rotas criadas ou alteradas

Foi adotada a opção mais simples e consistente com o padrão atual: uma nova aba dentro de `/admin/empresa`.

- Rota alterada: `/admin/empresa`.
- Aba adicionada: `Termos e Políticas`.

A escolha evita criar uma nova rota administrativa e mantém a funcionalidade junto aos dados da empresa, que é a proprietária dos termos.

## 3. Componentes criados ou alterados

- `src/pages/admin/Company.tsx`
  - adiciona a aba `Termos e Políticas` na estrutura de tabs existente;
  - renderiza o componente administrativo de termos dentro da página de empresa.

- `src/components/admin/CompanyTermsTab.tsx`
  - componente novo e isolado para a Fase 2;
  - reutiliza cards, tabela, dialogs, badges, alerts, toast e menu de ações já existentes no admin;
  - centraliza as operações de listagem, criação, edição de rascunho, publicação, nova versão, marcação de vigente, histórico e visualização.

## 4. Como funciona a criação de termo

Na aba `Termos e Políticas`, o botão `Novo termo` abre um modal com:

- título obrigatório;
- tipo obrigatório com nomes amigáveis;
- resumo opcional;
- conteúdo completo obrigatório;
- observação interna opcional.

Ao salvar:

1. cria um registro em `company_terms` com `company_id` da empresa ativa e status `rascunho`;
2. cria a versão inicial em `company_term_versions` com `version_number = 1` e status `draft`;
3. registra logs `term_created` e `version_created`, quando a RLS permitir.

## 5. Como funciona a edição de rascunho

A ação `Editar rascunho` aparece para termos que possuem versão `draft`.

A edição permite alterar:

- título;
- tipo;
- resumo;
- conteúdo;
- observação interna.

A interface bloqueia a edição de versões publicadas. Além disso, a trigger da Fase 1 protege versões não draft contra alteração de conteúdo.

## 6. Como funciona a publicação

A ação `Publicar versão` publica apenas versões em rascunho e deixa claro que a versão publicada ainda não é automaticamente vigente. Quando já existe uma versão publicada do mesmo termo, a UI direciona para `Publicar e marcar vigente` para evitar deixar o termo vigente apontando para uma versão substituída.

A UI também oferece a ação direta `Publicar e marcar vigente`, para o caso em que o gerente já deseja tornar a versão atual imediatamente ou está publicando uma nova versão de um termo que já possuía versão publicada. Essa ação continua respeitando a constraint da Fase 1: primeiro a versão é publicada e só depois `company_terms.current_version_id` é atualizado para a versão publicada.

Antes de publicar, a UI exibe confirmação específica para cada caminho:

- publicar sem marcar vigente: informa que a versão ficará protegida para auditoria, mas ainda não será vigente;
- publicar e marcar vigente: informa que a versão ficará protegida e será marcada como vigente para uso futuro.

Ao publicar:

1. valida que há conteúdo;
2. marca versões anteriores `published` do mesmo termo como `superseded`, respeitando o índice parcial da Fase 1 que permite apenas uma versão `published` por termo;
3. atualiza a versão draft para `published`;
4. preenche `published_at` e `published_by`, quando disponível;
5. registra log `version_published`;
6. somente na ação `Publicar e marcar vigente`, atualiza `current_version_id`, status do termo para `vigente` e registra `current_version_changed`.

Quando a publicação é feita sem marcar vigente, a versão publicada precisa ser marcada como vigente pela ação própria `Marcar como vigente`.

## 7. Como funciona a criação de nova versão

A ação `Criar nova versão` fica disponível quando o termo possui versão publicada/substituída e não possui outro rascunho aberto.

Ao criar nova versão:

1. o sistema busca a versão vigente atual; se não existir, usa a publicada ou substituída mais adequada;
2. copia título, tipo, conteúdo, resumo e observação interna;
3. cria uma nova versão em `draft`;
4. usa `version_number + 1`;
5. registra log `new_version_created`.

A versão antiga não é alterada e continua acessível no histórico.

## 8. Como funciona a marcação de vigente

A ação `Marcar como vigente` só é habilitada para versão `published` que ainda não é a vigente.

Ao marcar:

1. atualiza `company_terms.current_version_id`;
2. atualiza `company_terms.status` para `vigente`;
3. registra log `current_version_changed`.

Versões em rascunho não podem ser marcadas como vigentes. A validação também é reforçada pela trigger da Fase 1, que exige versão publicada.

## 9. Como funciona o histórico

A ação `Ver histórico` abre um modal com todas as versões do termo, mostrando:

- número da versão;
- status amigável;
- data de criação;
- data de publicação;
- indicação de publicador, quando disponível;
- resumo;
- ação para visualizar o conteúdo.

Versões publicadas e substituídas são apresentadas em modo leitura.

## 10. Como funciona a auditoria

A Fase 2 registra logs básicos em `company_term_audit_logs` para:

- `term_created`;
- `version_created`;
- `version_published`;
- `new_version_created`;
- `current_version_changed`.

Cada log usa:

- `company_id` da empresa ativa;
- `term_id`;
- `term_version_id`, quando aplicável;
- `action`;
- `description`;
- `performed_by`, quando houver usuário autenticado;
- `metadata`, quando útil.

Se o log falhar por RLS ou indisponibilidade momentânea, a ação principal permanece concluída e a UI mostra aviso de auditoria não registrada.

## 11. Limitações conhecidas

- A Fase 2 usa operações client-side sequenciais, sem RPC transacional. Em produção, pode ser interessante criar RPC para publicar versão + substituir versão anterior + registrar auditoria de forma atômica.
- O componente usa temporariamente `supabase as any` porque a migration da Fase 1 ainda não foi refletida nos tipos gerados do Supabase. Esse cast deve ser removido quando os tipos forem regenerados após aplicar/validar a migration da Fase 1.
- O nome do publicador aparece como indicação técnica (`Registrado`) porque a Fase 1 armazena `published_by`, mas esta fase não criou join com `profiles`.
- A inativação de termo não foi implementada nesta fase para evitar regra incompleta sobre impacto em eventos futuros. A ação ficou como pendência.
- A migration da Fase 1 ainda deve ser validada em Supabase/Postgres real antes de produção, conforme documentação anterior.
- Não há leitura pública dos termos nesta fase.

## 12. Pendências para Fase 3

- Definir vínculo de termos com evento usando `selection_mode`.
- Criar UI de configuração de termos no cadastro/edição de evento.
- Validar publicação de evento conforme termos exigidos.
- Criar leitura pública segura apenas das versões vinculadas ao evento.
- Implementar aceite no checkout público.
- Registrar aceite em `sale_term_acceptances` antes do pagamento.
- Blindar `create-asaas-payment` contra pagamento sem aceite quando obrigatório.
- Exibir termos aceitos na confirmação/ticket/consulta quando aplicável.
- Definir regra final de inativação e impacto em eventos futuros.

## 13. Checklist de testes manuais

### Listagem

- [ ] Entrar como usuário da empresa A e verificar que apenas termos da empresa A aparecem.
- [ ] Entrar em empresa sem termos e validar estado vazio amigável.
- [ ] Confirmar que a lista mostra título, tipo, status, versão vigente, criação e atualização.

### Criação

- [ ] Criar novo termo em rascunho.
- [ ] Tentar criar sem título e validar mensagem amigável.
- [ ] Tentar criar sem conteúdo e validar mensagem amigável.
- [ ] Salvar resumo opcional.
- [ ] Salvar observação interna opcional.

### Edição de rascunho

- [ ] Editar conteúdo de versão draft.
- [ ] Editar resumo.
- [ ] Salvar alterações.
- [ ] Confirmar que versão publicada não abre para edição direta.

### Publicação

- [ ] Publicar versão draft sem marcar vigente e confirmar que ela não vira vigente automaticamente.
- [ ] Publicar versão draft usando `Publicar e marcar vigente` e confirmar que ela vira vigente.
- [ ] Confirmar que a versão vira publicada.
- [ ] Confirmar preenchimento de data de publicação.
- [ ] Marcar manualmente uma versão publicada como vigente.
- [ ] Confirmar log em `company_term_audit_logs`.

### Nova versão

- [ ] Criar nova versão a partir de versão publicada.
- [ ] Confirmar que versão antiga permanece intacta no histórico.
- [ ] Confirmar que nova versão nasce como rascunho.
- [ ] Publicar nova versão.
- [ ] Marcar nova versão como vigente.

### Histórico

- [ ] Abrir histórico.
- [ ] Visualizar versão antiga.
- [ ] Visualizar versão vigente.
- [ ] Confirmar que versão publicada está em modo leitura.

### Multiempresa

- [ ] Empresa A não visualiza termos da empresa B.
- [ ] Empresa A não altera termo da empresa B.
- [ ] Tentativa indevida é bloqueada por RLS/erro tratado.

### Auditoria

- [ ] Criação gera log.
- [ ] Publicação gera log.
- [ ] Troca de vigente gera log.
- [ ] Criação de nova versão gera log.
