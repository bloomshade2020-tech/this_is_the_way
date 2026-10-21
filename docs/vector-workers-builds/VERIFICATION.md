# 下書きの確認結果（ローカル検証改訂版）

確認日: 2026-10-21。Node.js 24.19.0 / npm 11.9.0 / Wrangler 4.151.3。

## 実行・確認済み

- 入力ZIP（13,486 bytes）のSHA256: `14482dd344ce5e2fe957133e6f982c7a7ae5acc7ab537a9f628133902f4f055b`。ZIP整合性検査も成功。
- Worker `src/index.js` は18,511 bytes。入力ZIP内のファイルとバイト一致。SHA256: `f55332e8b467eea00a3247a2a9fde0c192bf4c26436c3edeff00c65ac424ebfd`。修正・改行変換なし。
- `wrangler.jsonc` と `.gitignore` は入力ZIPから変更なし。
- 公式 `https://registry.npmjs.org` の `wrangler` latestを照会し、4.151.3 / Node `>=22.0.0` を確認。devDependencyは範囲指定なしの完全固定。
- npmでlockfileVersion 3の `package-lock.json` を実生成。全resolved URLが公式npm registry。Wranglerのintegrityは公式メタデータと一致。
- `npm ci --ignore-scripts --no-audit --no-fund` 成功（40 packages）。install hookは実行していない。監査も実行しておらず、脆弱性評価済みという意味ではない。
- `npm run check`（`node --check src/index.js`）成功。
- インストールした `wrangler/config-schema.json` に対しPython jsonschemaの対応validatorで `wrangler.jsonc` を検証し成功。
- 固定済みWranglerによる下記dry-runが終了コード0で成功。ローカルバンドル23.71 KiB / gzip 7.53 KiB。`--dry-run: exiting now.` を確認。
- `npm ls --depth=0` は終了コード0。Wrangler 4.151.3を確認。ただしnpmは `@emnapi/runtime@1.11.3`、`@img/sharp-wasm32@0.35.5`、`tslib@2.8.1` をextraneousと表示した。依存関係ツリーが完全に警告なしとはしていない。再現インストールとdry-runは成功。

## 実行したローカルコマンド

Workerディレクトリで以下を実行。npmの取得元は公式registryのみ。npm cacheとバンドル出力は納品ZIP外に置いた。

```sh
npm install --save-dev --save-exact wrangler@4.151.3 --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
npm run check
```

dry-runでは資格情報を引き継がない空の環境から起動し、設定保存先を空の専用ディレクトリへ分離、telemetryを無効化した。以下のパスはこの検証環境のもの。

```sh
env -i PATH="$PATH" CI=true WRANGLER_SEND_METRICS=false \
  WRANGLER_NO_SKILLS_UPDATE_PROMPTS=true \
  XDG_CONFIG_HOME=/workspace/vector-local-validation/isolated-config \
  WRANGLER_LOG_PATH=/workspace/vector-local-validation/dry-run.log \
  node node_modules/wrangler/bin/wrangler.js deploy --dry-run \
  --outdir /workspace/vector-local-validation/build-output
```

これは `--dry-run` を必須にしたローカルバンドル検証であり、本番deployではない。npm scriptにdeployやuploadは登録していない。Workerのハンドラー、通知、Cronを呼び出していない。

## 設定上の維持事項と提案

- `name: din-comms-api`、`compatibility_date: 2026-10-10`、flags `[]`、既存VECTOR_KV ID `eb8e5b4209b640aaa80e5f3334eb5453`、`keep_vars: true` を保持。
- `vars` / `triggers` / `assets` / `routes` は追加なし。既存Cron `0 * * * *` は今回変更していない。`triggers deploy` は未実行。
- `preview_urls: false` は提案であり、本番の現在値確認済みではない。
- Logs有効 / Traces無効は提供画面に基づく。sampling・invocation logs・転送先等の詳細や、省略項目の適用時の有効値は未確認。省略が既存値保持を保証するとは扱わない。
- Runtime Secretsはファイルへ移さず、変更・取得なし。

## 未検証・適用前の必須項目

- Cloudflare本番ソースと今回のWorkerの完全一致。
- 完全な本番設定との一致、設定省略による差分の有無。
- Cloudflare Builds上でのインストール・ビルド・候補版作成・本番昇格。
- Workersランタイムでの実行互換性、実API通信、iPhone PWA、通知、Cronの動作。

ローカルバンドル成功は実行時動作・本番安全性の証明ではない。このローカル検証段階ではGitHubへのcommit/push/PR、Cloudflare接続・資格情報作成、候補版upload、remote build、deploy、KV読み書き、本番HTTPテストは実行していない。フロントエンドも変更なし。

## 公式資料

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
- [公式npm Wranglerメタデータ](https://registry.npmjs.org/wrangler/4.151.3)

## 準備用ブランチへの配置

ユーザー承認に基づき、検証済みのWorker・設定・package/lockとこの資料を準備用ブランチへ配置する。既存ルートREADMEとフロントエンドは変更しない。資料は `docs/vector-workers-builds/` へ移動した。mainへの統合、PR作成、Cloudflare接続・アップロード・デプロイは今回の対象外。
