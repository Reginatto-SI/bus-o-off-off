import * as React from 'react';
import { Check, ChevronsUpDown, MapPin, Plus, Loader2 } from 'lucide-react';
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
import { formatCityLabel, brazilianStates } from '@/lib/cityUtils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CityResult {
  id: string;
  name: string;
  state: string;
}

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
  const [cities, setCities] = React.useState<CityResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();
  const { userRole } = useAuth();

  const isAdmin = userRole === 'gerente' || userRole === 'operador' || userRole === 'developer';

  const safeCity = value?.city ?? '';
  const safeState = value?.state ?? '';
  const displayValue = formatCityLabel(safeCity, safeState);

  // Debounced search
  React.useEffect(() => {
    if (!search || search.length < 2) {
      setCities([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Normalize search term client-side for matching
        const normalized = search
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        const { data, error } = await supabase
          .from('cities')
          .select('id, name, state')
          .ilike('normalized_name', `%${normalized}%`)
          .eq('is_active', true)
          .order('name')
          .limit(15);

        if (error) throw error;
        setCities(data || []);
      } catch (err) {
        console.error('Error searching cities:', err);
        setCities([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const handleSelect = (city: CityResult) => {
    onChange({ city: city.name, state: city.state });
    setOpen(false);
    setSearch('');
  };

  const handleInputChange = (newSearch: string) => {
    setSearch(newSearch);

    if (allowFreeText && newSearch) {
      const separators = [' — ', ' - ', ' – '];
      for (const sep of separators) {
        if (newSearch.includes(sep)) {
          const parts = newSearch.split(sep);
          const city = parts[0];
          const state = parts[1];
          if (city && state && state.length >= 2) {
            onChange({
              city: city.trim(),
              state: state.trim().toUpperCase().slice(0, 2),
            });
            return;
          }
        }
      }
      onChange({ city: newSearch, state: safeState });
    }
  };

  const handleRegisterCity = async () => {
    // Try to parse "Cidade — UF" from search
    let cityName = search.trim();
    let stateCode = '';

    const separators = [' — ', ' - ', ' – '];
    for (const sep of separators) {
      if (cityName.includes(sep)) {
        const parts = cityName.split(sep);
        cityName = parts[0].trim();
        stateCode = parts[1]?.trim().toUpperCase().slice(0, 2) || '';
        break;
      }
    }

    if (!stateCode) {
      toast.error('Digite no formato "Cidade — UF" para cadastrar (ex: Caldas — MG)');
      return;
    }

    const validState = brazilianStates.find((s) => s.code === stateCode);
    if (!validState) {
      toast.error(`UF "${stateCode}" inválida.`);
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('cities')
        .insert({
          name: cityName,
          state: stateCode,
          source: 'admin',
          created_by: user?.user?.id || null,
        })
        .select('id, name, state')
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.info('Essa cidade já existe no cadastro.');
        } else {
          throw error;
        }
        return;
      }

      toast.success(`Cidade "${cityName} — ${stateCode}" cadastrada!`);
      onChange({ city: data.name, state: data.state });
      setOpen(false);
      setSearch('');
    } catch (err: any) {
      console.error('Error registering city:', err);
      toast.error('Erro ao cadastrar cidade.');
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
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Buscando...</span>
              </div>
            )}
            {!loading && cities.length === 0 && search.length >= 2 && (
              <CommandEmpty>
                <div className="text-sm text-muted-foreground py-2 px-2">
                  {isAdmin ? (
                    <div className="space-y-2">
                      <p>Nenhuma cidade encontrada.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleRegisterCity}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Cadastrar "{search}"
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Use o formato "Cidade — UF"
                      </p>
                    </div>
                  ) : allowFreeText ? (
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
            {cities.length > 0 && (
              <CommandGroup>
                {cities.map((city) => (
                  <CommandItem
                    key={city.id}
                    value={`${city.name}-${city.state}`}
                    onSelect={() => handleSelect(city)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        safeCity === city.name && safeState === city.state
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    {formatCityLabel(city.name, city.state)}
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
