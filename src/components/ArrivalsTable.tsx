import * as React from "react";
import { Plus, Trash, Pencil, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ArrivalFormDialog from "./ArrivalFormDialog";
import { api } from "../lib/api";
import type { Arrival, ID } from "../lib/api";
import { useToast } from "../lib/toast";

function parseError(err: unknown): { status?: number; message?: string } {
  try {
    const raw = (err as Error)?.message ?? String(err);
    return JSON.parse(raw);
  } catch {
    return { message: (err as any)?.message ?? "Nešto je pošlo po zlu." };
  }
}

export default function ArrivalsTable() {
  const [items, setItems] = React.useState<Arrival[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Create
  const [openCreate, setOpenCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Delete
  const [toDelete, setToDelete] = React.useState<Arrival | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Edit
  const [editItem, setEditItem] = React.useState<Arrival | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Token (za zaštitu akcija)
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("token") : null;

  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listArrivals();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      const { message } = parseError(e);
      // use ref to avoid re-creating the callback when toast identity changes
      toastRef.current({
        title: "Greška",
        description: message ?? "Neuspješno učitavanje.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // In React 18 StrictMode dev, effects run twice; this is fine, but we ensure
    // `load` has a stable identity (empty deps) so it won't loop.
  }, [load]);

  // CREATE
  const handleCreate = async (payload: Partial<Arrival>) => {
    setCreating(true);
    try {
      // mapiramo minimalni input za backend
      const body = {
        supplier: payload.supplier ?? "",
        plate: payload.plate ?? "",
        type: (payload.type as any) ?? "truck",
        carrier: payload.carrier ?? undefined,
        note: payload.note ?? undefined,
        status: (payload.status as any) ?? "announced",
      };
      await api.createArrival(body as any);
      setOpenCreate(false);
      toast({ title: "Kreirano", description: "Novi dolazak je dodat." });
      await load();
    } catch (e) {
      const { message, status } = parseError(e);
      toast({
        title: "Greška",
        description:
          status === 401 || status === 403
            ? "Niste prijavljeni ili nemate dozvolu."
            : message ?? "Kreiranje nije uspjelo.",
        variant: "destructive",
      });
      if (status === 401) {
        localStorage.removeItem("token");
        window.location.assign("/login");
      }
    } finally {
      setCreating(false);
    }
  };

  // EDIT (PATCH)
  const handleEdit = async (patch: Partial<Arrival>) => {
    if (!editItem?.id) return;
    setSavingEdit(true);
    try {
      await api.updateArrival(editItem.id as ID, patch);
      setEditItem(null);
      toast({
        title: "Sačuvano",
        description: `Dolazak #${editItem.id} je ažuriran.`,
      });
      await load();
    } catch (e) {
      const { message, status } = parseError(e);
      toast({
        title: "Greška",
        description:
          status === 401 || status === 403
            ? "Niste prijavljeni ili nemate dozvolu."
            : message ?? "Ažuriranje nije uspjelo.",
        variant: "destructive",
      });
      if (status === 401) {
        localStorage.removeItem("token");
        window.location.assign("/login");
      }
    } finally {
      setSavingEdit(false);
    }
  };

  // DELETE
  const confirmDelete = async () => {
    if (!toDelete?.id) return;
    setDeleting(true);
    try {
      await api.deleteArrival(toDelete.id as ID);
      toast({
        title: "Obrisano",
        description: `Dolazak #${toDelete.id} je obrisan.`,
      });
      setToDelete(null);
      await load();
    } catch (e) {
      const { message, status } = parseError(e);
      const desc =
        status === 401 || status === 403
          ? "Niste prijavljeni ili nemate dozvolu."
          : status === 405
          ? "Server ne dozvoljava DELETE. Pokušajte kasnije ili kontaktirajte IT."
          : message ?? "Brisanje nije uspjelo.";
      toast({ title: "Greška", description: desc, variant: "destructive" });
      if (status === 401) {
        localStorage.removeItem("token");
        window.location.assign("/login");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Dolazci</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="px-4 py-2"
            onClick={load}
            disabled={loading}
            title="Osvježi listu"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Osvježi
          </Button>
          <Button
            variant="default"
            className="px-6 py-2"
            onClick={() => setOpenCreate(true)}
            disabled={creating || !token}
            title={!token ? "Prijavite se da dodate dolazak" : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            Dodaj dolazak
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">Dobavljač</th>
              <th className="text-left p-3">Prevoznik</th>
              <th className="text-left p-3">Tablice</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr
                key={a.id}
                className="border-b last:border-0 hover:bg-gray-100 transition-colors"
              >
                <td className="p-3">{a.supplier}</td>
                <td className="p-3">{a.carrier}</td>
                <td className="p-3">{a.plate}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="hover:bg-gray-100"
                      onClick={() => setEditItem(a)}
                      disabled={!token}
                      title={!token ? "Prijavite se da uredite" : undefined}
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Uredi
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="hover:bg-red-600"
                      onClick={() => setToDelete(a)}
                      disabled={!token || (deleting && toDelete?.id === a.id)}
                      title={!token ? "Prijavite se da obrišete" : undefined}
                    >
                      <Trash className="h-4 w-4 mr-1" />
                      {deleting && toDelete?.id === a.id
                        ? "Brisanje..."
                        : "Obriši"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="hover:bg-gray-100"
                      onClick={() => alert(JSON.stringify(a, null, 2))}
                    >
                      <Eye className="h-4 w-4 mr-1" /> Pregledaj
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

            {loading && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  Učitavanje...
                </td>
              </tr>
            )}

            {!loading && items.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                  Nema podataka.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create */}
      <ArrivalFormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onSubmit={handleCreate}
        submitting={creating}
        title="Novi dolazak"
      />

      {/* Edit */}
      <ArrivalFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        initial={editItem ?? {}}
        onSubmit={handleEdit}
        submitting={savingEdit}
        title={`Uredi dolazak #${editItem?.id ?? ""}`}
      />

      {/* Delete confirm */}
      <Dialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obriši dolazak?</DialogTitle>
            <DialogDescription>
              Ova akcija je trajna. Obriši #{toDelete?.id}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Odustani
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Brisanje..." : "Da, obriši"}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}