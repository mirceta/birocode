# management-app — delta for manage-toast-overlay

## ADDED Requirements

### Requirement: Transient notifications are non-layout-shifting overlay toasts
Transient Management App notifications — the "harness opened" outcome family
above all — SHALL render as toasts in one fixed-position overlay layer
(bottom-right), never inserted into the page flow: showing, stacking or
dismissing a toast SHALL NOT move any other element. The layer SHALL accept
pointer events only on the toasts themselves and announce politely
(`aria-live="polite"`, `role="status"` per toast). A toast SHALL be a compact
single line carrying the same content as before (which agent/machine, the
fresh-tab link when a URL exists); it SHALL dismiss on its "×" and on a click
anywhere on it; a quiet toast SHALL auto-fade after about four seconds with
the timer paused while hovered and the fade disabled under
prefers-reduced-motion; a sticky outcome (the "cannot open: reason" family)
SHALL stay until dismissed. Several toasts SHALL stack, newest last, bounded,
and a burst of quiet toasts SHALL NOT push out a sticky one. The same shared
toast SHALL be callable by any other transient dashboard message; persistent
inline reports stay as they are.

#### Scenario: Opening a harness no longer moves the GUI
- **WHEN** the Operator clicks an agent badge and the "opened in a new tab" notification fires
- **THEN** the dashboard body's position is pixel-identical before, during and after the toast (the old banner moved it 46 px), and the toast fades on its own after ~4 s

#### Scenario: Sticky outcomes persist, everything is dismissible
- **WHEN** a "cannot open" or "did not come to the front" outcome fires among quiet ones
- **THEN** the toasts stack bottom-right, the quiet ones fade (clock paused on hover), the sticky one stays with its fresh-tab link until the Operator clicks it or its ×
