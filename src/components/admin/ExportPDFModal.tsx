import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExportColumn } from './ExportExcelModal';
import { getLogoBase64, formatDateTime, BRAND_ORANGE_RGB } from '@/lib/pdfUtils';

interface ExportPDFModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumn[];
  data: any[];
  storageKey: string;
  fileName: string;
  title: string;
  companyName: string;
}

interface StoredPreferences {
  selectedColumns: string[];
}

export function ExportPDFModal({
  open,
  onOpenChange,
  columns,
  data,
  storageKey,
  fileName,
  title,
  companyName,
}: ExportPDFModalProps) {
  // Mantemos 8 opções por coluna para reduzir rolagem e facilitar o "bater o olho".
  // Ajuste o número abaixo caso precise mudar o limite de itens por coluna no futuro.
  const COLUMN_SIZE = 8;
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Load preferences from localStorage when modal opens
  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem(`export_pdf_columns_${storageKey}`);
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

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      toast.error('Selecione pelo menos uma coluna para exportar');
      return;
    }

    if (data.length === 0) {
      toast.error('Não há dados para exportar');
      return;
    }

    setGenerating(true);

    try {
      // Save preferences to localStorage
      const preferences: StoredPreferences = { selectedColumns };
      localStorage.setItem(`export_pdf_columns_${storageKey}`, JSON.stringify(preferences));

      // Create PDF in landscape orientation for more columns
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Try to load logo
      let logoBase64: string | null = null;
      try {
        logoBase64 = await getLogoBase64();
      } catch (e) {
        console.warn('Logo não carregada para o PDF:', e);
      }

      // Header function to be called on each page
      const addHeader = () => {
        let yPosition = margin;

        // Logo and system name
        if (logoBase64) {
          doc.addImage(logoBase64, 'JPEG', margin, yPosition, 20, 20);
        }

        // System name
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Busão Off Off', margin + (logoBase64 ? 25 : 0), yPosition + 8);

        // Company name
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Empresa: ${companyName}`, margin + (logoBase64 ? 25 : 0), yPosition + 14);

        // Document title (centered)
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), pageWidth / 2, yPosition + 28, { align: 'center' });

        // Generation date
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, pageWidth / 2, yPosition + 34, { align: 'center' });

        return yPosition + 42;
      };

      // Add header on first page
      const tableStartY = addHeader();

      // Prepare table data
      const selectedColumnObjects = columns.filter((c) => selectedColumns.includes(c.key));
      const tableHeaders = selectedColumnObjects.map((c) => c.label);
      const tableData = data.map((item) =>
        selectedColumnObjects.map((col) => {
          const value = item[col.key];
          return col.format ? col.format(value) : (value ?? '');
        })
      );

      // Generate table with autoTable
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: tableStartY,
        margin: { left: margin, right: margin },
        headStyles: {
          fillColor: [BRAND_ORANGE_RGB.r, BRAND_ORANGE_RGB.g, BRAND_ORANGE_RGB.b],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'left',
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [51, 51, 51],
        },
        alternateRowStyles: {
          fillColor: [248, 248, 248],
        },
        styles: {
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
          cellPadding: 3,
        },
        didDrawPage: (data) => {
          // Add header on new pages (except first)
          if (data.pageNumber > 1) {
            addHeader();
          }

          // Footer with page numbers
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(128, 128, 128);

          // Left: system attribution
          doc.text('Documento gerado pelo sistema Busão Off Off', margin, pageHeight - 10);

          // Right: page number
          doc.text(
            `Página ${data.pageNumber} de ${pageCount}`,
            pageWidth - margin,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

      // Download file
      doc.save(`${fileName}.pdf`);

      toast.success(`Arquivo ${fileName}.pdf gerado com sucesso`);
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setGenerating(false);
    }
  };

  const columnGroups = Array.from(
    { length: Math.ceil(columns.length / COLUMN_SIZE) },
    (_, index) => columns.slice(index * COLUMN_SIZE, (index + 1) * COLUMN_SIZE)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Exportar para PDF
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
          </div>

          <ScrollArea className="h-[300px] rounded-md border p-4">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {columnGroups.map((group, groupIndex) => (
                <div key={`pdf-col-group-${groupIndex}`} className="space-y-3">
                  {group.map((column) => (
                    <div key={column.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pdf-col-${column.key}`}
                        checked={selectedColumns.includes(column.key)}
                        onCheckedChange={() => handleToggleColumn(column.key)}
                      />
                      <Label
                        htmlFor={`pdf-col-${column.key}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
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
          <Button onClick={handleExport} disabled={selectedColumns.length === 0 || generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Gerar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
