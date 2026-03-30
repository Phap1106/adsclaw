
export default {
  id: "ads-campaign-manager",
  name: "Ads Campaign Manager (DEBUG)",
  register(api: any) {
    console.log("[DEBUG] Registering plugin...");
    api.registerCommand({
      name: "ok",
      handler: () => ({ text: "I am alive!" })
    });
  }
};
