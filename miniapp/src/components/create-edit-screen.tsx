import { useState } from "react";
import { useApp } from "./app-context";
import { TelegramHeader } from "./telegram-header";
import { api } from "@/api/client";
import type { DiaryEntry } from "@/api/types";
import { Calendar, Loader2, Info, Video } from "lucide-react";

function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const dayBefore = new Date(Date.now() - 172800000).toISOString().split("T")[0];

  const options = [
    { label: "Сегодня", date: today },
    { label: "Вчера", date: yesterday },
    { label: "Позавчера", date: dayBefore },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.date}
            onClick={() => onChange(opt.date)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              value === opt.date
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
            ![today, yesterday, dayBefore].includes(value)
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          Другая дата
        </button>
      </div>
      {showCalendar && (
        <input
          type="date"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowCalendar(false);
          }}
          className="mt-2 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground"
          max={today}
        />
      )}
    </div>
  );
}

export function CreateScreen() {
  const { navigate, addEntry, showSnackbar, baby } = useApp();
  const [text, setText] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!text.trim() || !baby) return;
    setSaving(true);

    try {
      const newEntry = await api.createEntry(baby.id, text.trim(), date);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      addEntry(newEntry);
      showSnackbar("Записано!");
      navigate({ type: "feed" });
    } catch (err) {
      console.error("Failed to create entry:", err);
      showSnackbar("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const canSave = text.trim().length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      <TelegramHeader title="Новая запись" showBack />

      <main className="flex-1 px-4 pb-32 pt-4">
        {/* Date picker */}
        <div className="mb-5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Дата события
          </label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {/* Text input */}
        <div className="mb-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что сегодня произошло?"
            className="w-full min-h-[140px] resize-none rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
            disabled={saving}
          />
        </div>

        {/* Media note */}
        <div className="flex items-start gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Фото и видео можно добавить через бот</span>
        </div>
      </main>

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Сохраняем...
            </>
          ) : (
            "Сохранить"
          )}
        </button>
      </div>
    </div>
  );
}

export function EditScreen({ entry }: { entry: DiaryEntry }) {
  const { goBack, updateEntry, showSnackbar } = useApp();
  const initialText = entry.items
    .map((m) => m.textContent?.trim())
    .filter(Boolean)
    .join("\n\n");
  const [text, setText] = useState(initialText);
  const [date, setDate] = useState(entry.eventDate);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);

    try {
      let updated = entry;
      if (text.trim() !== initialText) {
        updated = await api.updateEntryText(entry.id, text.trim());
      }
      if (date !== entry.eventDate) {
        updated = await api.updateEntryDate(entry.id, date);
      }
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("success");
      updateEntry(updated);
      showSnackbar("Изменения сохранены");
      goBack();
    } catch (err) {
      console.error("Failed to update entry:", err);
      showSnackbar("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const canSave = text.trim().length > 0 && (text !== initialText || date !== entry.eventDate);

  const mediaItems = entry.items.filter((m) => m.type === "photo" || m.type === "video");

  return (
    <div className="flex flex-col min-h-screen">
      <TelegramHeader title="Редактирование" showBack />

      <main className="flex-1 px-4 pb-32 pt-4">
        {/* Date picker */}
        <div className="mb-5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Дата события
          </label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {/* Text input */}
        <div className="mb-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что сегодня произошло?"
            className="w-full min-h-[140px] resize-none rounded-2xl border border-input bg-card px-4 py-3 text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
            disabled={saving}
          />
        </div>

        {/* Read-only media */}
        {mediaItems.length > 0 && (
          <div className="mb-5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Прикреплённые файлы
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {mediaItems.map((media) => {
                const thumbId = media.type === "video" ? media.thumbnailFileId : media.fileId;
                return thumbId ? (
                  <div key={media.id} className="relative shrink-0 h-20 w-20 rounded-xl overflow-hidden bg-muted opacity-70">
                    <img
                      src={api.mediaUrl(thumbId)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                    {media.type === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Video className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    )}
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Медиафайлы нельзя изменить в этой версии
            </p>
          </div>
        )}
      </main>

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Сохраняем...
            </>
          ) : (
            "Сохранить изменения"
          )}
        </button>
      </div>
    </div>
  );
}
