// Token analysis - detect URL encoding issues (ZB, ZC, ZA patterns)
const raw = "EAAGNO4a7zwBRAEWUU1ccb3A4aoeSPollC4BzZB51ZZA5vlweXP1ZC83F1CJoZC54qJAcPIXlxC4lPlJR88lPvcHnBy6O66aM0swUDeGr76eVZAJOyexVZC3MKCoAh4yyONGIQHAWo2k8ZAtxaCIJGgap5Gug7Y7PABWKqHEm2WoJZC5jydJqJJQz5DlvlSZBgZDZD";

// Facebook tokens use URL-safe base64. When displayed in Facebook's HTML,
// certain characters get encoded: + → ZB, / → ZC, = → ZA, etc.
// The "ZB", "ZC", "ZA" patterns in the token suggest FB's own URL encoding.
// We need to decode these BACK to standard base64 characters.
function decodeFbToken(t) {
  return t
    .replace(/ZB/g, '+')   // + encoded as ZB
    .replace(/ZC/g, '/')   // / encoded as ZC
    .replace(/ZA/g, '=')   // = encoded as ZA
    .replace(/ZD/g, '');    // ZD is padding artifact, strip
}

const decoded = decodeFbToken(raw);
console.log("Original length:", raw.length);
console.log("Decoded length:", decoded.length);
console.log("\nOriginal:", raw);
console.log("\nDecoded:", decoded);

console.log("\n=== Testing decoded token against /me ===");
try {
  const r = await fetch(`https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(decoded)}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  console.log("HTTP:", r.status);
  console.log("Response:", JSON.stringify(j, null, 2));
} catch (e) { console.log("Error:", e.message); }

console.log("\n=== Testing decoded token against /me/accounts ===");
try {
  const r = await fetch(`https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(decoded)}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  console.log("HTTP:", r.status);
  console.log("Response:", JSON.stringify(j, null, 2));
} catch (e) { console.log("Error:", e.message); }

console.log("\n=== Testing RAW token (no decode) against /me ===");
try {
  const r = await fetch(`https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(raw)}`, { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  console.log("HTTP:", r.status);
  console.log("Response:", JSON.stringify(j, null, 2));
} catch (e) { console.log("Error:", e.message); }
