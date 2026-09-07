<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fluency AI — Admin</title>
<link rel="icon" href="/assets/logo-appicon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=JetBrains+Mono:wght@400;500;700&display=swap">
<script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>
<style>
:root{
  --teal-400:#22CFCB;--teal-500:#10B8B8;--teal-600:#0E9A9C;
  --indigo-400:#7A75D0;--indigo-500:#5B55B8;--indigo-600:#4A459C;
  --mint-400:#25D79B;--coral-400:#FF6A6A;--amber-400:#F7B23B;
  --ink-950:#04121B;--ink-900:#0B2233;--pg:#04121B;--pg-2:#08202D;--pg-3:#0B2233;
  --tx:#FFFFFF;--tx-2:#B7CCD6;--tx-3:#6E93A6;--hair:rgba(255,255,255,.09);
  --glass:rgba(255,255,255,.055);--glass-2:rgba(255,255,255,.09);--glass-bd:rgba(255,255,255,.12);
  --font-display:"Figtree",system-ui,sans-serif;--font-mono:"JetBrains Mono",monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--pg);color:var(--tx);font-family:var(--font-display);min-height:100vh}
a{color:var(--teal-400)}
.wrap{max-width:1180px;margin:0 auto;padding:32px 24px 80px}
header.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px}
.logo{font-weight:800;font-size:20px;letter-spacing:-.03em}
.logo span{color:var(--teal-400)}
.tag{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-3);border:1px solid var(--hair);padding:4px 10px;border-radius:999px}
#signout-btn{background:none;border:1px solid var(--hair);color:var(--tx-2);padding:8px 16px;border-radius:999px;cursor:pointer;font:inherit;font-size:13px}
#signout-btn:hover{border-color:var(--teal-400);color:var(--tx)}

.card{background:var(--glass);border:1px solid var(--hair);border-radius:20px;padding:22px}
.grid-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:28px}
.stat-num{font:800 2rem/1 "Manrope",sans-serif;letter-spacing:-.03em}
.stat-label{font-size:12px;color:var(--tx-3);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-top:6px}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
@media (max-width:800px){.grid-2{grid-template-columns:1fr}}
.bar-row{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}
.bar-label{width:90px;flex:0 0 auto;color:var(--tx-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{flex:1;height:10px;border-radius:999px;background:var(--pg-3);overflow:hidden}
.bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--teal-500),var(--indigo-500))}
.bar-count{width:34px;text-align:right;color:var(--tx-3);font:600 12px var(--font-mono)}

.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.toolbar input{background:var(--pg-3);border:1px solid var(--hair);color:var(--tx);border-radius:12px;padding:10px 14px;font:inherit;font-size:14px;flex:1;min-width:180px}
.tab{background:none;border:1px solid var(--hair);color:var(--tx-2);padding:8px 14px;border-radius:999px;cursor:pointer;font:inherit;font-size:13px}
.tab.active{background:var(--indigo-500);border-color:var(--indigo-400);color:#fff}

table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--tx-3);text-transform:uppercase;font-size:11px;letter-spacing:.06em;padding:10px 12px;border-bottom:1px solid var(--hair)}
td{padding:12px;border-bottom:1px solid var(--hair);color:var(--tx-2);vertical-align:middle}
td.email{color:var(--tx);font-weight:600}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.pill-admin{background:rgba(91,85,184,.25);color:#C0BEEE}
.pill-user{background:var(--glass);color:var(--tx-3)}
.pill-active{background:rgba(37,215,155,.18);color:var(--mint-400)}
.pill-trialing{background:rgba(34,207,203,.18);color:var(--teal-400)}
.pill-free{background:var(--glass);color:var(--tx-3)}
.pill-canceled,.pill-past_due,.pill-unpaid{background:rgba(255,106,106,.15);color:var(--coral-400)}
.row-btn{background:none;border:1px solid var(--hair);color:var(--tx-2);padding:5px 10px;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;margin-right:4px}
.row-btn:hover{border-color:var(--teal-400);color:var(--tx)}
.pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:14px;font-size:13px;color:var(--tx-3)}
.pager button{background:none;border:1px solid var(--hair);color:var(--tx-2);padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit}
.pager button:disabled{opacity:.4;cursor:default}

#login-screen{max-width:380px;margin:120px auto;padding:36px 30px;background:var(--glass-2);border:1px solid var(--hair);border-radius:24px}
#login-screen h1{font-size:22px;margin:0 0 6px}
#login-screen p{color:var(--tx-3);font-size:14px;margin:0 0 22px}
#login-screen label{display:grid;gap:6px;font-size:13px;color:var(--tx-2);margin-bottom:14px}
#login-screen input{height:46px;padding:0 14px;border-radius:12px;background:var(--pg-3);border:1px solid var(--hair);color:var(--tx);font:inherit}
#login-screen button{width:100%;height:48px;border-radius:12px;background:var(--indigo-500);color:#fff;border:0;font:700 14px inherit;cursor:pointer;margin-top:6px}
.err{color:var(--coral-400);font-size:13px;min-height:18px;margin-top:8px}
.hidden{display:none !important}
.loading{color:var(--tx-3);font-size:14px;text-align:center;padding:60px 0}
</style>
</head>
<body>

<div id="login-screen">
  <h1>Admin sign in</h1>
  <p>Fluency<span style="color:var(--teal-400)">AI</span> dashboard — admin accounts only.</p>
  <form id="login-form">
    <label>Email<input type="email" id="login-email" required autocomplete="email"></label>
    <label>Password<input type="password" id="login-password" required autocomplete="current-password"></label>
    <div class="err" id="login-err"></div>
    <button type="submit">Sign in</button>
  </form>
</div>

<div id="dashboard" class="hidden">
  <div class="wrap">
    <header class="top">
      <div class="logo">Fluency<span>AI</span> — Admin</div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="tag" id="whoami"></span>
        <button id="signout-btn">Sign out</button>
      </div>
    </header>

    <div id="content-loading" class="loading">Loading dashboard…</div>

    <div id="content" class="hidden">
      <div class="grid-cards" id="stat-cards"></div>

      <div class="grid-2">
        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">Users by country</div>
          <div id="by-country"></div>
        </div>
        <div class="card">
          <div style="font-weight:700;margin-bottom:10px">Users by device</div>
          <div id="by-device"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:28px">
        <div style="font-weight:700;margin-bottom:10px">Subscription breakdown</div>
        <div id="by-subscription"></div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:14px">All users</div>
        <div class="toolbar">
          <input type="text" id="search-input" placeholder="Search by email…">
          <button class="tab active" data-filter="all">All</button>
          <button class="tab" data-filter="subscribed">Subscribed</button>
          <button class="tab" data-filter="free">Free</button>
          <button class="tab" data-filter="admins">Admins</button>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Email</th><th>Joined</th><th>Role</th><th>Subscription</th>
                <th>Ends</th><th>Last active</th><th>Country</th><th>Device</th><th>Actions</th>
              </tr>
            </thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>
        <div class="pager">
          <span id="pager-info"></span>
          <button id="prev-page">Prev</button>
          <button id="next-page">Next</button>
        </div>
      </div>
    </div>
  </div>
</div>

<script src="/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="admin.js"></script>
</body>
</html>
