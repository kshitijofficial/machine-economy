import type {
  Action,
  ActionResult,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  isAddress,
  parseAbi,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import process from "node:process";

const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_CHAIN_ID = 84532;
const USDC_DECIMALS = 6;

const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const getBaseSepoliaRpcUrl = (runtime: IAgentRuntime): string => {
  const url = process.env.ETHEREUM_BASE_SEPOLIA_RPC_URL;

  if (!url) {
    throw new Error("ETHEREUM_BASE_SEPOLIA_RPC_URL is not set");
  }

  return url;
};

const getWalletAddress = (runtime: IAgentRuntime) => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("EVM_PRIVATE_KEY is missing or invalid");
  }
  return privateKeyToAccount(privateKey as Hex).address;
};
export const baseSepoliaUsdcBalanceProvider: Provider = {
  name: "BASE_SEPOLIA_USDC_BALANCE",
  description: "Reads the agent wallet's USDC balance on Base Sepolia",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    try {
      const walletAddress = getWalletAddress(runtime);
      const rpcUrl = getBaseSepoliaRpcUrl(runtime);
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: rpcUrl ? http(rpcUrl) : http(),
      });

      const rawBalance = await publicClient.readContract({
        address: BASE_SEPOLIA_USDC_ADDRESS,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [walletAddress],
      });
      const balance = formatUnits(rawBalance, USDC_DECIMALS);

      return {
        text: `Base Sepolia USDC balance for ${walletAddress}:${balance} USDC`,
        values: {
          baseSepoliaUsdcBalance: balance,
          baseSepoliaUsdcToken: BASE_SEPOLIA_USDC_ADDRESS,
          evmWalletAddress: walletAddress,
        },
        data: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          chainName: "Base Sepolia",
          walletAddress,
          tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
          symbol: "USDC",
          decimals: USDC_DECIMALS,
          rawBalance: rawBalance.toString(),
          balance,
        },
      };
    } catch {
      return {
        text: "Base Sepolia USDC balance is unavailable. Check EVM_PRIVATE_KEY and the Base Sepolia RPC configuration.",
        values: {
          baseSepoliaUsdcBalance: "unavailable",
        },
        data: {
          chainId: BASE_SEPOLIA_CHAIN_ID,
          chainName: "Base Sepolia",
          tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
          symbol: "USDC",
          error: "USDC_BALANCE_UNAVAILABLE",
        },
      };
    }
  },
};
export const baseSepoliaUsdcBalancePlugin: Plugin = {
  name: "base-sepolia-usdc-balance",
  description:
    "Provides the agent wallet's Base Sepolia USDC balance and USDC transfers",
  // actions: [transferBaseSepoliaUsdcAction],
  providers: [baseSepoliaUsdcBalanceProvider],
};

export default baseSepoliaUsdcBalancePlugin;
