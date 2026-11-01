import { LedgerScreen } from "../src/life/LedgerScreen.tsx";
import { LifeRoute } from "../src/life/LifeRoute.tsx";

export default function LedgerRoute() {
  return <LifeRoute>{(store) => <LedgerScreen store={store} />}</LifeRoute>;
}
