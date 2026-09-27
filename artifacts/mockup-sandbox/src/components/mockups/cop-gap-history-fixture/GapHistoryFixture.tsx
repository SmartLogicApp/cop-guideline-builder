// A browser-test-only preview of the workspace with an explicit synthetic owner.
// @ts-expect-error The workspace source intentionally lives at the project root.
import CoPGuidelineBuilder from "../../../../../../index.jsx";

export default function GapHistoryFixture() {
  return <CoPGuidelineBuilder clerkUserId="gap-history-browser-test" />;
}