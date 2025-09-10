// src/features/auth/RegisterView.tsx
import React from "react";
import { apiPOST } from "../../api/client";

type Props = {
  onSubmitted?: () => void; // pozovi npr. navigate('/login?requested=1')
};

export default function RegisterView({ onSubmitted }: Props) {
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [note, setNote] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!agree) {
      setErr("Molimo potvrdite saglasnost sa uslovima.");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await apiPOST("/auth/register-request", {
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        company: company.trim(),
        note: note.trim(),
      });
      setOk(true);
      onSubmitted?.();
    } catch (e: any) {
      setErr(e?.message || "Greška pri slanju zahtjeva");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.fullscreen} aria-label="Registracija">
      <style>{`
        :root{
          --bg:#F8F9FA;
          --card:#FFFFFF;
          --text:#343A40;
          --muted:#6C757D;
          --line:#CED4DA;
          --line2:#ADB5BD;
          --primary:#4A90E2; /* srednje plava */
        }
        .card {
          width: 760px;
          min-height: 600px;
          max-width: 92vw;
          padding: 32px 28px 28px;
          border-radius: 12px;
          background: var(--card);
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 16px 44px rgba(15,23,42,0.12);
          position: relative;
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
        }
        .close {
          position:absolute; top:10px; right:10px;
          width:34px; height:34px; border-radius:8px;
          border:1px solid var(--line);
          background:#fff;
          display:grid; place-items:center;
          cursor:pointer;
        }
        .close svg{ width:18px; height:18px; stroke:#64748b; }
        .title { margin: 4px 0 2px; font-weight:800; font-size:22px; text-align:center; letter-spacing:.2px; }
        .sub { margin: 0 0 16px 0; color: var(--muted); font-size:13px; text-align:center; }
        .grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .field { display:flex; flex-direction:column; }
        .input, .textarea {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--line);
          padding: 10px 2px 12px;
          border-radius: 8px; /* suptilno, mada je underline dominantan */
          outline: none;
          color: var(--text);
          transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .textarea { min-height: 88px; resize: vertical; border:1px solid var(--line); padding:12px 12px; }
        .input::placeholder, .textarea::placeholder { color:#98A2B3; }
        .input:focus {
          border-bottom-color: var(--primary);
          box-shadow: 0 1px 0 0 var(--primary);
          background: #fff;
        }
        .textarea:focus{
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(74,144,226,.18);
          background:#fff;
        }
        .check {
          display:flex; align-items:center; gap:10px; color: var(--muted); font-size:12px;
        }
        .check input { width:16px; height:16px; }
        .btn {
          width:100%;
          border-radius: 10px;
          padding: 12px 14px;
          border: 1px solid rgba(74,144,226,.5);
          background: linear-gradient(180deg, #5EA3FF, var(--primary));
          color: #fff; font-weight: 700; cursor: pointer;
        }
        .btn:disabled { opacity:.65; cursor:not-allowed; }
        .link { color: var(--primary); font-weight:600; text-decoration:none; }
        .link:hover { text-decoration:underline; }
        .muted { font-size: 11px; color: var(--muted); }
        .alert-ok {
          background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46;
          padding:10px 12px; border-radius:10px; font-size:14px;
        }
        .alert-err {
          background:#fee2e2; border:1px solid #fecaca; color:#991b1b;
          padding:10px 12px; border-radius:10px; font-size:14px;
        }
      `}</style>

      <form className="card" onSubmit={submit}>
        {/* X dugme */}
        <button
          type="button"
          className="close"
          aria-label="Zatvori"
          onClick={() => {
            // ako se koristi kao modal, ovde može i onSubmitted?.()
            // za sada: povratak na login i reset forme
            setFullName(""); setEmail(""); setPhone(""); setCompany(""); setNote(""); setAgree(false);
            window.location.href = "/login";
          }}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <h1 className="title">Zahtjev za registraciju</h1>
        <p className="sub">Unesite osnovne podatke. Administrator će pregledati i aktivirati nalog.</p>

        <div className="grid">
          <input
            className="input"
            placeholder="Unesite ime i prezime"
            value={fullName}
            onChange={(e)=>setFullName(e.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Unesite email adresu"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            placeholder="Unesite kontakt telefon (opciono)"
            value={phone}
            onChange={(e)=>setPhone(e.target.value)}
          />
          <input
            className="input"
            placeholder="Naziv kompanije (opciono)"
            value={company}
            onChange={(e)=>setCompany(e.target.value)}
          />
          <textarea
            className="textarea"
            placeholder="Napomena (opciono)"
            value={note}
            onChange={(e)=>setNote(e.target.value)}
          />

          {ok && <div className="alert-ok">Zahtjev je poslat. Uskoro ćete dobiti potvrdu na email.</div>}
          {err && <div className="alert-err" role="alert">{err}</div>}

          <label className="check">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e)=>setAgree(e.target.checked)}
            />
            Slanjem zahtjeva prihvatate uslove korišćenja i politiku privatnosti.
          </label>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Šaljem..." : "Pošalji zahtjev"}
          </button>

          <div style={{textAlign:"center"}}>
            <a className="link" href="/login">Nazad na prijavu</a>
          </div>
        </div>
      </form>
    </div>
  );
}

const styles = {
  fullscreen: {
    position: "fixed" as const,
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "#F8F9FA", // svijetlo siva pozadina stranice
    padding: "24px",
    zIndex: 50,
  },
};