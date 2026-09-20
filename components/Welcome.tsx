"use client";

import { useState, type FormEvent } from "react";
import styles from "./Welcome.module.css";

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" /></svg>;
}

function BookArtwork() {
  return <div className={styles.artwork} aria-hidden="true">
    <div className={styles.orbit} />
    <div className={styles.bookBack}><span>ONE MORE CHAPTER</span></div>
    <div className={styles.book}>
      <div className={styles.bookTop}>THE TOME COLLECTION <span>01</span></div>
      <div className={styles.bookTitle}>Somewhere<br />between<br /><em>the pages.</em></div>
      <svg className={styles.landscape} viewBox="0 0 280 210" fill="none">
        <circle cx="171" cy="59" r="34" fill="#d6b573" />
        <path d="M0 153 97 48l113 162H0Z" fill="#647866" />
        <path d="m99 210 109-117 72 71v46Z" fill="#aab397" />
        <path d="M0 181q73-27 140 1t140-2v30H0Z" fill="#d8d0ac" />
        <path d="M160 210q-55-14-18-28t-9-22" stroke="#f0e4c5" strokeWidth="3" />
      </svg>
      <div className={styles.bookBottom}>A WORLD WAITING TO BE HEARD</div>
    </div>
    <div className={styles.listeningNote}>
      <span className={styles.soundWave}>{[10, 20, 30, 17, 26, 12, 22].map((height, i) => <i key={i} style={{ height }} />)}</span>
      <span>Your next escape.<small>Just press play.</small></span>
      <span className={styles.notePlay}>▶</span>
    </div>
    <span className={styles.artworkCaption}>FOR THE LOVE OF A GOOD STORY</span>
  </div>;
}

export function Welcome({ ready, accountEnabled, onSignIn, onStart }: {
  ready: boolean;
  accountEnabled: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onStart: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSignIn(String(data.get("email")).trim(), String(data.get("password")));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.welcome}>
    <section className={styles.story} aria-labelledby="welcome-title">
      <a className={styles.brand} href="/" aria-label="Tome home">
        <svg width="29" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M15 7C11 4 6 4 2 5v20c5-1 9-1 13 2 4-3 8-3 13-2V5c-4-1-9-1-13 2Zm0 0v20" /><path d="M6 10c2 0 4 .3 6 1M6 15c2 0 4 .3 6 1m6-5c2-.7 4-1 6-1m-6 6c2-.7 4-1 6-1" /></svg>
        <span>tome<span className={styles.brandDot}>.</span></span>
      </a>
      <div className={styles.storyIntro}>
        <p className={styles.eyebrow}>A QUIETER WAY TO GET LOST</p>
        <h1 id="welcome-title">Good stories.<br /><em>Open ears.</em></h1>
        <p className={styles.storyDescription}>Turn your favorite web novels into your next great listen. A little escape, wherever life takes you.</p>
      </div>
      <BookArtwork />
      <div className={styles.storyFooter}><span>Made for your next chapter.</span><span>READ. LISTEN. WANDER.</span></div>
    </section>

    <section className={styles.entry} aria-labelledby="signin-title">
      <div className={styles.entryTop}><span>YOUR PERSONAL READING ROOM</span><span className={styles.spark}>✳</span></div>
      <div className={styles.entryContent}>
        <div className={styles.smallRule} />
        <p className={styles.entryEyebrow}>SETTLE IN. STAY A WHILE.</p>
        <h2 id="signin-title">{accountEnabled ? "Welcome back." : "Your story starts here."}</h2>
        <p className={styles.entryDescription}>{accountEnabled ? "Your library, your place, your next chapter. Sign in and pick up where you left off." : "Bring a chapter link. Find your favorite voice. Let the story take it from there."}</p>

        {!ready ? <div className={styles.loading} role="status"><span className={styles.spinner} /> Opening your library…</div> : accountEnabled ? <form className={styles.form} onSubmit={signIn} aria-busy={busy}>
          <div className={styles.field}>
            <label htmlFor="signin-email">Email</label>
            <input id="signin-email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required disabled={busy} spellCheck={false} autoCapitalize="none" />
          </div>
          <div className={styles.field}>
            <label htmlFor="signin-password">Password</label>
            <div className={styles.password}>
              <input id="signin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required disabled={busy} />
              <button type="button" className={styles.reveal} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
            </div>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} disabled={busy} type="submit"><span>{busy ? "Signing in…" : "Sign in"}</span>{busy ? <span className={styles.spinner} /> : <Arrow />}</button>
          <p className={styles.accountNote}>A familiar story. A new place to listen.<br />Use your Tome account to continue.</p>
        </form> : <div className={styles.localStart}>
          <button className={styles.submit} onClick={onStart}><span>Start listening</span><Arrow /></button>
          <p className={styles.accountNote}>No account needed. Your place is saved on this device.</p>
        </div>}

        <div className={styles.benefits}>
          <div><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></svg><span>Listen your way</span></div>
          <div><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z" /></svg><span>Keep your place</span></div>
          <div><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 5c-4-2-7-2-10-1v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Zm0 0v15" /></svg><span>Read along</span></div>
        </div>
      </div>
      <footer className={styles.entryFooter}>Less scrolling. <span>More story.</span></footer>
    </section>
  </main>;
}
