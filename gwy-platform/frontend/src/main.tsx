import React from "react";
import "./theme/tokens.css";
import "./theme/global.css";
import "./theme/components.css";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";
import { registerSW } from "./pwa/registerSW";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

// 离线优先：注册 Service Worker
registerSW();
