import { useApp } from "./app-context";
import { ChevronLeft } from "lucide-react";

export function TelegramHeader({ title, showBack }: { title?: string; showBack?: boolean }) {
  const { goBack, baby } = useApp();

  const defaultTitle = baby ? baby.name : "Дневник";

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card/95 backdrop-blur-sm px-4 py-3">
      {showBack && (
        <button
          onClick={goBack}
          className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-secondary transition-colors"
          aria-label="Назад"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-base font-bold text-foreground truncate">
        {title || defaultTitle}
      </h1>
    </header>
  );
}
