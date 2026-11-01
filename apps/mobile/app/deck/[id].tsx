import { useLocalSearchParams } from "expo-router";
import { LifeRoute } from "../../src/life/LifeRoute.tsx";
import { DeckScreen } from "../../src/work/DeckScreen.tsx";

export default function DeckRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LifeRoute dark>{(store) => <DeckScreen key={id} store={store} deckId={id} />}</LifeRoute>;
}
