import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Column, ColumnType, DatabaseConfig, PageSummary, PropValue, SelectOption, SortSpec } from "./pb";
import { Dropdown, MenuItem, PageGlyph, pageLabel } from "./ui";
import { handleLinkClick, pageHref, useWorkspace } from "./workspace";
import {
  BoardIcon,
  CheckboxTypeIcon,
  CheckIcon,
  DateTypeIcon,
  LinkIcon,
  MultiSelectTypeIcon,
  NumberTypeIcon,
  OpenIcon,
  PlusIcon,
  SearchIcon,
  SelectTypeIcon,
  SortIcon,
  TableIcon,
  TextTypeIcon,
  TrashIcon,
} from "./icons";

// データベース = database（列定義）を持つページ。行 = その子ページで、値は props[列 ID] に入る。
// タイトル列は列定義に含めず、並べ替えなどでは TITLE という固定 ID で扱う。
const TITLE = "title";

export const newId = () => Math.random().toString(36).slice(2, 10);

const OPTION_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export function newDatabaseConfig(): DatabaseConfig {
  const status: Column = {
    id: newId(),
    name: "ステータス",
    type: "select",
    options: [
      { id: newId(), name: "未着手", color: "gray" },
      { id: newId(), name: "進行中", color: "blue" },
      { id: newId(), name: "完了", color: "green" },
    ],
  };
  return {
    columns: [status, { id: newId(), name: "日付", type: "date" }, { id: newId(), name: "タグ", type: "multi_select", options: [] }],
    view: "table",
    sort: null,
    groupBy: status.id,
  };
}

const COLUMN_TYPES: { type: ColumnType; label: string; icon: ReactNode }[] = [
  { type: "text", label: "テキスト", icon: <TextTypeIcon /> },
  { type: "number", label: "数値", icon: <NumberTypeIcon /> },
  { type: "select", label: "セレクト", icon: <SelectTypeIcon /> },
  { type: "multi_select", label: "マルチセレクト", icon: <MultiSelectTypeIcon /> },
  { type: "date", label: "日付", icon: <DateTypeIcon /> },
  { type: "checkbox", label: "チェックボックス", icon: <CheckboxTypeIcon /> },
  { type: "url", label: "URL", icon: <LinkIcon /> },
];
const typeIcon = (type: ColumnType) => COLUMN_TYPES.find((t) => t.type === type)?.icon;

// 列の型を後から変えても壊れないよう、値は読むときに型をそろえる
const asText = (v: PropValue | undefined) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v));
const asIds = (v: PropValue | undefined) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);
const isEmpty = (v: PropValue | undefined) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

// ---------------------------------------------------------------------------
// データベースの操作

function useDatabaseOps(db: PageSummary) {
  const ws = useWorkspace();
  const config = db.database!;
  // 同じ操作の中で続けて変更しても互いに上書きしないよう、直近に送った設定を基準にする
  const latest = useRef(config);
  latest.current = config;

  const setConfig = (patch: Partial<DatabaseConfig>) => {
    latest.current = { ...latest.current, ...patch };
    void ws.update(db.id, { database: latest.current });
  };
  const updateColumn = (id: string, patch: Partial<Column>) =>
    setConfig({ columns: latest.current.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  /** 選択肢を追加して返す（列定義の保存は非同期で行われる） */
  const addOption = (column: Column, name: string): SelectOption => {
    const options = column.options ?? [];
    const option = { id: newId(), name, color: OPTION_COLORS[options.length % OPTION_COLORS.length] };
    updateColumn(column.id, { options: [...options, option] });
    return option;
  };

  const setProp = (row: PageSummary, columnId: string, value: PropValue) =>
    void ws.update(row.id, { props: { ...row.props, [columnId]: value } });

  return { ws, config, latest, setConfig, updateColumn, addOption, setProp };
}

function compareRows(columns: Column[], sort: SortSpec) {
  const column = columns.find((c) => c.id === sort.column);
  const key = (row: PageSummary): string | number | null => {
    if (sort.column === TITLE) return row.title || null;
    if (!column) return null;
    const v = row.props?.[column.id];
    if (isEmpty(v)) return null;
    switch (column.type) {
      case "number":
        return Number(v);
      case "checkbox":
        return v ? 1 : 0;
      case "select":
      case "multi_select": {
        // 選択肢の定義順で並べる
        const i = column.options?.findIndex((o) => o.id === asIds(v)[0]) ?? -1;
        return i < 0 ? null : i;
      }
      default:
        return asText(v);
    }
  };
  const dir = sort.dir === "asc" ? 1 : -1;
  return (a: PageSummary, b: PageSummary) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null || kb === null) return ka === kb ? 0 : ka === null ? 1 : -1; // 空欄は常に末尾
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * dir;
    return String(ka).localeCompare(String(kb), "ja") * dir;
  };
}

// ---------------------------------------------------------------------------
// データベースページ本体

export function DatabaseView({ db, readOnly }: { db: PageSummary; readOnly: boolean }) {
  const ops = useDatabaseOps(db);
  const { ws, config, setConfig } = ops;
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = ws.tree.children.get(db.id) ?? [];
    if (q) out = out.filter((r) => pageLabel(r).toLowerCase().includes(q));
    return config.sort ? [...out].sort(compareRows(config.columns, config.sort)) : out;
  }, [ws.tree, db.id, query, config.columns, config.sort]);

  const addRow = async (props: Record<string, PropValue> = {}, open = false) => {
    const rec = await ws.create(db.id, { props }, { open });
    if (rec) setFocusId(rec.id);
  };

  const addColumn = () => {
    const column: Column = { id: newId(), name: `プロパティ ${config.columns.length + 1}`, type: "text" };
    setConfig({ columns: [...config.columns, column] });
  };

  const sortColumn = config.sort && (config.sort.column === TITLE ? "名前" : config.columns.find((c) => c.id === config.sort!.column)?.name);

  return (
    <div className="db">
      <div className="db-toolbar">
        <div className="db-tabs" role="tablist">
          <button role="tab" aria-selected={config.view === "table"} className={config.view === "table" ? "on" : ""} disabled={readOnly} onClick={() => setConfig({ view: "table" })}>
            <TableIcon />
            テーブル
          </button>
          <button role="tab" aria-selected={config.view === "board"} className={config.view === "board" ? "on" : ""} disabled={readOnly} onClick={() => setConfig({ view: "board" })}>
            <BoardIcon />
            ボード
          </button>
        </div>
        <div className="db-tools">
          {sortColumn && (
            <span className="db-chip">
              <SortIcon />
              {sortColumn}: {config.sort!.dir === "asc" ? "昇順" : "降順"}
              {!readOnly && (
                <button aria-label="並べ替えを解除" onClick={() => setConfig({ sort: null })}>
                  ×
                </button>
              )}
            </span>
          )}
          <label className="db-search">
            <SearchIcon />
            <input value={query} placeholder="絞り込み" onChange={(e) => setQuery(e.target.value)} />
          </label>
          {!readOnly && (
            <button className="btn-primary small" onClick={() => void addRow({}, config.view === "board")}>
              新規
            </button>
          )}
        </div>
      </div>

      {config.view === "board" ? (
        <BoardView db={db} rows={rows} readOnly={readOnly} ops={ops} onAddRow={(props) => void addRow(props, true)} />
      ) : (
        <TableView
          db={db}
          rows={rows}
          readOnly={readOnly}
          ops={ops}
          focusId={focusId}
          onAddRow={() => void addRow()}
          onAddColumn={addColumn}
        />
      )}
    </div>
  );
}

type Ops = ReturnType<typeof useDatabaseOps>;

function TableView(props: {
  db: PageSummary;
  rows: PageSummary[];
  readOnly: boolean;
  ops: Ops;
  focusId: string | null;
  onAddRow: () => void;
  onAddColumn: () => void;
}) {
  const { rows, readOnly, ops, focusId } = props;
  const { ws, config } = ops;

  return (
    <>
      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              <ColumnHeader column={null} ops={ops} readOnly={readOnly} />
              {config.columns.map((c) => (
                <ColumnHeader key={c.id} column={c} ops={ops} readOnly={readOnly} />
              ))}
              <th className="db-th db-th-add">
                {!readOnly && (
                  <button className="icon-btn" title="プロパティを追加" onClick={props.onAddColumn}>
                    <PlusIcon />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="db-td db-td-title">
                  <TitleCell row={row} readOnly={readOnly} autoFocus={row.id === focusId} />
                </td>
                {config.columns.map((c) => (
                  <td key={c.id} className={`db-td db-td-${c.type}`}>
                    <PropertyEditor
                      column={c}
                      value={row.props?.[c.id]}
                      readOnly={readOnly}
                      onChange={(v) => ops.setProp(row, c.id, v)}
                      onAddOption={(name) => ops.addOption(c, name)}
                    />
                  </td>
                ))}
                <td className="db-td db-td-actions">
                  {!readOnly && (
                    <button className="icon-btn danger" title="ゴミ箱に移動" onClick={() => ws.trash(row.id)}>
                      <TrashIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="db-empty">行はまだありません</p>}
      {!readOnly && (
        <button className="db-add-row" onClick={props.onAddRow}>
          <PlusIcon />
          新規
        </button>
      )}
    </>
  );
}

function TitleCell({ row, readOnly, autoFocus }: { row: PageSummary; readOnly: boolean; autoFocus: boolean }) {
  const ws = useWorkspace();
  return (
    <div className="db-title-cell">
      <PageGlyph icon={row.icon} />
      <CellInput
        value={row.title}
        placeholder="無題"
        readOnly={readOnly}
        autoFocus={autoFocus}
        onCommit={(title) => void ws.update(row.id, { title })}
      />
      <a className="db-open" href={pageHref(row.id)} onClick={(e) => handleLinkClick(e, () => ws.navigate(row.id))}>
        <OpenIcon />
        開く
      </a>
    </div>
  );
}

function ColumnHeader({ column, ops, readOnly }: { column: Column | null; ops: Ops; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const { config, setConfig, updateColumn } = ops;
  const id = column?.id ?? TITLE;
  // 名前の入力欄はメニューと一緒に消えて blur が起きないことがあるので、閉じるときに確定する
  const close = () => {
    if (column && name !== null && name !== column.name) updateColumn(column.id, { name });
    setName(null);
    setOpen(false);
  };
  const sorted = config.sort?.column === id ? config.sort.dir : null;
  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <th className={`db-th${column ? "" : " db-th-title"}`}>
      <Dropdown
        open={open}
        onClose={close}
        fixed
        trigger={
          <button className="db-th-btn" disabled={readOnly} onClick={() => (open ? close() : setOpen(true))}>
            {column ? typeIcon(column.type) : <TextTypeIcon />}
            <span>{column ? column.name || "無題" : "名前"}</span>
            {sorted && <span className="db-th-sort">{sorted === "asc" ? "↑" : "↓"}</span>}
          </button>
        }
      >
        <div className="menu db-col-menu">
          {column && (
            <>
              <input
                className="menu-input"
                value={name ?? column.name}
                placeholder="プロパティ名"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && close()}
              />
              <div className="menu-label">種類</div>
              {COLUMN_TYPES.map((t) => (
                <MenuItem
                  key={t.type}
                  icon={t.icon}
                  onClick={run(() => updateColumn(column.id, { type: t.type, options: column.options ?? [] }))}
                  right={column.type === t.type ? <CheckIcon /> : undefined}
                >
                  {t.label}
                </MenuItem>
              ))}
              {(column.type === "select" || column.type === "multi_select") && !!column.options?.length && (
                <>
                  <div className="menu-sep" />
                  <div className="menu-label">選択肢</div>
                  {column.options.map((o) => (
                    <div key={o.id} className="db-option-row">
                      <Tag option={o} />
                      <button
                        className="icon-btn danger"
                        title="選択肢を削除"
                        onClick={() => updateColumn(column.id, { options: column.options!.filter((x) => x.id !== o.id) })}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </>
              )}
              <div className="menu-sep" />
            </>
          )}
          <MenuItem icon={<span className="menu-glyph">↑</span>} onClick={run(() => setConfig({ sort: { column: id, dir: "asc" } }))}>
            昇順で並べ替え
          </MenuItem>
          <MenuItem icon={<span className="menu-glyph">↓</span>} onClick={run(() => setConfig({ sort: { column: id, dir: "desc" } }))}>
            降順で並べ替え
          </MenuItem>
          {sorted && (
            <MenuItem icon={<SortIcon />} onClick={run(() => setConfig({ sort: null }))}>
              並べ替えを解除
            </MenuItem>
          )}
          {column && (
            <MenuItem
              icon={<TrashIcon />}
              danger
              onClick={run(() => {
                if (!confirm(`プロパティ「${column.name}」を削除しますか？`)) return;
                setConfig({
                  columns: ops.latest.current.columns.filter((c) => c.id !== column.id),
                  sort: config.sort?.column === column.id ? null : config.sort,
                });
              })}
            >
              プロパティを削除
            </MenuItem>
          )}
        </div>
      </Dropdown>
    </th>
  );
}

// ---------------------------------------------------------------------------
// ボード表示

function BoardView(props: {
  db: PageSummary;
  rows: PageSummary[];
  readOnly: boolean;
  ops: Ops;
  onAddRow: (props: Record<string, PropValue>) => void;
}) {
  const { rows, readOnly, ops } = props;
  const { ws, config, setConfig } = ops;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

  const selectColumns = config.columns.filter((c) => c.type === "select");
  const group = selectColumns.find((c) => c.id === config.groupBy) ?? selectColumns[0];

  if (!group) {
    return (
      <div className="db-empty">
        <p>ボード表示には「セレクト」型のプロパティが必要です。</p>
        {!readOnly && (
          <button
            className="btn-secondary"
            onClick={() => {
              const column: Column = { id: newId(), name: "ステータス", type: "select", options: [] };
              setConfig({ columns: [...config.columns, column], groupBy: column.id });
            }}
          >
            <PlusIcon />
            「ステータス」プロパティを追加
          </button>
        )}
      </div>
    );
  }

  const options = group.options ?? [];
  const known = new Set(options.map((o) => o.id));
  const lanes: { key: string; option: SelectOption | null; rows: PageSummary[] }[] = [
    { key: "", option: null, rows: rows.filter((r) => !known.has(asIds(r.props?.[group.id])[0])) },
    ...options.map((o) => ({ key: o.id, option: o, rows: rows.filter((r) => asIds(r.props?.[group.id])[0] === o.id) })),
  ];
  const others = config.columns.filter((c) => c.id !== group.id);

  const drop = (e: DragEvent, key: string) => {
    e.preventDefault();
    const row = dragId && ws.tree.byId.get(dragId);
    if (row && asIds(row.props?.[group.id])[0] !== key) ops.setProp(row, group.id, key || null);
    setDragId(null);
    setOverGroup(null);
  };

  return (
    <>
      {selectColumns.length > 1 && (
        <label className="db-groupby">
          グループ:
          <select value={group.id} disabled={readOnly} onChange={(e) => setConfig({ groupBy: e.target.value })}>
            {selectColumns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="db-board">
        {lanes.map((lane) => (
          <section
            key={lane.key}
            className={`db-lane${overGroup === lane.key ? " drop" : ""}`}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverGroup(lane.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverGroup(null);
            }}
            onDrop={(e) => drop(e, lane.key)}
          >
            <header className="db-lane-head">
              {lane.option ? <Tag option={lane.option} /> : <span className="db-lane-none">{group.name}なし</span>}
              <span className="db-lane-count">{lane.rows.length}</span>
            </header>
            {lane.rows.map((row) => (
              <a
                key={row.id}
                className={`db-card${dragId === row.id ? " dragging" : ""}`}
                href={pageHref(row.id)}
                draggable={!readOnly}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.id);
                  setDragId(row.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverGroup(null);
                }}
                onClick={(e) => handleLinkClick(e, () => ws.navigate(row.id))}
              >
                <span className="db-card-title">
                  <PageGlyph icon={row.icon} />
                  {pageLabel(row)}
                </span>
                {others.map((c) =>
                  isEmpty(row.props?.[c.id]) ? null : (
                    <span key={c.id} className="db-card-prop">
                      <PropertyDisplay column={c} value={row.props?.[c.id]} />
                    </span>
                  ),
                )}
              </a>
            ))}
            {!readOnly && (
              <button className="db-add-row" onClick={() => props.onAddRow(lane.key ? { [group.id]: lane.key } : {})}>
                <PlusIcon />
                新規
              </button>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 行ページのプロパティ欄

export function PropertiesPanel({ row, db, readOnly }: { row: PageSummary; db: PageSummary; readOnly: boolean }) {
  const ops = useDatabaseOps(db);
  if (!ops.config.columns.length) return null;
  return (
    <div className="props-panel">
      {ops.config.columns.map((c) => (
        <div key={c.id} className="prop-row">
          <div className="prop-name">
            {typeIcon(c.type)}
            <span>{c.name || "無題"}</span>
          </div>
          <div className={`prop-value db-td-${c.type}`}>
            <PropertyEditor
              column={c}
              value={row.props?.[c.id]}
              readOnly={readOnly}
              placeholder="空"
              onChange={(v) => ops.setProp(row, c.id, v)}
              onAddOption={(name) => ops.addOption(c, name)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// セル（値の表示・編集）

function Tag({ option }: { option: SelectOption }) {
  return <span className={`tag tag-${option.color}`}>{option.name || "無題"}</span>;
}

function PropertyDisplay({ column, value }: { column: Column; value: PropValue | undefined }) {
  switch (column.type) {
    case "select":
    case "multi_select": {
      const ids = asIds(value);
      return (
        <span className="tags">
          {(column.options ?? []).filter((o) => ids.includes(o.id)).map((o) => <Tag key={o.id} option={o} />)}
        </span>
      );
    }
    case "checkbox":
      return <span>{value ? "☑" : "☐"} {column.name}</span>;
    default:
      return <span className="db-card-text">{asText(value)}</span>;
  }
}

function PropertyEditor(props: {
  column: Column;
  value: PropValue | undefined;
  readOnly: boolean;
  placeholder?: string;
  onChange: (v: PropValue) => void;
  onAddOption: (name: string) => SelectOption;
}) {
  const { column, value, readOnly, onChange } = props;
  switch (column.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="db-checkbox"
          checked={!!value}
          disabled={readOnly}
          aria-label={column.name}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className={`cell-input${value ? "" : " empty"}`}
          value={typeof value === "string" ? value : ""}
          readOnly={readOnly}
          aria-label={column.name}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "select":
    case "multi_select":
      return <SelectEditor {...props} />;
    case "number":
      return (
        <CellInput
          type="number"
          value={asText(value)}
          readOnly={readOnly}
          placeholder={props.placeholder}
          onCommit={(v) => onChange(v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v))}
        />
      );
    case "url": {
      const url = asText(value);
      return (
        <span className="db-url">
          <CellInput value={url} readOnly={readOnly} placeholder={props.placeholder} onCommit={(v) => onChange(v.trim() || null)} />
          {url && (
            <a className="icon-btn" href={/^[a-z]+:/i.test(url) ? url : `https://${url}`} target="_blank" rel="noreferrer" title="開く">
              <OpenIcon />
            </a>
          )}
        </span>
      );
    }
    default:
      return (
        <CellInput value={asText(value)} readOnly={readOnly} placeholder={props.placeholder} onCommit={(v) => onChange(v || null)} />
      );
  }
}

function SelectEditor({
  column,
  value,
  readOnly,
  placeholder,
  onChange,
  onAddOption,
}: Parameters<typeof PropertyEditor>[0]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  const multi = column.type === "multi_select";
  const options = column.options ?? [];
  const ids = asIds(value).filter((id) => options.some((o) => o.id === id));
  const selected = options.filter((o) => ids.includes(o.id));
  const q = query.trim();
  const matches = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const canCreate = q !== "" && !options.some((o) => o.name === q);

  const pick = (id: string) => {
    if (multi) {
      onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
      setQuery("");
    } else {
      onChange(ids[0] === id ? null : id);
      close();
    }
  };

  return (
    <Dropdown
      open={open}
      onClose={close}
      fixed
      trigger={
        <button className="cell-select" disabled={readOnly} onClick={() => setOpen((o) => !o)}>
          {selected.length ? (
            <span className="tags">
              {selected.map((o) => (
                <Tag key={o.id} option={o} />
              ))}
            </span>
          ) : (
            <span className="cell-placeholder">{placeholder}</span>
          )}
        </button>
      }
    >
      <div className="menu db-select-menu">
        <input
          className="menu-input"
          value={query}
          autoFocus
          placeholder={options.length ? "選択肢を検索・作成" : "選択肢を作成"}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (matches[0] && (!canCreate || matches[0].name === q)) pick(matches[0].id);
            else if (canCreate) pick(onAddOption(q).id);
          }}
        />
        {matches.map((o) => (
          <MenuItem key={o.id} icon={<Tag option={o} />} onClick={() => pick(o.id)} right={ids.includes(o.id) ? <CheckIcon /> : undefined}>
            {""}
          </MenuItem>
        ))}
        {canCreate && (
          <MenuItem icon={<PlusIcon />} onClick={() => pick(onAddOption(q).id)}>
            「{q}」を作成
          </MenuItem>
        )}
        {ids.length > 0 && (
          <>
            <div className="menu-sep" />
            <MenuItem
              icon={<span className="menu-glyph">×</span>}
              onClick={() => {
                onChange(multi ? [] : null);
                close();
              }}
            >
              クリア
            </MenuItem>
          </>
        )}
      </div>
    </Dropdown>
  );
}

/** フォーカス中は手元の値を編集し、Enter・フォーカス外しで確定、Esc で取り消す */
function CellInput(props: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  // 確定は blur に一本化する（Enter・Esc は blur を起こすだけ）
  const commit = () => {
    if (!cancelled.current && draft !== null && draft !== props.value) props.onCommit(draft);
    cancelled.current = false;
    setDraft(null);
  };

  return (
    <input
      className={props.className ?? "cell-input"}
      type={props.type ?? "text"}
      value={draft ?? props.value}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
