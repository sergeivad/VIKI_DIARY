import { useState } from "react";
import { useApp } from "./app-context";
import { TelegramHeader } from "./telegram-header";
import { formatDateRu, formatTime } from "@/lib/format";
import { api } from "@/api/client";
import type { DiaryEntry } from "@/api/types";
import { Mic, Pencil, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";

function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: { url: string }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  return (
    <div className="fixed inset-0 z-[70] bg-foreground/95 flex flex-col" role="dialog" aria-label="Просмотр фото">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-medium text-primary-foreground/70">
          {index + 1} / {photos.length}
        </span>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5 text-primary-foreground" />
        </button>
      </div>
      <div className="flex-1 relative flex items-center justify-center px-4">
        <img
          src={photos[index].url}
          alt=""
          className="max-w-full max-h-full object-contain"
        />
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button
                onClick={() => setIndex(index - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/10"
                aria-label="Предыдущее фото"
              >
                <ChevronLeft className="h-5 w-5 text-primary-foreground" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                onClick={() => setIndex(index + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/10"
                aria-label="Следующее фото"
              >
                <ChevronRight className="h-5 w-5 text-primary-foreground" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeleteSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Подтверждение удаления">
      <div className="absolute inset-0 bg-foreground/30" onClick={onCancel} />
      <div className="absolute bottom-0 left-0 right-0 animate-slide-up rounded-t-3xl bg-card p-6 pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" />
        <h3 className="text-lg font-bold text-foreground mb-2">Удалить запись?</h3>
        <p className="text-sm text-muted-foreground mb-6">Это действие нельзя отменить</p>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onConfirm}
            className="w-full rounded-xl bg-destructive py-3.5 text-sm font-bold text-destructive-foreground"
          >
            Удалить
          </button>
          <button
            onClick={onCancel}
            className="w-full rounded-xl bg-secondary py-3.5 text-sm font-bold text-secondary-foreground"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export function DetailScreen({ entry }: { entry: DiaryEntry }) {
  const { navigate, goBack, deleteEntry, showSnackbar } = useApp();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const voiceItem = entry.items.find((m) => m.type === "voice");
  const photos = entry.items.filter((m) => m.type === "photo");
  const videos = entry.items.filter((m) => m.type === "video");
  // Collect text from all items: text entries, voice transcriptions, photo/video captions
  const displayText = entry.items
    .map((m) => m.textContent?.trim())
    .filter(Boolean)
    .join("\n\n") || null;

  const photoUrls = photos
    .filter((p) => p.fileId)
    .map((p) => ({ url: api.mediaUrl(p.fileId!) }));

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteEntry(entry.id);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred("warning");
      deleteEntry(entry.id);
      showSnackbar("Запись удалена");
      goBack();
    } catch (err) {
      console.error("Failed to delete:", err);
      showSnackbar("Ошибка удаления");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TelegramHeader title="Запись" showBack />

      <main className="flex-1 px-4 pb-24 pt-4">
        {/* Author header */}
        <div className="flex items-center gap-3 mb-4">
          {entry.author.avatarFileId ? (
            <img
              src={api.mediaUrl(entry.author.avatarFileId)}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-coral-light flex items-center justify-center text-base font-bold text-primary">
              {entry.author.firstName[0]}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-foreground">{entry.author.firstName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateRu(entry.eventDate)} в {formatTime(entry.createdAt)}
            </p>
          </div>
        </div>

        {/* Full text (or voice transcription) */}
        {displayText && (
          <p className="text-[15px] text-foreground leading-relaxed mb-5 whitespace-pre-line">{displayText}</p>
        )}

        {/* Photos */}
        {photoUrls.length > 0 && (
          <div className="space-y-2 mb-4">
            {photoUrls.map((media, i) => (
              <button
                key={i}
                onClick={() => setViewerIndex(i)}
                className="relative w-full overflow-hidden rounded-2xl aspect-[4/3] bg-muted"
              >
                <img src={media.url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {/* Videos */}
        {videos.map((media) =>
          media.fileId ? (
            <div key={media.id} className="w-full overflow-hidden rounded-2xl bg-muted mb-4">
              <video
                src={api.mediaUrl(media.fileId)}
                poster={media.thumbnailFileId ? api.mediaUrl(media.thumbnailFileId) : undefined}
                controls
                preload="metadata"
                playsInline
                className="w-full"
              />
            </div>
          ) : null,
        )}

        {/* Voice badge */}
        {voiceItem && (
          <div className="flex items-center gap-1.5 mb-4">
            <Mic className="h-3.5 w-3.5 text-primary/60" />
            <span className="text-xs text-muted-foreground">Голосовое сообщение</span>
          </div>
        )}

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-tag-bg px-3 py-1 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate({ type: "edit", entry })}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-sm font-bold text-secondary-foreground"
          >
            <Pencil className="h-4 w-4" />
            Редактировать
          </button>
          <button
            onClick={() => setShowDelete(true)}
            disabled={deleting}
            className="flex items-center justify-center gap-2 rounded-xl bg-destructive/10 px-5 py-3 text-sm font-bold text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </main>

      {/* Photo viewer */}
      {viewerIndex !== null && (
        <PhotoViewer
          photos={photoUrls}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <DeleteSheet onConfirm={handleDelete} onCancel={() => setShowDelete(false)} />
      )}
    </div>
  );
}
