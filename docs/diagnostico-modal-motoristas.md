# Diagnóstico e correção — Modal de Motoristas (/admin/motoristas)

## Diagnóstico
- **Sintoma:** modal de cadastro/edição de motorista aparecia grande demais, com rolagem estranha e footer desalinhado.
- **Onde ocorre:** rota **/admin/motoristas**, modal "Novo/Editar Motorista".
- **Evidência (trecho relevante):** modal estava sem abas e com todo o conteúdo em um único bloco rolável, divergindo do padrão do modal de Frota (Novo Veículo) usado como referência.
- **Causa provável:** ausência do layout com abas e do padrão de estrutura do modal da Frota, resultando em comportamento de altura e rolagem diferente do esperado.

## Correção mínima aplicada
- **Arquivo alterado:** `src/pages/admin/Drivers.tsx`.
- **O que foi ajustado:**
  - Reaplicado o **padrão de modal com abas** existente em `/admin/frota` (Tabs + TabsList + TabsContent), mantendo o mesmo layout de header/body/footer e rolagem interna.
  - Organizados os campos em abas (Identificação, CNH e Observações) para reduzir altura e alinhar com o padrão da Frota.
  - Mantidos componentes e classes do projeto, sem criar novos padrões.
- **Observação:** foram adicionados comentários no código indicando o problema e a referência usada.

## Checklist de validação
- [ ] Modal de Motoristas tem dimensões semelhantes ao modal da Frota (não fica gigante)
- [ ] Scroll (se existir) acontece dentro do conteúdo, não “quebrando” o layout
- [ ] Header e footer do modal ficam estáveis
- [ ] Botões “Cancelar/Salvar” ficam sempre visíveis e alinhados
- [ ] Campos não “esticam” e respeitam grid/colunas como no padrão da Frota
- [ ] CRUD funciona: criar, editar, cancelar sem erros
- [ ] Não houve impacto visual/funcional em outras telas admin
