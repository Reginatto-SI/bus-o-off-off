

## Plano: Corrigir bug do dialog de patrocinadores + dropdown com pesquisa

### Problema identificado

O modal do evento inteiro é envolvido por um `<form onSubmit={handleSubmit}>` (linha 2614 de Events.tsx). Quando o botão "Vincular" do dialog de patrocinadores é clicado, ele não possui `type="button"`, então o navegador interpreta como `type="submit"`, disparando o submit do form pai. Isso salva o evento e fecha tudo — é por isso que a tela "pisca" e mostra "evento salvo".

### Correções

#### 1. `src/components/admin/EventSponsorsTab.tsx` — Corrigir botões e melhorar dropdown

**Bug do submit:** Adicionar `type="button"` em todos os botões do componente (Vincular, Adicionar, editar, excluir) para evitar que disparem o form pai.

Botões afetados:
- Botão "Adicionar" (linha 213)
- Botão "Vincular/Salvar" no DialogFooter (linha 346)
- Botões de edição e exclusão nos cards (linhas 270-274)

**Dropdown com pesquisa:** Substituir o `<Select>` do patrocinador por um componente `Command` (cmdk) com campo de busca integrado, usando `Popover` + `Command` para implementar um combobox com filtro por nome. Padrão já existente no projeto (`cmdk` já está instalado).

### Resultado
- O dialog de patrocinadores não vai mais disparar o submit do form do evento
- O dropdown terá pesquisa por nome do patrocinador

