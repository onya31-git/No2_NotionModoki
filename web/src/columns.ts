import {
  createBlockSpec,
  createExtension,
  fragmentToBlocks,
  getNearestBlockPos,
  nodeToBlock,
  type BlockNoteEditor,
  type PartialBlock,
} from "@blocknote/core";
import type { DropCursorOptions } from "@blocknote/core/extensions";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

// 段組み（Notion の「列」）。BlockNote 0.56 のレイアウトブロック機能で定義する。
// columnList の中に column が 2 つ以上並び、各 column が通常のブロックを持つ。
// 列が 1 つになったり空になったりしたときの解消は BlockNote 側（fixLayoutBlock）が行う。

const MIN_COLUMN_PX = 80;
/** ブロック右端からこの割合の範囲にドロップすると「右に列を作る」扱いにする */
const RIGHT_EDGE_RATIO = 0.12;

type AnyEditor = BlockNoteEditor<any, any, any>;

export const ColumnBlock = createBlockSpec(
  {
    type: "column" as const,
    propSchema: { width: { default: 1 } }, // flex-grow の比率
    content: "none",
    layoutOnly: true,
    placeable: "namedOnly",
    children: { allow: "blocks", exclude: ["columnList"] }, // 列の中に列は作らない（Notion と同じ）
  },
  {
    // 空の列で Enter を押しても列から抜けず、段落を足す
    experimental_keyboard: { emptyChildEnter: "stay" },
    parse: (el) => (el.classList.contains("rs-column") ? {} : undefined),
    renderFrame: (block, editor) => {
      const dom = document.createElement("div");
      dom.className = "rs-column";
      dom.style.flexGrow = String(block.props.width ?? 1);
      const slot = document.createElement("div");
      slot.className = "rs-column-slot";
      dom.append(slot);

      // 列の右端の境界をドラッグして幅を変える（最後の列にはつまみを出さない）
      let current = block;
      const handle = document.createElement("div");
      handle.className = "rs-column-resize";
      handle.contentEditable = "false";
      handle.addEventListener("mousedown", (e) => startResize(e, editor, dom, () => current));
      if (editor.isEditable) dom.append(handle);

      return {
        dom,
        slot,
        update: (next) => {
          current = next;
          dom.style.flexGrow = String(next.props.width ?? 1);
        },
      };
    },
  },
  [createExtension(({ editor }) => ({ key: "rsColumnDrop", prosemirrorPlugins: [columnDropPlugin(editor)] }))()],
)();

export const ColumnListBlock = createBlockSpec(
  {
    type: "columnList" as const,
    propSchema: {},
    content: "none",
    layoutOnly: true,
    children: { allow: ["column"], min: 2 },
  },
  {
    meta: { draggable: false },
    parse: (el) => (el.classList.contains("rs-column-list") ? {} : undefined),
    renderFrame: () => {
      const dom = document.createElement("div");
      dom.className = "rs-column-list";
      return { dom, slot: dom };
    },
  },
)();

/** 隣の列との境界をドラッグして、2 列の幅の比率を配分し直す */
function startResize(e: MouseEvent, editor: AnyEditor, dom: HTMLElement, getBlock: () => any) {
  const next = dom.nextElementSibling as HTMLElement | null;
  const nextId = next?.getAttribute("data-id");
  if (!next || !nextId) return;
  e.preventDefault();
  e.stopPropagation();

  const block = getBlock();
  const nextBlock = editor.getBlock(nextId);
  if (!nextBlock) return;
  const startX = e.clientX;
  const w1 = dom.getBoundingClientRect().width;
  const w2 = next.getBoundingClientRect().width;
  const grow = (block.props.width ?? 1) + ((nextBlock.props as { width?: number }).width ?? 1);
  let ratio = w1 / (w1 + w2);
  document.body.classList.add("rs-resizing");

  // ドラッグ中は見た目だけ変え、離したときに 1 回だけ保存する（取り消し履歴を 1 つにまとめるため）
  const onMove = (ev: MouseEvent) => {
    const nw1 = Math.min(Math.max(w1 + ev.clientX - startX, MIN_COLUMN_PX), w1 + w2 - MIN_COLUMN_PX);
    ratio = nw1 / (w1 + w2);
    dom.style.flexGrow = String(grow * ratio);
    next.style.flexGrow = String(grow * (1 - ratio));
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.classList.remove("rs-resizing");
    editor.transact(() => {
      editor.updateBlock(block.id, { props: { width: grow * ratio } });
      editor.updateBlock(nextId, { props: { width: grow * (1 - ratio) } });
    });
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

type Edge = { side: "left" | "right"; pos: number; node: any; inColumn: boolean };

/**
 * ドロップ位置がブロックの左外側・右端付近なら、そのブロック（列の中なら列）を返す。
 * 列の中のブロックの場合は、新しい段組みを入れ子にせず、既存の段組みに列を足す。
 */
function detectEdge(view: EditorView, event: DragEvent): Edge | null {
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!at) return null;
  let $pos = view.state.doc.resolve(getNearestBlockPos(view.state.doc, at.pos).posBeforeNode);
  const inColumn = $pos.parent.type.name === "column";
  if (inColumn) $pos = view.state.doc.resolve($pos.before());

  const el = view.nodeDOM($pos.pos) as HTMLElement | null;
  if (!el || !$pos.nodeAfter) return null;
  const rect = el.getBoundingClientRect();
  const side =
    event.clientX <= rect.left ? "left" : event.clientX >= rect.right - rect.width * RIGHT_EDGE_RATIO ? "right" : null;
  return side && { side, pos: $pos.pos, node: $pos.nodeAfter, inColumn };
}

/** 縦線のドロップカーソルを出す（BlockNoteEditor の dropCursor オプションに渡す） */
export const columnDropCursor: DropCursorOptions = {
  hooks: {
    computeDropPosition: (ctx) => {
      // 埋め込みデータベースの中（ボードのカード移動など）ではドロップカーソルを出さない
      if ((ctx.event.target as Element | null)?.closest?.(".inline-db-frame")) return null;
      const edge = detectEdge(ctx.view, ctx.event);
      if (!edge) return ctx.defaultPosition;
      return { pos: edge.pos, orientation: edge.side === "left" ? "block-vertical-left" : "block-vertical-right" };
    },
  },
};

function columnDropPlugin(editor: AnyEditor) {
  return new Plugin({
    props: {
      handleDrop(view, event, slice) {
        const edge = detectEdge(view, event);
        if (!edge) return false;
        const dragged = fragmentToBlocks<any, any, any>(slice.content);
        if (!dragged.length) return false;
        const draggedIds = new Set(dragged.map((b) => b.id));
        const target = nodeToBlock<any, any, any>(edge.node, view.state.doc);

        // 自分自身（または自分を含むブロック）の横へのドロップは何もしない
        if (containsId(dragged, target.id)) return true;

        if (target.type === "column") {
          // 既存の段組みに列を追加する
          const list = editor.getParentBlock(target.id);
          if (!list || containsId(dragged, list.id)) return true;
          const columns = list.children
            .map((c: any) => ({ ...c, children: c.children.filter((b: any) => !draggedIds.has(b.id)) }))
            .filter((c: any) => c.children.length > 0);
          // 列の幅は平均 1 にそろえ直してから、新しい列（幅 1）を差し込む
          const avg = columns.reduce((s: number, c: any) => s + (c.props.width ?? 1), 0) / (columns.length || 1);
          for (const c of columns) c.props = { ...c.props, width: (c.props.width ?? 1) / avg };
          let at = columns.findIndex((c: any) => c.id === target.id);
          if (at < 0) at = edge.side === "left" ? 0 : columns.length - 1;
          columns.splice(edge.side === "left" ? at : at + 1, 0, { type: "column", props: { width: 1 }, children: dragged });

          editor.transact(() => {
            const outside = dragged.filter((b) => editor.getBlock(b.id) && !isInside(editor, b.id, list.id));
            if (outside.length) editor.removeBlocks(outside);
            if (columns.length === 1) editor.replaceBlocks([list.id], dragged);
            else editor.updateBlock(list.id, { children: columns });
          });
        } else {
          // 2 つのブロックから新しい段組みを作る
          const pair = edge.side === "left" ? [dragged, [target]] : [[target], dragged];
          editor.transact(() => {
            const existing = dragged.filter((b) => editor.getBlock(b.id));
            if (existing.length) editor.removeBlocks(existing);
            editor.replaceBlocks(
              [target.id],
              [{ type: "columnList", children: pair.map((children) => ({ type: "column", children })) } as PartialBlock<any, any, any>],
            );
          });
        }
        return true;
      },
    },
  });
}

function containsId(blocks: any[], id: string): boolean {
  return blocks.some((b) => b.id === id || containsId(b.children ?? [], id));
}

function isInside(editor: AnyEditor, id: string, ancestorId: string) {
  for (let b = editor.getParentBlock(id); b; b = editor.getParentBlock(b.id)) if (b.id === ancestorId) return true;
  return false;
}

/** スラッシュメニューの「2 列」などから空の段組みを挿入する */
export function columnListBlock(count: number): PartialBlock<any, any, any> {
  return {
    type: "columnList",
    children: Array.from({ length: count }, () => ({ type: "column", children: [{ type: "paragraph" }] })),
  } as PartialBlock<any, any, any>;
}

/** カーソル位置が段組みの中なら、その段組み（入れ子にしないため外側に挿入する） */
export function enclosingColumnList(editor: AnyEditor) {
  for (let b = editor.getParentBlock(editor.getTextCursorPosition().block); b; b = editor.getParentBlock(b)) {
    if (b.type === "columnList") return b;
  }
  return undefined;
}
