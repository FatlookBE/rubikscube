import "./styles.css";
import { RubiCoachApp } from "./app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Point de montage introuvable");
}

new RubiCoachApp(root);
