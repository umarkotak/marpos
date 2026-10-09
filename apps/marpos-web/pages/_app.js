import "@/styles/globals.css";
import { LanguagePreference } from "@/lib/i18n";
import { RegisterProvider } from "@/components/register-provider";
import { RegisterLayout } from "@/components/layout/register-layout";

export default function App({ Component, pageProps }) {
  return (
    <RegisterProvider>
      <LanguagePreference />
      <RegisterLayout>
        <Component {...pageProps} />
      </RegisterLayout>
    </RegisterProvider>
  );
}
