// src/features/auth/LoginView.tsx
import React from "react";
import { apiGET, apiPOST, setToken } from "../../api/client";

import type { User } from "../../types";

export default function LoginView({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // spriječi dupli submit
    setErr(null);
    setLoading(true);
    try {
      const data = await apiPOST<{ access_token: string; user?: User }>("/auth/login", { email, password });
      setToken(data.access_token);
      // Ako backend već vrati user-a, iskoristi to; u suprotnom pozovi /auth/me
      const user = data.user ?? (await apiGET<{ user: User }>("/auth/me", true)).user;
      onLoggedIn(user);
    } catch (e: any) {
      setErr(e?.message || "Greška pri prijavi");
      setToken(null);
    } finally {
      setLoading(false);
      // sigurnosno: obriši lozinku iz polja nakon pokušaja prijave
      setPassword("");
    }
  };

  return (
    <div className="login-container">
      <div style={styles.centeredPage}>
        <style>{`
          @keyframes floaty {
            0% { transform: translateY(0px); opacity: .9; }
            50% { transform: translateY(-8px); opacity: 1; }
            100% { transform: translateY(0px); opacity: .9; }
          }
          .login-bg {
            position: absolute;
            inset: -35%;
            background:
              radial-gradient(40% 40% at 20% 30%, rgba(99,102,241,0.22), transparent 60%),
              radial-gradient(35% 35% at 80% 20%, rgba(34,197,94,0.20), transparent 60%),
              radial-gradient(45% 45% at 50% 80%, rgba(59,130,246,0.20), transparent 60%);
            filter: blur(48px);
            animation: floaty 10s ease-in-out infinite;
          }
          .glass {
            width: 420px;
            max-width: 92vw;
            position: relative;
            padding: 22px 20px 20px 20px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.35);
            background: rgba(255,255,255,0.72);
            box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255,255,255,0.4);
            backdrop-filter: blur(10px);
          }
          .brand { display:flex; align-items:center; gap:12px; margin-bottom: 6px; }
          .brand-logo { width: 42px; height: 42px; border-radius: 10px; box-shadow: 0 8px 22px rgba(94,128,255,0.35); }
          .brand-title { margin: 0; font-weight: 800; letter-spacing: .3px; font-size: 22px; }
          .brand-sub { margin: 2px 0 10px 0; opacity: .7; font-size: 13px; }
          .form-grid { display:grid; gap: 10px; margin-top: 6px; }
          .field { display:grid; gap:6px; }
          .label { font-size:12px; opacity:.8; }
          .inputx {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid rgba(0,0,0,0.12);
            background: #fff;
            color: #0b1220;
            outline: none;
            transition: box-shadow .2s ease, transform .05s ease, border-color .2s ease;
          }
          .inputx:focus { box-shadow: 0 0 0 4px rgba(94,128,255,0.15); border-color: rgba(94,128,255,0.55); }
          .primaryx {
            width: 100%;
            padding: 12px 14px;
            border-radius: 10px;
            border: 1px solid rgba(94,128,255,0.4);
            background: linear-gradient(180deg,#5e80ff,#3f5ae0);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
          }
          .footer-note { margin-top: 10px; font-size: 12px; opacity: .65; text-align: center; }
          .divider { height:1px; background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06));
            margin: 4px 0 12px 0; border-radius: 999px; }
        `}</style>

        <div className="login-bg" />

        <form onSubmit={submit} className="glass" aria-label="Prijava na sistem">
          <div className="brand">
            <img src="/logo-cungu.png" alt="Cungu logo" className="brand-logo" />
            <div>
              <h2 className="brand-title">Arrivals</h2>
              <div className="brand-sub">Prijava na sistem</div>
            </div>
          </div>

          <div className="divider" />
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="login-email">Email</label>
              <input id="login-email" className="inputx" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@firma.com" type="email" autoComplete="username" required autoFocus disabled={loading} />
            </div>
            <div className="field">
              <label className="label" htmlFor="login-pass">Lozinka</label>
              <input id="login-pass" className="inputx" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="lozinka" autoComplete="current-password" required disabled={loading} />
            </div>
            {err && <div style={styles.error} role="alert" aria-live="polite">{err}</div>}
            <button disabled={loading} className="primaryx" type="submit">{loading ? "Učitavam..." : "Uloguj se"}</button>
            <div className="footer-note">© {new Date().getFullYear()} Cungu • Created by Atdhe Tabaku</div>
          </div>
        </form>
      </div>
    </div>
  );
}
const styles = {
  centeredPage: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "24px",
  } as React.CSSProperties,
  error: {
    color: "#b91c1c",
    background: "#fee2e2",
    border: "1px solid #fecaca",
    padding: "8px 12px",
    borderRadius: "8px",
  } as React.CSSProperties,
};