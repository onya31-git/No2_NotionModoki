import { useEffect, useMemo, useRef, useState } from "react";
import { pb, pages } from "./pb";
import type { PageTree } from "./tree";
import { Modal, PageGlyph, pageLabel } from "./ui";
import { SearchIcon } from "./icons";

const RECENT_COUNT = 8;
const MAX_RESULTS = 30;

/** Notion の Quick Find 相当。タイトルは手元の一覧から即時に、本文は PocketBase に問い合わせて検索する */
export function SearchDialog(props: { tree: PageTree; onSelect: (id: string) => void; onClose: () => void }) {
  const { tree, onSelect, onClose } = props;
  const [q, setQ] = useState("");
  const [contentIds, setContentIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const query = q.trim();

  // 本文検索は JSON 文字列に対する部分一致。打鍵ごとに Pi へ問い合わせないよう少し待つ
  useEffect(() => {
    setContentIds([]);
    if (!query) return;
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      pages()
        .getList(1, MAX_RESULTS, {
          filter: pb.filter("content ~ {:q} && trashed = false", { q: query }),
          fields: "id",
          sort: "-updated",
        })
        .then((res) => !cancelled && setContentIds(res.items.map((i) => i.id)))
        .catch((err) => console.error("search failed", err))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setSearching(false);
    };
  }, [query]);

  const results = useMemo(() => {
    const visible = [...tree.byId.values()].filter((p) => tree.isVisible(p.id));
    if (!query) return visible.sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, RECENT_COUNT);

    const lower = query.toLowerCase();
    const titleHits = visible.filter((p) => pageLabel(p).toLowerCase().includes(lower));
    const seen = new Set(titleHits.map((p) => p.id));
    const contentHits = contentIds.filter((id) => !seen.has(id) && tree.isVisible(id)).map((id) => tree.byId.get(id)!);
    return [...titleHits, ...contentHits].slice(0, MAX_RESULTS);
  }, [tree, query, contentIds]);

  const activeIndex = Math.min(active, results.length - 1);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <Modal onClose={onClose} label="検索">
      <div className="search-input-row">
        <SearchIcon />
        <input
          autoFocus
          value={q}
          placeholder="ページを検索…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(activeIndex + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(activeIndex - 1, 0));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing && results[activeIndex]) {
              choose(results[activeIndex].id);
            }
          }}
        />
        {searching && <span className="spinner" aria-label="検索中" />}
      </div>

      <div className="search-section-label">{query ? "検索結果" : "最近更新したページ"}</div>
      <ul className="search-results" ref={listRef}>
        {results.map((p, i) => (
          <li key={p.id}>
            <button
              className={`search-result${i === activeIndex ? " active" : ""}`}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(p.id)}
            >
              <PageGlyph icon={p.icon} database={!!p.database} />
              <span className="search-result-title">{pageLabel(p)}</span>
              <span className="search-result-path">{tree.ancestors(p.id).map(pageLabel).join(" / ")}</span>
            </button>
          </li>
        ))}
      </ul>
      {results.length === 0 && <p className="search-empty">{searching ? "検索中…" : "見つかりませんでした"}</p>}

      <div className="search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 選択</span>
        <span><kbd>Enter</kbd> 開く</span>
        <span><kbd>Esc</kbd> 閉じる</span>
      </div>
    </Modal>
  );
}
