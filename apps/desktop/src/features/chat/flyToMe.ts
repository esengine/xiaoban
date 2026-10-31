import { motion } from "@xiaoban/tokens";

const HOLD_MS = 1500;
const FLIGHT_MS = 520;

export function flyToMe(chip: HTMLElement): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>('[data-nav="me"]');
    if (!target || !chip.isConnected) return;
    const from = chip.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const ghost = chip.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-memory");
    ghost.classList.add("memory-saved__ghost");
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const flight = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0.2 },
      ],
      { duration: FLIGHT_MS, easing: motion.easeStandard, fill: "forwards" },
    );
    void flight.finished.then(() => {
      ghost.remove();
      target.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
        { duration: motion.slow, easing: motion.easeSpring },
      );
    });
  }, HOLD_MS);
}
