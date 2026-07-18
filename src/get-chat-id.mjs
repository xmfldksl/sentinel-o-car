const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN 환경변수가 필요합니다.");

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(JSON.stringify(result));

const chats = new Map();
for (const update of result.result) {
  const chat = update.message?.chat ?? update.edited_message?.chat ?? update.callback_query?.message?.chat;
  if (chat) chats.set(String(chat.id), chat);
}

if (chats.size === 0) {
  console.log("채팅을 찾지 못했습니다. 텔레그램에서 봇에게 /start를 보낸 뒤 다시 실행하십시오.");
} else {
  for (const [id, chat] of chats) {
    console.log(`${id}\t${chat.type}\t${chat.username ?? chat.first_name ?? ""}`);
  }
}
