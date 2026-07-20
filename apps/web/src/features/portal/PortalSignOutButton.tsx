import { SignOutIcon } from "@/components/ui/icons/phosphor";
import { signOutPortalAction } from "@/features/portal/actions";

export function PortalSignOutButton() {
  return (
    <form action={signOutPortalAction} className="w-full">
      <button
        type="submit"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-rust transition-colors"
      >
        <SignOutIcon className="size-4" />
        Sign out
      </button>
    </form>
  );
}
