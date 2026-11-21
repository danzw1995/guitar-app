import { useEffect, useState } from "react";
import { loadSettings, type ThemeMode } from "../lib/storage";

/** 换主题时派发这个事件，`<html data-theme>` 会重新算一遍。 */
export const THEME_EVENT = "guitar:theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";
const THEME_COLOR = { dark: "#0d1117", light: "#f6f7f9" } as const;

function resolve(mode: ThemeMode, prefersLight: boolean): "dark" | "light" {
  if (mode === "dark" || mode === "light") return mode;
  return prefersLight ? "light" : "dark";
}

/**
 * 把「主题」这个设置落到 `<html data-theme>` 上（v0.136.0）。
 *
 * - `auto` 跟着系统走，系统改的时候不用刷新；
 * - 顺手把 `<meta name="theme-color">` 也换掉，手机浏览器地址栏跟着变；
 * - 设置页保存后派发 `guitar:theme`，这里重读一次设置。
 */
export function useTheme(): void {
  const [mode, setMode] = useState<ThemeMode>(() => loadSettings().theme);

  useEffect(() => {
    const onTheme = () => setMode(loadSettings().theme);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.(LIGHT_QUERY);
    const apply = () => {
      const theme = resolve(mode, query?.matches ?? false);
      document.documentElement.dataset.theme = theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
    };
    apply();
    query?.addEventListener?.("change", apply);
    return () => query?.removeEventListener?.("change", apply);
  }, [mode]);
}
