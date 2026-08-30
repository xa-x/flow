"use client";

import { useEffect } from "react";
import { StatusScreen } from "@/components/StatusScreen";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      kicker="Error"
      title="Something broke"
      body={error.message || "An unexpected error stopped this page."}
      action={
        <button
          onClick={() => retry()}
          className="fb-btn-primary rounded-full px-4 py-2 text-[13px] font-medium"
        >
          Try again
        </button>
      }
    />
  );
}
