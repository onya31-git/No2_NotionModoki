import { useState } from "react";
import type { PageSummary } from "./pb";
import type { PageTree } from "./tree";
import { Modal, PageGlyph, formatDate, pageLabel } from "./ui";
import { RestoreIcon, SearchIcon, TrashIcon } from "./icons";

export function TrashDialog(props: {
  tree: PageTree;
  onSelect: (id: string) => void;
  onRestore: (page: PageSummary) => void;
  onDeleteForever: (page: PageSummary) => void;
  onClose: () => void;
}) {
  const { tree, onClose } = props;
  const [q, setQ] = useState("");
  const lower = q.trim().toLowerCase();
  const trashed = [...tree.byId.values()]
    .filter((p) => p.trashed && pageLabel(p).toLowerCase().includes(lower))
    .sort((a, b) => b.updated.localeCompare(a.updated));

  return (
    <Modal onClose={onClose} label="ゴミ箱">
      <div className="search-input-row">
        <SearchIcon />
        <input autoFocus value={q} placeholder="ゴミ箱内のページを検索…" onChange={(e) => setQ(e.target.value)} />
      </div>

      <ul className="search-results">
        {trashed.map((p) => (
          <li key={p.id} className="trash-row">
            <button
              className="search-result"
              onClick={() => {
                props.onSelect(p.id);
                onClose();
              }}
            >
              <PageGlyph icon={p.icon} />
              <span className="search-result-title">{pageLabel(p)}</span>
              <span className="search-result-path">{formatDate(p.updated)}</span>
            </button>
            <button className="icon-btn" title="復元" onClick={() => props.onRestore(p)}>
              <RestoreIcon />
            </button>
            <button className="icon-btn danger" title="完全に削除" onClick={() => props.onDeleteForever(p)}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      {trashed.length === 0 && <p className="search-empty">{q ? "見つかりませんでした" : "ゴミ箱は空です"}</p>}

      <div className="search-footer">
        <span>完全に削除すると、サブページとともに元に戻せなくなります。</span>
      </div>
    </Modal>
  );
}
