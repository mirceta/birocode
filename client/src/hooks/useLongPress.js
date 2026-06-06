import { useRef } from 'react';

// Distinguishes a tap (onClick) from a press-and-hold (onLongPress), for both
// touch and mouse. After a long press fires, the click that follows is
// swallowed so the element does not also "tap". Moving the finger (scrolling)
// cancels the press. Pass { enabled: false } to behave as a plain click.
export function useLongPress(onLongPress, onClick, { delay = 450, enabled = true } = {}) {
  const timer = useRef(null);
  const longFired = useRef(false);

  function start() {
    if (!enabled) return;
    longFired.current = false;
    timer.current = setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, delay);
  }

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function handleClick() {
    if (longFired.current) {
      longFired.current = false;
      return; // a long press already handled this interaction
    }
    onClick();
  }

  return {
    onClick: handleClick,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onContextMenu: (e) => {
      if (enabled) e.preventDefault(); // suppress the long-press context menu
    },
  };
}
