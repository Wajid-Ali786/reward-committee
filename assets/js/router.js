import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { loadGroups } from "./ui.js";

function redirectToLogin() {
  if (window.location.pathname.endsWith("login.html")) return;
  window.location.href = "login.html";
}

async function handleActiveUser(user) {
  try {
    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      console.warn(
        "[router] User document does not exist in Firestore for uid:",
        user.uid,
      );
      redirectToLogin();
      return false;
    }

    const data = snapshot.data();

    if (!data) {
      console.warn("[router] User document has no data for uid:", user.uid);
      redirectToLogin();
      return false;
    }

    if (data.status !== "active") {
      console.warn("[router] User status is not active; redirecting to login.", {
        uid: user.uid,
        status: data.status,
      });
      redirectToLogin();
      return false;
    }

    return true;
  } catch (error) {
    console.error("[router] Failed to verify user status:", {
      uid: user?.uid,
      error,
    });
    redirectToLogin();
    return false;
  }
}

async function waitForCurrentUserData(uid, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.currentUserData?.uid === uid) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}
export function protectDashboard() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }
    
    const isActive = await handleActiveUser(user);
    if (!isActive) {
      return;
    }

    const isDashboardPage = window.location.pathname.endsWith("dashboard.html");
    if (!isDashboardPage) {
      return;
    }

    const userReady = await waitForCurrentUserData(user.uid);
    if (!userReady) {
      console.warn("[router] currentUserData was not ready before loading groups.");
      return;
    }

    await loadGroups();
  });
}