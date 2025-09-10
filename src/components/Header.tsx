import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, Plus, ChevronDown, LogOut, User, Shield } from "lucide-react";

const API_BASE =
  (import.meta as any)?.env?.DEV
    ? ""
    : ((import.meta as any)?.env?.VITE_API_BASE?.replace(/\/$/, "") || "");

type GlobalHit = {
  type: "arrival" | "container";
  id: number | string;
  title: string;
  subtitle?: string;
  extra?: string;
};

type NotificationItem = {
  id: string | number;
  text: string;
  unread?: boolean;
};

const LS_NOTIFS = "arrivals_notifications";
function readNotifs(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(LS_NOTIFS);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}
function writeNotifs(list: NotificationItem[]) {
  try {
    localStorage.setItem(LS_NOTIFS, JSON.stringify(list));
    window.dispatchEvent(new Event("notifications-changed"));
  } catch {}
}
function markAllRead() {
  const list = readNotifs().map(n => ({ ...n, unread: false }));
  writeNotifs(list);
}

export default function Header() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [isFocused, setFocused] = useState(false);
  const [openResults, setOpenResults] = useState(false);
  const [hits, setHits] = useState<GlobalHit[]>([]);
  const [loadingHits, setLoadingHits] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const unreadCount = useMemo(() => notifs.filter(n => n.unread).length, [notifs]);

  const [userOpen, setUserOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce global search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setHits([]);
        return;
      }
      setLoadingHits(true);
      try {
        // pokušaj paralelno containers i arrivals; API može ignorisati ?q ako ne podržava
        const u = encodeURIComponent(q.trim());
        const urls = [
          `${API_BASE}/api/containers?q=${u}`,
          `${API_BASE}/api/arrivals?q=${u}`,
        ];
        const [cRes, aRes] = await Promise.allSettled(urls.map(u => fetch(u, { credentials: "include" })));
        const cJson = (cRes.status === "fulfilled" && cRes.value.ok) ? await cRes.value.json() : [];
        const aJson = (aRes.status === "fulfilled" && aRes.value.ok) ? await aRes.value.json() : [];

        const mapped: GlobalHit[] = [
          ...(Array.isArray(cJson) ? cJson : []).slice(0, 5).map((row: any) => ({
            type: "container",
            id: row.id ?? row._id ?? row.Kontejner ?? crypto.randomUUID(),
            title: row.Kontejner || row.container_no || `Kontejner #${row.id ?? "?"}`,
            subtitle: row.Supplier || row.supplier || row.Dobavljač || "",
            extra: row.Status || row.status || "",
          })),
          ...(Array.isArray(aJson) ? aJson : []).slice(0, 5).map((row: any) => ({
            type: "arrival",
            id: row.id ?? row._id ?? crypto.randomUUID(),
            title: row.supplier ? `${row.supplier}` : `Pošiljka #${row.id ?? "?"}`,
            subtitle: row.carrier || row.plate || row.transport_type || "",
            extra: row.eta ? `ETA: ${new Date(row.eta).toLocaleDateString()}` : "",
          })),
        ];
        setHits(mapped);
      } catch (e) {
        // fail soft – samo ne prikazuj rezultate
        setHits([]);
      } finally {
        setLoadingHits(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Zatvaranje dropdowna klikom vani
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        e.target !== searchRef.current
      ) {
        setOpenResults(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Osvježavanje liste notifikacija kada se promijene (globalno)
  useEffect(() => {
    const onChanged = () => setNotifs(readNotifs());
    window.addEventListener("notifications-changed", onChanged);
    return () => window.removeEventListener("notifications-changed", onChanged);
  }, []);

  // Notifikacije – lokalni store (bez backend poziva)
  const loadNotifications = async () => {
    const list = readNotifs();
    setNotifs(list);
  };

  // Akcije
  function goHit(h: GlobalHit) {
    setOpenResults(false);
    setQ("");
    if (h.type === "container") {
      nav("/containers");
      // može i: window.dispatchEvent(new CustomEvent("focus-container", { detail: { id: h.id }}));
    } else {
      nav("/arrivals");
      // može i: window.dispatchEvent(new CustomEvent("focus-arrival", { detail: { id: h.id }}));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // globalni event – Arrivals.tsx/Containers.tsx mogu da se pretplate
      window.dispatchEvent(new CustomEvent("global-search", { detail: { q: q.trim() }}));
      setOpenResults(false);
      if (q.trim()) {
        // Po defaultu idi na Arrivals (možemo kasnije dodati /search stranu)
        nav("/arrivals");
      }
    }
  }

  function quickAdd() {
    // Centralni "Novi" – za sada otvara Novi Arrival (kanban)
    window.dispatchEvent(new CustomEvent("new-entry", { detail: { type: "arrival" }}));
    nav("/arrivals");
  }

  function logout() {
    localStorage.removeItem("token");
    nav("/login");
  }

  // --- Logo fallback: try multiple locations (env + common paths) ---
  const logoCandidates = useMemo(() => {
    const envUrl = (import.meta as any)?.env?.VITE_LOGO_URL as string | undefined;
    return [envUrl, "/logo.svg", "/assets/logo.svg", "/images/logo.svg"].filter(Boolean) as string[];
  }, []);
  const [logoIdx, setLogoIdx] = useState(0);
  const [logoFailed, setLogoFailed] = useState(false);
  const logoSrc = logoCandidates[Math.min(logoIdx, logoCandidates.length - 1)] || "/logo.svg";
  function onLogoError() {
    if (logoIdx < logoCandidates.length - 1) setLogoIdx((i) => i + 1);
    else setLogoFailed(true);
  }

  return (
    <header className="hdr">
      {/* Lijevo: logo + naziv */}
      <Link to="/" className="hdr__brand">
        {!logoFailed ? (
          <img src={logoSrc} alt="logo" className="hdr__logo" onError={onLogoError} />
        ) : (
          <div className="hdr__logo hdr__logo--fallback" aria-label="logo">A</div>
        )}
        <span className="hdr__title">Arrivals</span>
      </Link>

      {/* Sredina: globalna pretraga */}
      <div className={`hdr__search ${isFocused ? "is-focused" : ""}`} ref={dropdownRef}>
        <Search className="hdr__searchIcon" size={16} />
        <input
          ref={searchRef}
          className="hdr__searchInput"
          placeholder="Pretraži sve…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpenResults(true); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {openResults && (q.trim().length > 0) && (
          <div className="hdr__searchDropdown">
            {loadingHits && <div className="hdr__searchItem">Pretraga…</div>}
            {!loadingHits && hits.length === 0 && (
              <div className="hdr__searchItem">Nema rezultata</div>
            )}
            {!loadingHits && hits.map((h, i) => (
              <button key={String(h.type)+String(h.id)+i} className="hdr__searchItem" onClick={() => goHit(h)}>
                <div className="hdr__searchPrim">{h.title}</div>
                { (h.subtitle || h.extra) && (
                  <div className="hdr__searchSec">{[h.subtitle, h.extra].filter(Boolean).join(" · ")}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desno: +, zvonce, korisnički meni */}
      <div className="hdr__right">
        <button className="icon-btn icon-btn--plus" title="Novi unos" onClick={quickAdd} aria-label="Novi unos">
          <Plus size={18} />
          {/* Fallback raster/svg ikona ako iz nekog razloga SVG ne renderuje */}
          <img src="/new.svg" alt="" aria-hidden="true" style={{ width: 18, height: 18, display: 'none' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </button>

        <div className="hdr__iconBtn hdr__notif">
          <button
            className="icon-btn icon-btn--bell"
            onClick={async () => { await loadNotifications(); setNotifOpen(v => !v); }}
            title="Obavijesti"
            aria-label="Obavijesti"
          >
            <Bell size={18} />
            {/* Fallback ikona (public/notification.svg) ako SVG ne renderuje */}
            <img src="/notification.svg" alt="" aria-hidden="true" style={{ width: 18, height: 18, display: 'none' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="dropdown">
              <div className="dropdown__head">Notifikacije</div>
              {notifs.length === 0 ? (
                <div className="dropdown__empty">Nema novih obavještenja</div>
              ) : (
                <ul className="dropdown__list">
                  {notifs.map(n => (
                    <li key={String(n.id)} className={`dropdown__item ${n.unread ? "unread" : ""}`}>
                      {n.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="dropdown__foot flex items-center justify-between">
                <button
                  className="btn small btn.ghost"
                  onClick={() => {
                    markAllRead();
                    setNotifs(readNotifs());
                  }}
                >
                  Označi sve kao pročitano
                </button>
                <button className="btn small btn.ghost" onClick={() => setNotifOpen(false)}>Zatvori</button>
              </div>
            </div>
          )}
        </div>

        <div className="hdr__iconBtn hdr__user" style={{ position: "relative" }}>
          <button className="user-btn" onClick={() => setUserOpen(v => !v)}>
            <div className="user-initials">AD</div>
            <ChevronDown size={16} />
          </button>
          {userOpen && (
            <div className="dropdown">
              <div className="dropdown__head">Korisnik</div>
              <ul className="dropdown__list">
                <li className="dropdown__item">
                  <User size={14} style={{ marginRight: 6 }} /> Profil
                </li>
                <li className="dropdown__item">
                  <Shield size={14} style={{ marginRight: 6 }} /> Admin
                </li>
              </ul>
              <div className="dropdown__foot">
                <button className="btn small btn.ghost" onClick={logout}>
                  <LogOut size={14} style={{ marginRight: 6 }} /> Odjava
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}