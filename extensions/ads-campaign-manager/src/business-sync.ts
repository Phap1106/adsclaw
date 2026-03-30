import { Type } from "@sinclair/typebox";

export interface BusinessDataResult {
  source: string;
  totalLeads: number;
  qualifiedLeads: number;
  totalSales: number;
  revenue: number;
  dateRange: string;
  topPerformingProducts?: string[];
  feedbackNotes?: string;
}

/**
 * Fetches business data to compare against Meta Ads data.
 * Currently uses a mock/demo data generator or environment-configured webhook.
 */
export async function syncBusinessData(params: {
  dateRange?: string;
  sourceType?: "crm" | "sheets" | "pos";
  checkInventoryForSKU?: string;
}): Promise<BusinessDataResult> {
  const dateRange = params.dateRange ?? "today";
  const source = params.sourceType ?? "crm";
  const isPos = params.sourceType === "pos";
  
  // MOCK FETCH DEEP DIVE:
  console.log(`[Business Sync] Fetching ${params.sourceType} data for ${params.dateRange || "today"}.`);
  
  let inventoryWarning: string | undefined = undefined;
  if (params.checkInventoryForSKU) {
    console.log(`[Business Sync] Checking inventory for SKU: ${params.checkInventoryForSKU}`);
    // Simulate finding low inventory:
    inventoryWarning = `🔴 CẢNH BÁO TỒN KHO: SKU ${params.checkInventoryForSKU} chỉ còn 3 sản phẩm. Đề xuất: Tự động TẮT campaign tương ứng ngay.`;
  }

  // In a real system, this would fetch from a CRM (e.g., KiotViet, Lark, Google Sheets) webhook or API.
  // For the upgraded MVP, we return a structured mock that the AI can act upon.
  // If process.env.BUSINESS_SYNC_URL exists, it would fetch from there.
  
  const webhookUrl = process.env.BUSINESS_SYNC_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(`${webhookUrl}?date=${dateRange}&source=${source}`);
      if (res.ok) {
        return (await res.json()) as BusinessDataResult;
      }
    } catch (e) {
      console.log(`[business-sync] Failed to fetch real CRM data: ${e}`);
    }
  }

  // Fallback to intelligent mock data to demonstrate the capability to the AI Strategist
  console.log(`[business-sync] Returning synced mock business data for ${dateRange} from ${source}`);
  
  return {
    source: source.toUpperCase(),
    dateRange,
    totalLeads: Math.floor(Math.random() * 50) + 10,
    qualifiedLeads: Math.floor(Math.random() * 10) + 2,
    totalSales: Math.floor(Math.random() * 5) + 1,
    revenue: Math.floor(Math.random() * 10000000) + 2000000,
    topPerformingProducts: ["Service A (Discount)", "Product B (Premium)"],
    feedbackNotes: "Leads from Messenger are cheap but 60% are unqualified (just asking for price). Landing page form leads have 3x higher conversion rate.",
  };
}
