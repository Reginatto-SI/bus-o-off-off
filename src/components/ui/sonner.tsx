import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast, useSonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { toasts } = useSonner();

  useEffect(() => {
    const handleToastClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const toastElement = target?.closest<HTMLElement>("[data-sonner-toast]");

      if (!toastElement) {
        return;
      }

      const index = Number(toastElement.dataset.index);
      const yPosition = toastElement.dataset.yPosition;
      const xPosition = toastElement.dataset.xPosition;
      const position = yPosition && xPosition ? `${yPosition}-${xPosition}` : undefined;
      const defaultPosition = props.position ?? "bottom-right";
      const matchedToasts = toasts.filter((toastItem) => (toastItem.position ?? defaultPosition) === position);
      const toastToDismiss = matchedToasts[index];

      if (toastToDismiss) {
        // Padrão global: clicar no toast fecha imediatamente.
        toast.dismiss(toastToDismiss.id);
      }
    };

    document.addEventListener("click", handleToastClick, true);
    return () => document.removeEventListener("click", handleToastClick, true);
  }, [props.position, toasts]);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
