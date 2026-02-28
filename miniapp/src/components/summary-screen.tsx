import { useState, useEffect, useCallback } from "react";
import { TelegramHeader } from "./telegram-header";
import { api } from "@/api/client";
import type { SummaryResponse } from "@/api/types";
import { ChevronLeft, ChevronRight, Sparkles, RefreshCw } from "lucide-react";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function LoadingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative mb-4">
        <Sparkles className="h-8 w-8 text-primary animate-pulse" />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">Генерируем саммари...</p>
      <p className="text-xs text-muted-foreground">AI анализирует записи за месяц</p>
      <div className="mt-4 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-muted-foreground/30">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="8" width="44" height="48" rx="6" stroke="currentColor" strokeWidth="2" />
          <line x1="22" y1="8" x2="22" y2="56" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="32" cy="32" r="6" stroke="currentColor" strokeWidth="1.5" />
          <line x1="36.5" y1="36.5" x2="42" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-foreground mb-1">
        Саммари ещё не создано
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Нажмите кнопку, чтобы AI проанализировал записи за месяц
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" />
        Сгенерировать
      </button>
    </div>
  );
}

export function SummaryScreen() {
  const now = new Date();
  const [monthIndex, setMonthIndex] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCurrentMonth = monthIndex === now.getMonth() && year === now.getFullYear();
  const month = monthIndex + 1;

  // Fetch existing summary on month change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    api
      .getSummary(month, year)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [month, year]);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setError(null);

    api
      .generateSummary(month, year)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setGenerating(false);
      });
  }, [month, year]);

  function goToPrevMonth() {
    if (monthIndex === 0) {
      setMonthIndex(11);
      setYear((y) => y - 1);
    } else {
      setMonthIndex((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (isCurrentMonth) return;
    if (monthIndex === 11) {
      setMonthIndex(0);
      setYear((y) => y + 1);
    } else {
      setMonthIndex((m) => m + 1);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TelegramHeader title="Саммари" />

      <main className="flex-1 px-4 pb-24 pt-4">
        {/* Month switcher */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goToPrevMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-30"
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-base font-bold text-foreground">
            {MONTHS[monthIndex]} {year}
          </h2>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-30"
            aria-label="Следующий месяц"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : generating ? (
          <LoadingAnimation />
        ) : error && !data ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-destructive mb-4">{error}</p>
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Попробовать снова
            </button>
          </div>
        ) : !data ? (
          <EmptyState onGenerate={handleGenerate} generating={generating} />
        ) : (
          <div className="space-y-5">
            {/* Summary card */}
            <div className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)] relative overflow-hidden">
              {/* Decorative background */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-coral-light/50 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-mint-light/50 rounded-full translate-y-1/2 -translate-x-1/2" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-primary">AI-саммари</h3>
                </div>
                <div className="text-[14px] text-foreground leading-relaxed whitespace-pre-line">
                  {data.summary}
                </div>
              </div>
            </div>

            {/* Stats counter */}
            {data.totalEntries > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
                <div className="text-center mb-4">
                  <p className="text-4xl font-extrabold text-primary">{data.totalEntries}</p>
                  <p className="text-sm text-muted-foreground mt-1">записей за месяц</p>
                </div>
              </div>
            )}

            {/* Regenerate button */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-xl bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Обновить
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
