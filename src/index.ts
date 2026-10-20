import {
  logger,
  type IAgentRuntime,
  Plugin,
  type Project,
  type ProjectAgent,
} from "@elizaos/core";
import { evmPlugin } from "@elizaos/plugin-evm";
import { a2aAgentCardPlugin } from "./a2a-agent-card.ts";
import { baseSepoliaUsdcBalancePlugin } from "./usdc-balance-plugin.ts";
import { character } from "./character.ts";

type EvmChainSettings = { chains?: { evm?: string[] } };

const prepareBaseSepoliaEvmRuntime = async (runtime: IAgentRuntime) => {
  runtime.character.settings ??= {};
  const settings = runtime.character
    .settings as typeof runtime.character.settings & EvmChainSettings;
  const existingChains =
    typeof settings.chains === "object" && settings.chains !== null
      ? settings.chains
      : {};

  settings.chains = {
    ...existingChains,
    evm: ["baseSepolia"],
  };
};

const baseSepoliaEvmPlugin: Plugin = {
  ...evmPlugin,
  init: async (config, runtime) => {
    await prepareBaseSepoliaEvmRuntime(runtime);
    await evmPlugin.init?.(config, runtime);
  },
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => initCharacter({ runtime }),
  plugins: [
    baseSepoliaEvmPlugin,
    baseSepoliaUsdcBalancePlugin,
    a2aAgentCardPlugin,
  ],
};

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info("Initializing character");
  logger.info({ name: character.name }, "Name:");
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from "./character.ts";

export default project;
