import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Package, FileText, Settings, ChevronLeft, ChevronRight } from "lucide-react";

export default function Sidebar() {
  // Start open on desktop, closed on small screens
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    // Prefer saved choice; otherwise open on desktop, closed on small screens
    const saved = localStorage.getItem("sidebar-open");
    if (saved !== null) return saved === "1";
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const location = useLocation();

  // Keep responsive behavior without fighting user's manual toggle
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const handleChange = () => {
      // When entering small screens, auto-close once; when leaving, do nothing (keep user's choice)
      if (mq.matches) setIsOpen(false);
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.body.classList.add("has-sidebar");
    return () => {
      document.body.classList.remove("has-sidebar");
      document.body.classList.remove("sidebar-collapsed");
    };
  }, []);

  useEffect(() => {
    // Keep a CSS variable for optional layouts that consume it
    const offset = isOpen ? "calc(var(--sidebar-w) + var(--sidebar-gap))" : "0px";
    document.documentElement.style.setProperty("--sidebar-offset", offset);

    // Toggle body class so CSS can drive layout (see index.css)
    if (isOpen) {
      document.body.classList.remove("sidebar-collapsed");
    } else {
      document.body.classList.add("sidebar-collapsed");
    }

    // Ensure old inline style is cleared
    document.body.style.removeProperty("padding-left");

    // Persist user's choice
    localStorage.setItem("sidebar-open", isOpen ? "1" : "0");

    // Nudge any observers (e.g., maps, images) to recompute layout
    window.dispatchEvent(new Event("resize"));
  }, [isOpen]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setIsOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const navItems = [
    { icon: Home, label: "Dolasci", to: "/arrivals", end: true },
    { icon: Package, label: "Kontejneri", to: "/containers" },
    { icon: FileText, label: "Izvještaji", to: "/reports" },
    { icon: Settings, label: "Postavke", to: "/settings" },
  ];

  return (
    <>
      {/* Toggle handle (always visible) */}
      <button
        type="button"
        aria-label={isOpen ? "Sakrij navigaciju" : "Prikaži navigaciju"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        aria-pressed={isOpen}
        className={[
          "fixed z-40 transition-all",
          isOpen ? "left-[calc(var(--sidebar-w)-12px)]" : "left-3",
          "rounded-full border border-gray-200 bg-white/90 backdrop-blur shadow px-1.5 py-1",
          "hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:bg-primary/10"
        ].join(" ")}
        style={{ top: "calc(56px + 50vh)" }}
        title={isOpen ? "Sakrij meni" : "Prikaži meni"}
      >

        {isOpen ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      <aside
        className={[
          "fixed left-0 z-30 h-screen shrink-0 border-r border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-3 md:px-4 py-5 flex flex-col transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Glavna navigacija"
        style={{ width: "var(--sidebar-w)", top: "56px", height: "calc(100vh - 56px)" }}
      >
        <h1 className="text-base md:text-lg font-extrabold tracking-tight text-gray-900 mb-4 select-none">
          Arrivals
        </h1>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end as boolean | undefined}
              onClick={() => {
                if (window.matchMedia("(max-width: 1023px)").matches) setIsOpen(false);
              }}
              className={({ isActive }) =>
                [
                  "group flex items-center gap-2 w-full px-3.5 py-2.5 rounded-md transition outline-none select-none",
                  "text-[13px] md:text-sm font-medium",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-600/70"
                    : [
                        "text-gray-700",
                        "hover:bg-blue-50 hover:text-blue-600",
                        "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                        "active:bg-blue-100 active:text-blue-700"
                      ].join(" ")
                ].join(" ")
              }
            >
              <item.icon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105 group-active:scale-95" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="pt-4 text-[11px] text-gray-400 select-none">
          © {new Date().getFullYear()} Arrivals
        </div>
      </aside>
    </>
  );
}