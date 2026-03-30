import axios from "axios";

const token = "EAAGNO4a7r2wBRFcufWX2c1xegB39aLb3Qgnk9mEri87KE3wfaT7ZBjlQJ6P5OesSZAbdvZAWf8JP9rxiRaxkid5if9TyeesEpCTCw7g9O7pAMSDAmtUU3yijvBBbyPGelwOniZAxxAIKPY9iesO97eDtuiELiAjNjaDkCyX75H5z5gTuQn2ocU1tDvtFI6twVwZDZD";
const pageId = "61575593400197"; // ID from user's screenshot
const version = "v25.0";

const headers = {
  "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBLC/vi_VN;FBPN/com.facebook.katana;",
  "X-FB-App-Id": "350685531728"
};

async function test() {
  const tests = [
    { name: "Direct Page Query", url: `https://graph.facebook.com/${version}/${pageId}?fields=id,name,access_token` },
    { name: "App Details", url: `https://graph.facebook.com/${version}/app?fields=id,name,namespace` },
  ];

  for (const t of tests) {
    console.log(`--- [${t.name}] ---`);
    try {
      const res = await axios.get(t.url, { params: { access_token: token }, headers });
      console.log("SUCCESS:", JSON.stringify(res.data, null, 2));
    } catch (e: any) {
      console.log("FAILED:", e.response?.data ? JSON.stringify(e.response.data, null, 2) : e.message);
    }
  }
}

test();
