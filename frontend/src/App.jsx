import { useState, useEffect } from "react";
import Auth from "./Auth";
import TimeTracker from "./TimeTracker";
import { api } from "./api";

export default function App() {
  const [username, setUsername] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [resetToken, setResetToken] = useState(null);

  useEffect(() => {
    // Check for password reset token in URL
    const params = new URLSearchParams(window.location.search);
    const urlResetToken = params.get("reset_token") || params.get("token");
    if (urlResetToken) {
      setResetToken(urlResetToken);
      setChecked(true);
      return;
    }

    const token = api.getToken();
    const savedUsername = window.localStorage.getItem("username");
    const savedIsAdmin = window.localStorage.getItem("isAdmin") === "true";

    if (token && savedUsername) {
      // Verify token is still valid by making a real API call
      api.getCategories()
        .then(() => {
          setUsername(savedUsername);
          setIsAdmin(savedIsAdmin);
          setChecked(true);
        })
        .catch(() => {
          // Token is invalid or expired — clear and show login
          api.clearToken();
          window.localStorage.removeItem("username");
          window.localStorage.removeItem("isAdmin");
          setChecked(true);
        });
    } else {
      setChecked(true);
    }
  }, []);

  function handleAuthenticated(name, adminFlag) {
    window.localStorage.setItem("username", name);
    window.localStorage.setItem("isAdmin", adminFlag ? "true" : "false");
    setUsername(name);
    setIsAdmin(!!adminFlag);
    setResetToken(null);
  }

  function handleLogout() {
    api.clearToken();
    window.localStorage.removeItem("username");
    window.localStorage.removeItem("isAdmin");
    setUsername(null);
    setIsAdmin(false);
  }

  if (!checked) return null;

  // Show auth with reset token if coming from password reset link
  if (resetToken) {
    return <Auth onAuthenticated={handleAuthenticated} resetToken={resetToken} />;
  }

  return username ? (
    <TimeTracker username={username} isAdmin={isAdmin} onLogout={handleLogout} />
  ) : (
    <Auth onAuthenticated={handleAuthenticated} />
  );
}
