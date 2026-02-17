
# Migrar Cidades para Base de Dados Global

## Resumo

Criar uma tabela global `cities` no banco de dados, migrar todas as cidades do arquivo estatico para ela via seed, e atualizar o componente `CityAutocomplete` para buscar do banco em vez do arquivo local. Usuarios autenticados (admin/operador) poderao cadastrar cidades novas diretamente pelo autocomplete quando nao encontrarem a desejada.

---

## Etapas de Implementacao

### 1. Criar tabela `cities` (migration)

```text
Tabela: public.cities (global, sem company_id)

Colunas:
- id (uuid, PK, default gen_random_uuid())
- name (text, NOT NULL) — nome da cidade
- state (char(2), NOT NULL) — UF
- normalized_name (text, NOT NULL) — nome sem acentos, lowercase, para busca
- is_active (boolean, default true)
- source (text, default 'seed') — origem: 'seed', 'admin', 'user'
- created_by (uuid, nullable) — quem criou
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

Indice unico: (normalized_name, state) — evita duplicatas
Indice de busca: GIN trigram em normalized_name (para buscas parciais rapidas)
```

**Politicas RLS:**
- SELECT: qualquer pessoa (incluindo anon) pode ler cidades ativas
- INSERT: apenas usuarios autenticados com role admin (gerente/operador/developer)
- UPDATE/DELETE: apenas developer

### 2. Seed — popular com cidades do arquivo atual (migration)

Inserir todas as ~430 cidades do arquivo `brazilian-cities.ts` como registros com `source = 'seed'`. A funcao de normalizacao (remover acentos) sera criada como funcao SQL auxiliar para gerar o `normalized_name` automaticamente.

### 3. Atualizar componente `CityAutocomplete`

**Mudancas:**
- Remover import de `searchCities` do arquivo local
- Buscar cidades via query no banco: `supabase.from('cities').select('*').ilike('normalized_name', '%termo%').eq('is_active', true).limit(15)`
- Adicionar debounce de ~300ms na busca para nao sobrecarregar
- Quando nao encontrar resultado e usuario for admin, mostrar botao "Cadastrar cidade" que faz INSERT direto na tabela
- Manter `formatCityLabel` e `parseCityLabel` como helpers utilitarios (podem ficar no proprio componente ou em utils)

**Fluxo do componente atualizado:**
1. Usuario digita no campo
2. Apos 300ms sem digitar, busca no banco por `normalized_name`
3. Exibe resultados
4. Se nao encontrar: 
   - Admin ve botao "Cadastrar 'Cidade — UF'"
   - Nao-admin ve mensagem "Cidade nao encontrada, contate o administrador"
5. Ao selecionar, retorna `{ city, state }` como hoje (sem quebrar interface)

### 4. Funcao SQL de normalizacao

Criar funcao `normalize_city_name(text)` que:
- Remove acentos (usando `unaccent` extension)
- Converte para lowercase
- Remove espacos extras

Usada como coluna gerada ou via trigger para manter `normalized_name` sempre atualizado.

### 5. Atualizar telas consumidoras

Nenhuma mudanca necessaria nas telas `Events.tsx`, `BoardingLocations.tsx`, `Company.tsx`, `MyAccount.tsx` — elas continuam usando o mesmo contrato `{ city, state }` do `CityAutocomplete`. As funcoes `formatCityLabel` e `parseCityLabel` serao mantidas.

### 6. Limpar arquivo estatico

Remover o arquivo `src/data/brazilian-cities.ts` e todos os imports dele. As funcoes utilitarias `formatCityLabel`, `parseCityLabel` e `brazilianStates` serao movidas para um arquivo utilitario (`src/lib/cityUtils.ts`).

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| Migration SQL | Criar tabela `cities` + extension unaccent + funcao normalize + seed + RLS |
| `src/components/ui/city-autocomplete.tsx` | Reescrever para buscar do banco com debounce + cadastro inline |
| `src/lib/cityUtils.ts` | Novo: mover `formatCityLabel`, `parseCityLabel`, `brazilianStates` |
| `src/pages/admin/Events.tsx` | Atualizar imports de `brazilian-cities` para `cityUtils` |
| `src/pages/admin/BoardingLocations.tsx` | Atualizar imports |
| `src/pages/admin/Company.tsx` | Atualizar imports (se usar formatCityLabel) |
| `src/pages/admin/MyAccount.tsx` | Atualizar imports (se usar formatCityLabel) |
| `src/data/brazilian-cities.ts` | Remover |

---

## Detalhes Tecnicos

### Performance
- Indice trigram (`pg_trgm`) garante busca rapida mesmo com 5000+ cidades
- Debounce no frontend evita queries excessivas
- Limite de 15 resultados por busca

### Seguranca
- RLS impede que usuarios nao-admin criem cidades arbitrarias
- Indice unico impede duplicatas
- Normalizacao impede variantes como "Sao Paulo" vs "São Paulo"

### Compatibilidade
- Interface do componente (`value`, `onChange`) nao muda
- Eventos e locais existentes no banco nao sao afetados (continuam com texto livre)
- Migracao e transparente para o usuario final
