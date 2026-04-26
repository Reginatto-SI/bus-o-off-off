# PRD — Tela Validador (SmartBus BR)

## 1. Objetivo
Definir a evolução conceitual da tela operacional `/motorista` para a nova tela **Validador** (rota alvo `/validador`), tornando-a a central única de leitura de QR Code e validação de direitos adquiridos pelo cliente.

A tela **Validador** deve cobrir, sem dependência de implementação nesta etapa:
- validação de passagem de ônibus (embarque e contextos operacionais já suportados);
- validação de serviços/passeios comprados;
- consumo parcial (unitário) de serviços;
- apoio operacional no embarque e no destino.

---

## 2. Contexto
Hoje o SmartBus BR possui portal operacional com foco em motorista, incluindo:
- entrada em `/motorista`;
- fluxo de scanner em `/motorista/validar`;
- apoio operacional em `/motorista/embarque`.

No estado atual, o fluxo de QR valida principalmente passagens via RPC `validate_ticket_scan`, com bloqueios por status de venda, empresa e duplicidade operacional.

Com o módulo **Passeios & Serviços**, a operação de campo deixa de ser exclusiva de motorista. O mesmo ato de “validar” passa a abranger também consumo de serviços vendidos durante a excursão ou no destino. Portanto, a nomenclatura e o escopo operacional precisam evoluir para **Validador**, sem restringir a experiência a um papel específico de usuário.

---

## 3. Nome da tela e rota
### 3.1 Nome oficial
**Validador**

### 3.2 Rota alvo
`/validador`

### 3.3 Recomendação de transição da rota legada `/motorista`
**Recomendação (documental, sem implementação nesta etapa):**
1. **Fase 1 (compatibilidade):** manter `/motorista` como alias funcional para a experiência Validador.
2. **Fase 2 (migração assistida):** introduzir redirecionamento explícito de `/motorista` para `/validador` preservando links antigos.
3. **Fase 3 (descontinuação controlada):** remover alias apenas após validação de uso real e comunicação operacional.

Justificativa: o projeto já utiliza estratégia de compatibilidade com rotas legadas em outros contextos; adotar o mesmo padrão reduz ruptura operacional.

---

## 4. Usuários/perfis autorizados
Perfis com acesso recomendado à tela **Validador**:
- **motorista**;
- **auxiliar de embarque** (quando representado operacionalmente);
- **operador**;
- **gerente**;
- **developer** (perfil técnico com acesso ampliado).

### 4.1 Avaliação sobre perfil vendedor
**Recomendação:** não habilitar acesso amplo para `vendedor` nesta fase.

Justificativa:
- o fluxo atual de validação de passagem está ligado a operação de campo (embarque/desembarque/reembarque), não ao fluxo comercial de venda;
- ampliar para vendedor sem regra formal pode gerar risco operacional (validação indevida em contexto não operacional).

**Decisão pendente:** habilitar vendedor apenas em cenário específico (ex.: operação pequena sem equipe dedicada), condicionado a política explícita por empresa (`company`) e trilha de auditoria.

---

## 5. Fluxo de validação de passagem
Fluxo funcional esperado (estado atual + padronização para Validador):
1. usuário abre o Validador e escaneia o QR Code;
2. sistema identifica a passagem/venda vinculada ao token;
3. valida status e permissões operacionais (empresa, situação da venda, ação permitida);
4. quando permitido, confirma a validação da etapa operacional;
5. impede validação duplicada ou inválida conforme estado já consumido;
6. registra evento de validação para rastreabilidade.

### 5.1 Regras mínimas de bloqueio (passagem)
- QR inexistente/inválido;
- venda não paga, cancelada ou bloqueada para uso;
- passagem já utilizada na etapa atual;
- usuário sem escopo da empresa;
- ação operacional inconsistente (ex.: tentativa fora da sequência permitida).

---

## 6. Fluxo de validação de serviços
Fluxo funcional esperado (novo):
1. usuário escaneia o **QR de serviços** (venda/comprovante de serviços);
2. sistema identifica a venda de serviços vinculada ao QR;
3. exibe lista de serviços comprados elegíveis para consumo;
4. para cada serviço, mostra:
   - nome do serviço;
   - quantidade comprada;
   - quantidade já utilizada;
   - quantidade restante;
5. operador confirma consumo de **1 unidade por vez**;
6. sistema impede consumo quando saldo restante = 0;
7. cada consumo gera registro de histórico/log.

### 6.1 Regras operacionais de consumo
- consumo sempre unitário por ação de validação;
- atualização de saldo deve ser atômica no backend (evitar dupla baixa em concorrência);
- serviços com controle `sem_validacao` não devem aparecer como item “consumível” no Validador.

---

## 7. QR Code
### 7.1 Regra oficial
- QR de passagem valida passagem (direito de embarque);
- QR de serviços valida venda/comprovante de serviços (direito de consumo);
- não misturar QR da passagem com QR de serviços;
- QR de serviços é único por venda/comprovante e pode agrupar múltiplos serviços da mesma venda;
- ao escanear QR de serviços, o Validador deve abrir o contexto da venda e listar os serviços comprados;
- cada serviço listado deve exibir quantidade comprada, utilizada e restante;
- operador escolhe qual serviço consumir;
- consumo é unitário por ação;
- se todos os serviços estiverem sem saldo, bloquear uso e exibir mensagem clara.

### 7.2 Exemplo normativo
Venda de serviços com:
- 1 passeio de buggy;
- 1 passeio de lancha.

Resultado esperado:
- cliente recebe um único QR de serviços;
- ao escanear no Validador, exibir os dois serviços com saldo individual;
- operador decide qual serviço consumir em cada validação.

---

## 8. Consumo parcial
A tela Validador deve suportar consumo parcial acumulado por item de serviço.

Exemplo normativo:
- Compra: 2 unidades de mergulho.
- 1ª validação: consome 1, resta 1.
- 2ª validação: consome 1, resta 0.
- 3ª tentativa: bloqueada por falta de saldo.

Resultado esperado:
- histórico deve demonstrar claramente cada baixa unitária;
- estado “parcialmente utilizado” deve ser visível enquanto houver saldo > 0 e consumo > 0.

---

## 9. Estados e mensagens
Estados/mensagens funcionais recomendadas para a experiência Validador:

1. **Válido**
   - “Validação concluída com sucesso.”

2. **Já utilizado**
   - “Este item já foi validado anteriormente.”

3. **Parcialmente utilizado**
   - “Uso parcial registrado. Ainda há saldo disponível.”

4. **Sem saldo restante**
   - “Saldo esgotado para este serviço.”

5. **Venda pendente**
   - “Venda pendente de confirmação. Validação indisponível.”

6. **Venda cancelada**
   - “Venda cancelada. Validação bloqueada.”

7. **Venda bloqueada**
   - “Venda bloqueada para validação operacional.”

8. **Serviço não encontrado**
   - “Nenhum serviço válido encontrado para este QR.”

9. **QR inválido**
   - “QR Code inválido ou não reconhecido.”

10. **Sem permissão**
   - “Você não tem permissão para validar este item.”

Observação: manter mapeamento técnico entre códigos de razão do backend e mensagens curtas de campo, priorizando leitura rápida.

---

## 10. UX esperada
A tela Validador deve ser orientada à operação de campo (tempo curto, ambiente dinâmico, uso mobile):
- ônibus;
- fila de embarque;
- praia;
- destino turístico;
- contexto de pressão operacional.

### 10.1 Princípios de UX
- botões grandes e acionáveis com uma mão;
- status visual forte (sucesso, bloqueio, alerta);
- pouco texto e pouca digitação;
- priorização de informação essencial (nome, item, saldo, resultado);
- repetição rápida de leitura sem navegação complexa.

---

## 11. Logs e rastreabilidade
Toda validação (passagem ou serviço) deve gerar rastreabilidade auditável.

### 11.1 Diretriz para passagem
Manter trilha operacional já existente (ex.: validações com resultado, motivo e contexto de execução).

### 11.2 Diretriz para serviços (fase atual)
Enquanto não houver estrutura definitiva de consumo por item, considerar `sale_logs` como trilha provisória de auditoria de consumo/validação de serviço.

**Importante:** este PRD apenas define regra de produto. **Não implementar** neste momento mudanças de persistência, schema ou rotina de escrita.

---

## 12. Relação com o módulo Passeios & Serviços
A tela **Validador** é complementar ao módulo de serviços e responsável por efetivar o uso operacional daquilo que foi vendido.

Deve cobrir validação/consumo de serviços em dois contextos:
- venda avulsa de serviço;
- venda conjunta com passagem (etapa futura de evolução comercial).

Assim, o módulo de serviços cuida de catálogo/venda/capacidade, e o Validador cuida da confirmação de uso em campo.

---

## 13. Fora de escopo
Não faz parte desta etapa:
- implementação da nova tela;
- alteração técnica de rota em produção;
- criação de QR individual por item de serviço;
- checkout público com serviços;
- relatórios analíticos;
- split e repasse financeiro;
- gestão de guias;
- gestão de horários de passeios;
- gestão de fornecedores;
- modelagem de veículos específicos para serviços.

Também fora de escopo:
- criação de entidade “agencia”; neste contexto, empresa = `company` existente.

---

## 14. Decisões pendentes
1. **Estratégia final de migração da rota** (`/motorista` → `/validador`) com prazo e janela de descontinuação.
2. **Política final para perfil vendedor** (sem acesso, acesso condicionado, ou acesso por configuração da empresa).
3. **Modelo definitivo de persistência de consumo de serviço** (manter temporário em `sale_logs` ou evoluir para estrutura dedicada).
4. **Taxonomia final de reason codes** para serviços, alinhada ao padrão já existente de validação de passagem.

---

## 15. Checklist de aprovação
- [ ] O documento define claramente que **Validador** é evolução conceitual de `/motorista`.
- [ ] O nome da tela e rota alvo (`/validador`) estão explícitos.
- [ ] Há recomendação de transição para `/motorista` sem implementação imediata.
- [ ] Perfis autorizados foram mapeados, incluindo análise justificada de vendedor.
- [ ] Fluxo de validação de passagem foi documentado ponta a ponta.
- [ ] Fluxo de validação de serviços (com lista e consumo unitário) foi documentado.
- [ ] Regra oficial de QR está clara (QR de passagem separado do QR de serviços, sem mistura de contextos).
- [ ] Regra de consumo parcial está explícita com exemplo prático.
- [ ] Estados e mensagens operacionais foram definidos.
- [ ] Diretrizes de UX de campo foram definidas.
- [ ] Rastreabilidade/logs foram definidos sem exigir implementação nesta etapa.
- [ ] Relação com módulo Passeios & Serviços está descrita.
- [ ] Fora de escopo está explícito e aderente à etapa.
- [ ] Dúvidas remanescentes foram registradas em decisões pendentes.

---

## Observações finais de aderência
- Este PRD não cria código, não altera arquitetura e não introduz novas entidades.
- Empresa/agência permanece representada por `company`.
- Eventuais lacunas técnicas foram registradas como decisão pendente para etapa futura.
