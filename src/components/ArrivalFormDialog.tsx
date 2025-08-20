import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Arrival } from "../lib/api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<Arrival>;
  onSubmit: (payload: Partial<Arrival>) => Promise<void> | void;
  submitting?: boolean;
  title?: string;
};

export default function ArrivalFormDialog({
  open,
  onOpenChange,
  initial = {},
  onSubmit,
  submitting = false,
  title = "Novi dolazak"
}: Props) {
  const [form, setForm] = React.useState<Partial<Arrival>>({
    status: "announced",
    type: "truck",
    ...initial,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setForm({ status: "announced", type: "truck", ...initial });
    setErrors({});
  }, [initial, open]);

  const update = (k: keyof Arrival) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const required = (v?: string) => (v && v.trim().length > 0);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!required(form.supplier as string)) next.supplier = "Obavezno polje";
    if (!required(form.plate as string)) next.plate = "Obavezno polje";
    if (form.status && !["announced","arrived","in_process","done","delayed"].includes(String(form.status))) {
      next.status = "Nepoznat status";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload: Partial<Arrival> = {
      ...form,
      supplier: (form.supplier ?? "").toString().trim(),
      plate: (form.plate ?? "").toString().trim(),
      carrier: (form.carrier ?? "").toString().trim() || undefined,
      note: (form.note ?? "").toString().trim() || undefined,
      type: (form.type ?? "truck").toString().trim(),
      status: (form.status ?? "announced").toString().trim(),
      eta: (form.eta ?? "").toString().trim() || undefined,
    };
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Popunite podatke i sačuvajte.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label>Dobavljač <span className="text-red-500">*</span></Label>
            <Input
              value={form.supplier ?? ""}
              onChange={update("supplier")}
              placeholder="npr. Podravka"
              aria-invalid={!!errors.supplier}
            />
            {errors.supplier && <span className="text-xs text-red-500">{errors.supplier}</span>}
          </div>
          <div className="grid gap-1">
            <Label>Prevoznik</Label>
            <Input value={form.carrier ?? ""} onChange={update("carrier")} placeholder="npr. DHL" aria-invalid={!!errors.carrier} />
          </div>
          <div className="grid gap-1">
            <Label>Tablice <span className="text-red-500">*</span></Label>
            <Input
              value={form.plate ?? ""}
              onChange={update("plate")}
              placeholder="XYZ-001"
              aria-invalid={!!errors.plate}
            />
            {errors.plate && <span className="text-xs text-red-500">{errors.plate}</span>}
          </div>
          <div className="grid gap-1">
            <Label>Tip</Label>
            <Input value={form.type ?? "truck"} onChange={update("type")} placeholder="truck" aria-invalid={!!errors.type} />
          </div>
          <div className="grid gap-1">
            <Label>ETA</Label>
            <Input value={form.eta ?? ""} onChange={update("eta")} placeholder="2025-08-22 14:00" aria-invalid={!!errors.eta} />
          </div>
          <div className="grid gap-1">
            <Label>Status</Label>
            <Input
              value={form.status ?? "announced"}
              onChange={update("status")}
              placeholder="announced"
              aria-invalid={!!errors.status}
            />
            {errors.status && <span className="text-xs text-red-500">{errors.status}</span>}
          </div>
          <div className="grid gap-1">
            <Label>Napomena</Label>
            <Textarea value={form.note ?? ""} onChange={update("note")} placeholder="Dodatne informacije..." aria-invalid={!!errors.note} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Otkaži
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} type="button">
            {submitting ? "Snimam..." : "Sačuvaj"}
          </Button>
        </DialogFooter>
        <div className="hidden" onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }} />
      </DialogContent>
    </Dialog>
  );
}