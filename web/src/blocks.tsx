import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SuggestionMenu } from "@blocknote/core/extensions";
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { newDatabaseConfig } from "./database";
import { LinkIcon, PageIcon, TableIcon } from "./icons";
import { PageGlyph, pageLabel } from "./ui";
import { handleLinkClick, pageHref, useWorkspace, type Workspace } from "./workspace";

/** ページ ID からリンクの表示内容を決める。一覧から引くので、タイトル変更が即座に反映される */
function usePageRef(pageId: string) {
  const ws = useWorkspace();
  const page = ws.tree.byId.get(pageId);
  const visible = !!page && ws.tree.isVisible(pageId);
  return { ws, page, visible };
}

/** 本文中のページリンク（Notion の「ページ」ブロック） */
const PageLinkBlock = createReactBlockSpec(
  { type: "pageLink", propSchema: { pageId: { default: "" } }, content: "none" },
  {
    render: ({ block }) => {
      const { ws, page, visible } = usePageRef(block.props.pageId);
      if (!page) return <span className="page-link-block missing">アクセスできないページ</span>;
      return (
        <a
          className={`page-link-block${visible ? "" : " trashed"}`}
          href={pageHref(page.id)}
          contentEditable={false}
          onClick={(e) => handleLinkClick(e, () => ws.navigate(page.id))}
        >
          <PageGlyph icon={page.icon} database={!!page.database} />
          <span className="page-link-title">{pageLabel(page)}</span>
          {!visible && <span className="page-link-note">ゴミ箱</span>}
        </a>
      );
    },
  },
);

/** 文中の @ メンション */
const PageMention = createReactInlineContentSpec(
  { type: "pageMention", propSchema: { pageId: { default: "" } }, content: "none" },
  {
    render: ({ inlineContent }) => {
      const { ws, page, visible } = usePageRef(inlineContent.props.pageId);
      if (!page) return <span className="page-mention missing">アクセスできないページ</span>;
      return (
        <a
          className={`page-mention${visible ? "" : " trashed"}`}
          href={pageHref(page.id)}
          onClick={(e) => handleLinkClick(e, () => ws.navigate(page.id))}
        >
          <PageGlyph icon={page.icon} database={!!page.database} />
          <span className="page-mention-title">{pageLabel(page)}</span>
        </a>
      );
    },
  },
);

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, pageLink: PageLinkBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, pageMention: PageMention },
});

export type Editor = typeof schema.BlockNoteEditor;
export type EditorBlock = typeof schema.PartialBlock;

/** スラッシュメニュー: 既定の項目に「ページ」「データベース」「ページへのリンク」を加える。
 *  グループ名は項目名と重複させない（BlockNote が両方を React の key に使うため） */
export function slashMenuItems(editor: Editor, ws: Workspace, pageId: string): DefaultReactSuggestionItem[] {
  // サブページを作ってリンクブロックを置き、そのページを開く（離脱時に本文は即時保存される）
  const createLinked = async (init: Parameters<Workspace["create"]>[1]) => {
    const rec = await ws.create(pageId, init, { open: false });
    if (!rec) return;
    insertOrUpdateBlockForSlashMenu(editor, { type: "pageLink", props: { pageId: rec.id } });
    ws.navigate(rec.id);
  };

  return [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: "ページ",
      subtext: "このページの中にサブページを作成",
      aliases: ["page", "subpage", "pe-ji", "ぺーじ"],
      group: "ページ・リンク",
      icon: <PageIcon />,
      onItemClick: () => void createLinked({}),
    },
    {
      title: "データベース",
      subtext: "表・ボードで管理するサブページを作成",
      aliases: ["database", "table", "db", "でーたべーす", "テーブル"],
      group: "ページ・リンク",
      icon: <TableIcon />,
      onItemClick: () => void createLinked({ database: newDatabaseConfig() }),
    },
    {
      title: "ページへのリンク",
      subtext: "既存のページへのリンクを挿入（@ でも可）",
      aliases: ["link", "mention", "rinku", "りんく", "@"],
      group: "ページ・リンク",
      icon: <LinkIcon />,
      onItemClick: () => editor.getExtension(SuggestionMenu)?.openSuggestionMenu("@", { ignoreQueryLength: true }),
    },
  ];
}

/** @ メニュー: 表示中のページをタイトルで絞り込み、メンションとして挿入する */
export function mentionMenuItems(editor: Editor, ws: Workspace, pageId: string, query: string) {
  const q = query.trim().toLowerCase();
  return [...ws.tree.byId.values()]
    .filter((p) => p.id !== pageId && ws.tree.isVisible(p.id) && (!q || pageLabel(p).toLowerCase().includes(q)))
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 20)
    .map(
      (p): DefaultReactSuggestionItem => ({
        title: pageLabel(p),
        subtext: ws.tree.ancestors(p.id).map(pageLabel).join(" / ") || undefined,
        icon: <PageGlyph icon={p.icon} database={!!p.database} />,
        onItemClick: () => editor.insertInlineContent([{ type: "pageMention", props: { pageId: p.id } }, " "]),
      }),
    );
}

export { filterSuggestionItems };
