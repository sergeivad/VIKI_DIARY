import { useApp } from "./app-context";
import { BookOpen, PlusCircle, BarChart3 } from "lucide-react";

export function BottomTabBar() {
  const { activeTab, navigate } = useApp();

  const tabs = [
    { id: "feed" as const, label: "Лента", icon: BookOpen, screen: { type: "feed" as const } },
    { id: "create" as const, label: "Создать", icon: PlusCircle, screen: { type: "create" as const } },
    { id: "summary" as const, label: "Саммари", icon: BarChart3, screen: { type: "summary" as const } },
  ];

  function handleTabClick(tab: (typeof tabs)[number]) {
    window.Telegram?.WebApp.HapticFeedback.impactOccurred("light");
    navigate(tab.screen);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={`flex flex-col items-center gap-0.5 px-6 py-2 transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.id === "create" ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md -mt-5">
                <Icon className="h-5 w-5" />
              </div>
            ) : (
              <Icon className="h-5 w-5" />
            )}
            <span className="text-[11px] font-semibold">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
