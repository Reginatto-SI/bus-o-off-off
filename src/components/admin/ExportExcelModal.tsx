import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileSpreadsheet, Search } from 'lucide-react';
import { toast } from 'sonner';

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

interface ExportExcelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumn[];
  data: any[];
  storageKey: string;
  fileName: string;
  sheetName?: string;
}

interface StoredPreferences {
  selectedColumns: string[];
}

export function ExportExcelModal({
  open,
  onOpenChange,
  columns,
  data,
  storageKey,
  fileName,
  sheetName,
}: ExportExcelModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Load preferences from localStorage when modal opens
  useEffect(() => {
    if (open) {
      // Sempre limpa a busca ao abrir para manter experiência previsível.
      setSearchTerm('');
      const stored = localStorage.getItem(`export_columns_${storageKey}`);
      if (stored) {
        try {
          const preferences: StoredPreferences = JSON.parse(stored);
          setSelectedColumns(preferences.selectedColumns);
        } catch {
          // If parsing fails, use default columns
          setSelectedColumns(columns.slice(0, 7).map((c) => c.key));
        }
      } else {
        // First time: select first 7 columns by default
        setSelectedColumns(columns.slice(0, 7).map((c) => c.key));
      }
    }
  }, [open, storageKey, columns]);

  const handleSelectAll = () => {
    setSelectedColumns(columns.map((c) => c.key));
  };

  const handleDeselectAll = () => {
    setSelectedColumns([]);
  };

  const handleToggleColumn = (key: string) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectEssential = () => {
    // Mantém um atalho simples para começar com um conjunto reduzido sem regra complexa.
    setSelectedColumns(columns.slice(0, Math.min(6, columns.length)).map((column) => column.key));
  };

  const handleExport = () => {
    if (selectedColumns.length === 0) {
      toast.error('Selecione pelo menos uma coluna para exportar');
      return;
    }

    if (data.length === 0) {
      toast.error('Não há dados para exportar');
      return;
    }

    // Save preferences to localStorage
    const preferences: StoredPreferences = { selectedColumns };
    localStorage.setItem(`export_columns_${storageKey}`, JSON.stringify(preferences));

    // Build export data with selected columns
    const selectedColumnObjects = columns.filter((c) => selectedColumns.includes(c.key));
    
    const exportData = data.map((item) => {
      const row: Record<string, any> = {};
      selectedColumnObjects.forEach((col) => {
        const value = item[col.key];
        row[col.label] = col.format ? col.format(value) : (value ?? '');
      });
      return row;
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Dados');

    // Generate and download file
    XLSX.writeFile(workbook, `${fileName}.xlsx`);

    toast.success(`Arquivo ${fileName}.xlsx gerado com sucesso`);
    onOpenChange(false);
  };

  const filteredColumns = columns.filter((column) =>
    column.label.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Exportar para Excel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione as colunas que deseja exportar:
          </p>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Marcar Todos
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Desmarcar Todos
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectEssential}>
              Selecionar Essenciais
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-8"
              placeholder="Buscar coluna..."
            />
          </div>

          <ScrollArea className="h-[300px] rounded-md border p-4">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredColumns.map((column) => (
                <div key={column.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${column.key}`}
                    checked={selectedColumns.includes(column.key)}
                    onCheckedChange={() => handleToggleColumn(column.key)}
                  />
                  <Label
                    htmlFor={`col-${column.key}`}
                    className="cursor-pointer text-sm font-normal leading-none"
                  >
                    {column.label}
                  </Label>
                </div>
              ))}
            </div>
            {filteredColumns.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma coluna encontrada para a busca informada.
              </p>
            )}
          </ScrollArea>

          <p className="text-xs text-muted-foreground">
            {selectedColumns.length} de {columns.length} colunas selecionadas •{' '}
            {data.length} registros para exportar
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={selectedColumns.length === 0}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Gerar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
