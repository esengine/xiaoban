import { useLocalSearchParams } from "expo-router";
import { LifeRoute } from "../../src/life/LifeRoute.tsx";
import { DocScreen } from "../../src/work/DocScreen.tsx";

export default function DocRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LifeRoute>{(store) => <DocScreen key={id} store={store} docId={id} />}</LifeRoute>;
}
