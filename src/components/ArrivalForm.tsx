import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * NOTE:
 * - Naziv fajla je `ArrivalForm.tsx`, ali komponenta u njemu je `DialogConfirm`.
 * - Predlog: preimenuj fajl u `DialogConfirm.tsx` (ili premesti ovu komponentu tamo),
 *   a u ovom fajlu napravi stvarni formular za kreiranje/izmjenu "Arrival".
 * - Za sada ostavljamo funkcionalnost netaknutom da ništa ne "pukne".
 */

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
  destructive?: boolean; // show red confirm button
};

export default function DialogConfirm({
  open,
  onOpenChange,
  title = "Potvrda",
  description = "Da li ste sigurni?",
  confirmLabel = "Potvrdi",
  cancelLabel = "Otkaži",
  onConfirm,
  loading = false,
  destructive = true,
}: Props) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy || loading}
            aria-disabled={busy || loading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || loading}
            aria-busy={busy || loading}
            variant={destructive ? "destructive" : "default"}
          >
            {(busy || loading) ? "Obrada…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}