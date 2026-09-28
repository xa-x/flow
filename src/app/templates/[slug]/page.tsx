"use client";

import { use } from "react";
import { TemplateDetail } from "@/components/TemplateDetail";

export default function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <TemplateDetail slug={slug} />;
}
