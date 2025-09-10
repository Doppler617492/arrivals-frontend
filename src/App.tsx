// src/App.tsx
import React from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import LoginView from "./features/auth/LoginView";
import RegisterView from "./features/auth/RegisterView";
import ArrivalsPage from "./pages/Arrivals";
import UsersPage from "./pages/UsersPage";
import ContainersPage from "./pages/Containers";
import SettingsPage from "./pages/Settings";
import { apiGET, getToken, setToken } from "./api/client";
import type { User } from "./types";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import "./index.css";

function Shell() {
  const [sidebarOpen] = React.useState(true);

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

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[hsl(var(--foreground))]">
      <Header />

      <div className="flex w-full">
        {/* Sidebar still works with current/setTab but behind the scenes we route */}
        {sidebarOpen && <Sidebar />}

        {/* Page container - full width, no side gaps; horizontal scroll allowed */}
        <main className="content-area p-3 md:p-4 lg:p-6 overflow-x-auto">
          <Routes>
            <Route path="/arrivals" element={<ArrivalsPage />} />
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
            <Route
              path="/settings"
              element={
                <section className="w-full">
                  <h1 className="text-[18px] font-semibold mb-3">Postavke</h1>
                  <SettingsPage />
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
  const location = useLocation();
  const navigate = useNavigate();
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
    // Neprijavljen korisnik: dozvoli /login i /register bez Header/Sidebar-a
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <div className="min-h-screen grid place-items-center bg-[#f1f5f9]">
              <LoginView onLoggedIn={setUser} />
            </div>
          }
        />
        <Route
          path="/register"
          element={
            <div className="min-h-screen grid place-items-center bg-[#f1f5f9]">
              <RegisterView onSubmitted={() => navigate("/login?requested=1")} />
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Ako je korisnik prijavljen a ruta je /login ili /register, prebaci na /arrivals
  if (location.pathname === "/login" || location.pathname === "/register") {
    return <Navigate to="/arrivals" replace />;
  }
  // Router is provided in main.tsx; just render the Shell here
  return <Shell />;
}