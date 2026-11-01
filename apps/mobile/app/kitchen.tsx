import { KitchenScreen } from "../src/life/KitchenScreen.tsx";
import { LifeRoute } from "../src/life/LifeRoute.tsx";

export default function KitchenRoute() {
  return <LifeRoute>{(store) => <KitchenScreen store={store} />}</LifeRoute>;
}
