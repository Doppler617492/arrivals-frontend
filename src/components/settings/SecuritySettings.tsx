import * as React from "react";

/**
 * SecuritySettings
 * - Change password (no 2FA as requested)
 * - Active sessions list (logout single / logout all)
 *
 * Notes:
 * - Endpoints are placeholders; adapt to your backend if needed:
 *   - GET    /api/security/sessions
 *   - POST   /api/security/change-password   { currentPassword, newPassword }
 *   - POST   /api/security/sessions/logout-all
 *   - POST   /api/security/sessions/:id/logout
 * - Uses `localStorage.getItem("token")` for Authorization if present.
 */

type Session = {
  id: string;
  device?: string;
  ip?: string;
  lastActive?: string; // ISO
  current?: boolean;
};

type ApiError = { message: string };

const buildHeaders = (json: boolean = true): HeadersInit => {
  const token = localStorage.getItem("token");
  const base: Record<string, string> = {
    Accept: "application/json",
  };
  if (json) base["Content-Type"] = "application/json";
  if (token) base["Authorization"] = `Bearer ${token}`;
  return base;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

export default function SecuritySettings() {
  // ----- Change password form state -----
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pwLoading, setPwLoading] = React.useState(false);
  const [pwSuccess, setPwSuccess] = React.useState<string | null>(null);
  const [pwError, setPwError] = React.useState<string | null>(null);

  // ----- Sessions state -----
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [sessLoading, setSessLoading] = React.useState(false);
  const [sessError, setSessError] = React.useState<string | null>(null);
  const [logoutAllLoading, setLogoutAllLoading] = React.useState(false);

  // Fetch sessions on mount
  React.useEffect(() => {
    let ignore = false;
    const load = async () => {
      setSessLoading(true);
      setSessError(null);
      try {
        const res = await fetch("/api/security/sessions", {
          method: "GET",
          headers: buildHeaders(false),
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data: Session[] = await res.json();
        if (!ignore) setSessions(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!ignore) setSessError(e?.message ?? "Greška pri učitavanju sesija.");
      } finally {
        if (!ignore) setSessLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, []);

  // ----- Handlers -----
  const validatePasswordForm = (): string | null => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return "Popunite sva polja.";
    }
    if (newPassword.length < 8) {
      return "Nova lozinka mora imati najmanje 8 karaktera.";
    }
    if (newPassword === currentPassword) {
      return "Nova lozinka ne može biti ista kao trenutna.";
    }
    if (newPassword !== confirmPassword) {
      return "Potvrda lozinke se ne poklapa.";
    }
    return null;
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccess(null);
    const v = validatePasswordForm();
    if (v) {
      setPwError(v);
      return;
    }
    setPwError(null);
    setPwLoading(true);
    try {
      const res = await fetch("/api/security/change-password", {
        method: "POST",
        headers: buildHeaders(true),
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const err = (await res.json()) as ApiError;
          if (err?.message) msg = err.message;
        } catch {}
        throw new Error(msg);
      }
      setPwSuccess("Lozinka uspešno promenjena.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setPwError(e?.message ?? "Neuspešna promena lozinke.");
    } finally {
      setPwLoading(false);
    }
  };

  const logoutAll = async () => {
    setLogoutAllLoading(true);
    try {
      const res = await fetch("/api/security/sessions/logout-all", {
        method: "POST",
        headers: buildHeaders(true),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      // Optimistički: obriši sve osim trenutne (ako backend tako radi),
      // ali najčešće će i trenutna biti važna—ovde ćemo sve obrisati.
      setSessions([]);
    } catch (e: any) {
      setSessError(e?.message ?? "Neuspešno odjavljivanje sa svih sesija.");
    } finally {
      setLogoutAllLoading(false);
    }
  };

  const logoutOne = async (id: string) => {
    // Optimistički update
    const prev = sessions;
    setSessions((s) => s.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/security/sessions/${encodeURIComponent(id)}/logout`, {
        method: "POST",
        headers: buildHeaders(true),
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (e) {
      // Revert on failure
      setSessions(prev);
      setSessError("Neuspešno odjavljivanje te sesije.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Section: Change Password */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Promena lozinke</h2>
          <p className="text-sm text-slate-500 mt-1">
            Iz bezbednosnih razloga, koristite jaku lozinku koju ne koristite na drugim sajtovima.
          </p>
        </div>

        <form onSubmit={onChangePassword} className="p-5 grid gap-4 md:grid-cols-2">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Trenutna lozinka</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Nova lozinka</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="mt-1 text-xs text-slate-500">Najmanje 8 karaktera.</p>
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Potvrda nove lozinke</label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="col-span-2">
            {pwError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
                {pwError}
              </div>
            )}
            {pwSuccess && (
              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm">
                {pwSuccess}
              </div>
            )}
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              disabled={pwLoading}
            >
              {pwLoading ? "Čuvam..." : "Sačuvaj novu lozinku"}
            </button>
          </div>
        </form>
      </section>

      {/* Section: Active Sessions */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Aktivne sesije</h2>
            <p className="text-sm text-slate-500 mt-1">
              Odjavite uređaje koje ne prepoznajete. Trenutnu sesiju nije moguće ručno odjaviti.
            </p>
          </div>
          <button
            onClick={logoutAll}
            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            disabled={logoutAllLoading || sessions.length === 0}
          >
            {logoutAllLoading ? "Odjavljujem..." : "Odjavi sve"}
          </button>
        </div>

        <div className="p-5">
          {sessError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {sessError}
            </div>
          )}

          {sessLoading ? (
            <div className="text-sm text-slate-500">Učitavam sesije...</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-slate-500">Nema aktivnih sesija.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {sessions.map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {s.device || "Nepoznat uređaj"} {s.current ? <span className="text-xs text-blue-600">(trenutna)</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      IP: {s.ip || "—"} • Poslednja aktivnost: {formatDateTime(s.lastActive)}
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() => logoutOne(s.id)}
                      className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!!s.current}
                      aria-disabled={!!s.current}
                    >
                      Odjavi
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
