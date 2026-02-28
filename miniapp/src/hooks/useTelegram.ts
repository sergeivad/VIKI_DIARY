import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; username?: string };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
        };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
      };
    };
  }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState(window.Telegram?.WebApp);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setWebApp(tg);
    }
  }, []);

  return {
    webApp,
    initData: webApp?.initData ?? "",
    user: webApp?.initDataUnsafe?.user,
    colorScheme: webApp?.colorScheme ?? "light",
  };
}
