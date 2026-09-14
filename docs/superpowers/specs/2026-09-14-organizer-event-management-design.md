# 團主管理揪團（改時間／取消揪團）設計

## 背景與目標

揪團建立後，`events` 表裡的 `start_time`、`capacity`、`session`、`title` 完全沒有任何異動流程；開團主（下稱團主）除了能取消外部代報名者之外，沒有其他管理權限。這次新增兩個團主專屬的操作：

- 改時間：修正打錯的時間，或延後/提前開團。
- 取消揪團：團主直接關閉整個揪團。

場次、頭銜/王不開放編輯；取消後不可復原、不保留可還原的狀態。

## 需求（已與使用者確認）

- 可編輯欄位僅 `start_time`；另外提供「取消整個揪團」。
- 觸發方式：報名卡按鈕，不做 slash 指令。
- 按鈕人人可見（Discord 單一訊息的元件無法依觀看者顯示不同內容），權限檢查放在點擊當下——非團主點擊得到 ephemeral「只有團主能操作」提示，不執行任何動作。
- 取消揪團是「立即整個刪掉」公告訊息與討論串，跟現有 `cleanup.js` 活動結束後的清理行為一致；不做「標記已取消但保留訊息」的折衷方案。

## UI／按鈕配置

報名卡的元件從一列擴充為兩列：

```
第 1 列（不變）：[報名] [代報名] [取消報名]
第 2 列（新增）：[⏰ 改時間] [🗑️ 取消揪團]
```

`src/embeds/event-embed.js` 新增 `buildManagementRow(eventId)`，回傳第 2 列的 `ActionRowBuilder`。`buildActionRow`（第 1 列）維持原簽章與行為不變，避免動到既有測試。三個組裝訊息 payload 的地方都改成兩列：

- `src/interactions/create-event-modal.js`：公告訊息、討論串副本各送一次。
- `src/embeds/event-embed.js` 的 `updateEventAnnouncement`：兩個地方（公告、討論串副本）都editing 用兩列。

customId 慣例延續現有風格（`動作:eventId` 或 `動作:eventId:...`）：

- `edit-time:<eventId>`
- `cancel-event:<eventId>`
- `cancel-event-confirm:<eventId>`
- `cancel-event-abort`（不需要 eventId，純粹取消確認框）

## 權限檢查

新增共用小函式（放在新檔案，見下方「涉及的檔案」），供改時間、取消揪團兩個入口共用：

```js
function requireCreator(interaction, event) {
  if (interaction.user.id !== event.creator_id) {
    // ephemeral reply「只有團主能操作」，回傳 false
  }
  // 回傳 true
}
```

事件已被刪除（`getEventById` 回傳 undefined，比照 `handleCancelButton` 現有的處理）時，同樣 ephemeral 提示「找不到這個揪團，可能已經被刪除了」。

## 改時間流程

1. 團主點 `⏰ 改時間` → 權限檢查 → 通過則 `interaction.showModal(...)`，彈出跟建立揪團同款的日期/時/分下拉選單 modal（customId `edit-time-modal:<eventId>`）。
2. 下拉選單的選項邏輯（未來 7 天日期、00-23 時、10 分鐘一格的分鐘）直接重用 `title-choice-button.js` 現有的 `buildDateOptions`／`HOUR_OPTIONS`／`MINUTE_OPTIONS`，該檔案把這三者加進 `module.exports`。預設值盡量帶入目前的 `start_time`：時、分若能在選項清單裡找到對應值就設為 `default: true`；日期如果落在未來 7 天視窗內比照辦理，超出視窗（例如原時間已經是視窗外的舊資料）就沿用建立流程原本的行為，預設選到「今天」——這是既有 UI 本來就有的視窗限制，不是這次新增的問題。
3. Modal 送出後，先用 `tryAcknowledgeAndDeleteReply`（`ack.js` 既有，`create-event-modal.js` 已在用同樣的理由）立刻 ack 掉這個 interaction——後面要依序更新 DB、編輯兩則訊息、重新命名討論串、發送通知，多個 await 疊起來很容易超過 Discord 的 3 秒 ack 期限，而且這些動作都不依賴這個 interaction 的 token，沒必要跟它綁在一起。
4. 用既有的 `isValidStartTime`（`create-event-modal.js` 已匯出）驗證組合出的 `M/D HH:mm` 字串。格式錯誤：`acked` 為真才 `followUp` ephemeral 提示重新操作（比照 `handleCreateEventModal` 對 ack 失敗時的處理），事件不變動。
5. 驗證通過：
   - DB `UPDATE events SET start_time = ?, reminded_at = NULL WHERE id = ?`（新增 db helper `updateEventStartTime(db, eventId, startTime)`）。把 `reminded_at` 重設為 `NULL` 是關鍵：如果團主把時間延後，提醒系統要能針對新時間重新判斷、重新發送一次「開始前 60 分鐘」提醒；不重設的話，提醒已經發過就永遠不會再發。
   - 呼叫 `updateEventAnnouncement` 重新渲染公告與討論串副本的 embed（時間欄位會自動反映新值）。
   - 討論串 `setName` 成新的 `${startTime} ${title} ${session}場`（沿用建立時的命名邏輯，`.slice(0, 100)` 保險）。
   - 在討論串發一則訊息：`⏰ 開團時間已改為 {start_time}，已報名的人請留意：{mentions}`，mention 組法與範圍限制沿用 `reminders.js` 的 `buildMentionSegment` 寫法（真實成員 `<@id>`、外部好友 `**暱稱**`，`allowedMentions.users` 限定在真實報名者 id）。
   - 若 `acked` 為真，`followUp({ content: '已更新時間', ephemeral: true })`；`acked` 為假就略過（沒有可用的 interaction token 可以回覆，但上面的異動已經完成，不受影響）。

## 取消揪團流程

1. 團主點 `🗑️ 取消揪團` → 權限檢查 → 通過則 ephemeral 回覆二次確認：「確定要取消整個揪團嗎？此動作無法復原」，附 `cancel-event-confirm:<eventId>`（Danger 樣式，「確定取消」）與 `cancel-event-abort`（Secondary，「算了」）兩顆按鈕。
2. 點「算了」：`interaction.update({ content: '已取消操作', components: [] })`，不做其他事。
3. 點「確定取消」：
   - 先 `interaction.update({ content: '正在取消揪團…', components: [] })` 立刻 ack 掉這個 interaction——`interaction.update` 本身就是對按鈕互動的 ack，接下來刪訊息、刪討論串、寫 DB 這幾步不需要（也不應該）再依賴同一個 interaction 的回覆。
   - 重新用 `getEventById` 撈一次事件（防止確認框開著的期間事件已經被清掉），事件不存在就到此結束（上一步的訊息已經表明操作中，這裡不用再額外回覆）。
   - 在討論串發訊息：`本次揪團已由團主取消`，mention 所有已報名者（寫法同改時間流程），**在刪除訊息／討論串之前**送出，否則討論串沒了就沒地方通知。
   - 依序刪除公告訊息、討論串，重用 `cleanup.js` 的 `deleteIfPresent`（訊息/討論串已經不存在也視為成功，不拋錯）。
   - DB 把 `cleaned_at`、`reminded_at`（若還是 NULL）都標記為現在，重用既有的 `markEventCleaned`；`reminded_at` 一併標記是為了避免背景的 `checkAndSendReminders` 在訊息/討論串都已經被刪除的空窗期還嘗試發送提醒、只換來一次可忽略但會被記錄的錯誤 log。不新增資料表欄位，「取消」在資料模型上就是「提早發生的清理」。

## 資料模型變更

不新增欄位。`start_time` 直接更新；「取消」沿用既有的 `cleaned_at` / `reminded_at` 語意。

新增 db helper（`src/db/db.js`）：

- `updateEventStartTime(db, eventId, startTime)`：同時把 `start_time` 設為新值、`reminded_at` 設回 `NULL`。

`markEventCleaned`、`markEventReminded` 都已存在，取消流程直接重用，不用新增。

## 錯誤處理

- 找不到事件（已被刪除/清理）：兩個入口一開始都先 `getEventById` 檢查，ephemeral 提示，不繼續。
- 非團主點擊：ephemeral 提示，不執行、不洩漏其他資訊。
- 改時間格式錯誤：ephemeral 提示格式，事件本身不變動（沿用 `isValidStartTime` 判斷順序，跟建立流程一樣「先驗證再寫 DB」）。
- 討論串或公告訊息已經被人手動刪除：改時間走 `updateEventAnnouncement` 既有的 `editIfPresent`（已處理 Unknown Message／Unknown Channel）；取消揪團走 `deleteIfPresent`，兩者都不因為訊息已經不在了而整個操作失敗。

## 測試策略

- `requireCreator`（或等價的權限檢查函式）：團主通過、非團主被拒且收到 ephemeral 提示、事件不存在時的處理。
- `buildManagementRow`：兩顆按鈕的 customId、label 正確。
- 改時間 modal 建構：日期/時/分選項沿用 `buildDateOptions`／`HOUR_OPTIONS`／`MINUTE_OPTIONS`；能用現有 `start_time` 正確標出 `default` 選項（含「原時間不在未來 7 天視窗內」的 fallback 情境）。
- `updateEventStartTime`：`start_time` 與 `reminded_at`（重設為 NULL）都正確寫入。
- 改時間送出流程（整合）：格式錯誤時不寫 DB、不更新公告；格式正確時 DB、公告 embed、討論串名稱、討論串通知訊息都正確更新；`reminded_at` 確實被清成 NULL。
- 取消揪團流程（整合）：
  - 二次確認「算了」不刪除任何東西。
  - 「確定取消」依序發通知、刪除公告訊息與討論串、標記 `cleaned_at`／`reminded_at`。
  - 訊息或討論串已經被手動刪除時，走 `deleteIfPresent` 不拋錯，流程仍正常結束。
  - 非團主點擊改時間／取消揪團按鈕：都被擋下、ephemeral 提示、DB 完全不變。

## 涉及的檔案（供 writing-plans 參考）

- `src/interactions/manage-event.js`（新檔）：`requireCreator`、`buildEditTimeModal`、`handleEditTimeButton`、`handleEditTimeModal`、`handleCancelEventButton`、`handleCancelEventConfirmButton`、`handleCancelEventAbortButton`。
- `src/interactions/title-choice-button.js`：把 `buildDateOptions`、`HOUR_OPTIONS`、`MINUTE_OPTIONS` 加進 `module.exports`，供改時間 modal 重用。
- `src/embeds/event-embed.js`：新增 `buildManagementRow(eventId)`；`updateEventAnnouncement` 與其呼叫端的 payload 改成兩列 components。
- `src/interactions/create-event-modal.js`：訊息與討論串副本的 `components` 改成兩列。
- `src/db/db.js`：新增 `updateEventStartTime(db, eventId, startTime)`。
- `src/interaction-router.js`：註冊 `edit-time`、`cancel-event`、`cancel-event-confirm`、`cancel-event-abort` 按鈕與 `edit-time-modal:` modal submit 的路由。
