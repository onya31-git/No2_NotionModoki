import type { DragEvent } from "react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import type { Editor, EditorBlock } from "./blocks";
import { BlockRangeSelection } from "./blockSelection";

// 本文の ⋮⋮ でドラッグ中のブロックを、エディタの外（データベースの表・ボード）から参照する。

export type DraggedBlocks = { editor: Editor; ids: string[] };

const editors = new Set<Editor>();

/** 表示中のエディタを登録する。戻り値で登録を解除する */
export function registerEditor(editor: Editor) {
  editors.add(editor);
  return () => void editors.delete(editor);
}

// ドラッグが始まると ⋮⋮ はカーソルの下のブロックへ付き直していくので、つかんだブロックは dragstart の時点で覚えておく。
// キャプチャで受け取り、BlockNote が選択をつかんだブロック 1 つに置き換える前の複数選択も読めるようにする
let current: DraggedBlocks | null = null;
document.addEventListener(
  "dragstart",
  (e) => {
    current = (e.target as Element | null)?.closest?.(".bn-side-menu") ? findGrabbed() : null;
    // 書式ツールバーがドロップ先を隠さないようにする（style.css）
    document.body.classList.toggle("rs-block-dragging", !!current);
  },
  true,
);
document.addEventListener("dragend", () => {
  current = null;
  document.body.classList.remove("rs-block-dragging");
});

function findGrabbed(): DraggedBlocks | null {
  for (const editor of editors) {
    const menu = editor.getExtension(SideMenuExtension)?.store.state;
    if (!menu?.show) continue;
    // ⋮⋮ を出していたブロック。複数選択の中のブロックをつかんだときは選択中のすべて
    const sel = editor.prosemirrorView?.state.selection;
    const selected = sel instanceof BlockRangeSelection ? sel.blocks().map((b) => b.id) : [];
    return { editor, ids: selected.includes(menu.block.id) ? selected : [menu.block.id] };
  }
  return null;
}

/** ブロックのドラッグ中ならドラッグ元とブロック ID。ページや文字・ファイルのドラッグなら null */
export function draggedBlocks(e: DragEvent): DraggedBlocks | null {
  return e.dataTransfer.types.includes("blocknote/html") ? current : null;
}

type Inline = { type: string; text?: string; content?: Inline[] | string };

/** 文字を持つブロックの本文をつなげた文字列 */
export function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Inline[]).map((c) => c.text ?? inlineText(c.content)).join("");
}

/** ブロックを ID なしの複製にする（別のページへ移すとき用） */
export function withoutIds(block: EditorBlock): EditorBlock {
  const { id: _id, children, ...rest } = block as EditorBlock & { id?: string };
  return { ...rest, children: (children ?? []).map(withoutIds) } as EditorBlock;
}
