// Test 2: Use cookie directly with Graph API (no Ads Manager scraping)
// Facebook allows /me calls with session cookies + dtsg token

const rawCookie = "c_user=100041263971339;presence=C%7B%22t3%22%3A%5B%5D%2C%22utc3%22%3A1774717485973%2C%22v%22%3A1%7D;fr=1JensgnEcCRGFdgwg.AWcxfTyQJV-ju4uc_lfbVvmw8CjpmD7psNLW79mGJLhLtdz7YrE.BpyBl6..AAA.0.0.BpyBl6.AWfwvHIopW_mg8YXB3g7Z1pmez4;xs=9%3AYqcyTf-4_MT1Sw%3A2%3A1774717479%3A-1%3A-1%3A%3AAczO3ry5KdJ5RXmTnmHG4lGgybPo6mueQoFmHSQ3Zg";

const userId = "100041263971339"; // from c_user

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Cookie": rawCookie,
  "Accept": "*/*",
  "Accept-Language": "vi-VN,vi;q=0.9",
};

// Method 1: Try the mobile facebook endpoint (m.facebook.com - less strict)
console.log("=== TEST 1: m.facebook.com profile ===");
try {
  const r = await fetch("https://m.facebook.com/home.php", {
    headers, redirect: "manual",
    signal: AbortSignal.timeout(15000)
  });
  console.log("Status:", r.status);
  console.log("Location:", r.headers.get("location") || "none");
  if (r.status === 200) {
    const html = await r.text();
    console.log("Logged in:", !html.includes("/login"));
    console.log("HTML length:", html.length);
  }
} catch (e) { console.log("Error:", e.message); }

// Method 2: Try getting the user's pages via Graph API with cookie
// This works with the internal www.facebook.com/api/graphql endpoint
console.log("\n=== TEST 2: Facebook GraphQL internal ===");
try {
  const r = await fetch("https://www.facebook.com/ajax/profile/async/overview/?uid=" + userId, {
    headers: { ...headers, "X-Requested-With": "XMLHttpRequest" },
    signal: AbortSignal.timeout(15000)
  });
  console.log("Status:", r.status);
  const text = await r.text();
  console.log("Length:", text.length, "| Contains 'login':", text.includes("/login"));
} catch (e) { console.log("Error:", e.message); }

// Method 3: Try getting pages via www.facebook.com/pages/?category=your_pages
console.log("\n=== TEST 3: /pages/ endpoint ===");
try {
  const r = await fetch("https://www.facebook.com/pages/?category=your_pages", {
    headers, redirect: "manual",
    signal: AbortSignal.timeout(15000)
  });
  console.log("Status:", r.status);
  console.log("Location:", r.headers.get("location") || "none");
  if (r.status === 200) {
    const html = await r.text();
    // Look for page names in the HTML
    const pageMatches = html.match(/\"name\":\"[^"]+\"/g);
    console.log("Page names found:", pageMatches?.slice(0, 5) || "none");
    console.log("HTML length:", html.length);
  }
} catch (e) { console.log("Error:", e.message); }

console.log("\n=== TEST 4: Check if xs cookie is properly decoded ===");
const xsCookie = rawCookie.match(/xs=([^;]+)/)?.[1];
console.log("xs raw:", xsCookie);
console.log("xs decoded:", decodeURIComponent(xsCookie || ""));
console.log("Cookie should have datr? No (not provided)");
console.log("Cookie has c_user:", rawCookie.includes("c_user"));
console.log("Cookie has xs:", rawCookie.includes("xs="));
console.log("Cookie has fr:", rawCookie.includes("fr="));
console.log("\n⚠️ Missing critical cookies: 'datr' and 'sb' - these are required for session auth!");
