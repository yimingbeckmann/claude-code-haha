import React from "react";
import ReactDOM from "react-dom/client";
import AppShell from "./components/shell/AppShell";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/messages.css";
import "./styles/new-features.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
