/// <reference path="../pb_data/types.d.ts" />

// Notion 風機能のためのフィールド追加と、画像アップロード用の "uploads" コレクション作成。
// 階層は parent（自己参照）で表し、ツリーはクライアント側で組み立てる（結合クエリは使わない）。
migrate((app) => {
  const pages = app.findCollectionByNameOrId("pages");

  pages.fields.add(new TextField({ name: "icon", max: 32 })); // 絵文字
  pages.fields.add(new TextField({ name: "cover", max: 300 })); // プリセットキー or アップロード画像の URL
  // 親を完全削除すると子孫もまとめて削除される
  pages.fields.add(new RelationField({ name: "parent", collectionId: pages.id, maxSelect: 1, cascadeDelete: true }));
  pages.fields.add(new BoolField({ name: "favorite" }));
  pages.fields.add(new BoolField({ name: "trashed" })); // ゴミ箱（論理削除）
  pages.fields.add(new BoolField({ name: "fullWidth" }));
  app.save(pages);

  // アップロードは作成と閲覧のみ公開。一覧・更新・削除はスーパーユーザー（管理画面）に限定する。
  const uploads = new Collection({
    type: "base",
    name: "uploads",
    listRule: null,
    viewRule: "",
    createRule: "",
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 20 * 1024 * 1024 },
      // どのページで使われたかの記録用。画像は別ページへコピーされ得るので、ページ削除時に連鎖削除はしない。
      { name: "page", type: "relation", collectionId: pages.id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
  });
  app.save(uploads);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("uploads"));

  const pages = app.findCollectionByNameOrId("pages");
  for (const name of ["icon", "cover", "parent", "favorite", "trashed", "fullWidth"]) {
    pages.fields.removeByName(name);
  }
  app.save(pages);
});
