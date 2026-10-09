import { t, translateMessage, useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useRegister } from "@/components/register-provider";
export function LoginScreen() {
  const locale = useI18n();
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
      locale,
    });
  }, [googleReady, clientID, db, signIn, locale]);

  return (
    <main className="login-screen">
      <div className="login-card">
        <span className="logo">M</span>
        <h1>Marpos</h1>
        <p>
          {t(
            "sign_in_online_to_prepare_your_register_you_can_then_sell_offline_for_30_days",
          )}
        </p>
        {notice && <div className="message">{translateMessage(notice)}</div>}
        {clientID ? (
          <div ref={googleButton} />
        ) : (
          <div className="message">
            {t("set_google_client_id_in_the_api_to_enable_google_sign_in")}
          </div>
        )}
      </div>
    </main>
  );
}
