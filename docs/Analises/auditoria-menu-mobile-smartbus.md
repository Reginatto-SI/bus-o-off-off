# Auditoria das telas mobile acessíveis pelo menu lateral do SmartBus

## Escopo e método

Esta auditoria parte exclusivamente da navegação administrativa exibida no menu mobile. A fonte dos grupos, itens, permissões e destinos é `src/components/layout/adminNavigation.ts`; o menu “Mais opções” monta os mesmos grupos, aplica as permissões do usuário e acrescenta dinamicamente **Minha Vitrine Pública**. As rotas foram conferidas em `src/App.tsx` e cada componente de página foi inspecionado quanto a containers, breakpoints, tabelas, cards, formulários, ações, dialogs e fluxos internos.

Também foram incluídas as rotas alcançáveis a partir das páginas do menu: detalhe de evento, etapas do validador e painel exclusivo do representante. Criação, edição, detalhes de venda, exportação e cadastros que acontecem em modal na mesma rota foram avaliados junto à página de origem e não foram contados novamente como páginas.

> **Limite da análise:** o diagnóstico é estático, baseado no código da versão auditada. Não houve autenticação com perfis/dados reais nem validação visual em aparelhos. “Adaptada” significa que a implementação contém tratamento mobile explícito e coerente; não garante ausência de defeitos dependentes de dados, navegador, teclado virtual ou permissões.

## Estrutura compartilhada observada

- No mobile, as telas administrativas usam cabeçalho compacto e navegação inferior, com o menu completo aberto em um `Sheet` inferior limitado a `82vh`, largura máxima de `md` e rolagem vertical interna.
- O menu deriva seus itens da mesma configuração da sidebar desktop, filtra por perfil (`gerente`, `developer` etc.) e pode, portanto, apresentar conjuntos diferentes. Esta auditoria considera a união de todos os itens possíveis, distinguindo os itens técnicos marcados intencionalmente como exclusivos do desktop.
- Muitas telas modernizadas separam explicitamente a apresentação: cards/listas em `lg:hidden` e tabela desktop em `hidden lg:block`. Esse é o tratamento mais seguro encontrado.
- O componente compartilhado `Table` impede corte da página ao envolver toda tabela em `overflow-x-auto`, mas impõe `min-w-[640px]` abaixo de `md`. Assim, páginas que apenas usam `Table`, sem uma visualização alternativa, continuam **parcialmente adaptadas**: são operáveis por rolagem horizontal, mas não entregam uma experiência realmente mobile.
- Os modais administrativos mais recentes usam largura `calc(100vw - 1rem)`, altura em `dvh`, conteúdo interno rolável e rodapé separado. Modais que só definem `max-w-*` dependem do comportamento genérico do componente `Dialog` e merecem validação em dispositivo.

## Inventário e diagnóstico

| Seção do menu | Página | Rota | Situação mobile | Problema identificado | Prioridade |
|---|---|---|---|---|---|
| Painel | Painel | `/admin/dashboard` | Adaptada para mobile | Implementação mobile própria, container `max-w-md`, cards e atalhos reorganizados, chrome mobile e espaço para a barra inferior. Nenhum ajuste aparente pelo código. | Sem ajuste aparente |
| Eventos | Eventos | `/admin/eventos` | Adaptada para mobile | Listagem mobile própria em cards, container estreito, ações e formulários extensos contidos em modal com altura/largura de viewport. Criação e edição foram contempladas na análise. | Sem ajuste aparente |
| Eventos | Detalhe do evento (fluxo interno) | `/admin/eventos/:id` | Adaptada para mobile | Tela mobile dedicada com cards, quebra de texto, ações compactas e retorno; contempla locais, serviços e demais edições internas. | Sem ajuste aparente |
| Eventos | Vendas | `/admin/vendas` | Adaptada para mobile | Lista e filtros mobile próprios; detalhes, nova venda, ações e edição ficam em dialogs dimensionados pela viewport. Há modal a `100vw`, intencionalmente em tela cheia, sem evidência de corte. | Sem ajuste aparente |
| Eventos | Venda de Serviços | `/vendas/servicos` | Adaptada para mobile | Formulário fluido, `min-w-0`, abas compactas e grids que só ganham colunas em breakpoints maiores. Fluxo complementar com Serviços/Evento preserva retorno. | Sem ajuste aparente |
| Eventos | Validador de Passagens | `/validador` | Adaptada para mobile | Portal operacional fora do admin, limitado a `max-w-md`, com ações grandes e organização em cards. | Sem ajuste aparente |
| Eventos | Validar passagem (fluxo interno) | `/validador/validar` | Adaptada para mobile | Jornada de câmera/consulta orientada a celular, largura limitada e ações empilhadas. A confirmação de permissões de câmera exige teste real. | Sem ajuste aparente |
| Eventos | Embarque (fluxo interno) | `/validador/embarque` | Adaptada para mobile | Lista e controles em `max-w-md`, textos com `min-w-0` e dialog limitado à largura útil da viewport. | Sem ajuste aparente |
| Eventos | Preferências do validador (fluxo interno) | `/validador/preferencias` | Adaptada para mobile | Formulário curto em coluna e `max-w-md`; nenhum elemento largo aparente. | Sem ajuste aparente |
| Eventos | Minha Vitrine Pública | `/:nick` (atalho; destino final `/empresa/:nick`) | Adaptada para mobile | Página pública usa paddings progressivos, ações empilhadas e conteúdo que cresce a partir de uma coluna. Se o nick não existe, o item redireciona para Empresa, comportamento e não falha responsiva. | Sem ajuste aparente |
| Cadastros | Frota (Veículos) | `/admin/frota` | Adaptada para mobile | Cards substituem tabela, métricas se reorganizam e formulário de criação/edição usa dialog em `92dvh` com rolagem interna. | Sem ajuste aparente |
| Cadastros | Motoristas | `/admin/motoristas` | Adaptada para mobile | Cards e ações específicos para mobile; cadastro/edição e QR usam dialogs limitados à viewport. | Sem ajuste aparente |
| Cadastros | Auxiliares de Embarque | `/admin/auxiliares-embarque` | Adaptada para mobile | Lista em cards abaixo de `lg`, grid fluido e formulário em dialog responsivo. | Sem ajuste aparente |
| Cadastros | Locais de Embarque | `/admin/locais` | Adaptada para mobile | Cards mobile substituem tabela e formulário curto usa largura/altura de viewport. | Sem ajuste aparente |
| Cadastros | Vendedores | `/admin/vendedores` | Adaptada para mobile | Lista em cards, detalhes em grid progressivo e modal de cadastro/edição dimensionado para celular. | Sem ajuste aparente |
| Cadastros | Patrocinadores | `/admin/patrocinadores` | Adaptada para mobile | Cards substituem tabela desktop; formulário tem abas roláveis, conteúdo interno rolável, rodapé empilhado e preview de imagem contido. | Sem ajuste aparente |
| Cadastros | Parceiros | `/admin/parceiros` | Adaptada para mobile | Cards substituem tabela; formulário e previews usam limites de viewport e abas horizontais roláveis. | Sem ajuste aparente |
| Cadastros | Serviços | `/admin/servicos` | Adaptada para mobile | Cards próprios, botões reorganizados a partir de 360 px e dialog com `100dvh`/largura útil. Criação, edição e vínculo ao evento foram analisados. | Sem ajuste aparente |
| Cadastros | Sócios | `/admin/socios` | Restrita ao desktop | Tela técnica intencionalmente oculta de toda navegação mobile e permitida somente para developer no desktop; acesso direto no mobile redireciona ao painel. | Sem ajuste aparente |
| Cadastros | Templates de Layout | `/admin/templates-layout` | Restrita ao desktop | Tela técnica intencionalmente oculta de toda navegação mobile e permitida somente para developer no desktop; acesso direto no mobile redireciona ao painel. | Sem ajuste aparente |
| Relatórios | Relatório de Vendas | `/admin/relatorios/vendas` | Adaptada para mobile | Resumo/listagem mobile próprios, filtros e paginação empilhados; versão desktop fica oculta. Modais de exportação foram incluídos no fluxo. | Sem ajuste aparente |
| Relatórios | Relatório por Evento | `/admin/relatorios/eventos` | Restrita ao desktop | Tela técnica intencionalmente oculta de toda navegação mobile e permitida somente para developer no desktop; acesso direto no mobile redireciona ao painel. | Sem ajuste aparente |
| Relatórios | Lista de Embarque | `/admin/relatorios/lista-embarque` | Adaptada para mobile | Implementação mobile dedicada com cards e filtros; desktop é separado. O dialog de detalhe depende do padrão base, mas o conteúdo interno usa grid de uma coluna no celular. | Sem ajuste aparente |
| Relatórios | Empresas e Ativação | `/admin/relatorios/empresas-ativacao` | Restrita ao desktop | Tela técnica intencionalmente oculta de toda navegação mobile e permitida somente para developer no desktop; acesso direto no mobile redireciona ao painel. | Sem ajuste aparente |
| Relatórios | Comissão de Vendedores | `/admin/relatorios/comissao-vendedores` | Adaptada para mobile | Cards substituem tabela, KPIs e paginação reorganizam e ações permanecem visíveis. | Sem ajuste aparente |
| Administração | Usuários | `/admin/usuarios` | Adaptada para mobile | Cards mobile, ações compactas e formulário em modal `92dvh`; abas são roláveis e labels truncam sem alargar a tela. | Sem ajuste aparente |
| Administração | Empresa | `/admin/empresa` | Adaptada para mobile | Container progressivo, resumo próprio, seções fluidas e confirmações limitadas à viewport. Configurações e formulários longos permanecem em coluna no celular. | Sem ajuste aparente |
| Administração | Representante Comercial | `/admin/representante` | Adaptada para mobile | Resumo e seções próprios para mobile; modal de convite/configuração usa `92dvh`, largura útil e rolagem interna. | Sem ajuste aparente |
| Administração | Painel do representante (fluxo interno) | `/representante/painel` | Adaptada para mobile | Portal separado usa cards, `min-w-0`, containers fluidos e layouts progressivos. Não foi encontrada largura fixa incompatível na estrutura principal. | Sem ajuste aparente |
| Sistema | Diagnóstico de Vendas | `/admin/diagnostico-vendas` | Restrita ao desktop | Tela técnica intencionalmente oculta de toda navegação mobile e permitida somente para developer no desktop; acesso direto no mobile redireciona ao painel. | Sem ajuste aparente |
| Conta | Minha Conta | `/admin/minha-conta` | Adaptada para mobile | Resumo mobile próprio, formulários em coluna e dialog de imagem limitado a `calc(100vw - 1rem)` e `90dvh`. | Sem ajuste aparente |

## Totais

Contagem feita por **rota/página endereçável**. Modais embutidos foram auditados, mas não duplicados.

| Indicador | Quantidade |
|---|---:|
| Total de páginas/rotas revisadas | **31** |
| Disponíveis e adaptadas para mobile | **26** |
| Restritas intencionalmente a developer no desktop | **5** |
| Parcialmente adaptadas entre as disponíveis no mobile | **0** |
| Não adaptadas entre as disponíveis no mobile | **0** |
| Não foi possível confirmar apenas pelo código | **0** |

Além das 31 páginas, foram verificados nos respectivos componentes os fluxos embutidos de criação/edição de eventos, vendas e cadastros; detalhes e correções de venda; associação de serviços; previews; confirmações; QR; e exportações de relatórios.

## Ordem recomendada para ajustes

1. **Validar a restrição intencional das cinco telas técnicas.** Conferir menu completo, drawer legado, acesso direto e redimensionamento com perfis developer e comuns. Essas telas não integram mais o backlog de responsividade mobile.
2. **Validar as telas disponíveis no mobile em aparelhos reais.** Testar pelo menos 320, 360, 390 e 430 px, com dados longos, teclado aberto, perfis gerente/developer e câmera; priorizar Eventos, Vendas, Validador e formulários extensos. Essa etapa pode revelar problemas que a análise estática não confirma.

## Conclusão objetiva

O menu mobile oferece 26 páginas com implementação responsiva explícita. Templates de Layout, Relatório por Evento, Empresas e Ativação, Diagnóstico de Vendas e Sócios foram deliberadamente removidos do escopo mobile: não aparecem nas navegações móveis e aceitam acesso somente de developer em viewport desktop. Essa decisão é uma regra de acesso, não uma pendência de responsividade. Câmera, teclado, conteúdo real e permissões das páginas que permanecem disponíveis ainda precisam de ensaio em dispositivo.
