# Documento Master – Como publicar um evento e colocar para venda

> **Observação importante:** referências a Stripe neste documento são legadas.
> No cenário atual do produto, o gateway oficial é **Asaas**.

## 1. Objetivo do Processo
Transformar um evento de rascunho em evento comercialmente ativo, liberando a venda de passagens nos canais habilitados.

## 2. Quando Utilizar
Utilize este fluxo quando:
- O evento já está completo e validado internamente.
- A empresa deseja iniciar vendas online e/ou por vendedores.
- É necessário mudar o status comercial do evento para operação ativa.

## 3. Pré-requisitos
- Evento previamente criado.
- Viagens e embarques configurados.
- Preço definido.
- Conta de pagamentos oficial da empresa configurada no Asaas.
- Canais de venda configurados no evento.

## 4. Visão Geral do Processo
Após revisar o cadastro do evento, o usuário altera o status para **À Venda** (publicado). O sistema passa a exibir o evento para comercialização conforme as regras definidas (online, vendedor ou ambos).

## 5. Passo a Passo Completo
1. **Abrir o evento para revisão final**
   - **O que o usuário deve fazer:** acessar a listagem de eventos e abrir o evento desejado.
   - **O que o sistema faz automaticamente:** mostra status, dados comerciais e estrutura operacional.
   - **O que deve ser conferido:** se todos os blocos essenciais estão completos.

2. **Validar configuração comercial**
   - **O que o usuário deve fazer:** confirmar preço, canais de venda e regras de validação de saída (quando aplicável).
   - **O que o sistema faz automaticamente:** mantém as opções comerciais vinculadas ao evento.
   - **O que deve ser conferido:** se o evento está apto para receber pedidos sem ajustes pendentes.

3. **Publicar/colocar à venda**
   - **O que o usuário deve fazer:** executar ação de publicar ou alterar status para “À Venda”.
   - **O que o sistema faz automaticamente:** atualiza o status do evento e libera comercialização.
   - **O que deve ser conferido:** status visível como ativo para venda.

4. **Confirmar disponibilidade nos canais**
   - **O que o usuário deve fazer:** verificar se o evento aparece corretamente no fluxo de vendas.
   - **O que o sistema faz automaticamente:** disponibiliza o evento conforme permissões (online/vendedor).
   - **O que deve ser conferido:** nome, data, preço e embarques corretamente apresentados.

5. **Monitorar primeiros registros de venda**
   - **O que o usuário deve fazer:** acompanhar os primeiros pedidos no painel.
   - **O que o sistema faz automaticamente:** registra vendas, ocupação e status transacionais.
   - **O que deve ser conferido:** consistência entre volume vendido e capacidade do evento.

## 6. Pontos de Atenção
- Publicar com dados incompletos gera ruído comercial e operacional.
- Se a conta oficial de pagamentos estiver pendente, a publicação pode ser bloqueada.
- Evite publicar antes de revisar horários e locais de embarque.

## 7. Boas Práticas
- Fazer checklist interno antes de virar status para “À Venda”.
- Publicar somente após aprovação operacional e financeira.
- Registrar responsáveis pela liberação comercial do evento.

## 8. Impacto no Sistema
A publicação inicia a fase de receita do evento e ativa controle de ocupação em tempo real. Esse fluxo impacta vendas, projeções financeiras, planejamento de embarque e desempenho comercial da operação.
