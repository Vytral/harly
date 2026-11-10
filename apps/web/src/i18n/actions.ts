"use server";

import { cookies } from "next/headers";
import { isLocale } from "./config";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) throw new Error("Invalid locale");
  (await cookies()).set("harly_locale", locale, {
    path: "/", httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365,
  });
}
