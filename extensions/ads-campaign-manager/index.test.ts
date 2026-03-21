import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../test-utils/plugin-api.js";
import plugin from "./index.js";

describe("ads campaign manager plugin registration", () => {
  it("registers tool, commands, cli, and service", () => {
    const registerTool = vi.fn();
    const registerCommand = vi.fn();
    const registerCli = vi.fn();
    const registerService = vi.fn();

    plugin.register?.(
      createTestPluginApi({
        id: "ads-campaign-manager",
        name: "Ads Campaign Manager",
        source: "test",
        config: {},
        runtime: {} as never,
        registerTool,
        registerCommand,
        registerCli,
        registerService,
      }) as OpenClawPluginApi,
    );

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerService).toHaveBeenCalledTimes(1);
    expect(registerCli).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledTimes(11);
  });
});
