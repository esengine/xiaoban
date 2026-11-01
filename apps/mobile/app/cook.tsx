import { CookScreen } from "../src/life/CookScreen.tsx";
import { LifeRoute } from "../src/life/LifeRoute.tsx";

export default function CookRoute() {
  return <LifeRoute dark>{(store) => <CookScreen store={store} />}</LifeRoute>;
}
