// Test cookie: extract token from Ads Manager, then discover pages
import axios from "axios";

const rawCookie = "c_user=100041263971339;presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1774717485973%2C%22v%22%3A1%7D;fr=1JensgnEcCRGFdgwg.AWcxfTyQJV-ju4uc_lfbVvmw8CjpmD7psNLW79mGJLhLtdz7YrE.BpyBl6..AAA.0.0.BpyBl6.AWfwvHIopW_mg8YXB3g7Z1pmez4;xs=9%3AYqcyTf-4_MT1Sw%3A2%3A1774717479%3A-1%3A-1%3A%3AAczO3ry5KdJ5RXmTnmHG4lGgybPo6mueQoFmHSQ3Zg";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Cookie": rawCookie,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1"
};

console.log("=== STEP 1: Fetch Ads Manager page with cookie ===");
try {
  const res = await axios.get("https://www.facebook.com/adsmanager/manage/campaigns", {
    headers,
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
  });
  
  const html = res.data;
  console.log("HTTP Status:", res.status);
  console.log("HTML length:", html.length);
  console.log("Redirected to login?", html.includes("/login") || res.request?.res?.responseUrl?.includes("login"));
  
  // Extract EAAG token
  const eaagMatch = html.match(/EAAG[a-zA-Z0-9_-]{20,}/);
  const eaabMatch = html.match(/EAAB[a-zA-Z0-9_-]{20,}/);
  const eaaMatch = html.match(/EAA[a-zA-Z0-9_-]{20,}/);
  
  console.log("\nToken extraction:");
  console.log("  EAAG found:", eaagMatch ? eaagMatch[0].substring(0, 30) + "..." : "NO");
  console.log("  EAAB found:", eaabMatch ? eaabMatch[0].substring(0, 30) + "..." : "NO");
  console.log("  EAA* found:", eaaMatch ? eaaMatch[0].substring(0, 30) + "..." : "NO");
  
  const token = eaagMatch?.[0] || eaabMatch?.[0] || eaaMatch?.[0];
  
  if (!token) {
    // Check if page loaded at all
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    console.log("\nPage title:", titleMatch?.[1] || "NO TITLE");
    console.log("Contains 'login':", html.includes("login"));
    console.log("Contains 'checkpoint':", html.includes("checkpoint"));
    console.log("First 500 chars of body:", html.substring(0, 500));
    process.exit(1);
  }
  
  console.log("\n=== STEP 2: Decode token (FB HTML encoding) ===");
  let decoded = token;
  if (/Z[ABCD]/.test(token)) {
    decoded = token.replace(/ZD/g, "").replace(/ZB/g, "+").replace(/ZC/g, "/").replace(/ZA/g, "=");
    console.log("Token was FB-encoded, decoded successfully");
    console.log("  Raw:", token.substring(0, 40) + "...");
    console.log("  Decoded:", decoded.substring(0, 40) + "...");
  } else {
    console.log("Token is NOT FB-encoded (clean)");
    console.log("  Token:", decoded.substring(0, 40) + "...");
  }

  console.log("\n=== STEP 3: Validate token (/me) ===");
  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(decoded)}`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    console.log("HTTP:", r.status);
    if (j.id) {
      console.log("✅ VALID! User:", j.name, "(", j.id, ")");
    } else {
      console.log("❌ INVALID:", JSON.stringify(j.error));
    }
  } catch (e) { console.log("Network error:", e.message); }

  console.log("\n=== STEP 4: Discover pages (/me/accounts) ===");
  try {
    const r = await fetch(`https://graph.facebook.com/v25.0/me/accounts?fields=id,name,category,access_token&access_token=${encodeURIComponent(decoded)}`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    console.log("HTTP:", r.status);
    if (j.data && j.data.length > 0) {
      console.log(`✅ Found ${j.data.length} pages:`);
      j.data.forEach(p => console.log(`  - ${p.name} (${p.id}) [${p.category}]`));
    } else if (j.error) {
      console.log("❌ Error:", JSON.stringify(j.error));
    } else {
      console.log("⚠️ No pages found (data is empty array)");
    }
  } catch (e) { console.log("Network error:", e.message); }

} catch (e) {
  console.log("FATAL:", e.message);
}
