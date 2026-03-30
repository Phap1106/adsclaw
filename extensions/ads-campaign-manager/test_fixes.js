const userToken = 'EAAWjXAlWN4QBRM49r0zr0z8IM8SWeda9ZBaaJFDqQ1gpAmlPXkEc5rkexH3tT9GSdSDoUg3QoDSuZBVHICZAph3Ro9r7RjweOEUqeIEyA0gZCXi8QgMumH9FrzgC6M0sKfi1OGP3DENkONs6ztQpvMEuP4bZAipxN29iqll0yJO0OJkIVfe3XXAl9X99oLQZCdn6ZBIqRpj1ZC3fpoVbIFXdQ9svW26z9pg1oCHOlyOdUU5ig666OmCjlZAHUCxrGp1B9YViaxRXs5NwoJfuWbDybTDVg';
const version = 'v25.0';

async function callApi(endpoint, method = 'GET', body = null, token = userToken) {
  const url = `https://graph.facebook.com/${version}${endpoint}`;
  const options = { method, headers: {} };
  
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

async function runTests() {
  console.log("🚀 BẮT ĐẦU KIỂM THỬ LẠI 2 LỖI SAU KHI VÁ (HOTFIX VERIFICATION)...\n");

  // 1. Phân tách Page Token
  const pagesRes = await callApi('/me/accounts?fields=id,name,access_token');
  const targetPage = pagesRes?.data?.[0];
  if (!targetPage) return console.log("Lỗi: Không lấy được Page Token.");
  const pageId = targetPage.id;
  const pageToken = targetPage.access_token;
  console.log(`✅ [CORE] Đã trích xuất Page Token của: ${targetPage.name} (ID: ${pageId})`);

  // ==========================================================
  // TEST 1: RE-TEST KHỞI TẠO CAMPAIGN MỚI VỚI THAM SỐ HOÀN CHỈNH
  // ==========================================================
  console.log("\n🧪 BÀI TEST 1: Tác vụ Ads Manager (Đã bổ sung is_adset_budget_sharing_enabled)");
  const adAccountsRes = await callApi('/me/adaccounts?fields=id,name,account_status');
  if (adAccountsRes?.data?.[0]) {
    const actId = adAccountsRes.data[0].id;
    console.log(`   👉 Tìm thấy Ad Account: ${actId}`);
    
    const draftRes = await callApi(`/${actId}/campaigns`, 'POST', {
      name: "[Test Sau Khi Vá Lỗi] Chiến dịch 10 Điểm",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: ["NONE"],
      is_adset_budget_sharing_enabled: "false" // <== Bản vá mới!
    });
    
    if (draftRes.id) {
      console.log(`   🟢 [PASS] Đã tạo Campaign Nháp thành công (ID: ${draftRes.id}). API hết phàn nàn!`);
    } else {
      console.log(`   🔴 [FAILED] Vẫn có lỗi API Ads: ${JSON.stringify(draftRes.error || draftRes)}`);
    }
  }

  // ==========================================================
  // TEST 2: RE-TEST REP INBOX VỚI MODULE MỚI (SEND MSG API)
  // ==========================================================
  console.log("\n🧪 BÀI TEST 2: Tác vụ Reply Khách Hàng (Module Send API - Bóc tách PSID)");
  const inboxRes = await callApi(`/${pageId}/conversations?fields=id,updated_time,snippet,participants&limit=1`, 'GET', null, pageToken);
  if (inboxRes?.data?.[0]) {
    const threadId = inboxRes.data[0].id;
    console.log(`   👉 Đã quét ra Thread ID: ${threadId}`);
    console.log(`   👉 Đang gọi Graph API lấy mảng Participants để tìm PSID...`);
    
    // Giả lập đúng logic mới trong facebook-page.ts
    const threadData = await callApi(`/${threadId}?fields=participants`, 'GET', null, pageToken);
    const customer = threadData?.participants?.data?.find(p => p.id !== pageId);
    
    if (customer?.id) {
      console.log(`   🎯 ĐÃ TÌM THẤY PSID CỦA KHÁCH: ${customer.name} (ID: ${customer.id})`);
      
      console.log(`   📮 Đang bắn Payload về Endpoint chuẩn /${pageId}/messages...`);
      // Bắn Message Endpoint
      const replyRes = await callApi(`/${pageId}/messages`, 'POST', {
        recipient: { id: customer.id },
        message: { text: "Dạ em chào anh/chị ạ! Bot đang Test luồng gửi tin nhắn ạ. 🚀" },
        messaging_type: "RESPONSE"
      }, pageToken);

      if (replyRes.message_id) {
        console.log(`   🟢 [PASS] Đã Send tin nhắn TRỰC TIẾP thành công (Msg_ID: ${replyRes.message_id})!`);
      } else {
        console.log(`   🔴 [FAILED] Lỗi gửi tin: ${JSON.stringify(replyRes.error || replyRes)}`);
      }
    } else {
      console.log("   🟡 [FAILED] Khách không tồn tại hoặc lỗi lấy participant.");
    }
  }

  console.log("\n✅ KẾT THÚC BÀI TEST XÁC THỰC!");
}

runTests();
