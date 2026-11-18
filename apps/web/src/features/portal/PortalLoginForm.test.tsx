import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));
vi.mock("@/features/portal/actions", () => ({ sendPortalMagicLinkAction: vi.fn() }));
vi.mock("@/features/portal/auth-actions", () => ({
  loginPortalPasswordAction: vi.fn(),
  recoverPortalPasswordAction: vi.fn(),
  requestPortalPasswordResetEmailAction: vi.fn(),
  redeemPortalAccessCodeAction: vi.fn(),
}));

import { PortalLoginForm, portalSignInLayout, type PortalLoginMethods } from "./PortalLoginForm";

const none: PortalLoginMethods = {
  password: false,
  magicLink: false,
  google: false,
  github: false,
  linkedin: false,
  passkey: false,
  accessCode: false,
  emailReset: false,
};

function render(methods: Partial<PortalLoginMethods>) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <PortalLoginForm methods={{ ...none, ...methods }} />
    </NextIntlClientProvider>,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("portal sign-in form controls per configuration", () => {
  it("magic link only: one email field and the link button, no password", () => {
    const html = render({ magicLink: true });
    expect(count(html, 'type="email"')).toBe(1);
    expect(html).not.toContain('name="password"');
    expect(html).toContain("Email me a sign-in link");
    expect(html).not.toContain('role="tablist"');
  });

  it("password only: email + password with forgot and set-up links", () => {
    const html = render({ password: true });
    expect(count(html, 'type="email"')).toBe(1);
    expect(html).toContain('name="password"');
    expect(html).toContain("Forgot password?");
    expect(html).toContain("Set up a password");
    expect(html).not.toContain("Email me a sign-in link");
  });

  it("password and magic link: a single email field with a method switch", () => {
    const html = render({ password: true, magicLink: true });
    expect(count(html, 'type="email"')).toBe(1);
    expect(html).toContain('role="tablist"');
    expect(count(html, 'role="tab"')).toBe(2);
    expect(html).toContain('name="password"');
  });

  it("social only: only round provider buttons", () => {
    const html = render({ google: true, github: true });
    expect(html).not.toContain('type="email"');
    expect(html).toContain('aria-label="Google"');
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain("rounded-full");
    expect(html).not.toContain("Sign in with a passkey");
  });

  it("passkey only: only the passkey button", () => {
    const html = render({ passkey: true });
    expect(html).toContain("Sign in with a passkey");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("I have an access code");
  });

  it("combination: quick methods, divider, email method, access code link", () => {
    const layout = portalSignInLayout({ ...none, passkey: true, linkedin: true, password: true, accessCode: true });
    expect(layout).toMatchObject({ social: ["linkedin"], passkey: true, email: "password", divider: true, accessCode: true });
    const html = render({ passkey: true, linkedin: true, password: true, accessCode: true });
    expect(count(html, 'type="email"')).toBe(1);
    expect(html.indexOf("Sign in with a passkey")).toBeLessThan(html.indexOf('type="email"'));
    expect(html).toContain("I have an access code");
  });

  it("nothing enabled: explains that sign-in is unavailable", () => {
    const html = render({});
    expect(html).toContain("Sign-in isn");
    expect(html).not.toContain("<input");
  });
});
