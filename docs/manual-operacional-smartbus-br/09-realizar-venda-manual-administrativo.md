# Documento Master – Como realizar uma venda manual no administrativo

## 1. Objetivo do Processo
Permitir que a equipe administrativa registre vendas diretamente no sistema, inclusive reservas e bloqueios operacionais de poltrona, sem depender exclusivamente do fluxo público de checkout.

## 2. Quando Utilizar
Utilize este fluxo quando:
- O cliente compra por atendimento interno (telefone, balcão, WhatsApp, suporte).
- Há necessidade de reservar assentos temporariamente.
- É necessário bloquear poltronas por motivo operacional.

## 3. Pré-requisitos
- Acesso à tela **Vendas** no administrativo.
- Evento em condição de venda.
- Viagem e local de embarque configurados.
- Empresa ativa selecionada.
- Permissão para registrar vendas.

## 4. Visão Geral do Processo
Na tela de vendas, o usuário inicia **Nova venda** e segue um fluxo em etapas: escolha de contexto (evento/viagem/embarque), seleção de assentos, preenchimento de passageiros, forma de pagamento e confirmação. O modal também oferece modos de **reserva** e **bloqueio**.

## 5. Passo a Passo Completo
1. **Acessar a tela de Vendas**
   - **O que o usuário deve fazer:** entrar no menu “Vendas”.
   - **O que o sistema faz automaticamente:** exibe painel com indicadores, filtros e histórico de vendas.
   - **O que deve ser conferido:** se o evento de destino está disponível para seleção.

2. **Iniciar Nova Venda**
   - **O que o usuário deve fazer:** clicar no botão “+ Nova venda”.
   - **O que o sistema faz automaticamente:** abre o modal de venda com abas/tipos (manual, reserva, bloqueio).
   - **O que deve ser conferido:** se o tipo de operação selecionado corresponde à necessidade.

3. **Selecionar contexto da operação**
   - **O que o usuário deve fazer:** escolher evento, viagem e local de embarque.
   - **O que o sistema faz automaticamente:** carrega disponibilidade real de assentos para o contexto escolhido.
   - **O que deve ser conferido:** data, trajeto e ponto corretos antes de avançar.

4. **Selecionar assentos no mapa**
   - **O que o usuário deve fazer:** marcar as poltronas desejadas.
   - **O que o sistema faz automaticamente:** bloqueia seleção de assentos indisponíveis e calcula quantidades.
   - **O que deve ser conferido:** assentos escolhidos e total de lugares.

5. **Informar passageiros e pagamento**
   - **O que o usuário deve fazer:** preencher dados dos passageiros (nome/CPF/telefone) e forma de pagamento.
   - **O que o sistema faz automaticamente:** valida dados obrigatórios e calcula valores/taxas conforme configuração.
   - **O que deve ser conferido:** total final e dados do cliente antes de concluir.

6. **Confirmar venda/reserva/bloqueio**
   - **O que o usuário deve fazer:** finalizar a operação no modal.
   - **O que o sistema faz automaticamente:** grava a venda, gera tickets vinculados e atualiza a ocupação.
   - **O que deve ser conferido:** registro visível na listagem de vendas com status correto.

7. **Validar pós-registro**
   - **O que o usuário deve fazer:** abrir detalhes da venda para conferir informações e histórico.
   - **O que o sistema faz automaticamente:** disponibiliza ações como mudança de status, cancelamento e geração de ticket (quando aplicável).
   - **O que deve ser conferido:** integridade do cadastro e rastreabilidade da operação.

## 6. Pontos de Atenção
- Seleção incorreta de viagem/local causa emissão em contexto errado.
- CPF inválido pode impedir conclusão da venda manual.
- Cancelamento libera assentos e não pode ser tratado como ação rotineira.
- Bloqueio de assento deve ser usado com critério para não reduzir oferta sem necessidade.

## 7. Boas Práticas
- Confirmar dados do cliente em voz alta antes de concluir.
- Priorizar registro de observações quando houver exceção comercial.
- Usar reserva com prazo interno de acompanhamento.
- Revisar vendas manuais diariamente para evitar inconsistências.

## 8. Impacto no Sistema
A venda manual impacta diretamente ocupação, receita, controle de assentos e atendimento ao cliente. Quando bem executada, amplia conversão comercial; quando mal registrada, pode gerar overbooking, retrabalho e ruído financeiro.

## 9. Regra oficial de negócio — status da venda/passagem no admin (`/admin/vendas`)
- **Fonte de verdade do status da venda:** `sales.status`.
- **Fonte de verdade da taxa da plataforma:** `sales.platform_fee_status` (`pending`, `paid`, `waived`, `failed`, `not_applicable`).
- Toda passagem criada no fluxo administrativo deve nascer como **`reservado`**.
- A passagem só pode mudar de **`reservado`** para **`pago`** após confirmação de pagamento da taxa da plataforma (`platform_fee_status = paid`) ou quando a taxa não se aplica (`not_applicable`, ex.: fluxo online legado).
- Passagem **`reservado` não é `pago`** e **não é `isento`**.
- `waived`/dispensa da taxa é um estado **explícito e auditável da taxa**, separado do status da venda, e não promove automaticamente a venda para `pago`.
- Ticket virtual/PDF e ações operacionais devem respeitar o `sales.status` e não inferir quitação por ausência de pagamento.

