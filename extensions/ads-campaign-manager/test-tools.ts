import { createAdsManagerTool } from "./src/tool.js";

async function test() {
  try {
    const api = {
      registerTool: (t: any) => console.log("Registered:", t.name),
    } as any;
    const config = {
      intelligence: { search: { enabled: true }, apify: { enabled: true } }
    } as any;

    const tools = createAdsManagerTool({ api, pluginConfig: config });
    for (const t of tools) {
      console.dir(t.parameters, { depth: null });
    }
    console.log("All tools created successfully!");
  } catch (err) {
    console.error("Error creating tools:", err);
  }
}

test();
