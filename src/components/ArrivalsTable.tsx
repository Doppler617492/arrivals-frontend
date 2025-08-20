import * as React from "react";
import { Plus, Trash, Pencil, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import DialogConfirm from "./DialogConfirm";
import ArrivalFormDialog from "./ArrivalFormDialog";
import { api } from "../lib/api";
import type { Arrival } from "../lib/api";
import { useToast } from "../lib/toast";

export default function ArrivalsTable() {
  const [items, setItems] = React.useState<Arrival[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Create
  const [openCreate, setOpenCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // Delete
  const [toDelete, setToDelete] = React.useState<Arrival | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // (Optional) Edit
  const [editItem, setEditItem] = React.useState<Arrival | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);

  // Auth token (if user is logged in)
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listArrivals();
      setItems(data);
    } catch (e: any) {
      toast({ title: "Greška", description: e?.message ?? "Neuspješno učitavanje.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  // CREATE handler
  const handleCreate = async (payload: Partial<Arrival>) => {
    setCreating(true);
    try {
      await api.createArrival(payload); // this should send X-API-Key (server-to-server style) or you can add an admin-only JWT route
      setOpenCreate(false);
      toast({ title: "Kreirano", description: "Novi dolazak je dodat." });
      await load();
    } catch (e: any) {
      toast({ title: "Greška", description: e?.message ?? "Kreiranje nije uspjelo", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // DELETE handler (JWT protected)
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteArrival(toDelete.id);
      toast({ title: "Obrisano", description: `Dolazak #${toDelete.id} je obrisan.` });
      setToDelete(null);
      await load();
    } catch (e: any) {
      const msg =
        (e?.status === 401 || e?.status === 403)
          ? "Niste prijavljeni ili nemate dozvolu."
          : (e?.status === 405)
          ? "Server ne dozvoljava DELETE (405). Provjerite backend rutu /api/arrivals/<id> [DELETE]."
          : (e?.message ?? "Brisanje nije uspjelo");
      toast({ title: "Greška", description: msg, variant: "destructive" });
      if (e?.status === 401) {
        localStorage.removeItem("token");
        // soft redirect
        window.location.assign("/login");
      }
    } finally {
      setDeleting(false);
    }
  };

  // (Optional) EDIT handler via PATCH (role-based)
  const handleEdit = async (payload: Partial<Arrival>) => {
    if (!editItem) return;
    setSavingEdit(true);
    try {
      await api.patchArrival(editItem.id, payload); // you already have role-based PATCH /status too
      setEditItem(null);
      toast({ title: "Sačuvano", description: `Dolazak #${editItem.id} ažuriran.` });
      await load();
    } catch (e: any) {
      toast({ title: "Greška", description: e?.message ?? "Ažuriranje nije uspjelo", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Dolazci</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="px-4 py-2" onClick={load} disabled={loading} title="Osvježi listu">
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

      {/* your table markup here; below is a sketch: */}
      <div className="rounded-xl border bg-white shadow-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 transition-colors">
              <th className="text-left p-3">Dobavljač</th>
              <th className="text-left p-3">Prevoznik</th>
              <th className="text-left p-3">Tablice</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b last:border-0 hover:bg-gray-100 transition-colors">
                <td className="p-3">{a.supplier}</td>
                <td className="p-3">{a.carrier}</td>
                <td className="p-3">{a.plate}</td>
                <td className="p-3">{a.status}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="transition-colors hover:bg-gray-100"
                      onClick={() => setEditItem(a)}
                      disabled={!token}
                      title={!token ? "Prijavite se da uredite" : undefined}
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Uredi
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="transition-colors hover:bg-red-600"
                      onClick={() => setToDelete(a)}
                      disabled={(!token) || (deleting && toDelete?.id === a.id)}
                      title={!token ? "Prijavite se da obrišete" : undefined}
                    >
                      <Trash className="h-4 w-4 mr-1" />
                      {deleting && toDelete?.id === a.id ? "Brisanje..." : "Obriši"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="transition-colors hover:bg-gray-100"
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

      {/* Create dialog */}
      <ArrivalFormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onSubmit={handleCreate}
        submitting={creating}
        title="Novi dolazak"
      />

      {/* Edit dialog */}
      <ArrivalFormDialog
        open={!!editItem}
        onOpenChange={(v) => !v && setEditItem(null)}
        initial={editItem ?? {}}
        onSubmit={handleEdit}
        submitting={savingEdit}
        title={`Uredi dolazak #${editItem?.id ?? ""}`}
      />

      {/* Delete confirm */}
      <DialogConfirm
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Obriši dolazak?"
        description={`Ova akcija je trajna. Obriši #${toDelete?.id}?`}
        confirmText="Da, obriši"
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </main>
  );
}