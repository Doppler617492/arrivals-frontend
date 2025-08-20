import type { Arrival } from "../lib/api";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@radix-ui/react-dialog";

type Props = {
  arrival: Arrival | null;
  onClose: () => void;
};

export default function ArrivalDetail({ arrival, onClose }: Props) {
  const [open, setOpen] = useState(!!arrival);

  useEffect(() => {
    setOpen(!!arrival);
  }, [arrival]);

  if (!arrival) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg rounded-lg border bg-card text-card-foreground shadow-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Detalji dolaska #{arrival.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p><b>Dobavljač:</b> {arrival.supplier}</p>
          <p><b>Tablica:</b> {arrival.plate}</p>
          <p><b>Prevoznik:</b> {arrival.carrier || "—"}</p>
          <p><b>Tip:</b> {arrival.type}</p>
          <p>
            <b>Status:</b>{" "}
            <span className={`status status-${arrival.status}`}>
              {arrival.status}
            </span>
          </p>
          <p><b>Kreiran:</b> {new Date(arrival.created_at).toLocaleString()}</p>
        </div>

        <div className="mt-4 text-right">
          <button
            className="px-4 py-2 rounded-md border hover:bg-muted transition"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Zatvori
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}