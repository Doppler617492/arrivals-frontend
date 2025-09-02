// src/App.tsx
import React from "react";
import LoginView from "./features/auth/LoginView";
import ArrivalsTable from "./components/ArrivalsTable";
import UsersPage from "./pages/UsersPage";
import ContainersPage from "./pages/Containers";
import { apiGET, getToken, setToken } from "./api/client";
import type { User } from "./types";
import "./index.css";

type Tab = "arrivals" | "containers" | "users";

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [tab, setTab] = React.useState<Tab>("arrivals");
  const [loadingMe, setLoadingMe] = React.useState(true);

  React.useEffect(() => {
    const t = getToken();
    if (!t) { setLoadingMe(false); return; }
    (async () => {
      try {
        const me = await apiGET<{ user: User }>("/auth/me", true);
        setUser(me.user);
      } catch {
        setToken(null);
        setUser(null);
      } finally { setLoadingMe(false); }
    })();
  }, []);

  if (loadingMe) {
    return (
      <div className="min-h-screen grid place-items-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="animate-pulse text-sm opacity-70">Učitavanje…</div>
      </div>
    );
  }

  if (!user) {
    return <div className="min-h-screen grid place-items-center"><LoginView onLoggedIn={setUser} /></div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[hsl(var(--foreground))]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1200px] px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-cungu.png" alt="Cungu" className="w-7 h-7 rounded-md shadow" />
            <div className="font-extrabold tracking-tight">Arrivals</div>
            <nav className="ml-6 flex items-center gap-2 text-sm">
              <TabBtn current={tab} setTab={setTab} id="arrivals">Dolasci</TabBtn>
              <TabBtn current={tab} setTab={setTab} id="containers">Kontejneri</TabBtn>
              <TabBtn current={tab} setTab={setTab} id="users">Korisnici</TabBtn>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline opacity-70">{user.name} • {user.role}</span>
            <button
              className="btn small ghost"
              onClick={() => { setToken(null); setUser(null); }}
            >
              Odjava
            </button>
          </div>
        </div>
      </header>

      {/* Page container */}
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        {tab === "arrivals" && (
          <section className="card">
            <h1 className="text-[18px] font-semibold mb-3">Dolasci</h1>
            <ArrivalsTable />
          </section>
        )}
        {tab === "containers" && (
          <section className="card">
            <h1 className="text-[18px] font-semibold mb-3">Kontejneri</h1>
            <ContainersPage />
          </section>
        )}
        {tab === "users" && (
          <section className="card">
            <h1 className="text-[18px] font-semibold mb-3">Korisnici</h1>
            <UsersPage />
          </section>
        )}
      </main>
    </div>
  );
}

function TabBtn({
  id, current, setTab, children,
}: { id: Tab; current: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  const active = current === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={[
        "px-3 py-1.5 rounded-md transition",
        active
          ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] font-semibold shadow-sm"
          : "text-gray-600 hover:bg-gray-100"
      ].join(" ")}
    >
      {children}
    </button>
  );
}