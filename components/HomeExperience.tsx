"use client";

import { useState } from "react";
import { useLibrary } from "@/lib/library/useLibrary";
import Player from "@/components/Player";
import { Welcome } from "@/components/Welcome";

export default function HomeExperience() {
  const library = useLibrary();
  const [localStarted, setLocalStarted] = useState(false);

  if (!library.ready || (library.enabled ? !library.user : !localStarted)) {
    return <Welcome ready={library.ready} accountEnabled={library.enabled}
      onSignIn={library.signIn} onStart={() => setLocalStarted(true)} />;
  }

  return <Player library={library} />;
}
