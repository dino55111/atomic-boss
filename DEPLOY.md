# 部署到 Fly.io

專案已經準備好 `Dockerfile`、`.dockerignore`、`fly.toml`。等你辦好 Fly.io 帳號後，照下面步驟做即可。

## 前置需求

- 已註冊 Fly.io 帳號並綁定信用卡（免費額度通常夠這種輕量 bot 用，不會實際扣款，但帳號驗證需要）
- 安裝 flyctl：`brew install flyctl`（Mac）或參考 [官方安裝說明](https://fly.io/docs/flyctl/install/)

## 步驟

1. **登入**
   ```
   fly auth login
   ```

2. **建立 app**（`fly.toml` 裡的 `app` 名稱要全 Fly 平台唯一，如果 `atomic-boss` 被別人用掉了，改 `fly.toml` 裡的 `app` 欄位再繼續）
   ```
   fly apps create atomic-boss
   ```

3. **建立持久化硬碟**（放 `data.db`，重新部署、機器重啟都不會遺失資料）
   ```
   fly volumes create atomic_boss_data --region nrt --size 1
   ```
   `--size 1` 是 1GB，這個 bot 的資料量用不完。`--region` 建議跟 `fly.toml` 裡的 `primary_region` 一致（預設 `nrt` 東京，Fly 已不提供香港節點，nrt 是離台灣較近的節點之一）。

4. **設定機密環境變數**（`BOT_TOKEN` 等不寫進 `fly.toml`，用 secrets 管理）
   ```
   fly secrets set BOT_TOKEN=你的token CLIENT_ID=你的clientid GUILD_ID=你的guildid
   ```

   如果要啟用「頻道只能用指令/按鈕」的限制（自動刪除一般聊天訊息），另外設：
   ```
   fly secrets set COMMAND_ONLY_CHANNEL_ID=你的頻道id
   ```
   沒設這個變數的話這個限制就不會啟用。啟用後記得確認 bot 的角色在該頻道有「管理訊息」(Manage Messages) 權限，不然刪不掉別人的訊息。

5. **部署**
   ```
   fly deploy
   ```

6. **註冊 slash 指令**（`/揪團`）——這步跟 Discord API 溝通，不依賴 Fly 上的 process，本機執行一次即可：
   ```
   npm run deploy-commands
   ```

7. **確認 bot 上線**：去 Discord 看機器人是不是顯示在線，或看 log：
   ```
   fly logs
   ```

## 之後要改設定 / redeploy

改完程式碼後，`fly deploy` 重新部署即可；`data.db` 因為在掛載的持久化 volume（`/data`）上，不會被覆蓋。

## 備份建議

SQLite 是單一檔案，沒有內建容錯。建議定期用 `fly ssh console` 進去把 `/data/data.db` 複製出來備份，或另外寫個排程腳本做這件事。
