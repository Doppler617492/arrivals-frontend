import React from "react";
import { apiGET, apiPOST, API_BASE } from "../../api/client";

export default function GeneralSettings() {
  const [companyName, setCompanyName] = React.useState("");
  const [language, setLanguage] = React.useState("sr");
  const [timezone, setTimezone] = React.useState("Europe/Podgorica");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await apiGET("/settings/general");
        if (!isMounted) return;
        setCompanyName(data?.company_name ?? "");
        setLanguage(data?.language ?? "sr");
        setTimezone(data?.timezone ?? "Europe/Podgorica");
      } catch (e: any) {
        if (!isMounted) return;
        // Tihi fallback – ne blokiraj UI
        setErr("Ne mogu da učitam opšte postavke.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Prikaži preview za logo
  React.useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      // 1) tekstualne postavke
      await apiPOST("/settings/general", {
        company_name: companyName?.trim() || null,
        language,
        timezone,
      });

      // 2) logo upload (FormData – bez Content-Type zaglavlja)
      if (logoFile) {
        const form = new FormData();
        form.append("file", logoFile);
        const res = await fetch(`${API_BASE}/settings/logo`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Upload logotipa nije uspeo");
        }
      }

      setMsg("Sačuvano.");
    } catch (e: any) {
      setErr(e?.message || "Greška pri čuvanju.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-24 rounded bg-gray-100" />
          <div className="h-24 rounded bg-gray-100" />
          <div className="h-24 rounded bg-gray-100" />
          <div className="h-24 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <header className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Opšte postavke</h2>
        <p className="text-sm text-gray-600">Naziv kompanije, logo, jezik i vremenska zona.</p>
      </header>

      {err && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800">Naziv kompanije</label>
          <input
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="npr. Arrivals d.o.o."
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800">Logo</label>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
            />
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-10 w-10 rounded-md border border-gray-200 object-contain"
              />
            )}
          </div>
          <p className="text-xs text-gray-500">PNG/SVG, preporučeno do 512×512px</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800">Jezik</label>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="sr">Srpski / BHS</option>
            <option value="en">English</option>
            <option value="hr">Hrvatski</option>
            <option value="me">Crnogorski</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800">Vremenska zona</label>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="Europe/Podgorica">Europe/Podgorica</option>
            <option value="Europe/Belgrade">Europe/Belgrade</option>
            <option value="Europe/Zagreb">Europe/Zagreb</option>
            <option value="Europe/Sarajevo">Europe/Sarajevo</option>
          </select>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setCompanyName("");
            setLanguage("sr");
            setTimezone("Europe/Podgorica");
            setLogoFile(null);
            setLogoPreview(null);
            setMsg(null);
            setErr(null);
          }}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Reset
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Čuvam…" : "Sačuvaj"}
        </button>
      </div>
    </div>
  );
}