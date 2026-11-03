import { createContext, useContext, type DragEvent, type MouseEvent } from "react";
import type { PageRecord, PageSummary } from "./pb";
import type { PageTree } from "./tree";

/** エディタ内のカスタムブロックやデータベース表示から、ページ一覧と操作を参照するためのコンテキスト */
export type Workspace = {
  tree: PageTree;
  navigate: (id: string) => void;
  /** データベースの行を、そのデータベースの設定（サイド・中央・フルページ）に従って開く。
   *  作成直後で一覧にまだ無いページは parent で親を指定する */
  open: (id: string, parent?: string) => void;
  /** サイド・中央に表示中のページ */
  peekId: string | null;
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

// --- ページのドラッグ（データベースの行・サイドバーのページ）。
// dragover の間は dataTransfer の中身を読めないので、ドラッグ中のページ ID はここに持っておく

let draggingPage: string | null = null;
// 文字などほかのものをドラッグし始めたら忘れる（ページのときは直後の startPageDrag で設定し直す）
document.addEventListener("dragstart", () => (draggingPage = null), true);
document.addEventListener("dragend", () => (draggingPage = null));
// 移動した行は表やボードから消え、dragend が文書まで届かないので、ドロップの処理が終わったあとにも忘れる
document.addEventListener("drop", () => setTimeout(() => (draggingPage = null)));

export function startPageDrag(e: DragEvent, id: string) {
  e.dataTransfer.effectAllowed = "move";
  // 文字としては渡さない（入力欄などに落としても ID が挿入されないように）
  e.dataTransfer.setData("application/x-rasstation-page", id);
  draggingPage = id;
}

/** アプリ内でドラッグ中のページ。ファイルや文字のドラッグなら null */
export const draggedPage = () => draggingPage;
