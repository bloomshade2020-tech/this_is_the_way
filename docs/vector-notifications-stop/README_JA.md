# 通知移行停止版・準備パッケージ

レビュー用のWorker候補です。本番配備・DO作成・通知開始は未実施で、別途承認が必要です。既存フロントエンド、main、現在のBuilds設定を変更しません。通知protocol 4対応フロントエンドはこのパッケージには含めません。

## ファイルと実行条件

`workers/din-comms-api` にWorker、Wrangler 4.151.3固定のpackage/lock、明示選択する2設定を置きます。既定のwrangler.jsoncや配備npm scriptは追加しません。

- `wrangler.migration-stop.jsonc`: 新規生成・ON・テストPushを拒否。対応する新画面の受信・ACKは保持。
- `wrangler.fallback-stop.jsonc`: 同じDOクラス、暗号化本文、受領印、制御順序を保持する強制停止版。
- `src/baseline.js`: 既存準備ブランチ73c9ea4a6ccb3766ddb271a184345e59866de2e0のWorkerを引き継ぐ。通常chatはこの既存処理へ委譲。本番実ソースとの完全一致を意味しません。

設定はWorker名din-comms-api、compatibility_date 2026-10-10、flags空、VECTOR_KV既存ID、keep_vars=true、Cron 0 * * * *を維持する案です。既存Secret値は含めません。追加はVECTOR_NOTIFICATIONS/VectorNotificationCoordinator、SQLite migration、停止モードと暗号化未受領本文上限です。

## 配備前の必須確認

自動Build対象外と確認した準備ブランチでのみレビューします。Preview Builds有効の場合、別ブランチもBuildされ得ます。新規DO作成はversions uploadでは実施できず、明示承認後のwrangler deployが必要です。自動Buildを恒常的なdeployへ変更しません。

実namespace ID、現在version・migration履歴、workers_dev/preview_urls、および詳細ログ設定を実環境と照合します。候補設定のpreview_urls=false等を未確認のまま適用しません。既存Secrets、公開VAPID変数、Cronを維持します。

旧アプリの通知操作を止めてから停止版Workerを配備し、別途承認したprotocol 4対応画面へ更新する順序です。旧画面の受信/ACKは409になります。旧WorkerのOFFは未読を削除し得るため移行停止に使いません。旧実行終了と遅延KV書込みの確認まで生成を解禁しません。固定の待機時間だけで完了を保証しません。

問題時は同じDOを保持する互換停止版を使用します。旧Workerへの差戻し・DO削除は行いません。旧KVを削除せず取り込み、保管庫や履歴を初期化しません。既に受理された外部Pushは撤回できません。

## 保護上限・制約

未受領50件、暗号化未受領本文1 MiB、旧本文受領印1000件。満杯時は自動削除せず停止・保留します。混合ACKが受領印上限で拒否された場合、新画面は今回端末へ確実に保存した新DO本文だけを限定して追加ACKします。最後の成功同期から24時間で新規生成を休止し、履歴削除期限にはしません。

8 KiB生成予約、文脈120000 bytes、モデル入力200000 bytes等は補助予算の提案値です。複製バックアップの端末制御IDと古い文脈sequence復元には制約があり、完全な複数端末復旧対応を保証しません。

候補の合成データ・ローカルSQLite・通信モック試験は実施済みです。実Cloudflare migration、実モデル、実Push、実機更新は未検証です。この準備作業では配備も外部送信も実施しません。
