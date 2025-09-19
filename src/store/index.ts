import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

type AuthState = {
  user: User | null;
  setUser: (u: User | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user }),
    }
  )
);

// --- UI slice (sidebar, enterprise toggles, etc.) ---
type UIState = {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  // Enterprise theme controls
  themeColor: 'blue' | 'green' | 'red' | 'yellow' | 'black';
  setThemeColor: (c: UIState['themeColor']) => void;
  headerFixed: boolean;
  setHeaderFixed: (v: boolean) => void;
  headerTransparent: boolean;
  setHeaderTransparent: (v: boolean) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      themeColor: 'blue',
      setThemeColor: (c) => set({ themeColor: c }),
      headerFixed: true,
      setHeaderFixed: (v) => set({ headerFixed: v }),
      headerTransparent: true,
      setHeaderTransparent: (v) => set({ headerTransparent: v }),
      darkMode: false,
      setDarkMode: (v) => set({ darkMode: v }),
    }),
    { name: 'ui-store' }
  )
);
