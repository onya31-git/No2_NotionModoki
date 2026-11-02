import { useEffect, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import type { OpenMode, PageSummary, SaveStatus } from "./pb";
import { PageEditor } from "./PageEditor";
import { updateSettings, useSettings } from "./settings";
import { SaveIndicator } from "./ui";
import { CloseIcon, ExpandIcon } from "./icons";

// データベースの行を、表やボードを開いたまま横（または下）や中央に表示する（Notion のサイドピーク・センターピーク）

const PORTRAIT = window.matchMedia("(orientation: portrait)");
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
/** 閉じるアニメーションの長さ（style.css の peek-out と合わせる） */
const LEAVE_MS = 200;

/**
 * 閉じたあとも、閉じるアニメーションの間だけ直前の値を返し続ける。
 * 戻り値は [表示する値, 閉じている途中か]
 */
export function usePresence<T>(value: T | null): [T | null, boolean] {
  const [last, setLast] = useState(value);
  useEffect(() => {
    if (value !== null || REDUCED_MOTION.matches) {
      setLast(value);
      return;
    }
    const timer = window.setTimeout(() => setLast(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return value !== null ? [value, false] : [last, last !== null];
}
const RATIO_MIN = 0.2;
const RATIO_MAX = 0.8;

/** サイド表示を出す位置。「自動」は縦長の画面なら下、横長なら右 */
export function usePeekPosition(): "right" | "bottom" {
  const { peekPosition } = useSettings();
  const portrait = useSyncExternalStore(
    (l) => {
      PORTRAIT.addEventListener("change", l);
      return () => PORTRAIT.removeEventListener("change", l);
    },
    () => PORTRAIT.matches,
  );
  if (peekPosition === "auto") return portrait ? "bottom" : "right";
  return peekPosition;
}

type Props = {
  id: string;
  mode: Exclude<OpenMode, "full">;
  meta: PageSummary | undefined;
  readOnly: boolean;
  onClose: () => void;
  onExpand: () => void;
  onLocalPatch: (id: string, patch: Partial<PageSummary>) => void;
  onUpdate: (id: string, patch: Partial<PageSummary>) => void;
  /** 閉じるアニメーション中 */
  leaving?: boolean;
};

function PeekBody(props: Props & { className: string; style?: CSSProperties }) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  return (
    <aside className={`peek ${props.className}${props.leaving ? " leaving" : ""}`} style={props.style} aria-label="ページのプレビュー">
      <div className="peek-bar">
        <button className="icon-btn" title="閉じる (Esc)" aria-label="閉じる" onClick={props.onClose}>
          <CloseIcon />
        </button>
        <button className="icon-btn" title="フルページで開く" aria-label="フルページで開く" onClick={props.onExpand}>
          <ExpandIcon />
        </button>
        <span className="peek-spacer" />
        <SaveIndicator status={status} />
      </div>
      <div className="peek-scroll">
        <PageEditor
          key={props.id}
          pageId={props.id}
          meta={props.meta}
          readOnly={props.readOnly}
          onLocalPatch={props.onLocalPatch}
          onUpdate={props.onUpdate}
          onStatusChange={setStatus}
        />
      </div>
    </aside>
  );
}

/** 右または下に並べて表示する。境目をドラッグして大きさを変えられる（端末ごとに保存） */
export function SidePeek(props: Omit<Props, "mode"> & { position: "right" | "bottom" }) {
  const { position } = props;
  const { peekRatio } = useSettings();
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = dragRatio ?? peekRatio[position];

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const split = e.currentTarget.parentElement;
    if (!split || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = split.getBoundingClientRect();
    const handle = e.currentTarget;
    let latest = ratio;
    const onMove = (ev: globalThis.PointerEvent) => {
      const r = position === "right" ? (rect.right - ev.clientX) / rect.width : (rect.bottom - ev.clientY) / rect.height;
      latest = Math.min(RATIO_MAX, Math.max(RATIO_MIN, r));
      setDragRatio(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("rs-peek-resizing", `rs-peek-resizing-${position}`);
      updateSettings({ peekRatio: { ...peekRatio, [position]: latest } });
      setDragRatio(null);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    document.body.classList.add("rs-peek-resizing", `rs-peek-resizing-${position}`);
  };

  return (
    <>
      <div
        hidden={props.leaving}
        className={`peek-resizer peek-resizer-${position}`}
        role="separator"
        aria-orientation={position === "right" ? "vertical" : "horizontal"}
        title="ドラッグして大きさを変更"
        onPointerDown={onPointerDown}
        onDoubleClick={() => updateSettings({ peekRatio: { ...peekRatio, [position]: position === "right" ? 0.45 : 0.5 } })}
      />
      <PeekBody {...props} mode="side" className={`peek-side peek-${position}`} style={{ flexBasis: `${ratio * 100}%` }} />
    </>
  );
}

/** 画面中央にポップアップで表示する。背景のクリックで閉じる */
export function CenterPeek(props: Omit<Props, "mode">) {
  return (
    <div className={`peek-backdrop${props.leaving ? " leaving" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <PeekBody {...props} mode="center" className="peek-center" />
    </div>
  );
}
