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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Arrival } from "../lib/api";

type ArrivalWithFiles = Partial<Arrival> & { _files?: File[] };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<Arrival>;
  onSubmit: (payload: Partial<Arrival>) => Promise<void> | void;
  submitting?: boolean;
  title?: string;
};

const STATUS_OPTIONS = [
  { value: "announced", label: "Najavljeno" },
  { value: "arrived", label: "Stiglo" },
  { value: "in_process", label: "U procesu" },
  { value: "done", label: "Završeno" },
  { value: "delayed", label: "Kašnjenje" },
];

const TYPE_OPTIONS = [
  { value: "truck", label: "Šleper" },
  { value: "container", label: "Kontejner" },
  { value: "van", label: "Kombi" },
  { value: "other", label: "Ostalo" },
];

export default function ArrivalFormDialog({
  open,
  onOpenChange,
  initial = {},
  onSubmit,
  submitting = false,
  title = "Novi dolazak",
}: Props) {
  const [form, setForm] = React.useState<Partial<Arrival>>({
    status: "announced",
    type: "truck",
    ...initial,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [files, setFiles] = React.useState<File[]>([]);

  const initialKey = React.useMemo(() => JSON.stringify(initial ?? {}), [initial]);

  React.useEffect(() => {
    const next = { status: "announced", type: "truck", ...initial };

    // Avoid unnecessary updates which, combined with changing prop references,
    // can cause an infinite re-render loop.
    setForm((prev) => {
      const same = JSON.stringify(prev) === JSON.stringify(next);
      return same ? prev : next;
    });
    setErrors({});
    setFiles([]);
  }, [open, initialKey]);

  const update =
    (k: keyof Arrival) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value }));

  const required = (v?: string) => !!(v && v.trim().length > 0);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!required(form.supplier as string)) next.supplier = "Obavezno polje";
    if (!required(form.plate as string)) next.plate = "Obavezno polje";
    if (
      form.status &&
      !["announced", "arrived", "in_process", "done", "delayed"].includes(String(form.status))
    ) {
      next.status = "Nepoznat status";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const payload: ArrivalWithFiles = {
      ...form,
      supplier: (form.supplier ?? "").toString().trim(),
      plate: (form.plate ?? "").toString().trim(),
      carrier: (form.carrier ?? "").toString().trim() || undefined,
      note: (form.note ?? "").toString().trim() || undefined,
      type: (form.type ?? "truck").toString().trim(),
      status: (form.status ?? "announced").toString().trim(),
      eta: (form.eta ?? "").toString().trim() || undefined,
    };
    if (files.length) {
      payload._files = files;
    }
    await onSubmit(payload);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={onKeyDown}>
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
            <Label>Prevoznik</Label>
            <Input
              value={form.carrier ?? ""}
              onChange={update("carrier")}
              placeholder="npr. DHL"
              aria-invalid={!!errors.carrier}
            />
          </div>

          <div className="grid gap-1">
            <Label>Tip</Label>
            <select
              className="border rounded-md h-9 px-3 bg-background"
              value={(form.type as string) ?? "truck"}
              onChange={update("type")}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <Label>ETA</Label>
            <Input
              value={form.eta ?? ""}
              onChange={update("eta")}
              placeholder="2025-08-22 14:00"
              aria-invalid={!!errors.eta}
            />
          </div>

          <div className="grid gap-1">
            <Label>Status</Label>
            <select
              className="border rounded-md h-9 px-3 bg-background"
              value={(form.status as string) ?? "announced"}
              onChange={update("status")}
              aria-invalid={!!errors.status}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.status && <span className="text-xs text-red-500">{errors.status}</span>}
          </div>

          <div className="grid gap-1">
            <Label>Napomena</Label>
            <textarea
              value={(form.note as string) ?? ""}
              onChange={update("note")}
              placeholder="Dodatne informacije…"
              aria-invalid={!!errors.note}
              className="min-h-[88px] rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-1">
            <Label>Prilozi (opcionalno)</Label>
            <input
              type="file"
              multiple
              onChange={(e) => {
                const list = e.currentTarget.files ? Array.from(e.currentTarget.files) : [];
                setFiles(list);
              }}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.xlsx,.xls,.csv,.txt,.doc,.docx"
            />
            {files.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Odabrano fajlova: {files.length}
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Otkaži
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} type="button" data-has-files={files.length > 0}>
            {submitting ? "Snimam..." : "Sačuvaj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}