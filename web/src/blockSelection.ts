import { createExtension, type BlockNoteEditor } from "@blocknote/core";
import { Fragment, Slice, type Node, type ResolvedPos } from "prosemirror-model";
import { Plugin, Selection, TextSelection } from "prosemirror-state";
import type { Mappable } from "prosemirror-transform";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

// 複数ブロックの選択（Notion のブロック選択）。
// 本文の余白からドラッグして範囲を囲むと、重なったブロックがまとめて選択される（Esc で今のブロックだけを選択）。
// 選択中は ⋮⋮ のドラッグでまとめて移動、Ctrl+C / Ctrl+X でコピー・切り取り、Delete で削除、
// Ctrl+Shift+↑↓ で上下へ移動できる。

type AnyEditor = BlockNoteEditor<any, any, any>;

/** 移動とみなすまでのマウスの移動量 */
const DRAG_THRESHOLD_PX = 4;

/**
 * 同じ親の中で隣り合うブロックの範囲を表す選択。anchor / head はブロックの直前・直後の位置。
 * BlockNote 内部の MultipleNodeSelection と同じ形だが、公開されていないので自前で持つ。
 */
export class BlockRangeSelection extends Selection {
  nodes: Node[];

  constructor($anchor: ResolvedPos, $head: ResolvedPos) {
    super($anchor, $head);
    const parent = $anchor.node();
    this.nodes = [];
    $anchor.doc.nodesBetween(this.from, this.to, (node, _pos, p) => {
      if (p !== null && p.eq(parent)) {
        this.nodes.push(node);
        return false;
      }
      return undefined;
    });
  }

  static create(doc: Node, from: number, to: number) {
    return new BlockRangeSelection(doc.resolve(from), doc.resolve(to));
  }

  content() {
    return new Slice(Fragment.from(this.nodes), 0, 0);
  }

  eq(other: Selection): boolean {
    return other instanceof BlockRangeSelection && other.from === this.from && other.to === this.to;
  }

  map(doc: Node, mapping: Mappable): Selection {
    const from = mapping.mapResult(this.from);
    const to = mapping.mapResult(this.to);
    if (from.deleted || to.deleted || from.pos >= to.pos) return Selection.near(doc.resolve(from.pos));
    return new BlockRangeSelection(doc.resolve(from.pos), doc.resolve(to.pos));
  }

  toJSON() {
    return { type: "rsBlockRange", anchor: this.anchor, head: this.head };
  }

  static fromJSON(doc: Node, json: { anchor: number; head: number }) {
    return new BlockRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }

  /** 選択中のブロック（ID と位置） */
  blocks() {
    const out: { id: string; pos: number; node: Node }[] = [];
    let pos = this.from;
    for (const node of this.nodes) {
      out.push({ id: node.attrs.id as string, pos, node });
      pos += node.nodeSize;
    }
    return out;
  }
}

// テキストの選択範囲は見せず、ブロックの背景で選択を示す
BlockRangeSelection.prototype.visible = false;
Selection.jsonID("rsBlockRange", BlockRangeSelection);

const isBlock = (node: Node) => (node.type.spec.group ?? "").split(" ").includes("bnBlock");
// 子にブロックを並べる入れ物（ここで区切った範囲を選択にする）。段組みの columnList の子は「列」なので対象外
const isBlockContainer = (node: Node) => node.type.name === "blockGroup" || node.type.name === "column" || node.type.name === "doc";

/** ID のブロックを先頭から末尾まで選択する */
function selectByIds(view: EditorView, firstId: string, lastId: string) {
  let from = -1;
  let to = -1;
  view.state.doc.descendants((node, pos) => {
    if (node.attrs.id === firstId && isBlock(node)) from = pos;
    if (node.attrs.id === lastId && isBlock(node)) to = pos + node.nodeSize;
    return from < 0 || to < 0;
  });
  if (from >= 0 && to > from) view.dispatch(view.state.tr.setSelection(BlockRangeSelection.create(view.state.doc, from, to)));
}

/** 画面上の矩形と重なるブロックを、同じ親の中の連続した範囲として求める */
function rangeInRect(view: EditorView, rect: DOMRect) {
  const { doc } = view.state;
  const hits: { pos: number; node: Node }[] = [];
  doc.descendants((node, pos) => {
    if (!isBlock(node)) return true;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return false;
    const r = dom.getBoundingClientRect();
    const overlaps = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
    if (overlaps) hits.push({ pos, node });
    return overlaps; // 重ならないブロックの子は調べない
  });
  // 子のブロックも重なっているものは除き、いちばん内側のブロックだけにする
  const minimal = hits.filter((h) => !hits.some((o) => o !== h && o.pos > h.pos && o.pos < h.pos + h.node.nodeSize));
  if (!minimal.length) return null;

  // すべてを含む、いちばん内側の「ブロックの入れ物」を探す
  const resolved = minimal.map((h) => doc.resolve(h.pos));
  let depth = Math.min(...resolved.map(($p) => $p.depth));
  while (depth > 0 && !(resolved.every(($p) => $p.start(depth) === resolved[0].start(depth)) && isBlockContainer(resolved[0].node(depth)))) {
    depth--;
  }
  const children = resolved.map(($p, i) => ($p.depth === depth ? minimal[i].pos : $p.before(depth + 1)));
  const from = Math.min(...children);
  const to = Math.max(...children.map((pos) => pos + doc.nodeAt(pos)!.nodeSize));
  return { from, to };
}

/** 選択中のブロックをまとめて上下に動かす */
function moveSelected(editor: AnyEditor, view: EditorView, sel: BlockRangeSelection, dir: "up" | "down") {
  const ids = sel.blocks().map((b) => b.id);
  const target = dir === "up" ? editor.getPrevBlock(ids[0]) : editor.getNextBlock(ids[ids.length - 1]);
  if (!target) return;
  const blocks = ids.map((id) => editor.getBlock(id)).filter((b) => !!b);
  editor.transact(() => {
    editor.removeBlocks(ids);
    editor.insertBlocks(blocks, target, dir === "up" ? "before" : "after");
  });
  selectByIds(view, ids[0], ids[ids.length - 1]);
}

/** ドラッグ中の見た目（選択したブロックの複製） */
let dragPreview: HTMLElement | null = null;
function setDragPreview(view: EditorView, sel: BlockRangeSelection, dt: DataTransfer) {
  dragPreview?.remove();
  const preview = document.createElement("div");
  preview.className = `bn-drag-preview rs-drag-preview ${view.dom.className.replace(/\b(ProseMirror|bn-root|bn-editor)\b/g, "")}`;
  for (const b of sel.blocks()) {
    const dom = view.nodeDOM(b.pos);
    if (dom instanceof HTMLElement) preview.append(dom.cloneNode(true));
  }
  document.body.append(preview);
  dragPreview = preview;
  dt.setDragImage(preview, 0, 0);
}

/**
 * ⋮⋮ のドラッグ開始時、BlockNote は選択を「つかんだブロック 1 つ」に置き換える。
 * 選択中のブロックをつかんだときは、その後で選択とドラッグの中身を選択範囲全体に戻す。
 */
function installDragHook(view: EditorView) {
  let saved: BlockRangeSelection | null = null;
  const capture = (e: DragEvent) => {
    saved = null;
    const sel = view.state.selection;
    const handle = (e.target as Element | null)?.closest?.(".bn-side-menu");
    if (!handle || !(sel instanceof BlockRangeSelection) || !view.dom.isConnected) return;
    // サイド表示などでエディタが 2 つあるときに、もう一方の ⋮⋮ に反応しないよう横位置も確かめる
    const area = view.dom.getBoundingClientRect();
    if (e.clientX < area.left - 120 || e.clientX > area.right) return;
    // つかんだ ⋮⋮ の高さにあるブロックが選択に含まれるか
    const inSelection = sel.blocks().some((b) => {
      const dom = view.nodeDOM(b.pos);
      if (!(dom instanceof HTMLElement)) return false;
      const r = dom.getBoundingClientRect();
      return e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4;
    });
    if (inSelection) saved = sel;
  };
  const bubble = (e: DragEvent) => {
    const sel = saved;
    saved = null;
    if (!sel || !e.dataTransfer) return;
    const doc = view.state.doc;
    if (sel.to > doc.content.size) return;
    const restored = BlockRangeSelection.create(doc, sel.from, sel.to);
    view.dispatch(view.state.tr.setSelection(restored));
    const slice = restored.content();
    e.dataTransfer.setData("blocknote/html", view.serializeForClipboard(slice).dom.innerHTML);
    e.dataTransfer.setData("blocknote/parent", restored.$from.parent.type.name);
    e.dataTransfer.setData("text/plain", restored.nodes.map((n) => n.textContent).join("\n"));
    view.dragging = { slice, move: true };
    setDragPreview(view, restored, e.dataTransfer);
  };
  const end = () => {
    dragPreview?.remove();
    dragPreview = null;
  };
  window.addEventListener("dragstart", capture, true);
  window.addEventListener("dragstart", bubble);
  window.addEventListener("dragend", end);
  return () => {
    window.removeEventListener("dragstart", capture, true);
    window.removeEventListener("dragstart", bubble);
    window.removeEventListener("dragend", end);
  };
}

/** 本文の余白からのドラッグで、範囲を囲んだブロックを選択する */
function installMarquee(view: EditorView) {
  const NOT_FROM =
    ".bn-block-content, .bn-trailing-block, .bn-side-menu, .inline-db-frame, .rs-column-resize, .page-cover, .props-panel, input, textarea, select, button, a, [contenteditable='false']";

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !view.editable || !view.dom.isConnected) return;
    const target = e.target as Element | null;
    const wrap = view.dom.closest(".page-wrap");
    if (!target || !wrap?.contains(target) || target.closest(NOT_FROM)) return;
    // エディタ内の余白では、ProseMirror の文字選択を始めさせない（クリックだけならカーソルを置き直す）
    const inEditor = view.dom.contains(target);
    if (inEditor) {
      e.preventDefault();
      e.stopPropagation();
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let box: HTMLDivElement | null = null;

    const onMove = (ev: MouseEvent) => {
      if (!box) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        box = document.createElement("div");
        box.className = "rs-marquee";
        document.body.append(box);
        document.body.classList.add("rs-marquee-active");
        window.getSelection()?.removeAllRanges();
      }
      const rect = new DOMRect(
        Math.min(startX, ev.clientX),
        Math.min(startY, ev.clientY),
        Math.abs(ev.clientX - startX),
        Math.abs(ev.clientY - startY),
      );
      Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const range = rangeInRect(view, rect);
      if (!view.hasFocus()) view.focus();
      const sel = range
        ? BlockRangeSelection.create(view.state.doc, range.from, range.to)
        : TextSelection.near(view.state.selection.$head);
      if (!sel.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(sel));
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (box) {
        box.remove();
        document.body.classList.remove("rs-marquee-active");
        return;
      }
      // ドラッグせずにエディタの余白をクリックしただけなら、通常どおり近くにカーソルを置く
      if (inEditor) {
        // 余白の座標のままだと隣のブロックの位置になることがあるので、本文の左右の範囲に収めてから位置を求める
        const area = view.dom.querySelector(".bn-block-group")?.getBoundingClientRect();
        const left = area ? Math.min(Math.max(ev.clientX, area.left + 1), area.right - 1) : ev.clientX;
        const at = view.posAtCoords({ left, top: ev.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
        view.focus();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  document.addEventListener("mousedown", onMouseDown, true);
  return () => document.removeEventListener("mousedown", onMouseDown, true);
}

function blockSelectionPlugin(editor: AnyEditor) {
  return new Plugin({
    view(view) {
      const offMarquee = installMarquee(view);
      const offDrag = installDragHook(view);
      return {
        destroy() {
          offMarquee();
          offDrag();
        },
      };
    },
    props: {
      decorations(state) {
        const sel = state.selection;
        if (!(sel instanceof BlockRangeSelection)) return null;
        return DecorationSet.create(
          state.doc,
          sel.blocks().map((b) => Decoration.node(b.pos, b.pos + b.node.nodeSize, { class: "rs-block-selected" })),
        );
      },
      handleKeyDown(view, e) {
        const sel = view.state.selection;
        const mod = e.ctrlKey || e.metaKey;

        // Esc: 文字を編集中なら、今のブロックを選択する
        if (e.key === "Escape" && sel instanceof TextSelection && !e.defaultPrevented) {
          // クリック直後はブラウザのカーソル位置がまだ state に反映されていないことがあるので、DOM の選択から読む
          const dom = document.getSelection();
          const at = dom?.focusNode && view.dom.contains(dom.focusNode) ? view.posAtDOM(dom.focusNode, dom.focusOffset) : sel.head;
          const $pos = view.state.doc.resolve(at);
          for (let d = $pos.depth; d > 0; d--) {
            if (isBlock($pos.node(d))) {
              view.dispatch(view.state.tr.setSelection(BlockRangeSelection.create(view.state.doc, $pos.before(d), $pos.after(d))));
              return true;
            }
          }
          return false;
        }

        if (!(sel instanceof BlockRangeSelection)) return false;
        if (e.key === "Escape") {
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(sel.from))));
          return true;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          editor.removeBlocks(sel.blocks().map((b) => b.id));
          return true;
        }
        if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          moveSelected(editor, view, sel, e.key === "ArrowUp" ? "up" : "down");
          return true;
        }
        // コピー・切り取り・元に戻すなどは既定の処理に任せ、文字の入力でブロックが置き換わらないようにする
        if (mod) return false;
        return e.key.length === 1 || e.key === "Enter" || e.key === "Tab";
      },
      handleTextInput(view) {
        return view.state.selection instanceof BlockRangeSelection;
      },
    },
  });
}

export const blockSelectionExtension = createExtension(({ editor }) => ({
  key: "rsBlockSelection",
  prosemirrorPlugins: [blockSelectionPlugin(editor)],
}))();
