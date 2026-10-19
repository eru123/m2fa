import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (rootEl !== null) {
  createRoot(rootEl).render(<App />);
}
