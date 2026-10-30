/// <reference path="../pb_data/types.d.ts" />

// "pages" コレクション: 1ページ = 1レコード。BlockNote の document 配列を content に丸ごと保存する。
// 認証は後回しのため、全ルールを "" (= 誰でも可) にしている。null にするとスーパーユーザー専用になる。
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "pages",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { name: "title", type: "text", max: 500 },
      // json フィールドの既定上限は 1MB。画像を含まない文書でも長文だと届き得るので 5MB に拡張。
      { name: "content", type: "json", maxSize: 5 * 1024 * 1024 },
      // v0.23 以降、created/updated は自動付与されないため autodate として明示する。
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_pages_updated ON pages (updated)"],
  });

  app.save(collection);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("pages"));
});
