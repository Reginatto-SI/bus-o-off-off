import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  metadata?: ReactNode;
}

export function PageHeader({ title, description, actions, metadata }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{title}</h1>
        {/* Metadados opcionais para sinalizações de contexto sem alterar o layout base das páginas. */}
        {metadata && <div className="mt-2">{metadata}</div>}
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>
      </div>
      {actions && (
        // Mobile: ações ocupam toda a linha para evitar truncamento/desalinhamento de CTAs.
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
