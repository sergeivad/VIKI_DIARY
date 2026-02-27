import { AppProvider } from "./components/app-context";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const { initData } = useTelegram();

  if (initData) {
    api.setInitData(initData);
  }

  return <AppProvider ready={!!initData} />;
}
