import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";  // ← Tailwind を読み込む

createRoot(document.getElementById("root")).render(<App />);
