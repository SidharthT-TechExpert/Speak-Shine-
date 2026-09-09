import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";

const ThemeContext = createContext({
  theme: "dark",
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
  applyTheme: () => {},
});

const THEME_KEY = "speakshine-theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
      // Default to dark mode as requested
      return "dark";
    } catch {
      return "dark";
    }
  });

  const isDark = theme === "dark";

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }, [theme]);

  const setTheme = useCallback((newTheme, syncToDb = true) => {
    if (newTheme !== "dark" && newTheme !== "light") return;
    setThemeState(newTheme);

    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch {
      // ignore
    }

    if (syncToDb) {
      api.patch("/users/me/theme", {
        theme: newTheme,
        isDark: newTheme === "dark",
      }).catch(() => {
        // Silently catch unauthenticated or network errors
      });
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch {
        // ignore
      }
      api.patch("/users/me/theme", {
        theme: nextTheme,
        isDark: nextTheme === "dark",
      }).catch(() => {
        // Silently catch unauthenticated or network errors
      });
      return nextTheme;
    });
  }, []);

  const applyTheme = useCallback((newTheme) => {
    setTheme(newTheme, false);
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
