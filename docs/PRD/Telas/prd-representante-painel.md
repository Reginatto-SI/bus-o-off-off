# PRD — Tela `/representante/painel` (Painel do representante)

## 1. Objetivo
Permitir que o representante acompanhe vínculos com empresas, ledger de comissões e prontidão operacional (wallet/link/status), sem recalcular regra financeira no frontend.

## 2. Contexto no sistema
- **Venda:** não cria venda; consome lançamentos derivados das vendas em `representative_commissions`.
- **Pagamento:** exibe status de comissão (pendente/disponível/paga/bloqueada), sem executar pagamento nesta tela.
- **Empresa:** mostra vínculos por `representative_company_links` e indicadores por empresa.
- **Usuário:** exige perfil de representante autenticado; sem perfil redireciona para login/admin.

## 3. Fluxo REAL da tela
1. Valida autenticação/perfil: sem `user` vai para `/login`; sem perfil de representante vai para `/admin/dashboard`.
2. Carrega `representative_company_links` e `representative_commissions` filtrando por `representative_id` do usuário autenticado.
3. Deriva link oficial (`referral_link`) e KPIs financeiros por soma direta do ledger.
4. Aplica filtros locais no ledger por status e período, com paginação client-side.
5. Exibe alertas de prontidão (wallet ausente, sem empresas, status não ativo, comissões bloqueadas).
6. Permite ações de divulgação: copiar link, copiar código, copiar mensagem pronta e abrir modal de QR code.
7. Permite salvar wallet Asaas atualizando o perfil de representante (produção e sandbox simultaneamente).

## 4. Regras de negócio (CRÍTICO)
- Isolamento por representante obrigatório: queries usam apenas `representative_id` do perfil logado.
- KPIs e indicadores usam dados persistidos no ledger; não recalculam split/comissão no cliente.
- Filtro “pendente” inclui `pendente` e `disponivel`.
- Wallet é tratada como requisito operacional para evitar bloqueio de comissões.
- Salvamento de wallet grava o mesmo valor em `asaas_wallet_id_production` e `asaas_wallet_id_sandbox`.

## 5. Integrações envolvidas
- **Supabase tabelas:** `representative_company_links`, `representative_commissions`, `representatives`, `companies`, `sales` (join parcial).
- **Contexto de auth:** `useAuth` para `representativeProfile`, `isRepresentative`, `userRole`.
- **Componentes reutilizados:** `SellerQRCodeModal` para preview/download de QR.

## 6. Estados possíveis
- **Carregando auth/painel:** spinner e bloqueio de conteúdo.
- **Sem autenticação:** redirect para `/login`.
- **Sem perfil representante:** redirect para `/admin/dashboard`.
- **Dados carregados:** KPIs, alertas, links e ledger.
- **Ledger sem resultados com filtro:** alerta orientando ajuste de filtros.
- **Modal de wallet/QR aberto:** edição e ações auxiliares.

## 7. Cenários de falha
| Cenário | Impacto | Ação esperada |
|---|---|---|
| Falha em `representative_company_links` | Sem lista de empresas | Toast de erro + console técnico |
| Falha em `representative_commissions` | Sem ledger | Toast de erro + console técnico |
| Falha ao salvar wallet | Prontidão financeira não atualizada | Toast de erro e mantém valor anterior |
| Falha ao copiar link/código/mensagem | Ação comercial interrompida | Toast de erro de clipboard |
| Link oficial ausente para QR | QR indisponível | Toast de indisponibilidade |

## 8. Riscos operacionais
- Dependência de preenchimento correto da wallet para evitar comissões bloqueadas.
- Se dados do ledger atrasarem no backend, KPIs podem refletir estado defasado.

## 9. Logs e diagnóstico
- Console explícito para falhas de select/update em links, ledger e wallet.
- Verificar consistência entre `representatives.asaas_wallet_id_*` e alertas de prontidão.
- Conferir `representative_commissions.status` para entender bloqueios/pagamentos.

## 10. Dúvidas pendentes
- Fluxo de solicitação/saque de comissão pelo próprio representante: **não identificado no código atual**.
- SLA de atualização do ledger após pagamento de vendas: **não identificado no código atual**.
