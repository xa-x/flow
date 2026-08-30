import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";

export default function NotFound() {
  return (
    <StatusScreen
      kicker="404"
      title="This page isn’t here"
      body="It may have been deleted, or the link is stale."
      action={
        <Link
          href="/"
          className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium"
        >
          Back to workbooks
        </Link>
      }
    />
  );
}
