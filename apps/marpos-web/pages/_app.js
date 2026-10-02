import "@/styles/globals.css";
import { RegisterProvider } from "@/components/register-provider";
import { RegisterLayout } from "@/components/layout/register-layout";

export default function App({ Component, pageProps }) {
  return (
    <RegisterProvider>
      <RegisterLayout>
        <Component {...pageProps} />
      </RegisterLayout>
    </RegisterProvider>
  );
}
