import { type DecisionIntent, type NormalizedDecisionIntent } from "./types";

const ACTION_MAP: Record<DecisionIntent["action"], NormalizedDecisionIntent["action"]> = {
  BUY: "buy",
  SELL: "sell",
  HOLD: "hold",
};

const TOKEN_MAP: Record<DecisionIntent["token"], NormalizedDecisionIntent["token"]> = {
  YES: "yes",
  NO: "no",
};

export function normalizeDecisionIntent(intent: DecisionIntent): NormalizedDecisionIntent {
  const action = ACTION_MAP[intent.action];
  const token = TOKEN_MAP[intent.token];

  if (!action || !token) {
    throw new Error("Invalid decision intent enums");
  }

  return {
    action,
    marketId: intent.marketId,
    token,
    sizeUsd: intent.sizeUsd,
    confidence: intent.confidence,
    reasoning: intent.reasoning,
    sources: intent.sources,
    runType: intent.runType,
  };
}
