import { useState } from "react";

// Dummy data for demonstration
const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Pending", label: "Pending" },
  { value: "Closed", label: "Closed" },
];

const locationOptions = [
  { value: "", label: "All locations" },
  { value: "Central Hub", label: "Central Hub" },
  { value: "Sarajevo DC", label: "Sarajevo DC" },
  { value: "Podgorica Warehouse", label: "Podgorica Warehouse" },
];

const responsibleOptions = [
  { value: "", label: "All team members" },
  { value: "Ana Marić", label: "Ana Marić" },
  { value: "Ivan Kovač", label: "Ivan Kovač" },
  { value: "Lejla Simić", label: "Lejla Simić" },
];

const STATUS_META: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  "": {
    label: "All statuses",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    dotClass: "bg-slate-300",
  },
  Active: {
    label: "Active",
    badgeClass: "bg-emerald-50 text-emerald-600 border border-emerald-200",
    dotClass: "bg-emerald-400",
  },
  Pending: {
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-600 border border-amber-200",
    dotClass: "bg-amber-400",
  },
  Closed: {
    label: "Closed",
    badgeClass: "bg-rose-50 text-rose-600 border border-rose-200",
    dotClass: "bg-rose-400",
  },
};

const SUMMARISE = (value: string) => STATUS_META[value] ?? STATUS_META[""];

const arrivals = [
  {
    id: 1,
    supplier: "Supplier A",
    plate: "ABC-123",
    status: "Pending",
    note: "Urgent",
    type: "Truck",
    created_at: "2024-06-14 10:05",
    location: "Central Hub",
    responsible: "Ana Marić",
  },
  {
    id: 2,
    supplier: "Supplier B",
    plate: "XYZ-789",
    status: "Active",
    note: "",
    type: "Van",
    created_at: "2024-06-13 15:30",
    location: "Sarajevo DC",
    responsible: "Ivan Kovač",
  },
  {
    id: 3,
    supplier: "Supplier C",
    plate: "JKL-456",
    status: "Closed",
    note: "Wrong date",
    type: "Car",
    created_at: "2024-06-12 09:15",
    location: "Podgorica Warehouse",
    responsible: "Lejla Simić",
  },
];

export default function ArrivalsPage() {
  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterResponsible, setFilterResponsible] = useState("");

  const selectedStatusMeta = SUMMARISE(filterStatus);

  const selectedLocation =
    locationOptions.find((option) => option.value === filterLocation)?.label ?? locationOptions[0].label;
  const selectedResponsible =
    responsibleOptions.find((option) => option.value === filterResponsible)?.label ?? responsibleOptions[0].label;

  const filteredArrivals = arrivals.filter((a) => {
    const query = filterQuery.trim().toLowerCase();
    return (
      (!query ||
        [a.supplier, a.plate, a.note, a.location, a.responsible]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query))) &&
      (!filterStatus || a.status === filterStatus) &&
      (!filterLocation || a.location === filterLocation) &&
      (!filterResponsible || a.responsible === filterResponsible)
    );
  });

  return (
    <div className="grid gap-4">
      {/* filteri */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* Search */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <svg
                className="h-3.5 w-3.5 text-brand-500"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.167 15.833a6.667 6.667 0 1 0 0-13.333 6.667 6.667 0 0 0 0 13.333ZM17.5 17.5l-3.625-3.625"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Pretraga
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ring-1 ring-transparent transition focus-within:ring-brand-500">
              <svg
                className="h-4 w-4 text-brand-500"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.167 15.833a6.667 6.667 0 1 0 0-13.333 6.667 6.667 0 0 0 0 13.333ZM17.5 17.5l-3.625-3.625"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search arrivals…"
                className="flex-1 border-0 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <svg
                className="h-3.5 w-3.5 text-brand-500"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.167 5h11.666M4.167 10h11.666M4.167 15h11.666"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Statusi
            </span>
            <div className="group relative">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ring-1 ring-transparent transition group-focus-within:ring-brand-500">
                <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${selectedStatusMeta.badgeClass}`}>
                  <span className={`h-2 w-2 rounded-full ${selectedStatusMeta.dotClass}`} />
                  {selectedStatusMeta.label}
                </span>
                <svg
                  className="h-4 w-4 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <select
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filtriraj po statusu"
              >
                {statusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <svg
                className="h-3.5 w-3.5 text-brand-500"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 18.333s5-3.333 5-8.333a5 5 0 1 0-10 0c0 5 5 8.333 5 8.333Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Lokacije
            </span>
            <div className="group relative">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ring-1 ring-transparent transition group-focus-within:ring-brand-500">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 18.333s5-3.333 5-8.333a5 5 0 1 0-10 0c0 5 5 8.333 5 8.333Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-slate-700">{selectedLocation}</span>
                </div>
                <svg
                  className="h-4 w-4 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <select
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                aria-label="Filtriraj po lokacijama"
              >
                {locationOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsible */}
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <svg
                className="h-3.5 w-3.5 text-brand-500"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 10a3.333 3.333 0 1 0 0-6.667 3.333 3.333 0 0 0 0 6.667ZM5.833 16.667c0-2.302 1.865-4.167 4.167-4.167s4.167 1.865 4.167 4.167"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Odgovorne osobe
            </span>
            <div className="group relative">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm ring-1 ring-transparent transition group-focus-within:ring-brand-500">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                    {selectedResponsible === responsibleOptions[0].label
                      ? "–"
                      : selectedResponsible
                          .split(" ")
                          .map((part) => part.charAt(0).toUpperCase())
                          .slice(0, 2)
                          .join("")}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{selectedResponsible}</span>
                </div>
                <svg
                  className="h-4 w-4 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <select
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={filterResponsible}
                onChange={(e) => setFilterResponsible(e.target.value)}
                aria-label="Filtriraj po odgovornim osobama"
              >
                {responsibleOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* tabela – wrap u overflow za mobilne */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-full text-sm text-left">
          <thead>
            <tr className="bg-white/5">
              <th className="px-4 py-2 font-semibold">Supplier</th>
              <th className="px-4 py-2 font-semibold">Plate</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Note</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Created at</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredArrivals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-center text-gray-400">
                  No arrivals found.
                </td>
              </tr>
            ) : (
              filteredArrivals.map((a, idx) => (
                <tr
                  key={a.id}
                  className={
                    idx % 2 === 0
                      ? "bg-white/0 hover:bg-white/10"
                      : "bg-white/5 hover:bg-white/10"
                  }
                >
                  <td className="px-4 py-2">{a.supplier}</td>
                  <td className="px-4 py-2">{a.plate}</td>
                  <td className="px-4 py-2">{a.status}</td>
                  <td className="px-4 py-2">{a.note}</td>
                  <td className="px-4 py-2">{a.type}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{a.created_at}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <button className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs">
                      Edit
                    </button>
                    <button className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
