import { useApp } from "./app-context";

export function Snackbar() {
  const { snackbar } = useApp();

  if (!snackbar) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 animate-fade-in-up">
      <div className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-lg">
        {snackbar}
      </div>
    </div>
  );
}
