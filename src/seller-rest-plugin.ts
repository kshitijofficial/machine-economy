import type {
  Action,
  ActionResult,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  Plugin,
  State,
} from "@elizaos/core";

const DEFAULT_SELLER_AGENT_URL = "http://localhost:8000";
type SellerRestClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

const parseSellerRestRequest = (text?: string) => {
  if (!text) {
    return null;
  }

  if (/\bbuy\s+1\s+usdc\s+image\s+from\s+the\s+seller\b/i.test(text)) {
    return { intent: "buy-image" as const };
  }

  return null;
};
const getSellerAgentUrl = () =>
  process.env.SELLER_AGENT_URL?.trim() || DEFAULT_SELLER_AGENT_URL;

const formatJsonForChat = (data: unknown) =>
  JSON.stringify(data, null, 2).slice(0, 3500);

const postSellerRestRequest = async (
  { baseUrl }: SellerRestClientOptions,
  path: string,
  body: Record<string, unknown>,
) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : null;
  if (!response.ok) {
    throw new Error(
      `Seller REST POST ${path} failed with ${response.status}: ${formatJsonForChat(data)}`,
    );
  }
  return data;
};

const runSellerRestRequest = async () => ({
  label: "Seller image purchase request",
  data: await postSellerRestRequest(
    {
      baseUrl: getSellerAgentUrl(),
    },
    "/api/v1/images/monalisa",
    {
      amount: "1",
      currency: "USDC",
    },
  ),
});

export const sellerRestInteractionAction: Action = {
  name: "SELLER_REST_INTERACTION",
  similes: ["SELLER_REST", "ASK_SELLER"],
  description:
    "Sends a simple seller REST request for the test phrase: buy 1 USDC image from the seller.",
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<boolean> => parseSellerRestRequest(message.content.text) != null,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: unknown,
    callback: HandlerCallback,
    _reponses: Memory[],
  ): Promise<ActionResult> => {
    const request = parseSellerRestRequest(message.content.text);

    if (!request) {
      const responseContent: Content = {
        text: "Ask me: buy 1 USDC image from the seller.",
        actions: ["SELLER_REST_INTERACTION"],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: "Missing seller REST request",
        values: { success: false, error: "INVALID_SELLER_REST_REQUEST" },
        data: { actionName: "SELLER_REST_INTERACTION" },
        success: false,
      };
    }
    try {
      const result = await runSellerRestRequest();
      const responseContent: Content = {
        text: `${result.label} from ${getSellerAgentUrl()}:\n${formatJsonForChat(result.data)}`,
        actions: ["SELLER_REST_INTERACTION"],
        source: message.content.source,
      };
      await callback(responseContent);
      return {
        text: `${result.label} retrieved`,
        values: {
          success: true,
          sellerRestIntent: request.intent,
          sellerAgentUrl: getSellerAgentUrl(),
        },
        data: {
          actionName: "SELLER_REST_INTERACTION",
          request,
          response: result.data,
        },
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const responseContent: Content = {
        text: `I couldn't talk to the seller REST API. ${errorMessage}`,
        actions: ["SELLER_REST_INTERACTION"],
        source: message.content.source,
      };

      await callback(responseContent);

      return {
        text: "Seller REST interaction failed",
        values: {
          success: false,
          error: "SELLER_REST_INTERACTION_FAILED",
        },
        data: {
          actionName: "SELLER_REST_INTERACTION",
          request,
          sellerAgentUrl: getSellerAgentUrl(),
          error: errorMessage,
        },
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
      };
    }
  },
};

export const sellerRestPlugin: Plugin = {
  name: "seller-rest",
  description:
    "Connects the buyer agent to a seller-agent REST API for a simple image purchase smoke test.",
  actions: [sellerRestInteractionAction],
};

export default sellerRestPlugin;
