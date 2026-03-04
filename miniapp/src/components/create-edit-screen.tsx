import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import { useApp } from "./app-context";
import { TelegramHeader } from "./telegram-header";
import { api } from "@/api/client";
import type { DiaryEntry } from "@/api/types";
import { Calendar, ImagePlus, Loader2, Video } from "lucide-react";

type PendingMedia = {
  id: string;
  file: File;
  preview: string;
  status: "uploading" | "done" | "error";
  s3Key?: string;
  thumbnailS3Key?: string | null;
  type: "photo" | "video";
};

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

function PendingMediaPicker({
  pendingMedia,
  fileInputRef,
  saving,
  onFileSelect,
  onRemove,
}: {
  pendingMedia: PendingMedia[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  saving: boolean;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mb-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onFileSelect}
      />

      {pendingMedia.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-2">
          {pendingMedia.map((media) => (
            <div key={media.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
              {media.type === "video" ? (
                <video
                  src={media.preview}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={media.preview}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}

              {media.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}

              {media.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/40">
                  <span className="text-xs text-white">Ошибка</span>
                </div>
              )}

              {media.type === "video" && media.status === "done" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="h-5 w-5 text-white drop-shadow" />
                </div>
              )}

              <button
                onClick={() => onRemove(media.id)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60"
                type="button"
              >
                <span className="text-xs leading-none text-white">x</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingMedia.length < 10 && (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
          type="button"
        >
          <ImagePlus className="h-4 w-4" />
          Добавить фото / видео
          {pendingMedia.length > 0 && (
            <span className="text-muted-foreground">({pendingMedia.length}/10)</span>
          )}
        </button>
      )}
    </div>
  );
}

function toMediaPayload(pendingMedia: PendingMedia[]) {
  return pendingMedia
    .filter((media) => media.status === "done" && media.s3Key)
    .map((media) => ({
      s3Key: media.s3Key!,
      thumbnailS3Key: media.thumbnailS3Key ?? undefined,
      type: media.type,
    }));
}

export function CreateScreen() {
  const { navigate, addEntry, showSnackbar, baby } = useApp();
  const [text, setText] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  const isUploading = pendingMedia.some((media) => media.status === "uploading");
  const canSave =
    (text.trim().length > 0 || pendingMedia.some((media) => media.status === "done")) && !isUploading;

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = 10 - pendingMedia.length;
    const toAdd = files.slice(0, remaining);

    for (const file of toAdd) {
      const id = crypto.randomUUID();
      const type = file.type.startsWith("video/") ? "video" : "photo";
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.add(preview);

      setPendingMedia((prev) => [...prev, { id, file, preview, status: "uploading", type }]);

      api
        .uploadFile(file)
        .then((result) => {
          setPendingMedia((prev) =>
            prev.map((media) =>
              media.id === id
                ? {
                    ...media,
                    status: "done",
                    s3Key: result.s3Key,
                    thumbnailS3Key: result.thumbnailS3Key,
                  }
                : media,
            ),
          );
        })
        .catch(() => {
          setPendingMedia((prev) =>
            prev.map((media) => (media.id === id ? { ...media, status: "error" } : media)),
          );
        });
    }

    e.target.value = "";
  }

  function removeMedia(id: string) {
    setPendingMedia((prev) => {
      const media = prev.find((item) => item.id === id);
      if (media) {
        URL.revokeObjectURL(media.preview);
        previewUrlsRef.current.delete(media.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSave() {
    if (!canSave || !baby) return;
    setSaving(true);

    try {
      const media = toMediaPayload(pendingMedia);
      const newEntry = await api.createEntry(
        baby.id,
        text.trim(),
        date,
        media.length > 0 ? media : undefined,
      );
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

  return (
    <div className="flex min-h-screen flex-col">
      <TelegramHeader title="Новая запись" showBack />

      <main className="flex-1 px-4 pb-32 pt-4">
        <div className="mb-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Дата события
          </label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div className="mb-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что сегодня произошло?"
            className="min-h-[140px] w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
            disabled={saving}
          />
        </div>

        <PendingMediaPicker
          pendingMedia={pendingMedia}
          fileInputRef={fileInputRef}
          saving={saving}
          onFileSelect={handleFileSelect}
          onRemove={removeMedia}
        />
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Сохраняем...
            </>
          ) : isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем файлы...
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
    .map((item) => item.textContent?.trim())
    .filter(Boolean)
    .join("\n\n");
  const [text, setText] = useState(initialText);
  const [date, setDate] = useState(entry.eventDate);
  const [saving, setSaving] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  const mediaItems = entry.items.filter((item) => item.type === "photo" || item.type === "video");
  const isUploading = pendingMedia.some((media) => media.status === "uploading");
  const hasNewMedia = pendingMedia.some((media) => media.status === "done" && !!media.s3Key);
  const canSave =
    (text.trim().length > 0 || hasNewMedia) &&
    (text !== initialText || date !== entry.eventDate || hasNewMedia) &&
    !isUploading;

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = 10 - pendingMedia.length;
    const toAdd = files.slice(0, remaining);

    for (const file of toAdd) {
      const id = crypto.randomUUID();
      const type = file.type.startsWith("video/") ? "video" : "photo";
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.add(preview);

      setPendingMedia((prev) => [...prev, { id, file, preview, status: "uploading", type }]);

      api
        .uploadFile(file)
        .then((result) => {
          setPendingMedia((prev) =>
            prev.map((media) =>
              media.id === id
                ? {
                    ...media,
                    status: "done",
                    s3Key: result.s3Key,
                    thumbnailS3Key: result.thumbnailS3Key,
                  }
                : media,
            ),
          );
        })
        .catch(() => {
          setPendingMedia((prev) =>
            prev.map((media) => (media.id === id ? { ...media, status: "error" } : media)),
          );
        });
    }

    e.target.value = "";
  }

  function removeMedia(id: string) {
    setPendingMedia((prev) => {
      const media = prev.find((item) => item.id === id);
      if (media) {
        URL.revokeObjectURL(media.preview);
        previewUrlsRef.current.delete(media.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);

    try {
      let updated = entry;

      if (text.trim() !== initialText) {
        updated = await api.updateEntryText(entry.id, text.trim());
      }

      if (date !== entry.eventDate) {
        updated = await api.updateEntryDate(entry.id, date);
      }

      const mediaToAdd = toMediaPayload(pendingMedia);
      if (mediaToAdd.length > 0) {
        updated = await api.addMediaToEntry(entry.id, mediaToAdd);
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

  return (
    <div className="flex min-h-screen flex-col">
      <TelegramHeader title="Редактирование" showBack />

      <main className="flex-1 px-4 pb-32 pt-4">
        <div className="mb-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Дата события
          </label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div className="mb-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что сегодня произошло?"
            className="min-h-[140px] w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
            disabled={saving}
          />
        </div>

        {mediaItems.length > 0 && (
          <div className="mb-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Прикреплённые файлы
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {mediaItems.map((media) => {
                const thumbUrl = api.mediaUrl(media, true);
                return thumbUrl ? (
                  <div
                    key={media.id}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted opacity-70"
                  >
                    <img
                      src={thumbUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
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
          </div>
        )}

        <PendingMediaPicker
          pendingMedia={pendingMedia}
          fileInputRef={fileInputRef}
          saving={saving}
          onFileSelect={handleFileSelect}
          onRemove={removeMedia}
        />
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Сохраняем...
            </>
          ) : isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем файлы...
            </>
          ) : (
            "Сохранить изменения"
          )}
        </button>
      </div>
    </div>
  );
}
