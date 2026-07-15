import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./admin-extra.css";
import "./admin-editor.css";
import "./local-polish.css";
import "./local-overrides.css";
import "./compact-density.css";
import "./collab-readable.css";
import "./traces-readable.css";
import "./agent-polish.css";
import "./theme.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
