// src/App.tsx
import React from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import LoginView from "./features/auth/LoginView";
import ArrivalsTable from "./components/ArrivalsTable";
import UsersPage from "./pages/UsersPage";
import ContainersPage from "./pages/Containers";
import { Button } from "@/components/ui/button";
import { apiGET, getToken, setToken } from "./api/client";
import type { User } from "./types";
import Sidebar from "./components/Sidebar";
import "./index.css";

type Tab = "arrivals" | "containers" | "users";

function Shell({ user }: { user: User }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  React.useEffect(() => {
    const cls = 'sidebar-collapsed';
    if (sidebarOpen) {
      document.body.classList.remove(cls);
    } else {
      document.body.classList.add(cls);
    }
    return () => {
      document.body.classList.remove(cls);
    };
  }, [sidebarOpen]);

  const pathToTab = (path: string): Tab => {
    if (path.startsWith("/containers")) return "containers";
    if (path.startsWith("/users")) return "users";
    return "arrivals";
  };
  const tabToPath = (tab: Tab) =>
    tab === "containers" ? "/containers" : tab === "users" ? "/users" : "/arrivals";

  const currentTab = pathToTab(location.pathname);

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[hsl(var(--foreground))]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-white/80 backdrop-blur">
        <div className="w-full px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="shrink-0"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Sakrij meni" : "Prikaži meni"}
            >
              {sidebarOpen ? "⟨⟨" : "⟩⟩"}
            </Button>
            <img src="/logo-cungu.png" alt="Cungu" className="w-7 h-7 rounded-md shadow" />
            <div className="font-extrabold tracking-tight">Arrivals</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline opacity-70">{user.name} • {user.role}</span>
            <Button variant="outline" onClick={() => { setToken(null); window.location.href = "/"; }}>
              Odjava
            </Button>
          </div>
        </div>
      </header>

      <div className="flex w-full">
        {/* Sidebar still works with current/setTab but behind the scenes we route */}
        {sidebarOpen && (
          <Sidebar
            current={currentTab}
            setTab={(t: Tab) => navigate(tabToPath(t))}
          />
        )}

        {/* Page container - full width, no side gaps; horizontal scroll allowed */}
        <main className="content-area p-3 md:p-4 lg:p-6 overflow-x-auto">
          <Routes>
            <Route
              path="/arrivals"
              element={
                <section className="w-full">
                  <h1 className="text-[18px] font-semibold mb-3">Dolasci</h1>
                  <ArrivalsTable />
                </section>
              }
            />
            <Route
              path="/containers"
              element={
                <section className="w-full">
                  <h1 className="text-[18px] font-semibold mb-3">Kontejneri</h1>
                  <ContainersPage />
                </section>
              }
            />
            <Route
              path="/users"
              element={
                <section className="w-full">
                  <h1 className="text-[18px] font-semibold mb-3">Korisnici</h1>
                  <UsersPage />
                </section>
              }
            />
            <Route index element={<Navigate to="/arrivals" replace />} />
            <Route path="*" element={<Navigate to="/arrivals" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
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
    return (
      <div className="min-h-screen grid place-items-center">
        <LoginView onLoggedIn={setUser} />
      </div>
    );
  }

  // Router is provided in main.tsx; just render the Shell here
  return (
    <Shell user={user} />
  );
}