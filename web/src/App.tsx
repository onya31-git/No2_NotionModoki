import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { pages, SUMMARY_FIELDS, type PageRecord, type PageSummary, type SaveStatus } from "./pb";
import { buildTree } from "./tree";
import { PageEditor } from "./PageEditor";
import { Sidebar, type DropPos } from "./Sidebar";
import { MoveDialog } from "./MoveDialog";
import { WorkspaceContext, handleLinkClick, pageHref, type Workspace } from "./workspace";
import { SearchDialog } from "./SearchDialog";
import { TrashDialog } from "./TrashDialog";
import { Dropdown, MenuItem, PageGlyph, copyText, formatDate, pageLabel } from "./ui";
import { CopyIcon, LinkIcon, MenuIcon, MoreIcon, MoveIcon, PlusIcon, StarIcon, TrashIcon, WidthIcon } from "./icons";

// ルーティングライブラリは使わず、?id=<pageId> でページを指定する。
// 遷移は history.pushState で行い、バンドルを再読み込みしない。
const readId = () => new URLSearchParams(window.location.search).get("id");

const MOBILE_QUERY = "(max-width: 768px)";

// サイドバーの開閉状態は端末ごとの好みなので localStorage に置く（使えない環境では既定値で動く）
function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}

type Toast = { message: string; action?: { label: string; run: () => void } };

export function App() {
  const [currentId, setCurrentId] = useState(readId);
  const [list, setList] = useState<PageSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [sidebarOpen, setSidebarOpen] = useState(false); // モバイルのオーバーレイ
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadPref("rs.sidebarCollapsed", false));
  const [expanded, setExpanded] = useState(() => new Set(loadPref<string[]>("rs.expanded", [])));
  const [dialog, setDialog] = useState<"search" | "trash" | "move" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const tree = useMemo(() => buildTree(list ?? []), [list]);
  const current = currentId ? tree.byId.get(currentId) : undefined;
  // 自身、または最も近い祖先のうちゴミ箱に入っているページ（バナーの復元・削除の対象）
  const trashedRoot = current ? [current, ...tree.ancestors(current.id).reverse()].find((p) => p.trashed) : undefined;

  const reloadList = useCallback(() => {
    pages()
      .getFullList({ fields: SUMMARY_FIELDS })
      .then((items) => {
        setList(items);
        setListError(null);
      })
      .catch((err) => setListError(String(err)));
  }, []);

  useEffect(reloadList, [reloadList]);

  useEffect(() => {
    const onPop = () => setCurrentId(readId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = current ? `${current.icon ? `${current.icon} ` : ""}${pageLabel(current)} – RasStation` : "RasStation";
  }, [current]);

  useEffect(() => savePref("rs.sidebarCollapsed", sidebarCollapsed), [sidebarCollapsed]);
  useEffect(() => savePref("rs.expanded", [...expanded]), [expanded]);

  // 開いているページの祖先をサイドバーで展開しておく
  useEffect(() => {
    if (!currentId) return;
    const ids = tree.ancestors(currentId).map((p) => p.id);
    setExpanded((s) => (ids.every((id) => s.has(id)) ? s : new Set([...s, ...ids])));
  }, [currentId, tree]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = useCallback((id: string | null) => {
    window.history.pushState(null, "", id ? `?id=${id}` : window.location.pathname);
    setCurrentId(id);
    setStatus("saved");
    setSidebarOpen(false);
    setMenuOpen(false);
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<PageSummary>) => {
    setList((l) => l?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? l);
  }, []);

  /** 楽観的に表示を更新してから保存する。失敗したら一覧を取り直して整合させる */
  const updatePage = useCallback(
    async (id: string, patch: Partial<PageSummary>) => {
      patchLocal(id, patch);
      try {
        const rec = await pages().update(id, patch, { fields: "updated" });
        patchLocal(id, { updated: rec.updated });
      } catch (err) {
        setToast({ message: `保存に失敗しました: ${err}` });
        reloadList();
      }
    },
    [patchLocal, reloadList],
  );

  /** parent の末尾にページを作成する */
  const createPage = async (parent = "", init: Partial<PageRecord> = {}, { open = true } = {}) => {
    setCreating(true);
    try {
      const siblings = tree.children.get(parent) ?? [];
      const sort = Math.max(0, ...siblings.map((p) => p.sort || 0)) + 1;
      const rec = await pages().create({ title: "", content: [], parent, sort, ...init }, { fields: SUMMARY_FIELDS });
      setList((l) => [...(l ?? []), rec]);
      if (parent) setExpanded((s) => new Set(s).add(parent));
      if (open) navigate(rec.id);
      return rec;
    } catch (err) {
      setToast({ message: `ページを作成できませんでした: ${err}` });
      return null;
    } finally {
      setCreating(false);
    }
  };

  /** id を parent の子の index 番目（省略時は末尾）へ置き、兄弟の sort を 1, 2, 3… に振り直す */
  const placePage = (id: string, parent: string, index?: number) => {
    const page = tree.byId.get(id);
    if (!page || !tree.canMoveInto(id, parent)) return;
    const siblings = (tree.children.get(parent) ?? []).filter((p) => p.id !== id);
    const at = index ?? siblings.length;
    const order = [...siblings.slice(0, at), page, ...siblings.slice(at)];
    order.forEach((p, i) => {
      const patch: Partial<PageSummary> = {};
      if (p.sort !== i + 1) patch.sort = i + 1;
      if (p.id === id && (p.parent || "") !== parent) patch.parent = parent;
      if (Object.keys(patch).length) void updatePage(p.id, patch);
    });
    if (parent) setExpanded((s) => new Set(s).add(parent));
  };

  /** サイドバーのドラッグ＆ドロップ。target の前後、または中（子の末尾）へ移す */
  const movePage = (id: string, target: string | null, pos: DropPos) => {
    if (!target || pos === "inside") return placePage(id, target ?? "");
    const t = tree.byId.get(target);
    if (!t) return;
    const parent = t.parent || "";
    const siblings = (tree.children.get(parent) ?? []).filter((p) => p.id !== id);
    placePage(id, parent, siblings.findIndex((p) => p.id === target) + (pos === "after" ? 1 : 0));
  };

  const duplicatePage = async (id: string) => {
    setMenuOpen(false);
    try {
      const src = await pages().getOne(id);
      const rec = await pages().create(
        {
          title: `${pageLabel(src)} のコピー`,
          content: src.content ?? [],
          icon: src.icon,
          cover: src.cover,
          parent: src.parent,
          fullWidth: src.fullWidth,
          database: src.database, // 列定義のみ複製し、行は複製しない
          props: src.props,
          sort: src.sort, // 同じ sort なら作成順で並ぶので、元のページの直後に来る
        },
        { fields: SUMMARY_FIELDS },
      );
      setList((l) => [...(l ?? []), rec]);
      navigate(rec.id);
      setToast({ message: "ページを複製しました" });
    } catch (err) {
      setToast({ message: `複製できませんでした: ${err}` });
    }
  };

  const trashPage = (id: string) => {
    setMenuOpen(false);
    void updatePage(id, { trashed: true });
    setToast({
      message: "ゴミ箱に移動しました",
      action: { label: "元に戻す", run: () => void updatePage(id, { trashed: false }) },
    });
  };

  const restorePage = (p: PageSummary) => {
    const patch: Partial<PageSummary> = { trashed: false };
    // 親がまだゴミ箱にある場合は、見失わないようルートへ移す
    if (p.parent && !tree.isVisible(p.parent)) patch.parent = "";
    void updatePage(p.id, patch);
    setToast({ message: `「${pageLabel(p)}」を復元しました` });
  };

  const deleteForever = async (p: PageSummary) => {
    const sub = tree.descendantIds(p.id);
    const target = `「${pageLabel(p)}」${sub.length ? `とサブページ ${sub.length} 件` : ""}`;
    if (!confirm(`${target}を完全に削除しますか？この操作は元に戻せません。`)) return;
    const removed = new Set([p.id, ...sub]);
    if (currentId && removed.has(currentId)) navigate(null);
    try {
      await pages().delete(p.id); // 子孫は parent の cascadeDelete でサーバー側でも削除される
      setList((l) => l?.filter((x) => !removed.has(x.id)) ?? l);
    } catch (err) {
      setToast({ message: `削除できませんでした: ${err}` });
    }
  };

  const copyLink = async (id: string) => {
    setMenuOpen(false);
    try {
      await copyText(`${window.location.origin}${window.location.pathname}?id=${id}`);
      setToast({ message: "リンクをコピーしました" });
    } catch {
      setToast({ message: "リンクをコピーできませんでした" });
    }
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) setSidebarOpen((o) => !o);
    else setSidebarCollapsed((c) => !c);
  }, []);

  const closeDialog = useCallback(() => setDialog(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Ctrl/Cmd+P（Notion と同じ）・Ctrl/Cmd+K で検索、Ctrl/Cmd+\ でサイドバー開閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "p" || (key === "k" && !e.defaultPrevented)) {
        e.preventDefault();
        setDialog("search");
      } else if (key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const workspace = useMemo<Workspace>(
    () => ({ tree, navigate, update: updatePage, create: createPage, trash: trashPage }),
    // createPage / trashPage は毎回作り直されるが、参照する状態は tree と同じ list から来る
    [tree, navigate, updatePage],
  );

  const layoutClass = ["layout", sidebarOpen && "sidebar-open", sidebarCollapsed && "sidebar-collapsed"]
    .filter(Boolean)
    .join(" ");

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className={layoutClass}>
        <Sidebar
          tree={tree}
          loading={!list && !listError}
          error={listError}
          currentId={currentId}
          expanded={expanded}
          creating={creating}
          onToggle={toggleExpanded}
          onSelect={navigate}
          onCreate={(parent) => void createPage(parent)}
          onTrash={trashPage}
          onMove={movePage}
          onSearch={() => {
            setSidebarOpen(false);
            setDialog("search");
          }}
          onOpenTrash={() => {
            setSidebarOpen(false);
            setDialog("trash");
          }}
          onCollapse={toggleSidebar}
        />
        <div className="backdrop" onClick={() => setSidebarOpen(false)} />

        <main className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" title="サイドバーを開く (Ctrl+\)" onClick={toggleSidebar}>
              <MenuIcon />
            </button>

            <nav className="breadcrumb" aria-label="パンくずリスト">
              {current &&
                [...tree.ancestors(current.id), current].map((p, i, arr) => (
                  <Fragment key={p.id}>
                    {i > 0 && <span className="breadcrumb-sep">/</span>}
                    <a
                      href={pageHref(p.id)}
                      className={`breadcrumb-item${i === arr.length - 1 ? " current" : ""}`}
                      onClick={(e) => handleLinkClick(e, () => navigate(p.id))}
                    >
                      <PageGlyph icon={p.icon} database={!!p.database} />
                      <span>{pageLabel(p)}</span>
                    </a>
                  </Fragment>
                ))}
            </nav>

            {current && (
              <div className="topbar-actions">
                <SaveIndicator status={status} />
                <button
                  className={`icon-btn favorite-btn${current.favorite ? " on" : ""}`}
                  title={current.favorite ? "お気に入りから外す" : "お気に入りに追加"}
                  aria-pressed={current.favorite}
                  onClick={() => void updatePage(current.id, { favorite: !current.favorite })}
                >
                  <StarIcon filled={current.favorite} />
                </button>
                <Dropdown
                  open={menuOpen}
                  onClose={closeMenu}
                  align="right"
                  trigger={
                    <button className="icon-btn" title="その他" onClick={() => setMenuOpen((o) => !o)}>
                      <MoreIcon />
                    </button>
                  }
                >
                  <div className="menu">
                    {/* データベースは常に全幅で表示する */}
                    {!current.database && (
                      <MenuItem
                        icon={<WidthIcon />}
                        onClick={() => void updatePage(current.id, { fullWidth: !current.fullWidth })}
                        right={<span className={`switch${current.fullWidth ? " on" : ""}`} />}
                      >
                        全幅表示
                      </MenuItem>
                    )}
                    <MenuItem icon={<LinkIcon />} onClick={() => void copyLink(current.id)}>
                      リンクをコピー
                    </MenuItem>
                    <MenuItem icon={<CopyIcon />} onClick={() => void duplicatePage(current.id)}>
                      複製
                    </MenuItem>
                    {!trashedRoot && (
                      <>
                        {!current.database && (
                          <MenuItem icon={<PlusIcon />} onClick={() => void createPage(current.id)}>
                            サブページを追加
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={<MoveIcon />}
                          onClick={() => {
                            setMenuOpen(false);
                            setDialog("move");
                          }}
                        >
                          移動
                        </MenuItem>
                        <MenuItem icon={<TrashIcon />} danger onClick={() => trashPage(current.id)}>
                          ゴミ箱に移動
                        </MenuItem>
                      </>
                    )}
                    <div className="menu-sep" />
                    <div className="menu-meta">
                      最終更新: {formatDate(current.updated)}
                      <br />
                      作成: {formatDate(current.created)}
                    </div>
                  </div>
                </Dropdown>
              </div>
            )}
          </header>

          {trashedRoot && (
            <div className="trash-banner" role="alert">
              <span>
                {trashedRoot.id === currentId
                  ? "このページはゴミ箱にあります。"
                  : `親ページ「${pageLabel(trashedRoot)}」がゴミ箱にあります。`}
              </span>
              <button onClick={() => restorePage(trashedRoot)}>復元</button>
              <button onClick={() => void deleteForever(trashedRoot)}>完全に削除</button>
            </div>
          )}

          {currentId ? (
            <PageEditor
              key={currentId}
              pageId={currentId}
              meta={current}
              readOnly={!!trashedRoot}
              onLocalPatch={patchLocal}
              onUpdate={updatePage}
              onStatusChange={setStatus}
            />
          ) : (
            <div className="empty">
              <h1>RasStation</h1>
              <p>サイドバーからページを選ぶか、新しいページを作成してください。</p>
              <button className="btn-primary" onClick={() => void createPage()} disabled={creating}>
                <PlusIcon />
                新規ページを作成
              </button>
            </div>
          )}
        </main>

        {dialog === "search" && <SearchDialog tree={tree} onSelect={navigate} onClose={closeDialog} />}
        {dialog === "move" && current && (
          <MoveDialog tree={tree} page={current} onMove={(parent) => placePage(current.id, parent)} onClose={closeDialog} />
        )}
        {dialog === "trash" && (
          <TrashDialog
            tree={tree}
            onSelect={navigate}
            onRestore={restorePage}
            onDeleteForever={(p) => void deleteForever(p)}
            onClose={closeDialog}
          />
        )}

        {toast && (
          <div className="toast" role="status">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "保存済み",
  pending: "未保存",
  saving: "保存中…",
  error: "保存に失敗しました",
};

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span className={`save-indicator ${status}`} role="status">
      {STATUS_LABEL[status]}
    </span>
  );
}
