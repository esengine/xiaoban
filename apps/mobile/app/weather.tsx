import { LifeRoute } from "../src/life/LifeRoute.tsx";
import { WeatherScreen } from "../src/life/WeatherScreen.tsx";

export default function WeatherRoute() {
  return <LifeRoute>{(store) => <WeatherScreen store={store} />}</LifeRoute>;
}
