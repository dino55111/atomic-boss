const WELCOME_MESSAGE_TEMPLATE = (mention) => `歡迎加入ATOMIC公會！🥳
${mention}

為了更快融入，再麻煩協助完成以下幾個小步驟：

🌙請先到【<#1385889229904547860>】詳閱公會規章。

🌙填寫【<#1385896517788766279>】讓大家認識你。

🌙王團報名請至【<#1549085186380144680>】填寫表單；
若想了解機器人操作或其他注意事項，可詳閱【<#1534433095569113108>】。

👉 貼心提醒： 需要將所有頻道都瀏覽/點擊過一遍/留言簡介，權限才會完整開啟唷！若加入後2日內未登入成員簡介將會被踢除公會，請務必留意唷！祝遊戲愉快！`;

function createGuildMemberAddHandler(welcomeChannelId, excludedRoleId) {
  return async function handleGuildMemberAdd(member) {
    console.log(`[welcome] guildMemberAdd for ${member.id}`);

    if (!welcomeChannelId) {
      console.log('[welcome] skipped: no welcomeChannelId configured');
      return;
    }
    if (member.roles.cache.has(excludedRoleId)) {
      console.log(`[welcome] skipped: ${member.id} has the excluded role`);
      return;
    }

    const channel = await member.client.channels.fetch(welcomeChannelId).catch((error) => {
      console.error('[welcome] failed to fetch welcome channel:', error);
      return null;
    });
    if (!channel) {
      return;
    }

    await channel
      .send({
        content: WELCOME_MESSAGE_TEMPLATE(`<@${member.id}>`),
        allowedMentions: { users: [member.id] },
      })
      .then(() => console.log('[welcome] message sent'))
      .catch((error) => console.error('[welcome] failed to send message:', error));
  };
}

module.exports = { createGuildMemberAddHandler };
