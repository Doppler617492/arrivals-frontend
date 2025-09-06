import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  /** Extra content in the body (e.g. warnings, lists) */
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** When returns a Promise, we'll show loading and (by default) close on resolve. */
  onConfirm: () => void | Promise<void>;
  onOpenChange: (v: boolean) => void;
  /** Force loading externally (otherwise managed internally) */
  loading?: boolean;
  /** Style of the confirm button (e.g. for deletions) */
  confirmVariant?: "default" | "destructive" | "secondary" | "outline" | "ghost" | "link";
  /** Prevent confirming when true (e.g. validation) */
  confirmDisabled?: boolean;
  /** Auto-close the dialog after successful onConfirm */
  closeOnSuccess?: boolean;
  /** Focus the confirm button when the dialog opens */
  autoFocusConfirm?: boolean;
  /** Hide the cancel button (rare) */
  hideCancel?: boolean;
  /** Prevent closing by ESC/click-outside while busy */
  preventCloseWhileBusy?: boolean;
  /** Optional error text to show inside the dialog */
  error?: string | null;
};

export default function DialogConfirm({
  open,
  title = "Potvrda",
  description = "Da li ste sigurni?",
  children,
  confirmText = "Da, potvrdi",
  cancelText = "Otkaži",
  onConfirm,
  onOpenChange,
  loading,
  confirmVariant = "default",
  confirmDisabled = false,
  closeOnSuccess = true,
  autoFocusConfirm = true,
  hideCancel = false,
  preventCloseWhileBusy = true,
  error = null,
}: Props) {
  // Internal busy state when `loading` prop is not provided
  const [busy, setBusy] = React.useState(false);
  const isBusy = loading ?? busy;

  const descId = React.useId();
  const errId = React.useId();
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open && autoFocusConfirm && confirmBtnRef.current) {
      // slight delay to ensure content is mounted
      const id = window.setTimeout(() => confirmBtnRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open, autoFocusConfirm]);

  const handleConfirm = async () => {
    try {
      const maybePromise = onConfirm();
      if (maybePromise && typeof (maybePromise as any).then === "function") {
        setBusy(true);
        await (maybePromise as Promise<void>);
        if (closeOnSuccess) onOpenChange(false);
      } else {
        if (closeOnSuccess) onOpenChange(false);
      }
    } catch (e) {
      // keep dialog open so the caller can display an error outside or via description
      console.error("[DialogConfirm] onConfirm failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const guardedOpenChange = (v: boolean) => {
    if (isBusy && preventCloseWhileBusy) return;
    onOpenChange(v);
  };

  const stopIfBusy = (e: Event) => {
    if (isBusy && preventCloseWhileBusy) {
      e.preventDefault();
    }
  };

  return (
    <Dialog open={open} onOpenChange={guardedOpenChange}>
      <DialogContent
        aria-describedby={description ? descId : undefined}
        aria-errormessage={error ? errId : undefined}
        onInteractOutside={stopIfBusy as any}
        onEscapeKeyDown={stopIfBusy as any}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription id={descId}>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {children}

        {error ? (
          <div
            id={errId}
            role="alert"
            className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {!hideCancel && (
            <Button
              variant="outline"
              onClick={() => guardedOpenChange(false)}
              disabled={isBusy}
            >
              {cancelText}
            </Button>
          )}
          <Button
            ref={confirmBtnRef}
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={isBusy || confirmDisabled}
          >
            {isBusy ? "Obrada..." : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}