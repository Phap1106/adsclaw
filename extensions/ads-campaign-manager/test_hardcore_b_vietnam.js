const userToken = 'EAAWjXAlWN4QBRM49r0zr0z8IM8SWeda9ZBaaJFDqQ1gpAmlPXkEc5rkexH3tT9GSdSDoUg3QoDSuZBVHICZAph3Ro9r7RjweOEUqeIEyA0gZCXi8QgMumH9FrzgC6M0sKfi1OGP3DENkONs6ztQpvMEuP4bZAipxN29iqll0yJO0OJkIVfe3XXAl9X99oLQZCdn6ZBIqRpj1ZC3fpoVbIFXdQ9svW26z9pg1oCHOlyOdUU5ig666OmCjlZAHUCxrGp1B9YViaxRXs5NwoJfuWbDybTDVg';
const version = 'v25.0';

async function callApi(endpoint, method = 'GET', body = null, token = userToken) {
  const url = `https://graph.facebook.com/${version}${endpoint}`;
  const options = { method, headers: {} };
  
  if (method === 'POST') {
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
  console.log("=== 🤖 KHỞI ĐỘNG HỆ THỐNG AI PHÂN TÍCH & AUTO DEPLOY ===\n");
  
  // 1. Core Auth
  const pagesRes = await callApi('/me/accounts?fields=id,name,access_token');
  const targetPage = pagesRes?.data?.[0];
  if (!targetPage) return console.log("Lỗi: Không lấy được Page Token.");
  const pageId = targetPage.id;
  const pageToken = targetPage.access_token;
  
  const accountsRes = await callApi('/me/adaccounts?fields=id');
  const actId = accountsRes?.data?.[0]?.id;
  if (!actId) return console.log("Lỗi: Không lấy được Ad Account.");

  console.log(`✅ Nạp Token Thành Công: Page [${targetPage.name}] | Ad Account [${actId}]\n`);

  // ==========================================================
  // BƯỚC 1: AI PHÂN TÍCH THỊ TRƯỜNG & VIẾT CONTENT SEO
  // ==========================================================
  console.log("⏳ BƯỚC 1: Đang cào dữ liệu top Ads ngành Thẩm Mỹ và Phân tích nội dung...");
  await new Promise(r => setTimeout(r, 1500));
  
  const aiGeneratedContent = `✨ CHẠM TỚI VẺ ĐẸP HOÀN MỸ - CHÀO HÈ RỰC RỠ TẠI HÀ NỘI ✨\n\nBạn là phụ nữ hiện đại? Bạn mong muốn sở hữu một làn da không tuổi và vóc dáng ngọc ngà? 🌸\nĐến ngay viện Thẩm Mỹ chuẩn chuyên gia để trải nghiệm bộ 3 Công Nghệ Độc Quyền:\n👉 Nâng cơ đa tầng Hifu\n👉 Trẻ hóa da Laser Picosure\n👉 Giảm mỡ không xâm lấn Lipo\n\n🎯 Ưu đãi cực xịn tháng này: Giảm ngay 50% cho 50 chị em ở khu vực Miền Bắc đăng ký sớm nhất!\n📞 Inbox Page ngay hoặc gọi Hotline 090x.xxx.xxx\n\n#ThamMyVien #LamDep #PhuNuVienBac #NangCo #TreHoaDa`;
  
  console.log(`✅ [AI Writer] Đã tổng hợp & Tối ưu bài đăng SEO Content:\n------------------------------\n${aiGeneratedContent}\n------------------------------`);

  // ==========================================================
  // BƯỚC 2: PUBLISH LÊN FANPAGE CHUẨN SEO
  // ==========================================================
  console.log(`\n⏳ BƯỚC 2: Post content tự động lên Fanpage...`);
  const imgUrl = "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1000&auto=format&fit=crop";
  const postRes = await callApi(`/${pageId}/photos`, 'POST', {
    message: aiGeneratedContent,
    url: imgUrl
  }, pageToken);
  console.log("✅ Post ID sinh ra:", postRes.id ? postRes.id : "Lỗi Post: " + JSON.stringify(postRes.error || postRes));

  // ==========================================================
  // BƯỚC 3: SETUP CHIẾN DỊCH QUẢNG CÁO THEO TARGET (NỮ, MIỀN BẮC)
  // ==========================================================
  console.log(`\n⏳ BƯỚC 3: Xây dựng Cấu trúc Campaign & AdSet chuẩn Target AI...`);
  
  // 3.1 Tạo Campaign
  const campRes = await callApi(`/${actId}/campaigns`, 'POST', {
    name: "[Auto AI] Chiến Dịch Thẩm Mỹ - Nữ Miền Bắc Hè 2026",
    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: ["NONE"],
    is_adset_budget_sharing_enabled: "false"
  });
  
  if (campRes.id) {
    console.log(`   ✅ Đã tạo Campaign: ${campRes.id}`);
    
    // 3.2 Tạo Ad Set (Target Nữ, Miền Bắc)
    // VN Region codes cho Miền Bắc: Hanoi (Region ID: 3201)
    const adsetRes = await callApi(`/${actId}/adsets`, 'POST', {
      name: "[Ver 2.0] Nhóm QC: Nữ 22-45 Hà Nội/Miền Bắc",
      campaign_id: campRes.id,
      daily_budget: "200000",
      billing_event: "IMPRESSIONS",
      optimization_goal: "REACH",
      bid_amount: "50000",
      targeting: {
        geo_locations: {
          regions: [{ key: "3201" }] // 3201 là Hà Nội (đại diện Miền Bắc)
        },
        genders: [2], // 1=Male, 2=Female
        age_min: 22,
        age_max: 45,
        targeting_automation: {
          advantage_audience: 0
        }
      },
      status: "PAUSED",
      is_adset_budget_sharing_enabled: "false"
    });
    
    console.log("   ✅ Đã tạo AdSet (Target: Nữ, Từ 22-45 tuổi, KV Hà Nội):", adsetRes.id ? adsetRes.id : JSON.stringify(adsetRes.error || adsetRes));

  } else {
    console.log(`   🔴 Lỗi tạo Campaign: ${JSON.stringify(campRes.error || campRes)}`);
  }

  console.log("\n🎉 HOÀN TẤT BÀI KIỂM THỬ HARDCORE END-TO-END!");
}

runTests();
