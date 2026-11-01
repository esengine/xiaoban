import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import type { FloorPlan } from "@xiaoban/protocol";
import { router } from "expo-router";
import { useEffect } from "react";

export function useFloorPlan(store: HubStore, planId: string): FloorPlan | undefined {
  const { floorPlans } = useHubState(store);
  const plan = floorPlans[planId];
  const known = plan !== undefined;
  useEffect(() => {
    if (!known) void store.floorPlan(planId).catch(() => undefined);
  }, [store, planId, known]);
  return plan;
}

export function openFloorPlan(planId: string) {
  router.push({ pathname: "/floor/[id]", params: { id: planId } });
}

export function openFloorCheck(planId: string) {
  router.push({ pathname: "/floor/check/[id]", params: { id: planId } });
}
