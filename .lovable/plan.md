

# Reordenar seções da vitrine — Eventos antes de Patrocinadores

## Mudança

Apenas trocar a ordem dos blocos JSX dentro do `<div className="max-w-7xl...">` (linhas 294-417) em `src/pages/public/PublicCompanyShowcase.tsx`.

### Ordem atual (linhas 296-416)
1. Intro text (296-318)
2. Patrocinadores (320-388)
3. Carrossel destaques (390-395)
4. Todos os eventos (397-416)

### Nova ordem
1. Intro text (sem mudança)
2. **Carrossel destaques** (mover para cima)
3. **Todos os eventos** (mover para cima)
4. **Patrocinadores** (mover para baixo)

### Arquivo
| Arquivo | Mudança |
|---------|---------|
| `src/pages/public/PublicCompanyShowcase.tsx` | Reordenar 3 blocos JSX (linhas 320-416) |

Nenhuma query, state, componente ou lógica de edição é alterada. Apenas corte e cola de blocos.

