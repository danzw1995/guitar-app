import fs from "node:fs";
import { renderPng } from "./src/render.mjs";
const tex = "\\tempo 80\n\\ts (4 4)\n(3.5 2.4 0.3 1.2 0.1).8 {bd} (3.5{pm} 2.4{pm} 0.3{pm} 1.2{pm} 0.1{pm}).8 {bd} r.8 (3.5 2.4 0.3 1.2 0.1).8 {bd} 3.5.4 2.4.4 0.3.4 1.2.4 | (3.5 2.4 0.3 1.2 0.1).8 3.5.8 2.4.8 0.3.8 1.2.8 3.5.4 2.4.4 0.3.4";
const r = await renderPng(tex, { width: 620, theme: "dark", tabFontSize: 15, engraving: { tabLineSpacing: 18 } });
fs.writeFileSync("pm-ext.png", r.data);
console.log("ok", r.width, r.height);
