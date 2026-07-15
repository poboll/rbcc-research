import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "rbcc-theme";

function initialTheme() {
  try { return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

const bootTheme = initialTheme();
document.documentElement.dataset.theme = bootTheme;
document.documentElement.style.colorScheme = bootTheme;

export function ThemeToggle() {
  const [theme, setTheme] = useState(bootTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);
  const next = theme === "dark" ? "light" : "dark";
  const nextLabel = next === "light" ? "浅色" : "深色";
  return <button className="theme-toggle" type="button" onClick={() => setTheme(next)} title={`切换为${nextLabel}主题`} aria-label={`切换为${nextLabel}主题`}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{nextLabel}</span></button>;
}
