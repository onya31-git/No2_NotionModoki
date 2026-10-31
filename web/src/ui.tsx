import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PageSummary } from "./pb";
import { PageIcon, TableIcon } from "./icons";

export const pageLabel = (p: Pick<PageSummary, "title">) => p.title || "無題";

// PocketBase の日時は "2026-10-29 12:34:56.789Z" 形式なので、T 区切りにしてから解釈する
export const formatDate = (s: string) =>
  new Date(s.replace(" ", "T")).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // http://raspberrypi.local:8090 のような非セキュアコンテキストでは Clipboard API が使えない
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export function PageGlyph({ icon, database }: { icon: string; database?: boolean }) {
  if (icon) return <span className="page-glyph emoji">{icon}</span>;
  return <span className="page-glyph">{database ? <TableIcon /> : <PageIcon />}</span>;
}

/** refs のいずれの外側をクリックしても、Esc を押しても閉じる */
function useDismiss(refs: RefObject<HTMLElement | null>[], onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // refs は呼び出し側で毎回作る配列なので依存に含めない（中身の ref オブジェクトは不変）
  }, [onClose, active]);
}

/**
 * トリガーの直下に開くポップオーバー。トリガーも含めて外側判定するので、トリガー再クリックで閉じられる。
 * fixed は横スクロールする表の中など、親の overflow で切れてしまう場所で使う。
 * 画面基準で配置し、document.body 直下に描画する（祖先に backdrop-filter 等があると fixed の基準がずれるため）。
 */
export function Dropdown(props: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  fixed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | undefined>();
  useDismiss([ref, popRef], props.onClose, props.open);

  useLayoutEffect(() => {
    if (!props.open || !props.fixed || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // 下に収まらなければ上に開く
    const below = window.innerHeight - r.bottom > 320 || r.top < window.innerHeight / 2;
    setPos({
      position: "fixed",
      left: Math.max(8, Math.min(r.left, window.innerWidth - 268)),
      ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
      right: "auto",
    });
  }, [props.open, props.fixed]);

  // fixed 配置はスクロールに追従しないので、スクロールしたら閉じる
  const { onClose } = props;
  useEffect(() => {
    if (!props.open || !props.fixed) return;
    const onScroll = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [props.open, props.fixed, onClose]);

  const popover = (
    <div ref={popRef} className={`popover popover-${props.align ?? "left"}`} style={props.fixed ? pos : undefined}>
      {props.children}
    </div>
  );

  return (
    <div ref={ref} className="popover-anchor">
      {props.trigger}
      {props.open && (props.fixed ? pos && createPortal(popover, document.body) : popover)}
    </div>
  );
}

export function Modal(props: { onClose: () => void; label: string; children: ReactNode }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.label}>
        {props.children}
      </div>
    </div>
  );
}

export function MenuItem(props: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  return (
    <button className={`menu-item${props.danger ? " danger" : ""}`} onClick={props.onClick}>
      {props.icon}
      <span className="menu-item-label">{props.children}</span>
      {props.right}
    </button>
  );
}
