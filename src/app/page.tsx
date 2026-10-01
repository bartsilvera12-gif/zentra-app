import { AppProvider } from "@/store/AppContext";
import { ZentraApp } from "@/mobile/ZentraApp";

export default function Page() {
  return (
    <AppProvider>
      <ZentraApp />
    </AppProvider>
  );
}
