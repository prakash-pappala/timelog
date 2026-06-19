import { useState, useEffect } from "react";
import Auth from "./Auth";
import TimeTracker from "./TimeTracker";
import { api } from "./api";

export default function App() {
  const [username, setUsername] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    const savedUsername = window.sessionStorage.getItem("username");
    if (token && savedUsername) {
      setUsername(savedUsername);
    }
    setChecked(true);
  }, []);

  function handleAuthenticated(name) {
    window.sessionStorage.setItem("username", name);
    setUsername(name);
  }

  function handleLogout() {
    api.clearToken();
    window.sessionStorage.removeItem("username");
    setUsername(null);
  }

  if (!checked) return null;

  return username ? (
    <TimeTracker username={username} onLogout={handleLogout} />
  ) : (
    <Auth onAuthenticated={handleAuthenticated} />
  );
}
