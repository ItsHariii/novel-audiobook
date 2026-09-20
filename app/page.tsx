import HomeExperience from "@/components/HomeExperience";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <HomeExperience />
    </ErrorBoundary>
  );
}
