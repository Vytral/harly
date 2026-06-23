import Link from "next/link";

export default function LegalNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This legal page does not exist or has not been published yet.
      </p>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-pine underline hover:text-pine/80"
      >
        Go to homepage
      </Link>
    </div>
  );
}
