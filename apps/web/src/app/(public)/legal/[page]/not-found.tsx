import Link from "next/link";
import { FileText } from "lucide-react";

export default function LegalNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-sage/40 text-pine">
        <FileText className="size-6" strokeWidth={1.8} />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This legal page doesn&apos;t exist or hasn&apos;t been published yet.
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
