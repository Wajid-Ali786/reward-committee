import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createGroup } from "./group.js";
import { decryptCardCode } from "./crypto-utils.js";

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
      userData?.username || userData?.fullName || userData?.name || userData?.displayName || userData?.email || "Member";
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
      badge.className = "badge badge-admin";
      card.appendChild(badge);
    }

    card.addEventListener("click", () => {
      window.location.href = `group.html?id=${encodeURIComponent(group.id)}`;
    });

    container.appendChild(card);
  });
}

export function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

export function setGroupDetailsError(message = "") {
  const errorEl = document.getElementById("groupDetailsError");
  if (!errorEl) return;
  errorEl.textContent = message;
}

export function setGroupActionMessage(message, type = "success") {
  const container = document.getElementById("groupActionMessage");
  if (!container) return;

  if (!message) {
    container.textContent = "";
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  container.textContent = message;
  container.style.color = type === "error" ? "#ff9f9f" : "#9cf0b5";
  
  showToast(message, type);
}

function showToast(message, type = "success") {
  if (!message) return;

  let viewport = document.getElementById("toastViewport");
  if (!viewport) {
    viewport = document.createElement("div");
    viewport.id = "toastViewport";
    viewport.className = "toast-viewport";
    document.body.appendChild(viewport);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type === "error" ? "error" : "success"}`;
  toast.textContent = message;
  viewport.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-leaving");
    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

export function setGroupLoadingState(isLoading) {
  const indicator = document.getElementById("groupLoadingState");
  if (!indicator) return;
  indicator.style.display = isLoading ? "block" : "none";
}

export function setJoinButtonState({
  show,
  loading = false,
  disabled = false,
  label = "Join Group",
}) {
  const button = document.getElementById("joinGroupBtn");
  if (!button) return;

  button.style.display = show ? "inline-flex" : "none";
  button.disabled = loading || disabled;
  button.textContent = loading ? "Joining..." : label;
}

export function setStartRoundButtonState({
  show,
  loading = false,
  disabled = false,
  label = "Start Next Round",
}) {
  const button = document.getElementById("startRoundBtn");
  if (!button) return;

  button.style.display = show ? "inline-flex" : "none";
  button.disabled = loading || disabled;
  button.textContent = loading ? "Starting..." : label;
}

function makeMemberBadge(role) {
  const badge = document.createElement("span");
  badge.className = role === "admin" ? "badge badge-admin" : "badge badge-member";
  badge.textContent = role === "admin" ? "Admin" : "Member";
  return badge;
}

export function renderGroupMembers({ members, isAdmin, currentUserId, onRemove, onRoleChange }) {
  const membersList = document.getElementById("groupMembersList");
  if (!membersList) return;

  membersList.innerHTML = "";

  if (!members.length) {
    membersList.innerHTML = '<li class="empty-state">No members yet.</li>';
    return;
  }

  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === "admin") return -1;
    if (b.role === "admin") return 1;
    return (a.username || "").localeCompare(b.username || "");
  });

  sortedMembers.forEach((member) => {
    const li = document.createElement("li");
    li.className = "member-row";

    const info = document.createElement("div");
    info.className = "member-info";

    const name = document.createElement("strong");
    name.textContent = member.username || "unknown_user";
    info.appendChild(name);

    const fullName = document.createElement("span");
    fullName.className = "member-status";
    fullName.textContent = member.fullName || "Unknown Member";
    info.appendChild(fullName);

    info.appendChild(makeMemberBadge(member.role));

    const status = document.createElement("span");
    status.className = "member-status";
    status.textContent = member.status || "active";
    info.appendChild(status);

    li.appendChild(info);

    if (isAdmin) {
      const controls = document.createElement("div");
      controls.className = "member-controls";

      const roleSelect = document.createElement("select");
      roleSelect.className = "member-role-select";
      roleSelect.dataset.memberId = member.id;

      const adminOption = document.createElement("option");
      adminOption.value = "admin";
      adminOption.textContent = "Admin";
      roleSelect.appendChild(adminOption);

      const memberOption = document.createElement("option");
      memberOption.value = "member";
      memberOption.textContent = "Member";
      roleSelect.appendChild(memberOption);

      roleSelect.value = member.role === "admin" ? "admin" : "member";
      roleSelect.disabled = member.id === currentUserId;
      roleSelect.addEventListener("change", async () => {
        if (typeof onRoleChange === "function") {
          await onRoleChange(member.id, roleSelect.value);
        }
      });

      controls.appendChild(roleSelect);

      if (member.role !== "admin") {
        const removeButton = document.createElement("button");
        removeButton.className = "btn-danger";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", async () => {
          if (typeof onRemove === "function") {
            await onRemove(member.id);
          }
        });
        controls.appendChild(removeButton);
      }

      li.appendChild(controls);
    }

    membersList.appendChild(li);
  });
}

export function renderRounds({ rounds, memberMap }) {
  const roundsList = document.getElementById("roundHistoryList");
  if (!roundsList) return;

  roundsList.innerHTML = "";

  if (!rounds.length) {
    roundsList.innerHTML = '<li class="empty-state centered-empty">No rounds started yet</li>';
    return;
  }

  rounds.forEach((round) => {
    const li = document.createElement("li");
    li.className = "round-row timeline-card";

    const payoutUsername = round.payoutUsername || memberMap.get(round.payoutUserId) || "-";
    const approvedTotal = Number(round.totalApprovedAmount || 0);
    const completedAt = round.completedAt?.toDate?.() || null;
    const completionText = completedAt ? completedAt.toLocaleString() : "In progress";
    li.innerHTML = `
      <div>
        <p><strong>Round ${round.roundNumber ?? "-"}</strong></p>
        <p>Payout username: <strong>${payoutUsername}</strong></p>
        <p>Total approved amount: <strong>${approvedTotal.toFixed(2)}</strong></p>
        <p>Completion date: <strong>${completionText}</strong></p>
      </div>
      <div>${createStatusBadgeHtml(round.status || "pending")}</div>
    `;
    
    roundsList.appendChild(li);
  });
}

function createStatusBadgeHtml(status) {
  const normalizedStatus = (status || "pending").toLowerCase();
  const labels = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return `<span class="status-badge status-${normalizedStatus}">${labels[normalizedStatus] || status}</span>`;
}

export function renderSubmissionStatus({ submission, roundStatus, payoutUsername }) {
  const container = document.getElementById("memberSubmissionStatus");
  if (!container) return;

  const status = submission?.status || "not_submitted";
  const adminNote = submission?.adminNote || "";
  const maskedCode = submission?.maskedCode || "-";

  container.innerHTML = `
    <p><strong>Round status:</strong> ${roundStatus || "pending"}</p>
    <p><strong>Payout username:</strong> ${payoutUsername || "-"}</p>
    <p><strong>Your submission status:</strong> ${createStatusBadgeHtml(status)}</p>
    <p><strong>Your card code:</strong> ${maskedCode}</p>
    ${status === "rejected" ? `<p><strong>Admin note:</strong> ${adminNote || "No note provided"}</p>` : ""}
  `;
}

export function renderAdminSubmissions({ submissions, onApprove, onReject, groupId }) {
  const container = document.getElementById("adminSubmissionsList");
  if (!container) return;

  container.innerHTML = "";
  if (!submissions.length) {
    container.innerHTML = '<p class="empty-state centered-empty">No submissions yet</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "submissions-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Username</th>
        <th>Full Name</th>
        <th>Brand</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Card Code</th>
        <th>Actions</th>
        </tr>
      </thead>
    `;

  const tbody = document.createElement("tbody");
  
    submissions.forEach((submission) => {
      const row = document.createElement("tr");
      const isPending = (submission.status || "pending") === "pending";
      row.innerHTML = `
        <td>${submission.username || "unknown_user"}</td>
        <td>${submission.fullName || "Unknown Member"}</td>
        <td>${submission.brand || "-"}</td>
        <td>${Number(submission.giftCardAmount || 0).toFixed(2)}</td>
        <td>${createStatusBadgeHtml(submission.status || "pending")}</td>
        <td class="code-cell"></td>
        <td class="table-actions"></td>
      `;

      const codeCell = row.querySelector(".code-cell");
      const masked = submission.maskedCode || "-";
      const codeText = document.createElement("span");
      codeText.textContent = masked;
      codeCell?.appendChild(codeText);
  
      if (submission.encryptedCode && groupId) {
        const toggleCodeBtn = document.createElement("button");
        toggleCodeBtn.type = "button";
        toggleCodeBtn.className = "btn-primary btn-small";
        toggleCodeBtn.textContent = "Show code";
        let revealed = false;
        toggleCodeBtn.addEventListener("click", () => {
          revealed = !revealed;
          if (revealed) {
            const fullCode = decryptCardCode(groupId, submission.encryptedCode) || masked;
            codeText.textContent = fullCode;
            toggleCodeBtn.textContent = "Hide code";
            console.info("[admin] decrypted card code viewed", submission.uid || submission.id);
          } else {
            codeText.textContent = masked;
            toggleCodeBtn.textContent = "Show code";
      }
    });
    codeCell?.appendChild(toggleCodeBtn);
  }

  const actionsCell = row.querySelector(".table-actions");
  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.className = "btn-primary";
  approveBtn.textContent = "Approve";
  approveBtn.disabled = !isPending;
  approveBtn.addEventListener("click", async () => {
    if (typeof onApprove === "function") {
      await onApprove(submission.uid || submission.id);
    }
  });

  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.className = "btn-danger";
  rejectBtn.textContent = "Reject";
  rejectBtn.disabled = !isPending;
  rejectBtn.addEventListener("click", async () => {
    if (typeof onReject === "function") {
      await onReject(submission.uid || submission.id);
    }
  });
      
  actionsCell?.appendChild(approveBtn);
  actionsCell?.appendChild(rejectBtn);
  tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

export function renderAdminSummary(summary) {
  const container = document.getElementById("adminSummary");
  if (!container) return;

  container.innerHTML = `
    <p><strong>Total members:</strong> ${summary.totalMembers}</p>
    <p><strong>Submitted count:</strong> ${summary.submittedCount}</p>
    <p><strong>Approved count:</strong> ${summary.approvedCount}</p>
    <p><strong>Rejected count:</strong> ${summary.rejectedCount}</p>
    <p><strong>Total expected amount:</strong> ${summary.totalExpectedAmount.toFixed(2)}</p>
    <p><strong>Total approved amount:</strong> ${summary.totalApprovedAmount.toFixed(2)}</p>
    <p><strong>Current payout username:</strong> ${summary.currentPayoutUsername || "-"}</p>
  `;
}

export function renderGroupOverview(summary) {
  setText("overviewTotalMembers", String(summary.totalMembers || 0));
  setText("overviewApprovedCount", String(summary.approvedCount || 0));
  setText("overviewPendingCount", String(summary.pendingCount || 0));
  setText("overviewTotalExpected", Number(summary.totalExpectedAmount || 0).toFixed(2));
  setText("overviewTotalApproved", Number(summary.totalApprovedAmount || 0).toFixed(2));
}

export function renderRoundProgress({ approvedCount = 0, totalMembers = 0 }) {
  const safeTotal = Math.max(0, Number(totalMembers || 0));
  const safeApproved = Math.max(0, Number(approvedCount || 0));
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeApproved / safeTotal) * 100)) : 0;

  const label = document.getElementById("roundProgressLabel");
  const fill = document.getElementById("roundProgressFill");
  const track = document.querySelector(".round-progress-track");

  if (label) {
    label.textContent = `${percent}% (${safeApproved}/${safeTotal})`;
  }

  if (fill) {
    fill.style.width = `${percent}%`;
  }

  if (track) {
    track.setAttribute("aria-valuenow", String(percent));
  }
}