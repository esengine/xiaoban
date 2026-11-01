import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, type ScrollViewInstance } from "react-native";

export function useKeyboard() {
  const scroll = useRef<ScrollViewInstance>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const shown = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates.height);
      requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
    });
    const hidden = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return { scroll, height };
}
