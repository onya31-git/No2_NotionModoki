/// <reference path="../pb_data/types.d.ts" />

// ページの並べ替えとデータベース（表）ビューのためのフィールド追加。
// データベースは「database に列定義を持つページ」、その行は「親がデータベースのページ」で表し、
// 各行のプロパティ値は props に列 ID をキーとして保存する（結合クエリは使わない）。
migrate((app) => {
  const pages = app.findCollectionByNameOrId("pages");

  pages.fields.add(new NumberField({ name: "sort" })); // 兄弟ページ内の表示順（昇順、同値は作成順）
  pages.fields.add(new JSONField({ name: "database", maxSize: 1024 * 1024 })); // 列定義・表示設定。通常ページは null
  pages.fields.add(new JSONField({ name: "props", maxSize: 1024 * 1024 })); // データベース行のプロパティ値
  app.save(pages);
}, (app) => {
  const pages = app.findCollectionByNameOrId("pages");
  for (const name of ["sort", "database", "props"]) {
    pages.fields.removeByName(name);
  }
  app.save(pages);
});
