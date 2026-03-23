# Documento Master – Como criar um evento completo

> **Observação importante:** referências a Stripe neste documento são legadas.
> No cenário atual do produto, o gateway oficial é **Asaas**.

## 1. Objetivo do Processo
Criar um evento operacionalmente completo no Smartbus BR, com dados comerciais, viagens, motoristas, veículos, locais de embarque e regras de venda.

## 2. Quando Utilizar
Utilize este fluxo quando:
- A empresa vai abrir uma nova operação de viagem/evento.
- É necessário estruturar um evento do zero no sistema.
- Houver planejamento de novas datas e rotas com venda de passagens.

## 3. Pré-requisitos
- Empresa cadastrada e configurada.
- Conta de pagamentos oficial da empresa configurada no Asaas.
- Frota cadastrada.
- Motoristas cadastrados.
- Locais de embarque cadastrados.
- Usuário com permissão de gestão de eventos.

## 4. Visão Geral do Processo
A criação acontece na tela **Eventos**, via modal com múltiplas abas. O processo inclui dados gerais do evento, definição de preço/capacidade, criação de viagens (ida/volta), associação de veículo e motorista, configuração de embarques e ajustes comerciais.

## 5. Passo a Passo Completo
1. **Acessar Eventos e iniciar criação**
   - **O que o usuário deve fazer:** entrar em “Eventos” e clicar em “Adicionar Evento”.
   - **O que o sistema faz automaticamente:** abre formulário com status inicial de rascunho.
   - **O que deve ser conferido:** se o evento inicia como não publicado/rascunho.

2. **Preencher dados gerais do evento**
   - **O que o usuário deve fazer:** informar nome, cidade, data, descrição e dados principais.
   - **O que o sistema faz automaticamente:** aplica validações de preenchimento.
   - **O que deve ser conferido:** consistência do nome e data para divulgação.

3. **Definir condições comerciais**
   - **O que o usuário deve fazer:** definir preço unitário, regras de venda e opções de canal (online/vendedor).
   - **O que o sistema faz automaticamente:** prepara parâmetros de monetização do evento.
   - **O que deve ser conferido:** se preço e canais estão coerentes com estratégia comercial.

4. **Cadastrar viagens do evento**
   - **O que o usuário deve fazer:** criar viagem de ida (e volta, quando aplicável), vinculando veículo e motorista.
   - **O que o sistema faz automaticamente:** calcula ocupação por viagem e organiza estrutura de capacidade.
   - **O que deve ser conferido:** se cada viagem está com recursos corretamente atribuídos.

5. **Adicionar locais de embarque por viagem**
   - **O que o usuário deve fazer:** selecionar os pontos de embarque e horários por trajeto.
   - **O que o sistema faz automaticamente:** vincula local/horário à viagem no evento.
   - **O que deve ser conferido:** ordem e horário dos embarques para evitar conflitos operacionais.

6. **Salvar evento completo**
   - **O que o usuário deve fazer:** concluir salvando o formulário.
   - **O que o sistema faz automaticamente:** persiste o evento e mantém status de rascunho até publicação.
   - **O que deve ser conferido:** evento listado com dados completos e editáveis.

## 6. Pontos de Atenção
- Sem conta oficial de pagamentos válida, o sistema pode bloquear continuidade comercial.
- Viagem sem veículo/motorista pode comprometer operação.
- Embarques sem horário definido geram risco operacional.
- Revise permissões de venda (online/vendedor) antes de publicar.

## 7. Boas Práticas
- Iniciar pelo planejamento operacional e depois abrir comercial.
- Conferir capacidade por viagem antes da publicação.
- Padronizar descrições e nomes para facilitar relatórios.
- Utilizar rascunho para revisão interna antes de colocar à venda.

## 8. Impacto no Sistema
A criação correta do evento define toda a base de vendas, capacidade de assentos, organização de equipe e previsibilidade financeira. Evento bem estruturado reduz retrabalho, evita inconsistências e melhora conversão comercial.
