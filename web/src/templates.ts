import type { Column, DatabaseConfig, PageSummary, PropValue } from "./pb";
import type { EditorBlock } from "./blocks";
import type { Workspace } from "./workspace";
import { newDatabaseConfig, newId } from "./database";
import { randomCover } from "./pickers";

// 空のページから始めるときのひな形（Notion のテンプレート）。
// 本文のブロックに加えて、必要ならサブページやデータベースもその場で作る

export type PageTemplate = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** ページ自体の設定（アイコンは未設定のときだけ付ける） */
  page?: (meta: PageSummary) => Partial<PageSummary>;
  build: (ctx: TemplateContext) => Promise<EditorBlock[]>;
};

type TemplateContext = {
  /** サブページを作り、そこへのリンクブロックを返す */
  subPage: (title: string, icon: string, content?: EditorBlock[]) => Promise<EditorBlock>;
  /** データベースのサブページと行を作り、埋め込みブロックを返す */
  database: (title: string, icon: string, config: DatabaseConfig, rows?: [string, Record<string, PropValue>][]) => Promise<EditorBlock>;
};

// ---------------------------------------------------------------------------
// ブロックを短く書くための関数

const p = (text = ""): EditorBlock => ({ type: "paragraph", content: text });
const h = (level: 1 | 2 | 3, text: string): EditorBlock => ({ type: "heading", props: { level }, content: text });
const bullet = (text = ""): EditorBlock => ({ type: "bulletListItem", content: text });
const num = (text = ""): EditorBlock => ({ type: "numberedListItem", content: text });
const todo = (text = ""): EditorBlock => ({ type: "checkListItem", content: text });
const toggle = (text: string, ...children: EditorBlock[]): EditorBlock => ({ type: "toggleListItem", content: text, children });
const quote = (text: string): EditorBlock => ({ type: "quote", content: text });
const divider: EditorBlock = { type: "divider" };
const widget = (kind: string): EditorBlock => ({ type: "widget", props: { kind } }) as EditorBlock;
const columns = (...cols: EditorBlock[][]): EditorBlock =>
  ({ type: "columnList", children: cols.map((children) => ({ type: "column", children })) }) as EditorBlock;

const select = (name: string, options: [string, string][]): Column => ({
  id: newId(),
  name,
  type: "select",
  options: options.map(([name, color]) => ({ id: newId(), name, color })),
});
const optionId = (column: Column, name: string) => column.options!.find((o) => o.name === name)!.id;

const today = () => new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

// ---------------------------------------------------------------------------

const wiki: PageTemplate = {
  id: "wiki",
  name: "Wiki",
  icon: "📚",
  desc: "入口ページとドキュメントの一覧",
  build: async (ctx) => {
    const category = select("カテゴリ", [["手順書", "blue"], ["仕様", "purple"], ["メモ", "gray"]]);
    const docs: DatabaseConfig = {
      columns: [category, { id: newId(), name: "タグ", type: "multi_select", options: [] }, { id: newId(), name: "更新日", type: "date" }],
      view: "table",
      sort: null,
    };
    return [
      quote("このWikiの目的や、最初に読んでほしいことを書きます。"),
      columns(
        [
          h(3, "🚀 まず読む"),
          await ctx.subPage("はじめに", "📘", [h(2, "このWikiについて"), p(), h(2, "使い方"), bullet("左のサイドバーからページを探せます"), bullet("Ctrl+P で検索できます")]),
          await ctx.subPage("ルール・決まりごと", "📏", [num(), num(), num()]),
          await ctx.subPage("よくある質問", "❓", [toggle("質問を書く", p("答えを書く")), toggle("質問を書く", p("答えを書く"))]),
        ],
        [h(3, "🔗 よく使うリンク"), bullet(), bullet(), h(3, "📣 お知らせ"), bullet()],
      ),
      divider,
      await ctx.database("ドキュメント", "🗂️", docs, [
        ["使い方ガイド", { [category.id]: optionId(category, "手順書") }],
        ["用語集", { [category.id]: optionId(category, "メモ") }],
      ]),
      p(),
    ];
  },
};

const home: PageTemplate = {
  id: "home",
  name: "ホーム",
  icon: "🏠",
  desc: "時計・カレンダー・天気とタスクのダッシュボード",
  page: (meta) => ({ fullWidth: true, ...(meta.cover ? {} : { cover: randomCover() }) }),
  build: async (ctx) => {
    const tasks = newDatabaseConfig();
    tasks.view = "board";
    const status = tasks.columns[0];
    return [
      // 縦長の画面でも窮屈にならないよう 2 列にする
      columns([widget("clock"), widget("weather")], [widget("calendar")]),
      columns(
        [h(3, "✅ 今日やること"), todo(), todo(), todo()],
        [h(3, "📌 クイックリンク"), bullet("@ でページへのリンクを追加"), widget("quote")],
      ),
      await ctx.database("タスク", "📋", tasks, [
        ["最初のタスク", { [status.id]: optionId(status, "未着手") }],
        ["進めているタスク", { [status.id]: optionId(status, "進行中") }],
      ]),
      h(2, "📝 メモ"),
      p(),
    ];
  },
};

const project: PageTemplate = {
  id: "project",
  name: "プロジェクト",
  icon: "🚀",
  desc: "目標・期間とタスクボード",
  build: async (ctx) => {
    const status = select("ステータス", [["未着手", "gray"], ["進行中", "blue"], ["完了", "green"]]);
    const priority = select("優先度", [["高", "red"], ["中", "yellow"], ["低", "gray"]]);
    const tasks: DatabaseConfig = {
      columns: [status, priority, { id: newId(), name: "担当", type: "text" }, { id: newId(), name: "期限", type: "date" }],
      view: "board",
      sort: null,
      groupBy: status.id,
    };
    return [
      quote("このプロジェクトで何をするのかを一言で書きます。"),
      columns(
        [h(3, "🎯 目標"), bullet(), bullet()],
        [h(3, "📆 期間・メンバー"), bullet("開始: "), bullet("期限: "), bullet("メンバー: ")],
      ),
      await ctx.database("タスク", "✅", tasks, [
        ["要件を整理する", { [status.id]: optionId(status, "進行中"), [priority.id]: optionId(priority, "高") }],
        ["設計する", { [status.id]: optionId(status, "未着手"), [priority.id]: optionId(priority, "中") }],
      ]),
      h(2, "📎 資料・議事録"),
      await ctx.subPage("キックオフ", "📝", meetingBlocks()),
      bullet(),
    ];
  },
};

const meetingBlocks = (): EditorBlock[] => [
  p(`📅 日時: ${today()}`),
  p("👥 参加者: "),
  h(2, "アジェンダ"),
  num(),
  num(),
  h(2, "議事メモ"),
  bullet(),
  h(2, "決定事項"),
  bullet(),
  h(2, "ToDo"),
  todo(),
  todo(),
];

const meeting: PageTemplate = {
  id: "meeting",
  name: "会議メモ",
  icon: "📝",
  desc: "日時・アジェンダ・決定事項・ToDo",
  build: async () => meetingBlocks(),
};

const journal: PageTemplate = {
  id: "journal",
  name: "日記",
  icon: "📔",
  desc: "今日のできごととふりかえり",
  build: async () => [
    p(`📅 ${today()}`),
    widget("quote"),
    h(2, "今日のできごと"),
    p(),
    h(2, "よかったこと"),
    bullet(),
    h(2, "気づき・反省"),
    bullet(),
    h(2, "明日やること"),
    todo(),
  ],
};

export const TEMPLATES: PageTemplate[] = [wiki, home, project, meeting, journal];

/** テンプレートの本文を作る。サブページ・データベースは pageId の子として作る */
export function buildTemplate(template: PageTemplate, ws: Workspace, pageId: string) {
  const ctx: TemplateContext = {
    subPage: async (title, icon, content = []) => {
      const rec = await ws.create(pageId, { title, icon, content }, { open: false });
      if (!rec) throw new Error("サブページを作成できませんでした");
      return { type: "pageLink", props: { pageId: rec.id } };
    },
    database: async (title, icon, config, rows = []) => {
      const db = await ws.create(pageId, { title, icon, database: config }, { open: false });
      if (!db) throw new Error("データベースを作成できませんでした");
      for (const [i, [title, props]] of rows.entries()) {
        await ws.create(db.id, { title, props, sort: i + 1 }, { open: false });
      }
      return { type: "database", props: { pageId: db.id } };
    },
  };
  return template.build(ctx);
}
