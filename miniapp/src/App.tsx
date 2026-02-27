import { useEffect } from "react";
import { AppProvider } from "./components/app-context";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const { initData } = useTelegram();

  useEffect(() => {
    if (initData) {
      api.setInitData(initData);
    }
  }, [initData]);

  return <AppProvider />;
}
