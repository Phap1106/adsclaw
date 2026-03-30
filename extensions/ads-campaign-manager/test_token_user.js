const token = 'EAAWjXAlWN4QBRHSnUB7UqmhgF9zKmcIKIixY2lBMoURxMXlTmZC9vV7kobZBJ4w3TiawZABmFt03YlNw9hqKAc2X9ZAG8A8wQcF8C6TrolOet4gEb3gdZBhLvZBQtdSDhzjCVlAIWPcBdzZCjcRAJmceB8TgcnVZAhyUZCbSI7M0PhkZAAK0pFgCKtVzAeZAvZBAQNIpojijHlX3ZBa7Jbvzj5CcBP1W7mnUYl3tfhlv0NfUZD';

async function run() {
  try {
    console.log("1. Đang kiểm tra token...");
    // 1. Fetch info
    const meRes = await fetch(`https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${token}`);
    const meData = await meRes.json();
    console.log("=== Dữ liệu trả về (Token Info) ===");
    console.log(JSON.stringify(meData, null, 2));

    if (meData.id) {
      console.log("\n2. Đang thử đăng bài lên Page...");
      // 2. Post a test message
      const postMessage = "Tada! Đây là bài test hệ thống cấp quyền Bot Ads (OpenClaw). Đăng thành công bằng Graph API!";
      const postRes = await fetch(`https://graph.facebook.com/v25.0/${meData.id}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: postMessage, access_token: token })
      });
      const postData = await postRes.json();
      console.log("=== Kết quả đăng bài ===");
      console.log(JSON.stringify(postData, null, 2));
    }
  } catch (err) {
    console.error("Lỗi:", err);
  }
}
run();
