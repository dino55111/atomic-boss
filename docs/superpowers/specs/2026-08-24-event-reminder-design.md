# 活動開始前提醒（reminder）設計

## 背景與目標

`/揪團` 建立的事件目前只能靠使用者自己記得時間。這次要新增一個自動提醒：活動開始前 60 分鐘，機器人自動在事件的 thread 裡發一則訊息，標記所有已報名的人。

## 需求（已與使用者確認）

- 提醒發在事件的 thread 裡，標記所有已報名的人（真實 Discord 成員 mention，非 Discord 好友用粗體名字列出）。
- 固定提前 60 分鐘發送，不需要建立時可選的 UI。
- 機器人重啟後，只要活動還沒開始，就要補發錯過的提醒。
- 如果到了提醒時點但目前還沒人報名，略過不發。

## 資料模型變更

`events` 表新增一個欄位：

- `reminded_at TEXT`（可為 NULL）：提醒訊息實際發送時的 ISO 時間戳。`NULL` 表示這個事件還沒發過提醒。

比照現有 `migrateSignupsTable`／`migrateEventsTable` 的模式，新增 `migrateRemindersColumn(db)`，在 `initDb` 裡呼叫，對既有的 `data.db` 安全地補上這個欄位（`ALTER TABLE events ADD COLUMN reminded_at TEXT`，允許 NULL，不需要 DEFAULT）。

## 時間解析：從「月/日 時:分」推算實際年份

`start_time` 的格式是 `M/D HH:mm`，沒有年份。要判斷「現在是否已經接近開始時間」，需要把它轉成一個真正的 `Date`。做法：

1. 用現有的 `START_TIME_PATTERN`（`create-event-modal.js` 裡已有）解析出 month/day/hour/minute。
2. 以事件的 `created_at`（建立時的 ISO 時間戳，一定有年份）取得參考年份，組出候選日期 `candidate = new Date(referenceYear, month-1, day, hour, minute)`。
3. 如果 `candidate` 比 `created_at` 早超過 1 天（代表這個場次的月/日在建立年份的脈絡下已經「過去」，例如 12 月建立、選了 1 月的日期），就把候選日期的年份加 1。
4. 回傳 `candidate`。

這段邏輯獨立成 `resolveEventStartDateTime(event)`，放在新檔案 `src/reminders.js`，方便單獨測試邊界情況。

## 排程機制

不引入新的排程套件（`node-cron` 等），維持現有的精簡依賴。在 `src/index.js` 的 `Events.ClientReady` callback 裡，用 `setInterval` 每 1 分鐘呼叫一次 `checkAndSendReminders(client, db)`（來自 `src/reminders.js`）。輪詢間隔設成常數 `REMINDER_POLL_INTERVAL_MS = 60 * 1000`，方便之後調整或在測試裡覆寫。

## 提醒邏輯

`checkAndSendReminders(client, db, now = new Date())`：

1. 用新的 DB helper `getEventsPendingReminder(db)` 撈出所有 `reminded_at IS NULL` 的事件。
2. 對每一個事件，用 `resolveEventStartDateTime(event)` 算出實際開始時間 `startAt`：
   - 若 `startAt <= now`（已經開始或已過），略過（不發、不標記——這種事件已經沒有提醒的意義，之後也永遠不會再符合條件，等於自然放棄）。
   - 若 `startAt - now > 60 分鐘`，還沒到提醒時間，略過。
   - 否則（`now < startAt <= now + 60 分鐘`，這同時涵蓋準時觸發跟 bot 重啟後的補發）：
     - 用 `getSignups(db, event.id)` 撈報名名單。
     - **若名單是空的，略過，且不呼叫 `markEventReminded`**——保留 `reminded_at` 為 NULL，讓之後的輪詢還有機會在有人報名時補發；一旦活動開始，上面的第一條規則會讓它自然不再符合條件，等於放棄。
     - 若名單非空：組訊息、發到 `event.thread_id`（用 `client.channels.fetch`），並用 `markEventReminded(db, event.id, now.toISOString())` 標記已發送。

**錯誤隔離**：每個事件的處理要獨立包在 try/catch 裡（例如 thread 已被刪除、`channels.fetch` 失敗）。單一事件出錯只記錄、略過（不標記 `reminded_at`，下一輪還會重試），不能讓整批輪詢中斷、連累同一輪裡其他該發的事件。`setInterval` 的呼叫端也要包 `.catch()`，避免一次意外的 rejection 讓計時器整個停掉。

**訊息格式**：
```
⏰ 距離「{title}（第{session}場）」開始還有 60 分鐘（{start_time}），已報名的人記得準時出席：{mentions}
```
`mentions` 沿用現有 roster 渲染邏輯的寫法：真實成員 `<@user_id>`，非 Discord 好友用 `**{display_name}**`，並用 `allowedMentions: { users: [...] }` 限定在這些報名者的真實 user_id 上（比照 `join-modal.js`／`signup-button.js`／`assist-signup.js` 已經套用的 mention 範圍限制寫法）。

## 新的 DB 介面（`src/db/db.js`）

- `migrateRemindersColumn(db)`：idempotent migration，在 `initDb` 裡呼叫。
- `getEventsPendingReminder(db)`：`SELECT * FROM events WHERE reminded_at IS NULL`。
- `markEventReminded(db, eventId, remindedAt)`：`UPDATE events SET reminded_at = ? WHERE id = ?`。

## 測試策略

- `resolveEventStartDateTime`：同一年份内的日期、跨年（12 月建立、選 1 月場次）、剛好邊界（候選日期等於 `created_at` 當天）。
- DB 測試：`getEventsPendingReminder` 只回傳 `reminded_at IS NULL` 的事件；`markEventReminded` 正確寫入；migration 對舊表安全補欄位、對新表是 no-op。
- `checkAndSendReminders`：
  - 60 分鐘內、尚未提醒、有人報名 → 發送訊息並標記 `reminded_at`。
  - 距離開始超過 60 分鐘 → 不發送。
  - 已經 `reminded_at` 有值 → 不重複發送。
  - 0 人報名 → 不發送，且 `reminded_at` 維持 NULL。
  - 模擬 bot 重啟補發：`now` 晚於原本該發送的時間點，但活動仍未開始 → 仍然發送。
  - 活動已經開始（`startAt <= now`）→ 不發送，也不標記。
  - 其中一個事件發送時拋出例外（例如 thread 已被刪除）→ 不影響同一輪裡其他該發的事件仍正常收到提醒。

## 涉及的檔案（供 writing-plans 參考）

- `src/db/schema.sql`、`src/db/db.js`：新增欄位、migration、`getEventsPendingReminder`、`markEventReminded`。
- `src/reminders.js`（新檔）：`resolveEventStartDateTime`、`checkAndSendReminders`、`REMINDER_POLL_INTERVAL_MS`。
- `src/index.js`：在 `ClientReady` 裡啟動 `setInterval`。
