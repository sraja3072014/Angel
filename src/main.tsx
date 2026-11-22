import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SecuritySuiteWindow } from "./components/SecuritySuiteWindow";
import { MenuControlCenterWindow } from "./components/MenuControlCenterWindow";
import "./App.css";

const urlParams = new URLSearchParams(window.location.search);
const windowType = urlParams.get("window");
const initialTab = urlParams.get("tab") || undefined;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {windowType === "security" ? (
      <SecuritySuiteWindow initialTab={initialTab || "antivirus"} />
    ) : windowType === "menu" ? (
      <MenuControlCenterWindow initialTab={initialTab || "general"} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

