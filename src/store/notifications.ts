import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Notification = {
  id: number;
  text: string;
  read?: boolean;
  type?: string;
  event?: string;
  entity_type?: string;
  entity_id?: number;
  created_at?: string;
  navigate_url?: string;
};

type NotificationsState = {
  items: Notification[];
  unreadCount: number;
  lastId: number;
  setUnreadCount: (n: number) => void;
  setList: (list: Notification[]) => void;
  add: (n: Notification) => void;
  markRead: (id: number, read?: boolean) => void;
  markMany: (ids: number[], read?: boolean) => void;
  remove: (id: number) => void;
  clear: () => void;
};

function readLastId(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem('notifications_last_id') || '0';
    return Number(raw) || 0;
  } catch {
    return 0;
  }
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      unreadCount: 0,
      lastId: readLastId(),
      setUnreadCount: (n) => set({ unreadCount: Math.max(0, Number(n) || 0) }),
      setList: (list) => {
        // Dedup by id and sort desc by created_at/id
        const map = new Map<number, Notification>();
        for (const it of list || []) {
          if (!it || typeof it.id !== 'number') continue;
          map.set(it.id, it);
        }
        const items = Array.from(map.values()).sort((a,b) => (b.id||0) - (a.id||0));
        const lastId = items.length ? Number(items[0].id) : (get().lastId || 0);
        try { localStorage.setItem('notifications_last_id', String(lastId)); } catch (err) { /* ignore */ }
        // Compute unread
        const unread = items.reduce((acc, it) => acc + (it.read ? 0 : 1), 0);
        set({ items, lastId, unreadCount: unread });
      },
      add: (n) => {
        if (!n || typeof n.id !== 'number') return;
        const items = get().items;
        if (items.find((x) => x.id === n.id)) return;
        const next = [n, ...items].slice(0, 200);
        const lastId = Math.max(get().lastId || 0, Number(n.id));
        try { localStorage.setItem('notifications_last_id', String(lastId)); } catch (err) { /* ignore */ }
        set({ items: next, lastId, unreadCount: (get().unreadCount + (n.read ? 0 : 1)) });
      },
      markRead: (id, read = true) => {
        const items = get().items.map((it) => it.id === id ? { ...it, read } : it);
        const wasUnread = get().items.find((it) => it.id === id && !it.read);
        set({ items, unreadCount: Math.max(0, get().unreadCount - (wasUnread ? 1 : 0)) });
      },
      markMany: (ids, read = true) => {
        if (!Array.isArray(ids) || !ids.length) return;
        const idSet = new Set(ids.map(Number));
        const before = get().items;
        let delta = 0;
        const items = before.map((it) => {
          if (!idSet.has(Number(it.id))) return it;
          const next = { ...it, read };
          if (!it.read && read) delta += 1;
          if (it.read && !read) delta -= 1;
          return next;
        });
        const nextUnread = Math.max(0, get().unreadCount - delta);
        set({ items, unreadCount: nextUnread });
      },
      remove: (id) => {
        const items = get().items;
        const existing = items.find((it) => it.id === id);
        if (!existing) return;
        const next = items.filter((it) => it.id !== id);
        set({ items: next, unreadCount: Math.max(0, get().unreadCount - (existing.read ? 0 : 1)) });
      },
      clear: () => set({ items: [], unreadCount: 0 }),
    }),
    { name: 'notifications-store', partialize: (s) => ({ lastId: s.lastId }) }
  )
);
