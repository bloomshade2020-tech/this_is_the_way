# VECTOR GitHub → Cloudflare 連携用下書き

**準備用ブランチでレビューする連携案です。mainへの反映・Cloudflare接続・候補版アップロード・本番反映は別途承認が必要です。**

更新日: 2026-10-21（ローカル検証改訂版）。アプリの新機能実装ではありません。既存フロントエンドは変更していません。

## 今回入っているもの

- `workers/din-comms-api/src/index.js`: 提供された `VECTOR_v0.7_Cloudflare_Worker_CODE_FIXED_v2.txt` を1バイトも変更せずコピー。
- `workers/din-comms-api/wrangler.jsonc`: 既存Workerを使う設定案。
- `workers/din-comms-api/package.json`: Wrangler `4.151.3` を完全固定。npm scriptは構文確認の `check` のみ。デプロイスクリプト・install hookなし。
- `workers/din-comms-api/package-lock.json`: 公式npm registryからnpmが実生成したlockfile（lockfileVersion 3）。
- `.gitignore`: ローカルの鍵・環境変数・依存関係などの誤登録防止用。秘密保持の完全保証ではありません。
- `docs/vector-workers-builds/VERIFICATION.md`: ローカル確認結果。

**このソースとCloudflare本番ソースの完全一致は未確認です。** 画面の本番バージョン `d53699c6` は参照情報であり、一致証明にはなりません。

## ローカル検証済み・本番照合は未完了

Wrangler `4.151.3`（検証時の公式npm registryのlatest、Node要件 `>=22.0.0`）を固定しました。Node `24.19.0` / npm `11.9.0` でlock生成、`npm ci --ignore-scripts --no-audit --no-fund`、構文確認、同梱JSON Schema検証、Wranglerのローカルdry-runが成功しています。インストールフックを実行しなくても今回のバンドル生成は成功しました。

再確認は `workers/din-comms-api` で `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` と `npm run check` を実行します。Wrangler検証に使ったコマンドは `docs/vector-workers-builds/VERIFICATION.md` に記録しています。dry-runの「Total Upload」はバンドルサイズの表示で、アップロード実績ではありません。

本番ソース・完全な設定との照合、Cloudflare Builds上の実行、実行時動作は未確認です。mainへの統合やCloudflare接続を開始してよいという判定ではありません。

## 設定の根拠・維持したいもの

|項目|下書き|根拠・注意|
|---|---|---|
|Worker名|`din-comms-api`|既存Worker。別Workerを新規作成しない|
|main|`src/index.js`|今回の配置案|
|compatibility_date|`2026-10-10`|提供された設定画面|
|compatibility_flags|`[]`|提供された設定画面|
|workers_dev|`true`|現在のフロントが既存workers.dev URLを使用|
|VECTOR_KV|`eb8e5b4209b640aaa80e5f3334eb5453`|画面の既存 `vector-private-notifications`。新規KV作成なし|
|keep_vars|`true`|ダッシュボードの通常変数を保持する方針。KV保持の代用ではない|
|Workers Logs / Traces|有効 / 無効|提供画面。公式設定形式に合わせた案|
|preview_urls|`false`|**新しい保護策の提案**。現在値確認済みという意味ではない|

Logsの詳細（sampling・invocation logs・転送先等）は未確認です。勝手な数値は設定していませんが、**省略＝既存値保持の保証ではありません**。適用前に現行詳細とWranglerの有効設定を照合してください。Placement・Cacheなども架空の既定値を追加していません。

### Secretsと通常変数

既存の `DIN_ACCESS_TOKEN`、`OPENAI_API_KEY`、`VAPID_PRIVATE_KEY`、`VECTOR_STATE_KEY` はCloudflareのRuntime Secretsに残します。値をGitHub・README・Builds変数へコピーしません。通常変数 `VAPID_PUBLIC_KEY` も値を書かず、keep_varsで維持する設計です。Builds用変数と実行時変数は別物です。

特に暗号化鍵 `VECTOR_STATE_KEY` とVAPID鍵ペアは変更しません。KVを同じIDで残しても暗号化鍵を変えると保存済みデータを読めなくなるおそれがあります。

### Cronは既存のまま

画面で確認した既存Cronは `0 * * * *`（毎時）です。設定ファイルでは `triggers` 自体を省きます。`crons: []` は削除指示になるため入れません。Buildsから **`wrangler triggers deploy` は実行しません**。候補版アップロードとトリガー変更は別操作です。通知の有効化やCronの手動実行も今回行いません。

## 後日の接続案 — まだ実行しない

依存関係はローカルで確定済みです。次に本番ソースの照合・設定差分の確認を済ませます。今回の準備用ブランチへの追加は承認済みです。mainへの統合やCloudflareへの接続・アップロードは未承認です。

初回のみ本人がCloudflareで行う作業:

1. 既存 `din-comms-api` → Settings → Builds → Connect を開く。
2. GitHubの必要なリポジトリだけを認可し、`this_is_the_way` を選ぶ。接続時の権限・トークン作成を確認する。値をチャットへ貼らない。
3. Root directoryを `workers/din-comms-api` にする。既存の静的サイトのルートをWorkerとして自動設定させない。
4. 対象ブランチを確認。初期運用では非本番ブランチのPreview Buildsは無効にし、別Workerで本番KVと同じCronを動かさない。
5. 本番照合とBuilds環境のNode対応確認後、Build command候補は `npm run check`。Deploy commandは通常のdeployではなく、**候補版を保存するだけ**の `npx --no-install wrangler versions upload` にする。固定済みのローカルWranglerだけを使う。
6. 接続確定で最初のビルドが始まる可能性もあるため、保存・接続前に設定全体を確認し、候補版アップロード自体について承認する。

これらのコマンドは説明用であり、今回は実行していません。候補版にも本番KV等のbindingがあるため、version URLを無害なテスト環境だとは考えません。preview_urls=falseだけで全てのプレビュー機能を無効化できるとも限りません。

## 毎回の承認を分ける

1. **GitHubへの追加・コミット承認**（対象ファイルと差分を確認）。
2. **候補版作成の承認**（GitHub連携後は対象ブランチのpushでBuildsが動くため、その効果も説明）。
3. commit SHA → Build結果 → Worker version ID と設定差分を記録。
4. **このversion IDを本番へ切り替えてよい、という明示承認**を得てから本人がDeploymentsのPromote deploymentを操作する。

候補版の成功は本番反映ではありません。通常の `wrangler deploy`、本番昇格コマンド、トリガー更新を自動処理へ入れない設計です。ただしこれは権限による強制承認機能ではなく、管理者がコマンドを変更すれば迂回できる運用上の防止策です。

## GitHub Pagesは別系統

フロントエンドの既存ファイルはそのままです。Workers Buildsの承認待ちにしても、GitHub Pagesの自動公開まで止まるわけではありません。mainへのコミットでPages公開が起きる可能性を別途確認・承認します。

公開リポジトリのサブフォルダーは非公開領域ではありません。Pagesから配信される可能性もあります。非公開RP資料・会話履歴・鍵・トークンをこのフォルダーへ追加しません。

## 失敗したら

候補版の作成に失敗した場合はログを確認し、本番へ昇格しません。本番反映後の不具合は、直前の正常version IDと設定を確認して、承認のうえその版へのロールバックを検討します。コードを戻してもKVデータが戻るとは限りません。

**保管庫・会話履歴・KVの削除や初期化、ブラウザストレージの消去を復旧手順にしません。** 本番 `/chat` や通知エンドポイントへのsmoke POST、テストデータ投入、通知のテスト送信は行いません。

## 参照した公式資料

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Traces](https://developers.cloudflare.com/workers/observability/traces/)
