import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import type { DiaryEntry, Baby } from "@/api/types";
import { api } from "@/api/client";
import { FeedScreen } from "./feed-screen";
import { DetailScreen } from "./detail-screen";
import { CreateScreen, EditScreen } from "./create-edit-screen";
import { SummaryScreen } from "./summary-screen";
import { BottomTabBar } from "./bottom-tab-bar";
import { Snackbar } from "./snackbar";

type Screen =
  | { type: "feed" }
  | { type: "detail"; entry: DiaryEntry }
  | { type: "create" }
  | { type: "edit"; entry: DiaryEntry }
  | { type: "summary" };

type AppContextType = {
  screen: Screen;
  activeTab: "feed" | "create" | "summary";
  navigate: (screen: Screen) => void;
  goBack: () => void;
  baby: Baby | null;
  entries: DiaryEntry[];
  loading: boolean;
  refreshEntries: () => Promise<void>;
  addEntry: (entry: DiaryEntry) => void;
  updateEntry: (entry: DiaryEntry) => void;
  deleteEntry: (id: string) => void;
  snackbar: string | null;
  showSnackbar: (msg: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function AppRouter() {
  const { screen } = useApp();

  switch (screen.type) {
    case "feed":
      return <FeedScreen />;
    case "detail":
      return <DetailScreen entry={screen.entry} />;
    case "create":
      return <CreateScreen />;
    case "edit":
      return <EditScreen entry={screen.entry} />;
    case "summary":
      return <SummaryScreen />;
    default:
      return <FeedScreen />;
  }
}

export function AppProvider({ ready }: { ready: boolean }) {
  const [screen, setScreen] = useState<Screen>({ type: "feed" });
  const [, setHistory] = useState<Screen[]>([]);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const activeTab =
    screen.type === "summary" ? "summary" : screen.type === "create" ? "create" : "feed";

  const navigate = useCallback(
    (next: Screen) => {
      setHistory((h) => [...h, screen]);
      setScreen(next);
      window.scrollTo(0, 0);
    },
    [screen],
  );

  const goBack = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) {
        // Resolve stale entry in history with fresh data
        if ((prev.type === "detail" || prev.type === "edit") ) {
          const fresh = entriesRef.current.find((e) => e.id === prev.entry.id);
          if (fresh) {
            setScreen({ ...prev, entry: fresh });
          } else {
            setScreen(prev);
          }
        } else {
          setScreen(prev);
        }
        return h.slice(0, -1);
      }
      setScreen({ type: "feed" });
      return [];
    });
    window.scrollTo(0, 0);
  }, []);

  const refreshEntries = useCallback(async () => {
    if (!baby) return;
    try {
      const data = await api.getEntries(baby.id);
      setEntries(data.entries);
    } catch (err) {
      console.error("Failed to load entries:", err);
    }
  }, [baby]);

  // Load baby when initData is ready
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function init() {
      try {
        const b = await api.getBaby();
        if (cancelled) return;
        setBaby(b);
      } catch (err) {
        console.error("Failed to load baby:", err);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [ready]);

  // Load entries when baby is available
  useEffect(() => {
    if (!baby) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api.getEntries(baby!.id);
        if (cancelled) return;
        setEntries(data.entries);
      } catch (err) {
        console.error("Failed to load entries:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [baby]);

  // Telegram BackButton integration
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    if (screen.type !== "feed") {
      tg.BackButton.show();
      const handler = () => goBack();
      tg.BackButton.onClick(handler);
      return () => {
        tg.BackButton.offClick(handler);
      };
    } else {
      tg.BackButton.hide();
    }
  }, [screen, goBack]);

  function addEntry(entry: DiaryEntry) {
    setEntries((e) => [entry, ...e]);
  }

  function updateEntry(updated: DiaryEntry) {
    setEntries((prev) => {
      const next = prev.map((entry) => (entry.id === updated.id ? updated : entry));
      entriesRef.current = next;
      return next;
    });
  }

  function deleteEntryLocal(id: string) {
    setEntries((e) => e.filter((entry) => entry.id !== id));
  }

  function showSnackbar(msg: string) {
    setSnackbar(msg);
    setTimeout(() => setSnackbar(null), 2500);
  }

  return (
    <AppContext.Provider
      value={{
        screen,
        activeTab,
        navigate,
        goBack,
        baby,
        entries,
        loading,
        refreshEntries,
        addEntry,
        updateEntry,
        deleteEntry: deleteEntryLocal,
        snackbar,
        showSnackbar,
      }}
    >
      <div className="mx-auto max-w-[428px] min-h-screen bg-background relative">
        <AppRouter />
        {screen.type !== "detail" && screen.type !== "edit" && <BottomTabBar />}
        <Snackbar />
      </div>
    </AppContext.Provider>
  );
}
