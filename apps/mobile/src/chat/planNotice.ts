import { useI18n } from "@xiaoban/i18n/react";
import type { Plan } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { planChange } from "./planText.ts";

export interface PlanNotice {
  key: string;
  at: number;
  text: string;
}

const seen = new Map<string, Plan | null>();
const kept = new Map<string, PlanNotice[]>();
const EMPTY: PlanNotice[] = [];

export function usePlanNotices(threadId: string, plan: Plan | null | undefined): PlanNotice[] {
  const { t } = useI18n();
  const [notices, setNotices] = useState<PlanNotice[]>(() => kept.get(threadId) ?? EMPTY);

  useEffect(() => {
    setNotices(kept.get(threadId) ?? EMPTY);
  }, [threadId]);

  useEffect(() => {
    if (plan === undefined) return;
    const before = seen.get(threadId);
    seen.set(threadId, plan);
    if (!before || !plan || before === plan) return;
    const text = planChange(t, before, plan);
    if (!text) return;
    const at = plan.updatedAt || Date.now();
    const next = [...(kept.get(threadId) ?? EMPTY), { key: `plan-${at}`, at, text }];
    kept.set(threadId, next);
    setNotices(next);
  }, [threadId, plan, t]);

  return notices;
}
