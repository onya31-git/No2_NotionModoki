/// <reference path="../pb_data/types.d.ts" />

// ページごとの見た目の設定（Notion の「スタイル」）。
migrate((app) => {
  const pages = app.findCollectionByNameOrId("pages");

  pages.fields.add(new TextField({ name: "font", max: 16 })); // "" (既定) / "serif" / "mono"
  pages.fields.add(new BoolField({ name: "smallText" }));
  pages.fields.add(new NumberField({ name: "coverY" })); // カバー画像の縦位置（0〜100%）。未設定の 0 は中央扱い
  app.save(pages);
}, (app) => {
  const pages = app.findCollectionByNameOrId("pages");
  for (const name of ["font", "smallText", "coverY"]) {
    pages.fields.removeByName(name);
  }
  app.save(pages);
});
