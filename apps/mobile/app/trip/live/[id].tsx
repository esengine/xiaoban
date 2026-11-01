import { useLocalSearchParams } from "expo-router";
import { LifeRoute } from "../../../src/life/LifeRoute.tsx";
import { TripLiveScreen } from "../../../src/trip/TripLiveScreen.tsx";

export default function TripLiveRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LifeRoute>{(store) => <TripLiveScreen store={store} tripId={id} />}</LifeRoute>;
}
