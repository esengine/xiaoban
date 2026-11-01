import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useBackground(): boolean {
  const [background, setBackground] = useState(AppState.currentState !== "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) =>
      setBackground(next !== "active"),
    );
    return () => subscription.remove();
  }, []);
  return background;
}
