import { createContext, useContext, type MouseEvent } from "react";
import type { PageRecord, PageSummary } from "./pb";
import type { PageTree } from "./tree";

/** エディタ内のカスタムブロックやデータベース表示から、ページ一覧と操作を参照するためのコンテキスト */
export type Workspace = {
  tree: PageTree;
  navigate: (id: string) => void;
  /** 楽観的に表示を更新してから保存する */
  update: (id: string, patch: Partial<PageSummary>) => Promise<void>;
  /** parent の末尾にページを作成する。open なら作成後に開く。失敗時は null */
  create: (parent: string, init?: Partial<PageRecord>, opts?: { open?: boolean }) => Promise<PageSummary | null>;
  trash: (id: string) => void;
  /** parent の子の index 番目へ移す（index 省略時は末尾）。兄弟の並び順もまとめて振り直す */
  move: (id: string, parent: string, index?: number) => void;
};

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("WorkspaceContext is not provided");
  return ws;
}

/** 通常クリックは SPA 内で遷移し、Ctrl/中クリック等はブラウザ標準（新しいタブ）に任せる */
export function handleLinkClick(e: MouseEvent, navigate: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate();
}

export const pageHref = (id: string) => `?id=${id}`;
