

# Plano: Padronizacao da Tela /admin/locais

## Visao Geral

Ajustar a tela de Locais de Embarque para seguir exatamente o padrao visual, estrutural e comportamental da tela piloto /admin/frota, incluindo alteracoes no banco de dados para suportar status ativo/inativo e remover o campo de horario.

---

## Parte 1: Alteracoes no Banco de Dados

### Situacao Atual da Tabela `boarding_locations`

| Campo | Tipo | Observacao |
|-------|------|------------|
| id | uuid | PK |
| name | text | Nome do local |
| address | text | Endereco |
| time | time | **REMOVER** - horario nao pertence ao cadastro estrutural |
| maps_url | text | Link Google Maps (opcional) |
| company_id | uuid | FK empresa |
| created_at | timestamp | Criacao |
| updated_at | timestamp | Atualizacao |

### Alteracoes Necessarias

1. **Adicionar coluna `status`** com valores 'ativo'/'inativo'
2. **Adicionar coluna `notes`** para observacoes (opcional, padrao do sistema)
3. **Remover coluna `time`** - horario pertence a Viagem/Veiculo

### Migracao SQL

```sql
-- Adicionar coluna status com valor padrao 'ativo'
ALTER TABLE boarding_locations 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

-- Adicionar coluna notes para observacoes
ALTER TABLE boarding_locations 
  ADD COLUMN IF NOT EXISTS notes text;

-- Remover coluna time (horario pertence a viagem, nao ao local)
ALTER TABLE boarding_locations 
  DROP COLUMN IF EXISTS time;

-- Comentarios para documentacao
COMMENT ON COLUMN boarding_locations.status IS 'Status do local: ativo ou inativo';
COMMENT ON COLUMN boarding_locations.notes IS 'Observacoes sobre o local de embarque';
```

---

## Parte 2: Atualizacao do Tipo TypeScript

### Arquivo: `src/types/database.ts`

```typescript
// ANTES
export interface BoardingLocation {
  id: string;
  name: string;
  address: string;
  time: string;           // REMOVER
  maps_url: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

// DEPOIS
export interface BoardingLocation {
  id: string;
  name: string;
  address: string;
  maps_url: string | null;
  notes: string | null;   // NOVO
  status: 'ativo' | 'inativo'; // NOVO
  company_id: string;
  created_at: string;
  updated_at: string;
}
```

---

## Parte 3: Estrutura da Nova Tela

### 3.1 Cabecalho (PageHeader)

Identico ao padrao da frota:

```text
+------------------------------------------------------------------+
| Locais de Embarque                        [+ Adicionar Local]    |
| Gerencie os pontos de embarque                                   |
+------------------------------------------------------------------+
```

### 3.2 Cards de Indicadores (StatsCard)

Adaptados ao contexto de locais:

| Card | Label | Icone | Variante |
|------|-------|-------|----------|
| 1 | Total de locais | MapPin | default |
| 2 | Locais ativos | CheckCircle | success |
| 3 | Locais inativos | XCircle | destructive |

### 3.3 Card de Filtros (FilterCard)

Seguindo o padrao da frota:

**Filtros Simples:**
- Campo de busca: pesquisar por nome ou endereco
- Select de status: Todos / Ativo / Inativo
- Botao "Limpar"

**Filtros Avancados:** (nao necessarios para esta tela simples)

### 3.4 Tabela de Listagem

Colunas:

| Coluna | Conteudo |
|--------|----------|
| Nome | Nome do local (font-medium) |
| Endereco | Endereco + icone de link externo (se maps_url) |
| Status | Badge ativo/inativo |
| Acoes | Menu "..." com ActionsDropdown |

### 3.5 Menu de Acoes (ActionsDropdown)

Acoes disponiveis:

| Acao | Icone | Comportamento |
|------|-------|---------------|
| Editar | Pencil | Abre modal de edicao |
| Ativar/Desativar | Power | Alterna status |

---

## Parte 4: Modal de Cadastro/Edicao

### Campos do Formulario

| Campo | Tipo | Obrigatorio | Placeholder |
|-------|------|-------------|-------------|
| Nome | text | Sim | "Terminal Rodoviario" |
| Endereco | text | Sim | "Av. Brasil, 1000 - Centro" |
| Link Google Maps | url | Nao | "https://maps.google.com/..." |
| Observacoes | textarea | Nao | "Informacoes adicionais..." |

**Remocoes:**
- Campo "Horario Padrao" removido (nao pertence ao cadastro estrutural)

### Botoes

- Cancelar (variant="outline")
- Salvar (variant="default")

---

## Parte 5: Estados Especiais

### Estado Vazio (sem locais)

```text
[Icone MapPin]
Nenhum local cadastrado
Adicione pontos de embarque para seus eventos
[+ Adicionar Local]
```

### Estado Vazio (filtro sem resultados)

```text
[Icone MapPin]
Nenhum local encontrado
Ajuste os filtros para encontrar locais
[Limpar filtros]
```

---

## Parte 6: Imports e Estrutura do Arquivo

### Imports Necessarios

```typescript
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BoardingLocation } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Plus, Loader2, Pencil, Power, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { buildDebugToastMessage, logSupabaseError } from '@/lib/errorDebug';
```

---

## Parte 7: Atualizacao do StatusBadge

O componente StatusBadge precisa reconhecer os status 'ativo' e 'inativo' para locais. Ja esta configurado corretamente pois usa os mesmos valores da frota.

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar status, notes; remover time |
| `src/types/database.ts` | Atualizar interface BoardingLocation |
| `src/pages/admin/BoardingLocations.tsx` | Refatorar completamente |

---

## Diferencial em Relacao a Tela Atual

| Aspecto | Atual | Novo |
|---------|-------|------|
| Cabecalho | DIV manual | PageHeader |
| Indicadores | Nenhum | 3 StatsCards |
| Filtros | Nenhum | FilterCard com busca e status |
| Menu de acoes | Botoes soltos | ActionsDropdown (menu "...") |
| Status | Nenhum | Badge ativo/inativo |
| Campo horario | Presente | Removido |
| Observacoes | Nenhum | Campo textarea |
| Delete | Botao de lixeira | Removido (usar desativar) |

---

## Resultado Esperado

1. Tela visualmente identica ao padrao /admin/frota
2. Mesma UX e organizacao de componentes
3. Local de embarque como cadastro estrutural (sem horario)
4. Status ativo/inativo funcional
5. Filtros e busca operacionais
6. Menu de acoes padronizado
4. Botões Já Funcionais de Gerar Excel e PDF

---

## Ordem de Implementacao

1. Executar migracao SQL (adicionar status/notes, remover time)
2. Atualizar tipo TypeScript BoardingLocation
3. Refatorar componente BoardingLocations.tsx
4. Testar operacoes CRUD completas

