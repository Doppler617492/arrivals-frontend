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
  clear: () => void;
};

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: [],
      unreadCount: 0,
      lastId: Number(localStorage.getItem('notifications_last_id') || '0') || 0,
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
        try { localStorage.setItem('notifications_last_id', String(lastId)); } catch {}
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
        try { localStorage.setItem('notifications_last_id', String(lastId)); } catch {}
        set({ items: next, lastId, unreadCount: (get().unreadCount + (n.read ? 0 : 1)) });
      },
      markRead: (id, read = true) => {
        const items = get().items.map((it) => it.id === id ? { ...it, read } : it);
        const wasUnread = get().items.find((it) => it.id === id && !it.read);
        set({ items, unreadCount: Math.max(0, get().unreadCount - (wasUnread ? 1 : 0)) });
      },
      clear: () => set({ items: [], unreadCount: 0 }),
    }),
    { name: 'notifications-store', partialize: (s) => ({ lastId: s.lastId }) }
  )
);

