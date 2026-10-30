import { useEffect, useMemo, useRef, useState } from "react";
import type { PageSummary } from "./pb";
import type { PageTree } from "./tree";
import { Modal, PageGlyph, pageLabel } from "./ui";
import { MoveIcon, PageIcon } from "./icons";

const MAX_RESULTS = 50;

/** 「移動」: 移動先の親ページを選ぶ（ドラッグできないスマホでも階層を変えられるように） */
export function MoveDialog(props: {
  tree: PageTree;
  page: PageSummary;
  onMove: (parent: string) => void;
  onClose: () => void;
}) {
  const { tree, page, onMove, onClose } = props;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const query = q.trim().toLowerCase();

  // 先頭は「トップレベル」（id ""）。自身・子孫・現在の親は除く
  const targets = useMemo(() => {
    const pagesHit = [...tree.byId.values()]
      .filter(
        (p) =>
          tree.isVisible(p.id) &&
          p.id !== page.parent &&
          tree.canMoveInto(page.id, p.id) &&
          (!query || pageLabel(p).toLowerCase().includes(query)),
      )
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, MAX_RESULTS);
    return [...(page.parent && !query ? [null] : []), ...pagesHit];
  }, [tree, page, query]);

  const activeIndex = Math.min(active, targets.length - 1);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (p: PageSummary | null) => {
    onMove(p?.id ?? "");
    onClose();
  };

  return (
    <Modal onClose={onClose} label="移動">
      <div className="search-input-row">
        <MoveIcon />
        <input
          autoFocus
          value={q}
          placeholder={`「${pageLabel(page)}」の移動先を検索…`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(activeIndex + 1, targets.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(activeIndex - 1, 0));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing && activeIndex >= 0) {
              choose(targets[activeIndex]);
            }
          }}
        />
      </div>
      <ul className="search-results" ref={listRef}>
        {targets.map((p, i) => (
          <li key={p?.id ?? ""}>
            <button
              className={`search-result${i === activeIndex ? " active" : ""}`}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(p)}
            >
              {p ? (
                <>
                  <PageGlyph icon={p.icon} database={!!p.database} />
                  <span className="search-result-title">{pageLabel(p)}</span>
                  <span className="search-result-path">{tree.ancestors(p.id).map(pageLabel).join(" / ")}</span>
                </>
              ) : (
                <>
                  <span className="page-glyph">
                    <PageIcon />
                  </span>
                  <span className="search-result-title">トップレベル（親ページなし）</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
      {targets.length === 0 && <p className="search-empty">移動先が見つかりませんでした</p>}
    </Modal>
  );
}
