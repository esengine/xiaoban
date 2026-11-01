import { useLocalSearchParams } from "expo-router";
import { FloorCheckScreen } from "../../../src/floor/FloorCheckScreen.tsx";
import { LifeRoute } from "../../../src/life/LifeRoute.tsx";

export default function FloorCheckRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LifeRoute>{(store) => <FloorCheckScreen key={id} store={store} planId={id} />}</LifeRoute>
  );
}
