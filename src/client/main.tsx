import React from "react";
import ReactDOM from "react-dom/client";
import Router from "./app/router";
import { ToastProvider } from "./components/ui/ToastProvider";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <Router />
    </ToastProvider>
  </React.StrictMode>
);