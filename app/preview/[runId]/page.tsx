import { notFound } from "next/navigation";
import { getRun } from "@/lib/storage";
import PreviewClient from "./PreviewClient";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: PageProps) {
  const { runId } = await params;

  let run;
  try {
    run = await getRun(runId);
  } catch {
    notFound();
  }

  return <PreviewClient initialRun={run} />;
}
