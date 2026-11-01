import { useLocalSearchParams } from "expo-router";
import { LifeRoute } from "../../src/life/LifeRoute.tsx";
import { SheetScreen } from "../../src/work/SheetScreen.tsx";

export default function SheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LifeRoute>{(store) => <SheetScreen key={id} store={store} sheetId={id} />}</LifeRoute>;
}
