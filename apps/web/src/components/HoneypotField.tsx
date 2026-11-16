import { HONEYPOT_FIELD } from "@/lib/honeypot";

/**
 * Hidden bot trap. Kept out of layout, the tab order and assistive tech; a
 * human never fills it, so any value means the form was submitted by a script.
 */
export function HoneypotField() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-10000px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      <input
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}
