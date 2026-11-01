import { LifeRoute } from "../src/life/LifeRoute.tsx";
import { WeekScreen } from "../src/life/WeekScreen.tsx";

export default function WeekRoute() {
  return <LifeRoute>{(store) => <WeekScreen store={store} />}</LifeRoute>;
}
