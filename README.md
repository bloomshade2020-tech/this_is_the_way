# DIN COMMS v0.5.1 — encrypted vault / Gmail importer removal

個人用の **UI・API試験** バージョンです。旧ChatGPT側のRP履歴や通知タスクは一切変更しません。

## この版で変わること

- **Gmail受信機能を完全に撤去**：Google Identity Servicesの読み込み・Gmail APIへの通信・認証UI・Google OAuthクライアントIDの保存がなくなります。すでに取得済みの通信原文は「過去の通信アーカイブ」として残します。
- **端末内の保存データを暗号化**：初回に独立したパスフレーズを登録し、PBKDF2-SHA256（310,000回）とAES-256-GCM（Web Crypto API）で暗号化して保存します。パスフレーズはネット送信せず、保存もしません。
- **旧版からの移行**：旧 `din-terminal-v01` の平文データを読み、暗号化・復号照合・保存確認を済ませた後だけ旧データを削除します。Google OAuthクライアントIDは引き継ぎません。
- **暗号化バックアップ**：設定から保存できます。復元は起動時の保管庫画面から。復元には元のパスフレーズが必要です。
- **サードパーティスクリプト不使用・CSP制限**：アプリの JavaScript は同梱の `app.js` と `vault.js` のみ。Google SDKを読み込まず、機密文章をURLへ埋め込む非公式の入力済みリンクも撤去しました。ブラウザの `connect-src` は現在のCloudflare Workerと同一サイトに限定しています。
- **OpenAI APIは従来どおり**：Workerでシークレット管理し、API試験画面から送受信します。Workerは今回変更不要です。

## GitHub Pagesへの更新

この ZIP にある **8ファイル** を展開し、GitHubの `this_is_the_way` リポジトリの最上位へ一括上書きしてください（フォルダーそのものはアップロードしない）。`index.html`、`app.js`、`vault.js`、`sw.js`、`manifest.webmanifest`、アイコン2枚、`README.md` です。

**重要：iPhoneで更新する前に**、旧版の「設定 → JSON書き出し」で必要ならバックアップしてください。旧版のバックアップは**平文**なので、保管・共有に注意。移行確認後は端末内の不要な平文ファイルを削除してください。

GitHub Pagesへ反映後、ホーム画面のDIN COMMSを完全終了し、再度起動。古い画面が残る場合はSafariで同じURLを開いて更新を確認してから再起動してください。

最初の起動時に「旧データを暗号化して移行」と表示されます。**12文字以上の、Cloudflareの認証トークンとは別のパスフレーズ**を設定し、必ずパスワードマネージャー等に控えてください。成功後は旧履歴とAPI Worker URLが引き継がれます。

移行直後に旧通信履歴・APIテスト履歴・指示欄の内容を確認。**設定 → 暗号化バックアップ**で新しい暗号化版を保存します。ZIPやGitHubにこのバックアップをアップロードしないでください。

## GmailのGoogle側の許可は別途解除する

アプリのGmailコードを削除しても、以前Google Cloudで作ったOAuthクライアントやGoogleアカウントの第三者アクセス許可は**自動削除されません**。切替が完了したら、Googleアカウントの「サードパーティとの接続」（myaccount.google.com/connections）から不要になった `DIN COMMS` のアクセスを削除してください。Google CloudのOAuthクライアントも使わなければ削除可能です。既存のChatGPTとGmailの接続を解除する必要はありません。

## 現実的なセキュリティの限界

- **暗号化は保存中のデータの保護です**。解除後はJavaScriptのメモリやDOMに平文が存在します。改ざんされたGitHub公開コード、同一オリジンの悪質ページ、端末の侵害などに対して万能ではありません。公開GitHub Pagesには人格ファイルやRP原文、秘密鍵をコミットしないでください。
- GitHub Pagesは同一アカウントの他のリポジトリのPagesとオリジンを共有する場合があります。非常に機密性が高い場合は、**専用ドメインの分離と厳格なHTTP CSP**を検討してください。
- APIへ送った入力・指示はCloudflare Workerを経由してOpenAI側に送信されます。現在のWorkerは保存DBを持たず、API `store:false` ですが、OpenAIの不正利用監視などの保持ポリシーは別です。
- Workerの `DIN_ACCESS_TOKEN` は**32文字以上の強い秘密**を継続使用してください。Worker URLやCORSだけでは認証になりません。
- **厳密なサーバー側のAPI料金上限・レート制限は未実装**です。OpenAI側の支払い設定、使用量確認、必要に応じCloudflare側レート制限の導入を続けてください。UIの1日20回上限は端末側だけの制限です。
- 保存データにパスフレーズ回復機能はありません。紛失すると**暗号化データの復元は原則できません**。バックアップとパスフレーズを別々に安全保管してください。
- 今回のテストはJavaScriptの構文・暗号化保管庫の作成/復号/移行/再保存の模擬実行と、HTML内の参照要素の静的検査です。**iPhoneのSafari・ホーム画面からの実機試験はまだです**。

## GitHubリポジトリのファイル一覧

- `index.html` — UI、CSP
- `app.js` — 表示・会話・API試験
- `vault.js` — AES-GCM暗号化保管庫・移行・復元
- `sw.js` — オフラインUIキャッシュ（v0.5.1）
- `manifest.webmanifest` — ホーム画面用PWA設定
- `icon-192.png`, `icon-512.png` — アイコン
- `README.md` — 本文書
