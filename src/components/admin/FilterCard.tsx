import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp, X, Search, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectConfig {
  id: string;
  label: string;
  placeholder: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  icon?: LucideIcon;
}

export interface FilterInputConfig {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
  icon?: LucideIcon;
}

interface FilterCardProps {
  title?: string;
  searchLabel?: string;
  searchIcon?: LucideIcon;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelectConfig[];
  mainFilters?: ReactNode;
  advancedFilters?: ReactNode;
  onClearFilters: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export function FilterCard({
  title = 'Filtrar por:',
  searchLabel = 'Busca',
  searchIcon: SearchIcon = Search,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Pesquisar...',
  selects = [],
  mainFilters,
  advancedFilters,
  onClearFilters,
  hasActiveFilters = false,
  className,
}: FilterCardProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className={cn('filter-card', className)}>
      <div className="flex flex-col gap-3 sm:gap-4">
        {/* Cabeçalho do card */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className={cn(
              'h-8 px-2 text-xs text-muted-foreground hover:text-foreground sm:h-9 sm:px-3 sm:text-sm',
              hasActiveFilters && 'text-primary'
            )}
          >
            <X className="h-4 w-4 mr-1" />
            Limpar filtros
          </Button>
        </div>

        {/* Filtros Simples */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <SearchIcon className="h-4 w-4" />
              {searchLabel}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-9 sm:h-10"
              />
            </div>
          </div>

          {selects.map((select) => (
            <div key={select.id} className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {select.icon ? <select.icon className="h-4 w-4" /> : null}
                {select.label}
              </label>
              <Select
                value={select.value}
                onValueChange={select.onChange}
              >
                <SelectTrigger className="h-9 w-full sm:h-10">
                  <SelectValue placeholder={select.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {select.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {mainFilters}
        </div>

        {/* Filtros Avançados */}
        {advancedFilters && (
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-fit px-2 text-xs sm:h-9 sm:px-3 sm:text-sm">
                {isAdvancedOpen ? (
                  <ChevronUp className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronDown className="h-4 w-4 mr-2" />
                )}
                Filtros avançados
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              {advancedFilters}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

export function FilterInput({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon: Icon,
}: FilterInputConfig) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
