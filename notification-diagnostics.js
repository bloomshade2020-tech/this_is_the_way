/* Read-only display. Unknown fields never become user-visible raw strings. */
(function(root){
'use strict';
const reasons={
 'rollout-stop':'保守モードのため見送り','off':'通知OFFのため見送り','context-unavailable':'必要な同期内容が未受理のため見送り','legacy-blocked':'旧通知の確認待ち',
 'subscription-unavailable':'Push購読がないため見送り','context-expired':'同期内容の有効期限切れ','cooldown':'前回の本文保存から3時間未満のため見送り',
 'slot-already-checked':'この時間枠は処理済み','job-present':'既存の処理が残っているため見送り','capacity':'保存容量の上限で見送り',
 'awaiting-received-context':'受領した通知の文脈同期待ち','context-payload-too-large':'判定に渡す内容の上限超過','state-changed':'処理中に条件が変わったため中止',
 'model-declined':'AIが送信を選ばなかった（個別の理由は記録されません）','invalid-decision':'AIの判定形式が不正。送信なし',
 'model-outcome-unknown':'AI処理の結果不明。自動再送なし','push-preparation-failed':'本文保存後、Push準備に失敗',
 'push-outcome-unknown':'本文保存後、Push結果不明。自動再送なし','push-failed':'本文保存後、Push事業者が拒否',
 'evaluation-error':'通知処理でエラー（詳細本文は記録しません）','export-error':'共通ログへの書き出し処理でエラー（確定件数を参照）'
};
const outcomes={running:'処理中、または中断して結果未記録',skipped:'見送り（理由未記録）',saved:'本文保存済み。Push結果は未記録',accepted:'Push事業者が受付済み（iPhoneへの表示は未確認）',rejected:'Push事業者が拒否',unknown:'結果不明',error:'エラー（詳細未記録）',disabled:'書き出し条件未成立（詳細未記録）',idle:'書き出し待ちなし',confirmed:'Google書き出し確認済み'};
const stages={activation:'接続条件の確認',eligibility:'通知条件の確認',context:'同期内容の準備',model:'AI判定',persist:'本文保存', 'push-preparation':'Push準備',push:'Push送信',export:'Google書き出し'};
const pauses={...reasons,ready:'休止の記録なし（毎時送信ではありません）','migration-stop':'保守のため停止中','push-test-only':'テスト専用モード','legacy-review-required':'旧通知の確認待ち','update-required':'更新が必要'};
const lookup=(map,key)=>Object.hasOwn(map,key)?map[key]:null;
function time(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))return '記録なし／不明';return new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false})+' JST';}
function format(d){
 if(d?.version!==1)return '通知診断は未対応です。対応するアプリとWorkerの更新が必要です。';
 const lines=['確認時点：'+time(d.observedAt),'最後の同期受理：'+time(d.acceptedAt)+'（通知の判定・配信時刻ではありません）'];
 lines.push('通知設定：'+(d.enabled===true?'ON':d.enabled===false?'OFF':'不明')+'。保存済み休止状態：'+(lookup(pauses,d.pauseReason)||'不明'));
 const e=d.records?.evaluation;
 if(!e)lines.push('最後の通知処理：記録なし／不明。診断追加前の結果は復元できません。');
 else {lines.push('最後の通知処理：'+time(e.startedAt)+'（対象時刻：'+time(e.scheduledAt)+'）','この処理のAI判定開始：'+time(e.modelStartedAt),'段階：'+(lookup(stages,e.stage)||'不明'),'結果：'+(lookup(reasons,e.reason)||lookup(outcomes,e.outcome)||'不明'));}
 if(d.records?.state!=='available')lines.push('診断記録を取得できません。');
 const x=d.records?.export;
 lines.push('最後の書き出し確認：'+(x?time(x.updatedAt)+'・'+(lookup(reasons,x.reason)||lookup(outcomes,x.outcome)||'不明'):'記録なし／不明'));
 const log=d.sharedLog,valid=n=>Number.isSafeInteger(n)&&n>=0;
 if(log?.state==='available'&&['pending','unknown','confirmed','other'].every(k=>valid(log[k])))lines.push('サーバー生成分の共通ログ：待機 '+log.pending+'件／結果未確認 '+log.unknown+'件／確認済み '+log.confirmed+'件'+(log.other?'／分類不明 '+log.other+'件':'')+'。端末から送った通常会話はこの件数に含みません。');
 else lines.push('サーバー生成分の共通ログ件数：不明。');
 lines.push('この確認操作は通知の生成・送信・再送・同期を行いません。');
 return lines.join('\n');
}
root.VectorNotificationDiagnostics={format};if(typeof module!=='undefined')module.exports=root.VectorNotificationDiagnostics;
})(typeof window==='undefined'?globalThis:window);
