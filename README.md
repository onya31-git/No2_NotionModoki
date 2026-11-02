# RasStation

Raspberry Pi 4 上の PocketBase だけで動かす、個人用の Notion 風ドキュメント管理システムです。

- フロントエンド: React + BlockNote（Windows 11 の WSL2 上で Vite ビルド）
- バックエンド: PocketBase 単体プロセス（`/api/*` とビルド済み静的ファイルの両方を配信）
- データ: `pages` コレクションに 1ページ = 1レコード。BlockNote のドキュメント全体を `content`（json）に保存

## 主な機能

| 機能 | 操作 |
|---|---|
| ブロックエディタ（見出し・リスト・チェックリスト・表・コード・画像など） | 本文で `/` を入力（メニューは日本語） |
| 自動保存 | 入力が止まってから 2 秒後。右上に保存状態を表示 |
| ページ階層（サブページ） | サイドバーの項目にカーソルを乗せて `＋`、または `…` →「サブページを追加」 |
| ページの並べ替え・移動 | サイドバーでドラッグ＆ドロップ（項目の上端・下端で前後へ、中央で子ページに）。`…` →「移動」でも可 |
| 本文中のページリンク | `/ページ` でサブページを作ってリンクを置く。`@` または `/ページへのリンク` で既存ページへのリンクを挿入 |
| 複数ブロックの選択 | 本文の左右の余白からドラッグして囲む（`Esc` で今のブロックを選択）。選択中は ⋮⋮ のドラッグでまとめて移動、`Ctrl+C` / `Ctrl+X` でコピー・切り取り、`Delete` で削除、`Ctrl+Shift+↑↓` で上下に移動 |
| ウィジェット | `/` メニューの「ウィジェット」から時計・カレンダー（祝日つき）・天気予報・生涯時計・今日の言葉を本文に置ける。右上の ⚙ で設定（設定は本文と一緒に保存）。天気は [Open-Meteo](https://open-meteo.com/)、祝日は [holidays-jp](https://holidays-jp.github.io/) から閲覧中のブラウザが直接取得する（キー不要、インターネット接続が必要） |
| ブロックの種類の変更・複製 | ブロックの左のつまみ（⋮⋮）をクリック →「ブロックの種類を変更」（テキスト・見出し・リスト・引用・コードなど）。文字を選択したときのツールバー左端からも変更できる |
| 段組み（複数列） | ブロックの左のつまみを、別のブロックの右端（または左外側）へドラッグ。`/2列`〜`/5列` でも挿入できる。列の境界をドラッグで幅を変更 |
| データベース（表・ボード） | `/データベース（インライン）` で今のページの本文に埋め込み、`/データベース（フルページ）` でサブページとして作成。行は 1 行 = 1 ページで、開くとプロパティ欄付きのページになる。⋮⋮ メニューで埋め込み表示とリンク表示を切り替えられる |
| 行の開き方 | データベース右上のボタンで「サイドで開く」（既定）・「中央で開く」・「フルページで開く」をデータベースごとに選べる。サイド・中央では表やボードを開いたまま行のページを編集でき、`Esc` / ✕ / 外側のクリック（サイドでは行・カード以外の本文側）で閉じる、⤢ でフルページへ。サイドは画面の端からすべり出る。サイド表示の位置は 設定 →「サイド表示の位置」で 自動（縦長の画面なら下）・右・下 から選べ、境目のドラッグで大きさを変えられる（端末ごとに保存） |
| パンくずリスト | 上部バーに親ページをたどって表示。4 階層以上（スマホでは親ページすべて）は「…」に畳まれ、マウスオーバー（スマホはタップ）で一覧を表示 |
| アイコン（絵文字）・カバー | タイトル上にカーソルを乗せて「アイコンを追加」「カバーを追加」。カバーは画像もアップロード可 |
| お気に入り | 右上の ☆。サイドバー上部に表示 |
| 検索 | `Ctrl+P` / `Ctrl+K`。タイトルと本文を検索 |
| ゴミ箱 | 削除はゴミ箱へ移動するだけで、あとから復元できる。完全に削除するとサブページも削除される |
| ページのスタイル | 右上の `…` → フォント（デフォルト／セリフ／等幅）・小さい文字・全幅表示 |
| カバー位置の調整 | 画像カバーにカーソルを乗せて「位置を調整」→ 上下にドラッグ |
| リンクをコピー・複製・移動 | 右上の `…` |
| 設定（端末ごと） | サイドバー下の「設定」: テーマ（システム／ライト／ダーク）、アクセントカラー、サイドバーの幅、新しいページの既定スタイル |
| サイドバーの開閉・幅 | `Ctrl+\`。スマホでは ☰。閉じている間は ☰ や画面左端にマウスを乗せると一時的に表示（`»` で固定）。右端をドラッグで幅を変更（ダブルクリックで元に戻す） |
| 画像・ファイルの添付 | `/画像` など。PocketBase の `uploads` コレクションに保存 |

データベースでできること:

- プロパティの種類: テキスト・数値・セレクト・マルチセレクト・日付・チェックボックス・URL（列見出しをクリックして名前・種類を変更、`＋` で追加）
- 列見出しから昇順・降順の並べ替え、ツールバーでタイトルの絞り込み
- ボード表示: セレクト型のプロパティでグループ化し、カードをドラッグして値を変更。カードの前後に落とすと並び順も変わる。カードに表示するプロパティはボード上部の「カードのプロパティ」で選べる
- テーブル表示: 行の左のつまみ（⋮⋮）をドラッグして並べ替え（列で並べ替え中は手動の並べ替えはできない）
- セレクト・マルチセレクトの選択肢は、セルの選択肢一覧または列見出しのメニューの「…」から名前・色の変更と削除ができる。ボードのレーンは選択肢の色を薄めた背景になる（「〜なし」のレーンは該当する行があるときだけ表示）
| ダークモード | 既定では OS の設定に追従。「設定」で固定もできる |

```
RasStation/
├─ pocketbase/
│  └─ pb_migrations/
│     ├─ 1761609600_create_pages.js            # pages コレクション
│     ├─ 1761868800_pages_notion_features.js   # 階層・アイコン等のフィールド、uploads コレクション
│     ├─ 1762128000_pages_database.js          # 並び順・データベース用のフィールド
│     └─ 1762387200_pages_style.js             # フォント・小さい文字・カバー位置
├─ web/                                        # React + BlockNote
│  └─ src/
│     ├─ pb.ts             # PocketBase SDK クライアント・型・アップロード
│     ├─ tree.ts           # 一覧からページ階層を組み立てる
│     ├─ workspace.tsx     # ページ一覧と操作を各部品へ渡すコンテキスト
│     ├─ App.tsx           # 全体のレイアウト・状態・ショートカット
│     ├─ Peek.tsx          # データベースの行のサイド表示・中央表示
│     ├─ Sidebar.tsx       # ページツリー・お気に入り・ドラッグ＆ドロップ
│     ├─ PageEditor.tsx    # カバー・アイコン・タイトル・BlockNote・自動保存
│     ├─ blocks.tsx        # エディタのスキーマ（ページリンク・@メンション・段組み）とメニュー
│     ├─ columns.ts        # 段組みブロック・横へのドロップ・列幅の変更
│     ├─ blockSelection.ts # 複数ブロックの選択（範囲選択・まとめて移動／コピー／削除）
│     ├─ widgets.tsx       # ウィジェットのブロック（時計・カレンダー・天気予報・生涯時計・今日の言葉）
│     ├─ blockMenu.tsx     # ブロックの ⋮⋮ メニュー（種類の変更・複製）と書式ツールバー
│     ├─ settings.ts       # テーマ・アクセントカラーなど端末ごとの設定
│     ├─ SettingsDialog.tsx # 設定画面
│     ├─ database.tsx      # データベースの表・ボード・プロパティ編集
│     ├─ MoveDialog.tsx    # 「移動」先の選択
│     ├─ Breadcrumb.tsx    # パンくずリスト（深い階層の折りたたみ）
│     ├─ SearchDialog.tsx  # 検索
│     ├─ TrashDialog.tsx   # ゴミ箱
│     ├─ pickers.tsx       # 絵文字・カバーの選択
│     └─ ui.tsx, icons.tsx # 共通部品
└─ deploy/
   ├─ deploy.sh            # WSL → Pi へのビルド・転送
   └─ pocketbase.service   # Pi 用 systemd ユニット
```

動作確認済みのバージョン: PocketBase v0.40.6、BlockNote 0.56、React 19、Vite 8。

---

## ステップ0: WSL の開発環境

開発・ビルド・デプロイの作業はすべて WSL2（Ubuntu）のシェルで行います。プロジェクトも WSL のファイルシステム内に置きます。

> Windows 側のツール（`pocketbase.exe`、Windows の npm）は WSL 内のファイルを `\\wsl.localhost\...` 経由で扱うことになるため、使わないでください。
> この経由では SQLite のファイルロックが効かず `database is locked (5) (SQLITE_BUSY)` になります。npm もパスの問題で失敗します。

Node.js は nvm で WSL に入れます。

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
exec $SHELL -l
nvm install 22
which node npm    # どちらも ~/.nvm/... を指していること（/mnt/c/... ではない）
```

Pi へパスワードなしで SSH 接続できるよう、鍵を登録しておきます。

```bash
ssh-keygen -t ed25519            # 既に鍵があれば不要
ssh-copy-id pi@raspberrypi.local
```

> WSL2 の既定（NAT モード）では `raspberrypi.local` のような mDNS 名を名前解決できないことがあります。
> その場合は Pi の IP アドレス（例: `pi@192.168.1.50`）を使うか、`%UserProfile%\.wslconfig` に以下を書いて `wsl --shutdown` で再起動してください。
>
> ```ini
> [wsl2]
> networkingMode=mirrored
> ```

---

## ステップ1: PocketBase のセットアップ（WSL）

```bash
cd ~/…/RasStation/pocketbase
wget https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
unzip pocketbase_0.40.6_linux_amd64.zip pocketbase && rm pocketbase_0.40.6_linux_amd64.zip
./pocketbase superuser upsert you@example.com 'YourStrongPassword'
./pocketbase serve      # Windows のブラウザからも http://127.0.0.1:8090 で開けます
```

- 起動時に `pb_migrations/` 内のマイグレーションが自動適用され、`pages` コレクションが作成されます。
- 管理画面: http://127.0.0.1:8090/_/

### スキーマ定義（`pb_migrations/`）

**pages**

| フィールド | 型 | 備考 |
|---|---|---|
| `id` | text（システム） | 自動付与 |
| `title` | text | 最大 500 文字 |
| `content` | json | BlockNote の document 配列。上限を 5MB に拡張（既定は 1MB） |
| `icon` | text | 絵文字。未設定は空文字 |
| `cover` | text | プリセット名（`ocean` など）、またはアップロード画像の `/api/files/...` |
| `parent` | relation（pages） | 親ページ。親を完全削除すると子孫も削除（cascadeDelete） |
| `favorite` / `trashed` / `fullWidth` | bool | お気に入り / ゴミ箱 / 全幅表示 |
| `font` / `smallText` | text / bool | ページのフォント（`""`・`serif`・`mono`）と小さい文字 |
| `coverY` | number | 画像カバーの縦位置（1〜100%）。0 は中央 |
| `sort` | number | 兄弟ページ内の表示順（同じ値なら作成順） |
| `database` | json | データベースページのみ。列定義（`columns`）と表示設定（表／ボード、並べ替え、グループ化、カードに表示しないプロパティ `cardHidden`） |
| `props` | json | データベースの行のプロパティ値。`{ 列ID: 値 }` |
| `created` / `updated` | autodate | **v0.23 以降は自動では作られない**ため明示的に定義 |

API ルール（List/View/Create/Update/Delete）はすべて `""`（誰でも可）です。`null` にするとスーパーユーザーしか使えなくなるので注意してください。

ページの階層は、全ページの概要（`content` を除く）を 1 回で取得し、ブラウザ側で組み立てています。そのため結合クエリは使っていません。

データベースも同じ考え方で、専用のコレクションは作っていません。`database` を持つページがデータベース、その子ページが行です。表やボードは、手元のページ一覧から子ページを取り出して描画します。本文に埋め込んだデータベースも実体は同じサブページで、本文には `{ type: "database", props: { pageId } }` というブロックが入るだけです。

**uploads**（画像・ファイル）

| フィールド | 型 | 備考 |
|---|---|---|
| `file` | file | 1 ファイル最大 20MB |
| `page` | relation（pages） | どのページから上げたかの記録。画像が別ページにコピーされることもあるため、ページを削除してもファイルは消さない |

公開しているのは作成（Create）と閲覧（View）だけです。一覧・更新・削除はスーパーユーザー（管理画面）からのみ行えます。不要になったファイルは管理画面から削除してください。

<details>
<summary>管理画面から手で作る場合</summary>

1. 管理画面で「+ New collection」→ Type: **Base**、Name: `pages`
2. 「+ New field」で `title`（Plain text）と `content`（JSON、Max size を 5242880 に）を追加
3. `created` / `updated` は UI で作った場合は既定で入っています
4. 「API Rules」タブで 5つのルールのロックを解除し、空欄（＝公開）のまま保存

この方法で作った場合でも、prebuilt 版の PocketBase では変更内容が `pb_migrations/` にマイグレーションファイルとして書き出されるので、Pi への反映方法は同じです。
</details>

---

## ステップ2: React + BlockNote

```bash
cd ~/…/RasStation/web
npm install
npm run dev     # Windows のブラウザで http://localhost:5173 （/api は vite.config.ts で 127.0.0.1:8090 にプロキシ）
```

- `http://localhost:5173/` … ページ一覧と新規作成
- `http://localhost:5173/?id=<pageId>` … エディタ

実装上のポイント（`src/PageEditor.tsx`）:

- **初期値の流し込み**: `useCreateBlockNote` の `initialContent` はエディタ生成時にしか読まれないため、`getOne` が完了してから `<Editor key={page.id}>` をマウントしています。`content` が空配列の場合は `undefined` を渡します（BlockNote は空配列を受け付けません）。
- **デバウンス自動保存**: `onChange` のたびに 2 秒のタイマーをリセットし、満了したら `editor.document` を `update` します。外部ライブラリは使っていません。
- **保存の直列化**: 保存中に次の保存が来た場合は完了を待ってから送るので、古い内容が新しい内容を上書きすることはありません。そのため SDK の自動キャンセルは `pb.autoCancellation(false)` で無効にしています。
- **取りこぼし防止**: タブが非表示になったとき、またはアンマウント時に、待機中の保存をすぐ実行します。未保存の状態で離脱しようとすると、ブラウザの確認ダイアログを出します。

---

## ステップ3: Raspberry Pi へのデプロイ

### 3-1. Pi の初回セットアップ（Pi 上で 1 回だけ）

Pi 上で必要なのは Go 製の単一バイナリだけです。Node.js はインストールしません。

```bash
PB_VERSION=0.40.6
mkdir -p ~/pocketbase && cd ~/pocketbase
wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_arm64.zip
unzip pocketbase_${PB_VERSION}_linux_arm64.zip pocketbase && rm pocketbase_${PB_VERSION}_linux_arm64.zip
./pocketbase superuser upsert you@example.com 'YourStrongPassword'
```

systemd に登録します（`deploy/pocketbase.service` を WSL から転送）。

```bash
# WSL
scp deploy/pocketbase.service pi@raspberrypi.local:/tmp/
```

```bash
# Pi
sudo mv /tmp/pocketbase.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pocketbase
```

ユーザー名が `pi` 以外の場合は、ユニット内の `User` / `Group` / パスを書き換えてください。

### 3-2. デプロイ（WSL から、毎回）

```bash
cd ~/…/RasStation
./deploy/deploy.sh -r pi@raspberrypi.local   # 初回・スキーマ変更時
./deploy/deploy.sh pi@raspberrypi.local      # フロントだけ更新する場合
```

`pb_migrations/` に新しいファイルが増えたとき（このリポジトリを更新したときなど）は、`-r` を付けて PocketBase を再起動してください。マイグレーションは起動時に適用されます。WSL で動かしている `./pocketbase serve` も、同じく一度止めてから起動し直します。

接続先は環境変数 `PI_HOST` でも指定できます。Pi 上の配置先（既定は `/home/pi/pocketbase`）は `PB_DIR` で変えられます。

スクリプトの処理内容:

1. `npm run build` → `web/dist/`
2. `pb_migrations/` を tar で固めて ssh で送り、Pi 側で展開する
3. `dist` も同じく ssh で送り、新しい `pb_public` に展開してから入れ替える（古いハッシュ付きアセットは残りません）
4. `-r` を付けた場合は `systemctl restart pocketbase` を実行し、マイグレーションを適用

PocketBase はリクエストごとに `pb_public` を読むため、静的ファイルの更新だけなら再起動は不要です。

### Pi 上の最終的なディレクトリ構成

```
/home/pi/pocketbase/
├─ pocketbase          # arm64 バイナリ
├─ pb_data/            # SQLite DB・アップロードファイル（自動生成。バックアップ対象）
├─ pb_migrations/      # WSL から同期
└─ pb_public/          # web/dist の中身
   ├─ index.html
   └─ assets/...
```

ブラウザで `http://raspberrypi.local:8090/` を開けば利用できます。`/api/*` は API、それ以外は `pb_public` を配信し、存在しないパスは `index.html` にフォールバックします。

### 運用メモ

- **認証なし・公開書き込み**の状態なので、ポート 8090 はインターネットに公開せず、LAN 内または Tailscale などの VPN 経由でのみ使ってください。
- バックアップ: 管理画面の Settings → Backups、または `pb_data/` をコピーしてください。
- ログ: `journalctl -u pocketbase -f`
