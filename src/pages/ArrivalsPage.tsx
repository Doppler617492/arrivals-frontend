import { useState } from "react";

// Dummy data for demonstration
const suppliers = ["Supplier A", "Supplier B", "Supplier C"];
const statuses = ["Pending", "Arrived", "Cancelled"];
const types = ["Truck", "Van", "Car"];
const arrivals = [
  {
    id: 1,
    supplier: "Supplier A",
    plate: "ABC-123",
    status: "Pending",
    note: "Urgent",
    type: "Truck",
    created_at: "2024-06-14 10:05",
  },
  {
    id: 2,
    supplier: "Supplier B",
    plate: "XYZ-789",
    status: "Arrived",
    note: "",
    type: "Van",
    created_at: "2024-06-13 15:30",
  },
  {
    id: 3,
    supplier: "Supplier C",
    plate: "JKL-456",
    status: "Cancelled",
    note: "Wrong date",
    type: "Car",
    created_at: "2024-06-12 09:15",
  },
];

export default function ArrivalsPage() {
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlate, setFilterPlate] = useState("");
  const [filterType, setFilterType] = useState("");

  const filteredArrivals = arrivals.filter((a) => {
    return (
      (!filterSupplier || a.supplier === filterSupplier) &&
      (!filterStatus || a.status === filterStatus) &&
      (!filterPlate || a.plate.toLowerCase().includes(filterPlate.toLowerCase())) &&
      (!filterType || a.type === filterType)
    );
  });

  return (
    <div className="grid gap-4">
      {/* filteri */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Supplier filter */}
        <select
          className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm"
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {/* Status filter */}
        <select
          className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {/* Plate filter */}
        <input
          className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm"
          type="text"
          placeholder="Plate"
          value={filterPlate}
          onChange={(e) => setFilterPlate(e.target.value)}
        />
        {/* Type filter */}
        <select
          className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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