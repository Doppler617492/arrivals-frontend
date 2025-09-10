import React from "react";
import { apiGET, apiPOST, apiPATCH, apiDELETE } from "../../api/client";

// -------------------- Types --------------------
type Role = "admin" | "employee";
type Status = "active" | "inactive";

type User = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  status: Status;
};

// -------------------- Component --------------------
export default function UsersSettings() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // UI state
  const [openAdd, setOpenAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState<Role>("employee");

  // Filters (client-side)
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | Status>("all");

  // Pagination (simple client-side)
  const [page, setPage] = React.useState(1);
  const pageSize = 10;

  // -------------------- Data fetching --------------------
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const data = await apiGET("/users");
        if (!alive) return;
        setUsers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Ne mogu učitati korisnike");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // -------------------- Derived data --------------------
  const filtered = React.useMemo(() => {
    let out = users;
    if (roleFilter !== "all") out = out.filter((u) => u.role === roleFilter);
    if (statusFilter !== "all") out = out.filter((u) => u.status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }
    return out;
  }, [users, roleFilter, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  React.useEffect(() => {
    // reset to first page when filters change
    setPage(1);
  }, [query, roleFilter, statusFilter]);

  // -------------------- Helpers --------------------
  const emailValid = (val: string) => /.+@.+\..+/.test(val);

  // -------------------- Actions --------------------
  const addUser = async () => {
    const payload = {
      full_name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
    };

    if (!payload.full_name) return alert("Ime je obavezno");
    if (!emailValid(payload.email)) return alert("Unesite važeću email adresu");

    try {
      const created: User = await apiPOST("/users", payload);
      setUsers((u) => [created, ...u]);
      setOpenAdd(false);
      setNewName("");
      setNewEmail("");
      setNewRole("employee");
    } catch (e: any) {
      alert(e?.message || "Greška pri kreiranju korisnika");
    }
  };

  const changeRole = async (id: string, role: Role) => {
    const prev = users;
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
    try {
      await apiPATCH(`/users/${id}`, { role });
    } catch (e: any) {
      alert(e?.message || "Greška pri izmjeni uloge");
      setUsers(prev); // rollback
    }
  };

  const toggleStatus = async (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const next: Status = user.status === "active" ? "inactive" : "active";
    const prev = users;
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, status: next } : x)));
    try {
      await apiPATCH(`/users/${id}`, { status: next });
    } catch (e: any) {
      alert(e?.message || "Greška pri izmjeni statusa");
      setUsers(prev); // rollback
    }
  };

  const removeUser = async (id: string) => {
    if (!confirm("Obriši korisnika?")) return;
    const prev = users;
    setUsers((u) => u.filter((x) => x.id !== id));
    try {
      await apiDELETE(`/users/${id}`);
    } catch (e: any) {
      alert(e?.message || "Greška pri brisanju");
      setUsers(prev); // rollback
    }
  };

  // -------------------- Render --------------------
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Upravljanje korisnicima</h2>
          <p className="text-sm text-gray-600">Dodavanje, izmjena uloga i statusa.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <input
              className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Pretraži ime ili email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
            >
              <option value="all">Sve uloge</option>
              <option value="employee">Zaposlenik</option>
              <option value="admin">Admin</option>
            </select>
            <select
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">Svi statusi</option>
              <option value="active">Aktivni</option>
              <option value="inactive">Neaktivni</option>
            </select>
          </div>
          <button
            onClick={() => setOpenAdd(true)}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 font-medium transition-colors"
          >
            + Dodaj korisnika
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-gray-600">Učitavam…</div>
      ) : err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Ime i prezime</th>
                <th className="text-left px-6 py-3 font-medium">Email</th>
                <th className="text-left px-6 py-3 font-medium">Uloga</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="text-right px-6 py-3 font-medium">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map((u, idx) => (
                <tr key={u.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-6 py-4">{u.full_name}</td>
                  <td className="px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    >
                      <option value="employee">Zaposlenik</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        u.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {u.status === "active" ? "Aktivan" : "Neaktivan"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button
                      onClick={() => toggleStatus(u.id)}
                      className="rounded-lg border border-gray-300 px-4 py-1 font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      {u.status === "active" ? "Deaktiviraj" : "Aktiviraj"}
                    </button>
                    <button
                      onClick={() => removeUser(u.id)}
                      className="rounded-lg border border-red-400 text-red-600 px-4 py-1 font-medium hover:bg-red-50 transition-colors"
                    >
                      Obriši
                    </button>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Nema korisnika za tražene filtere.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !err && filtered.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            Prikaz { (currentPage - 1) * pageSize + 1 }–{ Math.min(currentPage * pageSize, filtered.length) } od { filtered.length }
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-50"
            >
              Prethodna
            </button>
            <span>
              Strana {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-50"
            >
              Sljedeća
            </button>
          </div>
        </div>
      )}

      {/* Modal: dodaj korisnika */}
      {openAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Novi korisnik</h3>
              <button
                onClick={() => setOpenAdd(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
                aria-label="Zatvori"
              >
                ×
              </button>
            </div>

            <div className="space-y-5">
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ime i prezime"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Email adresa"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <select
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
              >
                <option value="employee">Zaposlenik</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="mt-8 flex justify-end gap-4">
              <button
                onClick={() => setOpenAdd(false)}
                className="rounded-lg border border-gray-300 px-5 py-2 font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Odustani
              </button>
              <button
                onClick={addUser}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 font-medium transition-colors"
              >
                Sačuvaj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}