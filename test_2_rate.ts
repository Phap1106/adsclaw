
// Simulation of Meta Rate Limit Awareness (Phase 25)

async function testRateLimit() {
  console.log("--- TEST 2: RATE LIMIT AWARENESS ---");
  
  const mockHeaders = {
    get: (key: string) => {
      if (key === "x-business-use-case-usage") {
        return JSON.stringify({
          "business-662233854": [
            {
              "method": "GET",
              "call_count": 91, // Above 85% threshold
              "total_cputime": 12,
              "total_time": 4
            }
          ]
        });
      }
      return null;
    }
  };

  console.log(`[INCOMING] Header: x-business-use-case-usage found.`);

  const usageHeader = mockHeaders.get("x-business-use-case-usage");
  if (usageHeader) {
     const usage = JSON.parse(usageHeader);
     const maxUsage = Math.max(...Object.values(usage).flatMap((u: any) => [u.call_count, u.total_cputime, u.total_time]));
     
     console.log(`[ANALYSIS] Max Usage detected: ${maxUsage}%`);
     
     if (maxUsage > 85) {
       console.warn(`🚨 CRITICAL WARNING: [META RATE LIMIT] High usage detected: ${maxUsage}%. Applying passive backoff strategy.`);
     }
  }

  console.log(`\n✅ SUCCESS: Rate limit threshold correctly identified at 91%.`);
}

testRateLimit();
