"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Toaster } from "sonner";
import { CurrencyProvider } from "@/components/currency/currency-provider";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "nexora-theme";

/**
 * The DOM attribute (`<html data-theme>`) is the single source of truth —
 * the inline script in layout.tsx writes it before paint. Subscribing to
 * it through useSyncExternalStore keeps React state consistent without an
 * effect, and React uses the server snapshot ("dark") during hydration,
 * then re-renders to the real value — so no hydration mismatch.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private-mode storage failures are harmless — the DOM stays correct.
  }
  for (const listener of listeners) listener();
}

export function Providers({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);
  const toggleTheme = useCallback(() => {
    applyTheme(getSnapshot() === "light" ? "dark" : "light");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <CurrencyProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-2)",
              border: "1px solid var(--glass-border)",
              color: "var(--text-0)",
              boxShadow: "var(--shadow-glass)",
            },
          }}
        />
      </CurrencyProvider>
    </ThemeContext.Provider>
  );
}
