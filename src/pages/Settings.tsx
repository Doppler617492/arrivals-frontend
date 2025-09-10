import React from "react";
import GeneralSettings from "../components/settings/GeneralSettings";
import UsersSettings from "../components/settings/UsersSettings";
import RolesSettings from "../components/settings/RolesSettings";
import NotificationsSettings from "../components/settings/NotificationsSettings";
import IntegrationsSettings from "../components/settings/IntegrationsSettings";
import SecuritySettings from "../components/settings/SecuritySettings";
import ProfileSettings from "../components/settings/ProfileSettings";

// Tip sekcija i definicija
export type SectionKey =
  | "general"
  | "users"
  | "roles"
  | "notifications"
  | "integrations"
  | "security"
  | "profile";

// Ikone (inline SVG) za navigaciju
type IconType = React.FC<React.SVGProps<SVGSVGElement>>;

const ShieldIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const UserIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const UsersIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const LockIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const BellIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const IntegrationIcon: IconType = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 20.5c.5-.5.8-1.2.8-2s-.3-1.5-.8-2" />
    <path d="M14 20.5c-.5-.5-.8-1.2-.8-2s.3-1.5.8-2" />
    <path d="M2.5 14a2.5 2.5 0 0 1 0-5 .5.5 0 0 0 0-1 .5.5 0 0 0 0-1 2.5 2.5 0 0 1 0-5" />
    <path d="M21.5 14a2.5 2.5 0 0 0 0-5 .5.5 0 0 1 0-1 .5.5 0 0 1 0-1 2.5 2.5 0 0 0 0-5" />
    <path d="M3.5 12h17" />
    <path d="M16.5 4.5c.5.5.8 1.2.8 2s-.3 1.5-.8 2" />
    <path d="M7.5 4.5c-.5.5-.8 1.2-.8 2s.3 1.5.8 2" />
  </svg>
);

const SECTIONS: { key: SectionKey; label: string; icon: IconType }[] = [
  { key: "general", label: "Opšte", icon: ShieldIcon },
  { key: "profile", label: "Profil", icon: UserIcon },
  { key: "users", label: "Korisnici", icon: UsersIcon },
  { key: "roles", label: "Uloge", icon: ShieldIcon },
  { key: "security", label: "Sigurnost", icon: LockIcon },
  { key: "notifications", label: "Notifikacije", icon: BellIcon },
  { key: "integrations", label: "Integracije", icon: IntegrationIcon },
];

function isSectionKey(x: string | null): x is SectionKey {
  return !!x && (SECTIONS as { key: string }[]).some((s) => s.key === x);
}

// Upravljanje stanjem sekcije (query param, hash, localStorage)
function useSectionState() {
  const getInitial = (): SectionKey => {
    const params = new URLSearchParams(window.location.search);
    const qp = params.get("section");
    if (isSectionKey(qp)) return qp;

    const h = window.location.hash.replace(/^#/, "");
    if (isSectionKey(h)) return h;

    const ls = localStorage.getItem("settings:section");
    if (isSectionKey(ls)) return ls as SectionKey;

    return "general";
  };

  const [current, setCurrent] = React.useState<SectionKey>(getInitial);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("section", current);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
    localStorage.setItem("settings:section", current);
  }, [current]);

  return { current, setCurrent };
}

export default function SettingsPage() {
  const { current, setCurrent } = useSectionState();

  const currentMeta = React.useMemo(
    () => SECTIONS.find((s) => s.key === current),
    [current]
  );

  const SECTION_DESCRIPTIONS: Record<SectionKey, string> = {
    general: "Osnovne sistemske postavke: naziv kompanije, logo, jezik i vremenska zona.",
    users: "Upravljanje korisnicima: dodavanje, izmjena uloga i statusa.",
    roles: "Definišite granularne dozvole i kreirajte prilagođene uloge.",
    notifications: "Podesite globalna i korisnička obavještenja.",
    integrations: "Povežite se sa eksternim servisima (Google, Slack, e‑mail…).",
    security: "Upravljajte sigurnosnim postavkama, lozinkama i sesijama.",
    profile: "Ažurirajte lične podatke i preferencije naloga.",
  };

  const renderSection = () => {
    switch (current) {
      case "general":
        return <GeneralSettings />;
      case "users":
        return <UsersSettings />;
      case "roles":
        return <RolesSettings />;
      case "notifications":
        return <NotificationsSettings />;
      case "integrations":
        return <IntegrationsSettings />;
      case "security":
        return <SecuritySettings />;
      case "profile":
        return <ProfileSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-64px)] w-full bg-gray-100 font-sans">
      {/* Levi sidebar za navigaciju */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white p-4 lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
            {/* Logo placeholder */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-800">Postavke</h1>
        </div>
        <nav className="flex-grow">
          <ul className="space-y-1">
            {SECTIONS.map((section) => {
              const isActive = current === section.key;
              const Icon = section.icon;
              return (
                <li key={section.key}>
                  <button
                    onClick={() => setCurrent(section.key)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-gray-500"}`} />
                    <span>{section.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Glavni sadržaj */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <main className="flex-1 p-4 sm:p-6 lg:p-10">
          {/* Mobilni select meni */}
          <div className="lg:hidden mb-6">
            <label htmlFor="settings-section-mobile" className="sr-only">Sekcija</label>
            <select
              id="settings-section-mobile"
              value={current}
              onChange={(e) => setCurrent(e.target.value as SectionKey)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Zaglavlje trenutne sekcije */}
          {currentMeta && (
            <header className="mb-6 lg:mb-8">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">{currentMeta.label}</h2>
              <p className="mt-1.5 text-sm lg:text-base text-gray-600">
                {SECTION_DESCRIPTIONS[currentMeta.key]}
              </p>
            </header>
          )}

          {/* Dinamički sadržaj sekcije */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}