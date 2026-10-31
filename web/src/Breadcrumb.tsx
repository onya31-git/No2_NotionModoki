import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PageSummary } from "./pb";
import { Dropdown, PageGlyph, pageLabel } from "./ui";
import { handleLinkClick, pageHref } from "./workspace";

/** これより深い階層は、先頭と末尾 2 つを残して中間を「…」に畳む（Notion と同じ） */
const MAX_VISIBLE = 3;
const MOBILE_QUERY = window.matchMedia("(max-width: 768px)");
const CLOSE_DELAY_MS = 200;
// タッチ端末ではタップでも mouseenter が発生し、直後の click で閉じてしまうので、ホバーは使わずタップで開閉する
const CAN_HOVER = window.matchMedia("(hover: hover)");

const useIsMobile = () =>
  useSyncExternalStore(
    (l) => {
      MOBILE_QUERY.addEventListener("change", l);
      return () => MOBILE_QUERY.removeEventListener("change", l);
    },
    () => MOBILE_QUERY.matches,
  );

/** path はルート側から現在のページまで */
export function Breadcrumb({ path, onNavigate }: { path: PageSummary[]; onNavigate: (id: string) => void }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // 狭い画面では現在のページ以外をすべて畳む
  const keepHead = mobile ? 0 : 1;
  const keepTail = mobile ? 1 : MAX_VISIBLE - 1;
  const collapse = path.length > keepHead + keepTail && (mobile || path.length > MAX_VISIBLE);
  const head = collapse ? path.slice(0, keepHead) : path;
  const hidden = collapse ? path.slice(keepHead, path.length - keepTail) : [];
  const tail = collapse ? path.slice(path.length - keepTail) : [];

  // ページを移ったら閉じる
  const currentId = path[path.length - 1]?.id;
  useEffect(() => setOpen(false), [currentId]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const close = useCallback(() => setOpen(false), []);
  // マウスで「…」と一覧の間を移る間に閉じないよう、閉じるのは少し待つ
  const hoverOpen = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  const crumb = (p: PageSummary, current: boolean) => (
    <a
      href={pageHref(p.id)}
      className={`breadcrumb-item${current ? " current" : ""}`}
      title={pageLabel(p)}
      onClick={(e) => handleLinkClick(e, () => onNavigate(p.id))}
    >
      <PageGlyph icon={p.icon} database={!!p.database} />
      <span>{pageLabel(p)}</span>
    </a>
  );

  const items = [
    ...head.map((p) => ({ key: p.id, node: crumb(p, p.id === currentId) })),
    ...(hidden.length
      ? [
          {
            key: "…",
            node: (
              <div
                className="breadcrumb-more"
                onMouseEnter={() => CAN_HOVER.matches && hoverOpen()}
                onMouseLeave={() => CAN_HOVER.matches && hoverClose()}
              >
                <Dropdown
                  open={open}
                  onClose={close}
                  fixed
                  trigger={
                    <button
                      className="breadcrumb-item breadcrumb-ellipsis"
                      aria-label={`${hidden.length} 階層を表示`}
                      aria-expanded={open}
                      // ホバーで開いた状態でのクリックは、閉じずにそのまま開いておく
                      onClick={() => setOpen((o) => (CAN_HOVER.matches ? true : !o))}
                    >
                      …
                    </button>
                  }
                >
                  <div className="menu breadcrumb-menu">
                    {hidden.map((p, i) => (
                      <a
                        key={p.id}
                        href={pageHref(p.id)}
                        className="menu-item"
                        style={{ paddingLeft: 10 + i * 12 }}
                        onClick={(e) => handleLinkClick(e, () => onNavigate(p.id))}
                      >
                        <PageGlyph icon={p.icon} database={!!p.database} />
                        <span className="menu-item-label">{pageLabel(p)}</span>
                      </a>
                    ))}
                  </div>
                </Dropdown>
              </div>
            ),
          },
        ]
      : []),
    ...tail.map((p) => ({ key: p.id, node: crumb(p, p.id === currentId) })),
  ];

  return (
    <nav className="breadcrumb" aria-label="パンくずリスト">
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          {item.node}
        </Fragment>
      ))}
    </nav>
  );
}
