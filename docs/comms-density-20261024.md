# COMMS余白の最終調整

基準：`95f8ccc12c31d630e0fce5aaa3cda555ea57206f`。

承認された見本に合わせ、COMMSだけ発言間12→4px、話者ラベルと本文の間6→4px、日付上下11/18→4/8px、会話リスト上下19/15→10/10pxへ調整した。

コピー行の上marginは-8px。最初の密度見本の-12pxから4px下げた最終見本と同じで、従来公開版からコピー自体を追加で4px下げる変更ではない。44px操作範囲、常時表示、吹き出し・本文・入力欄の寸法、料金メニュー、その他の部屋は維持する。アプリのJavaScript、HTML、保存・通信処理は変更しない。

アセットキャッシュ：`vector-v07-comms-density-20261024-assets`。

ローカル検証（架空データ・通信モックのみ）：

- `node tests/frontend-polish/comms-compact.cjs`：5幅、短文/長文/日付跨ぎ、指定余白、44px、本文と次の発言への非重複、横溢れなし。
- `node tests/frontend-polish/comms-immersive.cjs`：5画面サイズと330px模擬visualViewport、メニュー/フォーカス/Escape/外側クリック/BACKSTAGE、料金、入力/写真、空送信非送信。
- `node tests/frontend-polish/copy.cjs`：3幅・3部屋、成功/拒否/APIなし、キーボード、繰返し移動、下書き保持。
- `node tests/frontend-polish/palette.cjs`：HERE C配色4種。
- `node tests/vector-candidate/cache.test.cjs`、`node --check sw.js`、`git diff --check`。

配信状態：main反映とPages実配信は別途確認する。既に拒否された公開GET・Actions/status経路は再試行しないため、この環境からの配信完了確認は未実施。実iPhoneの表示・コピー位置の最終確認が残る。戻す場合はこの余白差分のみをrevertし、アセットキャッシュ名を更新する。サイトデータや履歴は削除しない。
