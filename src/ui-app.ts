export function ownerConsoleHtml(relayOrigin: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Mail Owner Console</title>
  <link rel="icon" href="data:,">
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f5f1;
      --surface: #fffef9;
      --surface-muted: #eceee6;
      --surface-raised: #ffffff;
      --line: #d7d9cf;
      --line-strong: #b9bfae;
      --text: #1e241f;
      --muted: #667064;
      --faint: #858e82;
      --accent: #2c5f3d;
      --accent-soft: #e2eadf;
      --blue: #315f86;
      --blue-soft: #e2ebf2;
      --amber: #8c6400;
      --amber-soft: #f3ead2;
      --red: #9d3f3b;
      --red-soft: #f3dfdd;
      --ink: #fffef9;
      --shadow: 0 12px 34px rgba(48, 55, 44, 0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", ui-sans-serif, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
    }
    button, input, textarea, select {
      font: inherit;
    }
    button {
      border: 0;
      cursor: pointer;
      color: inherit;
    }
    button:focus-visible, input:focus-visible, textarea:focus-visible {
      outline: 2px solid rgba(44, 95, 61, 0.3);
      outline-offset: 2px;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: 60px 1fr;
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) repeat(3, minmax(104px, 124px)) 126px;
      gap: 8px;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 254, 249, 0.96);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.72);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .mark {
      width: 36px;
      height: 36px;
      border-radius: 7px;
      border: 1px solid var(--line-strong);
      background: var(--surface);
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }
    .mark::after {
      content: "LT";
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
    }
    .brand-title {
      line-height: 1.1;
      min-width: 0;
    }
    .brand-title strong {
      display: block;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .brand-title span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 7px 10px;
      min-width: 0;
    }
    .metric b {
      display: block;
      font-size: 13px;
    }
    .metric span {
      color: var(--muted);
      font-size: 11px;
    }
    .compose {
      height: 36px;
      border-radius: 8px;
      color: var(--ink);
      background: #243326;
      font-weight: 700;
      border: 1px solid #243326;
    }
    .compose:hover {
      background: #324937;
    }
    .layout {
      display: grid;
      grid-template-columns: 256px minmax(360px, 1fr) 382px;
      min-height: 0;
    }
    .pane {
      min-height: calc(100vh - 60px);
      border-right: 1px solid var(--line);
      background: rgba(255, 254, 249, 0.72);
    }
    .pane:last-child {
      border-right: 0;
    }
    .pane-head {
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(236, 238, 230, 0.68);
    }
    .pane-head h2 {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    .status {
      border-radius: 999px;
      padding: 3px 9px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status.warn {
      background: var(--amber-soft);
      color: var(--amber);
    }
    .list {
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 12px;
      text-align: left;
    }
    .agent-card.active, .mail-row.active {
      border-color: var(--accent);
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .card strong {
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .card small {
      color: var(--muted);
      display: block;
      overflow-wrap: anywhere;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 9px;
    }
    .chip {
      border-radius: 999px;
      padding: 3px 8px 4px;
      background: var(--blue-soft);
      color: var(--blue);
      font-size: 11px;
      font-weight: 600;
    }
    .chip.teal {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .chip.amber {
      background: var(--amber-soft);
      color: var(--amber);
    }
    .mail-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 12px;
      text-align: left;
      color: var(--text);
      min-height: 92px;
    }
    .mail-row:hover, .card:hover {
      border-color: var(--line-strong);
      background: var(--surface-raised);
    }
    .mail-row h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
    }
    .mail-row p {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .score {
      color: var(--accent);
      font-weight: 700;
      font-size: 13px;
      min-width: 28px;
      text-align: right;
    }
    .detail-body {
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .detail-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 12px;
    }
    .detail-box h3 {
      margin: 0 0 8px;
      font-size: 13px;
    }
    .detail-box pre {
      margin: 0;
      max-height: 250px;
      overflow: auto;
      color: #2d352e;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.45;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .action {
      height: 36px;
      border-radius: 8px;
      font-weight: 700;
      background: var(--accent);
      color: var(--ink);
    }
    .action.secondary {
      background: var(--surface-muted);
      color: var(--text);
      border: 1px solid var(--line);
    }
    .action.danger {
      background: var(--red-soft);
      color: var(--red);
      border: 1px solid rgba(157, 63, 59, 0.22);
    }
    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-panel {
      width: min(920px, 100%);
      display: grid;
      grid-template-columns: 1fr 360px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .login-copy {
      padding: 32px;
      background: var(--surface-muted);
      border-right: 1px solid var(--line);
      display: grid;
      align-content: center;
      gap: 16px;
    }
    .login-copy h1 {
      margin: 0 0 12px;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.12;
      letter-spacing: 0;
    }
    .login-copy p {
      margin: 0;
      color: var(--muted);
      max-width: 560px;
      line-height: 1.65;
    }
    .login-form {
      padding: 24px;
      display: grid;
      gap: 12px;
      align-content: center;
      background: var(--surface);
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fffdfa;
      color: var(--text);
      padding: 10px;
      outline: none;
    }
    input::placeholder, textarea::placeholder {
      color: #9aa198;
    }
    textarea {
      min-height: 92px;
      resize: vertical;
    }
    .primary {
      height: 40px;
      border-radius: 8px;
      color: var(--ink);
      background: var(--accent);
      font-weight: 700;
    }
    .primary:hover, .action:hover {
      filter: brightness(0.96);
    }
    .codebox {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f7f5ef;
      color: #263229;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hidden {
      display: none !important;
    }
    .notice {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .empty {
      color: var(--muted);
      padding: 18px;
      text-align: center;
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: rgba(255, 254, 249, 0.68);
    }
    dialog {
      width: min(620px, calc(100vw - 28px));
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      padding: 0;
      box-shadow: var(--shadow);
    }
    dialog::backdrop {
      background: rgba(30, 36, 31, 0.36);
    }
    .dialog-body {
      padding: 18px;
      display: grid;
      gap: 12px;
    }
    .dialog-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-muted);
    }
    .dialog-head h2 {
      margin: 0;
      font-size: 16px;
    }
    @media (max-width: 1020px) {
      .topbar {
        grid-template-columns: 1fr 1fr;
        height: auto;
        position: static;
      }
      .layout {
        grid-template-columns: 1fr;
      }
      .pane {
        min-height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
    }
    @media (max-width: 760px) {
      .login-panel {
        grid-template-columns: 1fr;
      }
      .login-copy {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <main id="login" class="login">
    <section class="login-panel">
      <div class="login-copy">
        <div class="mark" aria-hidden="true"></div>
        <h1>Agent Mail Owner Console</h1>
        <p>Sign in with an Agent-owned DID, review signed task mail, inspect delivery state, and settle attention credits. Private keys stay in the Agent CLI environment.</p>
      </div>
      <div class="login-form">
        <label>Agent DID
          <input id="loginDid" placeholder="did:key:researcher or did:web:nervafs.xyz">
        </label>
        <label>Agent ID
          <input id="loginAgentId" placeholder="did:key:researcher#default">
        </label>
        <button id="challengeButton" class="primary">Create CLI verification code</button>
        <div id="challengeOutput" class="codebox hidden"></div>
        <button id="completeButton" class="primary hidden">I ran the CLI command</button>
        <p class="notice">Run <b>ltmail auth login</b> from the agent environment. The browser receives only a short-lived session cookie.</p>
      </div>
    </section>
  </main>

  <main id="console" class="app hidden">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div class="brand-title">
          <strong>Agent Mail Owner Console</strong>
          <span id="activeDid">Not signed in</span>
        </div>
      </div>
      <div class="metric"><b id="inboxCount">0</b><span>Inbox</span></div>
      <div class="metric"><b id="heldCredits">0</b><span>Held credits</span></div>
      <div class="metric"><b id="activeLeases">0</b><span>Active leases</span></div>
      <button id="composeButton" class="compose">+ Compose</button>
    </header>
    <section class="layout">
      <aside class="pane">
        <div class="pane-head"><h2>Agents</h2><span class="status">session</span></div>
        <div id="agents" class="list"></div>
      </aside>
      <section class="pane">
        <div class="pane-head"><h2>Priority Inbox</h2><span id="mailboxState" class="status warn">sync</span></div>
        <div id="messages" class="list"></div>
      </section>
      <aside class="pane">
        <div class="pane-head"><h2>Envelope</h2><button id="logoutButton" class="action secondary">Logout</button></div>
        <div id="detail" class="detail-body"></div>
      </aside>
    </section>
  </main>

  <dialog id="composeDialog">
    <form id="composeForm" method="dialog">
      <div class="dialog-head"><h2>Compose Task Mail</h2><button class="action secondary" value="cancel">Close</button></div>
      <div class="dialog-body">
        <label>To DID<input id="composeTo" required></label>
        <label>Goal<textarea id="composeGoal" required></textarea></label>
        <label>Postage credits<input id="composePostage" type="number" min="0" value="0"></label>
        <button class="primary" value="default">Send task.request</button>
        <p class="notice">Attachments are disabled in Phase 1.</p>
      </div>
    </form>
  </dialog>

  <script>
    const relayOrigin = ${JSON.stringify(relayOrigin)};
    const state = { session: null, mailboxId: null, messages: [], selected: null, challenge: null };
    const el = (id) => document.getElementById(id);
    const api = async (path, options = {}) => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || response.statusText);
      return data;
    };

    function showLogin() {
      el("login").classList.remove("hidden");
      el("console").classList.add("hidden");
    }

    function showConsole() {
      el("login").classList.add("hidden");
      el("console").classList.remove("hidden");
    }

    async function loadSession() {
      try {
        state.session = await api("/v0/ui/session");
        showConsole();
        await loadMailboxes();
      } catch {
        showLogin();
      }
    }

    async function loadMailboxes() {
      const data = await api("/v0/ui/mailboxes");
      el("activeDid").textContent = state.session.did;
      el("heldCredits").textContent = data.credits?.held ?? 0;
      el("agents").innerHTML = "";
      for (const box of data.mailboxes) {
        const card = document.createElement("button");
        card.className = "card agent-card active";
        card.innerHTML = "<strong>" + escapeHtml(box.displayName || box.agentId || box.did) + "</strong><small>" + escapeHtml(box.mailboxId) + "</small><div class='chips'><span class='chip teal'>owner</span><span class='chip'>balance " + (data.credits?.balance ?? 0) + "</span></div>";
        card.onclick = () => loadMessages(box.mailboxId);
        el("agents").appendChild(card);
        if (!state.mailboxId) state.mailboxId = box.mailboxId;
      }
      if (!data.mailboxes.length) {
        el("agents").innerHTML = "<div class='empty'>No registered agent for this DID yet.</div>";
      }
      if (state.mailboxId) await loadMessages(state.mailboxId);
    }

    async function loadMessages(mailboxId) {
      state.mailboxId = mailboxId;
      el("mailboxState").textContent = "loading";
      const data = await api("/v0/ui/mailboxes/" + encodeURIComponent(mailboxId) + "/messages?cursor=0");
      state.messages = data.messages || [];
      el("inboxCount").textContent = state.messages.length;
      el("activeLeases").textContent = state.messages.filter((row) => row.deliveryState === "claimed").length;
      el("mailboxState").textContent = "synced";
      renderMessages();
    }

    function renderMessages() {
      const container = el("messages");
      container.innerHTML = "";
      if (!state.messages.length) {
        container.innerHTML = "<div class='empty'>Mailbox is empty. Compose a task mail or wait for incoming work.</div>";
        el("detail").innerHTML = "<div class='empty'>Select a message to inspect its envelope.</div>";
        return;
      }
      state.messages.forEach((row, index) => {
        const button = document.createElement("button");
        button.className = "mail-row" + (index === 0 ? " active" : "");
        const raw = row.message?.raw || {};
        const goal = raw.body?.goal || row.message?.thread || row.message?.type;
        button.innerHTML = "<div><h3>" + escapeHtml(row.message?.type || row.messageId) + " · " + escapeHtml(goal || "No goal") + "</h3><p>from " + escapeHtml(row.senderDid) + " · " + row.deliveryState + " · postage " + row.postageCredits + "</p><div class='chips'><span class='chip teal'>" + row.deliveryState + "</span><span class='chip amber'>score " + row.priorityScore + "</span></div></div><div class='score'>" + row.postageCredits + "</div>";
        button.onclick = () => selectMessage(row, button);
        container.appendChild(button);
        if (index === 0) selectMessage(row, button);
      });
    }

    function selectMessage(row, button) {
      state.selected = row;
      document.querySelectorAll(".mail-row").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      const raw = row.message?.raw || {};
      el("detail").innerHTML = "<div class='detail-box'><h3>Signature</h3><pre>DID envelope accepted by relay\\nSender: " + escapeHtml(row.senderDid) + "\\nRecipient: " + escapeHtml(row.recipientDid) + "</pre></div>" +
        "<div class='detail-box'><h3>Execution</h3><pre>state: " + row.deliveryState + "\\nleaseUntil: " + (row.leaseUntil || "none") + "\\npriorityScore: " + row.priorityScore + "</pre></div>" +
        "<div class='detail-box'><h3>Credits</h3><pre>postage: " + row.postageCredits + "\\nsettles on ack, refunds on reject</pre></div>" +
        "<div class='detail-box'><h3>Body</h3><pre>" + escapeHtml(JSON.stringify(raw, null, 2)) + "</pre></div>" +
        "<div class='actions'><button class='action' id='claimSelected'>Claim</button><button class='action secondary' id='ackSelected'>Ack</button><button class='action danger' id='rejectSelected'>Reject</button></div>";
      el("claimSelected").onclick = () => claimSelected();
      el("ackSelected").onclick = () => ackSelected("acked");
      el("rejectSelected").onclick = () => ackSelected("rejected");
    }

    async function claimSelected() {
      if (!state.selected) return;
      await api("/v0/ui/mailboxes/" + encodeURIComponent(state.mailboxId) + "/claim", {
        method: "POST",
        body: JSON.stringify({ messageId: state.selected.messageId, leaseSeconds: 300 })
      });
      await loadMessages(state.mailboxId);
    }

    async function ackSelected(status) {
      if (!state.selected) return;
      await api("/v0/ui/messages/" + encodeURIComponent(state.selected.messageId) + "/ack", {
        method: "POST",
        body: JSON.stringify({ mailboxId: state.mailboxId, state: status })
      });
      await loadMessages(state.mailboxId);
    }

    el("challengeButton").onclick = async () => {
      const did = el("loginDid").value.trim();
      const agentId = el("loginAgentId").value.trim();
      if (!did) return;
      const challenge = await api("/v0/ui/login/challenge", {
        method: "POST",
        body: JSON.stringify({ did, agentId: agentId || undefined })
      });
      state.challenge = challenge;
      el("challengeOutput").classList.remove("hidden");
      el("completeButton").classList.remove("hidden");
      el("challengeOutput").textContent = "Code: " + challenge.code + "\\n\\n" + challenge.command;
    };

    el("completeButton").onclick = async () => {
      if (!state.challenge) return;
      await api("/v0/ui/login/complete", {
        method: "POST",
        body: JSON.stringify({ code: state.challenge.code })
      });
      await loadSession();
    };

    el("logoutButton").onclick = async () => {
      await api("/v0/ui/logout", { method: "POST", body: "{}" }).catch(() => {});
      state.session = null;
      showLogin();
    };

    el("composeButton").onclick = () => el("composeDialog").showModal();
    el("composeForm").onsubmit = async (event) => {
      event.preventDefault();
      await api("/v0/ui/messages", {
        method: "POST",
        body: JSON.stringify({
          type: "task.request",
          to: [el("composeTo").value.trim()],
          body: { goal: el("composeGoal").value.trim() },
          postage: { creditAmount: Number(el("composePostage").value || "0") },
          attachments: []
        })
      });
      el("composeDialog").close();
      await loadMessages(state.mailboxId);
    };

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    loadSession();
  </script>
</body>
</html>`;
}
