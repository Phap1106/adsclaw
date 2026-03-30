// Diagnostic: Test token against Graph API - same network stack as bot
const token = process.argv[2] || "EAAGNO4a7zwBRAEWUU1ccb3A4aoeSPollC4BzZB51ZZA5vlweXP1ZC83F1CJoZC54qJAcPIXlxC4lPlJR88lPvcHnBy6O66aM0swUDeGr76eVZAJOyexVZC3MKCoAh4yyONGIQHAWo2k8ZAtxaCIJGgap5Gug7Y7PABWKqHEm2WoJZC5jydJqJJQz5DlvlSZBgZDZD";
const version = "v25.0";

async function test(label, url, opts) {
  console.log(`\n=== ${label} ===`);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
    const j = await r.json();
    console.log("HTTP:", r.status, "| OK:", !j.error);
    if (j.error) console.log("Error:", JSON.stringify(j.error, null, 2));
    else console.log("Data:", JSON.stringify(j, null, 2).slice(0, 500));
  } catch (e) { console.log("NETWORK ERROR:", e.message); }
}

// Test 1: Basic identity check
await test("TEST 1: /me (identity)", `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${token}`);

// Test 2: Page discovery via query param
await test("TEST 2: /me/accounts (query param)", `https://graph.facebook.com/${version}/me/accounts?fields=id,name&access_token=${token}`);

// Test 3: Page discovery via Bearer header
await test("TEST 3: /me/accounts (Bearer)", `https://graph.facebook.com/${version}/me/accounts?fields=id,name`, { headers: { "Authorization": `Bearer ${token}` } });

// Test 4: Token debug info
await test("TEST 4: debug_token", `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);

// Test 5: Minimal /me/accounts no fields
await test("TEST 5: /me/accounts (no fields)", `https://graph.facebook.com/${version}/me/accounts?access_token=${token}`);

console.log("\n=== DONE ===");
