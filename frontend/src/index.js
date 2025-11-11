import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { TenantProvider } from "@/contexts/TenantContext";
import { APIProvider } from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'drawing']}>
      <TenantProvider>
        <App />
      </TenantProvider>
    </APIProvider>
  </React.StrictMode>,
);
