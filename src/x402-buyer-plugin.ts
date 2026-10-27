import {
  ContentType,
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type Plugin,
  type State,
} from "@elizaos/core";
import { ExactEvmScheme } from "@x402/evm";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPaymentFromConfig,
  type Network,
  type PaymentPolicy,
  type PaymentRequirements,
} from "@x402/fetch";
import { getAddress, isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const DEFAULT_SELLER_AGENT_URL = "http://localhost:8000";
const DEFAULT_X402_NETWORK = "eip155:84532";
const DEFAULT_X402_IMAGE_PATH = "/api/v1/images/monalisa";
const DEFAULT_X402_MAX_AMOUNT_PER_PAYMENT = "$1";
const DEFAULT_MAX_INLINE_IMAGE_BYTES = 750_000;
const DEFAULT_X402_PAY_TO_ADDRESS =
  "0xddbe59872f2b73c4206c849dab8e09e6531482af";
const DEFUALT_X402_ALLOWED_ASSET = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

type X402PaidImageRequest = {
  url?: string;
  path?: string;
};

type PaidImageResponseSummary = {
  bodyPreview: string;
  contentType: string;
  imageUrl?: string;
  inlineImageDataUrl?: string;
  byteLength?: number;
  json?: unknown;
  text?: string;
};

const getX402ImagePath = () => DEFAULT_X402_IMAGE_PATH;
const getSellerAgentUrl = () => DEFAULT_SELLER_AGENT_URL;

const buildPaidImageUrl = (
  runtime: IAgentRuntime,
  request: X402PaidImageRequest,
) => {
  if (request.url) {
    return new URL(request.url).toString();
  }
  const path = request.path ?? getX402ImagePath();
  return new URL(path, `${getSellerAgentUrl()}/`).toString();
};

const createTrustedPayToPolicy = (trustedPayTo: string[]): PaymentPolicy => {
  return (_version: number, requirements: PaymentRequirements[]) =>
    requirements.filter(
      (requirement) =>
        isAddress(requirement.payTo) &&
        trustedPayTo.includes(getAddress(requirement.payTo).toLowerCase()),
    );
};

const getX402Network = (): Network => DEFAULT_X402_NETWORK;
const getTrustedPayToAddress = () => DEFAULT_X402_PAY_TO_ADDRESS;
const getAllowedAsset = () => DEFUALT_X402_ALLOWED_ASSET;
const getX402MaxAmountPerPayment = () => DEFAULT_X402_MAX_AMOUNT_PER_PAYMENT;

const getWalletAccount = () => {
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("EVM_PRIVATE_KEY is missing or invalid");
  }
  return privateKeyToAccount(privateKey as Hex);
};

const createX402Fetch = (runtime: IAgentRuntime) => {
  const account = getWalletAccount();
  const network = getX402Network();
  const trustedPayTo = getTrustedPayToAddress();
  const allowedAsset = getAllowedAsset();
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network,
        client: new ExactEvmScheme(account),
      },
    ],
    spendControls: {
      maxAmountPerPayment: getX402MaxAmountPerPayment(),
      ...(allowedAsset
        ? {
            allowedAssets: [
              {
                network,
                asset: allowedAsset,
              },
            ],
          }
        : {}),
    },
    policies: trustedPayTo.length
      ? [createTrustedPayToPolicy([trustedPayTo])]
      : undefined,
  });
};
const stripTrailingPunctuation = (value: string) =>
  value.replace(/[),.;]+$/g, "");

const getX402InlineImageLimit = (runtime: IAgentRuntime) =>
  DEFAULT_MAX_INLINE_IMAGE_BYTES;

const parseX402PaidImageRequest = (
  text?: string,
): X402PaidImageRequest | null => {
  if (!text) return null;

  const hasPaymentIntent =
    /\b(buy|purchase|pay|paid|download|fetch|retrieve|get)\b/i.test(text);
  const hasImageIntent =
    /\b(image|asset|file|resource|mona lisa|monalisa)\b/i.test(text);
  const mentionsX402 = /\bx402\b/i.test(text);

  if (!hasPaymentIntent || (!hasImageIntent && !mentionsX402)) {
    return null;
  }

  const url = text.match(/\bhttps?:\/\/[^\s)]+/i)?.[0];
  const path = text.match(
    /\b(?:endpoint|path|route)\s*(?:is|=|:)?\s*(`?)(\/[^\s`]+)\1/i,
  )?.[2];

  return {
    url: url ? stripTrailingPunctuation(url) : undefined,
    path: path ? stripTrailingPunctuation(path) : undefined,
  };
};

const findImageUrl = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return /^(https?:\/\/|data:image\/)/i.test(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item);
      if (found) return found;
    }
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const object = value as Record<string, unknown>;
  const likelyImageFields = [
    "image_url",
    "imageUrl",
    "delivery_url",
    "deliveryUrl",
    "asset_url",
    "assetUrl",
    "url",
  ];

  for (const field of likelyImageFields) {
    const found = findImageUrl(object[field]);
    if (found) return found;
  }

  for (const nested of Object.values(object)) {
    const found = findImageUrl(nested);
    if (found) return found;
  }

  return undefined;
};

const formatJsonForChat = (data: unknown) =>
  JSON.stringify(data, null, 2).slice(0, 2200);

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const summarizePaidImageResponse = async (
  runtime: IAgentRuntime,
  response: Response,
): Promise<PaidImageResponseSummary> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    const imageUrl = findImageUrl(json);

    return {
      contentType,
      imageUrl,
      json,
      bodyPreview: imageUrl
        ? `Image URL: ${imageUrl}`
        : `JSON response:\n${formatJsonForChat(json)}`,
    };
  }

  if (contentType.startsWith("image/")) {
    const imageBuffer = await response.arrayBuffer();
    const byteLength = imageBuffer.byteLength;
    const maxInlineBytes = getX402InlineImageLimit(runtime);
    const inlineImageDataUrl =
      byteLength <= maxInlineBytes
        ? `data:${contentType};base64,${arrayBufferToBase64(imageBuffer)}`
        : undefined;

    return {
      contentType,
      byteLength,
      inlineImageDataUrl,
      bodyPreview: inlineImageDataUrl
        ? `Received ${contentType} image (${byteLength} bytes).`
        : `Received ${contentType} image (${byteLength} bytes), larger than the inline attachment limit.`,
    };
  }

  const text = await response.text();

  return {
    contentType,
    text,
    bodyPreview: text ? text.slice(0, 2200) : "Empty response body.",
  };
};

const getPaymentResponseHeader = (response: Response) =>
  response.headers.get("PAYMENT-RESPONSE") ??
  response.headers.get("X-PAYMENT-RESPONSE");

const decodeSettlementHeader = (response: Response) => {
  const header = getPaymentResponseHeader(response);
  if (!header) return undefined;

  try {
    return decodePaymentResponseHeader(header);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      transaction: undefined,
      decodeError: errorMessage,
      rawHeader: header,
    };
  }
};

export const purchasex402SellerImageAction: Action = {
  name: "PURCHASE_X402_SELLER_IMAGE",
  description:
    "Uses x402 to pay for and retrieve a seller image endpoint after an explicit purchase request, including the smoke-test phrase: buy 1 USDC image from the seller.",
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<boolean> => {
    return parseX402PaidImageRequest(message.content.text) != null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: unknown,
    callback: HandlerCallback,
    _reponses: Memory[],
  ): Promise<ActionResult> => {
    const request = parseX402PaidImageRequest(message.content.text);
    if (!request) {
      const responseContent: Content = {
        text: "Ask me to buy or download a seller image with x402, for example: buy the seller image with x402.",
        actions: ["PURCHASE_X402_SELLER_IMAGE"],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: "Missing x402 paid image request",
        values: { success: false, error: "INVALID_X402_IMAGE_REQUEST" },
        data: { actionName: "PURCHASE_X402_SELLER_IMAGE" },
        success: false,
      };
    }
    try {
      const paidFetch = createX402Fetch(runtime);
      const targetUrl = buildPaidImageUrl(runtime, request);
      const response = await paidFetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: "image/*, application/json;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(
          `x402 image request failed with HTTP ${response.status}$`,
        );
      }
      const settlement = decodeSettlementHeader(response);
      const transaction = settlement?.transaction;
      const summary = await summarizePaidImageResponse(runtime, response);
      const attachementUrl = summary.imageUrl ?? summary.inlineImageDataUrl;
      const responseContent: Content = {
        text: [
          `x402 seller image retrieved from ${targetUrl}.`,
          summary.bodyPreview,
        ]
          .filter(Boolean)
          .join("\n"),

        actions: ["PURCHASE_X402_SELLER_IMAGE"],
        source: message.content.source,
        attachments: attachementUrl
          ? [
              {
                id: crypto.randomUUID(),
                url: attachementUrl,
                title: "Purchase seller image",
                source: targetUrl,
                contentType: ContentType.IMAGE,
              },
            ]
          : undefined,
      };
      await callback(responseContent);

      return {
        text: "x402 seller image retrieved",
        values: {
          success: true,
          x402SellerImageUrl: targetUrl,
          x402SettlementTransaction: transaction,
        },
        data: {
          actionName: "PURCHASE_X402_SELLER_IMAGE",
          request,
          targetUrl,
          network: getX402Network(),
          maxAmountPerPayment: getX402MaxAmountPerPayment(),
          settlement,
          response: {
            contentType: summary.contentType,
            imageUrl: summary.imageUrl,
            byteLength: summary.byteLength,
            json: summary.json,
            text: summary.text,
            hasInlineImageAttachment: Boolean(summary.inlineImageDataUrl),
          },
        },
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseContent: Content = {
        text: `I couldn't complete the x402 image purchase. ${errorMessage}`,
        actions: ["PURCHASE_X402_SELLER_IMAGE"],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: "x402 seller image purchase failed",
        values: {
          success: false,
          error: "X402_IMAGE_PURCHASE_FAILED",
        },
        data: {
          actionName: "PURCHASE_X402_SELLER_IMAGE",
          request,
          error: errorMessage,
        },
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  },
};

export const x402BuyerPlugin: Plugin = {
  name: "x402-buyer",
  description:
    "Pays x402-protected seller endpoints from the buyer wallet and returns purchased image details.",
  actions: [purchasex402SellerImageAction],
};
export default x402BuyerPlugin;
