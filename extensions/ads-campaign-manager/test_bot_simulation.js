const token = 'EAAWjXAlWN4QBRHSnUB7UqmhgF9zKmcIKIixY2lBMoURxMXlTmZC9vV7kobZBJ4w3TiawZABmFt03YlNw9hqKAc2X9ZAG8A8wQcF8C6TrolOet4gEb3gdZBhLvZBQtdSDhzjCVlAIWPcBdzZCjcRAJmceB8TgcnVZAhyUZCbSI7M0PhkZAAK0pFgCKtVzAeZAvZBAQNIpojijHlX3ZBa7Jbvzj5CcBP1W7mnUYl3tfhlv0NfUZD';
const pageId = '1080451925143988';
const version = 'v25.0';

async function callApi(endpoint, method = 'GET', body = null) {
  const url = `https://graph.facebook.com/${version}${endpoint}`;
  const options = {
    method,
    headers: {}
  };
  
  if (method === 'POST' || method === 'PUT') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ ...body, access_token: token });
  } else {
    options.url = url + (url.includes('?') ? '&' : '?') + `access_token=${token}`;
  }

  try {
    const res = await fetch(options.url || url, options);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("🚀 Bắt đầu giả lập chuỗi hành động của người dùng thực qua Bot Ads...\n");
  
  // Hành động 1: Đăng 1 bài kèm ảnh
  console.log("👤 User 1: Lệnh Đăng bài có ảnh...");
  const imgUrl = "https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop";
  const postPhotoRes = await callApi(`/${pageId}/photos`, 'POST', {
    message: "Hình ảnh chiến dịch số #1 mới khởi động nè Sếp ơi! 🎨 [Bot Generated]",
    url: imgUrl
  });
  console.log("KQ Đăng ảnh:", postPhotoRes.id ? `✅ Thành công (ID: ${postPhotoRes.id})` : `❌ Lỗi: ${JSON.stringify(postPhotoRes.error)}`);
  
  const postId = postPhotoRes.post_id || postPhotoRes.id;
  await delay(2000);

  // Hành động 2: Cập nhật / Sửa lại bài viết vừa đăng
  console.log("\n👤 User 2: Lệnh Sửa lại nội dung bài viết...");
  if (postId) {
    const editRes = await callApi(`/${postId}`, 'POST', {
      message: "Chỉnh sửa lại nội dung: Hình ảnh chiến dịch số #1 (Đã cập nhật sau 5 phút) ⚡"
    });
    console.log("KQ Sửa bài:", editRes.success ? "✅ Thành công" : `❌ Lỗi: ${JSON.stringify(editRes.error)}`);
  } else {
    console.log("KQ Sửa bài: ❌ Bỏ qua vì không lấy được Post ID");
  }
  await delay(2000);

  // Hành động 3: Lên lịch bài đăng trong tương lai (Ngày mai)
  console.log("\n👤 User 3: Lệnh Lên lịch bài đăng (Schedule Post)...");
  const tomorrow = Math.floor(Date.now() / 1000) + (24 * 60 * 60) + 600; // Plus 24h + 10m
  const scheduleRes = await callApi(`/${pageId}/feed`, 'POST', {
    message: "Tin tức vào ngày mai Sếp nhé! ⏰ [Scheduled by Bot]",
    published: false,
    scheduled_publish_time: tomorrow
  });
  console.log("KQ Lên lịch:", scheduleRes.id ? `✅ Thành công (ID hẹn giờ: ${scheduleRes.id})` : `❌ Lỗi: ${JSON.stringify(scheduleRes.error)}`);
  await delay(2000);

  // Hành động 4: Đọc danh sách tin nhắn Inbox
  console.log("\n👤 User 4: Lệnh Kiểm tra khách hàng nhắn tin Page (Inbox)...");
  const inboxRes = await callApi(`/${pageId}/conversations?fields=id,updated_time,snippet,participants,unread_count&limit=5`, 'GET');
  if (inboxRes.data) {
    console.log(`KQ Đọc Inbox: ✅ Thành công! Có ${inboxRes.data.length} hội thoại gần nhất.`);
    if (inboxRes.data.length > 0) {
      console.log(`   └ Hội thoại 1: ${inboxRes.data[0].snippet.substring(0, 30)}...`);
      
      // Hành động 5: Rep tin nhắn đầu tiên
      console.log("\n👤 User 5: Lệnh Rep tin nhắn tự động...");
      const threadId = inboxRes.data[0].id;
      const replyRes = await callApi(`/${threadId}/messages`, 'POST', {
        message: "Dạ xin chào! Bot đã nhận được tin nhắn và sẽ có chuyên viên hỗ trợ anh/chị ngay ạ. 🤖"
      });
      console.log("KQ Rep tin nhắn:", replyRes.message_id ? "✅ Thành công" : `❌ Lỗi API (Thường do quy tắc tin nhắn 24h): ${JSON.stringify(replyRes.error)}`);
    } else {
      console.log("   └ Chưa có ai nhắn tin vào page này.");
    }
  } else {
    console.log(`KQ Đọc Inbox: ❌ Lỗi: ${JSON.stringify(inboxRes.error)}`);
  }
  await delay(2000);

  // Hành động 6: Lấy danh sách tài khoản Quảng Cáo và Phác thảo Camp (Draft)
  console.log("\n👤 User 6: Lệnh Tra cứu tài khoản Quảng Cáo và Campaign...");
  const adAccountsRes = await callApi(`/me/adaccounts?fields=id,name,account_status`, 'GET');
  if (adAccountsRes.data && adAccountsRes.data.length > 0) {
    const actId = adAccountsRes.data[0].id;
    console.log(`KQ Tìm Ad Account: ✅ Thành công! Tài khoản: ${actId}`);
    
    // Hành động 7: Tạo chiến dịch Nháp
    console.log("\n👤 User 7: Lệnh Lên Camp chạy (Draft/Paused)...");
    const draftRes = await callApi(`/${actId}/campaigns`, 'POST', {
      name: "[Bot] Draft Traffic Campaign - Tháng 3",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: ["NONE"]
    });
    console.log("KQ Soạn Camp Nháp:", draftRes.id ? `✅ Thành công (Camp ID: ${draftRes.id})` : `❌ Lỗi do thiếu quyền cấu hình: ${JSON.stringify(draftRes.error)}`);
  } else {
    console.log(`KQ Tìm Ad Account: ❌ Không tìm thấy BM hoặc TKQC nào trên tài khoản này (Lý do: User chưa tạo TKQC hoặc Token thiếu quyền ads_management). Lỗi chi tiết: ${JSON.stringify(adAccountsRes.error || "Mảng rỗng")}`);
  }

  console.log("\n✅ Hoàn tất bài Test chuỗi giả lập 7 hành động đại diện cho 20 users!");
}

runTests();
