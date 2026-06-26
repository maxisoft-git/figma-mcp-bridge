/**
 * useHotkeys — React hook для регистрации keyboard shortcuts.
 *
 * Поддерживает:
 * - Одиночные клавиши: "l", "r", "c"
 * - Модификаторы: "ctrl+s", "cmd+k", "shift+l"
 * - Игнорирует нажатия в input/textarea/contentEditable элементах
 *
 * @example
 * useHotkeys({ l: () => toggleLock(), r: () => reconnect() });
 */
import { useEffect, useCallback } from "react";

type KeyHandler = (event: KeyboardEvent) => void;
type HotkeyMap = Record<string, KeyHandler>;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
};

const matchesHotkey = (event: KeyboardEvent, hotkey: string): boolean => {
  const parts = hotkey.toLowerCase().split("+");
  const key = parts[parts.length - 1];

  if (event.key.toLowerCase() !== key) return false;

  const needCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const needShift = parts.includes("shift");
  const needAlt = parts.includes("alt");
  const needMeta = parts.includes("meta");

  const hasCtrl = event.ctrlKey || event.metaKey;
  if (needCtrl !== hasCtrl) return false;
  if (needShift !== event.shiftKey) return false;
  if (needAlt !== event.altKey) return false;
  if (needMeta !== event.metaKey) return false;

  return true;
};

export function useHotkeys(handlers: HotkeyMap): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        // Ignore Alt+key combos (browser menus)
        if (event.key.length === 1) return;
      }

      for (const [hotkey, handler] of Object.entries(handlers)) {
        if (matchesHotkey(event, hotkey)) {
          event.preventDefault();
          handler(event);
          return;
        }
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
