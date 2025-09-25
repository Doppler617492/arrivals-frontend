// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { ConfigProvider, theme as antdTheme, App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { wireRealtimeToQueryClient } from './lib/realtime';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  }
});

// Wire realtime WS to React Query cache updates
wireRealtimeToQueryClient(queryClient);

const Root = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
  </QueryClientProvider>
);

const mountNode = document.getElementById('root')!;
const AppTree = (
  <ConfigProvider
    theme={{
      algorithm: [antdTheme.defaultAlgorithm, antdTheme.compactAlgorithm],
      token: {
        colorPrimary: '#3f5ae0',
        borderRadius: 8,
        fontSize: 13,
        colorBorder: '#e5e7eb',
        colorBgContainer: '#ffffff',
      },
    }}
    componentSize="small"
  >
    <AntApp>
      {Root}
    </AntApp>
  </ConfigProvider>
);

const root = ReactDOM.createRoot(mountNode);
if (import.meta.env.MODE === 'production') {
  root.render(
    <React.StrictMode>
      {AppTree}
    </React.StrictMode>
  );
} else {
  // Disable StrictMode in dev to prevent double-mount side effects (e.g., Leaflet maps)
  root.render(AppTree);
}
