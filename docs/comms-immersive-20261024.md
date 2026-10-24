# COMMS全画面表示・開発引き継ぎ

## 実装

COMMSだけをダークな全面表示へ変更。大きなVECTOR見出しと外側のカード枠をなくし、戻る・DIN・メニューのヘッダーへ整理した。DIN横の輪は装飾であり、オンライン・既読・入力中を表さない。他の部屋の見出し・配色・レイアウトは維持。

コピーは常時表示。吹き出しの本文サイズ・行幅・内側余白・コピー配置を維持し、日時だけを控えめな読みやすい色へ変更。入力欄は約78→100 CSS px。元の使用量欄の領域を使い、390×844・模擬安全領域47/34pxでは会話範囲は約584px。

右上は機能するダイアログメニュー。「BACKSTAGEで相談する」への入口、従来のCOMMSトークン数・概算料金を保持した。計算と値の更新方法は変更せず、既存の表示要素を移動。閉じる・Escape・外側タップ、フォーカス復帰に対応。BACKSTAGE移動時は相談入力欄へフォーカスする。

短画面では会話部分をスクロール。モバイルvisualViewport縮小時はCOMMS枠とメニュー高さを縮小し、入力欄と安全領域を確保。キーボード中の入力欄は56〜100pxの範囲で縮小し、写真プレビューも縮める。画像選択はキーボード操作にも対応。送信・画像選択は見た目の寸法を保ったまま44pxの透明な操作範囲を確保した。

キャッシュ名：`vector-v07-comms-immersive-20261024-assets`。

## ローカル検証

架空の会話と通信モックのみ使用。本番送信・通知・実保管庫操作なし。

- `node tests/frontend-polish/comms-immersive.cjs`：320×568、390×844、430×932、390×440、1280×900。メニュー開閉、Tab/Escape/外側クリック、フォーカス復帰、BACKSTAGE/HERE/HOMEの導線、料金値、空送信の非送信、画像選択、長文下書き、モバイル330px visualViewport縮小と復帰、合成画像の添付/削除と添付中の入力欄・メニューの収まり。
- `node tests/frontend-polish/comms-compact.cjs`：5幅、両話者、長文・改行、コピー44px、本文との非重複、横溢れなし。
- `node tests/frontend-polish/copy.cjs`：3幅・3部屋、成功/拒否/APIなし、キーボード、繰返し移動、コピー中移動、下書き保持。
- `node tests/frontend-polish/palette.cjs`：HEREのC配色4種。
- `node tests/vector-continuity/context.cjs`：共有文脈11件。
- `node tests/vector-notifications/durable-state.cjs`：保存順序、設定、入力中、lock、失敗/retry/restart。
- `node tests/vector-candidate/cache.test.cjs`：アセット更新、オフライン、保管庫への非アクセス。
- `node tests/vector-vault/ui.cjs`：4画面サイズの新規/解除/lock/暗号化バックアップ・復元をローカル架空データで確認。
- `node --check app.js`、`node --check sw.js`、`git diff --check`。

## 配信・実機確認の境界

リポジトリへの反映とPages実配信は別。実行環境の公開GETは以前403拒否、Actions/statusも拒否されているため、この変更では同じ経路を再試行しない。配信完了は別途実機確認が必要。実iPhone/WebKitのキーボード・安全領域・写真選択・クリップボードは未検証。短い画面でも長いメニューは内部スクロール可能。

Worker・Cloudflare・通知設定・RP処理・履歴/暗号化保存・料金計算は変更しない。遅延返信、保存場所移行、Google連携は含まない。戻す場合はこの画面変更だけをrevertし、アセットキャッシュ名を更新する。サイトデータ削除や再インストールは行わない。
