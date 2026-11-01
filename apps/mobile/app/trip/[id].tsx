import { useLocalSearchParams } from "expo-router";
import { LifeRoute } from "../../src/life/LifeRoute.tsx";
import { TripMapScreen } from "../../src/trip/TripMapScreen.tsx";
import { parseVersion } from "../../src/trip/useTrip.ts";

export default function TripRoute() {
  const params = useLocalSearchParams<{ id: string; version?: string }>();
  const version = parseVersion(params.version);
  return (
    <LifeRoute>
      {(store) => (
        <TripMapScreen
          key={`${params.id}@${version ?? "latest"}`}
          store={store}
          tripId={params.id}
          version={version}
        />
      )}
    </LifeRoute>
  );
}
