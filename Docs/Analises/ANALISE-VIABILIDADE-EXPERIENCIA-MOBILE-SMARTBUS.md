# Análise de Viabilidade da Experiência Mobile do SmartBus

## 1. Resumo executivo

É viável transformar o SmartBus atual em uma boa experiência mobile sem criar outro aplicativo e sem duplicar regras de negócio. A base do projeto já favorece essa estratégia: existe uma única aplicação React com rotas separadas por perfil, componentes compartilhados, layout administrativo com sidebar/header, telas públicas, área do vendedor, área do validador/motorista e painel de representante.

A recomendação é evoluir a aplicação existente com melhorias progressivas de responsividade, preservando o desktop. O maior esforço não está em “diminuir” elementos, mas em reorganizar prioridades: no celular, as telas devem destacar tarefas rápidas, indicadores essenciais, filtros simples, ações principais e fluxos operacionais. Relatórios densos, tabelas muito largas e configurações administrativas avançadas podem continuar preferencialmente no desktop ou receber versões de leitura simplificada.

Conclusão principal: a versão mobile deve ser uma adaptação responsiva da aplicação atual, com comportamento específico em alguns componentes críticos, especialmente navegação, dashboard, tabelas, filtros, gráficos, formulários longos e modais.

## 2. Diagnóstico do estado atual

### 2.1 Estrutura geral dos layouts

O projeto usa uma aplicação única com `BrowserRouter` e rotas para portal público, vendedor, validador/motorista, representante e painel administrativo. Isso confirma que não é necessário criar uma aplicação mobile paralela: a separação por perfil já existe no roteamento atual.

O painel administrativo usa `AdminLayout`, que aplica autenticação, valida perfil, mantém o menu lateral, renderiza o cabeçalho administrativo e reserva espaço superior no mobile para a barra fixa do menu. A sidebar administrativa já possui comportamento diferente para desktop e mobile: no desktop fica fixa à esquerda; no mobile aparece como menu lateral sobreposto acionado por botão.

As páginas públicas usam `PublicLayout`, que já possui navegação mobile via `Sheet` lateral. As áreas de vendedor, motorista/validador e representante aparecem fora do layout administrativo, o que é positivo para jornadas mobile-first.

### 2.2 Menu lateral e navegação

Pontos positivos:

- O menu administrativo já possui modo desktop fixo e modo mobile com overlay.
- O desktop já permite sidebar recolhida.
- O portal público já usa menu mobile lateral.
- As rotas de vendedor e validador/motorista já estão fora do admin, reduzindo dependência de telas densas administrativas.

Pontos de atenção:

- A navegação administrativa mobile ainda é baseada em abrir uma sidebar completa. Isso resolve acesso às rotas, mas não necessariamente prioriza as ações mais usadas no celular.
- Para uso diário no celular, especialmente gestor, vendedor e operação, pode ser necessário destacar atalhos contextuais, sem remover a sidebar existente.
- Um menu inferior pode ser útil apenas para jornadas muito frequentes, como painel, vendas, eventos e embarque. Ele não deve substituir a navegação completa nem criar rotas novas.

### 2.3 Cabeçalhos

O `AdminHeader` é oculto no mobile (`hidden lg:flex`). No celular, o usuário vê a barra superior do `AdminSidebar`, com botão de menu e marca. Isso simplifica o topo, mas também remove informações úteis do header desktop, como seletor de empresa e ações da conta.

Recomendação: manter o header desktop como está e criar uma experiência mobile compacta para ações essenciais, preferencialmente reutilizando os mesmos dados e controles. No mobile, o cabeçalho não deve tentar exibir tudo que existe no desktop.

### 2.4 Containers principais

O `AdminLayout` adiciona `pt-14` no mobile e remove esse espaço no desktop. Isso indica preocupação com barra fixa superior. Porém, as páginas administrativas individualmente ainda variam bastante em espaçamento, grids, tabelas e modais.

Recomendação: padronizar gradualmente containers de páginas administrativas com largura fluida, padding seguro em mobile e proteção contra overflow horizontal.

### 2.5 Cards

Há componentes reutilizáveis como `StatsCard`, que já reduz levemente o ícone no mobile, e `FilterCard`, que organiza filtros em uma coluna no celular e expande para múltiplas colunas em telas maiores.

Pontos positivos:

- Cards de estatísticas já são reutilizáveis.
- Alguns grids usam `grid-cols-1`, `grid-cols-2`, `sm:`, `md:` e `lg:`.
- Há uso de `min-w-0`, `truncate` e `overflow-hidden` em algumas áreas, especialmente no painel de representante.

Pontos de atenção:

- Alguns dashboards e cards administrativos ainda usam muitas métricas simultâneas.
- Em mobile, indicadores devem ser priorizados, agrupados e reduzidos para os mais importantes.
- Cards promocionais ou informativos no dashboard podem competir com ações operacionais.

### 2.6 Tabelas

As tabelas são o maior risco mobile. Existem páginas com tabelas simples parcialmente adaptadas, como locais de embarque, que escondem algumas colunas em breakpoints menores. Porém, muitas páginas e componentes ainda renderizam tabelas completas com várias colunas, incluindo relatórios, auxiliares de embarque, serviços, termos, representante e seletor avançado de empresas.

Tabelas com muitas colunas não devem ser apenas comprimidas. Para mobile, existem três alternativas por prioridade:

1. transformar linhas em cards resumidos com ação de “ver detalhes”;
2. manter tabela com colunas essenciais e ocultar detalhes secundários;
3. permitir rolagem horizontal apenas em relatórios de baixa frequência, deixando claro que é uma visualização técnica.

### 2.7 Formulários

Há formulários e modais já com grids responsivos (`sm:grid-cols-2`, `lg:grid-cols-3`) e botões empilhados no mobile em alguns casos. O modal de nova venda já ocupa `95vw`, usa altura máxima e organiza abas em uma coluna no mobile, o que indica um caminho viável para adaptação sem refatoração ampla.

Pontos de atenção:

- Formulários longos em modais altos podem ser difíceis dentro de WebView.
- Abas dentro de modais precisam de boa área de toque.
- Rodapés com ações devem permanecer visíveis ou fáceis de alcançar.

### 2.8 Modais e drawers

O projeto já possui componentes de `Dialog`, `Sheet` e `Drawer`. Isso é positivo. A recomendação não é trocar todos os modais por drawers, mas definir quando cada padrão deve ser usado:

- `Dialog`: confirmações, formulários curtos, QR Code, edição simples.
- `Drawer` ou `Sheet`: filtros avançados, detalhes de registro, formulários longos em mobile.
- Tela dedicada: fluxos realmente longos, como criação/edição completa de evento ou configuração detalhada.

### 2.9 Filtros

O `FilterCard` já tem boa base mobile: busca em coluna única, selects com largura total e filtros avançados colapsáveis. Essa estrutura deve ser reaproveitada como padrão, evitando filtros soltos por tela.

### 2.10 Gráficos

O dashboard administrativo usa `ResponsiveContainer` do Recharts, com alturas fixas em torno de 220px e layout de gráficos em duas colunas no desktop. Isso ajuda na adaptação, mas não resolve leitura mobile automaticamente.

No celular, gráficos precisam de:

- menos séries simultâneas;
- legenda simplificada;
- altura adequada;
- números principais fora do gráfico;
- opção de alternar período/filtro sem comprimir a visualização.

### 2.11 Regras atuais de responsividade

O projeto usa Tailwind com breakpoints (`sm`, `md`, `lg`) e há um hook `useIsMobile` baseado em largura inferior a 768px. A regra atual é suficiente para decisões simples, mas a experiência mobile completa deve preferir CSS responsivo e usar o hook apenas quando for necessário mudar comportamento, não apenas estilo.

### 2.12 Pontos com largura fixa e risco de rolagem horizontal

Foram encontrados padrões com largura fixa ou mínima que podem provocar cortes em telas pequenas se não estiverem protegidos por containers fluidos:

- selects com `w-[190px]`, `w-[220px]` e similares;
- popovers dependentes da largura do trigger;
- tabelas com muitas colunas;
- diálogos com `max-w-5xl`, `max-w-6xl` ou `max-w-4xl`;
- gráficos com legenda lateral;
- cards com grids fixos de 2 ou 3 colunas em áreas operacionais.

Esses pontos não são necessariamente bugs no desktop; são riscos que precisam de tratamento localizado em mobile.

### 2.13 Componentes que já possuem comportamento adequado no celular

- Sidebar administrativa com overlay mobile.
- Layout público com menu mobile via Sheet.
- `FilterCard` com coluna única e filtros avançados colapsáveis.
- `StatsCard` com ajuste de ícone no mobile.
- Modal de nova venda com largura de 95vw e altura máxima.
- Telas de motorista/validador com forte orientação operacional e vários padrões mobile-first.
- Painel de representante com uso frequente de `min-w-0`, `overflow-hidden`, cards e layout progressivo.

## 3. Problemas encontrados

1. **Densidade excessiva no admin mobile**: dashboards, relatórios e cadastros mostram muita informação simultânea.
2. **Tabelas largas**: várias tabelas administrativas têm muitas colunas e tendem a depender de desktop.
3. **Gráficos pouco legíveis em telas estreitas**: mesmo responsivos, podem ficar pequenos e com legenda apertada.
4. **Ações principais nem sempre são priorizadas**: no mobile, o usuário precisa enxergar rapidamente a ação mais importante da tela.
5. **Cabeçalho mobile reduzido demais para algumas jornadas**: ao ocultar o `AdminHeader`, alguns controles desktop podem ficar menos acessíveis.
6. **Modais grandes dentro da WebView**: formulários longos em dialog podem ter problemas de rolagem, teclado virtual e botões fora da área visível.
7. **Risco de CSS global**: qualquer ajuste amplo em tabelas, cards ou modais pode quebrar desktop ou páginas públicas.
8. **Propagandas com visual mais polido que a experiência real administrativa**: a comunicação visual parece mais limpa e mobile-first que algumas telas atuais do painel.

## 4. Inventário das telas e componentes

### 4.1 Rotas públicas

- `/eventos`: listagem pública de eventos.
- `/eventos/:id`: detalhe público do evento.
- `/eventos/:id/checkout`: compra de passagem.
- `/confirmacao/:id`: confirmação.
- `/consultar-passagens`: consulta de passagens.
- `/cadastro`: cadastro de empresa.
- `/seja-representante`: cadastro de representante.
- `/empresa/:nick` e `/:nick`: vitrine pública/atalho da empresa.
- páginas institucionais e política de intermediação.

Perfil principal: passageiro, empresa em onboarding, representante interessado.

### 4.2 Rotas de vendedor

- `/vendedor/minhas-vendas`.

Perfil principal: vendedor.

A rota já é descrita no código como portal mobile-first fora do admin. Deve ser tratada como prioridade crítica para celular.

### 4.3 Rotas de validador/motorista

- `/validador`.
- `/validador/validar`.
- `/validador/embarque`.
- `/validador/preferencias`.
- redirecionamentos legados de `/motorista`.

Perfil principal: motorista e validador de embarque.

Essas telas já estão separadas do admin e são as mais naturalmente mobile-first.

### 4.4 Rota de representante

- `/representante/painel`.

Perfil principal: representante.

O painel já mostra vários cuidados mobile, mas ainda contém tabelas e áreas densas que precisam ser verificadas em celular real.

### 4.5 Rotas administrativas

- Dashboard.
- Eventos e detalhe do evento.
- Frota.
- Motoristas.
- Auxiliares de embarque.
- Locais de embarque.
- Vendedores.
- Vendas.
- Usuários.
- Empresa.
- Indicações.
- Representante administrativo.
- Minha conta.
- Patrocinadores.
- Sócios/split.
- Parceiros.
- Programas de benefício.
- Serviços e vendas de serviços.
- Relatórios de vendas, eventos, comissão de vendedores, lista de embarque e ativação de empresas.
- Templates de layout.
- Diagnóstico de vendas.

Perfil principal: gestor, operador, gerente, developer e perfis administrativos.

### 4.6 Componentes compartilhados relevantes

- `AdminLayout`.
- `AdminSidebar`.
- `AdminHeader`.
- `PublicLayout`.
- `PageHeader`.
- `StatsCard`.
- `FilterCard`.
- `NewSaleModal`.
- `ActionsDropdown`.
- `ExportExcelModal` e `ExportPDFModal`.
- `SellerQRCodeModal`.
- componentes base de UI: `Dialog`, `Sheet`, `Drawer`, `Table`, `Card`, `Button`, `Select`, `Input`, `Tabs`.

## 5. Classificação de prioridade

### 5.1 Prioridade crítica

Estas telas precisam funcionar muito bem no celular:

- Validador/motorista: home, validação por QR Code, embarque e preferências.
- Vendedor: minhas vendas e criação/acompanhamento de venda quando aplicável.
- Passageiro: eventos públicos, detalhe do evento, checkout, confirmação e consulta de passagens.
- Gestor: dashboard resumido, vendas recentes, eventos ativos e ações rápidas.

Motivo: são jornadas que provavelmente acontecem em campo, durante venda, embarque ou compra pelo próprio passageiro.

### 5.2 Prioridade alta

- Admin dashboard.
- Admin vendas.
- Admin eventos/listagem.
- Detalhe do evento em modo consulta e ações operacionais.
- Locais de embarque.
- Motoristas.
- Vendedores.
- Lista de embarque/manifesto.
- Painel de representante.

Motivo: são telas usadas para acompanhamento e operação, com necessidade real de acesso fora do desktop.

### 5.3 Prioridade média

- Frota.
- Auxiliares de embarque.
- Patrocinadores.
- Parceiros.
- Serviços e vendas de serviços.
- Programas de benefício.
- Minha conta.
- Empresa, quando for apenas consulta ou ajustes simples.

Motivo: são úteis no celular, mas podem aceitar uma experiência mais simples inicialmente.

### 5.4 Baixa prioridade ou preferencialmente desktop

- Templates de layout.
- Relatórios financeiros densos.
- Relatório de ativação de empresas.
- Diagnóstico de vendas.
- Gestão detalhada de usuários e permissões.
- Configurações avançadas de empresa, split/sócios e termos.

Motivo: são telas densas, técnicas, com muitas colunas ou decisões administrativas que tendem a ser mais seguras no desktop. Podem ter leitura resumida no celular, mas edição completa deve continuar preferencialmente no desktop até haver demanda validada.

## 6. Proposta de experiência mobile

### 6.1 Navegação mobile

Manter a sidebar mobile atual como navegação completa. Adicionar, em etapa posterior, atalhos contextuais para as jornadas críticas, sem duplicar rotas:

- Dashboard.
- Eventos.
- Vendas.
- Embarque/validação, quando o perfil permitir.
- Conta/menu.

Um menu inferior pode ser considerado para perfis com uso frequente no celular, mas deve ser pequeno, opcional por breakpoint e alimentado pelas mesmas permissões da sidebar.

### 6.2 Cabeçalho compacto

No admin mobile, o cabeçalho deve conter apenas:

- botão de menu;
- marca/nome da empresa ou contexto ativo;
- ação principal ou menu de conta, se necessário.

O seletor avançado de empresa e controles complexos podem abrir em drawer/sheet no mobile.

### 6.3 Ações primárias

Cada tela mobile deve responder: “qual é a ação mais importante aqui?”. Exemplos:

- Dashboard: ver vendas, criar evento, abrir vitrine.
- Eventos: criar evento, abrir evento ativo, compartilhar link.
- Vendas: nova venda, filtrar status, abrir detalhe.
- Embarque: validar QR Code, buscar passageiro, marcar embarque.
- Passageiro: comprar passagem, consultar passagem, ver QR Code.

Essas ações devem ficar visíveis antes de informações secundárias.

### 6.4 Cards e indicadores

O mobile deve reorganizar cards em uma ou duas colunas conforme densidade:

- celular estreito: uma coluna para cards com texto; duas colunas apenas para indicadores curtos;
- celular largo: duas colunas quando a leitura continuar confortável;
- desktop: manter grids atuais.

Indicadores financeiros e operacionais devem exibir primeiro números essenciais. Rankings e listas detalhadas podem vir abaixo.

### 6.5 Tabelas

Recomendação por tipo:

- Tabelas operacionais: trocar para cards no mobile, com campos essenciais e botão de detalhes.
- Tabelas cadastrais simples: ocultar colunas secundárias e manter ações em dropdown.
- Relatórios densos: manter rolagem horizontal ou orientar uso no desktop, com resumo mobile acima.
- Histórico/auditoria: manter desktop como experiência principal.

### 6.6 Filtros

Usar `FilterCard` como padrão. Em mobile:

- busca sempre visível;
- filtros principais em coluna;
- filtros avançados colapsados;
- opção “limpar filtros” compacta;
- evitar filtros lado a lado quando os labels forem longos.

### 6.7 Gráficos

No mobile:

- mostrar KPIs antes do gráfico;
- reduzir legendas;
- evitar gráfico de pizza com legenda lateral quando houver pouco espaço;
- permitir alternância por período;
- não usar gráfico como única forma de transmitir informação.

### 6.8 Formulários

- Formulários curtos podem continuar em modal.
- Formulários médios devem ter campos em uma coluna no mobile.
- Formulários longos devem usar seções, abas ou telas dedicadas.
- Botões de salvar/cancelar devem ficar no fim da seção ou em rodapé fixo com cuidado para área segura.
- Teclado virtual da WebView deve ser considerado em inputs de busca, CPF, telefone e pagamento.

### 6.9 Modais e drawers

- Confirmar ações: manter dialogs pequenos.
- Filtros e detalhes: preferir sheet/drawer no mobile.
- Edição completa: avaliar tela dedicada quando o modal ficar longo demais.
- Evitar dialogs que ultrapassem a tela sem rolagem interna clara.

### 6.10 Áreas seguras, rolagem e WebView

A aplicação deve considerar:

- `safe-area-inset-top` e `safe-area-inset-bottom` para WebView em aparelhos com notch ou barra de gestos;
- evitar botões importantes colados no rodapé;
- rolagem vertical previsível;
- impedir rolagem horizontal global;
- testar teclado virtual em Android e iOS;
- evitar dependência de hover;
- aumentar área de toque de ações frequentes.

### 6.11 Orientação vertical e horizontal

A orientação vertical deve ser a principal. A horizontal pode ser aceita como melhoria para relatórios e tabelas, mas não deve ser obrigatória para operação, venda, checkout ou embarque.

### 6.12 O que pode apenas reorganizar

- Grids de cards.
- Filtros já baseados em `FilterCard`.
- Cabeçalhos de páginas (`PageHeader`).
- Cards de indicadores.
- Algumas telas públicas e de representante.

### 6.13 O que precisa de apresentação mobile específica

- Tabelas de vendas, eventos, relatórios e cadastros longos.
- Gráficos do dashboard.
- Modais grandes.
- Seletor avançado de empresa.
- Detalhes de venda/passagem.
- Lista de embarque/manifesto.

### 6.14 O que deve continuar igual

- Regras de permissão.
- Rotas existentes.
- Consultas e dados.
- Regras de venda, pagamento, embarque e RLS.
- Desktop administrativo.
- Componentes base quando já funcionarem bem.

### 6.15 O que deve ser simplificado no celular

- Relatórios densos.
- Rankings extensos.
- Tabelas com muitas colunas.
- Cards informativos secundários.
- Configurações avançadas.

### 6.16 O que deve permanecer preferencialmente no desktop

- Templates de layout.
- Diagnósticos técnicos.
- Relatórios completos exportáveis.
- Gestão avançada de permissões.
- Configurações financeiras/split sensíveis.

## 7. Riscos para o desktop

### 7.1 Componentes compartilhados

Alterar `Table`, `Dialog`, `Card`, `Button`, `Select` ou estilos globais pode impactar muitas telas. Preferir classes utilitárias locais, variantes opt-in ou wrappers específicos.

### 7.2 CSS global

Mudanças globais em `index.css` devem ser mínimas. O ideal é criar classes responsivas sob media query mobile ou usar Tailwind por tela/componente.

### 7.3 Breakpoints

O projeto usa `md` e `lg` com frequência. A mudança deve respeitar desktop a partir de `lg`, especialmente porque a sidebar administrativa muda no `lg`.

### 7.4 Layouts reutilizados por perfis

Uma alteração no `AdminLayout` afeta gestor, operador, gerente e developer. Mudanças no público afetam passageiros e captação. Mudanças em componentes UI afetam todos.

### 7.5 Gráficos

Reduzir altura ou remover legenda globalmente pode piorar desktop. Ajustes devem ser condicionais por breakpoint ou locais ao dashboard.

### 7.6 Tabelas

Transformar tabela em card deve ser feito por tela, não no componente `Table` global. Caso contrário, relatórios desktop podem perder densidade útil.

### 7.7 Modais

Transformar todos os dialogs em drawers no mobile pode criar inconsistência e risco. A decisão deve ser por caso de uso.

### 7.8 Formulários longos

Campos, validações e submits não devem mudar. A adaptação deve alterar apenas apresentação, agrupamento e rolagem.

## 8. Comparação com as propagandas

As imagens promocionais anexadas não estão disponíveis diretamente no repositório analisado, então esta comparação considera os ativos promocionais encontrados no projeto e a descrição enviada na tarefa.

### 8.1 Elementos que já existem no produto

- Eventos públicos e vitrine da empresa.
- Checkout e confirmação de passagem.
- Consulta de passagens.
- QR Code e validação de embarque.
- Cadastro de eventos, passageiros, veículos, motoristas, locais de embarque e vendedores.
- Dashboard com indicadores.
- Recursos comerciais como patrocinadores, parceiros, representantes e programas de benefício.
- Materiais visuais em `public/marketing/smartbus-tips`, usados como comunicação dentro do produto.

### 8.2 Elementos que podem ser apresentados de maneira semelhante

- Cards promocionais podem inspirar cards de resumo no dashboard mobile.
- QR Code de embarque pode ser destacado com visual mais limpo.
- Eventos/vitrine podem se aproximar da linguagem das lojas com cards mais objetivos.
- Indicadores podem ganhar hierarquia visual mais próxima das peças promocionais.

### 8.3 Elementos que ainda não correspondem totalmente ao sistema real

- Telas administrativas densas não têm a mesma leveza das peças promocionais.
- Gráficos e tabelas atuais podem parecer comprimidos no celular.
- Algumas ações principais ficam diluídas entre muitos dados.
- Caso as propagandas mostrem telas muito limpas ou fluxos inexistentes, elas devem ser tratadas como direção visual, não como promessa funcional.

### 8.4 Imagens promocionais que deveriam ser atualizadas futuramente

Devem ser revisadas imagens que:

- exibam telas que não existem no produto;
- mostrem funcionalidades com hierarquia diferente da real;
- sugiram uma experiência mobile já finalizada no admin;
- apresentem dashboards, cards ou gráficos com dados/ações que ainda não estão disponíveis.

### 8.5 Melhorias no produto que aproximam a experiência real da comunicação

- Dashboard mobile com cards limpos e indicadores essenciais.
- Fluxo de venda/checkout com foco em ação principal.
- Tela de validação/embarque com QR Code e feedback visual forte.
- Vitrine pública mais clara em celular.
- Menos densidade visual em telas de consulta.

Não se recomenda criar funcionalidades fictícias para combinar com propaganda.

## 9. Estratégia de implantação por etapas

### Etapa 1 — Fundação responsiva e navegação

- **Objetivo:** garantir base mobile consistente sem afetar desktop.
- **Telas envolvidas:** `AdminLayout`, `AdminSidebar`, `AdminHeader`, `PageHeader`, padrões globais de container.
- **Esforço:** médio.
- **Risco:** médio, porque layouts compartilhados afetam muitas telas.
- **Dependências:** decisão sobre menu inferior ou apenas sidebar mobile; definição de breakpoints oficiais.
- **Critérios de conclusão:** sem rolagem horizontal global; menu mobile acessível; header mobile com contexto mínimo; desktop visualmente preservado.

### Etapa 2 — Dashboard do gestor

- **Objetivo:** tornar o dashboard útil no celular, com indicadores e ações principais antes dos detalhes.
- **Telas envolvidas:** `/admin/dashboard`.
- **Esforço:** médio.
- **Risco:** médio, devido a gráficos e cards existentes.
- **Dependências:** etapa 1; definição dos KPIs essenciais.
- **Critérios de conclusão:** cards legíveis; gráficos não comprimidos; ações principais visíveis; rankings e informações secundárias abaixo da dobra.

### Etapa 3 — Operação e embarque

- **Objetivo:** garantir excelência nas jornadas usadas em campo.
- **Telas envolvidas:** `/validador`, `/validador/validar`, `/validador/embarque`, `/admin/relatorios/lista-embarque`, detalhe operacional do evento.
- **Esforço:** médio.
- **Risco:** baixo a médio, pois parte dessas telas já é mobile-first.
- **Dependências:** validação em WebView, câmera/QR Code, permissões de dispositivo.
- **Critérios de conclusão:** validação por QR Code confortável; busca manual utilizável; lista de passageiros legível; feedback claro de sucesso/erro; funcionamento em WebView.

### Etapa 4 — Vendas e passageiros

- **Objetivo:** melhorar jornadas de venda e compra no celular.
- **Telas envolvidas:** `/vendedor/minhas-vendas`, `/admin/vendas`, `NewSaleModal`, `/eventos`, `/eventos/:id`, `/eventos/:id/checkout`, `/confirmacao/:id`, `/consultar-passagens`.
- **Esforço:** alto.
- **Risco:** médio a alto, por envolver venda, pagamento, passageiro e regras sensíveis.
- **Dependências:** não alterar regras de negócio; testar payloads; manter validações; validar teclado em WebView.
- **Critérios de conclusão:** vendedor consegue operar no celular; passageiro consegue comprar sem zoom/rolagem horizontal; venda manual funciona com campos legíveis; ações de pagamento e confirmação continuam iguais.

### Etapa 5 — Cadastros e administração recorrente

- **Objetivo:** adaptar telas administrativas usadas com frequência, sem tentar resolver relatórios densos primeiro.
- **Telas envolvidas:** eventos, locais, motoristas, vendedores, frota, auxiliares, patrocinadores, parceiros, serviços.
- **Esforço:** alto, mas dividido por tela.
- **Risco:** médio.
- **Dependências:** padrões definidos para tabela-card, filtros e modais.
- **Critérios de conclusão:** cada listagem tem visual mobile sem cortes; ações ficam acessíveis; formulários curtos funcionam em uma coluna; desktop permanece igual.

### Etapa 6 — Configurações, relatórios e telas densas

- **Objetivo:** oferecer leitura mobile mínima e manter edição/uso avançado preferencialmente no desktop.
- **Telas envolvidas:** relatórios financeiros, comissões, ativação de empresas, diagnóstico de vendas, templates, termos, usuários, empresa, sócios/split.
- **Esforço:** médio a alto.
- **Risco:** alto em telas financeiras e permissões.
- **Dependências:** decisões de produto sobre o que realmente precisa ser editável no celular.
- **Critérios de conclusão:** telas não quebram em mobile; mostram resumo ou orientação clara; exportações continuam; edição sensível não é simplificada de forma perigosa.

### Etapa 7 — Revisão final da WebView

- **Objetivo:** validar comportamento dentro do aplicativo WebView.
- **Telas envolvidas:** jornadas críticas e altas.
- **Esforço:** médio.
- **Risco:** médio, por depender de ambiente real.
- **Dependências:** acesso ao app/WebView de teste; dispositivos Android/iOS; permissões de câmera.
- **Critérios de conclusão:** sem cortes por safe area; teclado não cobre ações essenciais; câmera funciona; links externos abrem corretamente; rolagem é previsível.

### Etapa 8 — Validação das imagens promocionais

- **Objetivo:** alinhar comunicação das lojas com o produto real.
- **Telas envolvidas:** assets promocionais, screenshots oficiais e páginas de loja.
- **Esforço:** baixo a médio.
- **Risco:** baixo.
- **Dependências:** versão mobile estabilizada; decisão de marketing.
- **Critérios de conclusão:** propagandas não prometem telas inexistentes; prints refletem fluxos reais; visual comunica corretamente o valor do produto.

## 10. Critérios de aceite

### Critérios gerais

- Nenhuma rolagem horizontal global em largura de celular comum.
- Desktop sem regressão visual perceptível.
- Permissões, rotas, dados e regras de negócio inalterados.
- Ações principais visíveis no mobile.
- Inputs e botões com área de toque confortável.
- Modais com rolagem interna clara ou substituídos por drawer/tela dedicada quando necessário.
- Gráficos legíveis ou acompanhados por resumo textual.
- Tabelas críticas adaptadas para cards ou colunas essenciais.
- Funcionamento validado em WebView.

### Critérios por perfil

- **Gestor:** consegue ver resumo de operação e vendas no dashboard mobile.
- **Motorista/validador:** consegue validar QR Code e gerenciar embarque sem depender de desktop.
- **Vendedor:** consegue consultar e conduzir vendas prioritárias pelo celular.
- **Representante:** consegue ver link/código, empresas vinculadas e comissões principais.
- **Passageiro:** consegue encontrar evento, comprar, confirmar e consultar passagem pelo celular.

## 11. Dúvidas que precisam ser respondidas

1. Quais perfis realmente usarão o aplicativo WebView no dia a dia?
2. O gestor precisa criar e editar eventos completos pelo celular ou apenas acompanhar e executar ações rápidas?
3. A venda manual administrativa precisa ser 100% mobile na primeira fase?
4. Quais relatórios são indispensáveis no celular e quais podem continuar desktop-first?
5. O menu inferior é desejado pelo produto ou a sidebar mobile atual é suficiente?
6. Quais são os dispositivos mínimos suportados na WebView?
7. A WebView terá permissões de câmera garantidas para leitura de QR Code?
8. As propagandas anexadas representam promessa comercial atual ou apenas conceito visual?
9. Qual tela deve ser usada como referência visual oficial para a loja após a primeira entrega?
10. Quais métricas do dashboard são essenciais para o gestor no celular?

## 12. Recomendação final

### É viável transformar o sistema atual em uma boa experiência mobile?

Sim. A estrutura atual já permite evolução responsiva: há rotas por perfil, componentes compartilhados, layouts existentes e algumas jornadas mobile-first. O principal trabalho é melhorar apresentação, hierarquia e comportamento em telas estreitas.

### É possível fazer isso sem criar outro aplicativo?

Sim. Essa deve ser a abordagem recomendada. Criar outro aplicativo aumentaria custo, duplicaria regras, elevaria risco de inconsistência e contrariaria a necessidade de preservar as mesmas permissões, dados e rotas.

### Será necessário alterar a arquitetura atual?

Não parece necessário alterar a arquitetura principal. Podem ser necessários ajustes incrementais em componentes e padrões de UI, mas não uma reestruturação ampla do sistema.

### Quais mudanças são obrigatórias?

- Corrigir rolagem horizontal e larguras fixas problemáticas.
- Definir padrão mobile para tabelas críticas.
- Melhorar dashboard mobile.
- Adaptar modais grandes e formulários longos.
- Validar WebView, teclado, safe area e câmera.
- Preservar desktop com mudanças por breakpoint ou por componente opt-in.

### Quais mudanças são desejáveis?

- Atalhos mobile por perfil.
- Menu inferior para jornadas críticas, se validado pelo produto.
- Resumos mobile para relatórios densos.
- Atualização futura das imagens promocionais com prints reais.
- Padronização visual de cards operacionais.

### Qual deve ser a primeira implementação?

A primeira implementação deve ser a fundação responsiva e navegação: revisar containers, header/sidebar mobile, proteção contra overflow horizontal, padrão de espaçamento e comportamento base em WebView. Sem essa base, melhorias por tela tendem a virar correções isoladas e inconsistentes.

### Quais pontos precisam de decisão do responsável pelo produto antes de iniciar?

- Escopo real da primeira versão mobile.
- Perfis prioritários.
- Necessidade ou não de menu inferior.
- Quais telas administrativas podem continuar desktop-first.
- KPIs essenciais do dashboard mobile.
- Requisitos mínimos da WebView.
- Grau de fidelidade esperado em relação às propagandas.

## Fontes internas consultadas

- `src/App.tsx`: rotas e separação por perfil.
- `src/components/layout/AdminLayout.tsx`: layout administrativo, autenticação e espaçamento mobile.
- `src/components/layout/AdminSidebar.tsx`: sidebar desktop/mobile.
- `src/components/layout/AdminHeader.tsx`: cabeçalho desktop e seletor de empresa.
- `src/components/layout/PublicLayout.tsx`: navegação pública responsiva.
- `src/hooks/use-mobile.tsx`: breakpoint mobile atual.
- `src/components/admin/FilterCard.tsx`: padrão de filtros responsivos.
- `src/components/admin/StatsCard.tsx`: card de indicador.
- `src/components/admin/NewSaleModal.tsx`: modal de venda com dimensões responsivas.
- `src/pages/admin/Dashboard.tsx`: dashboard, indicadores e gráficos.
- `src/pages/driver/*`: jornadas de motorista/validador.
- `src/pages/seller/SellerDashboard.tsx`: jornada do vendedor.
- `src/pages/representative/RepresentativeDashboard.tsx`: painel de representante.
- `src/pages/public/*`: jornadas públicas e passageiro.
- `public/marketing/smartbus-tips/*`: ativos promocionais internos existentes.
