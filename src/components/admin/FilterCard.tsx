import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react';
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
}

export interface FilterInputConfig {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}

interface FilterCardProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelectConfig[];
  advancedFilters?: ReactNode;
  onClearFilters: () => void;
  hasActiveFilters?: boolean;
  className?: string;
}

export function FilterCard({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Pesquisar...',
  selects = [],
  advancedFilters,
  onClearFilters,
  hasActiveFilters = false,
  className,
}: FilterCardProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className={cn('filter-card', className)}>
      <div className="flex flex-col gap-4">
        {/* Filtros Simples */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
          
          {selects.map((select) => (
            <Select
              key={select.id}
              value={select.value}
              onValueChange={select.onChange}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
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
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              hasActiveFilters && 'text-primary'
            )}
          >
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        </div>

        {/* Filtros Avançados */}
        {advancedFilters && (
          <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-fit">
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
}: FilterInputConfig) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
