// The page's window onto the stage controller. The controller owns the values; this store only relays them to the few
// small components that show them (meters, value text, verdict), so the page itself never renders per animation frame.
import { useSyncExternalStore } from "react";
import type { StageController } from "../stage/FigureStage.tsx";
import type { Values } from "../../../shared/primitives/types.ts";

export class GameStore {
  controller: StageController | null = null;
  private values: Values;
  private readonly listeners = new Set<() => void>();
  private off: (() => void) | undefined;

  constructor(initial: Values) {
    this.values = initial;
  }

  /** The `controllerRef` for FigureStage. Stable, so a render never re-attaches. */
  attach = (controller: StageController | null): void => {
    this.off?.();
    this.off = undefined;
    this.controller = controller;
    (window as unknown as { __stage?: StageController | null }).__stage = controller;
    if (controller) {
      this.values = controller.get();
      // The controller calls this at most once per tick of its frame loop, so a run costs one pass over the subscribers per frame.
      this.off = controller.subscribe((v) => {
        this.values = v;
        this.emit();
      });
    }
    this.emit();
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = (): Values => this.values;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/**
 * A value derived from the controller's values. Select a number or a string where you can: React skips the render
 * when the selection is equal, so a component that shows one slider does nothing while another one moves.
 */
export function useSelect<T>(store: GameStore, select: (v: Values) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.snapshot()));
}
