# Fase 3 — UX mobile avançado

## 1. Objetivo

Melhorar a experiência operacional em mobile nas telas administrativas priorizadas, com foco em densidade informacional, leitura vertical e clareza de ação, preservando o comportamento atual no desktop e sem alteração de regra de negócio.

## 2. Problemas identificados por tela

### `/admin/locais`
- Linha da tabela exigia leitura fragmentada entre múltiplas colunas para entender um único local.
- Endereço e cidade competiam com o nome no mobile.
- Hierarquia visual ainda estava horizontal demais para uso com uma mão.

### `/admin/indicacoes`
- Empresa indicada, status e recompensa estavam separados em colunas distintas, exigindo varredura lateral.
- Informação financeira principal (recompensa) perdia destaque no mobile.
- Progressão e estado da indicação exigiam maior esforço cognitivo para leitura rápida.

### `/admin/frota` (exploração leve)
- Tipo, placa e proprietário distribuídos em excesso para telas pequenas.
- Leitura do “resumo do veículo” dependia de percorrer várias colunas.

### `/admin/motoristas` (exploração leve)
- Identificação básica (nome, CPF, telefone, categoria) espalhada em colunas separadas no mobile.
- Foco operacional inicial não estava concentrado na primeira leitura da linha.

## 3. Ajustes realizados

### `/admin/locais`
- Reorganização local da tabela para tratar “Local” como primeiro bloco semântico.
- No mobile, endereço e cidade passaram a aparecer próximos ao nome, reduzindo navegação lateral.
- Colunas de endereço/cidade foram progressivamente ocultadas por breakpoint para evitar ruído.

### `/admin/indicacoes`
- Consolidação de status e recompensa no mesmo bloco da empresa indicada em mobile.
- Colunas secundárias (status/recompensa) mantidas no desktop e ocultadas apenas em mobile.
- Reforço da hierarquia na célula principal (empresa → código → status/recompensa).

### `/admin/frota`
- Primeiro bloco da linha passou a trazer tipo + placa (mobile), acelerando identificação.
- Marca/modelo incorporou proprietário como informação secundária no mobile.
- Ocultação progressiva de colunas menos críticas (placa/proprietário) conforme largura.

### `/admin/motoristas`
- Bloco principal com nome + CPF + telefone + categoria no mobile para leitura vertical.
- Colunas específicas foram preservadas em breakpoints maiores.
- Validade de CNH e status permanecem com leitura direta e ação separada.

## 4. Ganhos percebidos

- Menor necessidade de scroll horizontal e varredura lateral.
- Melhor escaneabilidade por linha em contexto de operação real.
- Redução de competição visual entre dados primários e secundários.
- Ação operacional (“...”) mantida estável e com menos ruído ao redor.

## 5. O que foi mantido propositalmente

- Estrutura base de `Table`, `FilterCard`, `Dialog`, `AppLayout`, `Sidebar`, `Header` e estilos globais.
- Lógica de negócio, consultas e estados funcionais das telas.
- Fluxo de ações existentes (editar/ativar/desativar/ver detalhes/copiar).

## 6. Riscos

- Em datasets com conteúdo muito longo (nomes/proprietários), ainda pode haver truncamento natural do layout.
- Densidade otimizada para mobile pode demandar ajustes finos adicionais após validação com usuários de operação.
- Como a intervenção foi local, pode haver oportunidade futura de padronização transversal (fora do escopo desta fase).

## 7. Checklist desktop

- [x] Colunas principais preservadas em breakpoints maiores.
- [x] Ações e status mantidos com o comportamento anterior.
- [x] Sem mudança de fluxo funcional ou de regra de negócio.

## 8. Checklist mobile

- [x] Maior leitura vertical por linha.
- [x] Redução de ruído visual e melhor hierarquia textual.
- [x] Informações-chave mais próximas da primeira área de foco.
- [x] Ações mantidas consistentes e sem sobrecarga visual.

## 9. Próximos passos recomendados

1. Validar em homologação com operadores reais (tarefas de localizar, editar e conferir status).
2. Medir tempo médio de identificação por linha nas telas de maior uso.
3. Caso aprovado, aplicar o mesmo padrão progressivo de densidade em telas administrativas restantes, sem alterar componentes globais.
