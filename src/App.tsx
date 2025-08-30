// src/App.tsx
import React from "react";
import Dashboard from "./pages/Dashboard";
import styles from "./styles";
import type { User } from "./types";
import { apiPOST, apiGET, getToken, setToken } from "./api/client";

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  // pokušaj automatskog login-a ako postoji token
  React.useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        if (!getToken()) {
          setLoading(false);
          return;
        }
        const me = await apiGET<User>("/me", true);
        setUser(me);
      } catch (e: any) {
        setErr(null); // token nevažeći – ne smaramo porukom, samo pokaži login
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const onLogout = () => {
    setToken(null);
    setUser(null);
  };

  if (loading) return <div style={{ padding: 24 }}>Učitavanje…</div>;
  if (user) return <Dashboard user={user} onLogout={onLogout} />;

  return <Login onLoggedIn={setUser} />;
}

/* ------------------------------ Minimal Login ------------------------------ */
function Login({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // očekuje se da backend vrati { token, user }
      const res = await apiPOST<{ token: string; user: User }>(
        "/login",
        { email, password },
        { auth: false }
      );
      setToken(res.token);
      onLoggedIn(res.user);
    } catch (e: any) {
      setErr(e.message || "Prijava nije uspjela");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(180deg,#f7f9ff,#eef2ff)" }}>
      <form onSubmit={submit} style={{ display: "grid", gap: 10, width: 320, padding: 20, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, background: "#fff" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <img src="/logo-cungu.png" alt="Cungu" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <div style={{ fontWeight: 800 }}>Arrivals — Prijava</div>
        </div>
        {err && <div style={styles.error}>{err}</div>}
        <input
          style={styles.input}
          type="email"
          placeholder="Email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Lozinka"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button style={styles.primaryBtn} type="submit" disabled={busy}>
          {busy ? "Prijavljujem…" : "Prijavi se"}
        </button>
      </form>
    </div>
  );
}