import * as React from "react";

type GlobalNotifications = {
  enabled: boolean;
  onNewArrival: boolean;
  onStatusChange: boolean;
  onPickupOverdue: boolean;
  pickupOverdueDays: number;
  onEtaOverdue: boolean;
  etaOverdueDays: number;
  dailyDigest: boolean;
  dailyDigestTime: string; // "08:00"
};

type UserNotifications = {
  email: boolean;
  inApp: boolean;
  sound: boolean;
  push?: boolean;
  muteUntil?: string | null; // ISO date or null
};

const defaultGlobal: GlobalNotifications = {
  enabled: true,
  onNewArrival: true,
  onStatusChange: true,
  onPickupOverdue: true,
  pickupOverdueDays: 0,
  onEtaOverdue: true,
  etaOverdueDays: 0,
  dailyDigest: false,
  dailyDigestTime: "08:00",
};

const defaultUser: UserNotifications = {
  email: true,
  inApp: true,
  sound: true,
  push: false,
  muteUntil: null,
};

function Switch({
  checked,
  onChange,
  id,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between py-3">
      <div className="pr-4">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {help ? (
          <p className="mt-1 text-xs text-muted-foreground">{help}</p>
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
          checked ? "bg-primary" : "bg-muted",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export default function NotificationsSettings() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [globalN, setGlobalN] = React.useState<GlobalNotifications>(defaultGlobal);
  const [userN, setUserN] = React.useState<UserNotifications>(defaultUser);

  // Load settings on mount
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [gRes, uRes] = await Promise.allSettled([
          fetch("/api/settings/notifications", { credentials: "include" }),
          fetch("/api/me/notifications", { credentials: "include" }),
        ]);

        if (alive) {
          if (gRes.status === "fulfilled" && gRes.value.ok) {
            const data = await gRes.value.json();
            setGlobalN({ ...defaultGlobal, ...data });
          }
          if (uRes.status === "fulfilled" && uRes.value.ok) {
            const data = await uRes.value.json();
            setUserN({ ...defaultUser, ...data });
          }
        }
      } catch {
        // silently keep defaults
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function resetAll() {
    setGlobalN(defaultGlobal);
    setUserN(defaultUser);
    setMessage(null);
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const [g, u] = await Promise.allSettled([
        fetch("/api/settings/notifications", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(globalN),
        }),
        fetch("/api/me/notifications", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify(userN),
        }),
      ]);

      const okG = g.status === "fulfilled" && g.value.ok;
      const okU = u.status === "fulfilled" && u.value.ok;

      if (okG && okU) {
        setMessage({ kind: "success", text: "Postavke su sačuvane." });
      } else {
        setMessage({
          kind: "error",
          text: "Nisu sve postavke sačuvane. Provjeri mrežu/ovlaštenje (CORS, 405).",
        });
      }
    } catch (e) {
      setMessage({
        kind: "error",
        text: "Greška pri snimanju postavki.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl rounded-lg bg-card p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">Učitavanje postavki…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Postavke notifikacija</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Podesi globalna pravila i lične preferencije za obavještenja.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              disabled={saving}
            >
              Reset
            </button>
            <button
              onClick={saveAll}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Čuvam…" : "Sačuvaj"}
            </button>
          </div>
        </header>

        {message && (
          <div
            className={[
              "rounded-md px-4 py-3 text-sm",
              message.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        )}

        {/* GLOBAL */}
        <section className="rounded-lg bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Globalna pravila</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pravila koja važe za cijeli sistem (svi korisnici).
          </p>

          <div className="mt-4 divide-y divide-border">
            <Switch
              id="g-enabled"
              checked={globalN.enabled}
              onChange={(v) => setGlobalN((s) => ({ ...s, enabled: v }))}
              label="Uključi notifikacije"
              help="Globalni prekidač za sve obavještenja."
            />
            <Switch
              id="g-new"
              checked={globalN.onNewArrival}
              onChange={(v) => setGlobalN((s) => ({ ...s, onNewArrival: v }))}
              label="Nova pošiljka"
              help="Kada se kreira nova kartica."
            />
            <Switch
              id="g-status"
              checked={globalN.onStatusChange}
              onChange={(v) => setGlobalN((s) => ({ ...s, onStatusChange: v }))}
              label="Promjena statusa"
              help="Obavijesti kad kartica promijeni kolonu."
            />
            <div className="py-3">
              <div className="flex items-start justify-between gap-6">
                <div className="pr-4">
                  <label className="block text-sm font-medium text-foreground">Rok za preuzimanje</label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ako je prošao Pickup Date, a status je još “Najavljeno”.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={globalN.onPickupOverdue}
                    onChange={(e) => setGlobalN((s) => ({ ...s, onPickupOverdue: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Kašnjenje (dana):</span>
                    <input
                      type="number"
                      min={0}
                      value={globalN.pickupOverdueDays}
                      onChange={(e) =>
                        setGlobalN((s) => ({ ...s, pickupOverdueDays: Number(e.target.value) || 0 }))
                      }
                      className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="py-3">
              <div className="flex items-start justify-between gap-6">
                <div className="pr-4">
                  <label className="block text-sm font-medium text-foreground">Rok za dolazak (ETA)</label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ako je prošao ETA, a status je još “U transportu”.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={globalN.onEtaOverdue}
                    onChange={(e) => setGlobalN((s) => ({ ...s, onEtaOverdue: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Kašnjenje (dana):</span>
                    <input
                      type="number"
                      min={0}
                      value={globalN.etaOverdueDays}
                      onChange={(e) =>
                        setGlobalN((s) => ({ ...s, etaOverdueDays: Number(e.target.value) || 0 }))
                      }
                      className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="py-3">
              <div className="flex items-start justify-between gap-6">
                <div className="pr-4">
                  <label className="block text-sm font-medium text-foreground">Dnevni digest</label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sažetak promjena jednom dnevno na email.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={globalN.dailyDigest}
                    onChange={(e) => setGlobalN((s) => ({ ...s, dailyDigest: e.target.checked }))}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="time"
                    value={globalN.dailyDigestTime}
                    onChange={(e) => setGlobalN((s) => ({ ...s, dailyDigestTime: e.target.value }))}
                    className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* USER */}
        <section className="rounded-lg bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground">Lične preferencije</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Podesi kako želiš da primaš obavještenja za svoj nalog.
          </p>

          <div className="mt-4 divide-y divide-border">
            <Switch
              id="u-email"
              checked={userN.email}
              onChange={(v) => setUserN((s) => ({ ...s, email: v }))}
              label="Email obavještenja"
            />
            <Switch
              id="u-inapp"
              checked={userN.inApp}
              onChange={(v) => setUserN((s) => ({ ...s, inApp: v }))}
              label="In‑app obavještenja"
            />
            <Switch
              id="u-sound"
              checked={userN.sound}
              onChange={(v) => setUserN((s) => ({ ...s, sound: v }))}
              label="Zvuk za in‑app"
              help="Diskretan zvuk kada stigne obavještenje."
            />
            <Switch
              id="u-push"
              checked={!!userN.push}
              onChange={(v) => setUserN((s) => ({ ...s, push: v }))}
              label="Push (browser / mobilni)"
              help="Zahtijeva dozvolu preglednika."
            />
            <div className="py-3">
              <div className="flex items-start justify-between gap-6">
                <div className="pr-4">
                  <label className="block text-sm font-medium text-foreground">Utišaj do datuma</label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Privremeno utišaj sva obavještenja do izabranog datuma.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={userN.muteUntil ?? ""}
                    onChange={(e) => setUserN((s) => ({ ...s, muteUntil: e.target.value || null }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                  />
                  {userN.muteUntil ? (
                    <button
                      type="button"
                      onClick={() => setUserN((s) => ({ ...s, muteUntil: null }))}
                      className="text-sm text-muted-foreground underline hover:text-foreground"
                    >
                      očisti
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Actions bottom (duplicate for easy access) */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={resetAll}
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            disabled={saving}
          >
            Reset
          </button>
          <button
            onClick={saveAll}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Čuvam…" : "Sačuvaj"}
          </button>
        </div>
      </div>
    </div>
  );
}
