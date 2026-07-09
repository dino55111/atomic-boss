# Discord 揪團報名機器人 — 設計文件

日期：2026-07-09

## 背景與目的

一個 Discord 機器人，讓伺服器成員可以發起「揪團」活動（例如遊戲組隊、練習賽），其他成員可以報名加入，機器人負責管理人數上限與名單，並即時回覆/更新報名狀態。

## 核心情境

- 情境類型：組隊 / 揪團報名（非單純活動報名、非表單資料蒐集）
- 報名觸發方式：按鈕（非 Slash Command、非表情符號反應）
- 揪團建立方式：互動式表單（Modal），由發起人透過 Slash Command 觸發後填寫

## 技術棧

- Node.js + discord.js v14
  - Slash Command（`/揪團`）
  - Modal（建立揪團時填寫標題/人數上限/時間；報名時填寫職業/等級/遊戲ID）
  - Button（報名 / 取消報名）
- 資料儲存：SQLite（`better-sqlite3`），單一 `.db` 檔案，機器人重啟後名單與活動資料不遺失
- 設定：`.env`（`BOT_TOKEN`、`CLIENT_ID`、`GUILD_ID`）

## 資料模型

```sql
CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  message_id    TEXT NOT NULL,   -- 對應揪團公告訊息，用來更新 Embed
  title         TEXT NOT NULL,
  capacity      INTEGER NOT NULL,
  start_time    TEXT NOT NULL,   -- 自由文字，如「7/12 20:00」
  creator_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  user_id       TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  class         TEXT NOT NULL,   -- 職業
  level         TEXT NOT NULL,   -- 等級
  game_id       TEXT NOT NULL,   -- 遊戲 ID
  signed_at     TEXT NOT NULL,
  UNIQUE(event_id, user_id)
);
```

## 互動流程

### 1. 建立揪團

- 任何伺服器成員輸入 `/揪團`
- 彈出 Modal，欄位：標題、人數上限、時間（自由文字）
- 送出後：
  - 於指令所在頻道發布一則 Embed 公告，內容包含標題、時間、目前人數/上限、名單（初始為空）
  - Embed 附「報名」與「取消報名」兩個按鈕
  - 將活動寫入 `events`，`message_id` 記錄該公告訊息 ID

### 2. 報名

- 使用者點擊「報名」按鈕
- 彈出 Modal，欄位：職業、等級、遊戲ID
- 送出後：
  - 若該活動已額滿：ephemeral 回覆「已經額滿了」（正常情況下按鈕應已被禁用，此為保險判斷）
  - 若使用者已報名過：ephemeral 回覆「你已經報名囉」
  - 否則寫入 `signups`，更新原 Embed（人數、名單）
  - 若這次報名讓人數達到上限，將「報名」按鈕改為禁用（disabled）並更新訊息

### 3. 取消報名

- 使用者點擊「取消報名」按鈕
- 若使用者未報名：ephemeral 回覆「你還沒有報名喔」
- 否則從 `signups` 刪除該筆紀錄，更新 Embed（人數、名單）
- 若原本已額滿，取消後名額釋出，重新啟用「報名」按鈕

### 4. 額滿處理

- 人數達上限時，「報名」按鈕自動禁用（disabled=true），避免多餘點擊
- 名額釋出（取消報名）後自動恢復可點擊
- 寫入 `signups` 前以資料庫交易（transaction）重新確認目前人數 < capacity，避免併發報名超收

## 專案結構

```
src/
  index.js                  -- 進入點：登入 Bot、註冊事件監聽、載入指令與互動處理
  commands/
    create-event.js         -- /揪團 指令定義與建立揪團 Modal
  interactions/
    join-modal.js           -- 報名 Modal 提交處理
    signup-button.js        -- 報名 / 取消報名按鈕點擊處理
  db/
    schema.sql               -- 資料表結構
    db.js                    -- better-sqlite3 初始化與查詢函式
  embeds/
    event-embed.js           -- 組出揪團公告 Embed 內容的邏輯
.env.example
package.json
```

## 錯誤處理

- 找不到對應的 `events` 紀錄（訊息仍在但資料庫資料異常）：ephemeral 回覆錯誤訊息，不更新 Embed
- Modal 欄位驗證：人數上限必須為正整數，非數字輸入時 ephemeral 提示重新輸入
- 併發報名造成的額滿競態：以資料庫交易確保不超收，超收時的請求視為「已額滿」處理

## 測試計畫

- 單元測試（Jest）：涵蓋純邏輯部分
  - 額滿判斷（人數 vs 上限）
  - 報名 / 取消報名的名單增減
  - Embed 內容組裝（給定活動與名單，產出正確欄位）
- 手動測試（測試伺服器）：
  - Golden path：建立揪團 → 多人報名 → 額滿 → 按鈕禁用 → 取消一位 → 按鈕恢復
  - 邊界情況：重複報名、取消未報名、人數上限為 1、機器人重啟後資料是否還在

## 待確認事項（已採用預設假設，實作前可再調整）

- **建立揪團權限**：目前假設任何伺服器成員都可以使用 `/揪團`，未限制身分組
- **額滿後的按鈕行為**：假設按鈕直接被禁用（disabled），而非允許點擊後才提示「已滿」
