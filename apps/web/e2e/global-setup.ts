import { E2E_DATABASE_URL } from "./constants";

export default async function globalSetup() {
  // Keep any @harly/db module initialization in this process on the dedicated
  // database too. The provisioner still passes the URL explicitly as a second
  // guard against accidentally using the normal local database.
  process.env.DATABASE_URL = E2E_DATABASE_URL;
  const { provisionE2EFixture } = await import("./provision");
  await provisionE2EFixture();
}
