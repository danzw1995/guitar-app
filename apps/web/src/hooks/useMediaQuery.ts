import { useEffect, useState } from "react";

/** 跟着 CSS 媒体查询走的状态：窄屏 / 触屏这类「结构要不要换」的判断用它，别用 window.innerWidth 猜。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
