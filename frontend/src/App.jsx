import { useState, useEffect } from "react";
import Auth from "./Auth";
import TimeTracker from "./TimeTracker";
import { api } from "./api";

export default function App() {
  const [username, setUsername] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    const savedUsername = window.localStorage.getItem("username");
    const savedIsAdmin = window.localStorage.getItem("isAdmin") === "true";
    if (token && savedUsername) {
      setUsername(savedUsername);
      setIsAdmin(savedIsAdmin);
    }
    setChecked(true);
  }, []);

  function handleAuthenticated(name, adminFlag) {
    window.localStorage.setItem("username", name);
    window.localStorage.setItem("isAdmin", adminFlag ? "true" : "false");
    setUsername(name);
    setIsAdmin(!!adminFlag);
  }

  function handleLogout() {
    api.clearToken();
    window.localStorage.removeItem("username");
    window.localStorage.removeItem("isAdmin");
    setUsername(null);
    setIsAdmin(false);
  }

  if (!checked) return null;

  return username ? (
    <TimeTracker username={username} isAdmin={isAdmin} onLogout={handleLogout} />
  ) : (
    <Auth onAuthenticated={handleAuthenticated} />
  );
}
