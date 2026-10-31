import { useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PageSummary } from "./pb";
import type { PageTree } from "./tree";
import { PageGlyph, pageLabel } from "./ui";
import { handleLinkClick, pageHref } from "./workspace";
import { ChevronIcon, ChevronsLeftIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon } from "./icons";
import { SIDEBAR_MAX, SIDEBAR_MIN, resetSidebarWidth, updateSettings } from "./settings";

export type DropPos = "before" | "after" | "inside";
type Drag = { id: string; over: string | null; pos: DropPos | null };

type Props = {
  tree: PageTree;
  loading: boolean;
  error: string | null;
  currentId: string | null;
  expanded: Set<string>;
  creating: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onCreate: (parent: string) => void;
  onTrash: (id: string) => void;
  /** ドラッグ＆ドロップでの移動。target が null ならトップレベルの末尾へ */
  onMove: (id: string, target: string | null, pos: DropPos) => void;
  onSearch: () => void;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
  onCollapse: () => void;
  /** 折りたたみ中にマウスオーバーで重ねて表示している状態。閉じるボタンは「固定」になる */
  peek: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export function Sidebar(props: Props) {
  const { tree } = props;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dnd: Dnd = { drag, setDrag, onMove: props.onMove };
  const roots = tree.children.get("") ?? [];
  const favorites = [...tree.byId.values()]
    .filter((p) => p.favorite && tree.isVisible(p.id))
    .sort((a, b) => a.created.localeCompare(b.created));

  return (
    <aside className="sidebar" onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}>
      <div className="sidebar-header">
        <span className="brand-mark">R</span>
        <span className="brand">RasStation</span>
        <button
          className={`icon-btn sidebar-collapse${props.peek ? " pin" : ""}`}
          title={props.peek ? "サイドバーを固定 (Ctrl+\\)" : "サイドバーを閉じる (Ctrl+\\)"}
          onClick={props.onCollapse}
        >
          <ChevronsLeftIcon />
        </button>
      </div>

      <button className="sidebar-action" onClick={props.onSearch}>
        <SearchIcon />
        検索
        <kbd>Ctrl+P</kbd>
      </button>
      <button className="sidebar-action" onClick={() => props.onCreate("")} disabled={props.creating}>
        <PlusIcon />
        新規ページ
      </button>

      <div className="sidebar-scroll">
        {favorites.length > 0 && (
          <Section title="お気に入り">
            {favorites.map((p) => (
              <TreeNode key={p.id} page={p} depth={0} ctx={props} />
            ))}
          </Section>
        )}


        <Section
          title="ページ"
          // 見出しへのドロップでトップレベルの末尾へ移動
          dropProps={{
            className: drag && drag.over === null && drag.pos ? "drop-root" : undefined,
            onDragOver: (e) => {
              if (!drag) return;
              e.preventDefault();
              setDrag({ ...drag, over: null, pos: "inside" });
            },
            onDrop: (e) => {
              e.preventDefault();
              if (drag) props.onMove(drag.id, null, "inside");
              setDrag(null);
            },
          }}
          action={
            <button className="icon-btn" title="ページを追加" onClick={() => props.onCreate("")}>
              <PlusIcon />
            </button>
          }
        >
          {props.error && <p className="sidebar-note error">読み込みに失敗しました</p>}
          {props.loading && <p className="sidebar-note">読み込み中…</p>}
          {!props.loading && !props.error && roots.length === 0 && <p className="sidebar-note">ページはまだありません</p>}
          {roots.map((p) => (
            <TreeNode key={p.id} page={p} depth={0} ctx={props} dnd={dnd} />
          ))}
        </Section>
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-action" onClick={props.onOpenSettings}>
          <SettingsIcon />
          設定
        </button>
        <button className="sidebar-action" onClick={props.onOpenTrash}>
          <TrashIcon />
          ゴミ箱
        </button>
      </div>
      <div
        className="sidebar-resizer"
        title="ドラッグで幅を変更（ダブルクリックで元に戻す）"
        onPointerDown={startSidebarResize}
        onDoubleClick={resetSidebarWidth}
      />
    </aside>
  );
}

/** サイドバー右端のドラッグで幅を変える。ドラッグ中は CSS 変数だけ書き換え、離したときに保存する */
function startSidebarResize(e: ReactPointerEvent<HTMLDivElement>) {
  e.preventDefault();
  const handle = e.currentTarget;
  handle.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = handle.parentElement!.getBoundingClientRect().width;
  let width = startW;
  document.body.classList.add("rs-resizing");
  const onMove = (ev: PointerEvent) => {
    width = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX)));
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
  };
  const onUp = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    document.body.classList.remove("rs-resizing");
    updateSettings({ sidebarWidth: width });
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
}

type DropProps = {
  className?: string;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

function Section(props: { title: string; action?: ReactNode; dropProps?: DropProps; children: ReactNode }) {
  const { title, action, dropProps, children } = props;
  return (
    <section>
      <div
        className={`sidebar-section${dropProps?.className ? ` ${dropProps.className}` : ""}`}
        onDragOver={dropProps?.onDragOver}
        onDrop={dropProps?.onDrop}
      >
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

const indent = (depth: number) => 4 + depth * 14;

type Dnd = { drag: Drag | null; setDrag: (d: Drag | null) => void; onMove: Props["onMove"] };

function TreeNode({ page, depth, ctx, dnd }: { page: PageSummary; depth: number; ctx: Props; dnd?: Dnd }) {
  // データベースの行はサイドバーに並べず、データベースのページ内で一覧する
  const isDb = !!page.database;
  const kids = isDb ? [] : (ctx.tree.children.get(page.id) ?? []);
  const open = !isDb && ctx.expanded.has(page.id);
  const drag = dnd?.drag;
  const dropPos = drag && drag.over === page.id ? drag.pos : null;

  // 行の上端・下端付近なら前後へ、中央なら子として入れる（データベースの中へは入れない）
  const posAt = (e: DragEvent): DropPos | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const pos: DropPos = isDb ? (y < 0.5 ? "before" : "after") : y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
    const parent = pos === "inside" ? page.id : page.parent || "";
    return drag && drag.id !== page.id && ctx.tree.canMoveInto(drag.id, parent) ? pos : null;
  };

  const dragProps = dnd && {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", page.id);
      dnd.setDrag({ id: page.id, over: null, pos: null });
    },
    onDragEnd: () => dnd.setDrag(null),
    onDragOver: (e: DragEvent) => {
      if (!drag) return;
      const pos = posAt(e);
      if (pos) e.preventDefault();
      if (drag.over !== page.id || drag.pos !== pos) dnd.setDrag({ ...drag, over: page.id, pos });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const pos = posAt(e);
      if (drag && pos) dnd.onMove(drag.id, page.id, pos);
      dnd.setDrag(null);
    },
  };

  const cls = [
    "page-item",
    page.id === ctx.currentId && "active",
    drag?.id === page.id && "dragging",
    dropPos && `drop-${dropPos}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={cls} style={{ paddingLeft: indent(depth) }} {...dragProps}>
        {isDb ? (
          <span className="tree-toggle-spacer" />
        ) : (
          <button
            className="icon-btn tree-toggle"
            aria-label={open ? "折りたたむ" : "展開する"}
            aria-expanded={open}
            onClick={() => ctx.onToggle(page.id)}
          >
            <ChevronIcon open={open} />
          </button>
        )}
        <a href={pageHref(page.id)} draggable={false} onClick={(e) => handleLinkClick(e, () => ctx.onSelect(page.id))}>
          <PageGlyph icon={page.icon} database={isDb} />
          <span className="page-item-title">{pageLabel(page)}</span>
        </a>
        <span className="page-item-actions">
          <button className="icon-btn danger" title="ゴミ箱に移動" onClick={() => ctx.onTrash(page.id)}>
            <TrashIcon />
          </button>
          <button className="icon-btn" title={isDb ? "行を追加" : "サブページを追加"} onClick={() => ctx.onCreate(page.id)}>
            <PlusIcon />
          </button>
        </span>
      </div>
      {open &&
        (kids.length ? (
          kids.map((k) => <TreeNode key={k.id} page={k} depth={depth + 1} ctx={ctx} dnd={dnd} />)
        ) : (
          <p className="tree-empty" style={{ paddingLeft: indent(depth + 1) + 26 }}>
            サブページはありません
          </p>
        ))}
    </>
  );
}
