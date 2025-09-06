import * as React from "react";
import { createPortal } from "react-dom";

type DialogContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};
const DialogContext = React.createContext<DialogContextType | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(!!open);
  const controlled = typeof open === "boolean";
  const isOpen = controlled ? !!open : internalOpen;

  const setOpen = (v: boolean) => {
    if (!controlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    // Close on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    // Lock body scroll when open
    const prevOverflow = document.body.style.overflow;
    if (isOpen) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactElement;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) return children;

  const onClick = () => ctx.setOpen(true);
  return asChild
    ? React.cloneElement(children, {
        onClick: (e: any) => {
          children.props.onClick?.(e);
          onClick();
        },
      })
    : (
      <button onClick={onClick} className="inline-flex items-center rounded-md px-3 py-2 bg-gray-900 text-white">
        {children}
      </button>
    );
}

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  const el = document.getElementById("dialog-root") || document.body;
  return createPortal(children, el);
}

export function DialogContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx || !ctx.open) return null;

  const close = () => ctx.setOpen(false);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
        aria-modal="true"
        role="dialog"
      >
        <div className="fixed inset-0 bg-black/40" onClick={close} />
        <div
          className={`relative z-[1001] w-full sm:max-w-lg rounded-xl bg-white p-4 shadow-xl ${className}`}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3">{children}</div>;
}
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex gap-2 justify-end">{children}</div>;
}
export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}
export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600">{children}</p>;
}
export function DialogClose({
  asChild,
  children,
}: {
  asChild?: boolean;
  children?: React.ReactElement | string;
}) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) return null;

  const onClick = () => ctx.setOpen(false);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e: any) => {
        (children as any).props?.onClick?.(e);
        onClick();
      },
    });
  }
  return (
    <button onClick={onClick} className="inline-flex items-center rounded-md px-3 py-2 bg-gray-200">
      {children ?? "Close"}
    </button>
  );
}