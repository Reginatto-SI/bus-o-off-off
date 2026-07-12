## Objetivo
Padronizar o espaçamento da página `/admin/representante` para seguir o mesmo padrão visual (recuo lateral, respiro superior, largura de conteúdo) já usado nas demais telas administrativas (ex.: `Sellers.tsx`, `BoardingLocations.tsx`).

## Diagnóstico
A tela `src/pages/admin/Representative.tsx` renderiza o conteúdo dentro de `<AdminLayout>` usando apenas `<div className="space-y-6">` (e variantes `space-y-4` nos estados de permissão/empresa). As demais telas admin envolvem o conteúdo em `<div className="page-container">`, classe utilitária que define o padding horizontal, o padding superior abaixo do header e a largura máxima do conteúdo. A ausência desse contêiner é o que faz o conteúdo encostar no menu lateral e no header.

Além disso, o título/subtítulo estão implementados manualmente, enquanto o padrão do admin usa o componente `PageHeader` (`src/components/admin/PageHeader.tsx`) — porém, para manter a alteração mínima e não mexer no badge de status atual, basta trocar o wrapper e preservar o cabeçalho local.

## Alteração
Arquivo único: `src/pages/admin/Representative.tsx`.

Substituir os wrappers dos três retornos que renderizam conteúdo dentro do `AdminLayout`:

1. Bloco "Permissão insuficiente" (linha ~250):
   - de: `<div className="space-y-4">`
   - para: `<div className="page-container space-y-4">`

2. Bloco "Empresa ativa não encontrada" (linha ~269):
   - envolver o `<Alert>` em `<div className="page-container">`

3. Bloco principal (linha ~281):
   - de: `<div className="space-y-6">`
   - para: `<div className="page-container space-y-6">`

O estado de loading permanece como está (spinner centralizado com `min-h-[50vh]`, mesmo padrão de outras telas).

## Fora de escopo
- Não alterar textos, cores, ícones, badge ou qualquer lógica.
- Não trocar o cabeçalho local pelo componente `PageHeader` (mudança visual maior).
- Não alterar links, QR Code, wallet, indicadores, empresas ou comissões.
- Não introduzir novo padrão — apenas reutiliza `page-container` já usado no admin.

## Validação
- Abrir `/admin/representante` em desktop e conferir que o conteúdo respeita o mesmo recuo lateral e respiro superior de `/admin/vendedores`.
- Confirmar que rolagem, cards, tabela, modais de wallet e QR Code continuam funcionando normalmente.
