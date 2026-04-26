# PRD — Padrão de Wizard Operacional (SmartBus BR)

## 1) Objetivo do padrão

Estabelecer o padrão **oficial** de Wizards Operacionais do SmartBus BR para fluxos em etapas, garantindo previsibilidade, clareza e consistência entre telas.

Este documento é **normativo** para produto/UX e não altera regras de negócio, pagamentos, banco, RLS, APIs ou edge functions.

---

## 2) Escopo normativo: regra obrigatória x exemplo

### 2.1 Regras obrigatórias

As regras deste PRD são obrigatórias para novos wizards e refinamentos de wizards existentes.

### 2.2 Exemplos de referência (informativo)

- `/vendas/servicos` = exemplo atual de implementação.
- `/admin/vendas` = alvo natural de adoção futura.

> Os exemplos não substituem as regras. O padrão não é acoplado a uma tela específica.

---

## 3) Contrato de implementação (obrigatório)

## 3.1 Estrutura mínima

Todo wizard operacional deve:
- possuir **no mínimo 2 e no máximo 4 etapas**;
- possuir stepper visível com progresso;
- possuir resumo da operação;
- possuir navegação com ações `Continuar` e `Voltar`.

## 3.2 Comportamento

Todo wizard operacional deve:
- impedir avanço sem validação da etapa atual;
- permitir retorno livre para etapas anteriores;
- impedir navegação direta para etapas futuras sem validação;
- atualizar o resumo em tempo real conforme os dados mudam.

## 3.3 Resumo

O resumo deve:
- ser único (não duplicado em múltiplos blocos no mesmo fluxo);
- refletir o estado atual da operação;
- destacar o valor total como principal informação visual.

## 3.4 Layout por contexto

### Página (desktop)

- usar duas colunas obrigatoriamente:
  - conteúdo principal;
  - resumo lateral fixo/persistente.

### Modal

- usar layout vertical;
- integrar resumo ao fluxo;
- não replicar layout de página dentro de modal.

### Mobile

- usar fluxo vertical;
- adaptar resumo acima ou abaixo do conteúdo;
- manter total e status visíveis sem exigir memória do usuário.

## 3.5 Stepper

O stepper deve:
- exibir progresso textual (ex.: `1/3`);
- indicar etapa atual claramente;
- indicar etapas concluídas;
- usar nomes orientados à ação;
- bloquear navegação para etapas futuras sem validação.

## 3.6 Microcopy

A microcopy deve:
- orientar a ação do usuário de forma operacional;
- evitar termos técnicos;
- incluir mensagem de revisão antes da ação final (ex.: “Revise os dados antes de confirmar a venda.”).

## 3.7 Proibições

É proibido:
- duplicar resumo;
- permitir avanço sem validação;
- criar layout com aparência de formulário cru;
- exigir memorização de informações entre etapas;
- criar variações do padrão sem justificativa explícita aprovada no PRD da tela.

---

## 4) Comportamento do wizard (detalhamento)

## 4.1 Fluxo linear e governança de etapas

- O fluxo deve respeitar ordem lógica de decisão.
- Critérios de validação devem ser aplicados por etapa.
- O usuário pode voltar sem perder entendimento do contexto operacional.

## 4.2 Prontidão para ação final

O wizard deve comunicar estado de prontidão com três estados:
- **Incompleto**: dados mínimos ausentes;
- **Preenchendo**: dados parciais válidos em construção;
- **Pronto para ação**: requisitos da etapa final cumpridos.

## 4.3 Fonte única de verdade visual

- O resumo é a referência principal para revisão operacional.
- Não duplicar os mesmos dados de revisão na etapa final.
- O total deve permanecer legível durante todo o fluxo.

---

## 5) Diretrizes visuais do wizard (detalhamento)

## 5.1 Hierarquia visual

- Etapa atual deve ter destaque imediato.
- Etapas futuras devem permanecer neutras.
- Etapas concluídas devem ter sinal claro de conclusão.
- Valor total deve ser o ponto visual de maior peso no resumo.

## 5.2 Densidade e legibilidade

- Priorizar layout compacto sem comprometer leitura.
- Reduzir ruído visual e blocos redundantes.
- Evitar excesso de rolagem, principalmente em desktop e modal.

## 5.3 Linguagem

- Títulos e botões devem ser acionáveis e operacionais.
- Evitar jargão técnico em mensagens de interface.

---

## 6) Anti-padrões (lista de bloqueio)

- Repetir o mesmo resumo em sidebar e corpo da etapa final.
- Liberar botão `Continuar` sem critérios mínimos preenchidos.
- Tratar stepper apenas como decoração sem refletir validações.
- Exigir que operador memorize total/quantidade para confirmar.
- Reproduzir layout desktop em modal sem adaptação.

---

## 7) Restrições técnicas

- Não alterar regra de negócio para atender padrão visual.
- Não acoplar lógica de domínio ao componente visual do wizard.
- Reutilizar componentes e padrões existentes do sistema.
- Aplicar mudanças pequenas, seguras e reversíveis.

---

## 8) Critérios de aceitação para novas implementações

Uma implementação só é aderente ao padrão quando:
- atende integralmente ao **Contrato de implementação** (Seção 3);
- separa comportamento e visual conforme Seções 4 e 5;
- evita anti-padrões da Seção 6;
- mantém regras de negócio intactas.
