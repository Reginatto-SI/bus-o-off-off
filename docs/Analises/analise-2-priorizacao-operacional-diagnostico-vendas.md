# Análise 2 — Priorização operacional no diagnóstico de vendas

## Objetivo desta evolução
Elevar a tela `/admin/diagnostico-vendas` para uma leitura de triagem operacional mais rápida, deixando explícito o que é crítico, o que exige atenção e o que está OK, sem alterar backend, APIs ou regras reais do negócio.

## Regras adotadas para prioridade operacional
- `critico`: derivado quando a própria leitura atual da tela já classifica a venda como divergência operacional ou quando existe divergência com gateway.
- `atencao`: derivado quando a leitura atual já posiciona a venda como acompanhamento/manual review sem falha estrutural grave.
- `ok`: derivado para fluxos pagos, cancelados corretamente ou estáveis, sem sinal de divergência prioritária.
- A derivação usa apenas sinais já calculados em `computeOperationalView`, sem lógica paralela de backend.

## O que foi alterado visualmente
- Bloco direito do card agora destaca prioridade operacional e ação principal de triagem.
- Resumo executivo foi adicionado abaixo dos toggles para traduzir contagens em frases curtas e humanas.
- KPIs foram renomeados para linguagem operacional mais direta.
- Grupos da listagem passaram a refletir `Críticos`, `Atenção` e `OK`.
- Cards críticos receberam destaque visual mais perceptível, sem animações ou efeitos agressivos.
- Área principal do card passou a abrir o detalhe da venda ao clique, mantendo o menu `...` intacto.

## O que foi alterado apenas em nomenclatura/apresentação
- Textos centrais de status foram fechados em frases mais humanas.
- `Ver apenas problemas` agora explica que oculta itens estáveis e mostra apenas o que exige acompanhamento.
- O agrupamento visível deixou de expor categorias técnicas internas diretamente ao operador.

## O que não foi alterado
- Backend, consultas, APIs e edge functions.
- Regras reais de negócio, conciliação e integração com gateway.
- Estrutura de dados e filtros existentes.
- Fluxo do accordion técnico e modal de detalhes.

## Riscos ou pontos que exigem validação futura
- Validar com operação real se a linguagem de prioridade está aderente ao vocabulário da equipe.
- Confirmar em uso real se o clique no corpo do card não conflita com hábitos de expansão do accordion.
- Revisar futuramente se algum caso hoje classificado como `ok` deveria subir para `atencao` por necessidade operacional, sempre sem criar lógica paralela ao backend.
