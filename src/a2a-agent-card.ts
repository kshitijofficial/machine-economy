import type { Plugin, RouteRequest, RouteResponse } from "@elizaos/core";

const A2A_PROTOCOL_VERSION = "1.0";

type AgentCard = {
  name: string;
  description: string;
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: "HTTP+JSON";
    protocolVersion: string;
  }>;
  provider: {
    organization: string;
    url: string;
  };
  version: string;
  documentationUrl?: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    extendedAgentCard: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes?: string[];
    outputModes?: string[];
  }>;
  iconUrl?: string;
};

const getAgentBaseUrl = () => {
  return "http://localhost:3000";
};

export const createBuyerAgentCard = (): AgentCard => {
  const baseUrl = getAgentBaseUrl();
  return {
    name: "Mona Lisa Buyer Agent",
    description:
      "A buyer agent that discovers seller agents with Mona Lisa image offers, negotiates price and licensing terms, and can execute explicit x402 USDC purchases for paid image endpoints.",
    supportedInterfaces: [
      {
        url: baseUrl,
        protocolBinding: "HTTP+JSON",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: "buyer-agent",
      url: baseUrl,
    },
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: true,
      extendedAgentCard: true,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: [
      "text/plain",
      "application/json",
      "image/png",
      "image/jpeg",
    ],
    skills: [
      {
        id: "find-monalisa-image",
        name: "Find Mona Lisa Image",
        description:
          "Finds seller agents that can provide Mona Lisa image assets and requests offer details such as available image formats, resolution, provenance, license, price, delivery URL, and settlement requirements.",
        tags: [
          "image",
          "search",
          "monalisa",
          "procurement",
          "seller-discovery",
        ],
        examples: [
          "Find a seller agent that can provide a Mona Lisa image.",
          "Discover agents selling a Mona Lisa image with PNG or JPEG delivery.",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "request-image-offer",
        name: "Request Image Offer",
        description:
          "Requests a structured offer from a seller agent for a Mona Lisa image, including asset preview or delivery reference, price, currency, chain, recipient address, license terms, expiry, and seller identity.",
        tags: ["quote", "offer", "image", "monalisa", "usdc", "base-sepolia"],
        examples: [
          "Request a structured offer for a Mona Lisa image under 1 USDC.",
          "Ask the seller for image details, license terms, price, recipient address, and offer expiry.",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "negotiate-image-purchase",
        name: "Negotiate Image Purchase",
        description:
          "Negotiates purchase terms for a Mona Lisa image, including maximum price, license scope, quality requirements, delivery format, proof of availability, offer expiry, and settlement conditions. Payment remains a separate guarded step unless the user explicitly asks to buy through x402.",
        tags: [
          "negotiation",
          "commerce",
          "image-licensing",
          "usdc-ready",
          "payment-approval-required",
        ],
        examples: [
          "Negotiate the best price for a Mona Lisa image under 1 USDC.",
          "Ask the seller for license terms and delivery proof before agreeing.",
          "Counter an offer with a lower USDC price and require JPEG or PNG delivery.",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: ["application/json", "text/plain"],
      },
      {
        id: "purchase-image-with-x402",
        name: "Purchase Image With x402",
        description:
          "Pays an x402-protected seller image endpoint with the buyer wallet and returns the purchased image URL, inline image attachment when small enough, and settlement metadata.",
        tags: [
          "x402",
          "usdc",
          "base-sepolia",
          "image-purchase",
          "payment-approval-required",
        ],
        examples: [
          "Buy the seller Mona Lisa image with x402.",
          "Download the paid image from the seller using x402.",
          "Pay for the seller image at endpoint /api/v1/images/monalisa.",
        ],
        inputModes: ["text/plain", "application/json"],
        outputModes: [
          "application/json",
          "text/plain",
          "image/png",
          "image/jpeg",
        ],
      },
    ],
    iconUrl: "https://elizaos.github.io/eliza-avatars/Eliza/portrait.png",
  };
};

const setJsonContentType = (res: RouteResponse) => {
  const response = res as RouteResponse & {
    setHeader?: (name: string, value: string) => void;
    header?: (name: string, value: string) => void;
    type?: (value: string) => void;
  };

  response.setHeader?.("Content-Type", "application/json");
  response.header?.("Content-Type", "application/json");
  response.type?.("application/json");
};

export const a2aAgentCardPlugin: Plugin = {
  name: ".well-known",
  description: "Exposes this agent's public A2A Agent Card for discovery.",
  routes: [
    {
      name: "a2a-agent-card",
      path: "/agent-card.json",
      type: "GET",
      handler: async (_req: RouteRequest, res: RouteResponse) => {
        setJsonContentType(res);
        res.json(createBuyerAgentCard());
      },
    },
  ],
};


