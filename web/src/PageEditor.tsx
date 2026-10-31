import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ClientResponseError } from "pocketbase";
import { ja } from "@blocknote/core/locales";
import { FormattingToolbarController, SideMenuController, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { pages, uploadFile, type PageRecord, type PageSummary, type SaveStatus } from "./pb";
import { COVERS, CoverPicker, EmojiPicker, coverStyle, randomCover, randomEmoji } from "./pickers";
import { BlockFormattingToolbar, BlockSideMenu } from "./blockMenu";
import { columnDropCursor } from "./columns";
import { useResolvedTheme } from "./settings";
import { Dropdown } from "./ui";
import { filterSuggestionItems, mentionMenuItems, schema, slashMenuItems, type EditorBlock } from "./blocks";
import { DatabaseView, PropertiesPanel } from "./database";
import { useWorkspace } from "./workspace";
import { ImageIcon, SmileIcon } from "./icons";

const SAVE_DELAY_MS = 2000;

type Callbacks = {
  /** サーバーへ送らずに一覧の表示だけ更新する（入力中のタイトル、保存後の更新日時） */
  onLocalPatch: (id: string, patch: Partial<PageSummary>) => void;
  /** アイコンやカバーなどのページ属性を即時保存する */
  onUpdate: (id: string, patch: Partial<PageSummary>) => void;
  onStatusChange: (status: SaveStatus) => void;
};

type Props = Callbacks & {
  pageId: string;
  /** 一覧側の最新の属性。一覧の読み込み前は undefined */
  meta: PageSummary | undefined;
  /** 自身または祖先がゴミ箱にあるときは閲覧のみ */
  readOnly: boolean;
};

/** ページを取得し、取得完了後にエディタを生成する（initialContent は生成時にしか反映されないため） */
export function PageEditor({ pageId, meta, ...rest }: Props) {
  const [page, setPage] = useState<PageRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    pages()
      .getOne(pageId)
      .then((rec) => !cancelled && setPage(rec))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ClientResponseError && err.status === 404
            ? "このページは存在しないか、削除されています。"
            : `ページを読み込めませんでした: ${err}`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (error) return <div className="page-message">{error}</div>;
  if (!page) return <PageSkeleton />;
  const Body = page.database ? DatabasePage : Editor;
  return <Body page={page} meta={meta ?? page} {...rest} />;
}

function PageSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="page-head">
        <div className="skeleton skeleton-title" />
      </div>
      <div className="skeleton" style={{ width: "70%" }} />
      <div className="skeleton" style={{ width: "56%" }} />
      <div className="skeleton" style={{ width: "62%" }} />
    </div>
  );
}

/** タイトル・本文の自動保存。前の保存の完了を待って直列に送り、古い内容が新しい内容を上書きする競合を防ぐ */
function useAutosave(pageId: string, getPayload: () => Record<string, unknown>, cb: Callbacks) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const payloadRef = useRef(getPayload);
  payloadRef.current = getPayload;
  const { onLocalPatch, onStatusChange } = cb;

  useEffect(() => onStatusChange(status), [status, onStatusChange]);

  // 内容は呼び出し時点で同期的に取り出す（ページ遷移でエディタが破棄された後に読まないため）
  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!dirty.current) return;

    dirty.current = false;
    const payload = payloadRef.current();
    const prev = inFlight.current;
    const req = (async () => {
      if (prev) await prev;
      setStatus("saving");
      try {
        // レスポンスに本文全体を含めないよう、更新日時だけ返させる
        const rec = await pages().update(pageId, payload, { fields: "updated" });
        onLocalPatch(pageId, { updated: rec.updated });
        setStatus(dirty.current ? "pending" : "saved");
      } catch (err) {
        console.error("save failed", err);
        dirty.current = true; // 次の編集時に再送される
        setStatus("error");
      }
    })();
    inFlight.current = req;
    void req.finally(() => {
      if (inFlight.current === req) inFlight.current = null;
    });
  }, [pageId, onLocalPatch]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("pending");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  }, [save]);

  // タブを隠す・ページを離れる・アンマウント時は待機中の保存を即時実行する
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      save();
    };
  }, [save]);

  return schedule;
}

type BodyProps = { page: PageRecord; meta: PageSummary; readOnly: boolean } & Callbacks;

/** 通常ページ: BlockNote で本文を編集する */
function Editor(props: BodyProps) {
  const { page, meta, readOnly } = props;
  const ws = useWorkspace();
  const editor = useCreateBlockNote({
    schema,
    // 空配列は BlockNote が受け付けないので undefined（= 空の段落1つ）にする
    initialContent: page.content?.length ? (page.content as EditorBlock[]) : undefined,
    dictionary: ja,
    // 画像・動画・ファイルブロックのアップロード先を PocketBase にする
    uploadFile: (file) => uploadFile(file, page.id),
    // ブロックを他のブロックの左右へドラッグしたときに、縦線のドロップ位置を出す（段組みの作成）
    dropCursor: columnDropCursor,
  });
  // ライト・ダークはアプリの設定に従わせる。配色の細部とフォントは style.css で CSS 変数を上書きする
  // （テーマをオブジェクトで渡すと BlockNote が OS の設定で配色を決めてしまうため、文字列で渡す）
  const theme = useResolvedTheme();

  const title = useRef(page.title);
  const scheduleSave = useAutosave(page.id, () => ({ title: title.current, content: editor.document }), props);

  // データベースの行なら、タイトルの下にプロパティ欄を出す
  const db = meta.parent ? ws.tree.byId.get(meta.parent) : undefined;

  return (
    <PageHeader
      {...props}
      onTitleChange={(value) => {
        title.current = value;
        scheduleSave();
      }}
      onTitleEnter={() => {
        editor.setTextCursorPosition(editor.document[0], "start");
        editor.focus();
      }}
    >
      {db?.database && <PropertiesPanel row={meta} db={db} readOnly={readOnly} />}
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={scheduleSave}
        theme={theme}
        slashMenu={false}
        sideMenu={false}
        formattingToolbar={false}
      >
        <SideMenuController sideMenu={BlockSideMenu} />
        <FormattingToolbarController formattingToolbar={BlockFormattingToolbar} />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashMenuItems(editor, ws, page.id), query)}
        />
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (query) => mentionMenuItems(editor, ws, page.id, query)}
        />
      </BlockNoteView>
    </PageHeader>
  );
}

/** データベースページ: 本文の代わりに表・ボードを表示する */
function DatabasePage(props: BodyProps) {
  const title = useRef(props.page.title);
  const scheduleSave = useAutosave(props.page.id, () => ({ title: title.current }), props);
  return (
    <PageHeader
      {...props}
      onTitleChange={(value) => {
        title.current = value;
        scheduleSave();
      }}
    >
      <DatabaseView db={props.meta} readOnly={props.readOnly} />
    </PageHeader>
  );
}

/** カバー・アイコン・タイトルと、その下に本文（children）を並べる */
function PageHeader({
  page,
  meta,
  readOnly,
  onLocalPatch,
  onUpdate,
  onTitleChange,
  onTitleEnter,
  children,
}: BodyProps & { onTitleChange: (v: string) => void; onTitleEnter?: () => void; children: ReactNode }) {
  const [title, setTitle] = useState(page.title);
  const [iconOpen, setIconOpen] = useState(false);
  const closeIcon = useCallback(() => setIconOpen(false), []);
  const titleEl = useRef<HTMLTextAreaElement>(null);

  const setMeta = (patch: Partial<PageSummary>) => onUpdate(page.id, patch);

  // タイトルは折り返して全文表示するため、内容に合わせて高さを伸縮させる
  useLayoutEffect(() => {
    const el = titleEl.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, meta.fullWidth]);

  const wrapClass = [
    "page-wrap",
    (meta.fullWidth || meta.database) && "full-width",
    meta.cover && "has-cover",
    meta.icon && "has-icon",
    meta.font && `font-${meta.font}`,
    meta.smallText && "small-text",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapClass}>
      {meta.cover && <PageCover page={page} meta={meta} readOnly={readOnly} onUpdate={onUpdate} />}

      <article className="page">
        <div className="page-head">
          {meta.icon && (
            <Dropdown
              open={iconOpen}
              onClose={closeIcon}
              trigger={
                <button
                  className="page-icon"
                  disabled={readOnly}
                  aria-label="アイコンを変更"
                  onClick={() => setIconOpen((o) => !o)}
                >
                  {meta.icon}
                </button>
              }
            >
              <EmojiPicker
                onPick={(icon) => {
                  setMeta({ icon });
                  setIconOpen(false);
                }}
                onRemove={() => {
                  setMeta({ icon: "" });
                  setIconOpen(false);
                }}
              />
            </Dropdown>
          )}

          {!readOnly && (!meta.icon || !meta.cover) && (
            <div className="page-controls">
              {!meta.icon && (
                <button className="ghost-btn" onClick={() => setMeta({ icon: randomEmoji() })}>
                  <SmileIcon />
                  アイコンを追加
                </button>
              )}
              {!meta.cover && (
                <button className="ghost-btn" onClick={() => setMeta({ cover: randomCover() })}>
                  <ImageIcon />
                  カバーを追加
                </button>
              )}
            </div>
          )}

          <textarea
            ref={titleEl}
            className="page-title"
            rows={1}
            value={title}
            readOnly={readOnly}
            // 新規作成直後（タイトルも本文も空）はすぐにタイトルを入力できるようにする
            autoFocus={!readOnly && !page.title && !page.content?.length}
            placeholder="無題"
            aria-label="タイトル"
            onChange={(e) => {
              const value = e.target.value.replace(/\n/g, " ");
              setTitle(value);
              onLocalPatch(page.id, { title: value });
              onTitleChange(value);
            }}
            onKeyDown={(e) => {
              // Enter で本文の先頭へ（IME 変換確定の Enter は除外）
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onTitleEnter?.();
              }
            }}
          />
        </div>

        {children}
      </article>
    </div>
  );
}

/** カバー。画像は「位置を調整」で上下にドラッグして表示位置を変えられる */
function PageCover({ page, meta, readOnly, onUpdate }: Pick<BodyProps, "page" | "meta" | "readOnly" | "onUpdate">) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [dragY, setDragY] = useState<number | null>(null); // 調整中の位置（null は調整していない）
  const drag = useRef<{ y: number; start: number; height: number } | null>(null);
  const setMeta = (patch: Partial<PageSummary>) => onUpdate(page.id, patch);
  const isImage = !COVERS[meta.cover];
  const y = dragY ?? (meta.coverY || 50);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (dragY === null || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, start: dragY, height: e.currentTarget.getBoundingClientRect().height };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // 下へドラッグすると画像の上側が見える（背景位置は逆向きに動く）
    setDragY(Math.min(100, Math.max(0, d.start - ((e.clientY - d.y) / d.height) * 100)));
  };

  return (
    <div
      className={`page-cover${dragY !== null ? " repositioning" : ""}`}
      style={coverStyle(meta.cover, y)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
    >
      {dragY !== null && <div className="cover-hint">ドラッグして画像の位置を調整</div>}
      {!readOnly &&
        (dragY !== null ? (
          <div className="cover-actions open">
            <button
              className="cover-btn"
              onClick={() => {
                setMeta({ coverY: Math.max(1, Math.round(dragY)) }); // 0 は「未設定（中央）」なので 1 以上で保存
                setDragY(null);
              }}
            >
              位置を保存
            </button>
            <button className="cover-btn" onClick={() => setDragY(null)}>
              キャンセル
            </button>
          </div>
        ) : (
          <div className={`cover-actions${open ? " open" : ""}`}>
            <Dropdown
              open={open}
              onClose={close}
              align="right"
              trigger={
                <button className="cover-btn" onClick={() => setOpen((o) => !o)}>
                  カバーを変更
                </button>
              }
            >
              <CoverPicker
                onPick={(cover) => {
                  setMeta({ cover, coverY: 0 });
                  setOpen(false);
                }}
                onUpload={async (file) => {
                  try {
                    setMeta({ cover: await uploadFile(file, page.id), coverY: 0 });
                    setOpen(false);
                  } catch (err) {
                    alert(`アップロードに失敗しました: ${err}`);
                  }
                }}
              />
            </Dropdown>
            {isImage && (
              <button className="cover-btn" onClick={() => setDragY(meta.coverY || 50)}>
                位置を調整
              </button>
            )}
            <button className="cover-btn" onClick={() => setMeta({ cover: "" })}>
              削除
            </button>
          </div>
        ))}
    </div>
  );
}
