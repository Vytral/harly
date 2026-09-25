// `autocomplete` is not a spec attribute on `<button>`, so React's types omit
// it. Firefox still honours it there, and the auth submit buttons rely on that:
// without it Firefox restores a button's `disabled` state across a reload and
// hydrates `disabled={null}` against the client's `true`.
//
// React passes `autoComplete` through to the DOM as `autocomplete` unchanged,
// so this only widens the type to match what is already emitted.
import "react";

declare module "react" {
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    autoComplete?: string;
  }
}
