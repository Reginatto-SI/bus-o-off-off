# Documento Master – Como conectar a conta Stripe para começar a vender online

## 1. Objetivo do Processo
Habilitar o recebimento de pagamentos online no Smartbus BR, conectando a conta da empresa ao Stripe para liberar a venda digital de passagens/eventos.

## 2. Quando Utilizar
Utilize este fluxo quando:
- A empresa ainda não está conectada ao Stripe.
- O sistema sinalizar que é necessário concluir onboarding de pagamentos.
- Houver necessidade de retomar o cadastro Stripe incompleto.

## 3. Pré-requisitos
- Conta da empresa já criada e com acesso administrativo.
- Dados empresariais configurados corretamente.
- Permissão para gerenciar pagamentos.
- Internet estável para concluir o onboarding externo.

## 4. Visão Geral do Processo
A conexão pode ser iniciada pela aba de pagamentos da empresa ou por bloqueio operacional ao criar/publicar eventos. O usuário é direcionado ao onboarding Stripe, conclui os dados necessários e retorna ao Smartbus BR para validação de status.

## 5. Passo a Passo Completo
1. **Abrir a área de Pagamentos da empresa**
   - **O que o usuário deve fazer:** acessar “Empresa” e entrar na aba “Pagamentos”.
   - **O que o sistema faz automaticamente:** exibe o status atual da conexão Stripe.
   - **O que deve ser conferido:** se o status aparece como conectado, pendente ou não conectado.

2. **Iniciar conexão com Stripe**
   - **O que o usuário deve fazer:** clicar em “Conectar Stripe” (ou “Retomar Cadastro Stripe”, se já iniciado).
   - **O que o sistema faz automaticamente:** solicita a criação/continuidade do onboarding e abre o fluxo Stripe.
   - **O que deve ser conferido:** se o redirecionamento para o onboarding ocorreu.

3. **Concluir onboarding no Stripe**
   - **O que o usuário deve fazer:** preencher e confirmar as informações solicitadas no Stripe.
   - **O que o sistema faz automaticamente:** registra a conta conectada e as capacidades de pagamento.
   - **O que deve ser conferido:** finalização sem pendências na plataforma de pagamento.

4. **Retornar ao Smartbus BR e validar status**
   - **O que o usuário deve fazer:** voltar ao administrativo e usar “Atualizar status”/“Verificar status”, se necessário.
   - **O que o sistema faz automaticamente:** consulta o estado da conta Stripe e atualiza a tela.
   - **O que deve ser conferido:** se a empresa aparece como apta para vender online.

5. **Confirmar liberação de operação comercial**
   - **O que o usuário deve fazer:** testar o avanço de criação/publicação de evento.
   - **O que o sistema faz automaticamente:** remove bloqueios de monetização quando a conexão está válida.
   - **O que deve ser conferido:** se o fluxo de venda pode seguir normalmente.

## 6. Pontos de Atenção
- Cadastro Stripe incompleto mantém o status pendente.
- Dependendo do caso, pode ser necessário clicar em “Atualizar status” após retorno.
- Sem conexão concluída, o sistema pode bloquear criação/publicação para venda.
- Evite abandonar o onboarding sem finalizar todas as etapas.

## 7. Boas Práticas
- Centralizar a gestão Stripe com responsável financeiro da empresa.
- Finalizar o onboarding em uma única sessão para reduzir pendências.
- Revalidar status antes de anunciar eventos para venda.
- Documentar internamente quem tem permissão para alterar dados de pagamento.

## 8. Impacto no Sistema
A conexão Stripe é determinante para monetização online. Sem ela, a operação comercial fica limitada e há impacto direto em receita, ritmo de vendas e previsibilidade financeira da empresa.
