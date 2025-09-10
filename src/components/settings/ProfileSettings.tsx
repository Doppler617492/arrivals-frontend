import * as React from "react";

type Profile = {
  fullName: string;
  email: string;
  phone?: string;
};

type NotifPrefs = {
  statusChanges: boolean;
  overdueAlerts: boolean;
  weeklyDigest: boolean;
};

type ApiResult<T> = { ok: boolean; data?: T; error?: string };

function buildHeaders(json = true): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const base: Record<string, string> = {};
  if (json) base["Content-Type"] = "application/json";
  base["Accept"] = "application/json";
  if (token) base["Authorization"] = `Bearer ${token}`;
  return base;
}

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { headers: buildHeaders(false), credentials: "include" as RequestCredentials });
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

async function apiPatch<T>(url: string, body: any): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: buildHeaders(true),
      credentials: "include" as RequestCredentials,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: txt || `${res.status} ${res.statusText}` };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

async function apiPost<T>(url: string, body: any): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(true),
      credentials: "include" as RequestCredentials,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: txt || `${res.status} ${res.statusText}` };
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

function SectionCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base md:text-lg font-semibold text-gray-900">{title}</h3>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function ProfileSettings() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [profile, setProfile] = React.useState<Profile>({ fullName: "", email: "", phone: "" });
  const [notifs, setNotifs] = React.useState<NotifPrefs>({
    statusChanges: true,
    overdueAlerts: true,
    weeklyDigest: false,
  });

  // Password form
  const [currentPw, setCurrentPw] = React.useState("");
  const [newPw, setNewPw] = React.useState("");
  const [confirmPw, setConfirmPw] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      // Load profile
      const p = await apiGet<Profile>("/api/profile/me");
      // Load notifications
      const n = await apiGet<NotifPrefs>("/api/profile/notifications");
      if (!mounted) return;
      if (p.ok && p.data) setProfile({ fullName: p.data.fullName || "", email: p.data.email || "", phone: p.data.phone || "" });
      if (n.ok && n.data) setNotifs(n.data);
      if (!p.ok) setError(p.error || "Ne mogu učitati profil.");
      if (!n.ok && !p.ok) setError((p.error ? p.error + " • " : "") + (n.error || ""));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function toast(msg: string, isError = false) {
    setMessage(isError ? null : msg);
    setError(isError ? msg : null);
    window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 3500);
  }

  async function handleSaveProfile() {
    setSaving(true);
    const r = await apiPatch<Profile>("/api/profile", profile);
    setSaving(false);
    if (!r.ok) return toast(r.error || "Greška pri snimanju profila.", true);
    toast("Profil sačuvan.");
  }

  async function handleChangePassword() {
    setError(null);
    if (newPw.length < 8) return toast("Nova lozinka mora imati bar 8 karaktera.", true);
    if (newPw !== confirmPw) return toast("Potvrda lozinke nije ista.", true);
    const r = await apiPost("/api/profile/change-password", { currentPassword: currentPw, newPassword: newPw });
    if (!r.ok) return toast(r.error || "Greška pri promjeni lozinke.", true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    toast("Lozinka promijenjena.");
  }

  async function handleSaveNotifs() {
    const r = await apiPatch("/api/profile/notifications", notifs);
    if (!r.ok) return toast(r.error || "Greška pri snimanju notifikacija.", true);
    toast("Postavke notifikacija sačuvane.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-14">
        <div className="animate-pulse text-gray-500">Učitavanje profila…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3">{message}</div>
      ) : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3">{error}</div> : null}

      {/* Basic info */}
      <SectionCard
        title="Osnovne informacije"
        actions={
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          >
            Sačuvaj
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Ime i prezime</label>
            <input
              type="text"
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
              placeholder="Unesite ime i prezime"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Email adresa</label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              placeholder="Unesite email"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Kontakt telefon</label>
            <input
              type="tel"
              value={profile.phone || ""}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              placeholder="Unesite kontakt telefon"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </SectionCard>

      {/* Password */}
      <SectionCard title="Promjena lozinke">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Trenutna lozinka</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Nova lozinka</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Min. 8 karaktera"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Potvrda lozinke</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Ponovite novu lozinku"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="pt-2">
          <button
            onClick={handleChangePassword}
            className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900/30"
          >
            Sačuvaj novu lozinku
          </button>
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard
        title="Notifikacije"
        actions={
          <button
            onClick={handleSaveNotifs}
            className="inline-flex items-center rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Sačuvaj
          </button>
        }
      >
        <div className="space-y-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={notifs.statusChanges}
              onChange={(e) => setNotifs((n) => ({ ...n, statusChanges: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">
              Pošiljka: promjene statusa (Najavljeno → U transportu, U transportu → Stiglo…)
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={notifs.overdueAlerts}
              onChange={(e) => setNotifs((n) => ({ ...n, overdueAlerts: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">Rokovi: upozorenja za zakašnjelo preuzimanje / dolazak (Pickup/ETA prošao)</span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={notifs.weeklyDigest}
              onChange={(e) => setNotifs((n) => ({ ...n, weeklyDigest: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">Sedmični sažetak (ponedjeljak ujutro)</span>
          </label>
        </div>
      </SectionCard>
    </div>
  );
}
