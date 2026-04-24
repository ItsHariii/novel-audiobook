import Player from "@/components/Player";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <Player />
    </ErrorBoundary>
  );
}
