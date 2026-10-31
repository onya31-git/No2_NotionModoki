import { editorHasBlockWithType, type BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  BlockColorsItem,
  blockTypeSelectItems,
  DragHandleMenu,
  FormattingToolbar,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtensionState,
  usePortalElement,
  type BlockTypeSelectItem,
} from "@blocknote/react";
import { useWorkspace } from "./workspace";

// ブロックの種類を後から変える UI（Notion の「ターンイン」）。
// ブロック左の ⋮⋮ メニューと、文字を選択したときのツールバーの両方から変更できる。

type AnyEditor = BlockNoteEditor<any, any, any>;

const CodeIcon = ({ size = 16 }: { size?: string | number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </svg>
);

/** 変更先の候補。BlockNote 既定の候補（テキスト・見出し・リスト・引用など）にコードブロックを足す */
export function turnIntoItems(editor: AnyEditor): BlockTypeSelectItem[] {
  const items = blockTypeSelectItems(editor);
  if (editorHasBlockWithType(editor, "codeBlock")) {
    items.push({ name: editor.dictionary.slash_menu.code_block.title, type: "codeBlock", icon: CodeIcon });
  }
  return items.filter((item) =>
    editorHasBlockWithType(
      editor,
      item.type,
      Object.fromEntries(Object.entries(item.props ?? {}).map(([k, v]) => [k, typeof v])) as Record<
        string,
        "string" | "number" | "boolean"
      >,
    ),
  );
}

const matches = (item: BlockTypeSelectItem, block: { type: string; props: Record<string, unknown> }) =>
  item.type === block.type && Object.entries(item.props ?? {}).every(([k, v]) => block.props[k] === v);

/** メニューを開いたブロックが選択範囲に含まれていれば選択中のすべて、そうでなければそのブロックだけ */
function targetBlocks(editor: AnyEditor, block: { id: string }) {
  const selected = editor.getSelection()?.blocks;
  return selected && selected.some((b) => b.id === block.id) ? selected : [block];
}

/** ⋮⋮ メニューの「ブロックの種類を変更」サブメニュー */
function TurnIntoItem() {
  const Components = useComponentsContext()!;
  const portalElement = usePortalElement();
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });

  // 文字を持つブロック（段落・見出し・リスト・コードなど）だけが変更の対象。画像や表、段組みなどは出さない
  const content = block && editor.schema.blockSchema[block.type]?.content;
  if (!block || (content !== "inline" && content !== "plain")) return null;
  const items = turnIntoItems(editor);
  if (!items.some((item) => matches(item, block))) return null;

  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={portalElement}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          ブロックの種類を変更
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown rs-turn-into">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Components.Generic.Menu.Item
              key={item.name}
              className="bn-menu-item"
              icon={<Icon size={16} />}
              checked={matches(item, block)}
              onClick={() => {
                editor.transact(() => {
                  for (const b of targetBlocks(editor, block)) {
                    editor.updateBlock(b, { type: item.type, props: item.props } as PartialBlock<any, any, any>);
                  }
                });
                editor.focus();
              }}
            >
              {item.name}
            </Components.Generic.Menu.Item>
          );
        })}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

/** ⋮⋮ メニューの「複製」: すぐ下に同じ内容のブロックを作る（ID は新しく振られる） */
function DuplicateItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  if (!block) return null;

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        const blocks = targetBlocks(editor, block);
        editor.insertBlocks(blocks.map(withoutIds), blocks[blocks.length - 1], "after");
        editor.focus();
      }}
    >
      複製
    </Components.Generic.Menu.Item>
  );
}

/** データベースの表示方法を切り替える: 本文に埋め込む（インライン）⇔ リンクだけ置く（フルページ） */
function DatabaseDisplayItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const ws = useWorkspace();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  if (!block || (block.type !== "database" && block.type !== "pageLink")) return null;
  if (!ws.tree.byId.get(block.props.pageId)?.database) return null;

  const toInline = block.type === "pageLink";
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        editor.updateBlock(block, { type: toInline ? "database" : "pageLink", props: { pageId: block.props.pageId } });
      }}
    >
      {toInline ? "インラインで表示" : "フルページへのリンクにする"}
    </Components.Generic.Menu.Item>
  );
}

function withoutIds(block: any): PartialBlock<any, any, any> {
  const { id: _id, children, ...rest } = block;
  return { ...rest, children: (children ?? []).map(withoutIds) };
}

function BlockDragHandleMenu() {
  const dict = useDictionary();
  return (
    <DragHandleMenu>
      <TurnIntoItem />
      <DatabaseDisplayItem />
      <BlockColorsItem>{dict.drag_handle.colors_menuitem}</BlockColorsItem>
      <DuplicateItem />
      <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
      <TableRowHeaderItem>{dict.drag_handle.header_row_menuitem}</TableRowHeaderItem>
      <TableColumnHeaderItem>{dict.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}

/** SideMenuController の sideMenu に渡す */
export const BlockSideMenu = () => <SideMenu dragHandleMenu={BlockDragHandleMenu} />;

/** FormattingToolbarController の formattingToolbar に渡す（種類の候補にコードブロックを含める） */
export function BlockFormattingToolbar() {
  const editor = useBlockNoteEditor<any, any, any>();
  return <FormattingToolbar blockTypeSelectItems={turnIntoItems(editor)} />;
}
