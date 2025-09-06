// src/styles.ts
import type React from "react";

const styles: Record<string, React.CSSProperties> = {
  // Full-page background wrapper (safe default)
  pageRoot: {
    minHeight: "100vh",
    width: "100%",
    background: "linear-gradient(180deg, #f7f9ff 0%, #eef2ff 60%, #f8fafc 100%)",
    color: "#0b1220",
  },

  // Centers any content (login, dashboards) both axes
  centeredPage: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(180deg, #f7f9ff 0%, #eef2ff 60%, #f8fafc 100%)",
    padding: 24,
  },

  // Main layout area inside pages
  mainWrapper: {
    display: "flex",
    justifyContent: "center",
    padding: 24,
  },

  // Max-width container for page content
  container: {
    width: "100%",
    maxWidth: 1200,
  },

  // Simple card panel
  card: {
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    border: "1px solid rgba(2, 6, 23, 0.06)",
  },

  // Header bar
  headerBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
  },
};

export default styles;