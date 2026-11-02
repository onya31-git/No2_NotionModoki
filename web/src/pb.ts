import PocketBase from "pocketbase";

// 同一オリジン配信なので "/" でよい（開発時は Vite のプロキシ経由）
export const pb = new PocketBase("/");

// SDK は同一キーの並行リクエストを自動キャンセルする。
// StrictMode の二重実行や連続保存で意図せず失敗しないよう無効化する（保存の直列化は自前で行う）。
pb.autoCancellation(false);

export type ColumnType = "text" | "number" | "select" | "multi_select" | "date" | "checkbox" | "url";
export type SelectOption = { id: string; name: string; color: string };
export type Column = { id: string; name: string; type: ColumnType; options?: SelectOption[] };
/** 行のタイトル列は列定義に含めず、"title" という固定 ID で扱う */
export type SortSpec = { column: string; dir: "asc" | "desc" };
export type DatabaseConfig = {
  columns: Column[];
  view: "table" | "board";
  sort?: SortSpec | null;
  /** ボード表示でグループ化するセレクト列の ID */
  groupBy?: string;
  /** ボードのカードに表示しないプロパティの列 ID（新しく追加した列は表示される） */
  cardHidden?: string[];
  /** 行を開く方法。サイド（既定）・中央のポップアップ・フルページ */
  openIn?: OpenMode;
};
export type OpenMode = "side" | "center" | "full";
export type PageFont = "" | "serif" | "mono";
export type PropValue = string | number | boolean | string[] | null;

export type PageRecord = {
  id: string;
  title: string;
  /** BlockNote の document（カスタムブロックを含むため型は editor 側で付ける） */
  content: unknown[] | null;
  icon: string; // 絵文字。未設定は ""
  cover: string; // COVERS のキー、またはアップロード画像の URL。未設定は ""
  parent: string; // 親ページ ID。ルートは ""
  favorite: boolean;
  trashed: boolean;
  fullWidth: boolean;
  font: PageFont;
  smallText: boolean;
  coverY: number; // カバー画像の縦位置。0 は未設定（中央）、1〜100 が上端〜下端
  sort: number; // 兄弟内の表示順
  database: DatabaseConfig | null; // データベースページのみ
  props: Record<string, PropValue> | null; // データベース行のプロパティ値
  created: string;
  updated: string;
};

/** サイドバー・検索用。content は重いので含めない */
export type PageSummary = Omit<PageRecord, "content">;
export const SUMMARY_FIELDS = "id,title,icon,cover,parent,favorite,trashed,fullWidth,font,smallText,coverY,sort,database,props,created,updated";

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export const pages = () => pb.collection<PageRecord>("pages");

/**
 * 画像などを uploads コレクションへ保存し、ルート相対 URL（/api/files/...）を返す。
 * raspberrypi.local / IP アドレス / VPN 経由などアクセス元のホスト名が変わっても壊れないよう、オリジンは含めない。
 */
export async function uploadFile(file: File, pageId: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("page", pageId);
  const rec = await pb.collection("uploads").create(form);
  const url = new URL(pb.files.getURL(rec, rec.file), window.location.href);
  return url.pathname + url.search;
}
