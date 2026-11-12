import { useEffect, useState } from "react";
import { pollForUpdates, watchForUpdates } from "../lib/sw-update";

/**
 * 有新版本时在底部弹一条：说明「已经下好了，刷新就用新的」，按钮刷新 / 稍后。
 *
 * 不做「自动刷新」：练到一半自动刷新会把人正在跟的节拍器掐掉，
 * 所以只提示，什么时候刷由用户决定。
 */
export default function UpdateToast() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stopWatch = watchForUpdates(() => {
      setReady(true);
      setDismissed(false);
    });
    const stopPoll = pollForUpdates();
    return () => {
      stopWatch();
      stopPoll();
    };
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <span className="update-toast-text">新版本已经下好了，刷新一下就是新的。</span>
      <button type="button" className="btn btn-quiet update-toast-later" onClick={() => setDismissed(true)}>
        稍后
      </button>
      <button type="button" className="btn update-toast-refresh" onClick={() => window.location.reload()}>
        刷新
      </button>
    </div>
  );
}
