import React from "react";

// Placeholder UI for future integrations. Safe to render even if backend endpoints don't exist yet.
// Uses local state only and optimistic UI; network calls are wrapped in try/catch.

type ServiceKey = "googleCalendar" | "slack" | "webhook" | "smtp" | "apiKeys";

interface IntegrationState {
  connected: boolean;
  details?: Record<string, string>;
}

const cardCls =
  "bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3";
const rowCls = "flex items-center justify-between gap-2";
const labelCls = "text-sm font-medium text-gray-700";
const helpCls = "text-xs text-gray-500";
const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";
const badge = (text: string, color: string) => (
  <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
    {text}
  </span>
);

function useAuthHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return headers;
}

export default function IntegrationsSettings() {
  const headers = useAuthHeaders();
  const [busy, setBusy] = React.useState<Partial<Record<ServiceKey, boolean>>>({});
  const [state, setState] = React.useState<Record<ServiceKey, IntegrationState>>({
    googleCalendar: { connected: false },
    slack: { connected: false },
    webhook: { connected: false, details: { url: "" } },
    smtp: {
      connected: false,
      details: { host: "", port: "587", user: "", from: "" },
    },
    apiKeys: { connected: false, details: { publicKey: "", createdAt: "" } },
  });

  // ---- Handlers (optimistic placeholders) ----
  const connect = async (service: ServiceKey) => {
    setBusy((b) => ({ ...b, [service]: true }));
    try {
      // Placeholder POST; backend may not exist yet.
      await fetch(`/api/integrations/${service}/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }).catch(() => undefined);
      setState((s) => ({ ...s, [service]: { ...s[service], connected: true } }));
    } finally {
      setBusy((b) => ({ ...b, [service]: false }));
    }
  };

  const disconnect = async (service: ServiceKey) => {
    setBusy((b) => ({ ...b, [service]: true }));
    try {
      await fetch(`/api/integrations/${service}/disconnect`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      }).catch(() => undefined);
      setState((s) => ({ ...s, [service]: { ...s[service], connected: false } }));
    } finally {
      setBusy((b) => ({ ...b, [service]: false }));
    }
  };

  const saveWebhook = async () => {
    setBusy((b) => ({ ...b, webhook: true }));
    try {
      await fetch(`/api/integrations/webhook`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ url: state.webhook.details?.url || "" }),
      }).catch(() => undefined);
    } finally {
      setBusy((b) => ({ ...b, webhook: false }));
    }
  };

  const saveSmtp = async () => {
    setBusy((b) => ({ ...b, smtp: true }));
    try {
      await fetch(`/api/integrations/smtp`, {
        method: "PUT",
        headers,
        body: JSON.stringify(state.smtp.details || {}),
      }).catch(() => undefined);
    } finally {
      setBusy((b) => ({ ...b, smtp: false }));
    }
  };

  const createApiKey = async () => {
    setBusy((b) => ({ ...b, apiKeys: true }));
    try {
      const res = await fetch(`/api/integrations/api-keys`, {
        method: "POST",
        headers,
      }).catch(() => undefined);

      // Pre-calculate response text BEFORE setState (cannot use await inside setState)
      const now = new Date().toISOString();
      let publicKeyText = "";
      try {
        if (res) {
          publicKeyText = await res.text();
        }
      } catch {
        publicKeyText = "";
      }
      if (!publicKeyText) {
        publicKeyText = `dev_pk_${Math.random().toString(36).slice(2, 10)}`;
      }

      setState((s) => ({
        ...s,
        apiKeys: {
          connected: true,
          details: {
            publicKey: publicKeyText,
            createdAt: now,
          },
        },
      }));
    } finally {
      setBusy((b) => ({ ...b, apiKeys: false }));
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Integracije</h1>
      <p className="mb-6 text-sm text-gray-600">
        Povežite Arrivals sa omiljenim servisima. Sve stavke su sigurni placeholderi –
        možete ih uključiti sada, a pravi backend dodati kasnije.
      </p>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Google Calendar */}
        <section className={cardCls}>
          <div className={rowCls}>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Google Calendar</h2>
              <p className={helpCls}>Sync ETA događaje u kalendar.</p>
            </div>
            <div>
              {state.googleCalendar.connected
                ? badge("Povezano", "bg-green-100 text-green-700")
                : badge("Uskoro", "bg-gray-100 text-gray-700")}
            </div>
          </div>
          <div className={rowCls}>
            {state.googleCalendar.connected ? (
              <button
                className={btnGhost}
                disabled={!!busy.googleCalendar}
                onClick={() => disconnect("googleCalendar")}
              >
                Prekini vezu
              </button>
            ) : (
              <button
                className={btnPrimary}
                disabled={!!busy.googleCalendar}
                onClick={() => connect("googleCalendar")}
              >
                Poveži
              </button>
            )}
          </div>
        </section>

        {/* Slack */}
        <section className={cardCls}>
          <div className={rowCls}>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Slack</h2>
              <p className={helpCls}>Šalji obavještenja u kanale.</p>
            </div>
            <div>
              {state.slack.connected
                ? badge("Povezano", "bg-green-100 text-green-700")
                : badge("Uskoro", "bg-gray-100 text-gray-700")}
            </div>
          </div>
          <div className={rowCls}>
            {state.slack.connected ? (
              <button
                className={btnGhost}
                disabled={!!busy.slack}
                onClick={() => disconnect("slack")}
              >
                Prekini vezu
              </button>
            ) : (
              <button
                className={btnPrimary}
                disabled={!!busy.slack}
                onClick={() => connect("slack")}
              >
                Poveži
              </button>
            )}
          </div>
        </section>

        {/* Webhook */}
        <section className={cardCls}>
          <div className="flex flex-col gap-2">
            <div className={rowCls}>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Webhook</h2>
                <p className={helpCls}>Pozovi URL na promjenu statusa.</p>
              </div>
              <div>
                {state.webhook.connected
                  ? badge("Aktivno", "bg-green-100 text-green-700")
                  : badge("Isključeno", "bg-gray-100 text-gray-700")}
              </div>
            </div>
            <label className={labelCls} htmlFor="webhook-url">
              Endpoint URL
            </label>
            <input
              id="webhook-url"
              className={inputCls}
              placeholder="https://example.com/arrivals/webhook"
              value={state.webhook.details?.url || ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  webhook: {
                    ...s.webhook,
                    details: { ...(s.webhook.details || {}), url: e.target.value },
                  },
                }))
              }
            />
            <div className={rowCls}>
              <button
                className={btnPrimary}
                onClick={saveWebhook}
                disabled={!!busy.webhook}
              >
                Sačuvaj
              </button>
              {state.webhook.connected ? (
                <button
                  className={btnGhost}
                  onClick={() => disconnect("webhook")}
                  disabled={!!busy.webhook}
                >
                  Onemogući
                </button>
              ) : (
                <button
                  className={btnGhost}
                  onClick={() => connect("webhook")}
                  disabled={!!busy.webhook}
                >
                  Omogući
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Email (SMTP) */}
        <section className={cardCls}>
          <div className="flex flex-col gap-2">
            <div className={rowCls}>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Email (SMTP)</h2>
                <p className={helpCls}>Pošalji obavještenja e‑poštom.</p>
              </div>
              <div>
                {state.smtp.connected
                  ? badge("Povezano", "bg-green-100 text-green-700")
                  : badge("Podešavanje", "bg-gray-100 text-gray-700")}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelCls}>Host</label>
                <input
                  className={inputCls}
                  placeholder="smtp.yourdomain.com"
                  value={state.smtp.details?.host || ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      smtp: {
                        ...s.smtp,
                        details: { ...(s.smtp.details || {}), host: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Port</label>
                <input
                  className={inputCls}
                  placeholder="587"
                  value={state.smtp.details?.port || ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      smtp: {
                        ...s.smtp,
                        details: { ...(s.smtp.details || {}), port: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>Korisničko ime</label>
                <input
                  className={inputCls}
                  placeholder="no-reply@yourdomain.com"
                  value={state.smtp.details?.user || ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      smtp: {
                        ...s.smtp,
                        details: { ...(s.smtp.details || {}), user: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelCls}>From adresa</label>
                <input
                  className={inputCls}
                  placeholder="Arrivals <no-reply@yourdomain.com>"
                  value={state.smtp.details?.from || ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      smtp: {
                        ...s.smtp,
                        details: { ...(s.smtp.details || {}), from: e.target.value },
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div className={rowCls}>
              <button className={btnPrimary} onClick={saveSmtp} disabled={!!busy.smtp}>
                Sačuvaj
              </button>
              {state.smtp.connected ? (
                <button
                  className={btnGhost}
                  onClick={() => disconnect("smtp")}
                  disabled={!!busy.smtp}
                >
                  Prekini vezu
                </button>
              ) : (
                <button
                  className={btnGhost}
                  onClick={() => connect("smtp")}
                  disabled={!!busy.smtp}
                >
                  Poveži
                </button>
              )}
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section className={cardCls}>
          <div className="flex flex-col gap-2">
            <div className={rowCls}>
              <div>
                <h2 className="text-base font-semibold text-gray-900">API ključevi</h2>
                <p className={helpCls}>Programski pristup podacima (read‑only u startu).</p>
              </div>
              <div>
                {state.apiKeys.connected
                  ? badge("Generisano", "bg-green-100 text-green-700")
                  : badge("Uskoro", "bg-gray-100 text-gray-700")}
              </div>
            </div>
            {state.apiKeys.details?.publicKey ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Public key</div>
                <div className="truncate font-mono text-sm text-gray-900">
                  {state.apiKeys.details.publicKey}
                </div>
                {state.apiKeys.details.createdAt && (
                  <div className="mt-1 text-xs text-gray-500">
                    Kreirano: {new Date(state.apiKeys.details.createdAt).toLocaleString()}
                  </div>
                )}
              </div>
            ) : null}
            <div className={rowCls}>
              <button
                className={btnPrimary}
                onClick={createApiKey}
                disabled={!!busy.apiKeys}
              >
                Kreiraj API ključ
              </button>
              {state.apiKeys.connected && (
                <button
                  className={btnGhost}
                  onClick={() => disconnect("apiKeys")}
                  disabled={!!busy.apiKeys}
                >
                  Onemogući
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
