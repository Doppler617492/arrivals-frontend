// src/features/auth/LoginView.tsx
import React from "react";
import { apiGET, apiPOST, setToken } from "../../api/client";

import type { User } from "../../types";

export default function LoginView({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [capsOn, setCapsOn] = React.useState<boolean>(false);
  const [showPass, setShowPass] = React.useState<boolean>(false);
  const [remember, setRemember] = React.useState<boolean>(true);
  const emailValid = /.+@.+\..+/.test(email);
  const [mfaRequired, setMfaRequired] = React.useState(false);
  const [challengeId, setChallengeId] = React.useState<string>("");
  const [otp, setOtp] = React.useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // spriječi dupli submit
    setErr(null);
    setLoading(true);
    try {
      const data = await apiPOST<any>("/auth/login", { email, password });
      // Save token to chosen storage (remember -> localStorage, else sessionStorage)
      setToken(data.access_token, remember);
      try {
        const storage: Storage = remember ? localStorage : sessionStorage;
        storage.setItem("token", data.access_token);
        storage.setItem("access_token", data.access_token);
      } catch {}
      // Ako backend već vrati user-a, iskoristi to; u suprotnom pozovi /auth/me
      const user = data.user ?? (await apiGET<{ user: User }>("/auth/me", true)).user;
      onLoggedIn(user);
    } catch (e: any) {
      // Try to detect MFA requirement
      const raw = e?.message || "";
      if (raw.includes('429') || raw.toLowerCase().includes('rate')) {
        setErr('Previše pokušaja. Pokušajte ponovo kasnije.');
        setToken(null);
        setLoading(false);
        return;
      }
      try {
        const obj = JSON.parse(raw);
        const payload = typeof obj.message === 'string' ? JSON.parse(obj.message) : obj.message;
        if (payload && (payload.mfa_required || payload['mfa-required'])) {
          setMfaRequired(true);
          setChallengeId(payload.challenge_id || 'demo');
          setErr(null);
          return;
        }
      } catch {}
      setErr(raw || "Greška pri prijavi");
      setToken(null);
    } finally {
      setLoading(false);
      // sigurnosno: obriši lozinku iz polja nakon pokušaja prijave
      setPassword("");
    }
  };

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!otp) { setErr('Unesite MFA kod'); return; }
    setErr(null);
    setLoading(true);
    try {
      const data = await apiPOST<any>("/auth/mfa/verify", { challenge_id: challengeId, code: otp, remember });
      setToken(data.access_token, remember);
      try {
        const storage: Storage = remember ? localStorage : sessionStorage;
        storage.setItem("token", data.access_token);
        storage.setItem("access_token", data.access_token);
      } catch {}
      const user = data.user ?? (await apiGET<{ user: User }>("/auth/me", true)).user;
      onLoggedIn(user);
    } catch (err:any) {
      setErr(err?.message || 'MFA verifikacija nije uspjela');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen" style={styles.fullscreen}>
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
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.35);
            background: rgba(255,255,255,0.72);
            box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255,255,255,0.4), 0 12px 28px rgba(0,0,0,0.15);
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
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.12);
            background: #fff;
            color: #0b1220;
            outline: none;
            transition: box-shadow .2s ease, transform .05s ease, border-color .2s ease;
          }
          .inputx:focus { box-shadow: 0 0 0 4px rgba(94,128,255,0.15); border-color: rgba(94,128,255,0.55); }
          .input-wrap { position: relative; }
          .input-ico { position:absolute; top:50%; left:12px; transform:translateY(-50%); width:16px; height:16px; opacity:.7; pointer-events:none; }
          .inputx.with-ico { padding-left: 38px; }
          .primaryx {
            width: 100%;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid rgba(94,128,255,0.4);
            background: linear-gradient(180deg,#5e80ff,#3f5ae0);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
          }
          .primaryx:hover { filter: brightness(1.05); }
          .links-row { display:flex; justify-content:space-between; align-items:center; margin-top: 2px; }
          .linkx { color:#2563eb; text-decoration:none; font-size:12px; }
          .linkx:hover { text-decoration:underline; }
          .footer-note { margin-top: 10px; font-size: 12px; opacity: .65; text-align: center; }
          .divider { height:1px; background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06));
            margin: 4px 0 12px 0; border-radius: 999px; }
          /* ---- Safari / macOS: blur i opacity korekcije ---- */
          .glass { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
          @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            /* Fallback kad blur nije podržan: čvršća pozadina */
            .glass { background: #ffffff; }
          }
          /* Manje agresivan blur na mobilnim uređajima */
          @media (max-width: 420px) {
            .login-bg { filter: blur(36px); }
          }
          /* Prefer-reduced-motion: isključi animaciju pozadine */
          @media (prefers-reduced-motion: reduce) {
            .login-bg { animation: none !important; }
          }
          /* ---- Mini responsive dorada za male ekrane ---- */
          @media (max-width: 420px) {
            .glass {
              width: 94vw;
              padding: 18px 16px;
              border-radius: 10px;
              box-shadow: 0 12px 34px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.45);
            }
            .brand { gap: 10px; }
            .brand-logo { width: 36px; height: 36px; border-radius: 8px; }
            .brand-title { font-size: 18px; }
            .brand-sub { font-size: 12px; margin-top: 0; }
            .form-grid { gap: 8px; }
            .inputx { padding: 11px 12px; border-radius: 10px; }
            .inputx.with-ico { padding-left: 36px; }
            .primaryx { padding: 11px 12px; border-radius: 10px; }
            .links-row { flex-direction: column; gap: 6px; align-items: flex-start; }
            .footer-note { font-size: 11px; }
          }
      `}</style>
      <div className="login-bg" />
      <form onSubmit={submit} className="glass" aria-label="Prijava na sistem">
        <div className="brand">
          <img src="/logo.svg" alt="Arrivals logo" className="brand-logo" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo-cungu.png'; }} />
          <div>
            <h2 className="brand-title">Arrivals</h2>
            <div className="brand-sub">Prijava na sistem</div>
          </div>
        </div>

        <div className="divider" />
        <div className="form-grid">
          {mfaRequired ? (
            <>
              <div className="input-wrap">
                <input
                  id="login-otp"
                  className="inputx"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  onKeyDown={(e)=>{ if (e.key === 'Enter') verifyMfa(e as any); }}
                  placeholder="MFA kod (6 cifara)"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoFocus
                  aria-label="MFA kod"
                />
              </div>
              {err && <div style={styles.error} role="alert" aria-live="polite">{err}</div>}
              <button disabled={loading || !otp} className="primaryx" onClick={verifyMfa} type="button">{loading ? "Učitavam..." : "Potvrdi kod"}</button>
              <div className="divider" />
            </>
          ) : (
            <>
          <div className="input-wrap">
            <svg className="input-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M4 4h16v16H4z" strokeWidth="1.5" opacity=".15"></path>
              <path d="M4 7l8 6 8-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
            <input id="login-email" className="inputx with-ico" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Vaša email adresa" type="email" autoComplete="username" required autoFocus disabled={loading} aria-label="Email" />
          </div>
          <div className="input-wrap">
            <svg className="input-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="5" y="11" width="14" height="8" rx="2" strokeWidth="1.8"></rect>
              <path d="M12 11V7a4 4 0 0 1 4-4" strokeWidth="1.8" strokeLinecap="round"></path>
            </svg>
            <input
              id="login-pass"
              className="inputx with-ico"
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsOn((e as any).getModifierState && (e as any).getModifierState("CapsLock"))}
              placeholder="Vaša lozinka"
              autoComplete="current-password"
              required
              disabled={loading}
              aria-label="Lozinka"
              aria-describedby="caps-hint"
            />
            <button type="button" aria-label={showPass ? "Sakrij lozinku" : "Prikaži lozinku"} onClick={() => setShowPass(s => !s)}
              style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', cursor:'pointer', fontSize:12, color:'#334155' }}>
              {showPass ? 'Sakrij' : 'Prikaži'}
            </button>
          </div>
          {capsOn && (
            <div id="caps-hint" role="status" aria-live="polite" style={{ color:'#b91c1c', fontSize:12 }}>
              Upozorenje: Caps Lock je uključen.
            </div>
          )}
          <div className="links-row">
            <a className="linkx" href="/forgot">Zaboravljena lozinka?</a>
            <span style={{fontSize:12, opacity:.75}}>
              Nemate nalog? <a className="linkx" href="/register">Registrujte se</a>
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12 }}>
              <input type="checkbox" checked={remember} onChange={(e)=>setRemember(e.currentTarget.checked)} />
              Ostani prijavljen
            </label>
            {!emailValid && email.length > 0 && (
              <span style={{ color:'#b91c1c', fontSize:12 }}>Neispravan email format</span>
            )}
          </div>
          {err && <div style={styles.error} role="alert" aria-live="polite">{err}</div>}
          <button disabled={loading || !emailValid} className="primaryx" type="submit">{loading ? "Učitavam..." : "Uloguj se"}</button>
          <div className="divider" />
          <div style={{ display:'grid', gap:8 }}>
            <a href="/auth/sso/google" className="btn ghost" aria-label="Prijava preko Google" title="Google prijava">
              <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                {/* Google G icon */}
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.9 0-12.5-5.6-12.5-12.5S17.1 11 24 11c3.2 0 6.1 1.2 8.3 3.2l5.7-5.7C34 4.9 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.2-.1-2.3-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 18.9 13 24 13c3.2 0 6.1 1.2 8.3 3.2l5.7-5.7C34 4.9 29.3 3 24 3 16.1 3 9.1 7.1 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 45c5.2 0 10-1.7 13.8-4.7l-6.4-5.2c-2 1.4-4.6 2.2-7.4 2.2-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9 40.8 15.9 45 24 45z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-0.8 2.3-2.2 4.2-4.1 5.6l6.4 5.2c-0.5 0.4 6.5-4.7 6.5-14.8 0-1.2-0.1-2.3-0.5-3.5z"/>
                </svg>
                Nastavi sa Google
              </span>
            </a>
            <a href="/auth/sso/microsoft" className="btn ghost" aria-label="Prijava preko Microsoft" title="Microsoft prijava">
              <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                {/* Microsoft squares icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
                  <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
                  <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
                  <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
                </svg>
                Nastavi sa Microsoft
              </span>
            </a>
          </div>
            </>
          )}
          <div className="footer-note">© {new Date().getFullYear()} Cungu • Created by Atdhe Tabaku</div>
        </div>
      </form>
    </div>
  );
}
const styles = {
  fullscreen: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "#f1f5f9",
    padding: "24px",
    zIndex: 50
  } as React.CSSProperties,
  error: {
    color: "#b91c1c",
    background: "#fee2e2",
    border: "1px solid #fecaca",
    padding: "8px 12px",
    borderRadius: "8px",
  } as React.CSSProperties,
};
