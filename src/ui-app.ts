export function ownerConsoleHtml(relayOrigin: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nerva Mail 主控台</title>
  <link rel="icon" href="data:,">
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Geist:wght@300;400;450;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap");
    :root {
      color-scheme: light;
      --bg: #f9fafc;
      --bg-sink: #f1f3f5;
      --panel: #fbfcfe;
      --panel-2: #f4f6f8;
      --card: #ffffff;
      --card-hover: #f5f7f9;
      --raised: #ffffff;
      --border: #e0e2e5;
      --border-soft: #ebedef;
      --border-strong: #ced1d5;
      --text: #1b1e24;
      --text-2: #54585f;
      --text-3: #7c8187;
      --text-4: #9b9fa4;
      --accent: #008b5a;
      --accent-2: #00764c;
      --accent-dim: rgba(0, 139, 90, 0.1);
      --accent-line: rgba(0, 139, 90, 0.28);
      --on-accent: #f6fef9;
      --info: #2e76b4;
      --info-dim: rgba(46, 118, 180, 0.1);
      --risk-med: #ba7419;
      --risk-med-bg: rgba(186, 116, 25, 0.11);
      --risk-high: #c92e3b;
      --risk-high-bg: rgba(201, 46, 59, 0.1);
      --r-xs: 5px;
      --r-sm: 7px;
      --r-md: 10px;
      --r-lg: 14px;
      --r-full: 999px;
      --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
      --shadow-md: 0 8px 26px -10px rgba(16, 24, 40, 0.16);
      --shadow-lg: 0 26px 60px -18px rgba(16, 24, 40, 0.22);
      --font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --font-mono: "Geist Mono", "SF Mono", "JetBrains Mono", ui-monospace, monospace;
      font-family: var(--font-sans);
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      letter-spacing: -0.006em;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      overflow: hidden;
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
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: 64px 1fr;
      background: var(--bg);
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(300px, 1fr) repeat(3, minmax(112px, 136px)) 124px;
      gap: 10px;
      align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid var(--border-soft);
      background: color-mix(in srgb, var(--panel), transparent 4%);
      box-shadow: var(--shadow-sm);
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
      border-radius: 11px;
      border: 1px solid var(--accent-line);
      background: linear-gradient(150deg, var(--accent) 0%, color-mix(in srgb, var(--accent), #000 18%) 100%);
      box-shadow: 0 2px 10px -2px var(--accent-line), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }
    .mark::after {
      content: "N";
      color: var(--on-accent);
      font-size: 15px;
      font-weight: 650;
      letter-spacing: -0.04em;
    }
    .brand-title {
      line-height: 1.1;
      min-width: 0;
    }
    .brand-title strong {
      display: block;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    .brand-title span {
      display: block;
      color: var(--text-3);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metric {
      border: 1px solid var(--border-soft);
      border-radius: var(--r-md);
      background: var(--card);
      padding: 7px 10px;
      min-width: 0;
      box-shadow: var(--shadow-sm);
    }
    .metric b {
      display: block;
      font-size: 13px;
    }
    .metric span {
      color: var(--text-3);
      font-size: 11px;
    }
    .compose {
      height: 36px;
      border-radius: var(--r-sm);
      color: var(--on-accent);
      background: var(--accent);
      font-weight: 550;
      border: 1px solid var(--accent);
    }
    .compose:hover {
      background: var(--accent-2);
    }
    .lang-toggle {
      height: 30px;
      padding: 0 10px;
      border-radius: var(--r-sm);
      background: var(--panel-2);
      color: var(--text-2);
      border: 1px solid var(--border);
      font-size: 12px;
      font-weight: 550;
      white-space: nowrap;
    }
    .lang-toggle:hover {
      background: var(--card-hover);
      color: var(--text);
      border-color: var(--border-strong);
    }
    .row {
      display: flex;
      align-items: center;
    }
    .gap-2 {
      gap: 8px;
    }
    .layout {
      display: grid;
      grid-template-columns: 280px minmax(360px, 1fr) 410px;
      min-height: 0;
    }
    .pane {
      min-height: calc(100vh - 64px);
      border-right: 1px solid var(--border-soft);
      background: var(--bg);
      overflow: auto;
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
      border-bottom: 1px solid var(--border-soft);
      background: var(--panel);
    }
    .pane-head h2 {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-3);
      font-family: var(--font-mono);
      font-weight: 500;
    }
    .status {
      border-radius: var(--r-full);
      padding: 4px 9px;
      background: var(--accent-dim);
      color: var(--accent);
      font-size: 11.5px;
      font-weight: 500;
      font-family: var(--font-mono);
      white-space: nowrap;
      box-shadow: inset 0 0 0 1px var(--accent-line);
    }
    .status.warn {
      background: var(--risk-med-bg);
      color: var(--risk-med);
      box-shadow: none;
    }
    .list {
      padding: 12px;
      display: grid;
      gap: 8px;
    }
    .card {
      border: 1px solid var(--border-soft);
      border-radius: var(--r-lg);
      background: var(--card);
      padding: 12px;
      text-align: left;
      box-shadow: var(--shadow-sm);
    }
    .agent-card.active, .mail-row.active {
      border-color: var(--accent);
      background: var(--accent-dim);
      box-shadow: inset 3px 0 0 var(--accent), var(--shadow-sm);
    }
    .card strong {
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .card small {
      color: var(--text-3);
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
      border-radius: var(--r-full);
      padding: 4px 8px;
      background: var(--panel-2);
      color: var(--text-2);
      font-size: 11.5px;
      font-weight: 500;
      font-family: var(--font-mono);
      box-shadow: inset 0 0 0 1px var(--border);
    }
    .chip.teal {
      background: var(--accent-dim);
      color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent-line);
    }
    .chip.amber {
      background: var(--risk-med-bg);
      color: var(--risk-med);
    }
    .mail-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      border: 1px solid var(--border-soft);
      border-radius: var(--r-lg);
      background: var(--card);
      padding: 12px;
      text-align: left;
      color: var(--text);
      min-height: 92px;
    }
    .mail-row:hover, .card:hover {
      border-color: var(--border-strong);
      background: var(--card-hover);
      transform: translateY(-1px);
    }
    .mail-row h3 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 650;
      line-height: 1.35;
    }
    .mail-row p {
      margin: 0;
      color: var(--text-3);
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
      border: 1px solid var(--border-soft);
      border-radius: var(--r-lg);
      background: var(--card);
      padding: 12px;
      box-shadow: var(--shadow-sm);
    }
    .detail-box h3 {
      margin: 0 0 8px;
      font-size: 13px;
    }
    .detail-box pre {
      margin: 0;
      max-height: 250px;
      overflow: auto;
      color: var(--text-2);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.45;
      font-family: var(--font-mono);
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .action {
      height: 36px;
      border-radius: var(--r-sm);
      font-weight: 550;
      background: var(--accent);
      color: var(--on-accent);
    }
    .action.secondary {
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .action.danger {
      background: var(--risk-high-bg);
      color: var(--risk-high);
      border: 1px solid rgba(201, 46, 59, 0.18);
    }
    .login {
      min-height: 100vh;
      display: flex;
      background: var(--bg);
      overflow: auto;
    }
    .login-panel {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(340px, 31vw) minmax(0, 1fr);
      overflow: hidden;
      background: var(--bg);
    }
    .login-copy {
      padding: clamp(34px, 4vw, 54px) clamp(28px, 4vw, 48px);
      background:
        radial-gradient(120% 80% at 0% 0%, var(--accent-dim), transparent 55%),
        var(--bg-sink);
      border-right: 1px solid var(--border-soft);
      display: grid;
      align-content: space-between;
      gap: 28px;
    }
    .login-copy h1 {
      margin: 0 0 12px;
      font-size: clamp(28px, 3.2vw, 34px);
      line-height: 1.12;
      letter-spacing: -0.03em;
      font-weight: 650;
    }
    .login-copy p {
      margin: 0;
      color: var(--text-2);
      max-width: 560px;
      line-height: 1.65;
      font-size: 15px;
    }
    .login-lockup {
      display: flex;
      align-items: center;
      gap: 10px;
      user-select: none;
    }
    .login-lockup span {
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    .login-kicker, .form-kicker {
      color: var(--accent);
      font-family: var(--font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .login-copy-body {
      display: grid;
      gap: 16px;
      max-width: 410px;
    }
    .intro-checks {
      display: grid;
      gap: 14px;
    }
    .intro-checks div {
      display: grid;
      grid-template-columns: 26px 1fr;
      gap: 12px;
      align-items: start;
    }
    .intro-checks b {
      width: 26px;
      height: 26px;
      border-radius: var(--r-full);
      background: var(--accent-dim);
      color: var(--accent);
      display: grid;
      place-items: center;
      font-family: var(--font-mono);
      font-size: 11px;
      box-shadow: inset 0 0 0 1px var(--accent-line);
    }
    .intro-checks strong {
      display: block;
      font-size: 13.5px;
      font-weight: 550;
    }
    .intro-checks small {
      color: var(--text-3);
      font-size: 12px;
      line-height: 1.45;
    }
    .login-profile {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-3);
      font-size: 12px;
    }
    .avatar {
      width: 26px;
      height: 26px;
      border-radius: var(--r-full);
      background: var(--accent);
      color: var(--on-accent);
      display: inline-grid;
      place-items: center;
      font-size: 10px;
      font-weight: 650;
    }
    .form-kicker {
      margin-bottom: 2px;
    }
    .form-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .agent-instruction {
      border: 1px solid var(--border-soft);
      border-radius: var(--r-md);
      background: var(--panel);
      padding: 12px;
      display: grid;
      gap: 8px;
    }
    .agent-instruction strong {
      font-size: 13px;
      font-weight: 650;
    }
    .agent-instruction p {
      margin: 0;
      color: var(--text-3);
      font-size: 12px;
      line-height: 1.5;
    }
    .agent-instruction code {
      display: block;
      padding: 10px;
      border-radius: var(--r-sm);
      background: var(--raised);
      border: 1px solid var(--border-soft);
      color: var(--text-2);
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.55;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .agent-instruction a {
      color: var(--accent);
      text-decoration: none;
    }
    .login-form {
      width: min(560px, calc(100% - 48px));
      margin: auto;
      padding: 24px;
      display: grid;
      gap: 12px;
      align-content: center;
      background: var(--card);
      border: 1px solid var(--border-soft);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-md);
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--text-2);
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-family: var(--font-mono);
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      background: var(--panel);
      color: var(--text);
      padding: 10px;
      outline: none;
    }
    input::placeholder, textarea::placeholder {
      color: var(--text-4);
    }
    textarea {
      min-height: 92px;
      resize: vertical;
    }
    .primary {
      height: 40px;
      border-radius: var(--r-sm);
      color: var(--on-accent);
      background: var(--accent);
      font-weight: 550;
    }
    .primary:hover, .action:hover {
      filter: brightness(0.96);
    }
    .advanced-login {
      border: 1px solid var(--border-soft);
      border-radius: var(--r-sm);
      background: var(--panel);
      padding: 0;
    }
    .advanced-login summary {
      list-style: none;
      cursor: pointer;
      color: var(--text-2);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.08em;
      padding: 10px;
      text-transform: uppercase;
      font-family: var(--font-mono);
    }
    .advanced-login summary::-webkit-details-marker {
      display: none;
    }
    .advanced-login summary::after {
      content: "+";
      float: right;
      color: var(--accent);
    }
    .advanced-login[open] summary::after {
      content: "-";
    }
    .advanced-login label {
      border-top: 1px solid var(--border-soft);
      padding: 10px;
    }
    .codebox {
      border: 1px solid var(--accent-line);
      border-radius: var(--r-md);
      background: var(--accent-dim);
      color: var(--accent);
      padding: 14px;
      font-family: var(--font-mono);
      font-size: clamp(28px, 7vw, 54px);
      line-height: 1;
      font-weight: 600;
      text-align: center;
      letter-spacing: 0.04em;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hidden {
      display: none !important;
    }
    .notice {
      color: var(--text-3);
      font-size: 12px;
      line-height: 1.5;
    }
    .empty {
      color: var(--text-3);
      padding: 18px;
      text-align: center;
      border: 1px dashed var(--border);
      border-radius: var(--r-lg);
      background: var(--panel);
    }
    dialog {
      width: min(620px, calc(100vw - 28px));
      border: 1px solid var(--border-soft);
      border-radius: var(--r-lg);
      background: var(--card);
      color: var(--text);
      padding: 0;
      box-shadow: var(--shadow-lg);
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
      border-bottom: 1px solid var(--border-soft);
      background: var(--panel);
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
        border-bottom: 1px solid var(--border-soft);
      }
    }
    @media (max-width: 760px) {
      .login-panel {
        grid-template-columns: 1fr;
      }
      .login-copy {
        border-right: 0;
        border-bottom: 1px solid var(--border-soft);
        padding: 28px 24px;
      }
      .login-form {
        width: calc(100% - 32px);
        margin: 16px auto;
      }
    }
  </style>
</head>
<body>
  <main id="login" class="login">
    <section class="login-panel">
      <div class="login-copy">
        <div class="login-lockup">
          <div class="mark" aria-hidden="true"></div>
          <span data-i18n="brandName">Nerva Mail</span>
        </div>
        <div class="login-copy-body">
          <div class="login-kicker" data-i18n="loginKicker">AGENT 原生邮箱</div>
          <h1 data-i18n-html="loginHeadline">别追着收件箱跑。<br>让 Agent 清掉决策。</h1>
          <p data-i18n="loginDescription">用 Agent 持有的 DID 登录，查看已签名任务邮件、处理投递状态，并结算注意力积分。私钥始终留在 Agent 环境。</p>
          <div class="intro-checks">
            <div><b>1</b><span><strong data-i18n="checkOneTitle">DID 签名访问</strong><small data-i18n="checkOneBody">只有 Agent 签完短 CODE 后，Owner Console 才会打开。</small></span></div>
            <div><b>2</b><span><strong data-i18n="checkTwoTitle">可执行邮箱</strong><small data-i18n="checkTwoBody">Claim、lease、ack 和 postage 状态集中在一个界面。</small></span></div>
            <div><b>3</b><span><strong data-i18n="checkThreeTitle">可审计决策</strong><small data-i18n="checkThreeBody">每个信封都保留人类复核所需的状态。</small></span></div>
          </div>
        </div>
        <div class="login-profile"><span class="avatar">OW</span><span data-i18n="profileText">正在设置 Agent 工作空间</span></div>
      </div>
      <div class="login-form">
        <div class="form-head">
          <div class="form-kicker" data-i18n="formKicker">OWNER 授权</div>
          <button class="lang-toggle" data-lang-toggle type="button">English</button>
        </div>
        <label><span data-i18n="agentDidLabel">Agent DID</span>
          <input id="loginDid" placeholder="did:key:researcher or did:web:nervafs.xyz" data-i18n-placeholder="agentDidPlaceholder">
        </label>
        <details class="advanced-login">
          <summary data-i18n="advancedAgentId">高级 Agent ID</summary>
          <label><span data-i18n="agentIdLabel">Agent ID</span>
            <input id="loginAgentId" placeholder="默认 DID#default" data-i18n-placeholder="agentIdPlaceholder">
          </label>
        </details>
        <button id="challengeButton" class="primary" data-i18n="createCode">生成 Agent 登录 CODE</button>
        <div id="challengeOutput" class="codebox hidden"></div>
        <p id="challengeStatus" class="notice hidden"></p>
        <button id="completeButton" class="primary hidden" data-i18n="checkNow">立即检查</button>
        <p class="notice" data-i18n="loginNotice">把 CODE 告诉你的 Agent。私钥留在 Agent 环境中。</p>
        <div class="agent-instruction">
          <strong data-i18n="instructionTitle">发给你的 Agent</strong>
          <p data-i18n="instructionBody">让 Agent 安装 Nerva Mail skill，并在你分享登录 CODE 时调用 CLI 签名。</p>
          <code data-i18n="instructionCommand">使用 Nerva Mail skill：https://github.com/Airine/nerva-mail/tree/v0.1.1/skills/nerva-mail。如果你还没有生产 DID，先用 Nerva 托管身份：npx --package github:Airine/nerva-mail#v0.1.1 nmail auth generate --name &lt;agent-name&gt;。之后用这个命令签我的登录 CODE：npx --package github:Airine/nerva-mail#v0.1.1 nmail auth login --code &lt;code&gt;。</code>
        </div>
      </div>
    </section>
  </main>

  <main id="console" class="app hidden">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div class="brand-title">
          <strong data-i18n="consoleTitle">Agent Mail 主控台</strong>
          <span id="activeDid">未登录</span>
        </div>
      </div>
      <div class="metric"><b id="inboxCount">0</b><span data-i18n="inboxMetric">收件箱</span></div>
      <div class="metric"><b id="heldCredits">0</b><span data-i18n="heldMetric">冻结积分</span></div>
      <div class="metric"><b id="activeLeases">0</b><span data-i18n="leasesMetric">活跃租约</span></div>
      <button id="composeButton" class="compose" data-i18n="compose">+ 写信</button>
    </header>
    <section class="layout">
      <aside class="pane">
        <div class="pane-head"><h2 data-i18n="agentsPane">Agents</h2><span class="status" data-i18n="sessionStatus">session</span></div>
        <div id="agents" class="list"></div>
      </aside>
      <section class="pane">
        <div class="pane-head"><h2 data-i18n="priorityInbox">优先收件箱</h2><span id="mailboxState" class="status warn">同步</span></div>
        <div id="messages" class="list"></div>
      </section>
      <aside class="pane">
        <div class="pane-head"><h2 data-i18n="envelopePane">信封</h2><div class="row gap-2"><button class="lang-toggle" data-lang-toggle type="button">English</button><button id="logoutButton" class="action secondary" data-i18n="logout">退出</button></div></div>
        <div id="detail" class="detail-body"></div>
      </aside>
    </section>
  </main>

  <dialog id="composeDialog">
    <form id="composeForm" method="dialog">
      <div class="dialog-head"><h2 data-i18n="composeTitle">撰写任务邮件</h2><button class="action secondary" value="cancel" data-i18n="close">关闭</button></div>
      <div class="dialog-body">
        <label><span data-i18n="toDid">收件 DID</span><input id="composeTo" required></label>
        <label><span data-i18n="goal">目标</span><textarea id="composeGoal" required></textarea></label>
        <label><span data-i18n="postageCredits">邮资积分</span><input id="composePostage" type="number" min="0" value="0"></label>
        <button class="primary" value="default" data-i18n="sendTask">发送 task.request</button>
        <p class="notice" data-i18n="attachmentsDisabled">Phase 1 暂不支持附件。</p>
      </div>
    </form>
  </dialog>

  <script>
    const relayOrigin = ${JSON.stringify(relayOrigin)};
    const i18n = {
      zh: {
        documentTitle: "Nerva Mail 主控台",
        brandName: "Nerva Mail",
        loginKicker: "AGENT 原生邮箱",
        loginHeadline: "别追着收件箱跑。<br>让 Agent 清掉决策。",
        loginDescription: "用 Agent 持有的 DID 登录，查看已签名任务邮件、处理投递状态，并结算注意力积分。私钥始终留在 Agent 环境。",
        checkOneTitle: "DID 签名访问",
        checkOneBody: "只有 Agent 签完短 CODE 后，Owner Console 才会打开。",
        checkTwoTitle: "可执行邮箱",
        checkTwoBody: "Claim、lease、ack 和 postage 状态集中在一个界面。",
        checkThreeTitle: "可审计决策",
        checkThreeBody: "每个信封都保留人类复核所需的状态。",
        profileText: "正在设置 Agent 工作空间",
        formKicker: "OWNER 授权",
        agentDidLabel: "Agent DID",
        agentDidPlaceholder: "did:key:researcher 或 did:web:nervafs.xyz",
        advancedAgentId: "高级 Agent ID",
        agentIdLabel: "Agent ID",
        agentIdPlaceholder: "默认 DID#default",
        createCode: "生成 Agent 登录 CODE",
        checkNow: "立即检查",
        loginNotice: "把 CODE 告诉你的 Agent。私钥留在 Agent 环境中。",
        instructionTitle: "发给你的 Agent",
        instructionBody: "让 Agent 安装 Nerva Mail skill，并在你分享登录 CODE 时调用 CLI 签名。",
        instructionCommand: "使用 Nerva Mail skill：https://github.com/Airine/nerva-mail/tree/v0.1.1/skills/nerva-mail。如果你还没有生产 DID，先用 Nerva 托管身份：npx --package github:Airine/nerva-mail#v0.1.1 nmail auth generate --name <agent-name>。之后用这个命令签我的登录 CODE：npx --package github:Airine/nerva-mail#v0.1.1 nmail auth login --code <code>。",
        consoleTitle: "Agent Mail 主控台",
        notSignedIn: "未登录",
        inboxMetric: "收件箱",
        heldMetric: "冻结积分",
        leasesMetric: "活跃租约",
        compose: "+ 写信",
        agentsPane: "Agents",
        sessionStatus: "session",
        priorityInbox: "优先收件箱",
        envelopePane: "信封",
        logout: "退出",
        composeTitle: "撰写任务邮件",
        close: "关闭",
        toDid: "收件 DID",
        goal: "目标",
        postageCredits: "邮资积分",
        sendTask: "发送 task.request",
        attachmentsDisabled: "Phase 1 暂不支持附件。",
        langToggle: "English",
        langToggleLabel: "Switch to English",
        ownerChip: "owner",
        balanceChip: "余额 {balance}",
        loading: "加载中",
        synced: "已同步",
        noRegisteredAgent: "这个 DID 还没有注册 Agent。",
        emptyMailbox: "邮箱为空。可以撰写一封任务邮件，或等待新的工作进入。",
        selectMessage: "选择一封邮件来查看信封。",
        mailFrom: "来自 {sender}",
        mailState: "状态 {state}",
        mailPostage: "邮资 {postage}",
        scoreChip: "分数 {score}",
        noGoal: "无目标",
        signature: "签名",
        signatureBody: "DID 信封已被 relay 接受\\n发送方：{sender}\\n接收方：{recipient}",
        execution: "执行",
        executionBody: "状态：{state}\\n租约到期：{leaseUntil}\\n优先级分数：{priorityScore}",
        none: "无",
        credits: "积分",
        creditsBody: "邮资：{postage}\\nack 时结算，reject 时退款",
        body: "正文",
        claim: "Claim",
        ack: "Ack",
        reject: "Reject",
        checkingSignature: "正在检查 Agent 签名...",
        waitingSignature: "正在等待 Agent 签名。页面会自动继续。",
        codeInvalid: "这个登录 CODE 已失效。请重新生成。",
        codeExpired: "这个登录 CODE 已过期。请重新生成。",
        retrying: "连接中断，正在重试..."
      },
      en: {
        documentTitle: "Agent Mail Owner Console",
        brandName: "Nerva Mail",
        loginKicker: "Agent-native mail",
        loginHeadline: "Stop chasing inboxes.<br>Clear decisions.",
        loginDescription: "Sign in with an Agent-owned DID, review signed task mail, inspect delivery state, and settle attention credits. Private keys stay with the Agent.",
        checkOneTitle: "DID-signed access",
        checkOneBody: "Owner Console opens only after the Agent signs a short code.",
        checkTwoTitle: "Actionable mailbox",
        checkTwoBody: "Claims, leases, acknowledgements, and postage are visible in one place.",
        checkThreeTitle: "Auditable decisions",
        checkThreeBody: "Every envelope keeps the state needed for human review.",
        profileText: "Setting up an Agent-owned workspace",
        formKicker: "Owner authorization",
        agentDidLabel: "Agent DID",
        agentDidPlaceholder: "did:key:researcher or did:web:nervafs.xyz",
        advancedAgentId: "Advanced Agent ID",
        agentIdLabel: "Agent ID",
        agentIdPlaceholder: "Defaults to DID#default",
        createCode: "Create Agent login code",
        checkNow: "Check now",
        loginNotice: "Tell your Agent the code. Private keys stay in the Agent environment.",
        instructionTitle: "Send this to your Agent",
        instructionBody: "Ask the Agent to install the Nerva Mail skill and use the CLI when you share a login code.",
        instructionCommand: "Use the Nerva Mail skill: https://github.com/Airine/nerva-mail/tree/v0.1.1/skills/nerva-mail. If you do not have a production DID yet, first create a Nerva-hosted identity: npx --package github:Airine/nerva-mail#v0.1.1 nmail auth generate --name <agent-name>. Then sign my code with: npx --package github:Airine/nerva-mail#v0.1.1 nmail auth login --code <code>.",
        consoleTitle: "Agent Mail Owner Console",
        notSignedIn: "Not signed in",
        inboxMetric: "Inbox",
        heldMetric: "Held credits",
        leasesMetric: "Active leases",
        compose: "+ Compose",
        agentsPane: "Agents",
        sessionStatus: "session",
        priorityInbox: "Priority Inbox",
        envelopePane: "Envelope",
        logout: "Logout",
        composeTitle: "Compose Task Mail",
        close: "Close",
        toDid: "To DID",
        goal: "Goal",
        postageCredits: "Postage credits",
        sendTask: "Send task.request",
        attachmentsDisabled: "Attachments are disabled in Phase 1.",
        langToggle: "中文",
        langToggleLabel: "切换到中文",
        ownerChip: "owner",
        balanceChip: "balance {balance}",
        loading: "loading",
        synced: "synced",
        noRegisteredAgent: "No registered agent for this DID yet.",
        emptyMailbox: "Mailbox is empty. Compose a task mail or wait for incoming work.",
        selectMessage: "Select a message to inspect its envelope.",
        mailFrom: "from {sender}",
        mailState: "state {state}",
        mailPostage: "postage {postage}",
        scoreChip: "score {score}",
        noGoal: "No goal",
        signature: "Signature",
        signatureBody: "DID envelope accepted by relay\\nSender: {sender}\\nRecipient: {recipient}",
        execution: "Execution",
        executionBody: "state: {state}\\nleaseUntil: {leaseUntil}\\npriorityScore: {priorityScore}",
        none: "none",
        credits: "Credits",
        creditsBody: "postage: {postage}\\nsettles on ack, refunds on reject",
        body: "Body",
        claim: "Claim",
        ack: "Ack",
        reject: "Reject",
        checkingSignature: "Checking Agent signature...",
        waitingSignature: "Waiting for Agent signature. This page will continue automatically.",
        codeInvalid: "This login code is no longer valid. Create a new code.",
        codeExpired: "This login code expired. Create a new code.",
        retrying: "Connection interrupted. Retrying..."
      }
    };
    const state = { locale: initialLocale(), session: null, mailboxId: null, messages: [], selected: null, challenge: null, loginPollTimer: null };
    const el = (id) => document.getElementById(id);
    const api = async (path, options = {}) => {
      const response = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const error = new Error(data.error || response.statusText);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    };

    function initialLocale() {
      try {
        const saved = localStorage.getItem("nmail_locale");
        return saved === "en" || saved === "zh" ? saved : "zh";
      } catch {
        return "zh";
      }
    }

    function t(key, params = {}) {
      let text = i18n[state.locale]?.[key] ?? i18n.zh[key] ?? key;
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll("{" + name + "}", String(value ?? ""));
      }
      return text;
    }

    function applyTranslations() {
      document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
      document.title = t("documentTitle");
      document.querySelectorAll("[data-i18n]").forEach((node) => {
        node.textContent = t(node.dataset.i18n);
      });
      document.querySelectorAll("[data-i18n-html]").forEach((node) => {
        node.innerHTML = t(node.dataset.i18nHtml);
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
        node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
      });
      document.querySelectorAll("[data-lang-toggle]").forEach((node) => {
        node.textContent = t("langToggle");
        node.setAttribute("aria-label", t("langToggleLabel"));
      });
      if (!state.session) {
        el("activeDid").textContent = t("notSignedIn");
      }
    }

    function setLocale(locale) {
      state.locale = locale;
      try {
        localStorage.setItem("nmail_locale", locale);
      } catch {}
      applyTranslations();
      if (state.mailboxId) {
        renderMessages();
      }
      if (state.challenge) {
        setChallengeStatus(t("waitingSignature"));
      }
    }

    function bindLanguageSwitches() {
      document.querySelectorAll("[data-lang-toggle]").forEach((node) => {
        node.onclick = () => setLocale(state.locale === "zh" ? "en" : "zh");
      });
    }

    function stopLoginPolling() {
      if (state.loginPollTimer) {
        clearTimeout(state.loginPollTimer);
        state.loginPollTimer = null;
      }
    }

    function setChallengeStatus(text) {
      el("challengeStatus").textContent = text;
      el("challengeStatus").classList.toggle("hidden", !text);
    }

    function showLogin() {
      el("login").classList.remove("hidden");
      el("console").classList.add("hidden");
    }

    function showConsole() {
      stopLoginPolling();
      el("login").classList.add("hidden");
      el("console").classList.remove("hidden");
    }

    function scheduleLoginPoll(delayMs = 1200) {
      stopLoginPolling();
      state.loginPollTimer = setTimeout(pollLoginChallenge, delayMs);
    }

    async function completeLogin(options = {}) {
      if (!state.challenge) return false;
      try {
        if (!options.silent) setChallengeStatus(t("checkingSignature"));
        await api("/v0/ui/login/complete", {
          method: "POST",
          body: JSON.stringify({ code: state.challenge.code })
        });
        state.challenge = null;
        stopLoginPolling();
        await loadSession();
        return true;
      } catch (error) {
        if (error.status === 409 || error.message === "challenge_not_signed") {
          setChallengeStatus(t("waitingSignature"));
          return false;
        }
        if (["challenge_expired", "challenge_consumed", "challenge_not_found"].includes(error.message)) {
          state.challenge = null;
          stopLoginPolling();
          setChallengeStatus(t("codeInvalid"));
          el("completeButton").classList.add("hidden");
          return false;
        }
        setChallengeStatus(t("retrying"));
        return false;
      }
    }

    async function pollLoginChallenge() {
      if (!state.challenge) return;
      const expiresAt = Date.parse(state.challenge.expiresAt || "");
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        state.challenge = null;
        stopLoginPolling();
        setChallengeStatus(t("codeExpired"));
        el("completeButton").classList.add("hidden");
        return;
      }
      const completed = await completeLogin({ silent: true });
      if (!completed && state.challenge) scheduleLoginPoll();
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
        card.innerHTML = "<strong>" + escapeHtml(box.displayName || box.agentId || box.did) + "</strong><small>" + escapeHtml(box.mailboxId) + "</small><div class='chips'><span class='chip teal'>" + escapeHtml(t("ownerChip")) + "</span><span class='chip'>" + escapeHtml(t("balanceChip", { balance: data.credits?.balance ?? 0 })) + "</span></div>";
        card.onclick = () => loadMessages(box.mailboxId);
        el("agents").appendChild(card);
        if (!state.mailboxId) state.mailboxId = box.mailboxId;
      }
      if (!data.mailboxes.length) {
        el("agents").innerHTML = "<div class='empty'>" + escapeHtml(t("noRegisteredAgent")) + "</div>";
      }
      if (state.mailboxId) await loadMessages(state.mailboxId);
    }

    async function loadMessages(mailboxId) {
      state.mailboxId = mailboxId;
      el("mailboxState").textContent = t("loading");
      const data = await api("/v0/ui/mailboxes/" + encodeURIComponent(mailboxId) + "/messages?cursor=0");
      state.messages = data.messages || [];
      el("inboxCount").textContent = state.messages.length;
      el("activeLeases").textContent = state.messages.filter((row) => row.deliveryState === "claimed").length;
      el("mailboxState").textContent = t("synced");
      renderMessages();
    }

    function renderMessages() {
      const container = el("messages");
      container.innerHTML = "";
      if (!state.messages.length) {
        container.innerHTML = "<div class='empty'>" + escapeHtml(t("emptyMailbox")) + "</div>";
        el("detail").innerHTML = "<div class='empty'>" + escapeHtml(t("selectMessage")) + "</div>";
        return;
      }
      state.messages.forEach((row, index) => {
        const button = document.createElement("button");
        button.className = "mail-row" + (index === 0 ? " active" : "");
        const raw = row.message?.raw || {};
        const goal = raw.body?.goal || row.message?.thread || row.message?.type;
        button.innerHTML = "<div><h3>" + escapeHtml(row.message?.type || row.messageId) + " · " + escapeHtml(goal || t("noGoal")) + "</h3><p>" + escapeHtml(t("mailFrom", { sender: row.senderDid })) + " · " + escapeHtml(t("mailState", { state: row.deliveryState })) + " · " + escapeHtml(t("mailPostage", { postage: row.postageCredits })) + "</p><div class='chips'><span class='chip teal'>" + escapeHtml(row.deliveryState) + "</span><span class='chip amber'>" + escapeHtml(t("scoreChip", { score: row.priorityScore })) + "</span></div></div><div class='score'>" + row.postageCredits + "</div>";
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
      el("detail").innerHTML = "<div class='detail-box'><h3>" + escapeHtml(t("signature")) + "</h3><pre>" + escapeHtml(t("signatureBody", { sender: row.senderDid, recipient: row.recipientDid })) + "</pre></div>" +
        "<div class='detail-box'><h3>" + escapeHtml(t("execution")) + "</h3><pre>" + escapeHtml(t("executionBody", { state: row.deliveryState, leaseUntil: row.leaseUntil || t("none"), priorityScore: row.priorityScore })) + "</pre></div>" +
        "<div class='detail-box'><h3>" + escapeHtml(t("credits")) + "</h3><pre>" + escapeHtml(t("creditsBody", { postage: row.postageCredits })) + "</pre></div>" +
        "<div class='detail-box'><h3>" + escapeHtml(t("body")) + "</h3><pre>" + escapeHtml(JSON.stringify(raw, null, 2)) + "</pre></div>" +
        "<div class='actions'><button class='action' id='claimSelected'>" + escapeHtml(t("claim")) + "</button><button class='action secondary' id='ackSelected'>" + escapeHtml(t("ack")) + "</button><button class='action danger' id='rejectSelected'>" + escapeHtml(t("reject")) + "</button></div>";
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
      let did = el("loginDid").value.trim();
      let agentId = el("loginAgentId").value.trim();
      const fragmentIndex = did.indexOf("#");
      if (fragmentIndex >= 0) {
        const fragment = did.slice(fragmentIndex + 1);
        did = did.slice(0, fragmentIndex);
        if (!agentId && fragment) agentId = did + "#" + fragment;
        el("loginDid").value = did;
        el("loginAgentId").value = agentId;
        document.querySelector(".advanced-login").open = true;
      }
      agentId = agentId || did + "#default";
      if (!did) return;
      const challenge = await api("/v0/ui/login/challenge", {
        method: "POST",
        body: JSON.stringify({ did, agentId: agentId || undefined })
      });
      stopLoginPolling();
      state.challenge = challenge;
      el("challengeOutput").classList.remove("hidden");
      el("completeButton").classList.remove("hidden");
      el("challengeOutput").textContent = challenge.code;
      setChallengeStatus(t("waitingSignature"));
      scheduleLoginPoll(500);
    };

    el("completeButton").onclick = async () => {
      const completed = await completeLogin();
      if (!completed && state.challenge) scheduleLoginPoll();
    };

    el("logoutButton").onclick = async () => {
      await api("/v0/ui/logout", { method: "POST", body: "{}" }).catch(() => {});
      state.session = null;
      state.challenge = null;
      stopLoginPolling();
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

    bindLanguageSwitches();
    applyTranslations();
    loadSession();
  </script>
</body>
</html>`;
}
