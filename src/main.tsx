import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "sonner";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="min-h-screen bg-background text-foreground">
      <App />
      <Toaster position="top-right" richColors closeButton />
    </main>
  </React.StrictMode>
);
