import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Space,
  Button,
  Modal,
  Skeleton,
  Tag,
  Switch,
  Typography,
  Divider,
  List,
  Avatar,
  Drawer,
  Select,
  DatePicker,
  Badge,
  Tooltip,
  Dropdown,
  Empty,
  message,
} from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
  CloudDownloadOutlined,
  FilterOutlined,
  DollarCircleOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  LineChartOutlined,
  PieChartOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  BellOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import dayjs, { Dayjs } from "dayjs";
import { API_BASE, getToken } from "../api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { realtime } from "../lib/realtime";
import { useUIStore } from "../store";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type KPIResponse = {
  total: number;
  by_status: {
    not_shipped?: number;
    shipped?: number;
    arrived?: number;
    [key: string]: number | undefined;
  };
};

type MonthlyEntry = {
  cost: number;
  count: number;
  early: number;
  onTime: number;
  late: number;
  leadTimeSum: number;
  leadTimeCount: number;
};

type StatusCounts = {
  not_shipped: number;
  shipped: number;
  arrived: number;
  other: number;
};

type NotificationRecord = {
  id: number;
  text: string;
  created_at?: string;
  navigate_url?: string;
  read?: boolean;
};

function parseNumber(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: any): Dayjs | null {
  if (!value) return null;
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

function getArrivalCost(arrival: Record<string, any>): number {
  const total = parseNumber(arrival.total_cost ?? arrival.totalCost);
  if (total > 0) return total;
  const goods = parseNumber(arrival.goods_cost ?? arrival.goodsCost);
  const freight = parseNumber(arrival.freight_cost ?? arrival.freightCost);
  const customs = parseNumber(arrival.customs_cost ?? arrival.customsCost);
  const extra = parseNumber(
    arrival.other_cost ?? arrival.otherCost ?? arrival.misc_cost ?? arrival.miscCost
  );
  const sum = goods + freight + customs + extra;
  if (sum > 0) return sum;
  return parseNumber(arrival.cost);
}

function formatCurrency(value: number, fractionDigits = 2): string {
  const formatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter.format(Number.isFinite(value) ? value : 0);
}

function formatCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M€`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K€`;
  return `${Math.round(value).toLocaleString("de-DE")}€`;
}

function safeMonthLabel(monthKey: string): string {
  const d = dayjs(`${monthKey}-01`);
  return d.isValid() ? d.format("MMM YY") : monthKey;
}

function formatDate(value?: string): string {
  const d = parseDate(value);
  return d ? d.format("DD.MM.YYYY") : "";
}

const statusLabelMap: Record<string, { label: string; color: string }> = {
  not_shipped: { label: "Najavljeno", color: "#6366f1" },
  shipped: { label: "U transportu", color: "#f59e0b" },
  arrived: { label: "Stiglo", color: "#22c55e" },
  other: { label: "Ostalo", color: "#94a3b8" },
};

export default function MuseDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dark = useUIStore((s) => s.darkMode);
  const setDark = useUIStore((s) => s.setDarkMode);

  const [showReport, setShowReport] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({ supplier: "", status: "not_shipped", eta: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [responsibleFilter, setResponsibleFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [exporting, setExporting] = useState(false);

  const qKpi = useQuery({
    queryKey: ["dashboard", "kpi"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/kpi`);
      if (!res.ok) throw new Error("KPI fetch failed");
      return res.json() as Promise<KPIResponse>;
    },
    staleTime: 120_000,
  });

  const qArrivals = useQuery({
    queryKey: ["dashboard", "arrivals-list"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Potrebna je prijava");
      const res = await fetch(`${API_BASE}/api/analytics/arrivals/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Arrivals list ${res.status}: ${txt}`);
      }
      return res.json();
    },
    staleTime: 120_000,
  });

  const qRecent = useQuery({
    queryKey: ["dashboard", "recent"],
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error("Potrebna je prijava");
      const res = await fetch(`${API_BASE}/api/notifications?limit=12`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Greška ${res.status}`);
      return res.json() as Promise<NotificationRecord[]>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const off = realtime.on((evt) => {
      if (evt.resource === "arrivals" || evt.type?.startsWith("arrivals.")) {
        qc.invalidateQueries({ queryKey: ["dashboard", "arrivals-list"] });
        qc.invalidateQueries({ queryKey: ["dashboard", "kpi"] });
      }
      if (evt.type?.startsWith("notifications")) {
        qc.invalidateQueries({ queryKey: ["dashboard", "recent"] });
      }
    });
    return () => {
      try {
        off?.();
      } catch (error) {
        console.warn("Failed to detach realtime", error);
      }
    };
  }, [qc]);

  const arrivalsRaw = useMemo(() => {
    const items = (qArrivals.data as any)?.items;
    return Array.isArray(items) ? items : [];
  }, [qArrivals.data]);

  const supplierOptions = useMemo(() => {
    return Array.from(new Set(arrivalsRaw.map((a) => String(a.supplier || "").trim()).filter(Boolean)))
      .sort()
      .map((value) => ({ value, label: value }));
  }, [arrivalsRaw]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(arrivalsRaw.map((a) => String(a.category || "").trim()).filter(Boolean)))
      .sort()
      .map((value) => ({ value, label: value }));
  }, [arrivalsRaw]);

  const responsibleOptions = useMemo(() => {
    return Array.from(
      new Set(
        arrivalsRaw
          .map((a) => String(a.responsible || a.assignee_name || "").trim())
          .filter(Boolean)
      )
    )
      .sort()
      .map((value) => ({ value, label: value }));
  }, [arrivalsRaw]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(arrivalsRaw.map((a) => String(a.status || "").toLowerCase()).filter(Boolean)))
      .sort()
      .map((value) => ({ value, label: statusLabelMap[value]?.label ?? value }));
  }, [arrivalsRaw]);

  const filterActive = Boolean(
    supplierFilter ||
      categoryFilter ||
      responsibleFilter ||
      statusFilter ||
      (dateRange && (dateRange[0] || dateRange[1]))
  );

  const filteredArrivals = useMemo(() => {
    return arrivalsRaw.filter((arrival) => {
      if (supplierFilter) {
        if (String(arrival.supplier || "").trim().toLowerCase() !== supplierFilter.toLowerCase()) {
          return false;
        }
      }
      if (categoryFilter) {
        if (String(arrival.category || "").trim().toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
      }
      if (responsibleFilter) {
        const responsible = String(arrival.responsible || arrival.assignee_name || "").trim().toLowerCase();
        if (responsible !== responsibleFilter.toLowerCase()) return false;
      }
      if (statusFilter) {
        const status = String(arrival.status || "").toLowerCase();
        if (status !== statusFilter.toLowerCase()) return false;
      }
      if (dateRange && (dateRange[0] || dateRange[1])) {
        const reference =
          parseDate(arrival.arrived_at || arrival.arrivedAt) ||
          parseDate(arrival.eta) ||
          parseDate(arrival.pickup_date || arrival.pickupDate);
        if (!reference) return false;
        if (dateRange[0] && reference.isBefore(dateRange[0], "day")) return false;
        if (dateRange[1] && reference.isAfter(dateRange[1], "day")) return false;
      }
      return true;
    });
  }, [arrivalsRaw, supplierFilter, categoryFilter, responsibleFilter, statusFilter, dateRange]);

  const activeArrivals = filterActive ? filteredArrivals : arrivalsRaw;

  const metrics = useMemo(() => {
    const statusCounts: StatusCounts = {
      not_shipped: 0,
      shipped: 0,
      arrived: 0,
      other: 0,
    };
    const monthly = new Map<string, MonthlyEntry>();
    const supplierCost = new Map<string, { cost: number; count: number }>();
    const supplierDelays = new Map<string, { delay: number; count: number }>();
    const categoryCost = new Map<string, { cost: number; count: number }>();
    const responsibleCost = new Map<string, { cost: number; count: number }>();
    const locationCost = new Map<string, { cost: number; count: number }>();

    let leadTimeSum = 0;
    let leadTimeCount = 0;
    let delayCount = 0;
    let totalArrived = 0;

    activeArrivals.forEach((arrival) => {
      const cost = getArrivalCost(arrival);
      const statusKey = String(arrival.status || "").toLowerCase();
      if (statusCounts[statusKey as keyof StatusCounts] !== undefined) {
        statusCounts[statusKey as keyof StatusCounts] += 1;
      } else {
        statusCounts.other += 1;
      }

      const supplierKey = String(arrival.supplier || "Nepoznat").trim() || "Nepoznat";
      const supplierEntry = supplierCost.get(supplierKey) || { cost: 0, count: 0 };
      supplierEntry.cost += cost;
      supplierEntry.count += 1;
      supplierCost.set(supplierKey, supplierEntry);

      const categoryKey = String(arrival.category || "Bez kategorije").trim() || "Bez kategorije";
      const categoryEntry = categoryCost.get(categoryKey) || { cost: 0, count: 0 };
      categoryEntry.cost += cost;
      categoryEntry.count += 1;
      categoryCost.set(categoryKey, categoryEntry);

      const responsibleKey =
        String(arrival.responsible || arrival.assignee_name || "Nedodijeljeno").trim() || "Nedodijeljeno";
      const responsibleEntry = responsibleCost.get(responsibleKey) || { cost: 0, count: 0 };
      responsibleEntry.cost += cost;
      responsibleEntry.count += 1;
      responsibleCost.set(responsibleKey, responsibleEntry);

      const locationKey = String(arrival.location || "Nedefinisano").trim() || "Nedefinisano";
      const locationEntry = locationCost.get(locationKey) || { cost: 0, count: 0 };
      locationEntry.cost += cost;
      locationEntry.count += 1;
      locationCost.set(locationKey, locationEntry);

      const pickup = parseDate(arrival.pickup_date || arrival.pickupDate);
      const eta = parseDate(arrival.eta);
      const arrived = parseDate(arrival.arrived_at || arrival.arrivedAt);
      const reference = arrived || eta || pickup;

      if (pickup) {
        const target = arrived ?? eta;
        if (target) {
          const diffHours = target.diff(pickup, "hour");
          if (Number.isFinite(diffHours)) {
            const diffDays = diffHours / 24;
            leadTimeSum += diffDays;
            leadTimeCount += 1;
          }
        }
      }

      if (reference) {
        const monthKey = reference.format("YYYY-MM");
        const entry =
          monthly.get(monthKey) || {
            cost: 0,
            count: 0,
            early: 0,
            onTime: 0,
            late: 0,
            leadTimeSum: 0,
            leadTimeCount: 0,
          };
        entry.cost += cost;
        entry.count += 1;

        if (pickup) {
          const target = arrived ?? eta;
          if (target) {
            const diffHours = target.diff(pickup, "hour");
            if (Number.isFinite(diffHours)) {
              const diffDays = diffHours / 24;
              entry.leadTimeSum += diffDays;
              entry.leadTimeCount += 1;
            }
          }
        }

        if (eta && arrived) {
          const diffHours = arrived.diff(eta, "hour");
          if (Number.isFinite(diffHours)) {
            const diffDays = diffHours / 24;
            totalArrived += 1;
            if (diffDays > 0.1) {
              entry.late += 1;
              delayCount += 1;
              const delayEntry = supplierDelays.get(supplierKey) || { delay: 0, count: 0 };
              delayEntry.delay += diffDays;
              delayEntry.count += 1;
              supplierDelays.set(supplierKey, delayEntry);
            } else if (diffDays < -0.1) {
              entry.early += 1;
            } else {
              entry.onTime += 1;
            }
          }
        }

        monthly.set(monthKey, entry);
      }
    });

    const monthlySorted = Array.from(monthly.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const monthlyMap = new Map(monthlySorted);
    const leadTimeAvg = leadTimeCount ? leadTimeSum / leadTimeCount : 0;
    const delayPercent = totalArrived ? (delayCount / totalArrived) * 100 : 0;

    return {
      statusCounts,
      monthlySorted,
      monthlyMap,
      leadTimeAvg,
      delayCount,
      delayPercent,
      totalArrived,
      supplierCost,
      supplierDelays,
      categoryCost,
      responsibleCost,
      locationCost,
    };
  }, [activeArrivals]);

  const costTrendData = useMemo(() => {
    return metrics.monthlySorted.map(([month, data]) => ({
      month,
      label: safeMonthLabel(month),
      cost: data.cost,
      count: data.count,
      leadTime: data.leadTimeCount ? data.leadTimeSum / data.leadTimeCount : 0,
      late: data.late,
      totalForDelay: data.late + data.onTime + data.early,
    }));
  }, [metrics.monthlySorted]);

  const onTimeData = useMemo(() => {
    return costTrendData.map((entry) => {
      const total = entry.totalForDelay;
      const onTimePct = total ? (entry.totalForDelay - entry.late === 0 ? 0 : ((entry.totalForDelay - entry.late) / total) * 100) : 0;
      const latePct = total ? (entry.late / total) * 100 : 0;
      return {
        month: entry.month,
        label: entry.label,
        onTimePct,
        latePct,
      };
    });
  }, [costTrendData]);

  const topSuppliers = useMemo(() => {
    return Array.from(metrics.supplierCost.entries())
      .filter(([, data]) => data.cost > 0)
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 5)
      .map(([supplier, data]) => ({ supplier, cost: data.cost, count: data.count }));
  }, [metrics.supplierCost]);

  const topDelays = useMemo(() => {
    return Array.from(metrics.supplierDelays.entries())
      .filter(([, data]) => data.count > 0)
      .map(([supplier, data]) => ({ supplier, avgDelay: data.delay / data.count }))
      .sort((a, b) => b.avgDelay - a.avgDelay)
      .slice(0, 5);
  }, [metrics.supplierDelays]);

  const categoryDistribution = useMemo(() => {
    const entries = Array.from(metrics.categoryCost.entries()).sort((a, b) => b[1].cost - a[1].cost);
    if (entries.length <= 8) return entries;
    const top = entries.slice(0, 7);
    const rest = entries.slice(7).reduce(
      (acc, [, data]) => {
        acc.cost += data.cost;
        acc.count += data.count;
        return acc;
      },
      { cost: 0, count: 0 }
    );
    if (rest.cost > 0) {
      top.push(["Ostalo", rest]);
    }
    return top;
  }, [metrics.categoryCost]);

  const responsibleDistribution = useMemo(() => {
    return Array.from(metrics.responsibleCost.entries())
      .sort((a, b) => b[1].cost - a[1].cost)
      .slice(0, 6);
  }, [metrics.responsibleCost]);

  const locationDistribution = useMemo(() => {
    return Array.from(metrics.locationCost.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);
  }, [metrics.locationCost]);

  const currentMonthKey = dayjs().format("YYYY-MM");
  const previousMonthKey = dayjs().subtract(1, "month").format("YYYY-MM");
  const currentEntry = metrics.monthlyMap.get(currentMonthKey);
  const prevEntry = metrics.monthlyMap.get(previousMonthKey);

  const totalCostCurrent = currentEntry?.cost ?? 0;
  const totalCostPrev = prevEntry?.cost ?? 0;
  const costDelta =
    totalCostPrev > 0 ? ((totalCostCurrent - totalCostPrev) / totalCostPrev) * 100 : totalCostCurrent > 0 ? 100 : 0;

  const avgCostCurrent = currentEntry && currentEntry.count ? currentEntry.cost / currentEntry.count : 0;
  const avgCostPrev = prevEntry && prevEntry.count ? prevEntry.cost / prevEntry.count : 0;
  const avgCostDelta =
    avgCostPrev > 0 ? ((avgCostCurrent - avgCostPrev) / avgCostPrev) * 100 : avgCostCurrent > 0 ? 100 : 0;

  const leadTimeCurrent = currentEntry && currentEntry.leadTimeCount
    ? currentEntry.leadTimeSum / currentEntry.leadTimeCount
    : metrics.leadTimeAvg;
  const leadTimePrev = prevEntry && prevEntry.leadTimeCount ? prevEntry.leadTimeSum / prevEntry.leadTimeCount : 0;
  const leadTimeDelta = leadTimePrev > 0 ? ((leadTimeCurrent - leadTimePrev) / leadTimePrev) * 100 : 0;

  const delayCurrent = currentEntry ? currentEntry.late : metrics.delayCount;
  const delayTotalCurrent = currentEntry ? currentEntry.late + currentEntry.onTime + currentEntry.early : metrics.totalArrived;
  const delayPctCurrent = delayTotalCurrent ? (delayCurrent / delayTotalCurrent) * 100 : metrics.delayPercent;
  const delayPrev = prevEntry ? prevEntry.late : 0;
  const delayTotalPrev = prevEntry ? prevEntry.late + prevEntry.onTime + prevEntry.early : 0;
  const delayPctPrev = delayTotalPrev ? (delayPrev / delayTotalPrev) * 100 : 0;
  const delayDelta = delayPctPrev ? delayPctCurrent - delayPctPrev : delayPctCurrent;

  const notifications = useMemo(() => {
    if (!Array.isArray(qRecent.data)) return [];
    return qRecent.data.slice(0, 5);
  }, [qRecent.data]);

  const textColor = dark ? "#e5e7eb" : "#334155";
  const gridColor = dark ? "#1f2937" : "#e5e7eb";
  const bgColor = "transparent";

  const costTrendOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: any) => formatCurrency(Number(value ?? 0)),
      },
      grid: { left: 50, right: 16, top: 32, bottom: 24 },
      xAxis: {
        type: "category",
        data: costTrendData.map((d) => d.label),
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: any) => formatCurrencyCompact(Number(value ?? 0)) },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.35 } },
      },
      series: [
        {
          name: "Troškovi",
          type: "line",
          smooth: true,
          data: costTrendData.map((d) => Number(d.cost.toFixed(2))),
          lineStyle: { width: 3, color: "#2563eb" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(37, 99, 235, 0.25)" },
              { offset: 1, color: "rgba(37, 99, 235, 0.05)" },
            ]),
          },
          showSymbol: false,
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, costTrendData]);

  const onTimeOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: any) => `${Number(value ?? 0).toFixed(1)}%`,
      },
      grid: { left: 50, right: 16, top: 32, bottom: 24 },
      xAxis: {
        type: "category",
        data: onTimeData.map((d) => d.label),
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: textColor, formatter: (value: any) => `${Number(value ?? 0)}%` },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.35 } },
      },
      series: [
        {
          name: "On-time",
          type: "bar",
          data: onTimeData.map((d) => Number(d.onTimePct.toFixed(1))),
          itemStyle: { color: "#22c55e", borderRadius: [6, 6, 0, 0] },
        },
        {
          name: "Kašnjenje",
          type: "line",
          data: onTimeData.map((d) => Number(d.latePct.toFixed(1))),
          yAxisIndex: 0,
          smooth: true,
          lineStyle: { color: "#ef4444", width: 2 },
          areaStyle: { opacity: 0.05 },
          showSymbol: false,
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, onTimeData]);

  const topSuppliersOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: any) => formatCurrency(Number(value ?? 0)),
      },
      grid: { left: 110, right: 16, top: 24, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: any) => formatCurrencyCompact(Number(value ?? 0)) },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.3 } },
      },
      yAxis: {
        type: "category",
        data: topSuppliers.map((item) => item.supplier),
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: "Vrijednost",
          type: "bar",
          data: topSuppliers.map((item) => Number(item.cost.toFixed(2))),
          itemStyle: { color: "#2563eb", borderRadius: [0, 6, 6, 0] },
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, topSuppliers]);

  const topDelaysOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: any) => `${Number(value ?? 0).toFixed(1)} dana`,
      },
      grid: { left: 110, right: 16, top: 24, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: any) => `${Number(value ?? 0).toFixed(1)}d` },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.3 } },
      },
      yAxis: {
        type: "category",
        data: topDelays.map((item) => item.supplier),
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: "Prosječno kašnjenje",
          type: "bar",
          data: topDelays.map((item) => Number(item.avgDelay.toFixed(2))),
          itemStyle: { color: "#ef4444", borderRadius: [0, 6, 6, 0] },
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, topDelays]);

  const categoryPieOption = useMemo(() => {
    const data = categoryDistribution.map(([name, stats], index) => ({
      name,
      value: Number(stats.cost.toFixed(2)),
      itemStyle: {
        color: ["#2563eb", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444", "#6366f1", "#0ea5e9"][index % 8],
      },
    }));
    return {
      backgroundColor: bgColor,
      tooltip: { trigger: "item", valueFormatter: (value: any) => formatCurrency(Number(value ?? 0)) },
      legend: { top: 8, right: 8, textStyle: { color: textColor } },
      series: [
        {
          type: "pie",
          radius: ["55%", "80%"],
          label: { show: false },
          labelLine: { show: false },
          data,
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, categoryDistribution]);

  const responsibleOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: any) => formatCurrency(Number(value ?? 0)),
      },
      grid: { left: 120, right: 16, top: 24, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: textColor, formatter: (value: any) => formatCurrencyCompact(Number(value ?? 0)) },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.3 } },
      },
      yAxis: {
        type: "category",
        data: responsibleDistribution.map(([name]) => name),
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: "Vrijednost",
          type: "bar",
          data: responsibleDistribution.map(([, data]) => Number(data.cost.toFixed(2))),
          itemStyle: { color: "#0ea5e9", borderRadius: [0, 6, 6, 0] },
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, responsibleDistribution]);

  const locationOption = useMemo(() => {
    return {
      backgroundColor: bgColor,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: any) => `${Number(value ?? 0)} pošiljki`,
      },
      grid: { left: 120, right: 16, top: 24, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { color: textColor },
        splitLine: { lineStyle: { color: gridColor, opacity: 0.3 } },
      },
      yAxis: {
        type: "category",
        data: locationDistribution.map(([name]) => name),
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: "Broj dolazaka",
          type: "bar",
          data: locationDistribution.map(([, data]) => data.count),
          itemStyle: { color: "#6366f1", borderRadius: [0, 6, 6, 0] },
        },
      ],
    } as echarts.EChartsOption;
  }, [bgColor, textColor, gridColor, locationDistribution]);

  const isBusy = qKpi.isLoading || qArrivals.isLoading || qRecent.isLoading;
  const statusCounts = metrics.statusCounts;
  const statusTotal = Object.values(statusCounts).reduce((acc, value) => acc + value, 0) || qKpi.data?.total || 0;

  async function createArrival(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = getToken();
      if (!token) {
        message.warning("Potrebna je prijava");
        return;
      }
      const res = await fetch(`${API_BASE}/api/arrivals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Neuspješno kreiranje");
      }
      message.success("Dolazak je kreiran");
      setCreateOpen(false);
      setForm({ supplier: "", status: "not_shipped", eta: "" });
      qc.invalidateQueries({ queryKey: ["dashboard", "arrivals-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "kpi"] });
    } catch (error) {
      console.warn("Create arrival failed", error);
      message.error("Kreiranje nije uspjelo");
    }
  }

  const exportRows = useMemo(() => {
    const mapStatus = (key: string) => statusLabelMap[key]?.label ?? key;
    return activeArrivals.map((arrival) => ({
      ID: arrival.id,
      Dobavljač: arrival.supplier,
      Status: mapStatus(String(arrival.status || "")),
      ETA: formatDate(arrival.eta),
      "Stvarni dolazak": formatDate(arrival.arrived_at || arrival.arrivedAt),
      Lokacija: arrival.location || "",
      Odgovorna: arrival.responsible || arrival.assignee_name || "",
      "Trošak (EUR)": Number(getArrivalCost(arrival).toFixed(2)),
    }));
  }, [activeArrivals]);

  async function exportArrivalsXLSX() {
    try {
      setExporting(true);
      const rows = exportRows;
      if (!rows.length) {
        message.info("Nema podataka za izvoz");
        return;
      }
      const XLSXModule: any = await import("xlsx");
      const XLSX = XLSXModule.default || XLSXModule;
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Arrivals");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dashboard_arrivals.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    } catch (error) {
      console.error(error);
      message.error("Excel izvoz nije uspio");
    } finally {
      setExporting(false);
    }
  }

  async function exportArrivalsPDF() {
    try {
      setExporting(true);
      const rows = exportRows;
      if (!rows.length) {
        message.info("Nema podataka za izvoz");
        return;
      }
      const jsPDFModule: any = await import("jspdf");
      const jsPDF = jsPDFModule.default || jsPDFModule;
      await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape" });
      const columns = Object.keys(rows[0]);
      const body = rows.map((row) => columns.map((col) => row[col as keyof typeof row] ?? ""));
      // @ts-ignore
      doc.autoTable({ head: [columns], body, styles: { fontSize: 8 } });
      doc.save("dashboard_arrivals.pdf");
    } catch (error) {
      console.error(error);
      message.error("PDF izvoz nije uspio");
    } finally {
      setExporting(false);
    }
  }

  function openNotification(url?: string) {
    if (!url) return;
    if (/^https?:/i.test(url)) {
      window.open(url, "_blank", "noopener");
      return;
    }
    navigate(url);
  }

  const reportHtml = `
    <h3>Izvještaj o performansama</h3>
    <p>
      Dashboard agregira ključne KPI-jeve (troškovi, on-time performanse, lead time) i omogućava brzi izvoz u Excel / PDF.
      Za detaljniji izvještaj koristite Analitika &gt; Dolasci.
    </p>
  `;

  const costTrendRef = useRef<ReactECharts>(null);

  const exportButtons = (
    <Dropdown
      menu={{
        items: [
          { key: "xlsx", label: "Excel", icon: <FileExcelOutlined /> },
          { key: "pdf", label: "PDF", icon: <FilePdfOutlined /> },
        ],
        onClick: ({ key }) => {
          if (key === "xlsx") exportArrivalsXLSX();
          if (key === "pdf") exportArrivalsPDF();
        },
      }}
      placement="bottomRight"
      trigger={["click"]}
    >
      <Button icon={<CloudDownloadOutlined />} loading={exporting}>
        Izvještaji
      </Button>
    </Dropdown>
  );

  const filterButton = (
    <Badge dot={filterActive} offset={[4, -2]}>
      <Button icon={<FilterOutlined />} onClick={() => setFiltersOpen(true)}>
        Filteri
      </Button>
    </Badge>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Operativni dashboard
          </Title>
          <Text type="secondary">
            Pregled dolazaka, troškova i performansi u realnom vremenu
          </Text>
        </div>
        <Space size={10} wrap>
          {filterButton}
          {exportButtons}
          <Tooltip title="Promijeni temu grafika">
            <Switch
              checkedChildren={<BulbOutlined />}
              unCheckedChildren={<BulbOutlined />}
              checked={dark}
              onChange={setDark}
            />
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Novi dolazak
          </Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="kpi-card kpi-card--blue">
            <Space align="start" size={16}>
              <div className="kpi-card__icon kpi-card__icon--primary">
                <DollarCircleOutlined />
              </div>
              <div className="kpi-card__body">
                <Text className="kpi-card__label">Ukupni troškovi (mjesec)</Text>
                <div className="kpi-card__value">{formatCurrency(totalCostCurrent, 0)}</div>
                <Space size={6} className="kpi-card__trend">
                  {costDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  <span>
                    {totalCostPrev > 0
                      ? `${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(1)}% vs prošli mjesec`
                      : totalCostCurrent > 0
                      ? "Novi troškovi ovog mjeseca"
                      : "Bez promjene"}
                  </span>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="kpi-card kpi-card--orange">
            <Space align="start" size={16}>
              <div className="kpi-card__icon kpi-card__icon--warning">
                <LineChartOutlined />
              </div>
              <div className="kpi-card__body">
                <Text className="kpi-card__label">Prosj. trošak po dolasku</Text>
                <div className="kpi-card__value">{formatCurrency(avgCostCurrent || 0)}</div>
                <Text className="kpi-card__hint">
                  {currentEntry?.count ?? 0} dolazaka u toku mjeseca
                </Text>
                {currentEntry?.count ? (
                  <Space size={6} className="kpi-card__trend">
                    {avgCostDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    <span>
                      {avgCostPrev > 0
                        ? `${avgCostDelta >= 0 ? "+" : ""}${avgCostDelta.toFixed(1)}% vs mjesec ranije`
                        : "Prvi podaci za ovaj period"}
                    </span>
                  </Space>
                ) : null}
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="kpi-card kpi-card--teal">
            <Space align="start" size={16}>
              <div className="kpi-card__icon kpi-card__icon--teal">
                <ClockCircleOutlined />
              </div>
              <div className="kpi-card__body">
                <Text className="kpi-card__label">Lead time (prosjek)</Text>
                <div className="kpi-card__value">{leadTimeCurrent.toFixed(1)} d</div>
                <Space size={6} className="kpi-card__trend">
                  {leadTimeDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  <span>
                    {leadTimePrev > 0
                      ? `${leadTimeDelta >= 0 ? "+" : ""}${leadTimeDelta.toFixed(1)}% vs mjesec ranije`
                      : "Postavljeno bez poređenja"}
                  </span>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="kpi-card kpi-card--red">
            <Space align="start" size={16}>
              <div className="kpi-card__icon kpi-card__icon--danger">
                <AlertOutlined />
              </div>
              <div className="kpi-card__body">
                <Text className="kpi-card__label">Kašnjenja</Text>
                <div className="kpi-card__value">{Math.round(delayCurrent)}</div>
                <Space size={6}>
                  <Tag color="volcano">{delayPctCurrent.toFixed(1)}%</Tag>
                  <Text className="kpi-card__hint">udio kasnih dolazaka</Text>
                </Space>
                {delayTotalPrev ? (
                  <Text className="kpi-card__trend">
                    {delayDelta >= 0 ? "+" : ""}{delayDelta.toFixed(1)}% vs prošli mjesec
                  </Text>
                ) : null}
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xxl={8}>
          <Card title="Status dolazaka" extra={<Tag color="blue">{statusTotal}</Tag>}>
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {Object.entries(statusLabelMap).map(([key, meta]) => {
                const value = statusCounts[key as keyof StatusCounts] ?? (qKpi.data?.by_status?.[key] ?? 0);
                return (
                  <Space
                    key={key}
                    align="center"
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <Space>
                      <Tag color={meta.color}>{meta.label}</Tag>
                    </Space>
                    <Text strong>{value}</Text>
                  </Space>
                );
              })}
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12} xxl={16}>
          <Card title="Najnovije aktivnosti" extra={<Button type="link" onClick={() => navigate("/notifications")}>Prikaži sve</Button>}>
            {isBusy ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : notifications.length ? (
              <List
                dataSource={notifications}
                renderItem={(item) => (
                  <List.Item
                    key={item.id}
                    actions={item.navigate_url ? [
                      <Button type="link" onClick={() => openNotification(item.navigate_url)}>
                        Otvori
                      </Button>,
                    ] : undefined}
                  >
                    <List.Item.Meta
                      avatar={<Avatar size="small" icon={<BellOutlined />} />}
                      title={<Text strong={!item.read}>{item.text}</Text>}
                      description={item.created_at ? dayjs(item.created_at).format("DD.MM.YYYY HH:mm") : ""}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Nema novijih aktivnosti" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <LineChartOutlined />
                <span>Trend troškova (mjesečno)</span>
              </Space>
            }
            extra={
              <Space>
                <Select
                  allowClear
                  showSearch
                  placeholder="Dobavljač"
                  style={{ width: 180 }}
                  value={supplierFilter}
                  onChange={(value) => setSupplierFilter(value || undefined)}
                  options={supplierOptions}
                  optionFilterProp="label"
                />
                <Select
                  allowClear
                  showSearch
                  placeholder="Kategorija"
                  style={{ width: 180 }}
                  value={categoryFilter}
                  onChange={(value) => setCategoryFilter(value || undefined)}
                  options={categoryOptions}
                  optionFilterProp="label"
                />
                <Button
                  size="small"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => {
                    const chart = costTrendRef.current?.getEchartsInstance?.();
                    if (chart) {
                      const url = chart.getDataURL({ pixelRatio: 2, backgroundColor: "#fff" });
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "trend_troskova.png";
                      a.click();
                    }
                  }}
                >
                  Export slika
                </Button>
              </Space>
            }
          >
            <div style={{ width: "100%", height: 320 }}>
              {isBusy ? (
                <Skeleton active />
              ) : costTrendData.length ? (
                <ReactECharts
                  ref={costTrendRef}
                  option={costTrendOption}
                  style={{ width: "100%", height: 320 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka za prikaz" />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>On-time performance</span>
              </Space>
            }
          >
            <div style={{ width: "100%", height: 320 }}>
              {isBusy ? (
                <Skeleton active />
              ) : onTimeData.length ? (
                <ReactECharts
                  option={onTimeOption}
                  style={{ width: "100%", height: 320 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={<Space><PieChartOutlined /><span>Troškovi po kategorijama</span></Space>}>
            <div style={{ width: "100%", height: 280 }}>
              {isBusy ? (
                <Skeleton active />
              ) : categoryDistribution.length ? (
                <ReactECharts
                  option={categoryPieOption}
                  style={{ width: "100%", height: 280 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<Space><TeamOutlined /><span>Po odgovornim osobama</span></Space>}>
            <div style={{ width: "100%", height: 280 }}>
              {isBusy ? (
                <Skeleton active />
              ) : responsibleDistribution.length ? (
                <ReactECharts
                  option={responsibleOption}
                  style={{ width: "100%", height: 280 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<Space><EnvironmentOutlined /><span>Distribucija po lokacijama</span></Space>}>
            <div style={{ width: "100%", height: 280 }}>
              {isBusy ? (
                <Skeleton active />
              ) : locationDistribution.length ? (
                <ReactECharts
                  option={locationOption}
                  style={{ width: "100%", height: 280 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Top 5 dobavljača po vrijednosti">
            <div style={{ width: "100%", height: 280 }}>
              {isBusy ? (
                <Skeleton active />
              ) : topSuppliers.length ? (
                <ReactECharts
                  option={topSuppliersOption}
                  style={{ width: "100%", height: 280 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top 5 kašnjenja (prosjek u danima)">
            <div style={{ width: "100%", height: 280 }}>
              {isBusy ? (
                <Skeleton active />
              ) : topDelays.length ? (
                <ReactECharts
                  option={topDelaysOption}
                  style={{ width: "100%", height: 280 }}
                  notMerge
                  lazyUpdate
                  theme={dark ? "dark" : undefined}
                  echarts={echarts}
                />
              ) : (
                <Empty description="Nema podataka" />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Divider />

      <Space align="center" style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={exportArrivalsXLSX} loading={exporting}>
            Izvoz u Excel
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={exportArrivalsPDF} loading={exporting}>
            Izvoz u PDF
          </Button>
        </Space>
        <Button type="link" onClick={() => setShowReport(true)}>
          Pogledaj sažetak izvještaja
        </Button>
      </Space>

      <Drawer
        title="Filteri"
        placement="right"
        width={360}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        destroyOnClose
        footer={
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button
              onClick={() => {
                setSupplierFilter(undefined);
                setCategoryFilter(undefined);
                setResponsibleFilter(undefined);
                setStatusFilter(undefined);
                setDateRange(null);
              }}
            >
              Reset
            </Button>
            <Button type="primary" onClick={() => setFiltersOpen(false)}>
              Primijeni
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          <Select
            allowClear
            showSearch
            labelInValue={false}
            placeholder="Dobavljač"
            value={supplierFilter}
            onChange={(value) => setSupplierFilter(value || undefined)}
            options={supplierOptions}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Kategorija"
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value || undefined)}
            options={categoryOptions}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Odgovorna osoba"
            value={responsibleFilter}
            onChange={(value) => setResponsibleFilter(value || undefined)}
            options={responsibleOptions}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || undefined)}
            options={statusOptions}
            optionFilterProp="label"
          />
          <RangePicker
            style={{ width: "100%" }}
            value={dateRange || undefined}
            onChange={(value) => setDateRange(value)}
            format="DD.MM.YYYY"
          />
        </Space>
      </Drawer>

      <Modal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        title="Brzi unos dolaska"
        onOk={() => {
          const formEl = document.getElementById("quick-create-form") as HTMLFormElement | null;
          formEl?.requestSubmit();
        }}
      >
        <form
          id="quick-create-form"
          onSubmit={createArrival}
          style={{ display: "grid", gap: 12 }}
        >
          <input
            required
            placeholder="Dobavljač"
            value={form.supplier}
            onChange={(event) => setForm((prev) => ({ ...prev, supplier: event.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
          <select
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
          >
            <option value="not_shipped">Najavljeno</option>
            <option value="shipped">U transportu</option>
            <option value="arrived">Stiglo</option>
          </select>
          <input
            type="date"
            value={form.eta}
            onChange={(event) => setForm((prev) => ({ ...prev, eta: event.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </form>
      </Modal>

      <Modal
        open={showReport}
        onCancel={() => setShowReport(false)}
        footer={null}
        title="Strategijski pregled"
        width={720}
      >
        <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: reportHtml }} />
      </Modal>
    </div>
  );
}
