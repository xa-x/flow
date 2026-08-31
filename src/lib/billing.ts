export type PlanId = "free" | "pro" | "team";

export interface Plan {
  id: PlanId;
  label: string;
  monthlyUsd: number;
  seatUsd?: number;
  monthlyRuns: number;
  monthlyCreditsUsd: number;
  schedules: boolean;
  webhooks: boolean;
  mcp: boolean;
  versions: boolean;
  team: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Free",
    monthlyUsd: 0,
    monthlyRuns: 50,
    monthlyCreditsUsd: 0,
    schedules: false,
    webhooks: false,
    mcp: false,
    versions: false,
    team: false,
  },
  pro: {
    id: "pro",
    label: "Pro",
    monthlyUsd: 24,
    monthlyRuns: 2000,
    monthlyCreditsUsd: 15,
    schedules: true,
    webhooks: true,
    mcp: true,
    versions: true,
    team: false,
  },
  team: {
    id: "team",
    label: "Team",
    monthlyUsd: 0,
    seatUsd: 20,
    monthlyRuns: 10_000,
    monthlyCreditsUsd: 40,
    schedules: true,
    webhooks: true,
    mcp: true,
    versions: true,
    team: true,
  },
};

export function planOf(id: string | null | undefined): Plan {
  if (id === "pro" || id === "team") return PLANS[id];
  return PLANS.free;
}

export function monthStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}
