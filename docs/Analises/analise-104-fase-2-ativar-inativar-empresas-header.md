# Análise — Fase 2: ativar/inativar empresas no modal do Header

## 1) Diagnóstico da implementação anterior

- A Fase 1 substituiu o dropdown por modal com busca/filtro/lista.
- A troca de empresa ainda usava `switchCompany` corretamente.
- Limitações identificadas para Fase 2:
  1. havia seleção por clique na linha inteira;
  2. empresas inativas podiam seguir fluxo visual de seleção;
  3. busca/filtro permaneciam com estado antigo ao reabrir modal;
  4. `userCompanies` (origem do AuthContext) trazia somente empresas ativas no cenário Developer.

## 2) Ajustes finos feitos na Fase 1

1. Removida seleção por clique na linha.
2. Troca de empresa ficou apenas no botão `Selecionar`.
3. `Selecionar` agora é desabilitado para empresa inativa.
4. Empresas inativas ganharam visual “apagado” (opacidade reduzida).
5. Ao abrir o modal:
   - busca é resetada para vazio;
   - filtro é resetado para `Todas` (`all`).

## 3) Onde foi adicionada a ação de ativar/inativar

- Ação implementada no próprio `AdminHeader`, dentro da tabela do modal avançado.
- Foi adicionada coluna de status operacional para Developer:
  - `Inativar` quando ativa;
  - `Ativar` quando inativa.
- A coluna só aparece para `userRole === 'developer'`.

## 4) Como foi persistido `companies.is_active`

- Persistência feita com update direto em `public.companies`:
  - `supabase.from('companies').update({ is_active: nextIsActive }).eq('id', companyId)`.
- Não foi criado novo campo de status.
- Não houve alteração de schema, migration, RPC ou backend.

## 5) Se `userCompanies` trazia ou não empresas inativas

- Não trazia no fluxo Developer atual.
- O `AuthContext` mantém lista ativa para o seletor rápido.

## 6) Se foi necessário buscar empresas inativas por outro caminho

- Sim, apenas para o modal da Fase 2 e apenas para Developer.
- Foi adotada a menor mudança local no `AdminHeader`:
  - ao abrir o modal, Developer faz `select('*')` em `companies` para carregar ativas + inativas.
- Para não-Developer, o modal continua usando a origem já existente (`userCompanies`) sem ampliar escopo.

## 7) Regras de segurança implementadas

1. Só Developer vê/usa ação de ativar/inativar.
2. Empresa inativa não pode ser selecionada operacionalmente.
3. Não é possível inativar a empresa atualmente selecionada.
4. Tentativa de inativar empresa atual exibe aviso:
   - "Não é possível inativar a empresa atualmente selecionada. Troque para outra empresa antes."
5. Antes de ativar/inativar existe confirmação obrigatória (`AlertDialog`).
6. Modal permanece aberto após ativar/inativar, com recarga da lista.

## 8) O que NÃO foi alterado

- `AuthContext`.
- `switchCompany`.
- RLS.
- Login/auth.
- Rotas.
- Telas novas.
- Banco de dados/schema.
- Fluxos de vendas/eventos/pagamentos/integrações.

## 9) Riscos remanescentes

1. Auditoria formal de ativação/inativação ainda não foi persistida em tabela dedicada nesta fase.
2. A listagem completa de empresas para Developer depende das policies atuais de `companies` no ambiente.
3. Como a atualização ocorre no header, recomenda-se monitorar conflitos de sessão quando múltiplos admins alterarem status simultaneamente.

## 10) Próximas fases recomendadas

1. Registrar trilha de auditoria para ativar/inativar (empresa, ator, antes/depois, data/hora, motivo).
2. Definir fluxo de solicitação de reativação para usuário comum (sem autoaprovação).
3. Adicionar motivo obrigatório para inativação/reativação com histórico consultável.
4. Evoluir feedback de impacto operacional após inativação (comunicação contextual no admin).
