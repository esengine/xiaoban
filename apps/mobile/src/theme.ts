import { color, radius, space } from "@xiaoban/tokens";
import { StyleSheet } from "react-native";

export const theme = { color, radius, space };

export const shared = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ground,
  },
  input: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: color.ink,
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  primaryButtonText: {
    color: color.surface,
    fontSize: 15,
    fontWeight: "500",
  },
});
