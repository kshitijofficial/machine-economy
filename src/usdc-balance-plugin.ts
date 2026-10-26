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

type UsdcTransferRequest = {
  recipient: Hex;
  amount: string;
};

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
const getWalletAccount = () => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("EVM_PRIVATE_KEY is missing or invalid");
  }
  return privateKeyToAccount(privateKey as Hex);
};

const getWalletAddress = () => {
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

const parseUsdcTransferRequest = (
  text?: string,
): UsdcTransferRequest | null => {
  if (!text) return null;
  const hasTransferIntent = /\b(send|transfer|pay)\b/i.test(text);
  const hasUsdc = /\busdc\b/i.test(text);

  if (!hasTransferIntent || !hasUsdc) {
    return null;
  }

  const recipientMatch = text.match(/0x[a-fA-F0-9]{40}/);
  const amountMatch = text.match(
    /(?:send|transfer|pay)\s+(\d+(?:\.\d+)?)\s*(?:base\s+sepolia\s+)?usdc\b|\b(\d+(?:\.\d+)?)\s*(?:base\s+sepolia\s+)?usdc\b/i,
  );

  const amount = amountMatch?.[1] ?? amountMatch?.[2];
  const recipient = recipientMatch?.[0];

  if (!amount || !recipient || !isAddress(recipient)) {
    return null;
  }

  return {
    amount,
    recipient: recipient as Hex,
  };
};

export const transferBaseSepoliaUsdcAction: Action = {
  name: "TRANSFER_BASE_SEPOLIA_USDC",
  similes: ["SEND_USDC", "TRANSFER_USDC", "PAY_USDC", "SEND_BASE_SEPOLIA_USDC"],
  description:
    "Transfers USDC from the agent wallet to an explicit EVM address on Base Sepolia when the user asks to send, transfer, or pay USDC.",
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<boolean> => {
    return parseUsdcTransferRequest(message.content.text) != null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: unknown,
    callback: HandlerCallback,
    _reponses: Memory[],
  ): Promise<ActionResult> => {
    const request = parseUsdcTransferRequest(message.content.text);
    if (!request) {
      const responseContent: Content = {
        text: "Tell me the USDC amount and a Base Sepolia recipient address, for example: transfer 1.25 USDC to 0x...",
        actions: ["TRANSFER_BASE_SEPOLIA_USDC"],
        source: message.content.source,
      };
      await callback(responseContent);

      return {
        text: "Missing USDC transfer details",
        values: { success: false, error: "INVALID_USDC_TRANSFER_REQUEST" },
        data: { actionName: "TRANSFER_BASE_SEPOLIA_USDC" },
        success: false,
      };
    }
    try {
      const account = getWalletAccount(runtime);
      const rpcUrl = getBaseSepoliaRpcUrl(runtime);
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: rpcUrl ? http(rpcUrl) : http(),
      });

      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: rpcUrl ? http(rpcUrl) : http(),
      });

      const amountRaw = parseUnits(request.amount, USDC_DECIMALS);
      const hash = await walletClient.writeContract({
        address: BASE_SEPOLIA_USDC_ADDRESS,
        abi: usdcAbi,
        functionName: "transfer",
        args: [request.recipient, amountRaw],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      const explorerUrl = `https://sepolia.basescan.org/tx/${hash}`;
      const succeeded = receipt.status === "success";
      const responseContent: Content = {
        text: succeeded
          ? `Sent ${request.amount} USDC to ${request.recipient} on Base Sepolia.\n${explorerUrl}`
          : `The USDC transfer transaction was submitted but did not succeed.\n${explorerUrl}`,
        actions: ["TRANSFER_BASE_SEPOLIA_USDC"],
        source: message.content.source,
      };
      await callback(responseContent);

      return {
        text: succeeded
          ? "USDC transfer completed"
          : "USDC transfer failed on-chain",
        values: {
          success: succeeded,
          baseSepoliaUsdcTransferHash: hash,
          baseSepoliaUsdcTransferAmount: request.amount,
          baseSepoliaUsdcTransferRecipient: request.recipient,
        },
        data: {
          actionName: "TRANSFER_BASE_SEPOLIA_USDC",
          chainId: BASE_SEPOLIA_CHAIN_ID,
          chainName: "Base Sepolia",
          from: account.address,
          to: request.recipient,
          tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
          symbol: "USDC",
          decimals: USDC_DECIMALS,
          amount: request.amount,
          rawAmount: amountRaw.toString(),
          hash,
          explorerUrl,
          status: receipt.status,
        },
        success: succeeded,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseContent: Content = {
        text: `I couldn't send the USDC transfer. ${errorMessage}`,
        actions: ["TRANSFER_BASE_SEPOLIA_USDC"],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: "USDC transfer failed",
        values: {
          success: false,
          error: "USDC_TRANSFER_FAILED",
        },
        data: {
          actionName: "TRANSFER_BASE_SEPOLIA_USDC",
          chainId: BASE_SEPOLIA_CHAIN_ID,
          chainName: "Base Sepolia",
          tokenAddress: BASE_SEPOLIA_USDC_ADDRESS,
          symbol: "USDC",
          recipient: request.recipient,
          amount: request.amount,
          error: errorMessage,
        },
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  },
};
export const baseSepoliaUsdcBalancePlugin: Plugin = {
  name: "base-sepolia-usdc-balance",
  description:
    "Provides the agent wallet's Base Sepolia USDC balance and USDC transfers",
  actions: [transferBaseSepoliaUsdcAction],
  providers: [baseSepoliaUsdcBalanceProvider],
};

export default baseSepoliaUsdcBalancePlugin;
