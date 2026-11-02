import { useSyncExternalStore } from "react";
import type { PageFont } from "./pb";

// アプリ全体の見た目の設定。端末ごとの好みなので localStorage に置く（サーバーには保存しない）。

export type ThemePref = "system" | "light" | "dark";
/** サイド表示（データベースの行のプレビュー）を出す位置。auto は縦長の画面なら下、横長なら右 */
export type PeekPosition = "auto" | "right" | "bottom";

export type Settings = {
  theme: ThemePref;
  accent: string; // ACCENTS のキー
  sidebarWidth: number;
  peekPosition: PeekPosition;
  /** サイド表示が画面に占める割合（右に出すとき・下に出すとき） */
  peekRatio: { right: number; bottom: number };
  /** 新しく作るページの既定スタイル */
  newPage: { font: PageFont; smallText: boolean; fullWidth: boolean };
};

export const ACCENTS: Record<string, { label: string; color: string }> = {
  blue: { label: "青", color: "#2383e2" },
  purple: { label: "紫", color: "#9065b0" },
  pink: { label: "ピンク", color: "#c14c8a" },
  red: { label: "赤", color: "#d44c47" },
  orange: { label: "オレンジ", color: "#d9730d" },
  green: { label: "緑", color: "#448361" },
  gray: { label: "グレー", color: "#6f6e69" },
};

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;

const DEFAULTS: Settings = {
  theme: "system",
  accent: "blue",
  sidebarWidth: SIDEBAR_DEFAULT,
  peekPosition: "auto",
  peekRatio: { right: 0.45, bottom: 0.5 },
  newPage: { font: "", smallText: false, fullWidth: false },
};

const KEY = "rs.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...saved,
      newPage: { ...DEFAULTS.newPage, ...saved.newPage },
      peekRatio: { ...DEFAULTS.peekRatio, ...saved.peekRatio },
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 保存できなくてもこのタブの中では反映される */
  }
  applyToDocument();
  listeners.forEach((l) => l());
}

export function resetSidebarWidth() {
  updateSettings({ sidebarWidth: SIDEBAR_DEFAULT });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useSettings = () => useSyncExternalStore(subscribe, () => settings);

// --- テーマ: "system" のときは OS の設定に追従する

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const resolveTheme = (): "light" | "dark" =>
  settings.theme === "system" ? (darkQuery.matches ? "dark" : "light") : settings.theme;

export const useResolvedTheme = () =>
  useSyncExternalStore(
    (l) => {
      const off = subscribe(l);
      darkQuery.addEventListener("change", l);
      return () => {
        off();
        darkQuery.removeEventListener("change", l);
      };
    },
    resolveTheme,
  );

/** <html> に data-theme とアクセントカラーを反映する（CSS はこれを見て配色を切り替える） */
export function applyToDocument() {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme();
  root.style.setProperty("--accent", (ACCENTS[settings.accent] ?? ACCENTS.blue).color);
  root.style.setProperty("--sidebar-w", `${settings.sidebarWidth}px`);
}

darkQuery.addEventListener("change", applyToDocument);
