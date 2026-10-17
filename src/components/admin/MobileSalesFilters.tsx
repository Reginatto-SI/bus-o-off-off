import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Presentation only: search and every filter remain owned by Sales. */
export function MobileSalesFilters({ search, onSearchChange, active, children }: { search: string; onSearchChange: (value: string) => void; active: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(active);
  const id = useId();
  useEffect(() => { if (active) setExpanded(true); }, [active]);
  return <section className="sales-mobile-filters" aria-label="Consultar vendas">
    <label htmlFor={id}>Consultar vendas</label>
    <div className="sales-mobile-search"><Search size={18} aria-hidden="true"/><Input id={id} type="search" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Passagem, nome, CPF ou evento"/></div>
    <details open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}>
      <summary><SlidersHorizontal size={16} aria-hidden="true"/><span>Filtros{active ? ' · aplicados' : ''}</span><ChevronDown size={16} aria-hidden="true"/></summary>
      {children}
    </details>
  </section>;
}
