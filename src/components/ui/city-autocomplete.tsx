import * as React from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { searchCities, formatCityLabel, BrazilianCity } from '@/data/brazilian-cities';

interface CityAutocompleteProps {
  value: { city: string; state: string };
  onChange: (value: { city: string; state: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowFreeText?: boolean;
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder = 'Selecione a cidade...',
  disabled = false,
  className,
  allowFreeText = true,
}: CityAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  
  const displayValue = formatCityLabel(value.city, value.state);
  
  // Filtra cidades baseado na busca
  const filteredCities = React.useMemo(() => {
    if (!search) return [];
    return searchCities(search, 15);
  }, [search]);

  const handleSelect = (city: BrazilianCity) => {
    onChange({ city: city.name, state: city.state });
    setOpen(false);
    setSearch('');
  };

  const handleInputChange = (newSearch: string) => {
    setSearch(newSearch);
    
    // Se permitir texto livre e o usuário digitar, atualiza o value
    if (allowFreeText && newSearch) {
      // Tenta parsear se o usuário digitou no formato "Cidade — UF"
      const separators = [' — ', ' - ', ' – '];
      for (const sep of separators) {
        if (newSearch.includes(sep)) {
          const [city, state] = newSearch.split(sep);
          if (city && state && state.length >= 2) {
            onChange({ 
              city: city.trim(), 
              state: state.trim().toUpperCase().slice(0, 2) 
            });
            return;
          }
        }
      }
      // Se não está no formato padrão, apenas atualiza a cidade
      onChange({ city: newSearch, state: value.state });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !displayValue && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 shrink-0 opacity-50" />
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Digite para buscar..." 
            value={search}
            onValueChange={handleInputChange}
          />
          <CommandList>
            {filteredCities.length === 0 && search.length > 0 && (
              <CommandEmpty>
                <div className="text-sm text-muted-foreground py-2">
                  {allowFreeText ? (
                    <>
                      Nenhuma cidade encontrada.
                      <br />
                      <span className="text-xs">Digite no formato "Cidade — UF"</span>
                    </>
                  ) : (
                    'Nenhuma cidade encontrada.'
                  )}
                </div>
              </CommandEmpty>
            )}
            {filteredCities.length > 0 && (
              <CommandGroup>
                {filteredCities.map((city) => (
                  <CommandItem
                    key={`${city.name}-${city.state}`}
                    value={city.label}
                    onSelect={() => handleSelect(city)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.city === city.name && value.state === city.state
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    {city.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
