

## Plano: Adicionar tooltip com info da taxa na coluna Status

### Alteração

Arquivo: `src/pages/admin/Sales.tsx`, linhas 1222-1227.

Substituir os `<span>` de "Taxa pendente" e "Taxa falhou" por um bloco com ícone de info (`AlertCircle` ou `HelpCircle` do lucide-react) + texto, envolvido por um `Tooltip` (já importado no projeto).

O tooltip exibirá: `"Taxa da plataforma de {X}% sobre o valor da venda"`, onde X vem de `activeCompany?.platform_fee_percent`.

### Implementação

```tsx
{(sale as any).platform_fee_status === 'pending' && (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground cursor-help">
        <AlertCircle className="h-3 w-3" />
        Taxa pendente
      </span>
    </TooltipTrigger>
    <TooltipContent>
      Taxa da plataforma de {activeCompany?.platform_fee_percent ?? '—'}% sobre o valor da venda
    </TooltipContent>
  </Tooltip>
)}
```

Mesmo padrão para `failed`, trocando texto/cor.

### Dependências
- `Tooltip`, `TooltipTrigger`, `TooltipContent` — já importados via `TooltipProvider` no App.tsx
- `AlertCircle` do lucide-react — verificar se já está importado, senão adicionar ao import existente
- `activeCompany` — já disponível no componente

