# Documento Master – Como cadastrar um veículo

## 1. Objetivo do Processo
Registrar veículos da frota para que possam ser vinculados às viagens dos eventos, controlando capacidade, disponibilidade e operação de embarque.

## 2. Quando Utilizar
Utilize este fluxo quando:
- Um novo veículo entra na operação.
- É necessário atualizar dados de veículo já existente.
- A frota precisa ser organizada para planejamento de viagens.

## 3. Pré-requisitos
- Usuário com acesso ao administrativo.
- Empresa ativa selecionada.
- Permissão para cadastro/edição de frota.
- Dados do veículo (placa, tipo, capacidade e informações técnicas).

## 4. Visão Geral do Processo
O cadastro de frota é realizado na tela **Frota**, por meio de tabela de listagem e modal com abas. O usuário preenche identificação, capacidade, dados técnicos e operação, salva o registro e mantém o status ativo/inativo conforme necessidade.

## 5. Passo a Passo Completo
1. **Acessar Frota no administrativo**
   - **O que o usuário deve fazer:** abrir o menu “Frota”.
   - **O que o sistema faz automaticamente:** lista os veículos já cadastrados.
   - **O que deve ser conferido:** status atual da frota e necessidade de novo cadastro.

2. **Abrir o cadastro de novo veículo**
   - **O que o usuário deve fazer:** clicar em “Adicionar Veículo”.
   - **O que o sistema faz automaticamente:** abre modal com formulário por abas.
   - **O que deve ser conferido:** se o modal abriu no modo “Novo Veículo”.

3. **Preencher dados de identificação**
   - **O que o usuário deve fazer:** informar tipo, placa, proprietário e campos básicos.
   - **O que o sistema faz automaticamente:** padroniza informações e valida obrigatórios.
   - **O que deve ser conferido:** placa correta e sem duplicidade operacional.

4. **Preencher capacidade e layout**
   - **O que o usuário deve fazer:** definir capacidade e configuração de assentos conforme operação.
   - **O que o sistema faz automaticamente:** prepara a base para uso no mapa de poltronas.
   - **O que deve ser conferido:** capacidade real do veículo e coerência com operação.

5. **Completar dados técnicos e operacionais**
   - **O que o usuário deve fazer:** preencher chassi, modelo, ano, observações e demais dados disponíveis.
   - **O que o sistema faz automaticamente:** registra os dados para consulta futura.
   - **O que deve ser conferido:** consistência dos campos para manutenção e controle.

6. **Salvar cadastro e validar listagem**
   - **O que o usuário deve fazer:** clicar em “Salvar”.
   - **O que o sistema faz automaticamente:** cria (ou atualiza) o veículo e recarrega a lista.
   - **O que deve ser conferido:** presença do veículo na tabela com status esperado.

7. **Gerenciar status do veículo**
   - **O que o usuário deve fazer:** usar a ação de ativar/desativar quando necessário.
   - **O que o sistema faz automaticamente:** alterna status sem excluir o histórico.
   - **O que deve ser conferido:** veículos inativos não devem ser escalados em novas operações.

## 6. Pontos de Atenção
- Placa e capacidade devem ser conferidas com atenção.
- Veículo inativo pode comprometer planejamento se não for revisado.
- Evite cadastro duplicado do mesmo veículo.

## 7. Boas Práticas
- Padronizar preenchimento de marca/modelo e observações.
- Registrar ajustes operacionais relevantes no cadastro.
- Revisar periodicamente status da frota.

## 8. Impacto no Sistema
O cadastro de veículos afeta diretamente capacidade de venda, alocação de viagens, controle de poltronas e organização operacional. Frota bem configurada reduz erros de embarque e melhora previsibilidade de receita.
