import { useState, useMemo, useCallback } from "react";
import { Card, Table, Space, Tag, Badge, Button, Input, Select, DatePicker, Typography, message, Popconfirm } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGET, apiPOST, getToken, API_BASE } from "../api/client";
import type { ColumnsType } from "antd/es/table";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

type NotificationRecord = {
  id: number;
  text: string;
  read: boolean;
  created_at?: string;
  navigate_url?: string;
  entity_type?: string;
  entity_id?: number;
  type?: string;
  event?: string;
};

type StatusFilter = "all" | "unread" | "read";

type QueryFilters = {
  status: StatusFilter;
  typeKey: string;
  from?: string;
  to?: string;
  search?: string;
};

function useNotificationsData(filters: QueryFilters) {
  return useQuery<{ items: NotificationRecord[] }>({
    queryKey: ["notifications", "list", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "1000");
      try {
        const data = await apiGET<NotificationRecord[]>(`/api/notifications?${params.toString()}`, true);
        return { items: Array.isArray(data) ? data : [] };
      } catch (error) {
        console.error("Failed to fetch notifications", error);
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

function getTypeLabel(notif: NotificationRecord) {
  const key = (notif.event || notif.type || "generic").toLowerCase();
  if (key.includes("arrival") || key.includes("dolazak")) return "Dolazak";
  if (key.includes("pickup")) return "Pickup";
  if (key.includes("payment") || key.includes("pla")) return "Plaćanje";
  if (key.includes("status")) return "Status";
  if (key.includes("task") || key.includes("zadatak")) return "Zadatak";
  if (key.includes("container")) return "Kontejner";
  return (notif.event || notif.type || "Ostalo").toString();
}

function getTypeColor(label: string) {
  const key = label.toLowerCase();
  if (key.includes("dolazak")) return "blue";
  if (key.includes("pickup")) return "gold";
  if (key.includes("pla")) return "green";
  if (key.includes("kontejner")) return "geekblue";
  if (key.includes("zadatak")) return "purple";
  return "default";
}

async function markNotifications(ids: number[], read: boolean) {
  if (!ids.length) return;
  await apiPOST(`/api/notifications/ack`, { ids, read }, { auth: true });
}

async function deleteNotifications(ids: number[]) {
  if (!ids.length) return;
  const token = getToken();
  for (const id of ids) {
    await fetch(`${API_BASE}/api/notifications/${id}`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
      credentials: "include",
    });
  }
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [search, setSearch] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const filters: QueryFilters = useMemo(() => ({
    status: statusFilter,
    typeKey: typeFilter,
    from: range?.[0]?.startOf("day").toISOString(),
    to: range?.[1]?.endOf("day").toISOString(),
    search: search.trim().toLowerCase() || undefined,
  }), [statusFilter, typeFilter, range, search]);

  const { data, isLoading, refetch } = useNotificationsData(filters);
  const items = data?.items || [];

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.status === "unread" && item.read) return false;
      if (filters.status === "read" && !item.read) return false;
      if (filters.typeKey) {
        const label = getTypeLabel(item).toLowerCase();
        if (label !== filters.typeKey.toLowerCase()) return false;
      }
      if (filters.search) {
        const text = [item.text, item.event, item.type].join(" ").toLowerCase();
        if (!text.includes(filters.search)) return false;
      }
      if (filters.from) {
        const created = item.created_at ? dayjs(item.created_at) : null;
        if (!created || created.isBefore(dayjs(filters.from))) return false;
      }
      if (filters.to) {
        const created = item.created_at ? dayjs(item.created_at) : null;
        if (!created || created.isAfter(dayjs(filters.to))) return false;
      }
      return true;
    });
  }, [items, filters]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aTime = a.created_at ? dayjs(a.created_at).valueOf() : 0;
      const bTime = b.created_at ? dayjs(b.created_at).valueOf() : 0;
      return bTime - aTime;
    });
  }, [filteredItems]);

  const selectedIds = useMemo(() => selectedRowKeys.map((key) => Number(key)), [selectedRowKeys]);
  const bulkTargetIds = selectedIds.length ? selectedIds : sortedItems.map((item) => item.id);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      set.add(getTypeLabel(item));
    });
    return Array.from(set).sort().map((label) => ({ label, value: label }));
  }, [items]);

  const handleMark = useCallback(async (ids: number[], read: boolean) => {
    try {
      await markNotifications(ids, read);
      message.success(read ? "Označeno kao pročitano." : "Označeno kao nepročitano.");
      setSelectedRowKeys([]);
      await queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    } catch (error) {
      console.error(error);
      message.error("Ažuriranje statusa nije uspjelo.");
    }
  }, [queryClient]);

  const handleDelete = useCallback(async (ids: number[]) => {
    try {
      await deleteNotifications(ids);
      message.success("Notifikacije obrisane.");
      setSelectedRowKeys([]);
      await queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    } catch (error) {
      console.error(error);
      message.error("Brisanje nije uspjelo.");
    }
  }, [queryClient]);

  const columns: ColumnsType<NotificationRecord> = [
    {
      title: "Tip",
      dataIndex: "event",
      key: "type",
      render: (_, record) => {
        const label = getTypeLabel(record);
        return <Tag color={getTypeColor(label)}>{label}</Tag>;
      },
      width: 180,
    },
    {
      title: "Poruka",
      dataIndex: "text",
      key: "text",
      render: (value: string, record) => (
        <Space direction="vertical" size={4} style={{ maxWidth: 480 }}>
          <Text strong={!record.read}>{value}</Text>
          {record.navigate_url ? (
            <a href={record.navigate_url} target="_blank" rel="noopener noreferrer">Detalji</a>
          ) : null}
        </Space>
      ),
    },
    {
      title: "Datum",
      dataIndex: "created_at",
      key: "created_at",
      width: 200,
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      defaultSortOrder: "descend",
      render: (value: string | undefined) => value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "–",
    },
    {
      title: "Status",
      dataIndex: "read",
      key: "status",
      width: 140,
      filters: [
        { text: "Nepročitane", value: "unread" },
        { text: "Pročitane", value: "read" },
      ],
      onFilter: (value, record) => value === "read" ? record.read : !record.read,
      render: (value: boolean) => value ? <Badge status="default" text="Pročitano" /> : <Badge status="processing" text={<strong>Nepročitano</strong>} />,
    },
    {
      title: "Akcije",
      key: "actions",
      width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" type="link" onClick={() => handleMark([record.id], !record.read)}>
            {record.read ? "Označi nepročitano" : "Označi pročitano"}
          </Button>
          <Popconfirm title="Obrisati notifikaciju?" onConfirm={() => handleDelete([record.id])} okText="Da" cancelText="Ne">
            <Button size="small" type="link" danger>
              Obriši
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <Space direction="vertical" style={{ width: "100%" }} size={20}>
          <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
            <Title level={4} style={{ margin: 0 }}>Notifikacije</Title>
            <Space>
              <Button onClick={() => handleMark(bulkTargetIds, true)} disabled={!bulkTargetIds.length}>
                Označi sve kao pročitano
              </Button>
              <Popconfirm
                title={selectedIds.length ? "Obrisati označene notifikacije?" : "Obrisati sve prikazane notifikacije?"}
                onConfirm={() => handleDelete(bulkTargetIds)}
                okText="Da"
                cancelText="Ne"
              >
                <Button danger disabled={!bulkTargetIds.length}>Izbriši sve</Button>
              </Popconfirm>
            </Space>
          </Space>

          <Space wrap size={12}>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { label: "Sve", value: "all" },
                { label: "Nepročitane", value: "unread" },
                { label: "Pročitane", value: "read" },
              ]}
              style={{ width: 160 }}
            />
            <Select
              allowClear
              placeholder="Tip"
              value={typeFilter || undefined}
              onChange={(v) => setTypeFilter(v || "")}
              options={typeOptions}
              style={{ width: 200 }}
            />
            <RangePicker
              value={range || undefined}
              onChange={(values) => setRange(values as [Dayjs | null, Dayjs | null] | null)}
              format="DD.MM.YYYY"
            />
            <Input.Search
              allowClear
              placeholder="Pretraga (tekst, tip)"
              style={{ width: 240 }}
              onSearch={setSearch}
            />
            <Select
              value={pageSize}
              onChange={(v) => setPageSize(v)}
              options={[{ value: 20, label: "20" }, { value: 50, label: "50" }, { value: 100, label: "100" }]}
              style={{ width: 120 }}
            />
            <Button onClick={() => { setStatusFilter("all"); setTypeFilter(""); setRange(null); setSearch(""); refetch(); }}>Reset</Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Table<NotificationRecord>
          rowKey="id"
          dataSource={sortedItems}
          columns={columns}
          loading={isLoading}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            pageSize,
            showSizeChanger: false,
          }}
          bordered
          size="middle"
          sticky
          rowClassName={(record) => record.read ? "notif-row--read" : "notif-row--unread"}
          locale={{
            emptyText: isLoading ? "" : "Nema notifikacija za zadate filtere.",
          }}
        />
      </Card>
    </div>
  );
}
