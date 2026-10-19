declare module "@elizaos/plugin-evm" {
  import type { Plugin } from "@elizaos/core";

  export const evmPlugin: Plugin;

  const defaultPlugin: Plugin;
  export default defaultPlugin;
}
