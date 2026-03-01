import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  metadata?: ReactNode;
}

export function PageHeader({ title, description, actions, metadata }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {/* Metadados opcionais para sinalizações de contexto sem alterar o layout base das páginas. */}
        {metadata && <div className="mt-2">{metadata}</div>}
        <p className="text-muted-foreground">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
