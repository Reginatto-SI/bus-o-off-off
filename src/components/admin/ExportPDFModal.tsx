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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ExportColumn } from './ExportExcelModal';
import {
  getLogoBase64,
  formatDateTime,
  getCompanyPrimaryColor,
  getCompanyDisplayName,
  getCompanyLocation,
  formatCnpj,
  hexToRgb,
  loadImageAsBase64,
} from '@/lib/pdfUtils';
import { Company } from '@/types/database';

interface ExportPDFModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumn[];
  data: any[];
  storageKey: string;
  fileName: string;
  title: string;
  company: Company | null;
  totalRecords?: number;
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
  company,
  totalRecords,
}: ExportPDFModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      // Sempre limpa a busca ao abrir para manter a experiência consistente.
      setSearchTerm('');
      const stored = localStorage.getItem(`export_pdf_columns_${storageKey}`);
      if (stored) {
        try {
          const preferences: StoredPreferences = JSON.parse(stored);
          setSelectedColumns(preferences.selectedColumns);
        } catch {
          setSelectedColumns(columns.slice(0, 7).map((c) => c.key));
        }
      } else {
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
    // Atalho opcional para iniciar com poucas colunas sem criar regras complexas.
    setSelectedColumns(columns.slice(0, Math.min(6, columns.length)).map((column) => column.key));
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
      const preferences: StoredPreferences = { selectedColumns };
      localStorage.setItem(`export_pdf_columns_${storageKey}`, JSON.stringify(preferences));

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      // Cor primária da empresa (com fallback)
      const primaryColor = getCompanyPrimaryColor(company);
      const primaryColorRgb = hexToRgb(primaryColor);

      // Carregar logo (empresa ou sistema)
      let logoBase64: string | null = null;
      try {
        if (company?.logo_url) {
          logoBase64 = await loadImageAsBase64(company.logo_url);
        }
        if (!logoBase64) {
          logoBase64 = await getLogoBase64();
        }
      } catch (e) {
        console.warn('Logo não carregada para o PDF:', e);
      }

      // Dados da empresa para o cabeçalho
      const companyDisplayName = getCompanyDisplayName(company);
      const companyLegalName = company?.legal_name || null;
      const companyCnpj = formatCnpj(company?.cnpj || null);
      const companyLocation = getCompanyLocation(company);

      // Função de cabeçalho institucional
      const addHeader = () => {
        const yPosition = margin;
        const leftBlockX = margin;
        const rightBlockX = pageWidth - margin;
        const leftY = yPosition;

        // === BLOCO ESQUERDO (Identidade da Empresa) ===
        
        // Logo
        if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', leftBlockX, leftY, 18, 18);
        }

        const textStartX = leftBlockX + (logoBase64 ? 22 : 0);

        // Nome fantasia (destaque)
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 51, 51);
        doc.text(companyDisplayName, textStartX, leftY + 6);

        // Razão social (se existir)
        let currentY = leftY + 11;
        if (companyLegalName) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(102, 102, 102);
          doc.text(companyLegalName, textStartX, currentY);
          currentY += 4;
        }

        // CNPJ (se existir)
        if (companyCnpj) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(128, 128, 128);
          doc.text(`CNPJ: ${companyCnpj}`, textStartX, currentY);
          currentY += 4;
        }

        // Cidade - UF (se existir)
        if (companyLocation) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(128, 128, 128);
          doc.text(companyLocation, textStartX, currentY);
        }

        // === BLOCO DIREITO (Identidade do Documento) ===
        
        // Sistema
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(128, 128, 128);
        doc.text('Sistema: Busão Off Off', rightBlockX, leftY + 4, { align: 'right' });

        // Título do documento (cor primária)
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColorRgb.r, primaryColorRgb.g, primaryColorRgb.b);
        doc.text(title.toUpperCase(), rightBlockX, leftY + 12, { align: 'right' });

        // Data e hora de geração
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(102, 102, 102);
        doc.text(`Gerado em: ${formatDateTime(new Date())}`, rightBlockX, leftY + 17, { align: 'right' });

        // Linha separadora
        const separatorY = yPosition + 24;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.line(margin, separatorY, pageWidth - margin, separatorY);

        // Reset text color
        doc.setTextColor(0, 0, 0);

        return separatorY + 6;
      };

      // Posição inicial da tabela abaixo do bloco de cabeçalho (logo + textos + separador).
      const tableStartY = margin + 30;

      const selectedColumnObjects = columns.filter((c) => selectedColumns.includes(c.key));
      const tableHeaders = selectedColumnObjects.map((c) => c.label);
      const tableData = data.map((item) =>
        selectedColumnObjects.map((col) => {
          const value = item[col.key];
          return col.format ? col.format(value) : (value ?? '');
        })
      );

      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: tableStartY,
        // Reserva margem superior fixa para todas as páginas e evita sobreposição do cabeçalho.
        margin: { top: tableStartY, left: margin, right: margin },
        headStyles: {
          fillColor: [primaryColorRgb.r, primaryColorRgb.g, primaryColorRgb.b],
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
        willDrawPage: () => {
          // Desenha o cabeçalho antes do conteúdo da página para manter a hierarquia visual.
          addHeader();
        },
        didDrawPage: (pageData) => {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(128, 128, 128);

          doc.text('Documento gerado pelo sistema Busão Off Off', margin, pageHeight - 10);

          doc.text(
            `Página ${pageData.pageNumber} de ${pageCount}`,
            pageWidth - margin,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

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

  const filteredColumns = columns.filter((column) =>
    column.label.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
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
                    id={`pdf-col-${column.key}`}
                    checked={selectedColumns.includes(column.key)}
                    onCheckedChange={() => handleToggleColumn(column.key)}
                  />
                  <Label
                    htmlFor={`pdf-col-${column.key}`}
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
            {totalRecords ?? data.length} registros para exportar
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
