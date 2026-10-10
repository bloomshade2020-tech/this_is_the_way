# DIN // COMMS v0.5 — API試験用

この版は既存の **v0.4を土台にした追加機能** です。Gmailの通信受信、ChatGPTへの既存返信リンク、ロック画面などは残しています。

## 重要：公開GitHubでの安全性
- **公開GitHubへアップロードするのは `index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `README.md` の6ファイルだけ**。
- `cloudflare-worker.js` はCloudflare Workersエディタに貼り付けるための別ファイル（公開リポジトリへ置く必要なし）。ソースだけなら公開されても秘密はありませんが、Secretsは必ずCloudflareの設定で別管理してください。
- APIキー `OPENAI_API_KEY` は**絶対に** HTML、JavaScript、GitHub、ChatGPT会話、ブラウザの保存領域に入れないこと。
- `DIN_ACCESS_TOKEN` もCloudflareのSecretに設定。アプリの初回送信時にだけ入力し、アプリは保存しません。24文字以上、できれば32文字以上のランダム値にする。
- CORS制限だけではAPIの保護になりません。秘密のアクセストークンも必要です。
- 現在は個人テスト用のアクセス管理です。本格運用ではCloudflare Access等、より強い認証とサーバー側の課金上限を実装する必要があります。
- ChatGPTの既存RPや資料は**自動で同期されません**。API試験は完全に別の履歴です。

## まず動かす（Windowsでも可能）

### 1. OpenAI側
1. https://platform.openai.com/ で開発者向けのAPI利用登録・支払い設定をする。ChatGPT Plusとは別料金。
2. 必要なら少額の初期クレジットを入れ、予算通知を設定する。**月額予算はソフト上限の場合があり自動停止保証はない**。自動チャージはまずOFF推奨。
3. APIキーを作る。画面に表示されたキーは誰にも渡さない。

### 2. Cloudflare Workers（無料枠から開始できる）
1. https://dash.cloudflare.com/ を開きアカウント登録。
2. `Workers & Pages` → `Create` → Workerを作成。例 `din-comms-api`。
3. Workerのエディタで `cloudflare-worker.js` 全文を貼って Deploy。
4. Workerの `Settings` → `Variables and Secrets` で以下を **Secret** として登録してデプロイ。
   - `OPENAI_API_KEY` : OpenAI APIキー
   - `DIN_ACCESS_TOKEN` : 自分で生成した32文字以上のランダムな英数字
5. `https://din-comms-api.<自分のサブドメイン>.workers.dev` 形式のURLを控える（キーは付けない）。

### 3. DIN COMMS（GitHub Pages）
1. 念のためアプリ設定 → JSON書き出しで既存の通信履歴をバックアップ。
2. このZIP内の上記6ファイルだけをGitHubの `this_is_the_way` へ上書きアップロードし、Pagesの更新を待つ。
3. iPhoneのDIN COMMS → 通信 → **API試験を開く** → 設定。
4. Worker URLを貼り付け、`ディンの設定・引き継ぎ・現在地` に必要なプロジェクト指示・資料を貼る。ここはiPhone端末のローカル領域に保存され、GitHubリポジトリには送信されない（API呼び出しのたびにOpenAIへ渡る）。
5. テスト文を入力して送信。初回だけ `DIN_ACCESS_TOKEN` を要求される。同じ値を入力。
6. API版ディンからの返答が右ではなく**左の吹き出し**に表示される。本編とは別履歴で、オリジナルのChatGPT側に影響しない。

## 試作の仕様
- モデル：`gpt-6-sol` 固定（本格RP向けの品質検証を優先）。低コストの `gpt-6-luna` に変更したいならWorkerの `MODEL` だけ差し替える。
- 1回につき最大出力2,200 tokens。前の12メッセージまでを履歴として送信。
- 端末側は1日20送信で停止（**費用の強制上限ではない**）。API支出を完全に止める仕組みではない。
- 使用トークン数と概算料金を画面に表示。金額は実請求額と異なる可能性あり。
- `store:false` を設定。アプリの送受信履歴はiPhoneのlocalStorage。ブラウザのサイトデータ削除で消えるため、本格移行前にバックアップを。
- ここでのRPは本編の正式な採用枝と無関係。後から引き継ぐ場合は本人の明示的な採用判断が必要。
- Google/Gmail認証や通知タスクは変更しない。

### よくあるエラー
- `DIN_ACCESS_TOKENが違います`：Cloudflareで作ったSecretとアプリで入力した文字列が違う。再起動して入力し直す。
- `OpenAI APIキーが正しくありません`：Cloudflareの `OPENAI_API_KEY` Secretを確認。キーをChatGPTに送らない。
- `APIの利用制限または残高`：OpenAIの支払い・クレジット・モデル権限・rate limitsを確認。
- `Failed to fetch`：Worker URL、Cloudflareのデプロイ、CORS Origin を確認。GitHub Pagesの起点が変更された場合はWorkerの ALLOWED_ORIGIN を更新。
