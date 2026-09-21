"use client";

import { useState, type FormEvent } from "react";
import styles from "./Welcome.module.css";

function Arrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" /></svg>;
}

function PagePreview() {
  return <div className={styles.preview} aria-hidden="true">
    <div className={styles.previewPage}>
      <p className={styles.previewEyebrow}>Chapter 1</p>
      <p className={styles.previewTitle}>A world waiting to be heard.</p>
      <p>Somewhere between the pages, the rest of the world grew quiet. There was only the story, and what came next.</p>
    </div>
    <div className={styles.previewPlayer}>
      <span className={styles.previewPlay}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.2-7.5a1 1 0 0 0 0-1.66L8.55 3.67A1 1 0 0 0 7 4.5Z" /></svg></span>
      <span className={styles.previewTrack}>
        <span>One more chapter</span>
        <span className={styles.previewProgress}><span /></span>
      </span>
      <span className={styles.eq}>{[0, 1, 2, 3].map((i) => <i key={i} style={{ animationDelay: `${i * 150}ms` }} />)}</span>
    </div>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width="40" height="40" className={styles.darkLogo} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.png" alt="" width="40" height="40" className={styles.lightLogo} />
        <span>Tome</span>
      </a>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>A quieter way to get lost</p>
        <h1 id="welcome-title">Good stories.<br /><em>Open ears.</em></h1>
        <p className={styles.pitch}>Paste a link to any web novel. Read it in a reader built for long nights, or have it read to you.</p>
      </div>
      <PagePreview />
    </section>

    <section className={styles.entry} aria-labelledby="signin-title">
      <h2 id="signin-title">{accountEnabled ? "Welcome back." : "Your story starts here."}</h2>
      <p className={styles.entryDescription}>{accountEnabled ? "Your library, your place, your next chapter." : "Bring a chapter link. Pick a voice. Let the story take it from there."}</p>

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
        {error && <div className={styles.errorBox}>
          <p className={styles.error} role="alert">{error}</p>
          <p className={styles.errorHint}>Check the email and password for typos, then try again.</p>
        </div>}
        <button className={styles.submit} disabled={busy} type="submit"><span>{busy ? "Signing in…" : "Sign in"}</span>{busy ? <span className={styles.spinner} /> : <Arrow />}</button>
        <p className={styles.note}>Use your Tome account to pick up where you left off.</p>
      </form> : <div className={styles.localStart}>
        <button className={styles.submit} onClick={onStart}><span>Start reading</span><Arrow /></button>
        <p className={styles.note}>No account needed. Your place is saved on this device.</p>
      </div>}
    </section>
  </main>;
}
