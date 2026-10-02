import { useEffect, useRef, useState } from "react";
import { useRegister } from "@/components/register-provider";
export function LoginScreen() {
  const { appConfig, db, signIn, notice } = useRegister();
  const clientID = appConfig?.google_client_id || "";
  const googleButton = useRef(null);
  const [googleReady, setGoogleReady] = useState(false);
  useEffect(() => {
    if (!clientID) return;
    if (window.google?.accounts?.id) {
      setGoogleReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
    return () => {
      script.onload = null;
    };
  }, [clientID]);

  useEffect(() => {
    if (!googleReady || !clientID || !googleButton.current || !db) return;
    window.google.accounts.id.initialize({
      client_id: clientID,
      callback: async ({ credential }) => {
        await signIn({ credential });
      },
    });
    googleButton.current.replaceChildren();
    window.google.accounts.id.renderButton(googleButton.current, {
      theme: "outline",
      size: "large",
      width: 280,
    });
  }, [googleReady, clientID, db, signIn]);

  return (
    <main className="login-screen">
      <div className="login-card">
        <span className="logo">M</span>
        <h1>Marpos</h1>
        <p>
          Sign in online to prepare your register. You can then sell offline for
          30 days.
        </p>
        {notice && <div className="message">{notice}</div>}
        {clientID ? (
          <div ref={googleButton} />
        ) : (
          <div className="message">
            Set GOOGLE_CLIENT_ID in the API to enable Google sign-in.
          </div>
        )}
      </div>
    </main>
  );
}
