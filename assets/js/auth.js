import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { updateUIForLoggedIn, updateUIForLoggedOut } from "./ui.js";

const registerErrorMessages = {
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password should be at least 6 characters.",
};

const loginErrorMessages = {
  "auth/invalid-credential":
    "Incorrect email or password. Please double-check and try again.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/user-not-found":
    "No account found with this email. Please check or register.",
  "auth/wrong-password": "Incorrect password. Please try again.",
};

function setRegisterError(message) {
  const errorContainer = document.getElementById("register-error");
  if (!errorContainer) return;
  if (!message) {
    errorContainer.textContent = "";
    errorContainer.style.display = "none";
    return;
  }
  errorContainer.textContent = message;
  errorContainer.style.display = "block";
}

function normalizeUsername(username) {
  return (username || "").trim().toLowerCase();
}

function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return "Please choose a username.";
  }

  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return "Username must be 3-20 characters and use only lowercase letters, numbers, or underscore.";
  }

  return "";
}

export async function registerUser(name, username, email, password) {
  setRegisterError("");

  const fullName = (name || "").trim();
  const normalizedUsername = normalizeUsername(username);
  const usernameError = validateUsername(normalizedUsername);

  if (!fullName || !email || !password || usernameError) {
    setRegisterError(usernameError || "Please fill in all required fields.");
    return;
  }

  try {
    const usernameRef = doc(db, "usernames", normalizedUsername);
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
      setRegisterError("That username is already taken. Please choose another one.");
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const { uid } = userCredential.user;

    try {
      await runTransaction(db, async (transaction) => {
        const claimedUsername = await transaction.get(usernameRef);
        if (claimedUsername.exists()) {
          throw new Error("USERNAME_TAKEN");
        }

        transaction.set(doc(db, "users", uid), {
          name: fullName,
          fullName,
          username: normalizedUsername,
          email,
          roleGlobal: "member",
          status: "active",
          createdAt: serverTimestamp(),
        });

        transaction.set(usernameRef, {
          uid,
          createdAt: serverTimestamp(),
        });
      });
    } catch (error) {
      await deleteUser(userCredential.user);
      if (error?.message === "USERNAME_TAKEN") {
        setRegisterError("That username is already taken. Please choose another one.");
        return;
      }
      throw error;
    }

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error(
      "[auth] Failed to create user or write Firestore document:",
      error,
    );
    const message =
      (error.code && registerErrorMessages[error.code]) ||
      "We couldn't create your account. Please try again.";
    setRegisterError(message);
  }
}

const registerForm = document.getElementById("register-form");

if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nameInput = document.getElementById("register-name");
    const usernameInput = document.getElementById("register-username");
    const emailInput = document.getElementById("register-email");
    const passwordInput = document.getElementById("register-password");

    const name = nameInput?.value?.trim() ?? "";
    const username = usernameInput?.value?.trim() ?? "";
    const email = emailInput?.value?.trim() ?? "";
    const password = passwordInput?.value ?? "";

    await registerUser(name, username, email, password);
  });
}

function setLoginError(message) {
  const errorContainer = document.getElementById("login-error");
  if (!errorContainer) return;
  if (!message) {
    errorContainer.textContent = "";
    errorContainer.style.display = "none";
    return;
  }
  errorContainer.textContent = message;
  errorContainer.style.display = "block";
}

function setResetMessage(message, isError = false) {
  const container = document.getElementById("reset-message");
  if (!container) return;

  if (!message) {
    container.textContent = "";
    container.style.display = "none";
    return;
  }

  container.textContent = message;
  container.style.display = "block";
  container.dataset.state = isError ? "error" : "success";
}

export async function loginUser(email, password) {
  setLoginError("");

  if (!email || !password) {
    setLoginError("Please enter both email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (error) {
    const message =
      (error.code && loginErrorMessages[error.code]) ||
      "We couldn't sign you in. Please try again.";
    setLoginError(message);
  }
}

const loginForm = document.getElementById("login-form");
const resetForm = document.getElementById("reset-form");
const resetToggle = document.getElementById("forgot-password-toggle");
const resetSection = document.getElementById("reset-section");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");

    const email = emailInput?.value?.trim() ?? "";
    const password = passwordInput?.value ?? "";

    await loginUser(email, password);
  });
}

if (resetToggle && resetSection) {
  resetToggle.addEventListener("click", () => {
    const isHidden = resetSection.hasAttribute("hidden");
    if (isHidden) {
      resetSection.removeAttribute("hidden");
    } else {
      resetSection.setAttribute("hidden", "");
    }
  });
}

if (resetForm) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById("reset-email");
    const email = emailInput?.value?.trim() ?? "";
    await resetPassword(email);
  });
}

export async function resetPassword(email) {
  setResetMessage("");

  if (!email) {
    setResetMessage(
      "Please enter your email address to reset your password.",
      true,
    );
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setResetMessage(
      "If an account exists for this email, a password reset link has been sent.",
    );
  } catch (error) {
    console.error("Password reset error:", error);
    setResetMessage(
      "If an account exists for this email, a password reset link has been sent.",
      true,
    );
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } finally {
    window.location.href = "login.html";
  }
}

function attachLogoutHandler() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  const handler = async (event) => {
    event.preventDefault();
    await logoutUser();
  };

  // Avoid duplicate listeners by resetting first.
  logoutBtn.replaceWith(logoutBtn.cloneNode(true));
  const freshLogoutBtn = document.getElementById("logoutBtn");
  if (!freshLogoutBtn) return;
  freshLogoutBtn.addEventListener("click", handler);
}

export function initAuthListener() {
  const setup = () => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.currentUserData = null;
        try {
          updateUIForLoggedOut();
        } catch (error) {
          console.error("[auth] Failed to run updateUIForLoggedOut:", error);
        }
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);

        let userData = {
          uid: user.uid,
          email: user.email ?? null,
        };

        if (snapshot.exists()) {
          const docData = snapshot.data();
          if (docData && typeof docData === "object") {
            userData = { ...userData, ...docData };
          }
        } else {
          console.warn(
            "[auth] User document not found in initAuthListener for uid:",
            user.uid,
          );
        }

        window.currentUserData = userData;
        try {
          updateUIForLoggedIn(userData);
          attachLogoutHandler();
        } catch (error) {
          console.error("[auth] Failed to run updateUIForLoggedIn:", error);
        }
      } catch (error) {
        console.error(
          "[auth] Failed to fetch user document in initAuthListener:",
          {
            uid: user.uid,
            error,
          },
        );
        window.currentUserData = null;
        try {
          updateUIForLoggedOut();
        } catch (uiError) {
          console.error(
            "[auth] Failed to run updateUIForLoggedOut after error:",
            uiError,
          );
        }
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
}
