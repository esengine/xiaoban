import { useLocalSearchParams } from "expo-router";
import { FloorPlanScreen } from "../../src/floor/FloorPlanScreen.tsx";
import { LifeRoute } from "../../src/life/LifeRoute.tsx";

export default function FloorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LifeRoute>{(store) => <FloorPlanScreen key={id} store={store} planId={id} />}</LifeRoute>;
}
