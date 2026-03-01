import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createGroup } from "./group.js";

// UI helpers for authenticated navbar, profile dropdown, and dashboard group rendering.

function setElementVisibility(element, shouldShow) {
  if (!element) return;
  element.style.display = shouldShow ? "" : "none";
}

let profileDropdownInitialized = false;

function initProfileDropdown() {
  if (profileDropdownInitialized) return;

  const profileBtn = document.getElementById("profileBtn");
  const dropdown = document.getElementById("profileDropdown");

  if (!profileBtn || !dropdown) return;

  profileBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isHidden =
      dropdown.style.display === "none" || dropdown.style.display === "";
    dropdown.style.display = isHidden ? "block" : "none";
  });

  window.addEventListener("click", (event) => {
    if (!dropdown || dropdown.style.display === "none") return;
    const target = event.target;
    if (
      target instanceof Node &&
      !dropdown.contains(target) &&
      target !== profileBtn
    ) {
      dropdown.style.display = "none";
    }
  });

  profileDropdownInitialized = true;
}

export function updateUIForLoggedIn(userData) {
  const loggedOut = document.getElementById("navLoggedOut");
  const loggedIn = document.getElementById("navLoggedIn");
  const nameEl = document.getElementById("navUserName");
  const emailEl = document.getElementById("navUserEmail");

  setElementVisibility(loggedOut, false);
  setElementVisibility(loggedIn, true);

  if (nameEl) {
    const name =
      userData?.name || userData?.displayName || userData?.email || "Member";
    nameEl.textContent = name;
  }

  if (emailEl) {
    emailEl.textContent = userData?.email || "";
  }

  initProfileDropdown();
}

export function updateUIForLoggedOut() {
  const loggedOut = document.getElementById("navLoggedOut");
  const loggedIn = document.getElementById("navLoggedIn");
  const nameEl = document.getElementById("navUserName");
  const emailEl = document.getElementById("navUserEmail");
  const dropdown = document.getElementById("profileDropdown");

  setElementVisibility(loggedOut, true);
  setElementVisibility(loggedIn, false);

  if (nameEl) nameEl.textContent = "";
  if (emailEl) emailEl.textContent = "";
  if (dropdown) dropdown.style.display = "none";
}

let groupsUIInitialized = false;

function getGroupFeedbackElement() {
  let feedbackEl = document.getElementById("groupMessage");
  if (feedbackEl) return feedbackEl;

  const form = document.getElementById("createGroupForm");
  if (!form || !form.parentElement) return null;

  feedbackEl = document.createElement("p");
  feedbackEl.id = "groupMessage";
  feedbackEl.style.marginTop = "0.5rem";
  form.parentElement.appendChild(feedbackEl);
  return feedbackEl;
}

function setGroupMessage(message, type = "success") {
  const feedbackEl = getGroupFeedbackElement();
  if (!feedbackEl) return;

  feedbackEl.textContent = message;
  feedbackEl.style.color = type === "error" ? "#b3261e" : "#2e7d32";
}

function initGroupsUI() {
  if (groupsUIInitialized) return;

  const form = document.getElementById("createGroupForm");
  const nameInput = document.getElementById("newGroupName");

  if (!form || !nameInput) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      setGroupMessage("Please enter a group name.", "error");
      return;
    }

    try {
      await createGroup(name);
      nameInput.value = "";
      await loadGroups();
      setGroupMessage("Group created successfully.", "success");
    } catch (error) {
      console.error("[ui] Failed to create group from UI:", error);
      setGroupMessage(error?.message || "Failed to create group.", "error");
    }
  });

  groupsUIInitialized = true;
}

export async function loadGroups() {
  const container = document.getElementById("userGroupsContainer");
  if (!container) return;

  initGroupsUI();
  const currentUser = window.currentUserData;
  if (!currentUser?.uid) {
    return;
  }

  container.innerHTML = "<p>Loading groups...</p>";

  try {
    const snapshot = await getDocs(collection(db, "groups"));
    const groups = snapshot.docs.map((groupDoc) => ({
      id: groupDoc.id,
      ...groupDoc.data(),
    }));

    renderGroups(groups);
  } catch (error) {
    console.error("[ui] Failed to load groups:", error);
    container.innerHTML =
      "<p>We couldn't load groups right now. Please try again later.</p>";
  }
}

function renderGroups(groups) {
  const container = document.getElementById("userGroupsContainer");
  if (!container) return;

  const currentUser = window.currentUserData;

  if (!groups.length) {
    container.innerHTML = "<p>No groups yet</p>";
    return;
  }

  container.innerHTML = "";

  groups.forEach((group) => {
    const card = document.createElement("section");
    card.className = "dashboard-card";
    card.style.cursor = "pointer";

    const title = document.createElement("h3");
    title.textContent = group.name || "Unnamed Group";
    card.appendChild(title);

    const status = document.createElement("p");
    status.innerHTML = `Status: <strong>${group.status || "-"}</strong>`;
    card.appendChild(status);

    const round = document.createElement("p");
    round.innerHTML = `Current round: <strong>${group.currentRound ?? "-"}</strong>`;
    card.appendChild(round);

    if (group.adminId === currentUser?.uid) {
      const badge = document.createElement("span");
      badge.textContent = "Admin";
      badge.style.display = "inline-block";
      badge.style.marginTop = "0.25rem";
      badge.style.padding = "0.125rem 0.5rem";
      badge.style.borderRadius = "999px";
      badge.style.background = "#eef4ff";
      badge.style.color = "#1f4ea3";
      badge.style.fontSize = "0.75rem";
      badge.style.fontWeight = "600";
      card.appendChild(badge);
    }

    card.addEventListener("click", () => {
      window.location.href = `group.html?id=${encodeURIComponent(group.id)}`;
    });

    container.appendChild(card);
  });
}