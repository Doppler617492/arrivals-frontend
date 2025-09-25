import React from 'react';
import L, { DivIcon, type LatLngExpression } from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Tooltip as LeafletTooltip,
  Polyline,
  useMap,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Card, Space, Switch, Typography, Badge } from 'antd';
import 'leaflet/dist/leaflet.css';

import { apiGET } from '../api/client';
import { useUIStore } from '../store';

import './Vozila.css';

type DevicePosition = {
  latitude?: number;
  longitude?: number;
  speed?: number; // m/s
  time?: string;
  address?: string | null;
  stale?: boolean | null;
  course?: number | null;
};

type VehicleDevice = {
  id: string | number;
  name?: string;
  status?: string;
  source?: string;
  position?: DevicePosition | null;
};

type Snapshot = VehicleDevice[];

type HistoryPoint = {
  lat: number;
  lon: number;
  time: string;
};

type VehicleStatus = 'moving' | 'idle' | 'offline';

type MarkerDatum = {
  id: string;
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number | null;
  status: VehicleStatus;
  updatedAt: string | null;
  ageMinutes: number;
  stale: boolean;
  name: string;
  source: string;
  address?: string | null;
};

const MOVING_THRESHOLD_KMH = Number(import.meta.env.VITE_SPEED_MOVING_THRESHOLD_KMH ?? 5);
const STALE_MINUTES = Number(import.meta.env.VITE_STALE_MINUTES ?? 10);
const OFFLINE_MINUTES = Number(import.meta.env.VITE_OFFLINE_MINUTES ?? (STALE_MINUTES + 5));
const HISTORY_POINTS = Number(import.meta.env.VITE_TRACK_POINTS ?? 12);
const TRAIL_SMOOTHING_METERS = 30;

const formatter = new Intl.DateTimeFormat('sr-RS', {
  hour12: false,
  timeZone: 'Europe/Podgorica',
  dateStyle: 'short',
  timeStyle: 'short',
});

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  try {
    return formatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

function differenceMinutes(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  try {
    const now = Date.now();
    const ts = new Date(iso).getTime();
    return (now - ts) / 60000;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function toKmh(speed?: number | null): number {
  if (speed == null) return 0;
  if (!Number.isFinite(speed)) return 0;
  return Math.max(0, Math.round(speed * 3.6));
}

function computeStatus(speedKmh: number, ageMinutes: number): VehicleStatus {
  if (!Number.isFinite(ageMinutes) || ageMinutes > OFFLINE_MINUTES) {
    return 'offline';
  }
  if (speedKmh > MOVING_THRESHOLD_KMH) {
    return 'moving';
  }
  if (ageMinutes <= STALE_MINUTES) {
    return 'idle';
  }
  return 'offline';
}

function haversineMeters(a: HistoryPoint, b: HistoryPoint): number {
  const R = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dlat = ((b.lat - a.lat) * Math.PI) / 180;
  const dlon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDLat = Math.sin(dlat / 2);
  const sinDLon = Math.sin(dlon / 2);
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function bearingDeg(from: HistoryPoint, to: HistoryPoint): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  const deg = (brng * 180) / Math.PI;
  return (deg + 360) % 360;
}

function detectVehicleType(name: string): 'car' | 'van' | 'truck' {
  const value = name.toLowerCase();
  if (/(kamion|truck|scania|mercedes actros|daf|fh\b|volvo)/.test(value)) {
    return 'truck';
  }
  if (/(kombi|van|transit|sprinter|ducato|bus|autobus)/.test(value)) {
    return 'van';
  }
  return 'car';
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"]+/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return match;
    }
  });
}

type IconOptions = {
  datum: MarkerDatum;
  label: string;
  showLabel: boolean;
  darkMode: boolean;
  selected: boolean;
};

const ICON_CACHE = new Map<string, DivIcon>();

function iconKey(opts: IconOptions, baseColor: string): string {
  const { datum, showLabel, darkMode, selected } = opts;
  const headingKey = datum.heading == null ? 'na' : Math.round(datum.heading);
  return [
    datum.status,
    detectVehicleType(opts.label),
    showLabel ? '1' : '0',
    darkMode ? '1' : '0',
    selected ? 'sel' : '0',
    baseColor,
    opts.label,
    headingKey,
  ].join('|');
}

function buildIcon(opts: IconOptions): DivIcon {
  const { datum, label, showLabel, darkMode, selected } = opts;
  const type = detectVehicleType(label);
  const statusColor = datum.status === 'moving' ? '#16a34a' : datum.status === 'idle' ? '#facc15' : '#94a3b8';
  const outline = darkMode ? '#111827' : '#f8fafc';
  const stroke = '#0f172a';
  const baseColor = statusColor;
  const cacheId = iconKey(opts, baseColor);
  const cached = ICON_CACHE.get(cacheId);
  if (cached) {
    return cached;
  }

  const size = type === 'truck' ? 32 : type === 'van' ? 28 : 26;
  const labelHtml = showLabel
    ? `<span class="vehicle-label">${escapeHtml(label)}</span>`
    : '';
  const svg = (() => {
    if (type === 'truck') {
      return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="17" width="24" height="16" rx="3" fill="${baseColor}" stroke="${stroke}" stroke-width="2" />
        <path d="M26 21h8l6 6v6h-14" fill="${baseColor}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
        <circle cx="14" cy="35" r="5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
        <circle cx="34" cy="35" r="5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
      </svg>`;
    }
    if (type === 'van') {
      return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="17" width="28" height="14" rx="4" fill="${baseColor}" stroke="${stroke}" stroke-width="2" />
        <path d="M32 21h6l6 6v4h-12" fill="${baseColor}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
        <circle cx="16" cy="33" r="4.5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
        <circle cx="34" cy="33" r="4.5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
      </svg>`;
    }
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 30h32l-4-11c-.7-1.9-2.5-3-4.5-3h-15c-2 0-3.8 1.2-4.5 3l-4 11Z" fill="${baseColor}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
      <circle cx="16" cy="34" r="5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
      <circle cx="32" cy="34" r="5" fill="${outline}" stroke="${stroke}" stroke-width="2" />
    </svg>`;
  })();

  const rotation = datum.heading ?? 0;
  const html = `
    <div class="vehicle-marker ${datum.status}${selected ? ' selected' : ''} ${darkMode ? 'dark' : ''}">
      <div class="vehicle-icon" style="transform: rotate(${rotation}deg); width:${size}px; height:${size}px;">
        ${svg}
      </div>
      ${labelHtml}
    </div>
  `;

  const icon = L.divIcon({
    html,
    className: 'vehicle-marker-wrapper',
    iconSize: [showLabel ? size + label.length * 7 + 12 : size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [size / 2, -size / 2],
  });
  ICON_CACHE.set(cacheId, icon);
  return icon;
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  React.useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points as [number, number][]);
    if (!bounds.isValid()) return;
    try {
      map.fitBounds(bounds.pad(0.2), { animate: false });
    } catch {
      /* ignore */
    }
  }, [points, map]);
  return null;
}

export default function VozilaPage() {
  const darkMode = useUIStore((s) => s.darkMode);
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<Snapshot>([]);
  const [showLabels, setShowLabels] = React.useState(true);
  const [showTrails, setShowTrails] = React.useState(false);
  const [cluster, setCluster] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const historyRef = React.useRef<Record<string, HistoryPoint[]>>({});

  React.useEffect(() => {
    setReady(true);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const devices = await apiGET<Snapshot>('/api/vehicles', true);
      const list = Array.isArray(devices) ? devices : [];
      const hist = historyRef.current;

      list.forEach((device) => {
        if (!device || !device.position) return;
        const { latitude, longitude, time } = device.position;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        if (!time) return;
        const id = String(device.id);
        const current: HistoryPoint = { lat: Number(latitude), lon: Number(longitude), time };
        const prevList = hist[id] ?? [];
        const last = prevList[prevList.length - 1];
        if (!last || haversineMeters(last, current) > TRAIL_SMOOTHING_METERS) {
          const next = [...prevList, current].slice(-HISTORY_POINTS);
          hist[id] = next;
        } else {
          // update timestamp even if position identical
          prevList[prevList.length - 1] = current;
          hist[id] = prevList;
        }
      });

      // prune histories for devices that disappeared
      const ids = new Set(list.map((d) => String(d.id)));
      Object.keys(historyRef.current).forEach((key) => {
        if (!ids.has(key)) {
          delete historyRef.current[key];
        }
      });

      setSnapshot(list);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Greška pri učitavanju vozila';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const markers: MarkerDatum[] = React.useMemo(() => {
    if (!Array.isArray(snapshot)) return [];
    return snapshot
      .map((device) => {
        const id = String(device?.id ?? '');
        const pos = device?.position;
        if (!pos) return null;
        const lat = Number(pos.latitude);
        const lon = Number(pos.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const speedKmh = toKmh(pos.speed);
        const updatedAt = pos.time ?? null;
        const ageMinutes = differenceMinutes(updatedAt);
        const status = computeStatus(speedKmh, ageMinutes);
        const stale = ageMinutes > STALE_MINUTES;

        let heading: number | null = null;
        if (pos.course != null && Number.isFinite(pos.course)) {
          heading = Number(pos.course);
        } else {
          const history = historyRef.current[id] ?? [];
          if (history.length >= 2) {
            const last = history[history.length - 1];
            let prev = history[history.length - 2];
            for (let i = history.length - 2; i >= 0; i -= 1) {
              prev = history[i];
              if (prev && haversineMeters(prev, last) > 1) {
                break;
              }
            }
            if (prev && last) {
              heading = bearingDeg(prev, last);
            }
          }
        }

        return {
          id,
          lat,
          lon,
          speedKmh,
          heading,
          status,
          stale,
          updatedAt,
          ageMinutes,
          name: String(device?.name || id),
          source: String(device?.source || 'A').toUpperCase(),
          address: pos.address,
        } satisfies MarkerDatum;
      })
      .filter(Boolean) as MarkerDatum[];
  }, [snapshot]);

  const points = React.useMemo(
    () => markers.map((m) => [m.lat, m.lon] as [number, number]),
    [markers],
  );

  const total = markers.length;
  const movingCount = markers.filter((m) => m.status === 'moving').length;
  const idleCount = markers.filter((m) => m.status === 'idle').length;
  const offlineCount = total - movingCount - idleCount;

  const markerElements = React.useMemo(() => {
    return markers.map((m) => {
      const icon = buildIcon({
        datum: m,
        label: m.name,
        showLabel: showLabels,
        darkMode,
        selected: selectedId === m.id,
      });
      const zIndex = m.status === 'moving' ? 400 : m.status === 'idle' ? 350 : 300;
      const history = historyRef.current[m.id] ?? [];
      const trailPoints = history.map((p) => [p.lat, p.lon]) as LatLngExpression[];
      const trailColor = m.status === 'moving' ? '#16a34a88' : m.status === 'idle' ? '#facc1588' : '#94a3b888';

      return (
        <React.Fragment key={m.id}>
          <MarkerAny
            position={[m.lat, m.lon]}
            icon={icon}
            zIndexOffset={selectedId === m.id ? zIndex + 200 : zIndex}
            eventHandlers={{
              click: () => setSelectedId(m.id),
            }}
          >
            <TooltipAny direction="top" offset={[0, -20]}>
              <div className="vehicle-tooltip">
                <div className="vehicle-tooltip__title">{m.name}</div>
                <div className="vehicle-tooltip__row">Status: <strong>{m.status.toUpperCase()}</strong></div>
                <div className="vehicle-tooltip__row">Brzina: <strong>{m.speedKmh} km/h</strong></div>
                <div className="vehicle-tooltip__row">Ažurirano: <strong>{fmtTime(m.updatedAt)}</strong></div>
                {m.address ? (
                  <div className="vehicle-tooltip__row vehicle-tooltip__row--muted">{m.address}</div>
                ) : null}
              </div>
            </TooltipAny>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>{m.name}</Typography.Title>
                <div>Izvor: <strong>{m.source}</strong></div>
                <div>Status: <strong>{m.status}</strong></div>
                <div>Brzina: <strong>{m.speedKmh} km/h</strong></div>
                <div>Smjer: <strong>{Math.round((m.heading ?? 0 + 360) % 360)}°</strong></div>
                <div>Zadnja poruka: <strong>{fmtTime(m.updatedAt)}</strong></div>
                {m.address ? <div style={{ marginTop: 8, color: '#64748b' }}>{m.address}</div> : null}
              </div>
            </Popup>
          </MarkerAny>
          {showTrails && trailPoints.length > 1 ? (
            <PolylineAny
              key={`${m.id}-trail`}
              positions={trailPoints}
              pathOptions={{ color: trailColor, weight: 3, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }}
              interactive={false}
            />
          ) : null}
        </React.Fragment>
      );
    });
  }, [markers, darkMode, showLabels, showTrails, selectedId]);

  return (
    <div className="um-container vozila-page">
      <div className="um-header" style={{ marginBottom: 20 }}>
        <div className="um-title">Vozila</div>
        <div className="um-actions" />
      </div>

      <div className="um-metrics" style={{ marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="um-card">
          <div className="um-card-title">Ukupno vozila</div>
          <div className="um-card-value">{total}</div>
        </div>
        <div className="um-card">
          <div className="um-card-title">U pokretu</div>
          <div className="um-card-value" style={{ color: '#16a34a' }}>{movingCount}</div>
        </div>
        <div className="um-card">
          <div className="um-card-title">U mjestu (&lt; {MOVING_THRESHOLD_KMH} km/h)</div>
          <div className="um-card-value" style={{ color: '#facc15' }}>{idleCount}</div>
        </div>
        <div className="um-card">
          <div className="um-card-title">Offline (&gt; {STALE_MINUTES} min)</div>
          <div className="um-card-value" style={{ color: '#94a3b8' }}>{offlineCount}</div>
        </div>
      </div>

      <Card
        style={{ borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}
        styles={{ body: { padding: 0, background: darkMode ? '#0f172a' : '#ffffff' } }}
      >
        <div className="vozila-map-wrapper">
          {ready ? (
            <MapContainerAny
              center={[42.44, 19.26]}
              zoom={7}
              style={{ width: '100%', height: '100%' }}
              preferCanvas
            >
              <TileLayerAny
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {points.length ? <FitBounds points={points} /> : null}
              {cluster ? (
                <MarkerClusterGroup chunkedLoading removeOutsideVisibleBounds maxClusterRadius={60}>
                  {markerElements}
                </MarkerClusterGroup>
              ) : (
                markerElements
              )}
            </MapContainerAny>
          ) : null}
        </div>
      </Card>

      <div className="vozila-controls">
        <Space size="large" wrap>
          <div className="vozila-control">
            <span>Prikaži labelu</span>
            <Switch checked={showLabels} onChange={(checked) => setShowLabels(checked)} />
          </div>
          <div className="vozila-control">
            <span>Prikaži trag</span>
            <Switch checked={showTrails} onChange={(checked) => setShowTrails(checked)} />
          </div>
          <div className="vozila-control">
            <span>Klasteri</span>
            <Switch checked={cluster} onChange={(checked) => setCluster(checked)} />
          </div>
          <div className="vozila-legend">
            <Badge color="#16a34a" text="Kreće se" />
            <Badge color="#facc15" text="U mjestu" />
            <Badge color="#94a3b8" text="Offline" />
          </div>
        </Space>
      </div>

      {loading ? (
        <div className="vozila-status vozila-status--loading">Učitavanje…</div>
      ) : null}
      {error ? (
        <div className="vozila-status vozila-status--error">{error}</div>
      ) : null}
    </div>
  );
}
const MapContainerAny = MapContainer as unknown as React.ComponentType<any>;
const TileLayerAny = TileLayer as unknown as React.ComponentType<any>;
const MarkerAny = Marker as unknown as React.ComponentType<any>;
const TooltipAny = LeafletTooltip as unknown as React.ComponentType<any>;
const PolylineAny = Polyline as unknown as React.ComponentType<any>;
