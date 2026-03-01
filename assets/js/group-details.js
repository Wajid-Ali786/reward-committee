import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function getGroupIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

async function loadGroupDetails() {
  const groupId = getGroupIdFromUrl();
  if (!groupId) {
    setText("groupDetailsError", "Missing group id.");
    return;
  }

  try {
    const groupRef = doc(db, "groups", groupId);
    const groupSnapshot = await getDoc(groupRef);

    if (!groupSnapshot.exists()) {
      setText("groupDetailsError", "Group not found.");
      return;
    }

    const group = groupSnapshot.data();

    setText("groupDetailsName", group.name || "Unnamed Group");
    setText("groupDetailsStatus", group.status || "-");
    setText("groupDetailsRound", String(group.currentRound ?? "-"));
    setText("groupDetailsAdmin", group.adminId || "-");

    const membersList = document.getElementById("groupMembersList");
    if (!membersList) return;

    const membersSnapshot = await getDocs(collection(db, "groups", groupId, "members"));
    membersList.innerHTML = "";

    if (membersSnapshot.empty) {
      membersList.innerHTML = "<li>No members yet.</li>";
      return;
    }

    membersSnapshot.forEach((memberDoc) => {
      const li = document.createElement("li");
      const member = memberDoc.data();
      li.textContent = `${memberDoc.id} — ${member.role || "member"} (${member.status || "active"})`;
      membersList.appendChild(li);
    });
  } catch (error) {
    console.error("[group-details] Failed to load group details:", error);
    setText("groupDetailsError", "Unable to load group details.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadGroupDetails, { once: true });
} else {
  loadGroupDetails();
}