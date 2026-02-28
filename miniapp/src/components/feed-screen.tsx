import { useApp } from "./app-context";
import { TelegramHeader } from "./telegram-header";
import { groupEntriesByDate, formatTime } from "@/lib/format";
import { api } from "@/api/client";
import type { DiaryEntry } from "@/api/types";
import { Play, Mic } from "lucide-react";

function EntryCard({ entry }: { entry: DiaryEntry }) {
  const { navigate } = useApp();
  const photos = entry.items.filter((m) => m.type === "photo" || m.type === "video");
  const voiceItem = entry.items.find((m) => m.type === "voice");
  const hasVoice = !!voiceItem;
  // Collect text from all items: text entries, voice transcriptions, photo/video captions
  const displayText = entry.items
    .map((m) => m.textContent?.trim())
    .filter(Boolean)
    .join("\n\n") || null;
  const showCount = Math.min(photos.length, 4);
  const extraCount = photos.length - 4;

  return (
    <button
      onClick={() => navigate({ type: "detail", entry })}
      className="w-full text-left bg-card rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-shadow"
    >
      {/* Author + time */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="h-8 w-8 rounded-full bg-coral-light flex items-center justify-center text-sm font-bold text-primary overflow-hidden">
          {entry.author.firstName[0]}
        </div>
        <span className="text-sm font-semibold text-foreground">{entry.author.firstName}</span>
        <span className="text-xs text-muted-foreground ml-auto">{formatTime(entry.createdAt)}</span>
      </div>

      {/* Text (or voice transcription) */}
      {displayText && (
        <p className="text-sm text-foreground leading-relaxed line-clamp-3 mb-3">
          {displayText}
        </p>
      )}

      {/* Media grid */}
      {photos.length > 0 && (
        <div className={`grid gap-1.5 mb-3 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {photos.slice(0, showCount).map((media, i) => (
            <div
              key={media.id}
              className={`relative overflow-hidden rounded-xl ${
                photos.length === 1 ? "aspect-[16/10]" : "aspect-square"
              } bg-muted`}
            >
              {media.fileId && media.type === "video" ? (
                <>
                  <video
                    src={api.mediaUrl(media.fileId)}
                    poster={media.thumbnailFileId ? api.mediaUrl(media.thumbnailFileId) : undefined}
                    preload="metadata"
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90">
                      <Play className="h-4 w-4 text-foreground ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </>
              ) : media.fileId ? (
                <img
                  src={api.mediaUrl(media.fileId)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              ) : null}
              {i === 3 && extraCount > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/40">
                  <span className="text-lg font-bold text-primary-foreground">+{extraCount}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Voice message badge */}
      {hasVoice && (
        <div className="flex items-center gap-1.5 mb-3">
          <Mic className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-xs text-muted-foreground">Голосовое сообщение</span>
        </div>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block rounded-full bg-tag-bg px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)] animate-pulse">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-8 w-8 rounded-full bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted ml-auto" />
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <div className="aspect-square rounded-xl bg-muted" />
        <div className="aspect-square rounded-xl bg-muted" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-16 rounded-full bg-muted" />
        <div className="h-5 w-12 rounded-full bg-muted" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-6 text-muted-foreground/30">
        <BookIcon />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">Дневник пока пуст</h3>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
        Начните вести дневник — отправьте фото или сообщение боту
      </p>
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="10" width="52" height="60" rx="6" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path d="M28 10V70" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
      <line x1="36" y1="28" x2="56" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="36" y1="36" x2="52" y2="36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="36" y1="44" x2="48" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="56" r="3" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export function FeedScreen() {
  const { entries, loading } = useApp();
  const groups = groupEntriesByDate(entries);

  return (
    <div className="flex flex-col min-h-screen">
      <TelegramHeader />
      <main className="flex-1 px-4 pb-24 pt-3">
        {loading ? (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.date}>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                  {group.label}
                </h2>
                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
