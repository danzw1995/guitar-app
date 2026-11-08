import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  // 版本号只写在这里，页脚不再硬编码，避免又一次漂移（v0.2.x 页脚曾停在 v0.2.0）。
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    host: "127.0.0.1",
    watch: {
      // 有些编辑器和工具用「临时目录 + 原子重命名」保存文件，Vite 会去 watch 那个
      // 一闪而过的临时目录，然后因为文件已经没了/被占用直接崩掉 dev server
      // （EBUSY: resource busy or locked）。忽略掉这些中转目录即可。
      ignored: ["**/.*.tmpdir/**", "**/*.tmpdir/**", "**/.tmp/**"],
    },
  },
});
