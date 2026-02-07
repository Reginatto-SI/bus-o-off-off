

# Plano: Melhoria da Tela de Eventos (/admin/eventos)

## Visao Geral

Transformar a tela de Eventos em uma tela profissional seguindo o padrao piloto /admin/frota, mantendo o layout de cards para listagem mas usando o modal com abas para cadastro/edicao.

---

## Parte 1: Analise Comparativa

### Atual vs Esperado

| Aspecto | Atual | Esperado |
|---------|-------|----------|
| Cabecalho | DIV manual | PageHeader |
| KPIs | Nenhum | 4 StatsCards |
| Filtros | Nenhum | FilterCard |
| Modal | Simples sem abas | Modal com 3 abas |
| Cards de eventos | Basico | Card com resumo operacional + menu |
| Acoes no card | Click no card todo | Menu "..." no canto |
| Estado vazio | Basico | Melhorado visualmente |
| Edicao de evento | Apenas criacao | CRUD completo no modal |

---

## Parte 2: Estrutura do Cabecalho

### PageHeader

```text
+------------------------------------------------------------------+
| Eventos                                          [+ Criar Evento] |
| Gerencie os eventos e viagens                                     |
+------------------------------------------------------------------+
```

Remover botoes Excel/PDF conforme solicitado.

---

## Parte 3: Cards de Indicadores (StatsCards)

| Card | Label | Icone | Variante |
|------|-------|-------|----------|
| 1 | Total de eventos | Calendar | default |
| 2 | Rascunhos | FileEdit | default |
| 3 | A venda | ShoppingBag | success |
| 4 | Encerrados | CheckCircle | destructive |

Calculos baseados nos eventos carregados da empresa.

---

## Parte 4: Card de Filtros

**Filtros Simples:**
- Campo de busca: pesquisar por nome ou cidade
- Select de status: Todos / Rascunho / A Venda / Encerrado
- Botao "Limpar"

Interface de filtros:

```typescript
interface EventFilters {
  search: string;
  status: 'all' | 'rascunho' | 'a_venda' | 'encerrado';
}
```

---

## Parte 5: Listagem em Cards

### Novo Layout dos Cards

Cada card de evento exibira:

```text
+--------------------------------------------------+
| Nome do Evento                            [...]  |
|                                                  |
| [Badge Status]                                   |
|                                                  |
| 📅 dd de mês de yyyy                            |
| 📍 Cidade                                        |
|                                                  |
| 🚌 X viagens  |  👥 Y lugares disponiveis       |
+--------------------------------------------------+
```

O menu "..." no canto substituira o click no card inteiro.

### Acoes do Menu (ActionsDropdown)

| Acao | Icone | Comportamento |
|------|-------|---------------|
| Editar | Pencil | Abre modal de edicao |
| Alterar Status | RefreshCw | Abre submenu de status |
| Ver Detalhes | ExternalLink | Navega para /admin/eventos/{id} |
| Excluir | Trash2 | Confirmacao + exclusao (se permitido) |

**Regras:**
- Evento "encerrado" nao pode ser editado (somente visualizado)
- Excluir disponivel apenas para eventos sem vendas

---

## Parte 6: Modal com Abas (OBRIGATORIO)

### Estrutura do Modal

```text
+------------------------------------------------------------------+
| Novo Evento / Editar Evento                                [X]   |
+------------------------------------------------------------------+
| [Geral] [Viagens] [Publicacao]                                    |
+------------------------------------------------------------------+
| [Conteudo da aba ativa com scroll interno]                       |
+------------------------------------------------------------------+
| [Cancelar]                                           [Salvar]    |
+------------------------------------------------------------------+
```

### Aba 1 - Geral

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| Nome do evento | text | Sim |
| Data | date | Sim |
| Cidade | text | Sim |
| Descricao | textarea | Nao |
| Imagem (placeholder) | - | Nao (estrutura preparada) |

### Aba 2 - Viagens

**Listagem simples das viagens vinculadas:**

```text
+--------------------------------------------------+
| Viagens do Evento                                |
+--------------------------------------------------+
| 🕐 08:00  🚌 Onibus ABC-1234  👥 46 lugares      |
| 🕐 14:00  🚌 Van DEF-5678     👥 15 lugares      |
+--------------------------------------------------+
| [+ Adicionar Viagem]                             |
+--------------------------------------------------+
```

Se clicar em "Adicionar Viagem" dentro do modal de evento, abre um sub-modal simples com:
- Select de veiculo
- Select de motorista
- Horario de saida
- Capacidade (opcional, herda do veiculo)

**Nota:** Nao aprofundar regras complexas - foco estrutural.

### Aba 3 - Publicacao

```text
+--------------------------------------------------+
| Configuracoes de Publicacao                      |
+--------------------------------------------------+
| Status do Evento:                                |
| [Select: Rascunho / A Venda / Encerrado]         |
|                                                  |
| ℹ️  Somente eventos "A Venda" ficam visiveis no  |
|    portal publico para compra de passagens.      |
+--------------------------------------------------+
```

---

## Parte 7: Estados Vazios

### Sem Eventos

```text
+--------------------------------------------------+
|                                                  |
|           [Icone Calendar grande]                |
|                                                  |
|        Nenhum evento cadastrado                  |
|   Crie seu primeiro evento para comecar         |
|       a vender passagens                         |
|                                                  |
|          [+ Criar Evento]                        |
|                                                  |
+--------------------------------------------------+
```

### Filtros sem Resultados

```text
+--------------------------------------------------+
|                                                  |
|           [Icone Calendar grande]                |
|                                                  |
|        Nenhum evento encontrado                  |
|    Ajuste os filtros para encontrar eventos      |
|                                                  |
|          [Limpar filtros]                        |
|                                                  |
+--------------------------------------------------+
```

---

## Parte 8: Logica de Carregamento

### Dados a Buscar

1. **Eventos** - lista principal
2. **Trips (contagem)** - para exibir resumo operacional nos cards
3. **Veiculos ativos** - para modal de viagem
4. **Motoristas ativos** - para modal de viagem

Query otimizada:

```typescript
// Eventos com contagem de viagens
const { data: events } = await supabase
  .from('events')
  .select(`
    *,
    trips:trips(count)
  `)
  .order('date', { ascending: false });
```

---

## Parte 9: Funcionalidades CRUD

### Criar Evento

1. Abrir modal vazio
2. Preencher aba "Geral"
3. Salvar cria evento com status "rascunho"
4. Viagens podem ser adicionadas depois

### Editar Evento

1. Menu "..." > Editar
2. Modal carrega dados do evento
3. Navegacao entre abas
4. Salvar atualiza evento

### Alterar Status

1. Menu "..." > Alterar Status
2. Ou diretamente na aba "Publicacao"
3. Update no campo status

### Excluir Evento

1. Menu "..." > Excluir
2. Verificar se nao tem vendas
3. Confirmacao (AlertDialog)
4. Delete do evento

**Regras de exclusao:**
- Eventos com vendas NAO podem ser excluidos
- Eventos encerrados podem ser excluidos se nao tiverem vendas

---

## Parte 10: Imports Necessarios

```typescript
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Event, Trip, Vehicle, Driver } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  MapPin,
  Plus,
  Loader2,
  Bus,
  Users,
  FileEdit,
  ShoppingBag,
  CheckCircle,
  Pencil,
  Trash2,
  ExternalLink,
  Clock,
  Globe,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
```

---

## Parte 11: Interface de Evento com Viagens

Para exibir resumo operacional nos cards:

```typescript
interface EventWithTrips extends Event {
  trips: { count: number }[];
  totalCapacity?: number;
}
```

---

## Parte 12: Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| `src/pages/admin/Events.tsx` | Refatorar completamente |

---

## Parte 13: Nao Implementar Agora

Conforme solicitado:

- **Exportacao PDF** - nao incluir
- **Exportacao Excel** - nao incluir
- **Mapa de assentos** - nao incluir
- **Pagamentos** - nao incluir
- **KPIs financeiros** - nao incluir

---

## Resultado Esperado

1. Cabecalho padronizado com PageHeader
2. 4 KPIs de eventos (Total, Rascunho, A Venda, Encerrado)
3. Filtros por busca e status
4. Cards de eventos com resumo operacional
5. Menu "..." em cada card com acoes
6. Modal com 3 abas (Geral, Viagens, Publicacao)
7. CRUD completo no modal
8. Estados vazios refinados
9. Navegacao para detalhes mantida

---

## Ordem de Implementacao

1. Adicionar imports necessarios
2. Criar interfaces de filtros e evento com viagens
3. Implementar estados e calculos memoizados
4. Refatorar cabecalho com PageHeader
5. Adicionar StatsCards
6. Adicionar FilterCard
7. Refatorar cards de eventos com menu
8. Implementar modal com 3 abas
9. Implementar CRUD completo
10. Implementar confirmacao de exclusao
11. Refinar estados vazios
12. Testar fluxo completo

