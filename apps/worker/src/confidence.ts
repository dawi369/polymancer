export interface ForecastAuditChecklist {
  baseRatePresent: boolean;
  twoSidedSearch: boolean;
  independenceChecked: boolean;
  influenceUnderThreshold: boolean;
}

export interface ForecastAudit {
  checklist: ForecastAuditChecklist;
}

export interface ForecastCardSummary {
  evidenceCount: number;
  audit: ForecastAudit;
}

export function deriveConfidence(card: ForecastCardSummary): number {
  const checklist = card.audit.checklist;
  const evidenceTerm = 0.05 * Math.log1p(Math.max(0, card.evidenceCount));
  const score =
    0.35 +
    evidenceTerm +
    0.1 * (checklist.baseRatePresent ? 1 : 0) +
    0.1 * (checklist.twoSidedSearch ? 1 : 0) +
    0.1 * (checklist.independenceChecked ? 1 : 0) +
    0.1 * (checklist.influenceUnderThreshold ? 1 : 0);

  return clamp(score, 0, 1);
}

export function confidenceBand(score: number): "HIGH" | "MED" | "LOW" {
  if (score >= 0.75) return "HIGH";
  if (score >= 0.55) return "MED";
  return "LOW";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
