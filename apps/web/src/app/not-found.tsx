import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <span className="font-display text-[7rem] font-bold leading-none tracking-tighter text-sage select-none sm:text-[9rem]">
        404
      </span>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong"
      >
        Back to careers
      </Link>
    </div>
  );
}
