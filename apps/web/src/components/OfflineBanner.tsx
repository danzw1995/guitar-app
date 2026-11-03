import { useEffect, useState } from "react";

/**
 * 离线提示条。
 *
 * 这个应用本来就全本地（进度在 localStorage、曲谱数据打进包里），所以离线时
 * 功能不受影响；提示条的作用是**解释**，免得用户以为是坏了。
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-bar" role="status" aria-live="polite">
      离线中 · 所有功能与进度都在本机，联网后自动恢复
    </div>
  );
}
