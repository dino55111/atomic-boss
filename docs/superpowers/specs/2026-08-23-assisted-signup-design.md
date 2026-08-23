# 協助他人報名（代報名）設計

## 背景與目標

目前 `/揪團` 機器人只支援自己幫自己報名（點「報名」→ 選職業 → 填等級／遊戲 ID／備註）。這次要新增「代報名」功能，讓使用者可以：

1. 代替**伺服器裡的其他 Discord 成員**報名（該成員之後可自行取消）。
2. 代替**沒有 Discord 帳號的朋友**報名（手動輸入暱稱等資料，因為沒有帳號可以 mention）。

兩種情境都要支援。

## 資料模型變更

`signups` 資料表新增兩個欄位：

- `added_by_user_id TEXT`（可為 NULL）：代報名者的 Discord user ID。自己報名時為 `NULL`。
- `is_external INTEGER NOT NULL DEFAULT 0`：`1` 表示這是「沒有 Discord 帳號的朋友」的報名紀錄。

**非 Discord 好友的 `user_id`**：`signups.user_id` 欄位維持現有的 `NOT NULL` 且 `UNIQUE(event_id, user_id)` 限制不變（不動既有欄位以降低風險）。因此每筆非 Discord 好友的報名會產生一組隨機的合成 ID（例如 `ext:<uuid>`），保證不會跟真實 Discord snowflake 或其他 external 紀錄撞號。`display_name` 存代報名者輸入的暱稱；畫面上這種紀錄一律用**粗體暱稱**取代 `<@user_id>` mention（因為沒有真實帳號可以 tag）。

**Migration**：正式環境的 `data.db` 已經有既有的 `signups` 表，`CREATE TABLE IF NOT EXISTS` 不會幫既有的表補欄位。`initDb` 在執行完 `schema.sql` 後，另外跑一段小型、可重複執行（idempotent）的 migration：讀 `PRAGMA table_info(signups)`，對缺少的欄位執行 `ALTER TABLE signups ADD COLUMN ...`。每次啟動都安全執行，對全新的記憶體測試 DB 跟既有的正式 `data.db` 都適用。

## UX 流程

事件 embed 的 action row 新增一顆**「代報名」**按鈕（`assist:{eventId}`），跟「報名」按鈕一樣在額滿時停用。

### 流程 A：代替伺服器成員報名

1. 點「代報名」→ ephemeral 回覆兩個元件：一個 `UserSelectMenu`（`assist-user-select:{eventId}`，選單提示「選擇伺服器成員」）+ 一顆按鈕「好友沒有 Discord 帳號」（`assist-external:{eventId}`）。
2. 選好成員 → 用 `interaction.update()` 把同一則訊息換成跟現有報名流程相同的 12 個職業按鈕格（`assist-class-choice:{eventId}:{targetUserId}:{className}`）。
3. 點職業 → 開啟跟現有 `join-modal` 一樣的 3 欄位彈窗（等級／遊戲 ID／備註），`customId` 為 `assist-join-modal:{eventId}:{targetUserId}:{className}`。
4. 提交 → 用 `interaction.client.users.fetch(targetUserId)` 取得目標的 Discord username 當 `display_name`，寫入報名紀錄：`user_id = targetUserId`、`added_by_user_id = 代報名者`、`is_external = 0`。重複報名／額滿的行為跟現有自行報名邏輯一致（重複時沿用現有慣例靜默略過，不額外提示）。

### 流程 B：代替沒有 Discord 帳號的朋友報名

1. 點「代報名」→ 跟流程 A 相同的 ephemeral 選擇畫面。
2. 點「好友沒有 Discord 帳號」→ 同樣用 `interaction.update()` 換成職業按鈕格（`assist-class-choice:{eventId}:external:{className}`）。
3. 點職業 → 開啟 4 欄位彈窗：暱稱／等級／遊戲 ID／備註（`customId` 為 `assist-join-modal:{eventId}:external:{className}`）。
4. 提交 → 寫入報名紀錄：`user_id = ext:<uuid>`、`display_name = 輸入的暱稱`、`added_by_user_id = 代報名者`、`is_external = 1`。

兩條路徑在 modal 提交時都沿用現有的 `tryAcknowledgeAndDeleteReply` 模式，跟現有報名流程一樣會清掉中間的 ephemeral 選擇畫面。

## 名單與頻道訊息顯示

**Roster embed（`buildEventEmbed`）**：

- 自行報名（不變）：`1. <@user_id>（職業：X／等級：Y／ID：Z／備註：N）`
- 代替真實成員報名：`2. <@user_id>（職業：X／等級：Y／ID：Z／備註：N／代報名：<@helper_id>）`
- 代替非 Discord 好友報名：`3. **暱稱**（職業：X／等級：Y／ID：Z／備註：N／代報名：<@helper_id>）`

**頻道（thread）訊息**：

- 報名：自行報名維持 `<@user_id> 已報名（...）` 不變；代報名的話在後面加上「，由 <@helper_id> 代為報名」；非 Discord 好友用 `**暱稱**` 取代 mention。
- 取消：自己取消自己的報名維持 `<@user_id> 已取消報名` 不變；只要「取消動作的人」不是「被取消報名的人本人」，就加上「（由 <@canceler_id> 代為取消）」——這涵蓋了代報名者取消自己代報名的紀錄、以及發起人取消非 Discord 好友紀錄這兩種情境。

## 取消報名

沿用現有的「取消報名」按鈕，不新增按鈕，但取消邏輯擴充如下：

1. 點擊時，先列出該使用者「有權取消」的所有報名紀錄：
   - `user_id` 等於自己的紀錄（涵蓋自行報名、以及代報名者幫真實成員報名後、該成員自己來取消的情況）；
   - `added_by_user_id` 等於自己的紀錄（代報名者取消自己代報名的任何紀錄，不分是否為 external）；
   - 若自己是該揪團的發起人（`creator_id`）：所有 `is_external = 1` 的紀錄，不論是誰代報名的。

   同一筆紀錄可能同時符合多條規則（例如代報名者把自己也選成代報名對象），依資料列的 primary key 去重，不會在候選清單中重複出現。
2. **0 筆符合** → 跟現在一樣靜默無反應（`deferUpdate` 後結束）。
3. **1 筆符合** → 直接取消，行為與現在完全相同（改用新增的 `removeSignupById`，以資料列的 primary key 取代 `user_id` 當刪除依據，因為 external 紀錄沒有代報名者知道的 `user_id`）。
4. **多筆符合** → ephemeral 回覆一排按鈕，每個候選一顆，label 顯示報名者名稱（＋職業），`customId` 為 `cancel-select:{eventId}:{signupId}`。點其中一顆才真正取消那一筆，沿用現有的 embed／thread 更新邏輯。

一般情況（只有一筆自己的報名）行為與現在完全一致，只有在使用者真的有多筆可取消的紀錄時才會多一層選擇。

## 涉及的檔案（實作階段細節，供 writing-plans 參考）

- `src/db/schema.sql`、`src/db/db.js`：migration、`addSignup`/`removeSignup` 擴充、新增 `removeSignupById`、`getSignupById`。
- `src/embeds/event-embed.js`：roster 顯示邏輯、`buildActionRow` 新增「代報名」按鈕。
- `src/interactions/assist-signup.js`（新檔）：代報名的按鈕／select menu／modal 建構與 handler。
- `src/interactions/signup-button.js`：`handleCancelButton` 擴充多筆候選邏輯，新增 `handleCancelSelectButton`。
- `src/interactions/join-modal.js`：頻道訊息文字的共用邏輯（若有需要抽出共用 helper）。
- `src/interaction-router.js`：新增 `isUserSelectMenu()` 分支，以及新的 button／modal customId 前綴路由。
