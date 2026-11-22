import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SecuritySuiteWindow } from "./components/SecuritySuiteWindow";
import "./App.css";

const urlParams = new URLSearchParams(window.location.search);
const isSecurityWindow = urlParams.get("window") === "security";
const initialTab = urlParams.get("tab") || "antivirus";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isSecurityWindow ? (
      <SecuritySuiteWindow initialTab={initialTab} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
