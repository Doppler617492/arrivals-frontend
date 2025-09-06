import React, { useEffect, useMemo, useState } from 'react';
import { apiGET, apiPOST, apiPATCH, apiDELETE } from '../api/client';

// Roles aligned with backend + UI
export type Role = 'admin' | 'planer' | 'proizvodnja' | 'transport' | 'carina' | 'viewer';
export type User = { id: number; name: string; email: string; role: Role };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const emptyForm = useMemo(() => ({ name: '', email: '', role: 'planer' as Role, password: '' }), []);
  const [form, setForm] = useState<{ name: string; email: string; role: Role; password?: string }>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      // NOTE: backend exposes /users (no /api prefix)
      const data = await apiGET<User[]>('/users', true);
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || 'Greška pri učitavanju korisnika');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function onEdit(u: User) {
    setEditingId(u.id);
    setForm({ name: u.name, email: u.email, role: u.role, password: '' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      if (editingId) {
        const body: any = { name: form.name, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        await apiPATCH<User>(`/users/${editingId}`, body, true);
      } else {
        await apiPOST<User>('/users', form, { auth: true });
      }
      await loadUsers();
      resetForm();
      alert('Sačuvano.');
    } catch (e: any) {
      alert(`Greška: ${e.message || 'nepoznato'}`);
    }
  }

  async function onDelete(id: number) {
    if (!confirm('Obrisati korisnika?')) return;
    try {
      await apiDELETE<{ ok: boolean }>(`/users/${id}`, true);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (e: any) {
      alert(`Brisanje nije uspjelo: ${e.message || 'nepoznato'}`);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Korisnici</h1>
        <p className="opacity-80">Administracija korisnika i uloga.</p>
      </div>

      {/* LISTA */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="py-2 px-3">Ime</th>
              <th className="py-2 px-3">Email</th>
              <th className="py-2 px-3">Uloga</th>
              <th className="py-2 px-3 text-right">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="py-3 px-3" colSpan={4}>Učitavanje...</td>
              </tr>
            )}
            {error && !loading && (
              <tr>
                <td className="py-3 px-3 text-red-400" colSpan={4}>{error}</td>
              </tr>
            )}
            {!loading && !error && users.length === 0 && (
              <tr>
                <td className="py-3 px-3" colSpan={4}>Nema korisnika.</td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="border-t border-white/10">
                <td className="py-2 px-3">{u.name}</td>
                <td className="py-2 px-3">{u.email}</td>
                <td className="py-2 px-3">{u.role}</td>
                <td className="py-2 px-3 text-right space-x-2">
                  <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => onEdit(u)}>Uredi</button>
                  <button className="rounded bg-red-600/80 px-2 py-1 hover:bg-red-600" onClick={() => onDelete(u.id)}>Obriši</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FORMA */}
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{editingId ? 'Uredi korisnika' : 'Novi korisnik'}</h2>
          {editingId && (
            <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={resetForm}>
              Nova kreacija
            </button>
          )}
        </div>

        <label className="grid gap-1">
          <span className="text-sm opacity-80">Ime</span>
          <input
            className="rounded bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm opacity-80">Email</span>
          <input
            type="email"
            className="rounded bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm opacity-80">Uloga</span>
          <select
            className="rounded bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}
          >
            <option value="admin">admin</option>
            <option value="planer">planer</option>
            <option value="proizvodnja">proizvodnja</option>
            <option value="transport">transport</option>
            <option value="carina">carina</option>
            <option value="viewer">viewer</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-sm opacity-80">Lozinka {editingId ? '(ostavite prazno ako ne mijenjate)' : ''}</span>
          <input
            type="password"
            className="rounded bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-white/30"
            value={form.password || ''}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder={editingId ? 'Nova lozinka (opciono)' : 'Lozinka'}
            {...(editingId ? {} : { required: true })}
          />
        </label>

        <div className="pt-2">
          <button className="rounded bg-emerald-600 px-4 py-2 hover:bg-emerald-500" type="submit">
            {editingId ? 'Sačuvaj izmjene' : 'Kreiraj korisnika'}
          </button>
        </div>
      </form>
    </div>
  );
}