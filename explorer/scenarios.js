// ── Multi-Region Cluster interactive state ──────────────────────────────────
window._mrPrefs = ['us', 'eu', 'apac']; // default: all regions balanced
window._mrFailed = null;   // currently failed region (null | 'us' | 'eu' | 'apac')
window._mrCtx = null;   // live ctx reference set in scenario init

const _mrNodes = { us: [1, 2, 3], eu: [4, 5, 6], apac: [7, 8, 9] };
const _mrLabel = { us: 'US-East', eu: 'EU-West', apac: 'APAC' };
const _mrColors = { us: '#60a5fa', eu: '#34d399', apac: '#f59e0b' };
const _mrAll = ['us', 'eu', 'apac'];

function _mrEffRegs() {
  const active = window._mrPrefs.filter(r => r !== window._mrFailed);
  return active.length ? active : _mrAll.filter(r => r !== window._mrFailed);
}

function _mrEffReg(gi = 0) { const e = _mrEffRegs(); return e[gi % e.length]; }
function _mrLeader(gi) { return _mrNodes[_mrEffReg(gi)][gi]; }
function _mrNodeReg(nid) { return _mrAll.find(r => _mrNodes[r].includes(nid)); }

function _mrOW(a, b) {
  if (a === b) return 2;
  const t = { us: { eu: 45, apac: 90 }, eu: { us: 45, apac: 70 }, apac: { us: 90, eu: 70 } };
  return t[a]?.[b] || 45;
}

function _mrLatsAll() {
  const fail = window._mrFailed;
  return [0, 1, 2].map(gi => {
    const eff = _mrEffReg(gi);
    const cl = _mrOW('us', eff);
    const followers = _mrAll.filter(r => r !== eff && r !== fail);
    const minRaft = followers.length ? Math.min(...followers.map(r => _mrOW(eff, r))) : 0;
    const read = cl < 5 ? 2 : cl * 2;
    const write = cl < 5 ? (2 + minRaft) : (cl + minRaft + cl);
    return { region: eff, cl: cl < 5 ? 2 : cl, read, raft: minRaft, write };
  });
}

// Returns [clientHop, read, raft, write] — raft listed before write (bar display order)
function _mrLats() {
  const l = _mrLatsAll()[0];
  return [l.cl, l.read, l.raft, l.write];
}

// Per-region latency as if that region were the leader (for comparison table)
function _mrRegionLats(reg) {
  const fail = window._mrFailed;
  if (reg === fail) return null;
  const cl = _mrOW('us', reg);
  const followers = _mrAll.filter(r => r !== reg && r !== fail);
  const minRaft = followers.length ? Math.min(...followers.map(r => _mrOW(reg, r))) : 0;
  const read = cl < 5 ? 2 : cl * 2;
  const write = cl < 5 ? (2 + minRaft) : (cl + minRaft + cl);
  return { read, write };
}

function _mrAnimDur(owMs) { return Math.max(300, owMs * 6); }

// ── Bottom comparison panel ──────────────────────────────────────────────────
function _mrRenderLatPanel() {
  const panel = document.getElementById('mr-lat-panel');
  if (!panel) return;
  const effRegs = _mrEffRegs();
  const failed = window._mrFailed;
  const prefs = window._mrPrefs;

  let rows = '';
  _mrAll.forEach(reg => {
    const isEff = effRegs.includes(reg);
    const isFailed = reg === failed;
    const isPref = prefs.includes(reg);
    const done = window._mrPanelDone || {};
    const lats = !isFailed ? _mrRegionLats(reg) : null;
    const c = _mrColors[reg];

    let st, stCls;
    if (isFailed) { st = '✕ OFFLINE'; stCls = 'mr-st-fail'; }
    else if (isEff && isPref) { st = '● Pinned'; stCls = 'mr-st-pin'; }
    else if (isEff) { st = '◉ Balancing'; stCls = 'mr-st-eff'; }
    else { st = '—'; stCls = 'mr-st-idle'; }

    const readVal = (lats && done[reg + ':read']) ? lats.read + 'ms' : '—';
    const writeVal = (lats && done[reg + ':write']) ? lats.write + 'ms' : '—';
    const bl = isEff ? `border-left:3px solid ${c}` : isFailed ? 'border-left:3px solid var(--err)' : 'border-left:3px solid transparent';
    const dim = isFailed ? 'opacity:.38' : '';
    rows += `<tr class="mr-lat-tr ${isEff ? 'mr-lat-tr-eff' : ''}" style="${bl};${dim}">
      <td class="mr-lat-td mr-lat-rname" style="color:${isFailed ? 'var(--txt3)' : c}">${_mrLabel[reg]}</td>
      <td class="mr-lat-td">${readVal}</td>
      <td class="mr-lat-td">${writeVal}</td>
      <td class="mr-lat-td ${stCls}">${st}</td>
    </tr>`;
  });

  panel.innerHTML = `
    <div class="mr-lat-hdr-row">
      <span class="mr-lat-title">Latency Comparison</span>
      <span class="mr-lat-sub">· client in US-East · reads served from leader · writes include Raft quorum</span>
    </div>
    <table class="mr-lat-tbl">
      <thead><tr>
        <th class="mr-lat-th">Region</th>
        <th class="mr-lat-th">Read (RTT)</th>
        <th class="mr-lat-th">Write (end-to-end)</th>
        <th class="mr-lat-th">Leader Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _mrRenderAll() { _mrUpdateBtns(); _mrRenderLatPanel(); }

function _mrResetLatBars() {
  for (let i = 0; i < 4; i++) {
    const fill = document.getElementById(`lat-fill-${i}`);
    const val = document.getElementById(`lat-val-${i}`);
    if (fill) fill.style.width = '0%';
    if (val) val.textContent = '—';
  }
  document.querySelectorAll('#lat-rows .lat-row').forEach(el => el.classList.remove('hl-lat'));
}

function _mrUpdateBtns() {
  const prefs = window._mrPrefs, failed = window._mrFailed;
  _mrAll.forEach(r => {
    const btn = document.getElementById(`mr-pref-${r}`);
    if (!btn) return;
    const active = prefs.includes(r), c = _mrColors[r];
    btn.classList.toggle('active', active);
    btn.style.background = active ? c : '';
    btn.style.color = active ? '#0f172a' : c;
    btn.style.borderColor = active ? c : `${c}55`;
    btn.disabled = r === failed;
  });
  const toFail = prefs.find(r => r !== failed) || prefs[0];
  const failBtn = document.getElementById('mr-fail');
  if (failBtn) { failBtn.disabled = !!failed; failBtn.innerHTML = `⚡ Fail ${_mrLabel[toFail]}`; }
  const restBtn = document.getElementById('mr-restore');
  if (restBtn) { restBtn.disabled = !failed; restBtn.innerHTML = failed ? `↺ Restore ${_mrLabel[failed]}` : '↺ Restore'; }
}

function _mrApplyLeaders(ctx) {
  ['mr1', 'mr2', 'mr3'].forEach((id, i) => ctx.setRole(id, _mrLeader(i), 'LEADER'));
}

function _mrAnimateLeaderTransfer(ctx, oldLeaders, newLeaders) {
  [0, 1, 2].filter(gi => oldLeaders[gi] !== newLeaders[gi]).forEach(gi => {
    const oldR = _mrNodeReg(oldLeaders[gi]), newR = _mrNodeReg(newLeaders[gi]);
    ctx.pktTabletToTablet(`mr${gi + 1}`, oldLeaders[gi], `mr${gi + 1}`, newLeaders[gi], 'pk-vote', _mrAnimDur(_mrOW(oldR, newR)));
  });
}

function _mrLogShards() {
  const effRegs = _mrEffRegs();
  if (effRegs.length > 1) {
    [0, 1, 2].forEach(gi => {
      const l = _mrLatsAll()[gi];
      addLog(`  shard-${gi + 1} → ${_mrLabel[l.region]} (Node ${_mrLeader(gi)}) · read ~${l.read}ms · write ~${l.write}ms`, 'li');
    });
  }
}

window.mrSetPrefUs = () => window.mrSetPref('us');
window.mrSetPrefEu = () => window.mrSetPref('eu');
window.mrSetPrefApac = () => window.mrSetPref('apac');

window.mrSetPref = function (reg) {
  if (window._mrFailed === reg) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const oldLeaders = [0, 1, 2].map(gi => _mrLeader(gi));

  const idx = window._mrPrefs.indexOf(reg);
  if (idx === -1) {
    window._mrPrefs.push(reg);
    window._mrPrefs.sort((a, b) => _mrAll.indexOf(a) - _mrAll.indexOf(b));
  } else {
    if (window._mrPrefs.length === 1) return;
    window._mrPrefs.splice(idx, 1);
  }

  const newLeaders = [0, 1, 2].map(gi => _mrLeader(gi));
  const ctx = window._mrCtx; if (!ctx) return;

  _mrAnimateLeaderTransfer(ctx, oldLeaders, newLeaders); // leader transfer packets
  _mrApplyLeaders(ctx);
  _mrRenderAll();

  const effRegs = _mrEffRegs();
  const [cl, read, raft, write] = _mrLats();
  addLog(`Leader preference → ${effRegs.map(r => _mrLabel[r]).join(' & ')}`, 'ls');
  _mrLogShards();
  if (effRegs.length === 1) addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'li');
};

window.mrFailRegion = function () {
  const ctx = window._mrCtx; if (!ctx || window._mrFailed) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const toFail = window._mrPrefs.find(r => r !== window._mrFailed) || window._mrPrefs[0];
  const oldLeaders = [0, 1, 2].map(gi => _mrLeader(gi));

  window._mrFailed = toFail;
  _mrNodes[toFail].forEach(n => ctx.killNode(n));

  const newLeaders = [0, 1, 2].map(gi => _mrLeader(gi));
  _mrAnimateLeaderTransfer(ctx, oldLeaders, newLeaders);
  _mrApplyLeaders(ctx);
  _mrRenderAll();

  const effRegs = _mrEffRegs();
  const [cl, read, raft, write] = _mrLats();
  addLog(`⚡ ${_mrLabel[toFail]} OFFLINE — nodes ${_mrNodes[toFail].join(', ')} unreachable`, 'le');
  addLog(`Raft re-election: leaders balanced across ${effRegs.map(r => _mrLabel[r]).join(' & ')}`, 'lw');
  _mrLogShards();
  addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'lw');
};

window.mrRestore = function () {
  const ctx = window._mrCtx; if (!ctx || !window._mrFailed) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const failed = window._mrFailed;
  const oldLeaders = [0, 1, 2].map(gi => _mrLeader(gi));

  window._mrFailed = null;
  _mrNodes[failed].forEach(n => ctx.reviveNode(n));

  const newLeaders = [0, 1, 2].map(gi => _mrLeader(gi));
  _mrAnimateLeaderTransfer(ctx, oldLeaders, newLeaders);
  _mrApplyLeaders(ctx);
  _mrRenderAll();

  const effRegs = _mrEffRegs();
  const [cl, read, raft, write] = _mrLats();
  addLog(`↺ ${_mrLabel[failed]} RESTORED — rejoining cluster`, 'ls');
  addLog(`Leaders rebalanced across ${effRegs.map(r => _mrLabel[r]).join(' & ')}`, 'ls');
  _mrLogShards();
  if (effRegs.length === 1) addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'li');
};
// ────────────────────────────────────────────────────────────────────────────

// ── Multi-Zone Cluster interactive state ─────────────────────────────────────
window._mzPrefs = ['az1', 'az2', 'az3'];
window._mzFailed = null;
window._mzCtx = null;
window._mzPanelDone = {};

const _mzNodes  = { az1: [1, 2, 3], az2: [4, 5, 6], az3: [7, 8, 9] };
const _mzLabel  = { az1: 'ap-south-1a', az2: 'ap-south-1b', az3: 'ap-south-1c' };
const _mzColors = { az1: '#60a5fa', az2: '#34d399', az3: '#f59e0b' };
const _mzAll    = ['az1', 'az2', 'az3'];

function _mzEffAzs() {
  const active = window._mzPrefs.filter(a => a !== window._mzFailed);
  return active.length ? active : _mzAll.filter(a => a !== window._mzFailed);
}

function _mzEffAz(gi = 0) { const e = _mzEffAzs(); return e[gi % e.length]; }
function _mzLeader(gi) { return _mzNodes[_mzEffAz(gi)][gi]; }
function _mzNodeAz(nid) { return _mzAll.find(a => _mzNodes[a].includes(nid)); }

// All AZs in the same region are equidistant — no meaningful latency difference
function _mzOW(a, b) { return 2; }

function _mzLatsAll() {
  return [0, 1, 2].map(gi => {
    const eff = _mzEffAz(gi);
    return { az: eff, cl: 2, read: 3, raft: 2, write: 5 };
  });
}

function _mzLats() { return [2, 3, 2, 5]; }

function _mzAzLats(az) {
  if (az === window._mzFailed) return null;
  return { read: 3, write: 5 };
}

function _mzAnimDur() { return 400; }

function _mzRenderLatPanel() {
  const panel = document.getElementById('mr-lat-panel');
  if (!panel) return;
  const effAzs = _mzEffAzs();
  const failed = window._mzFailed;
  const prefs = window._mzPrefs;

  let rows = '';
  _mzAll.forEach(az => {
    const isEff = effAzs.includes(az);
    const isFailed = az === failed;
    const isPref = prefs.includes(az);
    const done = window._mzPanelDone || {};
    const lats = !isFailed ? _mzAzLats(az) : null;
    const c = _mzColors[az];

    let st, stCls;
    if (isFailed) { st = '✕ OFFLINE'; stCls = 'mr-st-fail'; }
    else if (isEff && isPref) { st = '● Pinned'; stCls = 'mr-st-pin'; }
    else if (isEff) { st = '◉ Balancing'; stCls = 'mr-st-eff'; }
    else { st = '—'; stCls = 'mr-st-idle'; }

    const readVal = (lats && done[az + ':read']) ? lats.read + 'ms' : '—';
    const writeVal = (lats && done[az + ':write']) ? lats.write + 'ms' : '—';
    const bl = isEff ? `border-left:3px solid ${c}` : isFailed ? 'border-left:3px solid var(--err)' : 'border-left:3px solid transparent';
    const dim = isFailed ? 'opacity:.38' : '';
    rows += `<tr class="mr-lat-tr ${isEff ? 'mr-lat-tr-eff' : ''}" style="${bl};${dim}">
      <td class="mr-lat-td mr-lat-rname" style="color:${isFailed ? 'var(--txt3)' : c}">${_mzLabel[az]}</td>
      <td class="mr-lat-td">${readVal}</td>
      <td class="mr-lat-td">${writeVal}</td>
      <td class="mr-lat-td ${stCls}">${st}</td>
    </tr>`;
  });

  panel.innerHTML = `
    <div class="mr-lat-hdr-row">
      <span class="mr-lat-title">Latency Comparison</span>
      <span class="mr-lat-sub">· client in ap-south-1a · reads from leader · writes include Raft quorum</span>
    </div>
    <table class="mr-lat-tbl">
      <thead><tr>
        <th class="mr-lat-th">AZ</th>
        <th class="mr-lat-th">Read (RTT)</th>
        <th class="mr-lat-th">Write (end-to-end)</th>
        <th class="mr-lat-th">Leader Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _mzRenderAll() { _mzUpdateBtns(); _mzRenderLatPanel(); }

function _mzResetLatBars() {
  for (let i = 0; i < 4; i++) {
    const fill = document.getElementById(`lat-fill-${i}`);
    const val = document.getElementById(`lat-val-${i}`);
    if (fill) fill.style.width = '0%';
    if (val) val.textContent = '—';
  }
  document.querySelectorAll('#lat-rows .lat-row').forEach(el => el.classList.remove('hl-lat'));
}

function _mzUpdateBtns() {
  const prefs = window._mzPrefs, failed = window._mzFailed;
  _mzAll.forEach(az => {
    const btn = document.getElementById(`mz-pref-${az}`);
    if (!btn) return;
    const active = prefs.includes(az), c = _mzColors[az];
    btn.classList.toggle('active', active);
    btn.style.background = active ? c : '';
    btn.style.color = active ? '#0f172a' : c;
    btn.style.borderColor = active ? c : `${c}55`;
    btn.disabled = az === failed;
  });
  const toFail = prefs.find(az => az !== failed) || prefs[0];
  const failBtn = document.getElementById('mz-fail');
  if (failBtn) { failBtn.disabled = !!failed; failBtn.innerHTML = `⚡ Fail ${_mzLabel[toFail]}`; }
  const restBtn = document.getElementById('mz-restore');
  if (restBtn) { restBtn.disabled = !failed; restBtn.innerHTML = failed ? `↺ Restore ${_mzLabel[failed]}` : '↺ Restore'; }
}

function _mzApplyLeaders(ctx) {
  ['mz1', 'mz2', 'mz3'].forEach((id, i) => ctx.setRole(id, _mzLeader(i), 'LEADER'));
}

function _mzAnimateLeaderTransfer(ctx, oldLeaders, newLeaders) {
  [0, 1, 2].filter(gi => oldLeaders[gi] !== newLeaders[gi]).forEach(gi => {
    const oldA = _mzNodeAz(oldLeaders[gi]), newA = _mzNodeAz(newLeaders[gi]);
    ctx.pktTabletToTablet(`mz${gi + 1}`, oldLeaders[gi], `mz${gi + 1}`, newLeaders[gi], 'pk-vote', _mzAnimDur(_mzOW(oldA, newA)));
  });
}

function _mzLogShards() {
  const effAzs = _mzEffAzs();
  if (effAzs.length > 1) {
    [0, 1, 2].forEach(gi => {
      const l = _mzLatsAll()[gi];
      addLog(`  shard-${gi + 1} → ${_mzLabel[l.az]} (Node ${_mzLeader(gi)}) · read ~${l.read}ms · write ~${l.write}ms`, 'li');
    });
  }
}

window.mzSetPrefAz1 = () => window.mzSetPref('az1');
window.mzSetPrefAz2 = () => window.mzSetPref('az2');
window.mzSetPrefAz3 = () => window.mzSetPref('az3');

window.mzSetPref = function(az) {
  if (window._mzFailed === az) return;
  window._mzPanelDone = {};
  _mzResetLatBars();
  const oldLeaders = [0, 1, 2].map(gi => _mzLeader(gi));

  const idx = window._mzPrefs.indexOf(az);
  if (idx === -1) {
    window._mzPrefs.push(az);
    window._mzPrefs.sort((a, b) => _mzAll.indexOf(a) - _mzAll.indexOf(b));
  } else {
    if (window._mzPrefs.length === 1) return;
    window._mzPrefs.splice(idx, 1);
  }

  const newLeaders = [0, 1, 2].map(gi => _mzLeader(gi));
  const ctx = window._mzCtx; if (!ctx) return;

  _mzAnimateLeaderTransfer(ctx, oldLeaders, newLeaders);
  _mzApplyLeaders(ctx);
  _mzRenderAll();

  const effAzs = _mzEffAzs();
  const [cl, read, raft, write] = _mzLats();
  addLog(`Leader preference → ${effAzs.map(a => _mzLabel[a]).join(' & ')}`, 'ls');
  _mzLogShards();
  if (effAzs.length === 1) addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'li');
};

window.mzFailAz = function() {
  const ctx = window._mzCtx; if (!ctx || window._mzFailed) return;
  window._mzPanelDone = {};
  _mzResetLatBars();
  const toFail = window._mzPrefs.find(a => a !== window._mzFailed) || window._mzPrefs[0];
  const oldLeaders = [0, 1, 2].map(gi => _mzLeader(gi));

  window._mzFailed = toFail;
  _mzNodes[toFail].forEach(n => ctx.killNode(n));

  const newLeaders = [0, 1, 2].map(gi => _mzLeader(gi));
  _mzAnimateLeaderTransfer(ctx, oldLeaders, newLeaders);
  _mzApplyLeaders(ctx);
  _mzRenderAll();

  const effAzs = _mzEffAzs();
  const [cl, read, raft, write] = _mzLats();
  addLog(`⚡ ${_mzLabel[toFail]} OFFLINE — nodes ${_mzNodes[toFail].join(', ')} unreachable`, 'le');
  addLog(`Raft re-election: leaders balanced across ${effAzs.map(a => _mzLabel[a]).join(' & ')}`, 'lw');
  _mzLogShards();
  addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'lw');
};

window.mzRestore = function() {
  const ctx = window._mzCtx; if (!ctx || !window._mzFailed) return;
  window._mzPanelDone = {};
  _mzResetLatBars();
  const failed = window._mzFailed;
  const oldLeaders = [0, 1, 2].map(gi => _mzLeader(gi));

  window._mzFailed = null;
  _mzNodes[failed].forEach(n => ctx.reviveNode(n));

  const newLeaders = [0, 1, 2].map(gi => _mzLeader(gi));
  _mzAnimateLeaderTransfer(ctx, oldLeaders, newLeaders);
  _mzApplyLeaders(ctx);
  _mzRenderAll();

  const effAzs = _mzEffAzs();
  const [cl, read, raft, write] = _mzLats();
  addLog(`↺ ${_mzLabel[failed]} RESTORED — rejoining cluster`, 'ls');
  addLog(`Leaders rebalanced across ${effAzs.map(a => _mzLabel[a]).join(' & ')}`, 'ls');
  _mzLogShards();
  if (effAzs.length === 1) addLog(`Read: ~${read}ms  |  Raft: ~${raft}ms  |  Write: ~${write}ms`, 'li');
};
// ────────────────────────────────────────────────────────────────────────────

const SCENARIOS = {
  "home": {
    group: "Home", icon: "🏠", title: "Architecture Explorer", subtitle: "Interactive Distributed SQL Visualizer",
    description: "Dive deep into YugabyteDB's distributed architecture. Explore interactive modules for Sharding, Raft-based replication, High Availability, and Global Data Distribution through real-time visualizations.",
    visual: { type: "home" },
    guidedTour: [
      { text: "Welcome to the Architecture Explorer! Select a module from the sidebar to begin.", element: ".sidebar" },
      { text: "Press <b>?</b> for keyboard shortcuts to quickly step through simulations.", element: ".help-trigger" },
      { text: "Use <b>F</b> to enter Focus Mode for a clearer view of the animations.", element: ".canvas-wrap" }
    ]
  },
  // Architecture: Universe Hierarchy
  "universe-hierarchy": {
    group: "Foundations", icon: "🏗️", sortOrder: 1,
    name: 'Universe', title: 'Universe Hierarchy', subtitle: 'Logical object hierarchy',
    isArch: true,
    desc: 'A <b>Universe</b> is the top-level deployment unit in YugabyteDB. It encompasses one primary cluster and optionally multiple read replica clusters. Within each cluster, data is organized into databases (or keyspaces), schemas, tables, indexes, and other objects — all of which are physically sharded into tablets.',
    guidedTour: [
      { text: "A <b>Universe</b> is the top-level entity — it contains a primary cluster and optional read replica clusters.", element: ".arch-view" },
      { text: "Within each cluster, data is organized into <b>databases / keyspaces</b>, <b>schemas</b>, and <b>tables</b>.", element: ".uh-tree" },
      { text: "Tables and indexes are physically split into <b>tablets</b> — the unit of sharding and replication.", element: ".uh-tablets" }
    ]
  },
  // Architecture: Fault Domains
  "fault-domains": {
    group: "Foundations", icon: "🛡️", sortOrder: 2,
    name: 'Fault Domains', title: 'Fault Domains', subtitle: 'RF, quorum & failure isolation',
    isArch: true,
    desc: 'A <b>fault domain</b> is a group of nodes that can fail together. YugabyteDB places one Raft replica per fault domain — so a single failure never takes down the majority. Domains range from individual nodes to entire clouds. RF must be odd and ≥ the number of fault domains you want to survive.',
    guidedTour: [
      { text: "A <b>fault domain</b> is the unit of failure: everything inside it can go down together. YugabyteDB places exactly one replica per domain.", element: ".arch-view" },
      { text: "RF must be <b>odd</b> so that Raft always has a strict majority after a single-domain failure — even counts leave a 50/50 tie.", element: ".av-quorum" },
      { text: "The formula <b>max failures = ⌊(RF−1)/2⌋</b> tells you how many domains can fail simultaneously before the cluster becomes unavailable.", element: ".av-fd-rf-table" }
    ]
  },
  // Architecture: Consensus Quorum
  "consensus": {
    group: "Foundations", icon: "⬡", sortOrder: 3,
    name: 'Consensus (Raft) Quorum', title: 'Consensus (Raft) Quorum', subtitle: 'Raft roles, writes & elections',
    isArch: true,
    desc: 'Every tablet in YugabyteDB is a <b>Raft group</b> — a set of replicas that use the Raft consensus protocol to guarantee strong consistency. Raft assigns roles (Leader, Follower), manages the write-ahead log, and handles leader elections automatically when failures occur.',
    guidedTour: [
      { text: "Each tablet forms a <b>Raft group</b> with one leader and multiple followers.", element: ".arch-view" },
      { text: "Writes go to the leader, which replicates via <b>AppendEntries</b> RPCs to followers. A majority ACK commits the write.", element: ".cq-write-flow" },
      { text: "When a leader fails, followers run an <b>election</b> — the first to get a majority vote becomes the new leader.", element: ".cq-election" }
    ]
  },
  // Architecture: Control Plane (Master vs TServer)
  "control-plane": {
    group: "Foundations", icon: "🧠", sortOrder: 4,
    name: 'Control Plane', title: 'YB-Master vs YB-TServer', subtitle: 'The Control & Data Planes',
    isArch: true,
    desc: 'A YugabyteDB cluster consists of two types of processes. The <b>YB-Master</b> nodes form the control plane (managing cluster metadata, DDL, and tablet load balancing). The <b>YB-TServer</b> nodes form the data plane (handling client queries, DML, and Raft consensus).',
    guidedTour: [
      { text: "The <b>YB-Master</b> processes form their own Raft group to strongly consistently manage system metadata.", element: ".av-master-section" },
      { text: "The <b>YB-TServer</b> processes handle actual user data, executing queries and managing tablet Raft groups.", element: ".av-tserver-section" }
    ]
  },
  // Architecture: Hybrid Time
  "hybrid-time": {
    group: "System Internals", icon: "⏳", sortOrder: 3,
    name: 'Hybrid Time', title: 'Distributed Hybrid Time', subtitle: 'Global MVCC & Ordering',
    isArch: true,
    desc: 'YugabyteDB uses <b>Hybrid Logical Clocks (HLC)</b> to order events across distributed nodes without requiring expensive atomic clocks. A Hybrid Time timestamp combines physical clock time with a logical sequence number to guarantee strict serializability.',
    guidedTour: [
      { text: "An HLC timestamp is a 64-bit integer combining physical time and a logical sequence number.", element: ".av-ht-diagram" },
      { text: "Nodes piggyback their HLC timestamps on every RPC, allowing the cluster to maintain causal ordering despite clock skew.", element: ".av-ht-sync" }
    ]
  },
  // Architecture: Global Universe
  "universe": {
    group: "Deployment Architectures", icon: "🌐", sortOrder: 1,
    name: 'Global Universe', title: 'Global Universe Architecture', subtitle: 'Fault domains',
    isArch: true,
    desc: 'A single logical database spanning multiple fault domains (zones or regions). Highly available with Zero RPO and Zero RTO, using synchronous replication.',
    guidedTour: [
      { text: "This view shows a <b>Global Universe</b> spanning 3 regions.", element: ".arch-view" },
      { text: "Each region hosts a full copy of the data across 3 nodes.", element: ".av-stats-bar" },
      { text: "Synchronous replication ensures <b>Zero RPO</b> — no data is lost during a region failure.", element: ".av-highlights" }
    ]
  },
  // Architecture: xCluster
  "xcl": {
    group: "Deployment Architectures", icon: "🔗", sortOrder: 2,
    name: 'xCluster Overview', title: 'xCluster Topology', subtitle: 'Cross-cluster',
    isArch: true,
    desc: 'Asynchronous replication between independent clusters. Used for disaster recovery (DR), low-latency local reads in multiple regions, and data migration.',
    guidedTour: [
      { text: "xCluster links <b>independent clusters</b> together via async replication.", element: ".arch-view" },
      { text: "Writes happen locally in each cluster, then replicate across the link.", element: ".av-sv" },
      { text: "Ideal for <b>Disaster Recovery</b> scenarios where clusters are thousands of miles apart.", element: ".av-highlights" }
    ]
  },
  // Architecture: Read Replica
  "read-replica": {
    group: "Deployment Architectures", icon: "📖", sortOrder: 3,
    name: 'Read Replica', title: 'Read Replica Topology', subtitle: 'Low-latency reads',
    isArch: true,
    desc: 'Read-only clones of a primary universe. They provide low-latency reads in remote regions without affecting the write performance of the primary cluster.',
    guidedTour: [
      { text: "Read Replicas are <b>read-only</b> copies of your data.", element: ".arch-view" },
      { text: "They don't participate in Raft quorums, so they don't add write latency.", element: ".av-stats-bar" },
      { text: "Use them to provide <b>local read latency</b> in regions far from your primary cluster.", element: ".av-highlights" }
    ]
  },
  // Architecture: CDC Logical Replication
  "cdc-arch": {
    group: "Deployment Architectures", icon: "🔄", sortOrder: 4,
    name: 'Change Data Capture', title: 'CDC · Logical Replication Architecture', subtitle: 'CDC Service · VWAL · walsender · Kafka',
    isArch: true,
    desc: 'YugabyteDB CDC uses the PostgreSQL logical replication protocol. A <b>CDC Service</b> polls each tablet WAL independently. A <b>Virtual WAL (VWAL)</b> assembles changes from all shards, assigns LSNs, and maintains commit-time order across tablets. The <b>walsender</b> process streams records using the <code>yboutput</code> plugin (default; <code>pgoutput</code> also supported) to consumers such as the YugabyteDB Debezium Connector for Kafka, or any standard <code>pg_recvlogical</code>-compatible client.',
    guidedTour: [
      { text: "The <b>YugabyteDB cluster</b> on the left shows tablet leaders in each AZ. Only leaders emit CDC WAL — the CDC Service polls each independently.", element: ".av-xcl-cluster" },
      { text: "The <b>CDC pipeline</b> in the middle shows how per-tablet WAL records are assembled by the <b>Virtual WAL (VWAL)</b> into a single commit-time-ordered stream, then encoded by <b>walsender</b> using the <code>yboutput</code> plugin (default).", element: ".av-cdc-pipeline" },
      { text: "The <b>consumer stack</b> on the right shows Kafka Connect (YB Debezium Connector) consuming the stream, writing to Kafka topics, and fanning out to downstream systems. The <b>confirmed flush LSN</b> tracks how far the consumer has committed.", element: ".av-cdc-consumers" }
    ]
  },
  // Architecture: Cluster Overview
  "cluster-overview": {
    group: "Foundations", icon: "🗺️", sortOrder: 6,
    name: 'Cluster Overview', title: 'Cluster Overview', subtitle: 'Node & tablet layout',
    steps: [], latencies: [],
    desc: 'YugabyteDB distributes data across TServers using tablet-based sharding. Each table is split into multiple tablets, each of which is a Raft group replicated across nodes. This architecture ensures high availability, scalability, and strong consistency.',
    guidedTour: [
      { text: "Explore the nodes in the cluster. Each box represents a <b>TServer</b>.", element: ".node-card" },
      { text: "Look at the small circles inside. These are <b>Tablets</b> — the unit of sharding.", element: ".n-body" },
      { text: "The filled circles (◉) are <b>Raft Leaders</b>; the empty ones (○) are followers.", element: ".toolbar" }
    ]
  },

  // 1: Hash Sharding
  "1": {
    group: "Data Distribution", icon: "🔢", sortOrder: 1,
    name: 'Hash Sharding', title: 'Hash Sharding', subtitle: 'MurmurHash2 distribution',
    desc: 'The Primary Key is hashed to determine tablet placement. This provides uniform distribution across the cluster, preventing hotspots.',
    guidedTour: [
      { text: "Hash sharding runs the primary key through <b>MurmurHash2</b>, mapping each row to one of the tablets uniformly.", element: ".canvas-wrap" },
      { text: "Click <b>Insert Random User</b> to see a new row hashed and routed to the correct tablet in real time.", element: "#btn-hash" },
      { text: "Notice how inserts spread evenly — sequential IDs hash to <b>different tablets</b>, eliminating write hotspots.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Hash Calculation', cls: 'll', max: 1 }, { lbl: 'Tablet Lookup', cls: 'll', max: 2 }, { lbl: 'Raft Commit', cls: 'lm', max: 10 }],
    extraBtns: [{ id: 'btn-hash', label: '➕ Insert Random User', cls: 'btn-p', cb: 'insertHashUser' }],
    init: (ctx) => {
      showDataPanel(true);
      renderDataTable('users');
      ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY HASH,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
      initHashRouting();
    },
    steps: [
      {
        label: 'Hash Mapping', desc: 'The primary key is hashed into a 0x0000–0xFFFF space. Each tablet owns a contiguous slice. YugabyteDB routes every write directly to the tablet whose range covers the hash — no scatter-gather needed.', action: async (ctx) => {
          for (const g of S.groups.filter(x => x.table === 'users')) {
            ctx.hlTablet(g.id, g.leaderNode, 't-hl');
            await ctx.delay(350);
          }
          addLog('hash(id) → 0x0000–0xFFFF space partitioned across tg1, tg2, tg3', 'li');
        }
      },
      {
        label: 'Write to Leader', desc: 'Client INSERT is routed to the tablet leader that owns the key\'s hash range. The leader appends to WAL and marks the row provisional — visible on the leader immediately but not yet committed. It then fans out Raft AppendEntries to both followers.', action: async (ctx) => {
          const pendingRow = [10, 'Jack', 'MUM', 88, Date.now() / 1000];
          ctx.activateClient(true);
          addLog('INSERT id=10 → hash(10)=0x3A2F → tg1 (0x0000–0x54FF), leader N1', 'li');
          const tgHash = S.groups.find(g => g.id === 'tg1');
          if (tgHash) renderHashRouting(10, '0x3A2F', tgHash);
          ctx.setLat(0, 0.1); ctx.setLat(1, 0.4);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const rs = S.replicaState['tg1']?.[1];
          if (rs) rs.provisionalRows = [pendingRow];
          ctx.reRenderTablet('tg1', 1);
          addLog('Leader N1: WAL append, row provisional ⏳ → fanning out to N2, N3', '');
          ctx.activateClient(false);
        }
      },
      {
        label: 'Raft Replication', desc: 'The leader simultaneously replicates to both followers. Once a majority (2 of 3) ACKs, the provisional row is committed and becomes durable on all three replicas.', action: async (ctx) => {
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          const rs1 = S.replicaState['tg1']?.[1];
          const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now() / 1000];
          if (g) {
            g.data.push(row);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          ctx.setLat(2, 2.1);
          addLog('Majority ACK received — write committed (RF=3, quorum=2) ✓', 'ls');
          renderDataTable('users');
        }
      }
    ]
  },

  // 2: Range (Default)
  "2": {
    group: "Data Distribution", icon: "📏", sortOrder: 2,
    name: 'Range (Default)', title: 'Range (Default)', subtitle: 'Single tablet start',
    filterTable: 'users',
    desc: 'Standard Range Sharding starts with a single tablet. As data grows, YugabyteDB automatically splits the tablet. This is ideal for small tables or when range scans are frequently used.',
    guidedTour: [
      { text: "Range sharding stores rows in <b>sorted key order</b>. A new table starts with a single tablet covering the full key range.", element: ".canvas-wrap" },
      { text: "Click <b>Insert Row</b> to add rows. Once the tablet grows large enough, YugabyteDB auto-splits it.", element: "#btn-range" },
      { text: "Range sharding enables efficient <b>range scans</b> (BETWEEN queries) but risks write hotspots on monotonically increasing keys.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Key Compare', cls: 'll', max: 1 }, { lbl: 'Raft Commit', cls: 'lm', max: 10 }],
    extraBtns: [{ id: 'btn-range', label: '➕ Insert Row', cls: 'btn-p', cb: 'insertHashUser' }],
    init: (ctx) => {
      showDataPanel(true);
      renderDataTable('users');
      const allData = S.groups.filter(g => g.table === 'users').reduce((a, g) => a.concat(g.data), []);
      S.groups = S.groups.filter(g => g.table !== 'users');
      S.groups.push({
        id: 'tg1', table: 'users', tnum: 1, range: '0 — 999', leaderNode: 1, term: 4, replicas: [1, 2, 3],
        data: allData.sort((a, b) => a[0] - b[0])
      });
      ctx.rebuildReplicaState();
      ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY ASC,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
      renderAllTablets(); setTimeout(renderConnections, 80);
    },
    steps: [
      {
        label: 'Initial State', desc: 'Range-sharded tables start with a single tablet on TServer-1, covering the full key range. Writes land sequentially on the same leader — efficient for reads but prone to write hotspots as load grows.', action: async (ctx) => {
          ctx.hlTablet('tg1', 1, 't-hl2');
          addLog('Single tablet tg1 covers 0–999 on N1 (leader)', 'li');
          addLog('All writes route to N1 — sequential hotspot risk', 'lw');
        }
      },
      {
        label: 'Write to Leader', desc: 'INSERT is routed to the single tablet leader (N1). The leader B-Tree compares the key, appends to WAL, and marks the row provisional — visible on the leader immediately but not yet committed. It then fans out to followers.', action: async (ctx) => {
          const pendingRow = [10, 'Jack', 'MUM', 88, Date.now() / 1000];
          ctx.activateClient(true);
          addLog('INSERT id=10 → key compare → tg1 (0–999), leader N1', 'li');
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const rs = S.replicaState['tg1']?.[1];
          if (rs) rs.provisionalRows = [pendingRow];
          ctx.reRenderTablet('tg1', 1);
          ctx.setLat(0, 0.1);
          addLog('Key ordered, WAL append, row provisional ⏳ → fanning out to N2, N3', '');
          ctx.activateClient(false);
        }
      },
      {
        label: 'Raft Replication', desc: 'Leader replicates in parallel to both followers. Majority ACK promotes the provisional row to committed — it becomes durable and visible on all three replicas.', action: async (ctx) => {
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          const rs1 = S.replicaState['tg1']?.[1];
          const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now() / 1000];
          if (g) {
            g.data.push(row);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          ctx.setLat(1, 2.1);
          addLog('Majority ACK — write committed ✓', 'ls');
          renderDataTable('users');
        }
      }
    ]
  },

  // 3: Range (Pre-split)
  "3": {
    group: "Data Distribution", icon: "✂️", sortOrder: 3,
    name: 'Range (Pre-split)', title: 'Range (Pre-split)', subtitle: 'SPLIT AT VALUES',
    filterTable: 'users',
    desc: 'Optimize range sharding by pre-splitting the table into multiple tablets during creation.',
    guidedTour: [
      { text: "<b>SPLIT AT VALUES</b> creates multiple tablets at table creation time, giving each a distinct key range from the start.", element: ".canvas-wrap" },
      { text: "Click <b>Insert Row</b> to see how rows are routed to the correct range tablet based on key value.", element: "#btn-presplit" },
      { text: "Pre-splitting avoids the initial single-tablet hotspot — ideal when you know your key distribution upfront.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Range Lookup', cls: 'll', max: 1 }, { lbl: 'Tablet Lookup', cls: 'll', max: 2 }, { lbl: 'Raft Commit', cls: 'lm', max: 10 }],
    extraBtns: [{ id: 'btn-presplit', label: '➕ Insert Row', cls: 'btn-p', cb: 'insertHashUser' }],
    init: (ctx) => {
      showDataPanel(true);
      renderDataTable('users');
      const d = [[10, 'Alice', 'NY', 87, 1713289000.1], [50, 'Bob', 'CH', 92, 1713289000.2], [150, 'Carol', 'HOU', 78, 1713289000.3], [250, 'David', 'PHX', 95, 1713289000.4], [450, 'Eve', 'SEA', 83, 1713289000.5], [850, 'Frank', 'MIA', 94, 1713289000.6]];
      S.groups = S.groups.filter(g => g.table !== 'users');
      S.groups.push({ id: 'tg1', table: 'users', tnum: 1, range: '-∞ — 100', leaderNode: 1, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] < 100) });
      S.groups.push({ id: 'tg2', table: 'users', tnum: 2, range: '100 — 200', leaderNode: 2, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] >= 100 && r[0] < 200) });
      S.groups.push({ id: 'tg3', table: 'users', tnum: 3, range: '200 — ∞', leaderNode: 3, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] >= 200) });
      ctx.rebuildReplicaState();
      ctx.setDDL('CREATE TABLE users (...) \nSPLIT AT VALUES ((100), (200));');
      renderAllTablets(); setTimeout(renderConnections, 80);
    },
    steps: [
      {
        label: 'Multi-Tablet', desc: 'Table is pre-split into 3 tablets: -∞–100, 100–200, 200–∞. Each tablet is owned by a different leader, distributing load from day one.', action: async (ctx) => {
          for (const g of S.groups.filter(x => x.table === 'users')) {
            ctx.hlTablet(g.id, g.leaderNode, 't-hl');
            await ctx.delay(400);
          }
        }
      },
      {
        label: 'Write → Routed', desc: 'Client inserts id=75. Range lookup maps 75 → tablet tg1 (-∞–100). Write goes to tg1 leader which appends to WAL and marks the row provisional — visible on the leader immediately but not yet committed.', action: async (ctx) => {
          const pendingRow = [75, 'Jack', 'MUM', 88, Date.now() / 1000];
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const rs = S.replicaState['tg1']?.[1];
          if (rs) rs.provisionalRows = [pendingRow];
          ctx.reRenderTablet('tg1', 1);
          ctx.setLat(0, 0.1);
          ctx.setLat(1, 0.4);
          addLog('Client INSERT id=75 → range -∞–100 → tg1 (N1)', 'li');
          addLog('Key ordered, WAL append, row provisional ⏳ → fanning out to N2, N3', '');
          ctx.activateClient(false);
        }
      },
      {
        label: 'Raft Replication', desc: 'Leader fans out to both followers in parallel. Majority ACK promotes the provisional row to committed — durable and visible on all three replicas.', action: async (ctx) => {
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          const rs1 = S.replicaState['tg1']?.[1];
          const row = rs1?.provisionalRows?.[0] || [75, 'Jack', 'MUM', 88, Date.now() / 1000];
          if (g) {
            g.data.push(row);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          ctx.setLat(2, 2.1);
          addLog('Majority ACK → committed, id=75 visible on all tg1 replicas', 'ls');
          renderDataTable('users');
        }
      }
    ]
  },

  "4": {
    group: "Read & Write Paths", icon: "⚡", sortOrder: 1,
    name: 'Fast Path Write', title: 'Fast Path Write', subtitle: 'Quorum & near-follower',
    filterTable: 'users',
    desc: 'YSQL INSERT flows to Raft LEADER → WAL append → replicate to followers → majority ACK → commit. Near follower (TServer-2, ~0.8ms) enables fast majority. If near follower is down, must wait for far follower (TServer-3, ~2.5ms).',
    latencies: [{ lbl: 'Leader WAL', cls: 'll', max: 2 }, { lbl: 'Near Follower', cls: 'll', max: 3 }, { lbl: 'Far Follower', cls: 'lm', max: 12 }, { lbl: 'Majority ACK', cls: 'll', max: 1 }, { lbl: 'Total Latency', cls: 'lm', max: 15 }],
    extraBtns: [{ id: 'btn-tn', label: '💀 Kill Near Follower', cls: 'btn-d', cb: 'toggleNearFollower' }],
    guidedTour: [
      { text: "This module demonstrates the <b>Raft Consensus</b> write path.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to see the 5-phase write process (RPC → WAL → Majority → Commit).", element: "#btn-step" },
      { text: "Try <b>Kill Near Follower</b> and notice how latency increases because the leader must wait for the 'Far' follower.", element: "#btn-tn" }
    ],
    steps: [
      {
        label: 'Client INSERT', desc: 'Client sends INSERT to gateway TServer. Once the write packet reaches the leader, it is appended to the WAL and shown as provisional.', action: async (ctx) => {
          const pendingRow = [10, 'Jack', 'MUM', 88, Date.now() / 1000];
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 500);
          const rs = S.replicaState['tg1']?.[1];
          if (rs) rs.provisionalRows = [pendingRow];
          ctx.reRenderTablet('tg1', 1);
          addLog('INSERT id=10 → tg1 leader N1: WAL append, row provisional ⏳', 'li');
        }
      },
      { label: 'Leader WAL & Replicate', desc: 'Leader fans out AppendEntries to both followers simultaneously — near follower (N2, ~0.8ms) and far follower (N3, ~2.5ms).', action: async (ctx) => { ctx.setLat(0, 0.8); ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300); ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 1000); await ctx.delay(800); } },
      {
        label: 'Majority ACK → Commit → Client ACK',
        desc: 'Near follower (N2) ACKs first — 2/3 majority reached. Leader immediately commits on majority nodes (N1+N2) and ACKs the client. Far follower (N3) ACK and commit complete concurrently in the background — never on the critical path.',
        action: async (ctx) => {
          const nearAlive = S.nodes[1].alive;
          const g = S.groups.find(x => x.id === 'tg1');
          const rs1 = S.replicaState['tg1']?.[1];
          const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now() / 1000];

          if (nearAlive) {
            ctx.setLat(1, 1.2); ctx.setLat(2, 9.5);
            // Await only the majority (N2) ACK
            await ctx.pktTabletToTablet('tg1', 2, 'tg1', 1, 'pk-ack', 350);
            addLog('N2 ACK → 2/3 majority ✓ — committing & ACKing client now', 'ls');

            // Commit majority nodes (N1 + N2) immediately
            if (g) {
              g.data.push(row);
              for (const n of [1, 2]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1, 2]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            ctx.setLat(3, 0.5); ctx.setLat(4, 2.5); ctx.hlLatRow([0, 1, 3, 4]);

            // N3 ACK + commit fires concurrently — intentionally NOT awaited
            addLog('N3 (far follower) ACK in-flight — async, not on critical path', 'li');
            (async () => {
              await ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-ack', 900);
              const rs = S.replicaState['tg1']?.[3];
              if (rs) { rs.provisionalRows = []; }
              ctx.reRenderTablet('tg1', 3, true); ctx.hlTablet('tg1', 3, 't-hl');
              addLog('N3 applied commit in background ✓', 'li');
            })();

            // Client ACK — fires while N3 is still in-flight
            await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400);
            ctx.activateClient(false);
            addLog('Client ACK sent — write complete ✓', 'ls');

          } else {
            // Near follower dead: wait for far follower (N3) as the quorum node
            ctx.setLat(1, 0); ctx.setLat(2, 10.5);
            await ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-ack', 1000);
            addLog('N3 (far follower) ACK → 2/3 majority ✓ (near follower down)', 'ls');
            if (g) {
              g.data.push(row);
              for (const n of [1, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            ctx.setLat(3, 0.5); ctx.setLat(4, 11.8); ctx.hlLatRow([0, 2, 3, 4]);
            await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400);
            ctx.activateClient(false);
            addLog('Client ACK sent — write complete ✓', 'ls');
          }
        }
      }
    ]
  },

  "5": {
    group: "Read & Write Paths", icon: "⚖️", sortOrder: 4,
    name: 'Distributed Transactions', title: 'Distributed Transactions', subtitle: 'Multi-tablet atomicity (2PC)',
    filterTable: ['users', 'transactions'],
    desc: 'Transactions spanning multiple tablets (e.g. updating users in different shards) use a high-performance 2-Phase Commit protocol (2PC). Visibility is atomic across all shards.',
    guidedTour: [
      { text: "Writes touching <b>multiple tablets</b> need 2-Phase Commit (2PC) to appear atomic — either all tablets see the change or none do.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> through the 5 phases: TX Init → Provisional Writes → Commit → Apply → Visible.", element: "#btn-step" },
      { text: "Watch the <b>Transaction Panel</b> as the TX transitions PENDING → COMMITTED. Rows are hidden from other readers until commit.", element: ".tx-panel" }
    ],
    latencies: [{ lbl: 'TX Init', cls: 'll', max: 10 }, { lbl: 'Prov Write', cls: 'lm', max: 50 }, { lbl: 'TX Commit', cls: 'll', max: 10 }, { lbl: 'Visible to All', cls: 'li', max: 5 }, { lbl: 'Total Latency', cls: 'lm', max: 80 }],
    steps: [
      {
        label: '1. Initialize Transaction',
        desc: 'The gateway selects a Transaction Status Tablet (TS-Tablet) and registers a new transaction (PENDING). Status is replicated across TS-Tablet peers.',
        action: async (ctx) => {
          addLog('TX-101: Initializing on Transaction Status Tablet', 'li');
          S.transactions.push({ id: 'TX-101', status: 'PENDING', hb: 20 });
          renderTxPanel();
          await ctx.pktClientToTablet('ts1', 3, 'pk-write', 500);
          const p1 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 1, 'pk-raft', 400);
          const p2 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 2, 'pk-raft', 400);
          await Promise.all([p1, p2]);
          ctx.setLat(0, 3.2);
          S.lastTxInit5 = 3.2;
          ctx.hlLatRow(0);
          ctx.hlTablet('ts1', 3, 't-hl');
          addLog('TX status replicated to system peers ✓', 'ls');
        }
      },
      {
        label: '2. Provisional Writes',
        desc: 'Writes are sent to the target tablet leaders (users.tablet1, users.tablet2) with the transaction ID. Data is "provisional" and not yet visible.',
        action: async (ctx) => {
          addLog('TX-101: Sending provisional writes to shard leaders...', 'li');
          S.replicaState['tg1'][1].provisionalRows = [[1, 'Alice Chen', 'New York', 87, 101.5]];
          S.replicaState['tg2'][2].provisionalRows = [[2, 'Bob Martinez', 'Chicago', 92, 101.5]];
          const c1 = ctx.pktClientToTablet('tg1', 1, 'pk-write', 500);
          const c2 = ctx.pktClientToTablet('tg2', 2, 'pk-write', 500);
          await Promise.all([c1, c2]);

          const provLat = parseFloat((3 + Math.random() * 7).toFixed(1));
          ctx.setLat(1, provLat);
          S.lastProvWrite5 = provLat;
          ctx.hlLatRow([0, 1]);
          renderAllTablets();
          addLog('Provisional writes accepted by leaders.', 'li');
        }
      },
      {
        label: '3. Data Replication',
        desc: 'Leaders replicate these provisional records via Raft to their respective followers across the cluster.',
        action: async (ctx) => {
          addLog('Replicating provisional data to shard peers...', 'li');
          const r1 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 400);
          const r2 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 400);
          const r3 = ctx.pktTabletToTablet('tg2', 2, 'tg2', 1, 'pk-raft', 400);
          const r4 = ctx.pktTabletToTablet('tg2', 2, 'tg2', 3, 'pk-raft', 400);
          await Promise.all([r1, r2, r3, r4]);
          addLog('Provisional data persisted on all replicas ✓', 'ls');
        }
      },
      {
        label: '4. Commit Transaction',
        desc: 'The status is updated to COMMITTED in the status tablet. This commit marker is replicated to system peers to ensure atomicity.',
        action: async (ctx) => {
          addLog('TX-101: Updating status to COMMITTED', 'ls');
          S.transactions[0].status = 'COMMITTED';
          renderTxPanel();
          await ctx.pktClientToTablet('ts1', 3, 'pk-write', 400);
          const p1 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 1, 'pk-raft', 400);
          const p2 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 2, 'pk-raft', 400);
          await Promise.all([p1, p2]);

          const commitLat = 4.1;
          ctx.setLat(2, commitLat);
          const total = parseFloat((S.lastTxInit5 + S.lastProvWrite5 + commitLat).toFixed(1));
          ctx.setLat(4, total);
          ctx.hlLatRow([0, 1, 2, 4]);
          ctx.hlTablet('ts1', 3, 't-hl');
          addLog('Transaction COMMITTED. Data is now logically visible.', 'ls');
        }
      },
      {
        label: '5. Visible to All (Async)',
        desc: 'The gateway notifies tablets to finalize the records. This cleanup happens asynchronously and moves data to permanent storage.',
        action: async (ctx) => {
          addLog('TX-101: Finalizing records across all shards', 'li');
          S.groups.find(g => g.id === 'tg1').data.push([1, 'Alice Chen', 'New York', 87, 101.5]);
          S.groups.find(g => g.id === 'tg2').data.push([2, 'Bob Martinez', 'Chicago', 92, 101.5]);
          S.replicaState['tg1'][1].provisionalRows = [];
          S.replicaState['tg2'][2].provisionalRows = [];

          const r1 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300);
          const r2 = ctx.pktTabletToTablet('tg2', 2, 'tg2', 3, 'pk-raft', 300);
          await Promise.all([r1, r2]);

          renderAllTablets();
          ctx.setLat(3, 1.2);
          ctx.hlLatRow([0, 1, 2, 4]);
          await ctx.delay(800);
          S.transactions = []; renderTxPanel();
          addLog('Cleanup complete. Status record will be purged.', 'ls');
        }
      }
    ]
  },

  "6": {
    group: "Read & Write Paths", icon: "🧬", sortOrder: 5,
    name: 'Index Data Write', title: 'Index Data Write', subtitle: 'Primary + Secondary (2PC)',
    filterIds: ['tg1', 'tg8', 'ts1'],
    init: (ctx) => {
      const tg1 = S.groups.find(g => g.id === 'tg1');
      if (tg1) tg1.range = '0x0000–0xFFFF';
      renderAllTablets(); setTimeout(renderConnections, 80);
    },
    desc: 'Secondary indexes are stored in separate tablets. Updating a row with an index requires a distributed transaction to ensure both are updated atomically.',
    guidedTour: [
      { text: "Secondary indexes live in <b>separate tablets</b>. A write must update both the primary row and the index entry atomically.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to watch 2PC coordinate the provisional writes across the primary tablet and the index tablet.", element: "#btn-step" },
      { text: "Without atomic coordination, a crash between the two writes would leave the index <b>out of sync</b> with the primary table.", element: ".tx-panel" }
    ],
    latencies: [{ lbl: 'TX Init', cls: 'll', max: 10 }, { lbl: 'Prov Write', cls: 'lm', max: 50 }, { lbl: 'TX Commit', cls: 'll', max: 10 }, { lbl: 'Visible to All', cls: 'li', max: 5 }, { lbl: 'Total Latency', cls: 'lm', max: 80 }],
    steps: [
      {
        label: '1. TX Status Init',
        desc: 'All index writes in YugabyteDB are handled as distributed transactions. A transaction status record is created and replicated on system tablets.',
        action: async (ctx) => {
          addLog('Write: Update Alice email → alice@yugabyte.com', 'li');
          S.transactions.push({ id: 'TX-IDX-1', status: 'PENDING', hb: 15 });
          renderTxPanel();
          await ctx.pktClientToTablet('ts1', 3, 'pk-write', 400);
          const p1 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 1, 'pk-raft', 350);
          const p2 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 2, 'pk-raft', 350);
          await Promise.all([p1, p2]);
          ctx.hlTablet('ts1', 3, 't-hl');
          ctx.setLat(0, 2.8);
          S.lastTxInit = 2.8;
          ctx.hlLatRow(0);
        }
      },
      {
        label: '2. Primary & Index Write',
        desc: 'Provisional records are sent to the primary table and index table leaders in parallel.',
        action: async (ctx) => {
          addLog('Writing to Primary and Index leaders in parallel...', 'li');
          S.replicaState['tg1'][1].provisionalRows = [[1, 'Alice Chen', 'NY', 87, 102.0]];
          S.replicaState['tg8'][2].provisionalRows = [['alice@yugabyte.com', 1, 102.0]];

          const c1 = ctx.pktClientToTablet('tg1', 1, 'pk-write', 500);
          const c2 = ctx.pktClientToTablet('tg8', 2, 'pk-write', 500);
          await Promise.all([c1, c2]);

          const provLat = parseFloat((3 + Math.random() * 7).toFixed(1));
          ctx.setLat(1, provLat);
          S.lastProvWrite = provLat;
          ctx.hlLatRow([0, 1]);
          renderAllTablets();
          addLog('Provisional records accepted by leaders.', 'li');
        }
      },
      {
        label: '3. Data Replication',
        desc: 'Both leaders replicate these records to their respective Raft followers.',
        action: async (ctx) => {
          addLog('Replicating WAL to Primary and Index peers...', 'li');
          const r1 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 400);
          const r2 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 400);
          const r3 = ctx.pktTabletToTablet('tg8', 2, 'tg8', 1, 'pk-raft', 400);
          const r4 = ctx.pktTabletToTablet('tg8', 2, 'tg8', 3, 'pk-raft', 400);
          await Promise.all([r1, r2, r3, r4]);
          ctx.hlTablet('tg1', 1, 't-hl'); ctx.hlTablet('tg8', 2, 't-hl');
          addLog('Replication complete ✓', 'ls');
        }
      },
      {
        label: '4. Atomic Commit',
        desc: 'Status is updated to COMMITTED and replicated. Both the data and index entry become visible simultaneously across the cluster.',
        action: async (ctx) => {
          addLog('Updating TX status to COMMITTED ✓', 'ls');
          S.transactions[0].status = 'COMMITTED';
          renderTxPanel();
          await ctx.pktClientToTablet('ts1', 3, 'pk-write', 400);
          const p1 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 1, 'pk-raft', 350);
          const p2 = ctx.pktTabletToTablet('ts1', 3, 'ts1', 2, 'pk-raft', 350);
          await Promise.all([p1, p2]);

          const commitLat = 3.9;
          ctx.setLat(2, commitLat);
          const total = parseFloat((S.lastTxInit + S.lastProvWrite + commitLat).toFixed(1));
          ctx.setLat(4, total);
          ctx.hlLatRow([0, 1, 2, 4]);
          addLog('Atomic commit: Index and Primary data logically synchronized.', 'ls');
        }
      },
      {
        label: '5. Visible to All (Async)',
        desc: 'Final cleanup moves data from provisional to permanent storage in both the primary and index tablets.',
        action: async (ctx) => {
          addLog('Finalizing Primary and Index records...', 'li');
          S.replicaState['tg1'][1].provisionalRows = [];
          S.replicaState['tg8'][2].provisionalRows = [];

          const r1 = ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300);
          const r2 = ctx.pktTabletToTablet('tg8', 2, 'tg8', 1, 'pk-raft', 300);
          await Promise.all([r1, r2]);

          renderAllTablets();
          ctx.setLat(3, 1.5);
          ctx.hlLatRow([0, 1, 2, 4]);
          await ctx.delay(600);
          S.transactions = []; renderTxPanel();
          addLog('Transaction finalized and cleaned up ✓', 'ls');
        }
      }
    ]
  },

  "7": {
    group: "Read & Write Paths", icon: "📖", sortOrder: 2,
    name: 'Consistent Read', title: 'Consistent Read', subtitle: 'Leader reads',
    filterTable: 'users',
    desc: 'Strong-consistency reads always go to the Raft LEADER. If request lands on a follower, it transparently redirects to the leader.',
    guidedTour: [
      { text: "Strong-consistency reads always go to the Raft <b>Leader</b>. A follower that receives a read will transparently redirect it.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to compare the fast path (request hits leader directly) vs the two-hop path (follower redirect).", element: "#btn-step" },
      { text: "Compare the <b>Total</b> latency bar between both paths — the redirect adds one extra network round-trip.", element: ".lat-row" }
    ],
    latencies: [{ lbl: 'Gateway Hop', cls: 'll', max: 2 }, { lbl: 'Remote Redir', cls: 'll', max: 2 }, { lbl: 'Leader Read', cls: 'll', max: 2 }, { lbl: 'Total', cls: 'll', max: 6 }],
    steps: [
      { label: 'Local Read (Fast)', desc: 'Request lands directly on the leader (TServer-1) — no redirect needed.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 1, 'pk-read', 400); ctx.setLat(0, 0.5); ctx.setLat(2, 0.8); ctx.setLat(3, 1.3); ctx.hlLatRow([0, 2, 3]); await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400); ctx.activateClient(false); } },
      { label: 'Remote Read (Request)', desc: 'Request lands on TServer-3 (follower). It detects this is not the leader.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.hlTablet('tg1', 3, 't-hl2'); addLog('TS-3: Received request — redirecting to leader', 'lw'); } },
      { label: 'Remote Read (Redirect)', desc: 'TServer-3 redirects the client to TServer-1 (leader). TServer-1 processes the read request.', action: async (ctx) => { ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-read', 500); await ctx.delay(600); ctx.setLat(3, 3.4); ctx.hlLatRow(3); await ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-ack', 400); await ctx.pktTabletToClient('tg1', 3, 'pk-ack', 400); ctx.activateClient(false); } }
    ]
  },

  "8": {
    group: "Read & Write Paths", icon: "⚡", sortOrder: 3,
    name: 'Follower Reads', title: 'Follower Reads', subtitle: 'Bounded staleness',
    filterTable: 'users',
    desc: 'SET yb_read_from_followers=TRUE allows reads from nearest replica, skipping the leader. Data may be bounded-stale (default 10ms).',
    guidedTour: [
      { text: "Setting <b>yb_read_from_followers=TRUE</b> lets reads go to the nearest replica, bypassing the leader entirely.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to route a read to TServer-3 (nearest follower) — no redirect to the leader needed.", element: "#btn-step" },
      { text: "The follower checks its <b>HybridTime</b> is within the staleness window (default 10ms) before serving. Great for analytics workloads.", element: ".lat-row" }
    ],
    latencies: [{ lbl: 'Route to Follower', cls: 'll', max: 1 }, { lbl: 'Staleness Check', cls: 'll', max: 1 }, { lbl: 'Local Read', cls: 'll', max: 1 }, { lbl: 'Total', cls: 'll', max: 3 }],
    steps: [
      { label: 'Read from Nearest', desc: 'Routes to TServer-3 (follower, nearest to client), bypassing TServer-1 (leader, far).', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.setLat(0, 0.6); ctx.hlLatRow(0); } },
      { label: 'Check & Serve', desc: 'Follower confirms HybridTime within staleness window, serves locally.', action: async (ctx) => { ctx.setLat(1, 0.5); ctx.hlRow('tg1', 3, 0); await ctx.delay(400); ctx.setLat(3, 1.8); ctx.hlLatRow([1, 2, 3]); await ctx.pktTabletToClient('tg1', 3, 'pk-read', 400); ctx.activateClient(false); } }
    ]
  },


  "10": {
    group: "Consistency & High Availability", icon: "🗳️", sortOrder: 1, compactTablets: true,
    name: 'Leader Election', title: 'Leader Election', subtitle: 'Raft lifecycle & recovery',
    desc: 'Full Raft lifecycle: 6 consecutive heartbeat failures → node declared dead → election timeout → Follower→Candidate→Leader. Leaders are distributed fairly across surviving peers. Supports graceful Blacklist/Drain for planned maintenance and Unblacklist to rebalance leaders back.',
    guidedTour: [
      { text: "Raft ensures there is always exactly one <b>Leader</b> per tablet.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to witness the heartbeat failure and re-election logic.", element: "#btn-step" },
      { text: "Watch the <b>Raft Term</b> increment in the toolbar as new leaders are elected.", element: "#term-display" },
      { text: "Try <b>Blacklist TS-2</b> to see how leaders are gracefully moved away before maintenance.", element: "#btn-bl" },
      { text: "Then click <b>Unblacklist TS-2</b> to see YB-Master rebalance leaders back to TS-2 automatically.", element: "#btn-ubl" }
    ],
    latencies: [{ lbl: 'Heartbeat RTT', cls: 'll', max: 2 }, { lbl: 'HB Failures', cls: 'lh', max: 6 }, { lbl: 'Crash Detection', cls: 'lh', max: 400 }, { lbl: 'Leader Lease Expiry', cls: 'lm', max: 2000 }, { lbl: 'Vote RPCs', cls: 'lm', max: 10 }, { lbl: 'New Leaders Up', cls: 'll', max: 5 }, { lbl: 'Re-replication', cls: 'lm', max: 200 }, { lbl: 'Leader Balancing', cls: 'll', max: 15 }],
    electionSteps: ['Heartbeats', 'Miss ×1-3', 'Miss ×4-6', 'Timeout', 'Candidate', 'RequestVote', 'Vote Grant', 'Elected', 'Recovery', 'Balancing'],
    extraBtns: [
      { id: 'btn-bl',  label: '🚫 Blacklist TS-2',   cls: 'btn-d', cb: 'blacklistDrainNode',  disabled: false },
      { id: 'btn-ubl', label: '✅ Unblacklist TS-2', cls: 'btn-g', cb: 'unblacklistNode',     disabled: true  },
    ],
    steps: [
      {
        label: 'Healthy — Heartbeats Flowing',
        desc: 'TServer-2 is LEADER for tg2 (users.tablet2), tg4 (categories.tablet1), and tg8 (email_idx.tablet1). It sends periodic heartbeat AppendEntries every ~200ms to peers, asserting leadership and resetting their election timers.',
        elStep: 0,
        action: async (ctx) => {
          ctx.setLat(0, 0.9);
          addLog('TServer-2 [tg2 LEADER, tg4 LEADER, tg8 LEADER]: heartbeats flowing (term=4)', 'ls');
          for (let i = 0; i < 3; i++) {
            const p1 = ctx.pktTabletToTablet('tg2', 2, 'tg2', 1, 'pk-raft', 300);
            const p2 = ctx.pktTabletToTablet('tg4', 2, 'tg4', 3, 'pk-raft', 300);
            const p3 = ctx.pktTabletToTablet('tg8', 2, 'tg8', 1, 'pk-raft', 300);
            await Promise.all([p1, p2, p3]);
          }
        }
      },
      {
        label: 'TServer-2 Crashes (HB Detection)',
        desc: 'TServer-2 goes down. Node 1 and Node 3 stop receiving heartbeats. After 3 misses, they increase their monitoring frequency. After 6 misses (approx. 1.2s–1.5s), Node 2 is declared dead.',
        elStep: 2,
        action: async (ctx) => {
          const el = document.getElementById('node-2');
          if (el) {
            el.classList.add('n-dead');
            const ind = el.querySelector('.n-indicator');
            ind.style.background = 'var(--dead)'; ind.style.animation = 'none';
            const ov = document.createElement('div'); ov.className = 'dead-overlay'; ov.id = 'dead-2'; ov.textContent = 'NODE FAILED';
            el.appendChild(ov);
          }
          ctx.killNode(2);
          ctx.setLat(2, 290);
          addLog('✕ 6/6 heartbeat failures — TServer-2 declared DEAD', 'le');
          addLog('TS-1, TS-3: election timeout countdown started', 'lw');
        }
      },
      {
        label: 'Election Timeout Fires',
        desc: 'After the randomised election timeout (150–500ms), TS-1 fires for tg2 & tg8, TS-3 fires for tg4. Each increments Raft term (4→5). Fair distribution: different peers initiate elections for different tablet groups.',
        elStep: 3,
        action: async (ctx) => {
          addLog('Election Timeout: tg2 (TS-1), tg4 (TS-3), tg8 (TS-1)', 'lw');
          ctx.setLat(3, 420);
          ctx.hlTerm();
          S.term = 5;
          document.getElementById('term-display').textContent = 'Raft Term: 5';
          ctx.setRole('tg2', 1, 'CANDIDATE');
          ctx.setRole('tg4', 3, 'CANDIDATE');
          ctx.setRole('tg8', 1, 'CANDIDATE');
          await ctx.delay(500);
        }
      },
      {
        label: 'RequestVote RPCs',
        desc: 'Each candidate sends RequestVote RPCs to surviving peers. TS-1 asks TS-3 for tg2 & tg8; TS-3 asks TS-1 for tg4. Votes to dead TS-2 fail silently.',
        elStep: 5,
        action: async (ctx) => {
          addLog('TS-1→TS-3: RequestVote(tg2, term=5, lastIdx=127)', 'lr');
          addLog('TS-3→TS-1: RequestVote(tg4, term=5, lastIdx=127)', 'lr');
          addLog('TS-1→TS-3: RequestVote(tg8, term=5, lastIdx=127)', 'lr');
          addLog('TS-1→TS-2: RequestVote [NO RESPONSE — dead]', 'le');
          addLog('TS-3→TS-2: RequestVote [NO RESPONSE — dead]', 'le');
          ctx.setLat(4, 2.8);
          const p1 = ctx.pktTabletToTablet('tg2', 1, 'tg2', 3, 'pk-vote', 520);
          const p2 = ctx.pktTabletToTablet('tg4', 3, 'tg4', 1, 'pk-vote', 520);
          const p3 = ctx.pktTabletToTablet('tg8', 1, 'tg8', 3, 'pk-vote', 520);
          await Promise.all([p1, p2, p3]);
        }
      },
      {
        label: 'Votes Granted — Majority',
        desc: 'TS-3 grants votes to TS-1 for tg2 & tg8 (2/3 majority each). TS-1 grants vote to TS-3 for tg4 (2/3 majority). All three tablets have enough votes to elect new leaders.',
        elStep: 6,
        action: async (ctx) => {
          addLog('TS-3→TS-1: VoteGranted(tg2) — 2/3 MAJORITY ✓', 'ls');
          addLog('TS-1→TS-3: VoteGranted(tg4) — 2/3 MAJORITY ✓', 'ls');
          addLog('TS-3→TS-1: VoteGranted(tg8) — 2/3 MAJORITY ✓', 'ls');
          const a1 = ctx.pktTabletToTablet('tg2', 3, 'tg2', 1, 'pk-ack', 460);
          const a2 = ctx.pktTabletToTablet('tg4', 1, 'tg4', 3, 'pk-ack', 460);
          const a3 = ctx.pktTabletToTablet('tg8', 3, 'tg8', 1, 'pk-ack', 460);
          await Promise.all([a1, a2, a3]);
        }
      },
      {
        label: 'New Leaders Elected',
        desc: 'TS-1 elected LEADER for tg2 & tg8; TS-3 elected LEADER for tg4. They immediately send heartbeats to assert authority. All tablets that lost their leader now have a new one.',
        elStep: 7,
        action: async (ctx) => {
          S.groups.find(g => g.id === 'tg2').leaderNode = 1; S.groups.find(g => g.id === 'tg2').term = 5;
          S.groups.find(g => g.id === 'tg4').leaderNode = 3; S.groups.find(g => g.id === 'tg4').term = 5;
          S.groups.find(g => g.id === 'tg8').leaderNode = 1; S.groups.find(g => g.id === 'tg8').term = 5;
          renderAllTablets(); renderConnections();
          addLog('tg2 → LEADER: TServer-1 (term=5) ✓', 'ls');
          addLog('tg4 → LEADER: TServer-3 (term=5) ✓', 'ls');
          addLog('tg8 → LEADER: TServer-1 (term=5) ✓', 'ls');
          ctx.hlTablet('tg2', 1, 't-hl'); ctx.hlTablet('tg4', 3, 't-hl'); ctx.hlTablet('tg8', 1, 't-hl');
          ctx.setLat(5, 4.2);
          document.getElementById('health-txt').textContent = '⚠️ Degraded · RF=3 · TServer-2 dead · 2/3 nodes up';
          const p1 = ctx.pktTabletToTablet('tg2', 1, 'tg2', 3, 'pk-raft', 300);
          const p2 = ctx.pktTabletToTablet('tg4', 3, 'tg4', 1, 'pk-raft', 300);
          const p3 = ctx.pktTabletToTablet('tg8', 1, 'tg8', 3, 'pk-raft', 300);
          await Promise.all([p1, p2, p3]);
        }
      },
      {
        label: 'TServer-2 Recovers',
        desc: 'TServer-2 is restarted. It discovers term=5 > its term=4. It realizes it is no longer the leader, steps down, and becomes a follower in tg2/tg4.',
        action: async (ctx) => {
          addLog('TServer-2: RESTARTED · Joining cluster...', 'li');
          ctx.reviveNode(2);
          document.getElementById('dead-2')?.remove();
          addLog('TS-2: term out-of-date (4 < 5) → FOLLOWER', 'lw');
          renderAllTablets(); renderConnections();
          ctx.setLat(6, 120);
        }
      },
      {
        label: 'Auto-Balancing',
        desc: 'YB-Master detects imbalance: TS-2 has zero leaders while TS-1 leads tg2 & tg8 and TS-3 leads tg4. It triggers graceful StepDown transfers so TS-2 reclaims all three tablet groups and the cluster returns to the original balanced distribution.',
        elStep: 9,
        action: async (ctx) => {
          addLog('YB-Master: Imbalance detected. Rebalancing...', 'li');
          addLog('TS-1: LeaderStepDown(tg2) → Transfer to TS-2', 'lr');
          addLog('TS-3: LeaderStepDown(tg4) → Transfer to TS-2', 'lr');
          addLog('TS-1: LeaderStepDown(tg8) → Transfer to TS-2', 'lr');
          const p1 = ctx.pktTabletToTablet('tg2', 1, 'tg2', 2, 'pk-vote', 600);
          const p2 = ctx.pktTabletToTablet('tg4', 3, 'tg4', 2, 'pk-vote', 600);
          const p3 = ctx.pktTabletToTablet('tg8', 1, 'tg8', 2, 'pk-vote', 600);
          await Promise.all([p1, p2, p3]);
          S.groups.find(g => g.id === 'tg2').leaderNode = 2; S.groups.find(g => g.id === 'tg2').term = 5;
          S.groups.find(g => g.id === 'tg4').leaderNode = 2; S.groups.find(g => g.id === 'tg4').term = 5;
          S.groups.find(g => g.id === 'tg8').leaderNode = 2; S.groups.find(g => g.id === 'tg8').term = 5;
          renderAllTablets(); renderConnections();
          addLog('tg2 → LEADER: TServer-2 restored ✓', 'ls');
          addLog('tg4 → LEADER: TServer-2 restored ✓', 'ls');
          addLog('tg8 → LEADER: TServer-2 restored ✓', 'ls');
          document.getElementById('health-txt').textContent = 'Healthy · RF=3 · Leaders Balanced (TS-1×2, TS-2×3, TS-3×3)';
          ctx.setLat(7, 12);
          ctx.hlLatRow(7);
        }
      }
    ]
  },
  "11": {
    group: "Consistency & High Availability", icon: "💥", sortOrder: 2, compactTablets: true,
    name: 'Node Failure', title: 'Node Failure', subtitle: 'Crash & catch-up',
    desc: 'TServer-3 crashes. Raft re-election gives new leaders for tg3 (users.tablet3) & tg6 (products.tablet2). Auto-writes continue during outage. On recovery, TServer-3 catches up all missed writes and leaders are rebalanced back to it.',
    guidedTour: [
      { text: "This module simulates a <b>TServer-3 crash</b> and Raft recovery.", element: ".canvas-wrap" },
      { text: "Click <b>💀 Kill TServer-3</b> to trigger the failure.", element: "#btn-k3" },
      { text: "Watch the 'Follower' tablets on other nodes become <b>Leaders</b> (◉) to maintain availability.", element: ".n-body" },
      { text: "Click <b>Start Writes</b> in the Failure Dashboard to see how the cluster handles traffic during an outage.", element: "#btn-fd-run" }
    ],
    latencies: [{ lbl: 'Crash Detection', cls: 'lh', max: 500 }, { lbl: 'Re-election', cls: 'lm', max: 20 }, { lbl: 'Write during fail', cls: 'lm', max: 8 }, { lbl: 'Re-replication', cls: 'lm', max: 200 }],
    failureMode: 'node',
    extraBtns: [
      { id: 'btn-k3', label: '💀 Kill TServer-3', cls: 'btn-d', cb: 'fdKillNode3' },
      { id: 'btn-r3', label: '🔄 Revive TServer-3', cls: 'btn-g', cb: 'fdReviveNode3', disabled: true }
    ],
    steps: [
      {
        label: 'Cluster Healthy + Writes Running',
        desc: 'Start auto-writes to see the cluster in steady state. All 3 TServers are alive. TServer-3 is LEADER for tg3 (users.tablet3) and tg6 (products.tablet2).',
        action: async (ctx) => {
          addLog('Cluster healthy · auto-writes recommended', 'ls');
          addLog('TServer-3 leads: users.tablet3 (tg3), products.tablet2 (tg6)', 'li');
          if (!fdAutoRunning) fdToggleAutoWrite();
        }
      },
      {
        label: 'TServer-3 Crashes',
        desc: 'TServer-3 goes down. Heartbeats from TS-3 stop. TS-1 and TS-2 detect the silence, increment to term=5, and become candidates for tg3 and tg6 respectively.',
        action: async (ctx) => {
          fdKillNode3();
          ctx.setLat(0, 300);
          addLog('TServer-3: CRASHED', 'le');
          await ctx.delay(600);
          S.term = 5; document.getElementById('term-display').textContent = 'Raft Term: 5';
          ctx.setRole('tg3', 1, 'CANDIDATE');
          ctx.setRole('tg6', 2, 'CANDIDATE');
          addLog('TS-1: election timeout → CANDIDATE for tg3 (term=5)', 'lw');
          addLog('TS-2: election timeout → CANDIDATE for tg6 (term=5)', 'lw');
          const p1 = ctx.pktTabletToTablet('tg3', 1, 'tg3', 2, 'pk-vote', 500);
          const p2 = ctx.pktTabletToTablet('tg6', 2, 'tg6', 1, 'pk-vote', 500);
          await Promise.all([p1, p2]);
        }
      },
      {
        label: 'New Leaders Elected',
        desc: 'TS-2 grants vote to TS-1 for tg3 (2/3 majority). TS-1 grants vote to TS-2 for tg6 (2/3 majority). New leaders are elected. Auto-write loop now routes around TServer-3.',
        action: async (ctx) => {
          addLog('TS-2→TS-1: VoteGranted(tg3) — 2/3 MAJORITY ✓', 'ls');
          addLog('TS-1→TS-2: VoteGranted(tg6) — 2/3 MAJORITY ✓', 'ls');
          const a1 = ctx.pktTabletToTablet('tg3', 2, 'tg3', 1, 'pk-ack', 460);
          const a2 = ctx.pktTabletToTablet('tg6', 1, 'tg6', 2, 'pk-ack', 460);
          await Promise.all([a1, a2]);
          S.groups.find(g => g.id === 'tg3').leaderNode = 1; S.groups.find(g => g.id === 'tg3').term = 5;
          S.groups.find(g => g.id === 'tg6').leaderNode = 2; S.groups.find(g => g.id === 'tg6').term = 5;
          renderAllTablets(); renderConnections();
          ctx.hlTablet('tg3', 1, 't-hl'); ctx.hlTablet('tg6', 2, 't-hl');
          ctx.setLat(1, 15); ctx.setLat(2, 6.5);
          addLog('tg3 → LEADER: TServer-1 (term=5) ✓', 'ls');
          addLog('tg6 → LEADER: TServer-2 (term=5) ✓', 'ls');
          addLog('Writes continue — 2/3 quorum available', 'ls');
          document.getElementById('health-txt').textContent = '⚠️ Degraded · tg3,tg6 RF=2 · TS-3 down';
        }
      },
      {
        label: 'TServer-3 Recovers & Rebalances',
        desc: 'TServer-3 comes back online. YB-Master streams all missed writes to bring it current. Once caught up, leadership for tg3 and tg6 is gracefully transferred back to TServer-3, restoring the original distribution.',
        action: async (ctx) => {
          fdReviveNode3();
          addLog('TServer-3: ONLINE · catch-up starting', 'ls');
          ctx.setLat(3, 150);
          await fdCatchUp(3);
          addLog('TServer-3 fully caught up · RF=3 restored ✓', 'ls');
          addLog('YB-Master: Rebalancing leaders back to TS-3', 'li');
          addLog('TS-1: LeaderStepDown(tg3) → Transfer to TS-3', 'lr');
          addLog('TS-2: LeaderStepDown(tg6) → Transfer to TS-3', 'lr');
          const p1 = ctx.pktTabletToTablet('tg3', 1, 'tg3', 3, 'pk-vote', 600);
          const p2 = ctx.pktTabletToTablet('tg6', 2, 'tg6', 3, 'pk-vote', 600);
          await Promise.all([p1, p2]);
          S.groups.find(g => g.id === 'tg3').leaderNode = 3; S.groups.find(g => g.id === 'tg3').term = 5;
          S.groups.find(g => g.id === 'tg6').leaderNode = 3; S.groups.find(g => g.id === 'tg6').term = 5;
          renderAllTablets(); renderConnections();
          addLog('tg3 → LEADER: TServer-3 restored ✓', 'ls');
          addLog('tg6 → LEADER: TServer-3 restored ✓', 'ls');
          document.getElementById('health-txt').textContent = `Healthy · RF=3 · 3 TServers · ${S.groups.length} Raft Groups`;
        }
      }
    ]
  },
  "12": {
    group: "Consistency & High Availability", icon: "🔀", sortOrder: 3, compactTablets: true,
    name: 'Network Partition', title: 'Network Partition', subtitle: 'Split-brain & quorum',
    desc: 'TServer-3 is cut off from TServer-1 and TServer-2 by a network partition. TS-3 tries to elect itself leader but cannot win majority (1/3 < 2). TS-1 & TS-2 (quorum) continue serving writes. TS-3 returns stale reads.',
    guidedTour: [
      { text: "A network partition isolates TS-3. With only 1 of 3 votes it <b>cannot win a Raft election</b> — the cluster remains safe.", element: ".canvas-wrap" },
      { text: "Click <b>Partition TS-3</b> to trigger the split. TS-1 & TS-2 retain quorum and keep serving writes uninterrupted.", element: "#btn-prt" },
      { text: "Click <b>Heal Partition</b> to reconnect TS-3. Watch it detect the gap in Raft log and <b>catch up</b> all missed writes.", element: "#btn-heal" }
    ],
    latencies: [{ lbl: 'Partition Detected', cls: 'lh', max: 500 }, { lbl: 'TS-3 Election Attempt', cls: 'lm', max: 10 }, { lbl: 'Write (majority side)', cls: 'll', max: 4 }, { lbl: 'Read (TS-3 stale)', cls: 'lm', max: 2 }, { lbl: 'Heal & Resync', cls: 'lm', max: 200 }],
    failureMode: 'partition',
    extraBtns: [
      { id: 'btn-prt', label: '⟊ Partition TS-3', cls: 'btn-o', cb: 'fdPartitionNode3' },
      { id: 'btn-heal', label: '🔗 Heal Partition', cls: 'btn-g', cb: 'fdHealPartition', disabled: true }
    ],
    steps: [
      {
        label: 'Healthy Cluster + Writes',
        desc: 'All nodes connected. TServer-3 leads tg3 (users.tablet3) & tg6 (products.tablet2). Start writes to observe the steady state before partition.',
        action: async (ctx) => {
          addLog('Cluster fully connected', 'ls');
          addLog('TServer-3 leads: users.tablet3 (tg3), products.tablet2 (tg6)', 'li');
          if (!fdAutoRunning) fdToggleAutoWrite();
        }
      },
      {
        label: 'Network Partition: TS-3 Isolated',
        desc: 'The network link between TS-3 and TS-1/TS-2 is severed. TS-3 can no longer send heartbeats to its followers on the majority side. TS-1 & TS-2 detect the silence and begin their own election timeout.',
        action: async (ctx) => {
          fdPartitionNode3();
          addLog('PARTITION: TS-3 ⟊ {TS-1, TS-2}', 'le');
          addLog('Majority side: TS-1 & TS-2 lost heartbeats from TS-3', 'lw');
          await ctx.delay(500);
        }
      },
      {
        label: 'Majority side detects loss of leader',
        desc: 'TS-1 and TS-2 timeouts fire for the groups previously led by TS-3. TS-1 becomes a candidate for tg3, and TS-2 becomes a candidate for tg6. They request votes from each other.',
        action: async (ctx) => {
          S.term = 5; document.getElementById('term-display').textContent = 'Raft Term: 5';
          ctx.setRole('tg3', 1, 'CANDIDATE'); ctx.setRole('tg6', 2, 'CANDIDATE');
          addLog('TS-1: election timeout → CANDIDATE for tg3 (term=5)', 'lr');
          addLog('TS-2: election timeout → CANDIDATE for tg6 (term=5)', 'lr');
          const p1 = ctx.pktTabletToTablet('tg3', 1, 'tg3', 2, 'pk-vote', 500);
          const p2 = ctx.pktTabletToTablet('tg6', 2, 'tg6', 1, 'pk-vote', 500);
          await Promise.all([p1, p2]);
        }
      },
      {
        label: 'Majority Side Elects New Leaders',
        desc: 'TS-2 grants vote to TS-1 for tg3 (2/3 quorum). TS-1 grants vote to TS-2 for tg6 (2/3 quorum). New leaders are established on the majority partition.',
        action: async (ctx) => {
          addLog('TS-2→TS-1: VoteGranted(tg3) — 2/3 MAJORITY ✓', 'ls');
          addLog('TS-1→TS-2: VoteGranted(tg6) — 2/3 MAJORITY ✓', 'ls');
          const a1 = ctx.pktTabletToTablet('tg3', 2, 'tg3', 1, 'pk-ack', 460);
          const a2 = ctx.pktTabletToTablet('tg6', 1, 'tg6', 2, 'pk-ack', 460);
          await Promise.all([a1, a2]);
          S.groups.find(g => g.id === 'tg3').leaderNode = 1; S.groups.find(g => g.id === 'tg3').term = 5;
          S.groups.find(g => g.id === 'tg6').leaderNode = 2; S.groups.find(g => g.id === 'tg6').term = 5;
          renderAllTablets(); renderConnections();
          ctx.hlTablet('tg3', 1, 't-hl'); ctx.hlTablet('tg6', 2, 't-hl');
          addLog('Majority side: tg3 → TS-1, tg6 → TS-2 (term=5) ✓', 'ls');
          addLog('TS-1 & TS-2 continue serving writes normally', 'ls');
          ctx.setLat(2, 3.8);
          document.getElementById('health-txt').textContent = '⚠️ Partitioned · TS-3 isolated · quorum=2/3';
        }
      },
      {
        label: 'TS-3 Serves Stale Reads',
        desc: 'TS-3 still has its old data but cannot accept new writes (no quorum). Any reads from TS-3 are stale — they reflect the data at the time of partition. In YugabyteDB, strong-consistency reads would be rejected or redirected.',
        action: async (ctx) => {
          addLog('TS-3: read requests arriving (stale data)', 'lw');
          ctx.setLat(3, 1.9);
          await ctx.pktClientToTablet('tg3', 3, 'pk-read', 500);
          addLog('TS-3 tg3: serving stale data (log behind by N entries)', 'lw');
          await ctx.delay(400);
        }
      },
      {
        label: 'Partition Heals — TS-3 Resyncs & Rebalances',
        desc: 'The network link is restored. TS-3 discovers term=5 > its term=4, steps down to FOLLOWER, and catches up all missed writes. Then YB-Master rebalances: tg3 and tg6 leadership transferred back to TS-3.',
        action: async (ctx) => {
          fdHealPartition();
          addLog('Partition healed · TS-3 discovers term=5', 'ls');
          addLog('TS-3: stepping down, starting catch-up', 'ls');
          ctx.setLat(4, 160);
          await fdCatchUp(3);
          addLog('TS-3 fully synced · partition recovery complete ✓', 'ls');
          addLog('YB-Master: Rebalancing leaders back to TS-3', 'li');
          addLog('TS-1: LeaderStepDown(tg3) → Transfer to TS-3', 'lr');
          addLog('TS-2: LeaderStepDown(tg6) → Transfer to TS-3', 'lr');
          const p1 = ctx.pktTabletToTablet('tg3', 1, 'tg3', 3, 'pk-vote', 600);
          const p2 = ctx.pktTabletToTablet('tg6', 2, 'tg6', 3, 'pk-vote', 600);
          await Promise.all([p1, p2]);
          S.groups.find(g => g.id === 'tg3').leaderNode = 3; S.groups.find(g => g.id === 'tg3').term = 5;
          S.groups.find(g => g.id === 'tg6').leaderNode = 3; S.groups.find(g => g.id === 'tg6').term = 5;
          renderAllTablets(); renderConnections();
          addLog('tg3 → LEADER: TServer-3 restored ✓', 'ls');
          addLog('tg6 → LEADER: TServer-3 restored ✓', 'ls');
          document.getElementById('health-txt').textContent = `Healthy · RF=3 · 3 TServers · ${S.groups.length} Raft Groups`;
        }
      }
    ]
  },

  "22": {
    group: "Foundations", icon: "⚡", sortOrder: 3.3, shardingPanel: true,
    name: 'Sharding = Scalability', title: 'Sharding = Scalability', subtitle: 'Why horizontal scale works',
    desc: 'Start with one tablet, add rows, watch it split — then scale across six nodes. Every shard added is a new lane of write capacity.',
    guidedTour: [
      { text: "Start with one node handling all writes. Watch what happens to <b>CPU and latency</b> as traffic grows past the break-even point.", element: ".canvas-wrap" },
      { text: "Steps 1–2 show a single node going from healthy to saturated. When CPU hits ~90%, <b>latency spikes 8×</b> — that is the ceiling.", element: ".sharding-perf-panel" },
      { text: "Steps 3–4 add nodes. <b>Throughput multiplies. Latency stays flat.</b> Each node handles a smaller share — that is horizontal scaling.", element: ".sharding-perf-panel" }
    ],
    init: (ctx) => {
      ctx.setCanvasGeoMode(false);
      ctx.setCanvasRegionMode(false);
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, n === 1);

      S.groups = [
        {
          id: 'sh1', table: 'users', tnum: 1, range: '0x0000–0xFFFF',
          leaderNode: 1, term: 4, replicas: [1], maxRows: 20,
          simpleTable: true, hideStorage: true,
          data: [
            [1,  'Alice', 'NY',  87, 1713289000.01],
            [2,  'Bob',   'CHI', 92, 1713289000.02],
            [3,  'Carol', 'HOU', 78, 1713289000.03],
            [4,  'Diana', 'PHX', 95, 1713289000.04],
            [5,  'Eva',   'SEA', 83, 1713289000.05],
            [6,  'Frank', 'BOS', 91, 1713289000.06],
            [7,  'Grace', 'AUS', 88, 1713289000.07],
            [8,  'Henry', 'DEN', 76, 1713289000.08],
            [9,  'Iris',  'MIA', 94, 1713289000.09],
            [10, 'Jake',  'POR', 80, 1713289000.10],
            [11, 'Kate',  'LA',  86, 1713289000.11],
            [12, 'Lena',  'SF',  89, 1713289000.12],
            [13, 'Maya',  'DAL', 82, 1713289000.13],
            [14, 'Noah',  'VEG', 77, 1713289000.14],
            [15, 'Omar',  'ATL', 90, 1713289000.15]
          ]
        }
      ];
      S.replicaState = buildRS(S.groups);
      renderAllTablets();
      setTimeout(renderConnections, 80);

      // Label this as a plain "Node" — no distributed-system terminology yet
      const nameEl = document.querySelector('#node-1 .n-name');
      if (nameEl) nameEl.textContent = 'Node';
      const zoneEl = document.querySelector('#node-1 .n-zone');
      if (zoneEl) zoneEl.style.display = 'none';

      // Panel starts empty — values populate only as the user steps through
      const shpC = document.getElementById('shp-content');
      if (shpC) shpC.innerHTML = '';
    },
    steps: [
      {
        label: '1. Single Node — Normal Load',
        desc: 'Requests arrive at a steady pace. The single node receives all writes. Load and CPU stay moderate. Latency is low — this is the healthy operating range.',
        action: async (ctx) => {
          ctx.activateClient(true);
          const g = S.groups.find(x => x.id === 'sh1');
          const incoming = [
            [16, 'Pam',   'NAS', 74, 1713289001.1],
            [17, 'Quinn', 'TAM', 85, 1713289001.2],
            [18, 'Rosa',  'BAL', 93, 1713289001.3]
          ];
          for (const row of incoming) {
            ctx.pktClientToTablet('sh1', 1, 'pk-write', 480);
            await ctx.delay(420);
            g.data.push([...row]);
            ctx.reRenderTablet('sh1', 1, true);
            await ctx.delay(100);
          }
          ctx.activateClient(false);
          renderShardingPerfPanel({
            nodes: 1, shards: 1, throughput: 8000, maxThroughput: 60000, latency: 10, maxLatency: 100,
            nodeLoads: [{ node: 1, pct: 40 }],
            cpuLoads:  [{ node: 1, pct: 38 }],
            insight: 'Healthy zone: CPU 38%, write load 40%. Latency 10 ms — the single-node comfort range.'
          });
          addLog('18 rows · Node at 40% load · CPU 38% · latency 10 ms', 'ls');
        }
      },
      {
        label: '2. Single Node — Approaching Saturation',
        desc: 'Traffic spikes. Every write still funnels through the same single node — it has no relief valve. CPU and write load climb toward 90%. Latency spikes sharply. This is the break-even point.',
        action: async (ctx) => {
          addLog('Traffic burst — all writes funnelling through the single node', 'lw');
          ctx.activateClient(true);
          ctx.hlTablet('sh1', 1, 't-hl');
          for (let i = 0; i < 8; i++) {
            ctx.pktClientToTablet('sh1', 1, 'pk-write', 500);
            await ctx.delay(190);
          }
          ctx.activateClient(false);
          renderShardingPerfPanel({
            nodes: 1, shards: 1, throughput: 11000, maxThroughput: 60000, latency: 82, maxLatency: 100,
            nodeLoads: [{ node: 1, pct: 92 }],
            cpuLoads:  [{ node: 1, pct: 89 }],
            insight: '⚠ Break-even: CPU 89%, write load 92%. Latency spiked 8× to 82 ms. Single-node ceiling reached.'
          });
          addLog('Node at 92% load · CPU 89% · latency 82 ms — 8× worse than normal', 'lw');
          addLog('Break-even point reached — time to scale out', 'lw');
        }
      },
      {
        label: '3. Scale Out → 3 Nodes',
        desc: 'Now distributed systems kick in. The data is sharded across three nodes — each gets its own tablet. Load is shared equally. CPU per node drops back to healthy. Latency returns to normal.',
        action: async (ctx) => {
          addLog('YB-Master: provisioning TS-2 and TS-3 — sharding data across 3 nodes', 'li');
          const dAll = [...S.groups.find(x => x.id === 'sh1').data];

          // Restore TServer identity now that we're entering distributed mode
          const nameEl = document.querySelector('#node-1 .n-name');
          if (nameEl) nameEl.textContent = 'TServer-1';
          const zoneEl = document.querySelector('#node-1 .n-zone');
          if (zoneEl) zoneEl.style.display = '';

          const srcEl = document.getElementById('tablet-sh1-1');
          if (srcEl) srcEl.classList.add('t-splitting');
          await ctx.delay(480);

          ctx.setNodeVisibility(2, true);
          ctx.setNodeVisibility(3, true);
          await ctx.delay(280);

          S.groups = [
            { id: 'sha', table: 'users', tnum: '1a', range: '0x0000–0x54FF', leaderNode: 1, term: 6, replicas: [1], maxRows: 6, data: dAll.slice(0, 6)  },
            { id: 'shb', table: 'users', tnum: '1b', range: '0x5500–0xA9FF', leaderNode: 2, term: 6, replicas: [2], maxRows: 6, data: dAll.slice(6, 12) },
            { id: 'shc', table: 'users', tnum: '1c', range: '0xAA00–0xFFFF', leaderNode: 3, term: 6, replicas: [3], maxRows: 6, data: dAll.slice(12)    }
          ];
          S.replicaState = buildRS(S.groups);
          for (const sg of S.groups) {
            const rs = S.replicaState[sg.id]?.[sg.leaderNode];
            if (rs) rs.newRows = sg.data.map((_, i) => i);
          }
          renderAllTablets(); renderConnections();
          const post3 = S.groups.map(sg => ({ id: sg.id, node: sg.leaderNode }));
          setTimeout(() => post3.forEach(({ id, node }) => {
            const rs = S.replicaState[id]?.[node]; if (rs) rs.newRows = [];
            reRenderTabletInternal(id, node);
          }), 2000);

          ctx.hlTablet('sha', 1, 't-new');
          ctx.hlTablet('shb', 2, 't-new');
          ctx.hlTablet('shc', 3, 't-new');
          addLog('sha: rows 1–6 · TS-1  |  shb: rows 7–12 · TS-2  |  shc: rows 13–18 · TS-3', 'ls');
          await ctx.delay(400);

          ctx.activateClient(true);
          for (let i = 0; i < 3; i++) {
            ctx.pktClientToTablet('sha', 1, 'pk-write', 500);
            ctx.pktClientToTablet('shb', 2, 'pk-write', 500);
            ctx.pktClientToTablet('shc', 3, 'pk-write', 500);
            await ctx.delay(650);
          }
          ctx.activateClient(false);

          renderShardingPerfPanel({
            nodes: 3, shards: 3, throughput: 30000, maxThroughput: 60000, latency: 11, maxLatency: 100,
            nodeLoads: [{ node: 1, pct: 30 }, { node: 2, pct: 30 }, { node: 3, pct: 30 }],
            cpuLoads:  [{ node: 1, pct: 29 }, { node: 2, pct: 29 }, { node: 3, pct: 29 }],
            insight: '3× throughput. Per-node load back to 30% CPU. Latency: 11 ms — same as healthy single-node.'
          });
          addLog('3 shards · 3 nodes · 30,000 writes/sec · CPU 29% each · latency 11 ms', 'ls');
        }
      },
      {
        label: '4. Scale Out → 6 Nodes',
        desc: 'Each shard splits once more. Six nodes, six parallel write lanes — throughput doubles again. But notice: latency stays at 11 ms. Each node handles a smaller share, so per-node pressure stays constant. This is how horizontal scaling works.',
        action: async (ctx) => {
          for (const n of [4, 5, 6]) {
            ctx.setNodeVisibility(n, true);
            addLog(`TS-${n} joined`, 'ls');
            await ctx.delay(180);
          }

          const dA = [...S.groups.find(x => x.id === 'sha').data];
          const dB = [...S.groups.find(x => x.id === 'shb').data];
          const dC = [...S.groups.find(x => x.id === 'shc').data];

          [{ id: 'sha', n: 1 }, { id: 'shb', n: 2 }, { id: 'shc', n: 3 }].forEach(({ id, n }) => {
            const el = document.getElementById(`tablet-${id}-${n}`);
            if (el) el.classList.add('t-splitting');
          });
          await ctx.delay(480);

          S.groups = [
            { id: 'sg1', table: 'users', tnum: 1, range: '0x0000–0x2AAA', leaderNode: 1, term: 7, replicas: [1], maxRows: 3, data: dA.slice(0, 3) },
            { id: 'sg2', table: 'users', tnum: 2, range: '0x2AAB–0x54FF', leaderNode: 4, term: 7, replicas: [4], maxRows: 3, data: dA.slice(3)    },
            { id: 'sg3', table: 'users', tnum: 3, range: '0x5500–0x7FFF', leaderNode: 2, term: 7, replicas: [2], maxRows: 3, data: dB.slice(0, 3) },
            { id: 'sg4', table: 'users', tnum: 4, range: '0x8000–0xAAAA', leaderNode: 5, term: 7, replicas: [5], maxRows: 3, data: dB.slice(3)    },
            { id: 'sg5', table: 'users', tnum: 5, range: '0xAAAB–0xD4FF', leaderNode: 3, term: 7, replicas: [3], maxRows: 3, data: dC.slice(0, 3) },
            { id: 'sg6', table: 'users', tnum: 6, range: '0xD500–0xFFFF', leaderNode: 6, term: 7, replicas: [6], maxRows: 3, data: dC.slice(3)    }
          ];
          S.replicaState = buildRS(S.groups);
          for (const sg of S.groups) {
            const rs = S.replicaState[sg.id]?.[sg.leaderNode];
            if (rs) rs.newRows = sg.data.map((_, i) => i);
          }
          renderAllTablets(); renderConnections();
          const post6 = S.groups.map(sg => ({ id: sg.id, node: sg.leaderNode }));
          setTimeout(() => post6.forEach(({ id, node }) => {
            const rs = S.replicaState[id]?.[node]; if (rs) rs.newRows = [];
            reRenderTabletInternal(id, node);
          }), 2000);

          for (const g of S.groups) ctx.hlTablet(g.id, g.leaderNode, 't-new');
          addLog('Each shard split → 6 shards × 3 rows each · all 6 nodes active', 'ls');
          await ctx.delay(400);

          ctx.activateClient(true);
          for (let i = 0; i < 3; i++) {
            for (const g of S.groups) ctx.pktClientToTablet(g.id, g.leaderNode, 'pk-write', 550);
            await ctx.delay(700);
          }
          ctx.activateClient(false);

          renderShardingPerfPanel({
            nodes: 6, shards: 6, throughput: 60000, maxThroughput: 60000, latency: 11, maxLatency: 100,
            nodeLoads: [1,2,3,4,5,6].map(n => ({ node: n, pct: 15 })),
            cpuLoads:  [1,2,3,4,5,6].map(n => ({ node: n, pct: 14 })),
            insight: '✓ 6× throughput vs 1 node · 2× vs 3 nodes · latency unchanged at 11 ms · CPU 14% each — horizontal scaling works.'
          });
          addLog('6 nodes · 60,000 writes/sec · CPU 14% each · latency 11 ms ← unchanged from 3-node ✓', 'ls');
          addLog('Throughput doubled again. Latency did not increase. Resources balanced equally.', 'ls');
          document.getElementById('health-txt').textContent = 'Healthy · 6 TServers · 6 Shards · 6× Scale · Latency Flat';
        }
      },
      {
        label: '5. Real World — Many Tables, Many Shards',
        desc: 'In production each table is independently sharded across all nodes. YugabyteDB routes writes to the correct shard automatically. Every new node adds capacity for every table simultaneously.',
        action: async (ctx) => {
          S.compactMode = true;
          S.groups = [
            { id: 'rw1', table: 'users',      tnum: 1, range: '0x0000–0x3FFF', leaderNode: 1, term: 5, replicas: [1], data: [] },
            { id: 'rw2', table: 'users',      tnum: 2, range: '0x4000–0x7FFF', leaderNode: 2, term: 5, replicas: [2], data: [] },
            { id: 'rw3', table: 'users',      tnum: 3, range: '0x8000–0xBFFF', leaderNode: 3, term: 5, replicas: [3], data: [] },
            { id: 'rw4', table: 'users',      tnum: 4, range: '0xC000–0xFFFF', leaderNode: 4, term: 5, replicas: [4], data: [] },
            { id: 'rw5', table: 'categories', tnum: 1, range: '0x0000–0x7FFF', leaderNode: 5, term: 5, replicas: [5], data: [] },
            { id: 'rw6', table: 'categories', tnum: 2, range: '0x8000–0xFFFF', leaderNode: 6, term: 5, replicas: [6], data: [] },
            { id: 'rw7', table: 'products',   tnum: 1, range: '0x0000–0x7FFF', leaderNode: 1, term: 5, replicas: [1], data: [] },
            { id: 'rw8', table: 'products',   tnum: 2, range: '0x8000–0xFFFF', leaderNode: 2, term: 5, replicas: [2], data: [] },
            { id: 'rw9', table: 'orders',     tnum: 1, range: '0x0000–0x7FFF', leaderNode: 3, term: 5, replicas: [3], data: [] },
            { id: 'rwa', table: 'orders',     tnum: 2, range: '0x8000–0xFFFF', leaderNode: 4, term: 5, replicas: [4], data: [] },
            { id: 'rwb', table: 'customers',  tnum: 1, range: '0x0000–0x7FFF', leaderNode: 5, term: 5, replicas: [5], data: [] },
            { id: 'rwc', table: 'customers',  tnum: 2, range: '0x8000–0xFFFF', leaderNode: 6, term: 5, replicas: [6], data: [] }
          ];
          S.replicaState = buildRS(S.groups);
          renderAllTablets(); renderConnections();
          addLog('Production view: 5 tables × multiple shards distributed across 6 nodes', 'li');
          await ctx.delay(400);

          ctx.activateClient(true);
          for (let burst = 0; burst < 3; burst++) {
            S.groups.forEach(g => ctx.pktClientToTablet(g.id, g.leaderNode, 'pk-write', 500));
            await ctx.delay(600);
          }
          ctx.activateClient(false);

          renderShardingPerfPanel({
            nodes: 6, shards: 12, throughput: 60000, maxThroughput: 60000, latency: 11, maxLatency: 100,
            nodeLoads: [1,2,3,4,5,6].map(n => ({ node: n, pct: 14 })),
            cpuLoads:  [1,2,3,4,5,6].map(n => ({ node: n, pct: 13 })),
            insight: 'Every table sharded. Every node contributes equally. Latency stays flat regardless of cluster size.'
          });
          addLog('Every table sharded. Every write routed automatically. Every node contributes.', 'ls');
          document.getElementById('health-txt').textContent = 'Healthy · RF=3 · 6 TServers · Fully Balanced · Latency Flat';
        }
      }
    ]
  },

  "23": {
    group: "Foundations", icon: "🛡️", sortOrder: 3.6, haPanel: true,
    name: 'Replication = HA', title: 'Replication = HA', subtitle: 'Single node vs distributed — side by side',
    desc: 'Two systems run in parallel. RF=1 stores one copy. RF=3 stores three. When the same node failure hits both, one survives and one disappears.',
    guidedTour: [
      { text: "TS-1 is a <b>single-node system (RF=1)</b>. TS-2, TS-3, TS-4 form a <b>distributed cluster (RF=3)</b>. Both start with the same rows.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to hit both systems with a failure. Watch what the panel shows in real time.", element: "#btn-step" },
      { text: "The <b>side-by-side panel</b> shows the contrast — RF=1 goes down for good, RF=3 degrades then self-heals.", element: ".ha-panel" }
    ],
    latencies: [
      { lbl: 'Heartbeat Interval', cls: 'll', max: 500 },
      { lbl: 'Failure Detection', cls: 'lm', max: 500 },
      { lbl: 'Re-election (Raft)', cls: 'll', max: 50 },
      { lbl: 'Re-replication',     cls: 'lm', max: 200 }
    ],
    init: (ctx) => {
      ctx.setCanvasGeoMode(false);
      ctx.setCanvasRegionMode(false);
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, n <= 4);
      [1, 2, 3, 4].forEach(id => { S.nodes.find(n => n.id === id).alive = true; renderNodeAlive(id, true); });
      S.partitioned = [];
      const rf1Label = document.querySelector('#node-1 .n-name');
      if (rf1Label) rf1Label.textContent = 'Single Node';
      ['TServer-1', 'TServer-2', 'TServer-3'].forEach((name, i) => {
        const el = document.querySelector(`#node-${i + 2} .n-name`);
        if (el) el.textContent = name;
      });

      // Vertical divider between the RF=1 node and the RF=3 cluster
      const divider = document.createElement('div');
      divider.id = 'canvas-vs-divider';
      divider.className = 'canvas-vs-divider';
      const node1El = document.getElementById('node-1');
      if (node1El && node1El.nextSibling) node1El.parentNode.insertBefore(divider, node1El.nextSibling);

      const rows = [
        [1, 'Alice', 'NY',  87, 1713289000.1],
        [2, 'Bob',   'CHI', 92, 1713289000.2],
        [3, 'Carol', 'HOU', 78, 1713289000.3],
        [4, 'Diana', 'PHX', 95, 1713289000.4],
        [5, 'Eva',   'SEA', 83, 1713289000.5]
      ];
      S.groups = [
        { id: 'rf1', table: 'users', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 1, term: 4, replicas: [1],       maxRows: 6, hideStorage: true, simpleTable: true, data: rows.map(r => [...r]) },
        { id: 'rf3', table: 'users', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 2, term: 4, replicas: [2, 3, 4], maxRows: 6, data: rows.map(r => [...r]) }
      ];
      S.replicaState = buildRS(S.groups);
      renderAllTablets();
      setTimeout(renderConnections, 80);
      renderHaPanel({ systems: [
        { label: 'Single Node  RF=1', nodes: [{id:1,alive:true,name:'Single Node'}],          available: true,  detail: '1 copy · no replication' },
        { label: 'Distributed  RF=3', nodes: [{id:2,alive:true,name:'TS-1'},{id:3,alive:true,name:'TS-2'},{id:4,alive:true,name:'TS-3'}], available: true,  detail: '3 copies · Raft quorum' }
      ]});
    },
    steps: [
      {
        label: '1. RF=3 Replicates — RF=1 Doesn\'t',
        desc: 'A new row is written to both systems. On the RF=1 side: one write, one node, done. On the RF=3 side: the leader replicates to both followers before ACKing — all 3 nodes get the row.',
        action: async (ctx) => {
          ctx.activateClient(true);
          addLog('Writing row 6 (Frank) to both systems', 'li');
          const newRow = [6, 'Frank', 'BOS', 91, 1713289002.1];

          // RF=1: write → node 1, no replication
          ctx.pktClientToTablet('rf1', 1, 'pk-write', 500);
          await ctx.delay(350);
          S.groups.find(x => x.id === 'rf1').data.push([...newRow]);
          ctx.reRenderTablet('rf1', 1, true);
          addLog('RF=1: row appended to TS-1 — no replication follows', 'lw');

          // RF=3: write → node 2, Raft to 3 and 4
          ctx.pktClientToTablet('rf3', 2, 'pk-write', 500);
          await ctx.delay(200);
          S.groups.find(x => x.id === 'rf3').data.push([...newRow]);
          for (const n of [2, 3, 4]) ctx.reRenderTablet('rf3', n, true);
          const r1 = ctx.pktTabletToTablet('rf3', 2, 'rf3', 3, 'pk-raft', 400);
          const r2 = ctx.pktTabletToTablet('rf3', 2, 'rf3', 4, 'pk-raft', 450);
          await Promise.all([r1, r2]);
          const a1 = ctx.pktTabletToTablet('rf3', 3, 'rf3', 2, 'pk-ack', 350);
          const a2 = ctx.pktTabletToTablet('rf3', 4, 'rf3', 2, 'pk-ack', 350);
          await Promise.all([a1, a2]);
          addLog('RF=3: row replicated to TS-3 and TS-4 before ACK ✓', 'ls');
          ctx.activateClient(false);
          ctx.setLat(0, 200);

          renderHaPanel({ systems: [
            { label: 'Single Node  RF=1', nodes: [{id:1,alive:true,name:'Single Node'}],          available: true,  detail: '1 copy · TS-1 only' },
            { label: 'Distributed  RF=3', nodes: [{id:2,alive:true,name:'TS-1'},{id:3,alive:true,name:'TS-2'},{id:4,alive:true,name:'TS-3'}], available: true,  detail: '3 identical copies · quorum' }
          ]});
        }
      },
      {
        label: '2. Same Failure Hits Both Systems',
        desc: 'TS-1 (the entire RF=1 system) fails. TS-3 (one node in the RF=3 cluster) also fails at the same time. RF=1: total outage — data gone. RF=3: quorum still held on TS-2 and TS-4, writes keep serving.',
        action: async (ctx) => {
          addLog('FAILURE: TS-1 down (RF=1 system) + TS-3 down (RF=3 cluster)', 'le');

          // Kill TS-1 and TS-3 simultaneously
          S.nodes.find(n => n.id === 1).alive = false; renderNodeAlive(1, false);
          S.nodes.find(n => n.id === 3).alive = false; renderNodeAlive(3, false);
          // RF=1: data gone — clear rows to show the loss visually
          S.groups.find(x => x.id === 'rf1').data = [];
          renderAllTablets();
          ctx.setLat(1, 300);
          await ctx.delay(600);

          // RF=3: TS-2 still leads, TS-4 still has follower — quorum held, data intact
          addLog('RF=1 · TS-1: DEAD — data unreachable, system down ✗', 'le');
          addLog('RF=3 · TS-3: DEAD — but TS-2+TS-4 hold quorum ✓', 'ls');
          addLog('RF=3: all 6 rows still present on TS-2 (leader) and TS-4 (follower)', 'ls');
          await ctx.delay(200);
          ctx.safeFlash('rf3', 2, 3500);
          await ctx.delay(120);
          ctx.safeFlash('rf3', 4, 3500);
          ctx.setLat(2, 15);

          renderHaPanel({ systems: [
            { label: 'Single Node  RF=1', nodes: [{id:1,alive:false,name:'Single Node'}],                   available: false, detail: 'Data unreachable · system down' },
            { label: 'Distributed  RF=3', nodes: [{id:2,alive:true,name:'TS-1'},{id:3,alive:false,name:'TS-2'},{id:4,alive:true,name:'TS-3'}],  available: true,  degraded: true, detail: '2/3 alive · quorum held' }
          ]});
          document.getElementById('health-txt').textContent = '⚠️ RF=1: OUTAGE · RF=3: Degraded but serving';
        }
      },
      {
        label: '3. RF=3 Keeps Serving — RF=1 Is Gone',
        desc: 'Writes continue flowing to the RF=3 cluster. TS-2 leads, TS-4 replicates. Every write is acknowledged. The RF=1 system is dark — no writes, no reads, data lost until a DBA manually restores from backup.',
        action: async (ctx) => {
          ctx.activateClient(true);
          addLog('Sending writes — RF=3 accepts, RF=1 unreachable', 'li');
          const missedRows = [
            [7, 'George', 'DAL', 88, 1713289010.1],
            [8, 'Hannah', 'DEN', 76, 1713289010.2],
            [9, 'Ivan',   'MIA', 84, 1713289010.3],
          ];
          for (const newRow of missedRows) {
            ctx.pktClientToTablet('rf3', 2, 'pk-write', 500);
            await ctx.delay(200);
            S.groups.find(x => x.id === 'rf3').data.push([...newRow]);
            ctx.reRenderTablet('rf3', 2, true);                                   // both alive replicas at once
            ctx.reRenderTablet('rf3', 4, true);
            await ctx.pktTabletToTablet('rf3', 2, 'rf3', 4, 'pk-raft', 400);     // Raft flies
            await ctx.pktTabletToTablet('rf3', 4, 'rf3', 2, 'pk-ack', 350);      // ACK back
            await ctx.delay(150);
          }
          ctx.activateClient(false);
          addLog('RF=3: all writes succeed — 0 ms downtime ✓', 'ls');
          addLog('RF=1: all writes rejected — node dead, no failover possible', 'le');

          renderHaPanel({ systems: [
            { label: 'Single Node  RF=1', nodes: [{id:1,alive:false,name:'Single Node'}],                   available: false, detail: 'Writes rejected · restore from backup' },
            { label: 'Distributed  RF=3', nodes: [{id:2,alive:true,name:'TS-1'},{id:3,alive:false,name:'TS-2'},{id:4,alive:true,name:'TS-3'}],  available: true,  degraded: true, detail: 'Serving normally · 2/3 quorum' }
          ]});
        }
      },
      {
        label: '4. RF=3 Self-Heals — RF=1 Cannot',
        desc: 'TS-3 rejoins the RF=3 cluster, catches up via Raft, and RF=3 is fully restored. TS-1 (RF=1) remains down — there is no replica to recover from. Zero-touch recovery on one side; manual intervention required on the other.',
        action: async (ctx) => {
          // Node 3 comes back 3 rows behind — reveal rows one at a time during catch-up
          S.replicaState['rf3'][3].catchupOffset = 3;
          S.nodes.find(n => n.id === 3).alive = true;
          renderNodeAlive(3, true);
          renderAllTablets(); setTimeout(renderConnections, 50);
          ctx.hlTablet('rf3', 3, 't-syncing');
          addLog('TS-3: ONLINE — Raft catch-up starting (3 rows behind)', 'ls');
          ctx.setLat(3, 150);

          const catchupNames = ['George', 'Hannah', 'Ivan'];
          for (let i = 0; i < 3; i++) {
            S.replicaState['rf3'][3].catchupOffset = 2 - i;  // row appears first
            ctx.reRenderTablet('rf3', 3, true);
            await ctx.pktTabletToTablet('rf3', 2, 'rf3', 3, 'pk-raft', 400);   // Raft flies
            await ctx.pktTabletToTablet('rf3', 3, 'rf3', 2, 'pk-ack', 350);    // ACK back
            addLog(`TS-3: applied row ${catchupNames[i]} ✓`, 'ls');
            await ctx.delay(150);
          }
          addLog('TS-3 caught up — RF=3 fully restored ✓', 'ls');
          [2, 3, 4].forEach(n => ctx.hlTablet('rf3', n, 't-hl'));

          renderHaPanel({ systems: [
            { label: 'Single Node  RF=1', nodes: [{id:1,alive:false,name:'Single Node'}],                           available: false, detail: 'Still down · data lost · manual restore needed' },
            { label: 'Distributed  RF=3', nodes: [{id:2,alive:true,name:'TS-1'},{id:3,alive:true,name:'TS-2'},{id:4,alive:true,name:'TS-3'}],  available: true,  detail: '3 copies restored · fully healthy' }
          ]});
          document.getElementById('health-txt').textContent = 'RF=3: Healthy · RF=1: Outage · Zero-touch self-healing vs manual restore';
          addLog('RF=3: self-healed with zero operator intervention ✓', 'ls');
          addLog('RF=1: TS-1 still dead — DBA required to restore from backup', 'le');
        }
      }
    ]
  },

  "13": {
    group: "Scalability", icon: "📈", sortOrder: 1, compactTablets: true,
    name: 'Horizontal Scaling', title: 'Horizontal Scaling', subtitle: 'Add/remove nodes & rebalance',
    desc: 'Observe how YugabyteDB scales out from 3 to 6 nodes within the APAC region. As new nodes are added, YB-Master automatically rebalances both tablet leaders and followers to distribute data and load evenly across all available zones.',
    guidedTour: [
      { text: "YugabyteDB scales out by simply adding nodes. The <b>YB-Master</b> automatically detects them and starts rebalancing.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to add nodes one at a time and watch tablet leaders and replicas redistribute across zones.", element: "#btn-step" },
      { text: "After scaling, both <b>leaders and followers</b> are spread evenly — no node is overloaded. Scale-in (remove nodes) works the same way.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Leader Rebalance', cls: 'll', max: 50 }, { lbl: 'Data Copy (Replica)', cls: 'lm', max: 200 }],
    init: (ctx) => {
      ctx.setCanvasGeoMode(false);
      ctx.setCanvasRegionMode(true);
      // Set labels to Zones (Zones A, B, C correspond to columns 1, 2, 3)
      ctx.setNodeRegion(1, 'apac', 'Zone A'); ctx.setNodeRegion(4, 'apac', 'Zone A');
      ctx.setNodeRegion(2, 'apac', 'Zone B'); ctx.setNodeRegion(5, 'apac', 'Zone B');
      ctx.setNodeRegion(3, 'apac', 'Zone C'); ctx.setNodeRegion(6, 'apac', 'Zone C');

      // Initial 3 nodes: 1, 2, 3 (One per zone)
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, n <= 3);

      // 7 Tables/tablets, RF=3, initially on nodes 1,2,3
      const scalingGroups = [
        { id: 's1', table: 'users', tnum: 1, range: '0x0000–0x54FF', leaderNode: 1, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's6', table: 'users', tnum: 2, range: '0x5500–0xA9FF', leaderNode: 2, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's7', table: 'users', tnum: 3, range: '0xAA00–0xFFFF', leaderNode: 3, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's2', table: 'categories', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 1, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's3', table: 'products', tnum: 1, range: 'A–Z', leaderNode: 2, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's4', table: 'users_email_idx', tnum: 1, range: 'A–Z', leaderNode: 2, term: 4, replicas: [1, 2, 3], data: [] },
        { id: 's5', table: 'transactions', tnum: 1, range: 'System', leaderNode: 3, term: 4, replicas: [1, 2, 3], data: [] }
      ];
      S.groups = scalingGroups;
      S.replicaState = buildRS(S.groups);
      renderAllTablets(); setTimeout(renderConnections, 80);
    },
    steps: [
      {
        label: 'Add Node 4 (Zone A)',
        desc: 'Node 4 joins Zone A. YB-Master begins incrementally moving replicas to the new node to balance the load.',
        action: async (ctx) => {
          ctx.setNodeVisibility(4, true);
          addLog('Node 4 joined Zone A', 'ls');
          renderScalingStats();
          await ctx.delay(800);

          const moves = [
            { id: 's2', from: 1, to: 4, role: 'LEADER' },
            { id: 's4', from: 1, to: 4, role: 'FOLLOWER' },
            { id: 's6', from: 1, to: 4, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Rebalancing ${m.id}: Moving ${m.role} to Node 4`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 800);

            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;

            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            ctx.hlTablet(m.id, m.to, 't-new');
            await ctx.delay(600);
          }

          addLog('Node 4 balance complete ✓', 'ls');
          ctx.setLat(0, 15);
        }
      },
      {
        label: 'Add Node 5 (Zone B)',
        desc: 'Node 5 joins Zone B. Load rebalances within the zone by moving tablets from Node 2.',
        action: async (ctx) => {
          ctx.setNodeVisibility(5, true);
          addLog('Node 5 joined Zone B', 'ls');
          renderScalingStats();
          await ctx.delay(800);

          const moves = [
            { id: 's4', from: 2, to: 5, role: 'LEADER' },
            { id: 's2', from: 2, to: 5, role: 'FOLLOWER' },
            { id: 's7', from: 2, to: 5, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Rebalancing ${m.id}: Moving ${m.role} to Node 5`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 800);

            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;

            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            ctx.hlTablet(m.id, m.to, 't-new');
            await ctx.delay(600);
          }

          addLog('Node 5 balance complete ✓', 'ls');
          ctx.setLat(0, 12);
        }
      },
      {
        label: 'Add Node 6 (Zone C)',
        desc: 'Final node joined Zone C. Rebalancing tablets from Node 3 to Node 6.',
        action: async (ctx) => {
          ctx.setNodeVisibility(6, true);
          addLog('Node 6 joined Zone C', 'ls');
          renderScalingStats();
          await ctx.delay(800);

          const moves = [
            { id: 's5', from: 3, to: 6, role: 'LEADER' },
            { id: 's1', from: 3, to: 6, role: 'FOLLOWER' },
            { id: 's3', from: 3, to: 6, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Rebalancing ${m.id}: Moving ${m.role} to Node 6`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 800);

            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;

            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            ctx.hlTablet(m.id, m.to, 't-new');
            await ctx.delay(600);
          }

          addLog('Cluster fully balanced across 6 nodes ✓', 'ls');
          ctx.setLat(0, 8);
          document.getElementById('health-txt').textContent = 'Healthy · 6 TServers · Fully Balanced';
        }
      },
      {
        label: 'Scale In: Decommission Node 6',
        desc: 'Removing Node 6. Data and leadership incrementally move back to remaining nodes.',
        action: async (ctx) => {
          addLog('Scale-in: Removing Node 6...', 'lw');
          await ctx.delay(600);

          const moves = [
            { id: 's5', from: 6, to: 3, role: 'LEADER' },
            { id: 's1', from: 6, to: 3, role: 'FOLLOWER' },
            { id: 's3', from: 6, to: 3, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Decommission: Moving ${m.id} ${m.role} back to Node 3`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 600);
            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;
            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            await ctx.delay(400);
          }

          ctx.setNodeVisibility(6, false);
          renderScalingStats();
          addLog('Node 6 decommissioned ✓', 'ls');
        }
      },
      {
        label: 'Scale In: Decommission Node 5',
        desc: 'Node 5 removed. Tablets return to Node 2.',
        action: async (ctx) => {
          addLog('Scale-in: Removing Node 5...', 'lw');
          await ctx.delay(600);

          const moves = [
            { id: 's4', from: 5, to: 2, role: 'LEADER' },
            { id: 's2', from: 5, to: 2, role: 'FOLLOWER' },
            { id: 's7', from: 5, to: 2, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Decommission: Moving ${m.id} ${m.role} back to Node 2`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 600);
            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;
            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            await ctx.delay(400);
          }

          ctx.setNodeVisibility(5, false);
          renderScalingStats();
          addLog('Node 5 decommissioned ✓', 'ls');
        }
      },
      {
        label: 'Scale In: Decommission Node 4',
        desc: 'Final scale-in. Return to initial 3-node configuration.',
        action: async (ctx) => {
          addLog('Scale-in: Removing Node 4...', 'lw');
          await ctx.delay(600);

          const moves = [
            { id: 's2', from: 4, to: 1, role: 'LEADER' },
            { id: 's4', from: 4, to: 1, role: 'FOLLOWER' },
            { id: 's6', from: 4, to: 1, role: 'FOLLOWER' }
          ];

          for (const m of moves) {
            addLog(`Decommission: Moving ${m.id} ${m.role} back to Node 1`, 'li');
            await ctx.pktTabletToTablet(m.id, m.from, m.id, m.to, 'pk-raft', 600);
            const g = S.groups.find(x => x.id === m.id);
            g.replicas = g.replicas.map(r => r === m.from ? m.to : r);
            if (m.role === 'LEADER') g.leaderNode = m.to;
            ctx.rebuildReplicaState();
            renderAllTablets(); renderConnections();
            renderScalingStats();
            await ctx.delay(400);
          }

          ctx.setNodeVisibility(4, false);
          renderScalingStats();
          addLog('Cluster returned to steady 3-node state ✓', 'ls');
          document.getElementById('health-txt').textContent = 'Healthy · RF=3 · 3 TServers';
        }
      }
    ]
  },

  // 14: Tablet Split
  "14": {
    group: "Scalability", icon: "🔄", sortOrder: 2,
    name: 'Tablet Split', title: 'Tablet Split', subtitle: 'Auto-sharding growth',
    filterTable: 'users',
    desc: 'YugabyteDB automatically splits tablets when they exceed ~128MB. Child tablets appear right below the parent, then the parent is drained and garbage collected.',
    guidedTour: [
      { text: "When a tablet grows beyond ~64MB, YugabyteDB finds the <b>median split point</b> and spawns two child tablets directly below the parent.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to bulk-insert data, trigger the size threshold, and watch the split and new Raft group creation.", element: "#btn-step" },
      { text: "After the split, the parent tablet is garbage collected eventually. Each child starts <b>independent Raft replication</b>, spreading load across nodes.", element: ".n-body" },
      { text: "Watch the final <b>GC step</b>: the parent enters RETIRING state, the Raft group is dissolved, and storage is reclaimed.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Size Check', cls: 'll', max: 1 }, { lbl: 'Split Point', cls: 'll', max: 2 }, { lbl: 'New Group', cls: 'lm', max: 50 }],
    steps: [
      {
        label: 'Growth', desc: 'Bulk writes fill the tablet beyond the 64MB threshold. New rows land in tg1 as it approaches the split limit.',
        action: async (ctx) => {
          const tg1 = S.groups.find(g => g.id === 'tg1');
          const bulkRows = [
            [10, 'Jack Torres',  'Denver',  82, 1713289100.1],
            [13, 'Karen Liu',    'Atlanta', 79, 1713289100.4],
            [16, 'Leo Park',     'Seattle', 91, 1713289100.7],
          ];
          for (let i = 0; i < 3; i++) {
            await ctx.pktClientToTablet('tg1', 1, 'pk-write', 300);
            ctx.addMem('tg1', 1, 20);
            if (tg1) { tg1.data.push(bulkRows[i]); for (const n of [1, 2, 3]) ctx.reRenderTablet('tg1', n, true); }
          }
        }
      },
      {
        label: 'Analyze Range', desc: 'TServer identifies the median split point for the hash range.', action: async (ctx) => {
          ctx.setLat(0, 0.8); ctx.setLat(1, 1.2);
          showSplitPanel(true);
          renderSplitInfo('0x0000–0x54FF', '0x2A87');
          addLog('Split threshold reached. Identifying median hash...', 'li');
        }
      },
      {
        label: 'Spawn Children', desc: 'Two new child tablets (tg1a, tg1b) are created directly below the parent, each inheriting half of the parent\'s rows. For a brief moment, parent and children coexist.', action: async (ctx) => {
          addLog('Spawning child tablets: tg1a and tg1b', 'ls');
          // Split tg1's real rows at the median — lower half to tg1a, upper half to tg1b
          const tg1 = S.groups.find(g => g.id === 'tg1');
          const allData = tg1 ? [...tg1.data] : [];
          const mid = Math.ceil(allData.length / 2);
          const g1a = { id: 'tg1a', table: 'users', tnum: '1a', range: '0x0000–0x2A87', leaderNode: 1, term: 5, replicas: [1, 2, 3], data: allData.slice(0, mid) };
          const g1b = { id: 'tg1b', table: 'users', tnum: '1b', range: '0x2A88–0x54FF', leaderNode: 1, term: 5, replicas: [1, 2, 3], data: allData.slice(mid) };
          // Insert children immediately after tg1, not at the end
          const tg1Idx = S.groups.findIndex(g => g.id === 'tg1');
          S.groups.splice(tg1Idx + 1, 0, g1a, g1b);
          S.replicaState['tg1a'] = {}; S.replicaState['tg1b'] = {};
          for (let n of [1, 2, 3]) {
            S.replicaState['tg1a'][n] = { mem: 10, ss: 15, ssts: [15], newRows: [], readRow: undefined };
            S.replicaState['tg1b'][n] = { mem: 10, ss: 15, ssts: [15], newRows: [], readRow: undefined };
          }
          renderAllTablets(); renderConnections();
          // Highlight children as newly born
          for (const id of ['tg1a', 'tg1b']) {
            for (const n of [1, 2, 3]) {
              const el = document.getElementById(`tablet-${id}-${n}`);
              if (el) el.classList.add('t-new');
            }
          }
          ctx.setLat(2, 42);
          addLog('Child tablets online. Transitioning traffic...', 'li');
        }
      },
      {
        label: 'GC Parent Tablet', desc: 'Traffic fully moved to children. Parent tablet (tg1) enters RETIRING state — WAL entries are drained, Raft group is dissolved, and storage is reclaimed by the garbage collector.', action: async (ctx) => {
          addLog('tg1: all writes redirected to tg1a & tg1b — entering retire state', 'lw');
          // Mark tg1 as retiring on all replicas
          for (const nId of [1, 2, 3]) {
            const el = document.getElementById(`tablet-tg1-${nId}`);
            if (!el) continue;
            el.classList.add('t-retiring');
            const ov = document.createElement('div');
            ov.className = 'gc-overlay';
            ov.textContent = 'RETIRING';
            el.appendChild(ov);
          }
          await ctx.delay(700);
          addLog('tg1: WAL drained · Raft group dissolved · GC reclaiming storage...', 'lw');
          // Animate collapse
          for (const nId of [1, 2, 3]) {
            const el = document.getElementById(`tablet-tg1-${nId}`);
            if (el) el.classList.add('t-gc-out');
          }
          await ctx.delay(500);
          // Remove parent from state
          S.groups = S.groups.filter(g => g.id !== 'tg1');
          renderAllTablets(); renderConnections();
          showSplitPanel(false);
          addLog('GC complete: tg1 parent reclaimed ✓  storage freed', 'ls');
          addLog('Split complete: tg1a [0x0000–0x2A87]  tg1b [0x2A88–0x54FF] active ✓', 'ls');
        }
      }
    ]
  },

  // 15: LSM Compaction
  "15": {
    group: "System Internals", icon: "🗜️", sortOrder: 2,
    name: 'LSM Compaction', title: 'LSM Compaction', subtitle: 'DocDB storage engine',
    desc: 'DocDB (RocksDB LSM-tree): writes → MemTable → L0 SSTable flush → L0→L1 compaction → lower read amplification.',
    guidedTour: [
      { text: "Writes land in an in-memory <b>MemTable</b>. When full, it flushes as an immutable <b>L0 SSTable</b> file on disk.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> through multiple flushes, then watch a <b>compaction</b> merge L0 files into a single, sorted L1 SSTable.", element: "#btn-step" },
      { text: "Compaction reduces <b>read amplification</b> (fewer files to check per read) at the cost of background write amplification.", element: ".lat-row" }
    ],
    latencies: [{ lbl: 'L0 Flush', cls: 'lm', max: 50 }, { lbl: 'Compaction', cls: 'lm', max: 200 }, { lbl: 'Final Read', cls: 'll', max: 2 }],
    steps: [
      {
        label: 'Writes & Flush #1', desc: 'Incoming writes fill MemTable (TS-1). When full, it flushes as an immutable L0 SSTable.', action: async (ctx) => {
          for (let n of [1, 2, 3]) {
            const rs = S.replicaState['tg1'][n];
            rs.mem = 90; reRenderTabletInternal('tg1', n);
            await ctx.delay(400);
            rs.mem = 5; rs.ssts.push(25); rs.ss = rs.ssts.reduce((a, b) => a + b, 0);
            reRenderTabletInternal('tg1', n);
          }
          ctx.setLat(0, 32); addLog('L0 Flush complete: SST segment #1 created', 'ls');
        }
      },
      {
        label: 'Writes & Flush #2', desc: 'Another burst of writes creates a second L0 file. Multiple L0 files increase read amplification.', action: async (ctx) => {
          for (let n of [1, 2, 3]) {
            const rs = S.replicaState['tg1'][n];
            rs.mem = 85; reRenderTabletInternal('tg1', n);
            await ctx.delay(400);
            rs.mem = 5; rs.ssts.push(30); rs.ss = rs.ssts.reduce((a, b) => a + b, 0);
            reRenderTabletInternal('tg1', n);
          }
          ctx.setLat(0, 41); addLog('L0 Flush complete: SST segment #2 created', 'ls');
        }
      },
      {
        label: 'Compaction (Merge)', desc: 'DocDB triggers compaction to merge small L0 files into a larger L1 file, removing duplicates/deleted keys.', action: async (ctx) => {
          for (let n of [1, 2, 3]) { S.replicaState['tg1'][n].compacting = true; reRenderTabletInternal('tg1', n); }
          addLog('Compaction started: Merging SST segments...', 'li');
          await ctx.delay(1200);
          for (let n of [1, 2, 3]) {
            const rs = S.replicaState['tg1'][n]; rs.compacting = false;
            const total = rs.ssts.reduce((a, b) => a + b, 0);
            rs.ssts = [Math.min(95, total * 0.85)]; // Compressed merge
            rs.ss = rs.ssts[0];
            reRenderTabletInternal('tg1', n);
          }
          ctx.setLat(1, 185); addLog('Compaction complete: Segments merged into optimized L1 SST', 'ls');
        }
      },
      {
        label: 'Fast Read', desc: 'With fewer SST files to check, the read request completes much faster.', action: async (ctx) => {
          await ctx.pktClientToTablet('tg1', 1, 'pk-read', 400);
          ctx.setLat(2, 0.8);
          await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400);
          addLog('Read complete: 0.8ms (optimized by compaction)', 'ls');
        }
      }
    ]
  },

  "16": {
    group: "Data Distribution", icon: "📦", sortOrder: 4,
    name: 'Colocated Tables', title: 'Colocated Tables', subtitle: 'Shared tablet groups',
    filterTable: 'colocated',
    desc: 'Colocation allows multiple small tables to share the same underlying tablet group. These shared tablets are range-sharded by default, using the entire row key (including Colocation ID) to maintain global order. This significantly reduces metadata overhead and per-table Raft costs for reference or master tables.',
    guidedTour: [
      { text: "Colocation lets multiple small tables share <b>one tablet group</b>, eliminating per-table Raft overhead and YB-Master metadata.", element: ".canvas-wrap" },
      { text: "Click <b>Insert (Product)</b> or <b>Insert (Category)</b> — both rows land in the same physical tablet, prefixed by a Colocation ID.", element: "#btn-ins-c1" },
      { text: "Ideal for small <b>reference or lookup tables</b> that would otherwise create tablet sprawl and inflate Master memory.", element: ".n-body" }
    ],
    latencies: [{ lbl: 'Key Lookup', cls: 'll', max: 1 }, { lbl: 'Shared Tablet', cls: 'll', max: 5 }, { lbl: 'Write RPC', cls: 'lm', max: 40 }],
    extraBtns: [
      { id: 'btn-ins-c1', label: '➕ Insert (Product)', cls: 'btn-p', cb: 'insertColocatedA' },
      { id: 'btn-ins-c2', label: '➕ Insert (Category)', cls: 'btn-g', cb: 'insertColocatedB' }
    ],
    init: (ctx) => {
      S.groups = [
        {
          id: 'tg-col', table: 'colocated', isColocated: true, tnum: 1, range: 'MIN — MAX',
          leaderNode: 1, term: 4, replicas: [1, 2, 3],
          data: [
            [1, 'Electronics', 'Gadgets', '', 1.1, 'categories'],
            [101, 'Product A', '$10', '', 1.2, 'products'],
            [102, 'Product B', '$20', '', 1.3, 'products']
          ]
        }
      ];
      S.replicaState = buildRS(S.groups);
      ctx.setDDL('CREATE DATABASE my_app WITH colocation = true;\n\nCREATE TABLE products (...) COLOCATED = true;\nCREATE TABLE categories (...) COLOCATED = true;');
      renderAllTablets();
      setTimeout(() => {
        showDataPanel(true);
        renderDataTable('colocated');
      }, 100);
    },
    steps: [
      {
        label: 'Shared Storage (Range Sharded)',
        desc: 'Colocated tables share a single Raft group. Unlike standard tables that might use hash sharding, colocated tables are range-sharded by default, keeping data sorted by the entire row key.',
        action: async (ctx) => {
          ctx.hlTablet('tg-col', 1, 't-hl');
          addLog('Shared tablet tg-col is range-sharded based on the entire row key', 'li');
        }
      },
      {
        label: 'Write Path',
        desc: 'A write to either table flows to the same leader. The Colocation ID in the key ensures data is correctly namespaced and ordered within the shared tablet.',
        action: async (ctx) => {
          addLog('Writing to "categories" via shared leader (Node 1)', 'li');
          await ctx.pktClientToTablet('tg-col', 1, 'pk-write', 500);
          const p1 = ctx.pktTabletToTablet('tg-col', 1, 'tg-col', 2, 'pk-raft', 400);
          const p2 = ctx.pktTabletToTablet('tg-col', 1, 'tg-col', 3, 'pk-raft', 400);
          await Promise.all([p1, p2]);
          S.groups[0].data.push([3, 'Home', 'Home decor', '', performance.now() / 1000, 'categories']);
          // Sort data as it is range sharded
          S.groups[0].data.sort((a, b) => a[0] - b[0]);
          renderAllTablets();
          renderDataTable('colocated');
          await ctx.pktTabletToClient('tg-col', 1, 'pk-ack', 400);
          addLog('Write committed to shared WAL ✓', 'ls');
        }
      },
      {
        label: 'Add Customers Table',
        desc: 'We can add more tables to the same colocated database. They will automatically share the existing tablet group and its range-sharded storage.',
        action: async (ctx) => {
          addLog('DDL: CREATE TABLE customers (...) COLOCATED = true;', 'li');
          ctx.setDDL('CREATE DATABASE my_app WITH colocation = true;\n\nCREATE TABLE products (...) COLOCATED = true;\nCREATE TABLE categories (...) COLOCATED = true;\nCREATE TABLE customers (...) COLOCATED = true;');

          const eb = document.getElementById('extra-btns');
          if (!document.getElementById('btn-ins-c3')) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-o'; btn.id = 'btn-ins-c3';
            btn.innerHTML = '➕ Insert (Customer)';
            btn.onclick = () => window.insertColocatedC();
            eb.appendChild(btn);
          }
          addLog('Table "customers" added to shared group tg-col ✓', 'ls');
          await ctx.delay(500);
        }
      },
      {
        label: 'Insert Customer Data',
        desc: 'New data for the "customers" table is inserted into the same shared tablet group.',
        action: async (ctx) => {
          addLog('Writing to "customers" via shared leader (Node 1)', 'li');
          await ctx.pktClientToTablet('tg-col', 1, 'pk-write', 500);
          const p1 = ctx.pktTabletToTablet('tg-col', 1, 'tg-col', 2, 'pk-raft', 400);
          const p2 = ctx.pktTabletToTablet('tg-col', 1, 'tg-col', 3, 'pk-raft', 400);
          await Promise.all([p1, p2]);
          S.groups[0].data.push([501, 'John Doe', 'john@example.com', '', performance.now() / 1000, 'customers']);
          renderAllTablets();
          renderDataTable('colocated');
          await ctx.pktTabletToClient('tg-col', 1, 'pk-ack', 400);
          addLog('Customer data stored in shared tablet group ✓', 'ls');
        }
      }
    ]
  },

  "17": {
    group: "xCluster", icon: "🔁", sortOrder: 1,
    name: 'xCluster DR', title: 'xCluster DR', subtitle: 'Turnkey async replication',
    desc: 'Turnkey xCluster Disaster Recovery replicates changes from a PRIMARY cluster (ap-south-1) to a SECONDARY cluster (ap-south-2) asynchronously via CDCSDK pollers. Writes commit via Raft on PRIMARY (~2ms), then stream near-realtime (~45ms) to SECONDARY. A single n:m poller bridges multiple source tablets to multiple target tablets simultaneously.',
    guidedTour: [
      { text: "xCluster DR streams committed writes from the <b>PRIMARY</b> cluster to a standby <b>SECONDARY</b> via async CDC polling.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to commit a write on PRIMARY via Raft (~2ms), then watch the CDC poller pick it up and apply it to SECONDARY.", element: "#btn-step" },
      { text: "Watch the <b>Repl Lag</b> bar — xCluster is asynchronous, so the secondary always trails slightly behind the primary.", element: ".lat-row" }
    ],
    latencies: [
      { lbl: 'Raft commit', cls: 'll', max: 2 },
      { lbl: 'CDC poll', cls: 'lm', max: 10 },
      { lbl: 'WAN + apply', cls: 'lh', max: 55 },
      { lbl: 'Repl lag', cls: 'lh', max: 60 },
    ],
    init: (ctx) => {
      S.groups = [
        {
          id: 'xpu', table: 'users', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 1, term: 4, replicas: [1, 2, 3], showReg: true,
          data: [[1, 'Alice Chen', 'S1', 87, 1713289000.100], [4, 'David Park', 'S1', 95, 1713289000.400]]
        },
        {
          id: 'xpo', table: 'orders', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 2, term: 4, replicas: [1, 2, 3],
          data: [[101, 1, 'item-A', 'DONE', 1713289000.500], [102, 4, 'item-B', 'DONE', 1713289000.600]]
        },
        {
          id: 'xsu', table: 'users', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 4, term: 4, replicas: [4, 5, 6], showReg: true,
          data: [[1, 'Alice Chen', 'S1', 87, 1713289000.100, 'ext'], [4, 'David Park', 'S1', 95, 1713289000.400, 'ext']]
        },
        {
          id: 'xso', table: 'orders', tnum: 1, range: '0x0000–0xFFFF', leaderNode: 5, term: 4, replicas: [4, 5, 6],
          data: [[101, 1, 'item-A', 'DONE', 1713289000.500, 'ext'], [102, 4, 'item-B', 'DONE', 1713289000.600, 'ext']]
        }
      ];
      ctx.rebuildReplicaState();
      ctx.setXClusterMode(true);
      [4, 5, 6].forEach(n => ctx.setNodeVisibility(n, true));
      [1, 2, 3].forEach((n, i) => {
        const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-1${'abc'[i]}`;
        const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-1';
      });
      [4, 5, 6].forEach((n, i) => {
        const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-2${'abc'[i]}`;
        const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-2';
      });
      const p3el = document.getElementById('xc-p3'); if (p3el) p3el.style.display = 'none';
      const hdr17 = document.getElementById('xc-pollers-hdr');
      if (hdr17) hdr17.textContent = 'Pollers · ap-south-2 (SECONDARY)';
      const p1l17 = document.querySelector('#xc-p1 .xc-poller-lbl'); if (p1l17) p1l17.textContent = 'users leader';
      const p2l17 = document.querySelector('#xc-p2 .xc-poller-lbl'); if (p2l17) p2l17.textContent = 'orders leader';
      ctx.setLag('\u2014'); ctx.setRPO('\u2014', false);
      renderAllTablets();
    },
    steps: [
      {
        label: 'Cluster Layout',
        desc: 'PRIMARY (ap-south-1) holds a users tablet (leader N1) and an orders tablet (leader N2). SECONDARY (ap-south-2) mirrors both. P-1 is dedicated to the users source tablet leader; P-2 is dedicated to the orders source tablet leader — 1 poller per source tablet leader.',
        action: async (ctx) => {
          addLog('PRIMARY: ap-south-1 (N1–N3) — users on N1, orders on N2', 'li');
          addLog('SECONDARY: ap-south-2 (N4–N6) — mirrors users + orders', 'li');
          addLog('P-1 → users tablet leader (N1) | P-2 → orders tablet leader (N2)', 'li');
          addLog('Rule: 1 CDCSDK poller per source tablet leader', '');
          for (const id of ['xpu', 'xpo']) {
            const g = S.groups.find(g => g.id === id); if (g) ctx.hlTablet(id, g.leaderNode, 't-hl');
          }
          await ctx.delay(500);
          for (const id of ['xsu', 'xso']) {
            const g = S.groups.find(g => g.id === id); if (g) ctx.hlTablet(id, g.leaderNode, 't-hl2');
          }
        }
      },
      {
        label: 'Write to PRIMARY (users)',
        desc: 'Client inserts a new user row (id=10, Jack Russo) into the users tablet on PRIMARY. The leader N1 replicates via Raft to N2 and N3 (~2ms), achieves quorum, and ACKs the client. The write is now durably in the users WAL stream on PRIMARY.',
        action: async (ctx) => {
          ctx.hlLatRow(0);
          ctx.activateClient(true);
          const hlcU = 1713289100.100;
          addLog('INSERT INTO users VALUES (10, "Jack Russo", "S1", 89)', 'li');
          addLog('hash(10) → xpu leader N1, HLC=' + hlcU.toFixed(3), '');
          await ctx.pktClientToTablet('xpu', 1, 'pk-write', 300);
          ctx.hlTablet('xpu', 1, 't-hl');
          addLog('Raft: N1 → N2, N3 (≈2ms)', '');
          await Promise.all([
            ctx.pktTabletToTablet('xpu', 1, 'xpu', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('xpu', 1, 'xpu', 3, 'pk-raft', 300)
          ]);
          S.groups.find(g => g.id === 'xpu').data.push([10, 'Jack Russo', 'S1', 89, hlcU]);
          for (const n of [1, 2, 3]) { ctx.hlTablet('xpu', n, 't-hl'); ctx.reRenderTablet('xpu', n, true); }
          addLog('users id=10 committed, HLC=' + hlcU.toFixed(3) + ' in WAL ✓', 'ls');
          setLatency(0, 2);
          await ctx.pktTabletToClient('xpu', 1, 'pk-ack', 250);
          ctx.activateClient(false);
          ctx.setLag('~45ms');
        }
      },
      {
        label: '1:1 Replication (P-1)',
        desc: 'P-1 polls the users tablet leader (N1) and streams the WAL batch to xsu (N4) on SECONDARY. This is a 1:1 stream: one source tablet → one dedicated poller → one target tablet. The SECONDARY then Raft-replicates within its cluster for durability.',
        action: async (ctx) => {
          ctx.hlLatRow(1);
          addLog('P-1 polls xpu (N1): finds {id=10 Jack} in WAL', 'li');
          addLog('P-1 streams batch → xsu (N4) on SECONDARY (~45ms)', '');
          await ctx.pktXCluster(1, 'xpu', 1, 'xsu', 4, 1000);
          setLatency(1, 5);
          setLatency(2, 45);
          const hlcU = S.groups.find(g => g.id === 'xpu').data.find(r => r[0] === 10)?.[4] ?? 1713289100.100;
          S.groups.find(g => g.id === 'xsu').data.push([10, 'Jack Russo', 'S1', 89, hlcU, 'ext']);
          for (const n of [4, 5, 6]) { ctx.hlTablet('xsu', n, 't-hl2'); ctx.reRenderTablet('xsu', n, true); }
          addLog('xsu: id=10 applied (EXT, REG=S1, HLC=' + hlcU.toFixed(3) + ') ✓', 'ls');
          addLog('SECONDARY Raft: N4 → N5, N6 (≈2ms)', '');
          await Promise.all([
            ctx.pktTabletToTablet('xsu', 4, 'xsu', 5, 'pk-raft', 280),
            ctx.pktTabletToTablet('xsu', 4, 'xsu', 6, 'pk-raft', 280)
          ]);
          setLatency(3, 47);
          addLog('1:1 stream complete — 1 poller, 1 source tablet, 1 target tablet ✓', 'ls');
          ctx.setLag('~5ms');
        }
      },
      {
        label: 'Write to PRIMARY (users + orders)',
        desc: 'Client writes two new rows simultaneously: a second user (id=11, Eva) and a new order (id=103). Each routes to its tablet leader and commits via Raft. Both WAL streams now have pending entries waiting for their respective pollers.',
        action: async (ctx) => {
          ctx.hlLatRow(0);
          ctx.activateClient(true);
          const hlcU2 = 1713289100.300, hlcO = 1713289100.400;
          addLog('INSERT INTO users VALUES (11, "Eva Reyes", "S1", 82)', 'li');
          addLog('INSERT INTO orders VALUES (103, 10, "item-C", "PEND")', 'li');
          await Promise.all([
            (async () => {
              await ctx.pktClientToTablet('xpu', 1, 'pk-write', 280);
              ctx.hlTablet('xpu', 1, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xpu', 1, 'xpu', 2, 'pk-raft', 280),
                ctx.pktTabletToTablet('xpu', 1, 'xpu', 3, 'pk-raft', 280)
              ]);
              S.groups.find(g => g.id === 'xpu').data.push([11, 'Eva Reyes', 'S1', 82, hlcU2]);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xpu', n, 't-hl'); ctx.reRenderTablet('xpu', n, true); }
              addLog('users id=11 committed, HLC=' + hlcU2.toFixed(3) + ' ✓', 'ls');
            })(),
            (async () => {
              await ctx.pktClientToTablet('xpo', 2, 'pk-write', 280);
              ctx.hlTablet('xpo', 2, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xpo', 2, 'xpo', 1, 'pk-raft', 280),
                ctx.pktTabletToTablet('xpo', 2, 'xpo', 3, 'pk-raft', 280)
              ]);
              S.groups.find(g => g.id === 'xpo').data.push([103, 10, 'item-C', 'PEND', hlcO]);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xpo', n, 't-hl'); ctx.reRenderTablet('xpo', n, true); }
              addLog('orders id=103 committed, HLC=' + hlcO.toFixed(3) + ' ✓', 'ls');
            })()
          ]);
          setLatency(0, 2);
          await ctx.pktTabletToClient('xpu', 1, 'pk-ack', 200);
          ctx.activateClient(false);
          ctx.setLag('~45ms');
        }
      },
      {
        label: 'Parallel Streams (P-1 ∥ P-2)',
        desc: 'P-1 and P-2 fire simultaneously and independently: P-1 polls the users leader (N1) and delivers id=11 to xsu; P-2 polls the orders leader (N2) and delivers id=103 to xso. Both SECONDARY tablets then Raft-replicate in parallel. This is the n:m pattern: multiple source tablets, multiple pollers, multiple targets, all in one round.',
        action: async (ctx) => {
          ctx.hlLatRow(1);
          addLog('P-1 ∥ P-2: both pollers fire simultaneously', 'li');
          addLog('P-1: xpu (N1) → xsu (N4) | P-2: xpo (N2) → xso (N5)', '');
          await Promise.all([
            ctx.pktXCluster(1, 'xpu', 1, 'xsu', 4, 1000),
            ctx.pktXCluster(2, 'xpo', 2, 'xso', 5, 1000)
          ]);
          setLatency(1, 5); setLatency(2, 45);
          const hlcU2 = S.groups.find(g => g.id === 'xpu').data.find(r => r[0] === 11)?.[4] ?? 1713289100.300;
          const hlcO = S.groups.find(g => g.id === 'xpo').data.find(r => r[0] === 103)?.[4] ?? 1713289100.400;
          S.groups.find(g => g.id === 'xsu').data.push([11, 'Eva Reyes', 'S1', 82, hlcU2, 'ext']);
          S.groups.find(g => g.id === 'xso').data.push([103, 10, 'item-C', 'PEND', hlcO, 'ext']);
          for (const n of [4, 5, 6]) { ctx.hlTablet('xsu', n, 't-hl2'); ctx.reRenderTablet('xsu', n, true); }
          for (const n of [4, 5, 6]) { ctx.hlTablet('xso', n, 't-hl2'); ctx.reRenderTablet('xso', n, true); }
          addLog('SECONDARY Raft: xsu N4→N5,N6 | xso N5→N4,N6 simultaneously', '');
          await Promise.all([
            ctx.pktTabletToTablet('xsu', 4, 'xsu', 5, 'pk-raft', 260),
            ctx.pktTabletToTablet('xsu', 4, 'xsu', 6, 'pk-raft', 260),
            ctx.pktTabletToTablet('xso', 5, 'xso', 4, 'pk-raft', 260),
            ctx.pktTabletToTablet('xso', 5, 'xso', 6, 'pk-raft', 260)
          ]);
          setLatency(3, 52);
          addLog('Both tablets replicated to SECONDARY RF=3 ✓', 'ls');
          ctx.setRPO('<1s', false);
          ctx.setLag('~5ms');
        }
      },
      {
        label: 'Primary Failure → RPO',
        desc: 'PRIMARY cluster becomes unavailable. WAL entries logged but not yet polled by P-1 define the RPO window. The last polled change sequence number (LSN) on SECONDARY marks the recovery point.',
        action: async (ctx) => {
          ctx.hlLatRow(null);
          addLog('⚠ PRIMARY cluster unreachable (ap-south-1 failure)', 'le');
          for (const n of [1, 2, 3]) ctx.killNode(n);
          await ctx.delay(600);
          ctx.setLag('—');
          ctx.setRPO('~45ms window', true);
          addLog('RPO ≈ CDC lag at failure — up to ~45ms of uncommitted changes', 'lw');
          addLog('Last polled LSN on SECONDARY marks the safe recovery point', '');
        }
      },
      {
        label: 'Failover to SECONDARY',
        desc: 'Administrator promotes the SECONDARY cluster to PRIMARY. It now accepts writes for both users and orders tablets. RTO ≈35s (detect 5s + promote 20s + redirect 10s). Old primary rejoins as new secondary after recovery.',
        action: async (ctx) => {
          addLog('Initiating failover: SECONDARY promoted to PRIMARY', 'li');
          const badge = document.getElementById('xc-secondary-badge');
          if (badge) { badge.textContent = 'PRIMARY'; badge.className = 'xc-badge primary'; }
          await ctx.delay(600);
          for (const id of ['xsu', 'xso']) {
            const g = S.groups.find(x => x.id === id);
            if (g) ctx.hlTablet(id, g.leaderNode, 't-hl');
          }
          ctx.setRPO('Failover complete', false);
          addLog('ap-south-2 now serving as PRIMARY — users + orders ✓', 'ls');
          addLog('RTO ≈35s (detect 5s + promote 20s + redirect 10s)', '');
          addLog('Old primary will rejoin as SECONDARY after recovery', '');
        }
      }
    ]
  },

  "18": {
    group: "xCluster", icon: "⚡", sortOrder: 2,
    name: 'Active-Active xCluster', title: 'Active-Active xCluster', subtitle: 'Bidirectional xCluster',
    desc: 'Bidirectional xCluster: both clusters act as PRIMARY and accept local writes simultaneously. P-1 (forward) and P-2 (reverse) stream changes in both directions. The REG column in every tablet shows the origin cluster of each row. Conflicts on the same key are resolved via Last-Writer-Wins (LWW) using Hybrid Logical Clocks (HLC).',
    guidedTour: [
      { text: "Both clusters accept writes simultaneously. Two CDC pollers stream changes in <b>both directions</b> in near real time.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to write to each cluster and watch the replication flow bidirectionally between PRIMARY and SECONDARY.", element: "#btn-step" },
      { text: "If the same key is written on both sides, the conflict is resolved via <b>Last-Writer-Wins (LWW)</b> using Hybrid Logical Clocks.", element: ".lat-row" }
    ],
    latencies: [
      { lbl: 'Raft commit', cls: 'll', max: 2 },
      { lbl: 'Repl lag', cls: 'lh', max: 65 },
      { lbl: 'LWW resolve', cls: 'll', max: 1 },
      { lbl: 'Txn gap', cls: 'lh', max: 30 }
    ],
    init: (ctx) => {
      S.groups = [
        {
          id: 'xp1', table: 'users', tnum: 1, range: '0x0000-0x7FFF', leaderNode: 1, term: 4, replicas: [1, 2, 3], showReg: true,
          data: [[1, 'Alice', 'S1', 87, 1713289000.100], [4, 'David', 'S1', 95, 1713289000.400]]
        },
        {
          id: 'xp2', table: 'users', tnum: 2, range: '0x8000-0xFFFF', leaderNode: 2, term: 4, replicas: [1, 2, 3], showReg: true,
          data: [[2, 'Bob', 'S1', 92, 1713289000.200], [3, 'Carol', 'S1', 78, 1713289000.300]]
        },
        {
          id: 'xs1', table: 'users', tnum: 1, range: '0x0000-0x7FFF', leaderNode: 4, term: 4, replicas: [4, 5, 6], showReg: true,
          data: [[1, 'Alice', 'S1', 87, 1713289000.100, 'ext'], [4, 'David', 'S1', 95, 1713289000.400, 'ext']]
        },
        {
          id: 'xs2', table: 'users', tnum: 2, range: '0x8000-0xFFFF', leaderNode: 5, term: 4, replicas: [4, 5, 6], showReg: true,
          data: [[2, 'Bob', 'S1', 92, 1713289000.200, 'ext'], [3, 'Carol', 'S1', 78, 1713289000.300, 'ext']]
        }
      ];
      ctx.rebuildReplicaState();
      ctx.setXClusterMode(true);
      [4, 5, 6].forEach(n => ctx.setNodeVisibility(n, true));
      [1, 2, 3].forEach((n, i) => {
        const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-1${'abc'[i]}`;
        const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-1';
      });
      [4, 5, 6].forEach((n, i) => {
        const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-2${'abc'[i]}`;
        const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-2';
      });
      const badge = document.getElementById('xc-secondary-badge');
      if (badge) { badge.textContent = 'PRIMARY'; badge.className = 'xc-badge primary'; }
      const p3aa = document.getElementById('xc-p3'); if (p3aa) p3aa.style.display = 'none';
      const hdr18 = document.getElementById('xc-pollers-hdr');
      if (hdr18) hdr18.textContent = 'Pollers · ap-south-1 ⇄ ap-south-2';
      const p1l18 = document.querySelector('#xc-p1 .xc-poller-lbl'); if (p1l18) p1l18.textContent = 'S1 → S2';
      const p2l18 = document.querySelector('#xc-p2 .xc-poller-lbl'); if (p2l18) p2l18.textContent = 'S2 → S1';
      ctx.setLag('—'); ctx.setRPO('—', false);
      renderAllTablets();
    },
    steps: [
      {
        label: 'Active-Active Setup',
        desc: 'Both clusters are PRIMARY and accept local writes. P-1 replicates forward (S1→S2), P-2 replicates in reverse (S2→S1). The REG column in each tablet shows which cluster originated the row. EXT badge marks rows that arrived via replication.',
        action: async (ctx) => {
          addLog('ap-south-1 (S1): PRIMARY — REG=S1 for local writes', 'li');
          addLog('ap-south-2 (S2): PRIMARY — REG=S2 for local writes', 'li');
          addLog('P-1: forward poller S1→S2 | P-2: reverse poller S2→S1', 'li');
          addLog('REG column tracks origin cluster per row in every tablet', '');
          for (const id of ['xp1', 'xp2']) ctx.hlTablet(id, S.groups.find(g => g.id === id).leaderNode, 't-hl');
          await ctx.delay(350);
          for (const id of ['xs1', 'xs2']) ctx.hlTablet(id, S.groups.find(g => g.id === id).leaderNode, 't-hl');
        }
      },
      {
        label: 'Local Writes → Bidirectional Replication',
        desc: 'S1 writes a new row (id=10, Jack, REG=S1) to xp1. Simultaneously S2 writes a new row (id=11, Lena, REG=S2) to xs2. After local Raft commits, P-1 ships Jack’s row to xs1, and P-2 ships Lena’s row to xp2. Both clusters converge with all data.',
        action: async (ctx) => {
          ctx.hlLatRow(0);
          const T10 = 1713289100.100, T11 = 1713289100.150;
          addLog('S1: INSERT id=10 Jack REG=S1 HLC=' + T10.toFixed(3) + ' → xp1 (N1)', 'li');
          addLog('S2: INSERT id=11 Lena REG=S2 HLC=' + T11.toFixed(3) + ' → xs2 (N5) [simultaneous]', 'li');
          await Promise.all([
            (async () => {
              ctx.hlTablet('xp1', 1, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 2, 'pk-raft', 280),
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 3, 'pk-raft', 280)
              ]);
              S.groups.find(g => g.id === 'xp1').data.push([10, 'Jack', 'S1', 89, T10]);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, true); }
              addLog('xp1 (S1): id=10 Jack committed REG=S1 HLC=' + T10.toFixed(3) + ' ✓', 'ls');
            })(),
            (async () => {
              ctx.hlTablet('xs2', 5, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xs2', 5, 'xs2', 4, 'pk-raft', 280),
                ctx.pktTabletToTablet('xs2', 5, 'xs2', 6, 'pk-raft', 280)
              ]);
              S.groups.find(g => g.id === 'xs2').data.push([11, 'Lena', 'S2', 73, T11]);
              for (const n of [4, 5, 6]) { ctx.hlTablet('xs2', n, 't-hl'); ctx.reRenderTablet('xs2', n, true); }
              addLog('xs2 (S2): id=11 Lena committed REG=S2 HLC=' + T11.toFixed(3) + ' ✓', 'ls');
            })()
          ]);
          setLatency(0, 2);
          await ctx.delay(300);
          ctx.hlLatRow(1);
          addLog('P-1 (forward): shipping id=10 Jack → xs1 (S2)', 'li');
          addLog('P-2 (reverse): shipping id=11 Lena → xp2 (S1)', 'li');
          await Promise.all([
            ctx.pktXCluster(1, 'xp1', 1, 'xs1', 4, 900),
            ctx.pktXCluster(2, 'xs2', 5, 'xp2', 2, 900)
          ]);
          S.groups.find(g => g.id === 'xs1').data.push([10, 'Jack', 'S1', 89, T10, 'ext']);
          for (const n of [4, 5, 6]) ctx.reRenderTablet('xs1', n, true);
          S.groups.find(g => g.id === 'xp2').data.push([11, 'Lena', 'S2', 73, T11, 'ext']);
          for (const n of [1, 2, 3]) ctx.reRenderTablet('xp2', n, true);
          setLatency(1, 45);
          ctx.setLag('~10ms');
          addLog('xs1: Jack (EXT REG=S1 HLC=' + T10.toFixed(3) + ') | xp2: Lena (EXT REG=S2 HLC=' + T11.toFixed(3) + ') ✓', 'ls');
          addLog('Both clusters converged — bidirectional replication complete', '');
        }
      },
      {
        label: 'Same-Row Conflict',
        desc: 'Both clusters update the same key (id=4) concurrently. S1 sets score=99 (REG=S1, HLC=T1=1713289100.500). S2 sets score=77 (REG=S2, HLC=T2=1713289100.520 — slightly later). Each commits via Raft locally. The differing HLC values in the tablets reveal the conflict.',
        action: async (ctx) => {
          const T1 = 1713289100.500, T2 = 1713289100.520;
          ctx.hlLatRow(0);
          addLog('S1: UPDATE id=4 score=99 REG=S1 HLC=' + T1.toFixed(3) + ' → xp1 (N1)', 'li');
          addLog('S2: UPDATE id=4 score=77 REG=S2 HLC=' + T2.toFixed(3) + ' → xs1 (N4) [simultaneous]', 'li');
          await Promise.all([
            (async () => {
              ctx.hlTablet('xp1', 1, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 2, 'pk-raft', 280),
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 3, 'pk-raft', 280)
              ]);
              const gp1 = S.groups.find(g => g.id === 'xp1');
              const r = gp1.data.find(x => x[0] === 4);
              if (r) { r[2] = 'S1'; r[3] = 99; r[4] = T1; delete r[5]; }
              const di1 = gp1.data.findIndex(x => x[0] === 4);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di1); }
              addLog('xp1: id=4 score=99 REG=S1 HLC=' + T1.toFixed(3) + ' ✓', 'ls');
            })(),
            (async () => {
              ctx.hlTablet('xs1', 4, 't-hl');
              await Promise.all([
                ctx.pktTabletToTablet('xs1', 4, 'xs1', 5, 'pk-raft', 280),
                ctx.pktTabletToTablet('xs1', 4, 'xs1', 6, 'pk-raft', 280)
              ]);
              const gs1 = S.groups.find(g => g.id === 'xs1');
              const r = gs1.data.find(x => x[0] === 4);
              if (r) { r[2] = 'S2'; r[3] = 77; r[4] = T2; delete r[5]; }
              const di2 = gs1.data.findIndex(x => x[0] === 4);
              for (const n of [4, 5, 6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di2); }
              addLog('xs1: id=4 score=77 REG=S2 HLC=' + T2.toFixed(3) + ' ✓', 'ls');
            })()
          ]);
          setLatency(0, 2);
          addLog('xp1 HLC=' + T1.toFixed(3) + ' vs xs1 HLC=' + T2.toFixed(3) + ' — same key, different versions', 'lw');
        }
      },
      {
        label: 'Replication + LWW Resolution',
        desc: 'P-1 ships S1’s update (score=99, T1) to xs1. P-2 ships S2’s update (score=77, T2) to xp1. Both clusters now see both versions. LWW: T2 (1713289100.520) > T1 (1713289100.500) — S2 write wins. The winning row is applied everywhere; WAL entries from the peer are tagged with origin_uuid to prevent re-replication loops.',
        action: async (ctx) => {
          const T1 = 1713289100.500, T2 = 1713289100.520;
          ctx.hlLatRow(1);
          addLog('P-1 (forward): id=4 S1 score=99 HLC=' + T1.toFixed(3) + ' → xs1', 'li');
          addLog('P-2 (reverse): id=4 S2 score=77 HLC=' + T2.toFixed(3) + ' → xp1', 'li');
          await Promise.all([
            ctx.pktXCluster(1, 'xp1', 1, 'xs1', 4, 900),
            ctx.pktXCluster(2, 'xs1', 4, 'xp1', 1, 900)
          ]);
          setLatency(1, 45);
          addLog('Conflict: xp1 HLC=' + T1.toFixed(3) + ' vs xs1 HLC=' + T2.toFixed(3) + ' — applying LWW', 'lw');
          ctx.hlLatRow(2);
          await ctx.delay(400);
          ctx.hlPoller(1, 'applying');
          ctx.hlPoller(2, 'applying');
          await ctx.delay(500);
          ctx.hlPoller(1, null);
          ctx.hlPoller(2, null);
          const gp1 = S.groups.find(g => g.id === 'xp1');
          const r1 = gp1.data.find(x => x[0] === 4);
          if (r1) { r1[2] = 'S2'; r1[3] = 77; r1[4] = T2; r1[5] = 'ext'; }
          const di1 = gp1.data.findIndex(x => x[0] === 4);
          for (const n of [1, 2, 3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di1); }
          const gs1 = S.groups.find(g => g.id === 'xs1');
          const r2 = gs1.data.find(x => x[0] === 4);
          if (r2) { r2[2] = 'S2'; r2[3] = 77; r2[4] = T2; delete r2[5]; }
          const di2 = gs1.data.findIndex(x => x[0] === 4);
          for (const n of [4, 5, 6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di2); }
          setLatency(2, 1);
          addLog('LWW: ' + T2.toFixed(3) + ' > ' + T1.toFixed(3) + ' — S2 write wins', 'ls');
          addLog('xp1 id=4: REG=S2 score=77 HLC=' + T2.toFixed(3) + ' (EXT from S2) ✓', 'ls');
          addLog('xs1 id=4: REG=S2 score=77 HLC=' + T2.toFixed(3) + ' (local winner) ✓', 'ls');
          addLog('origin_uuid stamp prevents S2 re-replicating its own write back', '');
        }
      },
      {
        label: 'TX-1 — Atomic Commit',
        desc: 'A single transaction on S1 updates two rows across two tablets: Alice (id=1) in xp1 and Carol (id=3) in xp2. Both changes replicate via Raft and commit simultaneously — on S1 they become visible at exactly the same moment.',
        action: async (ctx) => {
          const TS = 1713289300.100;
          ctx.hlLatRow(0);
          addLog('TX-1 (S1): BEGIN — spans xp1 (Alice id=1) and xp2 (Carol id=3)', 'li');
          addLog('TX-1: UPDATE id=1 Alice score=100 → xp1 leader N1', 'li');
          addLog('TX-1: UPDATE id=3 Carol score=100 → xp2 leader N2', 'li');
          await Promise.all([
            (async () => {
              await Promise.all([
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 2, 'pk-raft', 280),
                ctx.pktTabletToTablet('xp1', 1, 'xp1', 3, 'pk-raft', 280)
              ]);
              const gp1 = S.groups.find(g => g.id === 'xp1');
              const r = gp1.data.find(x => x[0] === 1);
              if (r) { r[3] = 100; r[4] = TS; }
              const di = gp1.data.findIndex(x => x[0] === 1);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di); }
            })(),
            (async () => {
              await Promise.all([
                ctx.pktTabletToTablet('xp2', 2, 'xp2', 1, 'pk-raft', 280),
                ctx.pktTabletToTablet('xp2', 2, 'xp2', 3, 'pk-raft', 280)
              ]);
              const gp2 = S.groups.find(g => g.id === 'xp2');
              const r = gp2.data.find(x => x[0] === 3);
              if (r) { r[3] = 100; r[4] = TS; }
              const di = gp2.data.findIndex(x => x[0] === 3);
              for (const n of [1, 2, 3]) { ctx.hlTablet('xp2', n, 't-hl'); ctx.reRenderTablet('xp2', n, di); }
            })()
          ]);
          ctx.setLat(0, 2);
          addLog('TX-1 COMMIT: Alice + Carol both visible atomically on S1 ✓', 'ls');
          addLog('Click Next → watch what happens when P-1 replicates before P-2', '');
        }
      },
      {
        label: 'P-1 Replicates → Partial Gap',
        desc: 'P-1 ships Alice\'s change (xp1) to xs1. xs1 immediately reflects the new value. But P-2 has not yet shipped Carol\'s change — xs2 still holds the pre-TX value of 78. A read on S2 right now sees the transaction only half-applied.',
        action: async (ctx) => {
          const TS = 1713289300.100;
          ctx.hlLatRow(1);
          addLog('P-1 polls xp1 → id=1 Alice score=100 → xs1 (ap-south-2)', 'li');
          await ctx.pktXCluster(1, 'xp1', 1, 'xs1', 4, 900);
          const gs1 = S.groups.find(g => g.id === 'xs1');
          const r1 = gs1.data.find(x => x[0] === 1);
          if (r1) { r1[3] = 100; r1[4] = TS; }
          const di1 = gs1.data.findIndex(x => x[0] === 1);
          for (const n of [4, 5, 6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di1); }
          ctx.setLat(1, 45);
          addLog('⚠ Partial-TX window — S2 read sees inconsistent state:', 'lw');
          addLog('  SELECT score WHERE id=1 → 100 (new) ✓', 'lw');
          addLog('  SELECT score WHERE id=3 → 78 (pre-TX stale) ✗', 'lw');
          for (const n of [4, 5, 6]) ctx.hlTablet('xs2', n, 't-hl2');
          addLog('P-2 has not polled yet — xs2 Carol is still the old value', '');
        }
      },
      {
        label: 'P-2 Replicates → Gap Closed',
        desc: 'P-2 now ships Carol\'s change (xp2) to xs2. The gap closes — both sides of the transaction are finally visible on S2. The "Txn gap" latency bar shows the ~20ms window during which S2 was in a partially-applied state.',
        action: async (ctx) => {
          const TS = 1713289300.100;
          addLog('P-2 polls xp2 → id=3 Carol score=100 → xs2 (ap-south-2)', 'li');
          await ctx.pktXCluster(2, 'xp2', 2, 'xs2', 5, 900);
          const gs2 = S.groups.find(g => g.id === 'xs2');
          const r2 = gs2.data.find(x => x[0] === 3);
          if (r2) { r2[3] = 100; r2[4] = TS; }
          const di2 = gs2.data.findIndex(x => x[0] === 3);
          for (const n of [4, 5, 6]) { ctx.hlTablet('xs2', n, 't-hl'); ctx.reRenderTablet('xs2', n, di2); }
          ctx.setLat(1, 65);
          ctx.setLat(3, 20);
          addLog('xs2 id=3 Carol score=100 ✓ — S2 now consistent', 'ls');
          addLog('⚠ xCluster delivers no cross-tablet commit ordering — apps must tolerate this gap', 'lw');
        }
      }
    ]
  },

  "19": {
    group: "System Internals", icon: "🗄️", sortOrder: 1,
    name: 'DocDB Storage', title: 'DocDB Storage', subtitle: 'LSM + MVCC internals',
    desc: "DocDB is YugabyteDB’s RocksDB-based storage engine. Every write is an immutable append — updates create new versions, deletes write tombstones. MVCC keeps all versions for consistent snapshot reads without locks.",
    guidedTour: [
      { text: "Every write in DocDB is an <b>immutable append</b> — updates create new key versions, deletes write tombstones. Nothing is overwritten in place.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to insert, update, and delete a row. Watch the SSTable accumulate multiple versions of the same key.", element: "#btn-step" },
      { text: "<b>MVCC</b> lets snapshot reads see a consistent view at any past timestamp without locks. Compaction later purges expired old versions.", element: ".lat-row" }
    ],
    latencies: [
      { lbl: 'WAL append', cls: 'll', max: 1 },
      { lbl: 'MemTable write', cls: 'll', max: 0.1 },
      { lbl: 'SST flush', cls: 'lm', max: 50 },
      { lbl: 'Compaction', cls: 'lm', max: 200 }
    ],
    init(ctx) {
      S.groups = [{
        id: 'tg1', table: 'users', tnum: 1, range: '0x0000–0xFFFF',
        leaderNode: 1, term: 4, replicas: [1, 2, 3],
        data: [],
        showScore: true
      }];
      S._docdb = { memtable: [], ssts: [] };
      ctx.rebuildReplicaState();
      ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY HASH,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
      showDocdbPanel(true);
      setDocdbOp('');
      renderDocdbPanel();
      renderAllTablets();
      setTimeout(renderConnections, 80);
    },
    steps: [
      {
        label: 'INSERT → MemTable',
        desc: 'Client inserts id=4 David Park score=95. DocDB appends an immutable WRITE entry to MemTable at T1. The write fans out via Raft to both followers before committing.',
        action: async (ctx) => {
          const T1 = '1713289200.100';
          const T1num = 1713289200.1;
          const pendingRow = [4, 'David Park', 'New York', 95, T1num];
          setDocdbOp("INSERT INTO users VALUES (4, 'David Park', 'New York', 95)");
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const rs1 = S.replicaState['tg1']?.[1];
          if (rs1) rs1.provisionalRows = [pendingRow];
          ctx.reRenderTablet('tg1', 1);
          S._docdb.memtable.unshift({ display: 'id=4 · David Park', hlc: T1, type: 'WRITE', value: 'score=95', isNew: true });
          renderDocdbPanel();
          ctx.setLat(0, 0.3); ctx.setLat(1, 0.05);
          addLog('INSERT id=4 David Park score=95 → WAL + MemTable @ T1=' + T1, 'li');
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          if (g) {
            g.data.push(pendingRow);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          addLog('Majority ACK → committed on all 3 replicas ✓', 'ls');
          ctx.activateClient(false);
        }
      },
      {
        label: 'UPDATE → New Version',
        desc: 'UPDATE score=99 appends a brand-new WRITE entry at T2. The old version (score=95 @ T1) is NOT overwritten — both versions coexist in MemTable. Raft replicates the new version.',
        action: async (ctx) => {
          const T2 = '1713289200.300';
          const T2num = 1713289200.3;
          setDocdbOp('UPDATE users SET score = 99 WHERE id = 4');
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const g = S.groups.find(x => x.id === 'tg1');
          const updatedRow = [4, 'David Park', 'New York', 99, T2num];
          if (g) { const ri = g.data.findIndex(r => r[0] === 4); if (ri >= 0) g.data.splice(ri, 1); }
          const rs1 = S.replicaState['tg1']?.[1];
          if (rs1) rs1.provisionalRows = [updatedRow];
          ctx.reRenderTablet('tg1', 1);
          for (const e of S._docdb.memtable) e.isNew = false;
          S._docdb.memtable.unshift({ display: 'id=4 · David Park', hlc: T2, type: 'WRITE', value: 'score=99', isNew: true });
          renderDocdbPanel();
          ctx.setLat(0, 0.3); ctx.setLat(1, 0.05);
          addLog('UPDATE id=4 score=99 → new WRITE @ T2=' + T2 + ' (T1 version retained)', 'li');
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          if (g) {
            g.data.push(updatedRow);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          addLog('Majority ACK → score=99 committed, 2 versions in MemTable ✓', 'ls');
          ctx.activateClient(false);
        }
      },
      {
        label: 'DELETE → Tombstone',
        desc: 'DELETE appends a TOMBSTONE marker at T3. No data is physically removed — 3 versions of id=4 now exist in MemTable. Raft replicates the tombstone.',
        action: async (ctx) => {
          const T3 = '1713289200.500';
          setDocdbOp('DELETE FROM users WHERE id = 4');
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          for (const e of S._docdb.memtable) e.isNew = false;
          S._docdb.memtable.unshift({ display: 'id=4 · David Park', hlc: T3, type: 'TOMBSTONE', value: '', isNew: true });
          renderDocdbPanel();
          ctx.setLat(0, 0.3); ctx.setLat(1, 0.05);
          addLog('DELETE id=4 → TOMBSTONE @ T3=' + T3 + ' (row still committed, pending Raft)', 'lw');
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          if (g) {
            g.data = g.data.filter(r => r[0] !== 4);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n); }
          addLog('Majority ACK → id=4 removed from tablet, tombstone in DocDB ✓', 'ls');
          ctx.activateClient(false);
        }
      },
      {
        label: 'MemTable Flush + INSERT id=5',
        desc: 'MemTable (3 versions of id=4) fills up and flushes to immutable SST-1 on disk. A fresh MemTable starts. Client inserts id=5 Eve Chen score=82 — it lands in the fresh MemTable and replicates via Raft.',
        action: async (ctx) => {
          const T4 = '1713289200.700';
          const T4num = 1713289200.7;
          setDocdbOp('-- MemTable full → background flush to SST-1');
          for (const e of S._docdb.memtable) e.isNew = false;
          const sst1Entries = S._docdb.memtable.map(e => ({ ...e }));
          S._docdb.ssts = [{ name: 'SST-1', entries: sst1Entries }];
          S._docdb.memtable = [];
          renderDocdbPanel();
          ctx.setLat(2, 32);
          addLog('MemTable → SST-1 flushed (3 versions of id=4, immutable on-disk)', 'ls');
          await new Promise(r => setTimeout(r, 400));
          setDocdbOp("INSERT INTO users VALUES (5, 'Eve Chen', 'Boston', 82)");
          const eveRow = [5, 'Eve Chen', 'Boston', 82, T4num];
          ctx.activateClient(true);
          await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
          ctx.hlTablet('tg1', 1, 't-hl');
          const rs1 = S.replicaState['tg1']?.[1];
          if (rs1) rs1.provisionalRows = [eveRow];
          ctx.reRenderTablet('tg1', 1);
          S._docdb.memtable.unshift({ display: 'id=5 · Eve Chen', hlc: T4, type: 'WRITE', value: 'score=82', isNew: true });
          renderDocdbPanel();
          addLog('INSERT id=5 Eve Chen score=82 → fresh MemTable @ T4=' + T4, 'li');
          await Promise.all([
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
            ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
          ]);
          const g = S.groups.find(x => x.id === 'tg1');
          if (g) {
            g.data.push(eveRow);
            for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
          }
          for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
          addLog('Majority ACK → id=5 committed on all 3 replicas ✓', 'ls');
          ctx.activateClient(false);
        }
      },
      {
        label: 'MVCC Snapshot Reads',
        desc: 'Three concurrent readers each hold a different HLC snapshot timestamp. DocDB scans newest-to-oldest and returns the first version at or before the snapshot — no locks held, readers never block writers.',
        action: async (ctx) => {
          setDocdbOp('SELECT score FROM users WHERE id = 4  -- at T1, T2, T3 snapshots');
          for (const e of S._docdb.memtable) e.isNew = false;
          renderDocdbPanel();
          const readers = [
            { label: 'Reader-A', ts: '1713289200.200', found: true, value: 'score=95  (T1 WRITE)' },
            { label: 'Reader-B', ts: '1713289200.400', found: true, value: 'score=99  (T2 WRITE)' },
            { label: 'Reader-C', ts: '1713289200.600', found: false, value: '' }
          ];
          renderDocdbReaders(readers);
          addLog('Reader-A @ T1+ε → scan MemTable+SST-1 → WRITE@T1 → score=95', 'ls');
          addLog('Reader-B @ T2+ε → scan MemTable+SST-1 → WRITE@T2 → score=99', 'ls');
          addLog('Reader-C @ T3+ε → scan SST-1 → TOMBSTONE@T3 → NOT FOUND', 'lw');
          addLog('No locks — readers never block writers', '');
        }
      },
      {
        label: 'Compaction + GC',
        desc: 'Compaction merges SST-1 and MemTable. The GC horizon is past T3 — all 3 id=4 entries (including tombstone) are pruned. Only id=5 Eve survives in the new SST-2.',
        action: async (ctx) => {
          setDocdbOp('-- Background compaction: SST-1 + MemTable → SST-2  (GC horizon ≥ T3)');
          const rw = document.getElementById('docdb-readers-wrap');
          if (rw) rw.style.display = 'none';
          for (const e of S._docdb.memtable) e.isNew = false;
          renderDocdbPanel();
          await new Promise(r => setTimeout(r, 500));
          const eveEntry = { display: 'id=5 · Eve Chen', hlc: '1713289200.700', type: 'WRITE', value: 'score=82', isNew: false };
          S._docdb.ssts = [{ name: 'SST-2 (compacted)', entries: [eveEntry] }];
          S._docdb.memtable = [];
          renderDocdbPanel();
          ctx.setLat(3, 150);
          addLog('Compaction: SST-1 + MemTable → SST-2', 'ls');
          addLog('GC pruned: id=4 TOMBSTONE + WRITE@T2 + WRITE@T1 (all past GC horizon)', 'ls');
          addLog('SST-2: only id=5 Eve Chen survives — storage reclaimed ✓', 'ls');
        }
      }
    ]
  },

  "mz": {
    group: "Global Universe", icon: "🏢", sortOrder: 1,
    name: 'Multi-Zone', title: 'Multi-Zone', subtitle: 'Single region · 3 AZs',
    desc: 'A single YugabyteDB cluster within <b>ap-south-1</b>, spread across 3 Availability Zones. RF=3 keeps one replica per AZ — survives any single AZ failure with zero RPO and zero RTO. All Raft stays intra-region; latency is uniform across AZs (~5ms write).',
    latencies: [
      { lbl: 'Client → Leader', cls: 'll', max: 20 },
      { lbl: 'Read Latency',    cls: 'll', max: 20 },
      { lbl: 'Raft Replication',cls: 'll', max: 10 },
      { lbl: 'Write Latency',   cls: 'll', max: 20 },
    ],
    guidedTour: [
      { text: "9 nodes across 3 AZs in <b>ap-south-1</b>. The orders table has 3 shards, one replica per AZ (RF=3).", element: ".canvas-wrap" },
      { text: "Use <b>📍 preference buttons</b> to pin leaders to any AZ. All AZs are in the same region — latency barely changes.", element: "#extra-btns" },
      { text: "Click <b>⚡ Fail</b> to take an AZ offline. Raft elects new leaders in the surviving AZs within ~150ms.", element: "#extra-btns" },
      { text: "Compare write latency here (~5ms, uniform across AZs) vs Multi-Region (~100ms+) — same resilience, dramatically lower latency.", element: ".step-bar" }
    ],
    extraBtns: [
      { id: 'mz-pref-az1', label: '📍 ap-south-1a', cls: 'btn-info', cb: 'mzSetPrefAz1', disabled: false },
      { id: 'mz-pref-az2', label: '📍 ap-south-1b', cls: 'btn-info', cb: 'mzSetPrefAz2', disabled: false },
      { id: 'mz-pref-az3', label: '📍 ap-south-1c', cls: 'btn-info', cb: 'mzSetPrefAz3', disabled: false },
      { id: 'mz-fail',     label: '⚡ Fail ap-south-1a', cls: 'btn-warn', cb: 'mzFailAz',    disabled: false },
      { id: 'mz-restore',  label: '↺ Restore',          cls: 'btn-ok',   cb: 'mzRestore',  disabled: true  },
    ],
    init: (ctx) => {
      window._mzPrefs = ['az1', 'az2', 'az3'];
      window._mzFailed = null;
      window._mzCtx = ctx;
      window._mzPanelDone = {};

      ctx.setCanvasGeoMode(true);
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, true);
      // Borrow region color codes (us=blue, eu=green, apac=amber) for AZ color distinction
      ctx.setNodeRegion(1,'us','ap-south-1a'); ctx.setNodeRegion(2,'us','ap-south-1a'); ctx.setNodeRegion(3,'us','ap-south-1a');
      ctx.setNodeRegion(4,'eu','ap-south-1b'); ctx.setNodeRegion(5,'eu','ap-south-1b'); ctx.setNodeRegion(6,'eu','ap-south-1b');
      ctx.setNodeRegion(7,'apac','ap-south-1c'); ctx.setNodeRegion(8,'apac','ap-south-1c'); ctx.setNodeRegion(9,'apac','ap-south-1c');
      // Fix zone labels — setNodeRegion auto-generates region-specific names; override for single-region AZ view
      const azMap = {1:'ap-south-1a',2:'ap-south-1a',3:'ap-south-1a',4:'ap-south-1b',5:'ap-south-1b',6:'ap-south-1b',7:'ap-south-1c',8:'ap-south-1c',9:'ap-south-1c'};
      for (let n = 1; n <= 9; n++) { const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = azMap[n]; }
      // Hide region labels inside node cards — not meaningful in single-region view
      for (let n = 1; n <= 9; n++) { const lbl = document.querySelector(`#node-${n} .region-label`); if (lbl) lbl.style.display = 'none'; }
      // Relabel region info cards as AZ cards (reuse same layout, same grid positions)
      [
        { id: 'ric-us',   flag: '🔵', name: 'ap-south-1a', meta: 'Availability Zone 1', color: _mzColors.az1 },
        { id: 'ric-eu',   flag: '🟢', name: 'ap-south-1b', meta: 'Availability Zone 2', color: _mzColors.az2 },
        { id: 'ric-apac', flag: '🟠', name: 'ap-south-1c', meta: 'Availability Zone 3', color: _mzColors.az3 },
      ].forEach(({ id, flag, name, meta, color }) => {
        const el = document.getElementById(id); if (!el) return;
        el.style.display = ''; el.style.borderLeftColor = color;
        el.querySelector('.ric-flag').textContent = flag;
        el.querySelector('.ric-name').textContent = name;
        el.querySelector('.ric-meta').textContent = meta;
      });

      S.groups = [
        { id:'mz1', table:'orders', tnum:1, range:'[0x0000, 0x5554]', leaderNode:1, term:4, replicas:[1,4,7],
          data:[[1042,'Widget Pro','Alice','DONE',1713.241],[1087,'Keyboard','Bob','SHIP',1713.298],[1103,'Monitor','Carol','PEND',1713.341]] },
        { id:'mz2', table:'orders', tnum:2, range:'[0x5555, 0xAAA9]', leaderNode:5, term:4, replicas:[2,5,8],
          data:[[2011,'Headset','Dave','DONE',1713.188],[2056,'SSD 1TB','Eve','DONE',1713.221],[2098,'Cable','Frank','PEND',1713.317]] },
        { id:'mz3', table:'orders', tnum:3, range:'[0xAAAA, 0xFFFF]', leaderNode:9, term:4, replicas:[3,6,9],
          data:[[3007,'Desk Lamp','Grace','SHIP',1713.163],[3049,'Notebook','Hank','DONE',1713.275],[3091,'Pen Set','Iris','PEND',1713.359]] },
      ];
      S.replicaState = buildRS(S.groups);
      document.getElementById('client-box').textContent = '⬡ ap-south-1a Client';

      renderAllTablets();
      _mzRenderAll();
      setTimeout(() => { renderConnections(); }, 100);
    },
    steps: [
      // Setup step
      {
        label: () => `Setup — RF=3 · Leaders in ${_mzEffAzs().map(az => _mzLabel[az]).join(' & ')}`,
        desc: () => {
          const azs = _mzEffAzs(), multi = azs.length > 1;
          return `9 nodes across 3 AZs in <b>ap-south-1</b>, RF=3 (1 replica per AZ). The <b>orders</b> table has 3 hash-sharded tablets, leaders in <b>${azs.map(az => _mzLabel[az]).join(' &amp; ')}</b>${multi?' (round-robin)':''}. All Raft stays intra-region — latency is uniform across AZs (~5ms write, ~3ms read).`;
        },
        action: async (ctx) => {
          const azs = _mzEffAzs();
          const healthEl = document.getElementById('health-txt');
          if (healthEl) healthEl.textContent = `${window._mzFailed ? '⚠️ Degraded' : 'Healthy'} · RF=3 · 9 TServers · Leaders: ${azs.map(az => _mzLabel[az]).join(' & ')}`;
          addLog(`Cluster ${window._mzFailed ? `degraded — ${_mzLabel[window._mzFailed]} offline` : 'healthy — all AZs up'}`, window._mzFailed ? 'lw' : 'ls');
          addLog(`orders table · 3 shards · RF=3 · leaders → ${azs.map(az => _mzLabel[az]).join(' & ')}`, 'li');
          _mzLogShards();
        }
      },
      // Read + Write per shard (6 steps)
      ...[0,1,2].flatMap(gi => {
        const ranges  = ['[0x0000,0x5554]','[0x5555,0xAAA9]','[0xAAAA,0xFFFF]'];
        const hranges = ['0x0000–0x5554','0x5555–0xAAA9','0xAAAA–0xFFFF'];
        return [
          {
            label: () => `Shard-${gi+1} Read · ${ranges[gi]} · ${_mzLabel[_mzEffAz(gi)]}`,
            desc: () => {
              const eff = _mzEffAz(gi), {cl, read} = _mzLatsAll()[gi];
              return `Client reads <b>shard-${gi+1}</b> leader in <b>${_mzLabel[eff]}</b>. Intra-region read — ~${read}ms regardless of which AZ holds the leader.`;
            },
            action: async (ctx) => {
              _mzResetLatBars();
              const eff = _mzEffAz(gi), leaderNode = _mzLeader(gi);
              const {cl, read} = _mzLatsAll()[gi];
              const tid = `mz${gi+1}`;
              addLog(`READ  shard-${gi+1} → Node ${leaderNode} (${_mzLabel[eff]}) [${hranges[gi]}]`, 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet(tid, leaderNode, 'pk-read', _mzAnimDur(cl));
              ctx.hlTablet(tid, leaderNode, 't-hl');
              await ctx.pktTabletToClient(tid, leaderNode, 'pk-ack', _mzAnimDur(cl));
              ctx.setLat(0, cl); ctx.setLat(1, read);
              ctx.hlLatRow(0); ctx.hlLatRow(1);
              addLog(`  ✓ read ~${read}ms (intra-region)`, 'ls');
              window._mzPanelDone[eff+':read'] = true; _mzRenderLatPanel();
              ctx.activateClient(false);
            }
          },
          {
            label: () => `Shard-${gi+1} Write · ${ranges[gi]} · ${_mzLabel[_mzEffAz(gi)]}`,
            desc: () => {
              const eff = _mzEffAz(gi), fail = window._mzFailed;
              const {cl, raft, write} = _mzLatsAll()[gi];
              const followers = _mzAll.filter(a => a !== eff && a !== fail);
              return `Leader in <b>${_mzLabel[eff]}</b> replicates via Raft to <b>${followers.map(a => _mzLabel[a]).join(' &amp; ')}</b>. Cross-AZ Raft is negligible (~${raft}ms) — end-to-end write ~${write}ms. Compare to Multi-Region: 100ms+.`;
            },
            action: async (ctx) => {
              _mzResetLatBars();
              const eff = _mzEffAz(gi), leaderNode = _mzLeader(gi), fail = window._mzFailed;
              const {cl, raft, write} = _mzLatsAll()[gi];
              const followers = _mzAll.filter(a => a !== eff && a !== fail);
              const followerNodes = followers.map(az => _mzNodes[az][gi]);
              const tid = `mz${gi+1}`;
              addLog(`WRITE shard-${gi+1} → Node ${leaderNode} (${_mzLabel[eff]}) [${hranges[gi]}]`, 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet(tid, leaderNode, 'pk-write', _mzAnimDur(cl));
              addLog(`  WAL → Raft → ${followers.map(a => _mzLabel[a]).join(', ')}`, 'li');
              const raftPkts = followerNodes.map((fn, i) =>
                ctx.pktTabletToTablet(tid, leaderNode, tid, fn, 'pk-raft', _mzAnimDur(_mzOW(eff, followers[i])))
              );
              await raftPkts[0];
              ctx.setLat(0, cl); ctx.setLat(2, raft); ctx.setLat(3, write);
              ctx.hlLatRow(0); ctx.hlLatRow(2); ctx.hlLatRow(3);
              const g = S.groups.find(x => x.id === tid);
              const nextId = 4000 + Math.floor(Math.random() * 999);
              const items = ['Laptop','Phone','Tablet','Camera','Watch'];
              const customers = ['Zara','Yusuf','Xavier','Wendy','Victor'];
              g.data.push([nextId, items[Math.floor(Math.random()*5)], customers[Math.floor(Math.random()*5)], 'PEND', performance.now()/1000]);
              [leaderNode, ...followerNodes].forEach(nid => ctx.reRenderTablet(tid, nid, true));
              addLog(`  ✓ quorum (${_mzLabel[followers[0]]} acked ~${raft}ms) — write ~${write}ms`, 'ls');
              if (raftPkts.length > 1) { await raftPkts[1]; addLog(`  ${_mzLabel[followers[1]]} synced`, 'li'); }
              await ctx.pktTabletToClient(tid, leaderNode, 'pk-ack', _mzAnimDur(cl));
              window._mzPanelDone[eff+':write'] = true; _mzRenderLatPanel();
              ctx.activateClient(false);
            }
          }
        ];
      })
    ]
  },

  "20": {
    group: "Global Universe", icon: "🌍", sortOrder: 2,
    name: 'Multi-Region', title: 'Multi-Region', subtitle: 'Leader preference',
    desc: 'A single YugabyteDB cluster spanning US-East, EU-West, and APAC. The <b>orders</b> table has 3 shards, each replicated to all 3 regions (RF=3). Pin leaders to any region, simulate a regional outage, and observe Raft re-election and latency impact in real time.',
    latencies: [
      { lbl: 'Client → Leader', cls: 'll', max: 200 },
      { lbl: 'Read Latency', cls: 'll', max: 200 },
      { lbl: 'Raft Replication', cls: 'lm', max: 300 },
      { lbl: 'Write Latency', cls: 'lm', max: 300 },
    ],
    guidedTour: [
      { text: "9 nodes across 3 regions. The <b>orders</b> table has 3 shards — each replicated to all 3 regions (RF=3).", element: ".canvas-wrap" },
      { text: "Use <b>📍 preference buttons</b> to pin leaders to any region. Leaders move instantly and latency reflects the new topology.", element: "#extra-btns" },
      { text: "Click <b>⚡ Fail</b> to take the preferred region offline. Raft elects new leaders in a surviving region automatically.", element: "#extra-btns" },
      { text: "Step through <b>Read</b> and <b>Write</b> to see animated packets and live latency updates reflecting the current state.", element: ".step-bar" }
    ],
    extraBtns: [
      { id: 'mr-pref-us', label: '📍 US-East', cls: 'btn-info', cb: 'mrSetPrefUs', disabled: false },
      { id: 'mr-pref-eu', label: '📍 EU-West', cls: 'btn-info', cb: 'mrSetPrefEu', disabled: false },
      { id: 'mr-pref-apac', label: '📍 APAC', cls: 'btn-info', cb: 'mrSetPrefApac', disabled: false },
      { id: 'mr-fail', label: '⚡ Fail US-East', cls: 'btn-warn', cb: 'mrFailRegion', disabled: false },
      { id: 'mr-restore', label: '↺ Restore', cls: 'btn-ok', cb: 'mrRestore', disabled: true },
    ],
    init: (ctx) => {
      window._mrPrefs = ['us', 'eu', 'apac'];
      window._mrFailed = null;
      window._mrCtx = ctx;
      window._mrPanelDone = {};

      ctx.setCanvasGeoMode(true);
      // Restore region info cards to original multi-region content
      [
        { id: 'ric-us',   flag: '🇺🇸', name: 'US-East', meta: 'AWS us-east-1'    },
        { id: 'ric-eu',   flag: '🇪🇺', name: 'Europe',  meta: 'AWS eu-central-1' },
        { id: 'ric-apac', flag: '🇮🇳', name: 'APAC',    meta: 'AWS ap-south-1'   },
      ].forEach(({ id, flag, name, meta }) => {
        const el = document.getElementById(id); if (!el) return;
        el.style.display = ''; el.style.borderLeftColor = '';
        el.querySelector('.ric-flag').textContent = flag;
        el.querySelector('.ric-name').textContent = name;
        el.querySelector('.ric-meta').textContent = meta;
      });
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, true);
      ctx.setNodeRegion(1, 'us', 'us-east-1a'); ctx.setNodeRegion(2, 'us', 'us-east-1b'); ctx.setNodeRegion(3, 'us', 'us-east-1c');
      ctx.setNodeRegion(4, 'eu', 'eu-central-1a'); ctx.setNodeRegion(5, 'eu', 'eu-central-1b'); ctx.setNodeRegion(6, 'eu', 'eu-central-1c');
      ctx.setNodeRegion(7, 'apac', 'ap-south-1a'); ctx.setNodeRegion(8, 'apac', 'ap-south-1b'); ctx.setNodeRegion(9, 'apac', 'ap-south-1c');

      S.groups = [
        {
          id: 'mr1', table: 'orders', tnum: 1, range: '[0x0000, 0x5554]', leaderNode: 1, term: 4, replicas: [1, 4, 7],
          data: [[1042, 'Widget Pro', 'Alice', 'DONE', 1713.241], [1087, 'Keyboard', 'Bob', 'SHIP', 1713.298], [1103, 'Monitor', 'Carol', 'PEND', 1713.341]]
        },
        {
          id: 'mr2', table: 'orders', tnum: 2, range: '[0x5555, 0xAAA9]', leaderNode: 2, term: 4, replicas: [2, 5, 8],
          data: [[2011, 'Headset', 'Dave', 'DONE', 1713.188], [2056, 'SSD 1TB', 'Eve', 'DONE', 1713.221], [2098, 'Cable', 'Frank', 'PEND', 1713.317]]
        },
        {
          id: 'mr3', table: 'orders', tnum: 3, range: '[0xAAAA, 0xFFFF]', leaderNode: 3, term: 4, replicas: [3, 6, 9],
          data: [[3007, 'Desk Lamp', 'Grace', 'SHIP', 1713.163], [3049, 'Notebook', 'Hank', 'DONE', 1713.275], [3091, 'Pen Set', 'Iris', 'PEND', 1713.359]]
        },
      ];
      S.replicaState = buildRS(S.groups);
      document.getElementById('client-box').textContent = '⬡ US-East Client';

      renderAllTablets();
      _mrRenderAll();
      setTimeout(() => { renderConnections(); }, 100);
    },
    steps: [
      // ── Step 0: Setup ────────────────────────────────────────────────────
      {
        label: () => `Setup — RF=3 · Leaders in ${_mrEffRegs().map(r => _mrLabel[r]).join(' & ')}`,
        desc: () => {
          const regs = _mrEffRegs(), multi = regs.length > 1;
          return `9 nodes across 3 regions, RF=3 (1 replica per region). The <b>orders</b> table has 3 hash-sharded tablets, each leader pinned to <b>${regs.map(r => _mrLabel[r]).join(' &amp; ')}</b>${multi ? ' (round-robin across shards)' : ''}. Toggle <b>📍 preference buttons</b> to move leaders, or click <b>⚡ Fail</b> to simulate a regional outage.`;
        },
        action: async (ctx) => {
          const regs = _mrEffRegs();
          const healthEl = document.getElementById('health-txt');
          if (healthEl) healthEl.textContent = `${window._mrFailed ? '⚠️ Degraded' : 'Healthy'} · RF=3 · 9 TServers · Leaders: ${regs.map(r => _mrLabel[r]).join(' & ')}`;
          addLog(`Cluster ${window._mrFailed ? `degraded — ${_mrLabel[window._mrFailed]} offline` : 'healthy — all regions up'}`, window._mrFailed ? 'lw' : 'ls');
          addLog(`orders table · 3 shards · RF=3 · leaders → ${regs.map(r => _mrLabel[r]).join(' & ')}`, 'li');
          _mrLogShards();
        }
      },
      // ── Steps 1-6: Read then Write as separate steps, per shard ─────────
      ...[0, 1, 2].flatMap(gi => {
        const ranges = ['[0x0000,0x5554]', '[0x5555,0xAAA9]', '[0xAAAA,0xFFFF]'];
        const hrange = ['0x0000–0x5554', '0x5555–0xAAA9', '0xAAAA–0xFFFF'][gi];
        return [
          // ── READ step ──
          {
            label: () => `Shard-${gi + 1} Read · ${ranges[gi]} · ${_mrLabel[_mrEffReg(gi)]}`,
            desc: () => {
              const eff = _mrEffReg(gi);
              const { cl, read } = _mrLatsAll()[gi];
              return `Client sends a <b>read</b> to the <b>shard-${gi + 1}</b> leader in <b>${_mrLabel[eff]}</b>. ${eff === 'us' ? 'Leader is in the same region — minimal latency.' : `Cross-region hop to ${_mrLabel[eff]} — round-trip ~${read}ms.`} Latency bars update on completion.`;
            },
            action: async (ctx) => {
              _mrResetLatBars();
              const eff = _mrEffReg(gi), leaderNode = _mrLeader(gi);
              const { cl, read } = _mrLatsAll()[gi];
              const tid = `mr${gi + 1}`;
              addLog(`READ  shard-${gi + 1} → Node ${leaderNode} (${_mrLabel[eff]}) [${hrange}]`, 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet(tid, leaderNode, 'pk-read', _mrAnimDur(cl));
              ctx.hlTablet(tid, leaderNode, 't-hl');
              await ctx.pktTabletToClient(tid, leaderNode, 'pk-ack', _mrAnimDur(cl));
              ctx.setLat(0, cl); ctx.setLat(1, read);
              ctx.hlLatRow(0); ctx.hlLatRow(1);
              addLog(`  ✓ read ~${read}ms${read > 10 ? ' (cross-region RTT)' : ' (local)'}`, read > 10 ? 'lw' : 'ls');
              window._mrPanelDone[eff + ':read'] = true; _mrRenderLatPanel();
              ctx.activateClient(false);
            }
          },
          // ── WRITE step ──
          {
            label: () => `Shard-${gi + 1} Write · ${ranges[gi]} · ${_mrLabel[_mrEffReg(gi)]}`,
            desc: () => {
              const eff = _mrEffReg(gi), fail = window._mrFailed;
              const { cl, raft, write } = _mrLatsAll()[gi];
              const followers = _mrAll.filter(r => r !== eff && r !== fail);
              return `Client sends a <b>write</b> to the <b>shard-${gi + 1}</b> leader in <b>${_mrLabel[eff]}</b>. The leader replicates via Raft to <b>${followers.map(r => _mrLabel[r]).join(' &amp; ')}</b> — quorum in ~${raft}ms, end-to-end write ~${write}ms.`;
            },
            action: async (ctx) => {
              _mrResetLatBars();
              const eff = _mrEffReg(gi), leaderNode = _mrLeader(gi), fail = window._mrFailed;
              const { cl, raft, write } = _mrLatsAll()[gi];
              const followers = _mrAll.filter(r => r !== eff && r !== fail);
              const followerNodes = followers.map(r => _mrNodes[r][gi]);
              const tid = `mr${gi + 1}`;
              addLog(`WRITE shard-${gi + 1} → Node ${leaderNode} (${_mrLabel[eff]}) [${hrange}]`, 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet(tid, leaderNode, 'pk-write', _mrAnimDur(cl));
              addLog(`  WAL → Raft → ${followers.map(r => _mrLabel[r]).join(', ')}`, 'li');
              const raftPkts = followerNodes.map((fn, i) =>
                ctx.pktTabletToTablet(tid, leaderNode, tid, fn, 'pk-raft', _mrAnimDur(_mrOW(eff, followers[i])))
              );
              await raftPkts[0];
              ctx.setLat(0, cl); ctx.setLat(2, raft); ctx.setLat(3, write);
              ctx.hlLatRow(0); ctx.hlLatRow(2); ctx.hlLatRow(3);

              const g = S.groups.find(x => x.id === tid);
              const nextId = 4000 + Math.floor(Math.random() * 999);
              const items = ['Laptop', 'Phone', 'Tablet', 'Camera', 'Watch'];
              const customers = ['Zara', 'Yusuf', 'Xavier', 'Wendy', 'Victor'];
              const newRow = [nextId, items[Math.floor(Math.random() * 5)], customers[Math.floor(Math.random() * 5)], 'PEND', performance.now() / 1000];
              g.data.push(newRow);
              [leaderNode, ...followerNodes].forEach(nid => ctx.reRenderTablet(tid, nid, true));

              addLog(`  ✓ quorum (${_mrLabel[followers[0]]} acked ~${raft}ms) — write ~${write}ms${write > 100 ? ' ⚠' : ''}`, write > 100 ? 'lw' : 'ls');
              if (raftPkts.length > 1) { await raftPkts[1]; addLog(`  ${_mrLabel[followers[1]]} synced`, 'li'); }
              await ctx.pktTabletToClient(tid, leaderNode, 'pk-ack', _mrAnimDur(cl));
              window._mrPanelDone[eff + ':write'] = true; _mrRenderLatPanel();
              ctx.activateClient(false);
            }
          }
        ];
      })
    ]
  },

  "21": {
    group: "Global Universe", icon: "🌎", sortOrder: 3,
    name: 'Geo-Partition', title: 'Geo-Partition', subtitle: 'Multi-region geo(row) pinning',
    filterTable: 'users',
    desc: 'YugabyteDB pins rows to specific regions via a <b>tablegroup</b> per region. Each Raft group has 3 replicas in the same region — reads and writes are always local. Region-specific clients see sub-5ms latency; a global client crossing regions pays the full cross-region RTT penalty.',
    guidedTour: [
      { text: "Geo-partitioning pins rows to a region by placing them in a region-local <b>Raft group</b> with all 3 replicas in the same zone.", element: ".canvas-wrap" },
      { text: "Click <b>Step Forward</b> to send reads and writes from each region's client — all traffic stays <b>in-region</b> with ~2ms latency.", element: "#btn-step" },
      { text: "Each client box is positioned next to its region. Geo-partitioning is key for <b>data residency</b> and GDPR compliance.", element: ".geo-client-box" }
    ],
    latencies: [
      { lbl: 'Client → Leader', cls: 'll', max: 200 },
      { lbl: 'Read Latency', cls: 'll', max: 200 },
      { lbl: 'Raft Replication', cls: 'lm', max: 50 },
      { lbl: 'Write Latency', cls: 'lm', max: 200 },
    ],
    init: (ctx) => {
      ctx.setCanvasGeoMode(true);
      // Restore region info cards to original geo-partition content
      [
        { id: 'ric-us',   flag: '🇺🇸', name: 'US-East', meta: 'AWS us-east-1'    },
        { id: 'ric-eu',   flag: '🇪🇺', name: 'Europe',  meta: 'AWS eu-central-1' },
        { id: 'ric-apac', flag: '🇮🇳', name: 'APAC',    meta: 'AWS ap-south-1'   },
      ].forEach(({ id, flag, name, meta }) => {
        const el = document.getElementById(id); if (!el) return;
        el.style.display = ''; el.style.borderLeftColor = '';
        el.querySelector('.ric-flag').textContent = flag;
        el.querySelector('.ric-name').textContent = name;
        el.querySelector('.ric-meta').textContent = meta;
      });
      document.getElementById('canvas-wrap').classList.add('geo-partition');
      for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, true);
      ctx.setNodeRegion(1, 'us', 'US-East'); ctx.setNodeRegion(2, 'us', 'US-East'); ctx.setNodeRegion(3, 'us', 'US-East');
      ctx.setNodeRegion(4, 'eu', 'Europe'); ctx.setNodeRegion(5, 'eu', 'Europe'); ctx.setNodeRegion(6, 'eu', 'Europe');
      ctx.setNodeRegion(7, 'apac', 'APAC'); ctx.setNodeRegion(8, 'apac', 'APAC'); ctx.setNodeRegion(9, 'apac', 'APAC');
      S.groups = JSON.parse(JSON.stringify(GEO_GROUPS));
      S.replicaState = buildRS(S.groups);
      renderAllTablets();
      setTimeout(renderConnections, 100);
    },
    steps: [
      // ── Setup ──
      {
        label: 'Setup — 3 Geo-Partitions · 3 Local Raft Groups',
        desc: '9 nodes across 3 regions, RF=3 per region. The <b>users</b> table is geo-partitioned: <b>tg-us</b> (Nodes 1–3), <b>tg-eu</b> (Nodes 4–6), <b>tg-apac</b> (Nodes 7–9). Each region-specific client reads and writes only to its local Raft group — no cross-region traffic.',
        action: async (ctx) => {
          addLog('Geo-Partition: users table split into 3 region-local Raft groups', 'ls');
          addLog('  tg-us   → Nodes 1, 2, 3 (us-east-1)   · leader: Node 1', 'li');
          addLog('  tg-eu   → Nodes 4, 5, 6 (eu-central-1) · leader: Node 4', 'li');
          addLog('  tg-apac → Nodes 7, 8, 9 (ap-south-1)  · leader: Node 7', 'li');
          addLog('Each client is co-located with its region\'s leader — reads/writes stay local', 'ls');
        }
      },
      // ── US steps ──
      ...[
        { reg: 'us', elId: 'geo-client-us', tg: 'tg-us', leader: 1, followers: [2, 3], lbl: 'US-East', raft: 2 },
        { reg: 'eu', elId: 'geo-client-eu', tg: 'tg-eu', leader: 4, followers: [5, 6], lbl: 'EU-West', raft: 2 },
        { reg: 'apac', elId: 'geo-client-apac', tg: 'tg-apac', leader: 7, followers: [8, 9], lbl: 'APAC', raft: 2 },
      ].flatMap(({ reg, elId, tg, leader, followers, lbl, raft }) => [
        // ── READ step ──
        {
          label: `${lbl} Client — Read`,
          desc: `The <b>${lbl} client</b> reads from the local <b>${tg}</b> leader (Node ${leader}). All 3 replicas are in the same region — the round-trip never leaves <b>${lbl}</b>. Expected latency: <b>~2ms</b>.`,
          action: async (ctx) => {
            _mrResetLatBars();
            addLog(`${lbl} Client: SELECT * FROM users WHERE region='${reg.toUpperCase()}'`, 'li');
            ctx.activateEl(elId, true);
            await ctx.pktFromElToTablet(elId, tg, leader, 'pk-read', 300);
            ctx.hlTablet(tg, leader, 't-hl');
            await ctx.pktTabletToEl(tg, leader, elId, 'pk-ack', 300);
            ctx.setLat(0, 2); ctx.setLat(1, 2);
            ctx.hlLatRow([0, 1]);
            addLog(`  ✓ local read ~2ms — no cross-region hop`, 'ls');
            ctx.activateEl(elId, false);
          }
        },
        // ── WRITE step ──
        {
          label: `${lbl} Client — Write`,
          desc: `The <b>${lbl} client</b> writes to the local <b>${tg}</b> leader (Node ${leader}). Raft replicates to Nodes ${followers.join(' & ')} within <b>${lbl}</b> — intra-region quorum in ~${raft}ms. End-to-end write: <b>~${2 + raft}ms</b>.`,
          action: async (ctx) => {
            _mrResetLatBars();
            const names = { us: ['Alice', 'Bob'], eu: ['Anna', 'Hans'], apac: ['Raj', 'Mei'] };
            const data = { us: [12, 'US', 79], eu: [11, 'DE', 90], apac: [10, 'IN', 85] }; const [score, regCode, id2] = data[reg];
            const newRow = [score, names[reg][0], regCode, id2, performance.now() / 1000];
            addLog(`${lbl} Client: INSERT INTO users (…) region='${reg.toUpperCase()}'`, 'li');
            ctx.activateEl(elId, true);
            await ctx.pktFromElToTablet(elId, tg, leader, 'pk-write', 300);
            addLog(`  WAL → Raft → ${lbl} followers (Nodes ${followers.join(', ')})`, 'li');
            const raftPkts = followers.map(fn => ctx.pktTabletToTablet(tg, leader, tg, fn, 'pk-raft', 300));
            await Promise.all(raftPkts);
            ctx.setLat(0, 2); ctx.setLat(2, raft); ctx.setLat(3, 2 + raft);
            ctx.hlLatRow([0, 2, 3]);
            S.groups.find(g => g.id === tg).data.push(newRow);
            for (const nid of [leader, ...followers]) ctx.reRenderTablet(tg, nid, true);
            addLog(`  ✓ intra-region quorum — write ~${2 + raft}ms`, 'ls');
            await ctx.pktTabletToEl(tg, leader, elId, 'pk-ack', 300);
            ctx.activateEl(elId, false);
          }
        }
      ])
    ]
  },

  // Security: Encryption in Transit
  "security-tls": {
    group: "Security", icon: "🔒", sortOrder: 1,
    name: 'Encryption in Transit', title: 'Encryption in Transit', subtitle: 'TLS for client-node & node-node traffic',
    isArch: true,
    desc: 'YugabyteDB encrypts all network traffic using TLS 1.2/1.3. Client-to-node connections (YSQL port 5433, YCQL port 9042) support one-way TLS or mutual TLS (mTLS). All intra-cluster node-to-node RPC traffic — TServer ↔ TServer and TServer ↔ YB-Master — is always protected with mutual TLS and certificate-based authentication.',
    guidedTour: [
      { text: "YugabyteDB secures <b>two distinct traffic paths</b>: client-to-node (app traffic) and node-to-node (internal RPC). Both use TLS 1.2/1.3.", element: ".arch-view" },
      { text: "Client connections to YSQL (:5433) and YCQL (:9042) support <b>one-way TLS or full mutual TLS</b>. Applications use standard PostgreSQL/Cassandra TLS drivers — no custom code.", element: ".sec-client-node" },
      { text: "All intra-cluster traffic uses <b>mutual TLS (mTLS)</b> — every node presents a certificate and verifies its peer. Zero plaintext bytes on the wire between nodes.", element: ".sec-node-node" }
    ],
  },

  // Security: Encryption at Rest
  "security-rest": {
    group: "Security", icon: "🔐", sortOrder: 2,
    name: 'Encryption at Rest', title: 'Encryption at Rest', subtitle: 'Per-file DEK · Universe Key · AES-256-CTR',
    isArch: true,
    desc: 'YugabyteDB uses a two-tier key hierarchy for encryption at rest. Each flushed SST file and WAL segment gets a unique Data Key (DEK, AES-256-CTR) embedded in its header. The DEK is encrypted by a Universe Key (UK) maintained by YB-Masters in an encrypted registry and distributed to TServers via heartbeat. Key rotation re-encrypts only the small DEK — existing data files are untouched until compaction. Supported KMS: AWS KMS, HashiCorp Vault, GCP KMS, Azure Key Vault, Thales CipherTrust.',
    guidedTour: [
      { text: "<b>Envelope encryption</b>: each SST file has a unique DEK; the DEK is encrypted by a Universe Key held by YB-Masters. Two layers — data and key — are always separate.", element: ".arch-view" },
      { text: "The DEK is <b>embedded in the SST file header</b> (EncryptionHeaderPB) alongside the Universe Key version ID. The Universe Key itself is never stored in the file.", element: ".sec-dek-layer" },
      { text: "<b>Key rotation</b> only re-encrypts the small DEK using the new Universe Key — existing data blocks are untouched until compaction.", element: ".sec-kms-layer" }
    ]
  },
  // Security: Row Level Security
  "security-rls": {
    group: "Security", icon: "🔑", sortOrder: 3,
    name: 'Row Level Security', title: 'Row Level Security (RLS)', subtitle: 'PostgreSQL-compatible fine-grained access control',
    isArch: true,
    desc: 'YugabyteDB supports PostgreSQL Row Level Security (RLS) natively through YSQL. RLS policies attach a predicate to a table that is transparently applied to every query — users only see or modify rows permitted by their policy. No application code changes are required; enforcement happens entirely in the database.',
    guidedTour: [
      { text: "<b>Row Level Security</b> works by attaching a WHERE-like predicate to a table. Every query — SELECT, UPDATE, DELETE — automatically filters through the policy.", element: ".arch-view" },
      { text: "Policies can be <b>role-specific</b>: a tenant isolation policy ensures user A never sees user B\'s rows, even if both query the same table.", element: ".sec-rls-policy" },
      { text: "RLS is <b>transparent to applications</b>: the driver, ORM, or query tool sees normal query results. Enforcement is entirely server-side in YSQL.", element: ".sec-rls-table" }
    ]
  },
  // Security: Authentication
  "security-auth": {
    group: "Security", icon: "🪪", sortOrder: 5,
    name: 'Authentication', title: 'Authentication Methods', subtitle: 'LDAP · OIDC · SCRAM · Kerberos · Cert-based',
    isArch: true,
    desc: 'YugabyteDB supports multiple authentication mechanisms for YSQL and YCQL connections. Methods are configured per-connection via HBA rules (host-based authentication). Supported: password (SCRAM-SHA-256, MD5), certificate-based mTLS, LDAP, OIDC/JWT, and Kerberos (GSSAPI).',
    guidedTour: [
      { text: "YugabyteDB supports <b>five authentication methods</b> — from simple password auth to enterprise SSO via OIDC. All are configured in the HBA rules file.", element: ".arch-view" },
      { text: "<b>SCRAM-SHA-256</b> is the recommended password method — it never sends the plaintext password over the wire, even without TLS.", element: ".sec-auth-methods" },
      { text: "<b>OIDC and LDAP</b> integrate with enterprise identity providers (Okta, Azure AD, etc.), enabling centralised credential management and SSO across all database connections.", element: ".sec-auth-enterprise" }
    ]
  },
  // Security: Audit Logging
  "security-audit": {
    group: "Security", icon: "📋", sortOrder: 6,
    name: 'Audit Logging', title: 'Audit Logging', subtitle: 'pgaudit · DDL / DML / DCL · Compliance',
    isArch: true,
    desc: 'YugabyteDB supports session and object-level audit logging through the pgaudit extension in YSQL. Audit logs capture DDL, DML, DCL, and role changes — enabling compliance with SOC 2, PCI-DSS, HIPAA, and similar frameworks. Logs can be directed to server log files or syslog.',
    guidedTour: [
      { text: "<b>pgaudit</b> provides statement-level and object-level audit logging. Enable it globally or per-role for fine-grained compliance coverage.", element: ".arch-view" },
      { text: "<b>Statement classes</b> (READ, WRITE, DDL, ROLE, MISC) let you capture exactly the operations your compliance framework requires — without logging noise.", element: ".sec-audit-classes" },
      { text: "Each audit record includes: <b>timestamp, user, database, statement class, object, and full SQL text</b>. Structured for SIEM ingestion.", element: ".sec-audit-format" }
    ]
  },
  // Security: Column Level Encryption
  "security-column": {
    group: "Security", icon: "🛡️", sortOrder: 4,
    name: 'Column Level Encryption', title: 'Column Level Encryption', subtitle: 'pgcrypto · field-level PII / PCI protection',
    isArch: true,
    desc: 'YugabyteDB supports column-level encryption via the pgcrypto extension (supported through YSQL). Sensitive columns — SSNs, card numbers, PII fields — are encrypted before storage using pgp_sym_encrypt() or pgp_pub_encrypt(). Only queries that supply the correct decryption key can retrieve plaintext values. The rest of the row remains fully queryable.',
    guidedTour: [
      { text: "<b>Column level encryption</b> uses the pgcrypto extension. Individual column values are encrypted at the SQL layer — the ciphertext bytes are what get stored in the tablet.", element: ".arch-view" },
      { text: "Use <code>pgp_sym_encrypt(value, key)</code> on INSERT and <code>pgp_sym_decrypt(col::bytea, key)</code> on SELECT. Only the caller with the key sees plaintext.", element: ".sec-col-encrypt" },
      { text: "Non-sensitive columns remain <b>fully queryable</b> with indexes and joins. Encryption applies only to the designated sensitive fields — no whole-row overhead.", element: ".sec-col-table" }
    ]
  },

  // ── Data Management ────────────────────────────────────────────────────────

  "dm-snapshot": {
    group: "Data Management", icon: "📸", sortOrder: 1,
    name: 'Distributed Consistent Snapshot', title: 'Distributed Consistent Snapshot',
    subtitle: 'Safe-time · RPC broadcast · MemTable flush · SST hardlink',
    snapshotVizPanel: true,
    desc: 'A YugabyteDB snapshot is a 4-phase operation rooted in DocDB: (1) the master computes <code>T_snap = HLC_now + max_clock_skew</code> and waits until no in-flight write older than T_snap can still arrive; (2) it broadcasts <code>SnapshotTabletAtHybridTimestamp(T_snap)</code> to every tablet leader in parallel; (3) each tablet flushes its MemTable to an immutable SST file; (4) it hardlinks those SSTs into <code>snapshots/snap-xxx/</code>. No data is copied — hardlinks make this O(1) regardless of dataset size.',
    guidedTour: [
      { text: "The top pane shows all 3 tablet leaders and the YB-Master. Watch their phase badges update as the snapshot progresses. The <b>DocDB panel</b> below shows the storage layer of Tablet-1 in real time.", element: ".snap-viz-panel" },
      { text: "The <b>HLC status</b> on the right shows the safe-time calculation: T_snap = HLC_now + max_clock_skew. The master waits until its own HLC advances past T_snap + skew before issuing any RPC.", element: ".svp-right" },
      { text: "In the DocDB panel, watch the MemTable drain → SST-1 appear → the <b>green snapshot section</b> materialise. That green layer is the snapshot directory. Same bytes on disk, different directory pointer — zero bytes copied.", element: ".docdb-panel" }
    ],
    latencies: [
      { lbl: 'Safe-time wait', cls: 'll', max: 2   },
      { lbl: 'RPC broadcast',  cls: 'll', max: 5   },
      { lbl: 'Flush + hardlink', cls: 'lm', max: 80 }
    ],
    init: (ctx) => {
      showDocdbPanel(true);
      S._docdb = { memtable: [], ssts: [], snapshotSsts: [], snapshotId: 'snap-20240518-001' };
      setDocdbOp('Tablet-1 · accounts shard · 0x0000–0x5554 (leader on TServer-1)');
      renderDocdbPanel();
      renderSnapshotViz({
        masterPhase: 'idle', masterOp: '— waiting for snapshot request —',
        tablets: [{id:1,phase:'idle'},{id:2,phase:'idle'},{id:3,phase:'idle'}],
        hlcNow: '1716003600.000000', phaseLabel: 'Cluster idle'
      });
    },
    steps: [
      {
        label: '1. Writes Arrive → DocDB MemTable',
        desc: 'Every write to YugabyteDB lands first in the tablet\'s MemTable — an in-memory, append-only buffer in DocDB\'s LSM engine. Each KV entry is stamped with an HLC timestamp. The DocDB panel tracks Tablet-1\'s live state in real time.',
        action: async (ctx) => {
          setDocdbOp('INSERT → accounts · KV entries landing in MemTable');
          renderSnapshotViz({
            masterPhase: 'idle', masterOp: 'Receiving writes — no snapshot in progress',
            tablets: [{id:1,phase:'idle'},{id:2,phase:'idle'},{id:3,phase:'idle'}],
            hlcNow: '1716003600.000001', phaseLabel: 'Normal write traffic'
          });
          const writes = [
            { display: 'accounts:id=1:balance', hlc: '1716003600.000001', value: '12400' },
            { display: 'accounts:id=2:balance', hlc: '1716003600.000002', value: '8750'  },
            { display: 'accounts:id=3:balance', hlc: '1716003600.000003', value: '34100' },
            { display: 'accounts:id=4:balance', hlc: '1716003600.000004', value: '5200'  },
            { display: 'accounts:id=5:balance', hlc: '1716003600.000005', value: '19800' },
          ];
          for (const w of writes) {
            await ctx.delay(340);
            S._docdb.memtable.unshift({ display: w.display, hlc: w.hlc, type: 'WRITE', value: w.value, isNew: true });
            renderDocdbPanel();
            S._docdb.memtable.forEach(e => e.isNew = false);
            renderSnapshotViz({
              masterPhase: 'idle', masterOp: 'Receiving writes — no snapshot in progress',
              tablets: [{id:1,phase:'idle'},{id:2,phase:'idle'},{id:3,phase:'idle'}],
              hlcNow: w.hlc, phaseLabel: 'Normal write traffic'
            });
          }
          addLog(`MemTable: ${S._docdb.memtable.length} entries · HLC 1716003600.000001–.000005`, 'ls');
        }
      },
      {
        label: '2. Master Computes Snapshot Safe Time',
        desc: 'The YB-Master picks T_snap = HLC_now + max_clock_skew. It then waits until its own HLC advances past T_snap + max_clock_skew. This guarantees every write with commit HLC ≤ T_snap is already fully durable before any snapshot RPC is issued.',
        action: async (ctx) => {
          setDocdbOp('YB-Master: computing T_snap = HLC_now + max_clock_skew (500 μs)');
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'Computing T_snap = HLC_now + max_clock_skew',
            tablets: [{id:1,phase:'idle'},{id:2,phase:'idle'},{id:3,phase:'idle'}],
            hlcNow: '1716003600.000006', tSnap: '', waitPct: 0,
            phaseLabel: 'Computing safe time…'
          });
          addLog('YB-Master: snapshot safe time computation', 'lh');
          addLog('  HLC_now        = 1716003600.000006', 'ls');
          addLog('  max_clock_skew =          0.000500  (500 μs)', 'ls');
          addLog('  T_snap         = 1716003600.000506', 'lw');
          await ctx.delay(600);
          // Animate wait progress 0 → 100
          for (let p = 0; p <= 100; p += 20) {
            renderSnapshotViz({
              masterPhase: 'active', masterOp: 'Waiting: own HLC must advance past T_snap + max_clock_skew',
              tablets: [{id:1,phase:'idle'},{id:2,phase:'idle'},{id:3,phase:'idle'}],
              hlcNow: `1716003600.00${String(6 + Math.round(p * 0.1)).padStart(4,'0')}`,
              tSnap: '1716003600.000506', waitPct: p,
              phaseLabel: p < 100 ? 'Waiting for HLC to advance…' : 'Safe time reached ✓'
            });
            await ctx.delay(200);
          }
          setDocdbOp('YB-Master: safe time confirmed → ready to broadcast snapshot RPCs');
          addLog('  HLC advanced ✓ · all writes ≤ T_snap are fully committed · safe to snapshot', 'ls');
        }
      },
      {
        label: '3. Broadcast SnapshotTabletAtHybridTimestamp + Raft',
        desc: 'The master broadcasts SnapshotTabletAtHybridTimestamp(T_snap) to all 3 tablet leaders simultaneously. Each leader appends a SNAPSHOT record to its Raft log and fans it out to its followers for quorum before proceeding.',
        action: async (ctx) => {
          setDocdbOp('RPC broadcast: SnapshotTabletAtHybridTimestamp(T_snap=1716003600.000506)');
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'SnapshotTabletAtHybridTimestamp(T_snap=1716003600.000506)',
            tablets: [{id:1,phase:'rpc'},{id:2,phase:'rpc'},{id:3,phase:'rpc'}],
            hlcNow: '1716003600.000510', tSnap: '1716003600.000506', waitPct: 100,
            phaseLabel: 'RPC broadcast → all 3 tablets'
          });
          addLog('YB-Master → [Tablet-1, Tablet-2, Tablet-3]: SnapshotTabletAtHybridTimestamp', 'lh');
          await ctx.delay(600);
          // SNAPSHOT Raft record appears in MemTable
          S._docdb.memtable.unshift({ display: 'SNAPSHOT record', hlc: '1716003600.000506', type: 'SNAPSHOT', value: 'snap-001', isNew: true });
          renderDocdbPanel();
          S._docdb.memtable.forEach(e => e.isNew = false);
          addLog('SNAPSHOT record replicated via Raft · quorum on all 3 tablets · provisional writes resolved', 'ls');
          await ctx.delay(400);
        }
      },
      {
        label: '4. MemTable Flush → SST · Hardlink into snapshot/',
        desc: 'Each tablet flushes its MemTable to an immutable SST file on disk (rocksdb::Flush). Then it hardlinks every SST file into the snapshots/snap-001/ subdirectory. Hardlinks are filesystem pointer copies — zero bytes are written, regardless of how large the dataset is.',
        action: async (ctx) => {
          // Phase A: flush
          setDocdbOp('rocksdb::Flush() → tablet-data/rocksdb/000010.sst');
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'Waiting for flush + hardlink acknowledgements',
            tablets: [{id:1,phase:'flushing'},{id:2,phase:'flushing'},{id:3,phase:'flushing'}],
            hlcNow: '1716003600.000520', tSnap: '1716003600.000506', waitPct: 100,
            phaseLabel: 'Flushing MemTable → SST…'
          });
          addLog('All tablets: rocksdb::Flush() triggered…', 'lh');
          await ctx.delay(700);
          const flushed = S._docdb.memtable.filter(e => e.type !== 'SNAPSHOT').map(e => ({ ...e, isNew: false }));
          S._docdb.ssts = [{ name: 'SST-1  (000010.sst)', entries: flushed }];
          S._docdb.memtable = [];
          renderDocdbPanel();
          addLog(`SST-1 written · ${flushed.length} KV entries · MemTable cleared`, 'ls');
          await ctx.delay(500);
          // Phase B: hardlink
          setDocdbOp('hardlink: rocksdb/000010.sst → snapshots/snap-20240518-001/tablet-xxx/000010.sst');
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'Creating hardlinks in snapshots/snap-20240518-001/',
            tablets: [{id:1,phase:'hardlinking'},{id:2,phase:'hardlinking'},{id:3,phase:'hardlinking'}],
            hlcNow: '1716003600.000540', tSnap: '1716003600.000506', waitPct: 100,
            phaseLabel: 'Hardlinking SSTs → snapshot dir…'
          });
          addLog('Hardlinking SST files into snapshots/snap-20240518-001/…', 'lh');
          await ctx.delay(500);
          S._docdb.snapshotSsts = [{ name: 'SST-1  (000010.sst)', entries: flushed.map(e => ({ ...e })) }];
          renderDocdbPanel();
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'Hardlinks complete — awaiting ACK from all tablets',
            tablets: [{id:1,phase:'done'},{id:2,phase:'done'},{id:3,phase:'done'}],
            hlcNow: '1716003600.000545', tSnap: '1716003600.000506', waitPct: 100,
            phaseLabel: 'Hardlinks complete · 0 bytes copied'
          });
          addLog('Hardlinks created · 0 bytes copied · snapshot dir pinned against GC', 'ls');
        }
      },
      {
        label: '5. Master Marks COMPLETE · Writes Resume',
        desc: 'All tablet leaders ACK the master. The master writes the snapshot manifest to its system catalog and marks the snapshot COMPLETE. New writes immediately land in a fresh MemTable — the hardlinked snapshot SSTs are untouched and GC-protected.',
        action: async (ctx) => {
          setDocdbOp('YB-Master: snapshot_id=snap-20240518-001 → status=COMPLETE (system catalog)');
          renderSnapshotViz({
            masterPhase: 'active', masterOp: 'All tablets ACK → writing manifest to system catalog',
            tablets: [{id:1,phase:'done'},{id:2,phase:'done'},{id:3,phase:'done'}],
            hlcNow: '1716003600.000600', tSnap: '1716003600.000506', waitPct: 100,
            phaseLabel: 'COMPLETE ✓',
            manifest: 'snap-20240518-001 · T_snap=1716003600.000506\n3 tablets · ~4.2 MB · GC-pinned'
          });
          addLog('All 3 tablets ACK → YB-Master: status=COMPLETE', 'ls');
          addLog('Manifest: snap-20240518-001 · T_snap=1716003600.000506 · tablets=3 · ~4.2 MB', 'ls');
          await ctx.delay(500);
          // New writes resume into fresh MemTable
          const resumeWrites = [
            { display: 'accounts:id=6:balance', hlc: '1716003600.001200', value: '7300'  },
            { display: 'accounts:id=7:balance', hlc: '1716003600.001350', value: '22000' },
          ];
          for (const w of resumeWrites) {
            await ctx.delay(400);
            S._docdb.memtable.unshift({ display: w.display, hlc: w.hlc, type: 'WRITE', value: w.value, isNew: true });
            renderDocdbPanel();
            S._docdb.memtable.forEach(e => e.isNew = false);
          }
          addLog('New writes in fresh MemTable · snapshot SSTs hardlinked and GC-protected · 0ms pause', 'ls');
        }
      }
    ]
  },

  "dm-backup": {
    group: "Data Management", icon: "☁️", sortOrder: 2,
    name: 'Distributed Backup', title: 'Distributed Backup',
    subtitle: 'Parallel tablet-level streams to cloud storage',
    desc: 'YugabyteDB backups are fully distributed: after a consistent snapshot, every TServer streams its tablet SST files to the backup target (S3, GCS, or NFS) in parallel. No single node is a bottleneck. Backup throughput scales linearly with the number of nodes.',
    snapshotVizPanel: true,
    guidedTour: [
      { text: "Backup starts with a <b>consistent snapshot</b> — all tablets freeze at the same HLC before any data moves.", element: ".snap-viz-panel" },
      { text: "Each TServer streams its SST files independently. The <b>top panel</b> shows per-node upload progress — no single node serialises the backup.", element: ".snap-viz-panel" },
      { text: "The <b>DocDB panel</b> shows SST files being hardlinked to the snapshot directory, then streamed to cloud storage. Zero bytes are duplicated within the node.", element: ".docdb-panel" }
    ],
    latencies: [
      { lbl: 'Snapshot', cls: 'll', max: 50 },
      { lbl: 'Stream / Node', cls: 'lm', max: 120 },
      { lbl: 'Manifest Write', cls: 'll', max: 10 }
    ],
    init: (ctx) => {
      showDocdbPanel(true);
      S._docdb = { memtable: [], ssts: [], snapshotSsts: [], snapshotId: 'snap-20240518-002' };
      setDocdbOp('Tablet-1 · accounts shard · 0x0000–0x5554 (leader on TServer-1)');
      S._docdb.ssts = [
        { name: 'SST (000010.sst)', entries: [
          { display: 'accounts/id=1', type: 'WRITE', hlc: '1716001100.000001', value: 'Alice · Savings · $12,400' },
          { display: 'accounts/id=2', type: 'WRITE', hlc: '1716001100.000002', value: 'Bob · Checking · $8,750' }
        ]},
        { name: 'SST (000011.sst)', entries: [
          { display: 'accounts/id=3', type: 'WRITE', hlc: '1716001050.000001', value: 'Carol · Savings · $34,100' },
          { display: 'accounts/id=4', type: 'WRITE', hlc: '1716001050.000002', value: 'Dan · Checking · $5,200' }
        ]}
      ];
      renderDocdbPanel();
      ctx.backupViz({ nodes: [], totalPct: 0, status: 'Idle', elapsed: 0, target: 's3://yb-backups/prod/' });
    },
    steps: [
      {
        label: '1. Consistent Snapshot',
        desc: 'Before any data moves, the YB-Master triggers a distributed consistent snapshot. All tablet leaders flush their MemTable and record the snapshot HLC. Notice the SST filenames above the green divider (000010.sst, 000011.sst) — these exact same files are hardlinked below. Zero bytes copied.',
        action: async (ctx) => {
          addLog('Backup job started: backup-20240518-02 · target: s3://yb-backups/prod/', 'lh');
          S._docdb.memtable = [
            { display: 'SNAPSHOT', type: 'SNAPSHOT', hlc: '1716001200.000017', value: 'snap-20240518-002 · T_snap=1716001200.000017' }
          ];
          renderDocdbPanel();
          await ctx.delay(500);
          S._docdb.ssts = [
            { name: 'SST (000010.sst)', entries: [
              { display: 'accounts/id=1', type: 'WRITE', hlc: '1716001100.000001', value: 'Alice · Savings · $12,400' },
              { display: 'accounts/id=2', type: 'WRITE', hlc: '1716001100.000002', value: 'Bob · Checking · $8,750' }
            ]},
            { name: 'SST (000011.sst)', entries: [
              { display: 'accounts/id=3', type: 'WRITE', hlc: '1716001050.000001', value: 'Carol · Savings · $34,100' },
              { display: 'accounts/id=4', type: 'WRITE', hlc: '1716001050.000002', value: 'Dan · Checking · $5,200' }
            ]}
          ];
          S._docdb.memtable = [];
          S._docdb.snapshotSsts = [
            { name: 'hardlink: 000010.sst', entries: [
              { display: '000010.sst', type: 'WRITE', hlc: '→ snapshots/snap-20240518-002/tablet-1/', value: 'same inode as SST above · 2.1 MB · 0 bytes copied' }
            ]},
            { name: 'hardlink: 000011.sst', entries: [
              { display: '000011.sst', type: 'WRITE', hlc: '→ snapshots/snap-20240518-002/tablet-1/', value: 'same inode as SST above · 1.8 MB · 0 bytes copied' }
            ]}
          ];
          renderDocdbPanel();
          ctx.backupViz({ nodes: [{node:1,pct:0},{node:2,pct:0},{node:3,pct:0}], totalPct: 0, status: 'Snapshot ready', elapsed: 0, target: 's3://yb-backups/prod/' });
          addLog('Consistent snapshot: snap-20240518-002 @ HLC 1716001200.000017', 'ls');
          addLog('000010.sst + 000011.sst hardlinked → snapshots/ — same inodes, zero copy', 'ls');
        }
      },
      {
        label: '2. Backup Streams Begin',
        desc: 'All TServers start streaming their snapshot SST files to S3 in parallel. The upload reads from the hardlinked snapshot directory — the live SSTs above the divider are untouched and continue serving reads and writes.',
        action: async (ctx) => {
          ctx.backupViz({ nodes: [{node:1,pct:8},{node:2,pct:5},{node:3,pct:3}], totalPct: 5, status: 'Streaming…', elapsed: 2, target: 's3://yb-backups/prod/' });
          S._docdb.snapshotSsts = [
            { name: 'hardlink: 000010.sst  ☁ uploading', entries: [
              { display: '000010.sst', type: 'WRITE', hlc: '☁ → s3://yb-backups/prod/snap-20240518-002/', value: '8% · 168 KB/s' }
            ]},
            { name: 'hardlink: 000011.sst  ⏳ queued', entries: [
              { display: '000011.sst', type: 'WRITE', hlc: '→ snapshots/snap-20240518-002/tablet-1/', value: 'waiting for 000010.sst to complete' }
            ]}
          ];
          renderDocdbPanel();
          await ctx.delay(400);
          addLog('TServer-1, TServer-2, TServer-3 streaming in parallel', 'ls');
        }
      },
      {
        label: '3. Progress — Parallel Upload',
        desc: 'Each TServer uploads at its own rate. The live SSTs (top section) keep serving traffic — the snapshot hardlinks (bottom) are read-only references to the same files. Throughput scales linearly with node count.',
        action: async (ctx) => {
          const steps = [
            { n1:30, n2:22, n3:18, total:23, elapsed:8 },
            { n1:55, n2:48, n3:40, total:48, elapsed:15 },
            { n1:78, n2:70, n3:62, total:70, elapsed:22 },
            { n1:100, n2:88, n3:80, total:89, elapsed:28 }
          ];
          for (const s of steps) {
            ctx.backupViz({ nodes: [{node:1,pct:s.n1},{node:2,pct:s.n2},{node:3,pct:s.n3}], totalPct: s.total, status: 'Streaming…', elapsed: s.elapsed, target: 's3://yb-backups/prod/' });
            const f10 = s.n1 >= 100 ? '✓ done' : `${s.n1}%`;
            const f11 = s.n1 >= 50 ? `${s.n1 - 10}%` : 'queued';
            S._docdb.snapshotSsts = [
              { name: `hardlink: 000010.sst  ☁ ${f10}`, entries: [
                { display: '000010.sst', type: 'WRITE', hlc: `☁ uploaded ${f10}`, value: s.n1 >= 100 ? '2.1 MB complete' : `${Math.round(s.n1*21)}KB / 2.1 MB` }
              ]},
              { name: `hardlink: 000011.sst  ☁ ${f11}`, entries: [
                { display: '000011.sst', type: 'WRITE', hlc: `☁ uploaded ${f11}`, value: s.n1 >= 50 ? `${Math.round((s.n1-10)*18)}KB / 1.8 MB` : 'waiting' }
              ]}
            ];
            renderDocdbPanel();
            await ctx.delay(500);
          }
          addLog('TServer-1 complete · TServer-2 at 88% · TServer-3 at 80%', 'ls');
        }
      },
      {
        label: '4. Backup Complete + Manifest',
        desc: 'All TServers finish. The coordinator writes a backup manifest listing the snapshot ID, HLC, tablet locations, and SHA-256 checksums. The hardlink reference count drops to 1 — the SSTs live on as normal live files, unchanged.',
        action: async (ctx) => {
          ctx.backupViz({ nodes: [{node:1,pct:100},{node:2,pct:100},{node:3,pct:100}], totalPct: 100, status: 'Complete ✓', elapsed: 34, target: 's3://yb-backups/prod/' });
          S._docdb.snapshotSsts = [{ name: 'MANIFEST written', entries: [
            { display: 'MANIFEST', type: 'SNAPSHOT', hlc: 's3://yb-backups/prod/backup-20240518-02/', value: 'snap-20240518-002 · 6.3 MB · 2 SSTs · SHA256 ✓' }
          ]}];
          renderDocdbPanel();
          addLog('Backup manifest written to s3://yb-backups/prod/backup-20240518-02/', 'ls');
          addLog('Backup complete · 6.3 MB · 3 TServers · 34s · live SSTs unchanged', 'ls');
        }
      }
    ]
  },

  "dm-pitr": {
    group: "Data Management", icon: "⏱️", sortOrder: 3,
    name: 'PITR', title: 'Point-in-Time Recovery',
    subtitle: 'On-demand snapshot + HLC read filter — delta writes in recovery window lost',
    desc: 'DocDB is an <b>LSM-tree</b> — every write appends a new HLC-stamped version; nothing overwrites in place. With PITR enabled, the history retention window is extended so all MVCC versions are preserved. When restore is initiated, YugabyteDB takes an <b>on-demand snapshot</b> right at that moment (capturing all writes including post-anomaly deltas), then applies an <b>HLC read filter</b> at T_restore inside that snapshot — any version with HLC &gt; T_restore is filtered out of view. The delta writes between T_restore and restore initiation are permanently lost — this is the PITR trade-off. Use <b>DB Clone</b> when you need surgical recovery without losing those deltas.',
    snapshotVizPanel: true,
    guidedTour: [
      { text: "The timeline shows <b>scheduled snapshots</b> (green) and — when restore is initiated — an <b>on-demand snapshot</b> (amber) taken at that exact moment. The red zone between the anomaly and the on-demand snapshot is the <b>delta loss window</b>.", element: ".snap-viz-panel" },
      { text: "The <b>DocDB panel</b> shows multiple HLC-stamped MVCC versions per key retained by PITR's extended window. After recovery, the on-demand snapshot hardlinks are the restore base — the HLC filter hides everything with HLC &gt; T_restore.", element: ".docdb-panel" },
      { text: "Step 5 shows the key trade-off: the delta write (id=105, placed <i>after</i> the accidental delete) is captured inside the on-demand snapshot but filtered out. <b>DB Clone</b> sidesteps this entirely via surgical row recovery.", element: ".docdb-panel" }
    ],
    latencies: [
      { lbl: 'On-demand Snapshot', cls: 'lm', max: 15 },
      { lbl: 'HLC Filter Apply', cls: 'll', max: 5 },
      { lbl: 'Total RTO', cls: 'll', max: 20 }
    ],
    init: (ctx) => {
      showDocdbPanel(true);
      S._docdb = { memtable: [], ssts: [], snapshotSsts: [], snapshotId: 'pitr-snapshots' };
      setDocdbOp('Tablet-1 · orders shard · 0x0000–0x5554 · PITR retention: 24h');
      S._docdb.ssts = [
        { layer: 0, entries: [
          { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' },
          { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449' }
        ]}
      ];
      renderDocdbPanel();
      ctx.pitrViz({ snapshots: [{label:'Snap-1',time:'09:00',pct:15}], walPct: 18, phase: 'running', retentionHours: 24 });
    },
    steps: [
      {
        label: '1. PITR Enabled — LSM History Window Extended',
        desc: 'Enabling PITR sets <code>--timestamp_history_retention_interval_sec=86400</code>. DocDB\'s compaction is told to retain all MVCC versions younger than 24h — normally old versions are GC\'d to reclaim space. Because DocDB is an LSM-tree, every write is already a new append with an HLC timestamp; no in-place updates ever happen. Extending the retention window simply prevents compaction from discarding those old appended versions.',
        action: async (ctx) => {
          ctx.pitrViz({ snapshots: [{label:'Snap-1',time:'09:00',pct:15}], walPct: 30, phase: 'running', retentionHours: 24 });
          S._docdb.ssts = [
            { layer: 0, entries: [
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89 (latest)' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2 — price update)' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1 — original, retained by PITR)' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' }
            ]}
          ];
          renderDocdbPanel();
          addLog('PITR enabled · --timestamp_history_retention_interval_sec=86400', 'lh');
          addLog('Compaction GC horizon pinned 24h back · all MVCC versions retained in SSTs', 'ls');
        }
      },
      {
        label: '2. MVCC Versions Accumulate — Scheduled Snapshots Taken',
        desc: 'As writes flow in, DocDB appends a new HLC-stamped entry for every INSERT, UPDATE, and DELETE. With PITR enabled all versions co-exist in the SST files. <b>Scheduled distributed snapshots</b> (Snap-1 @ 09:00, Snap-2 @ 11:00) capture a consistent point-in-time state across all tablets by hard-linking SST files into a snapshot directory — zero data copy, immutable references. These scheduled snapshots are not the restore base themselves; the <b>on-demand snapshot taken at restore initiation</b> will be.',
        action: async (ctx) => {
          ctx.pitrViz({ snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}], walPct: 63, phase: 'running', retentionHours: 24 });
          S._docdb.ssts = [
            { name: 'SST (000010.sst)', entries: [
              { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1)' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' }
            ]},
            { name: 'SST (000011.sst)', entries: [
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2 update)' }
            ]}
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-001/tablet-1/  ← Snap-1 @ 09:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode as live SST', value: 'id=101, id=102(T1) · orders as of 09:00' }
            ]},
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1) — unchanged' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode as live SST', value: 'id=102(T2), id=103, id=104 · 10:05–11:20 writes' }
            ]}
          ];
          renderDocdbPanel();
          addLog('000010.sst + 000011.sst · 5 HLC-stamped MVCC versions · GC suppressed for 24h', 'ls');
          addLog('Snap-1 @ 09:00 hardlinks 000010.sst · Snap-2 @ 11:00 hardlinks 000010+000011', 'lh');
        }
      },
      {
        label: '3. Accidental DELETE at 11:23 — Delta Writes Continue',
        desc: 'A developer accidentally runs <code>DELETE FROM orders</code> at 11:23, removing all rows. DocDB appends tombstones (HLC=11:23:07) to a new SST file — the data in 000010.sst and 000011.sst is untouched on disk. <b>Critically: no new scheduled snapshot is taken</b>. Meanwhile a new order (id=105) arrives at 11:24 — the system is still accepting writes because the outage is not yet detected. 3 minutes pass before the DBA realizes the issue and initiates PITR restore.',
        action: async (ctx) => {
          addLog('DELETE FROM orders at 11:23:07 → tombstones appended to 000012.sst', 'le');
          S._docdb.ssts = [
            { name: 'SST (000012.sst) ← anomaly', entries: [
              { display: 'orders/id=101', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=102', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=103', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=104', type: 'TOMBSTONE', hlc: '11:23:07', value: '' }
            ]},
            { name: 'SST (000011.sst)', entries: [
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2)' }
            ]},
            { name: 'SST (000010.sst)', entries: [
              { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1)' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' }
            ]}
          ];
          S._docdb.memtable = [
            { display: 'orders/id=105 ⚠ DELTA', type: 'WRITE', hlc: '11:24:30', value: 'Eve · Headphones · $79 · post-anomaly write · WILL BE LOST on restore' }
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-001/tablet-1/  ← Snap-1 @ 09:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' }
            ]},
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104' }
            ]}
          ];
          renderDocdbPanel();
          await ctx.delay(400);
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83,
            anomaly: { time:'11:23 DELETE', pct:70 },
            phase: 'running',
            retentionHours: 24
          });
          addLog('No scheduled snapshot exists at 11:26 — on-demand snapshot will be taken at restore initiation', 'lw');
          addLog('id=105 (Eve · Headphones) placed at 11:24:30 · delta write in limbo', 'lw');
        }
      },
      {
        label: '4. PITR Restore — On-demand Snapshot + HLC Flashback',
        desc: '<b>DBA initiates PITR restore at 11:26.</b> Because no scheduled snapshot exists at this time, YugabyteDB first takes an <b>on-demand snapshot (Snap-3 @ 11:26)</b> — this captures everything: 000010, 000011, 000012 (tombstones), and memtable flushed to 000013 (delta write id=105). <b>HLC flashback:</b> DocDB applies read filter = T_restore=11:22:59 inside Snap-3. The tombstones (HLC 11:23:07) and the delta write id=105 (HLC 11:24:30) both have HLC &gt; filter → filtered out. Orders id=101–104 (HLC ≤ 11:20) are visible again. <b>id=105 is permanently lost</b> — it was in the snapshot but beyond the filter.',
        action: async (ctx) => {
          addLog('PITR restore initiated at 11:26 · no scheduled snapshot found near T_restore', 'lw');
          addLog('Taking on-demand snapshot Snap-3 @ 11:26 (flushes memtable → 000013.sst)…', 'lw');
          // Phase 1: on-demand snapshot taken — show raw contents before HLC filter
          S._docdb.memtable = [];
          S._docdb.ssts = [
            { name: 'SST (Snap-3 raw contents — pre-flashback)', entries: [
              { display: 'orders/id=105 (delta write)', type: 'WRITE', hlc: '11:24:30', value: 'Eve · Headphones · $79 · captured in Snap-3' },
              { display: 'orders/id=101', type: 'TOMBSTONE', hlc: '11:23:07', value: 'DELETE tombstone captured in Snap-3' },
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399' }
            ]}
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-001/tablet-1/  ← Snap-1 @ 09:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' }
            ]},
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104' }
            ]},
            { folder: 'snapshots/snap-20240518-003/tablet-1/  ← ON-DEMAND RESTORE BASE @ 11:26 ✓', entries: [
              { display: 'hardlink: 000013.sst (delta write)', type: 'WRITE', hlc: 'HLC 11:24:30', value: 'id=105 Eve · Headphones · $79 · in snapshot, awaiting filter' },
              { display: 'hardlink: 000012.sst (tombstones)', type: 'TOMBSTONE', hlc: 'HLC 11:23:07', value: 'DELETE tombstones · in snapshot, awaiting filter' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: 'HLC 11:20:00', value: 'id=102(T2), id=103, id=104' },
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: 'HLC 09:00:01', value: 'id=101, id=102(T1)' }
            ]}
          ];
          renderDocdbPanel();
          ctx.pitrViz({
            snapshots: [
              {label:'Snap-1',time:'09:00',pct:15},
              {label:'Snap-2',time:'11:00',pct:60},
              {label:'Snap-3',time:'11:26',pct:83, onDemand:true}
            ],
            walPct: 83,
            anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_restore = 11:22:59', pct:69 },
            phase: 'restoring',
            retentionHours: 24
          });
          addLog('Snap-3 (on-demand) hardlinks 000010+000011+000012+000013 · all 4 SSTs captured', 'lh');
          await ctx.delay(900);
          // Phase 2: HLC flashback applied — filter removes tombstones and delta write
          addLog('Applying HLC read filter = 11:22:59 inside Snap-3…', 'lw');
          await ctx.delay(600);
          S._docdb.ssts = [
            { name: 'SST (post-HLC-filter view · HLC ≤ 11:22:59)', entries: [
              { display: 'HLC read filter active: ≤ 11:22:59', type: 'WRITE', hlc: '← filter', value: 'DocDB reader skips any version with HLC > 11:22:59' },
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39 · HLC < filter → visible ✓' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89 · visible ✓' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 · visible ✓' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299 · visible ✓' }
            ]}
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-001/tablet-1/  ← Snap-1 @ 09:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' }
            ]},
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104' }
            ]},
            { folder: 'snapshots/snap-20240518-003/tablet-1/  ← ON-DEMAND RESTORE BASE @ 11:26 ✓', entries: [
              { display: 'hardlink: 000013.sst (delta write)', type: 'TOMBSTONE', hlc: 'HLC 11:24:30 > filter', value: 'id=105 Eve · Headphones · $79 → FILTERED OUT ✕ (delta lost)' },
              { display: 'hardlink: 000012.sst (tombstones)', type: 'TOMBSTONE', hlc: 'HLC 11:23:07 > filter', value: 'DELETE tombstones → FILTERED OUT ✕' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: 'HLC ≤ 11:22:59', value: 'id=102(T2), id=103, id=104 → visible ✓' },
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: 'HLC ≤ 11:22:59', value: 'id=101, id=102(T1) → visible ✓' }
            ]}
          ];
          renderDocdbPanel();
          ctx.pitrViz({
            snapshots: [
              {label:'Snap-1',time:'09:00',pct:15},
              {label:'Snap-2',time:'11:00',pct:60},
              {label:'Snap-3',time:'11:26',pct:83, onDemand:true}
            ],
            walPct: 83,
            anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_restore = 11:22:59', pct:69 },
            phase: 'complete',
            retentionHours: 24
          });
          addLog('HLC filter = 11:22:59 · 000012 tombstones + 000013 delta → both filtered ✕', 'lw');
          addLog('✓ 4 orders recovered · id=105 (delta) permanently lost · no WAL replay', 'ls');
        }
      },
      {
        label: '5. Delta Loss Window — Clone as Mitigation',
        desc: '<b>PITR trade-off:</b> order id=105 (placed at 11:24 — after the accidental delete but before restore) is permanently lost. PITR rewinds the <i>entire</i> DB — any write inside the delta window (11:22:59 → 11:26) is gone. <b>Clone mitigation:</b> instead of PITR, fork a clone from Snap-2 (pre-anomaly), <code>SELECT</code> the deleted rows (id=101–104) from the clone, then <code>INSERT</code> them back into production. Production never rewound — id=105 is preserved. Zero delta loss.',
        action: async (ctx) => {
          ctx.pitrViz({
            snapshots: [
              {label:'Snap-1',time:'09:00',pct:15},
              {label:'Snap-2',time:'11:00',pct:60},
              {label:'Snap-3',time:'11:26',pct:83, onDemand:true}
            ],
            walPct: 83,
            anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_restore = 11:22:59', pct:69 },
            phase: 'complete',
            retentionHours: 24
          });
          S._docdb.ssts = [
            { name: 'SST (PITR result · HLC filter ≤ 11:22:59 · 4 orders visible)', entries: [
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39 · restored ✓' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89 · restored ✓' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 · restored ✓' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299 · restored ✓' }
            ]}
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-001/tablet-1/  ← Snap-1 @ 09:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' }
            ]},
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1)' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104' }
            ]},
            { folder: '✕ delta loss — id=105 (Eve · Headphones · $79) · HLC 11:24:30 → filtered by HLC read filter · permanently gone', entries: [
              { display: 'orders/id=105 was in Snap-3 (000013.sst)', type: 'TOMBSTONE', hlc: 'HLC 11:24:30 > T_restore', value: 'PITR cannot recover delta writes · use Clone for zero-loss surgical recovery' }
            ]}
          ];
          renderDocdbPanel();
          addLog('⚠ PITR: id=105 delta write permanently lost — entire DB rewound to 11:22:59', 'lw');
          addLog('Clone alternative: fork Snap-2 → SELECT id=101–104 → INSERT into production', 'lw');
          addLog('Clone keeps id=105 intact · production never rewound · zero delta loss', 'ls');
        }
      }
    ]
  },

  "dm-clone": {
    group: "Data Management", icon: "🔀", sortOrder: 4,
    name: 'DB Clone', title: 'Database Clone — Surgical Recovery',
    subtitle: 'Same recovery target as PITR · isolated clone · zero delta loss',
    desc: 'Same scenario as PITR: <code>DELETE FROM orders</code> at 11:23 wipes id=101–104; a delta write (id=105, Eve) arrives at 11:24. Both PITR and Clone target the <b>same recovery time: T = 11:22:59</b>. The difference is scope: <b>PITR</b> rewinds the entire production DB to 11:22:59 — id=105 permanently lost. <b>Clone</b> creates an <i>isolated</i> cluster at 11:22:59 (YB internally uses Snap-2 + MVCC history up to T_clone) — production keeps running and keeps id=105. A <code>SELECT</code> on the clone finds the deleted rows; an <code>INSERT</code> puts them back into production. All 5 orders intact. No rewind, no downtime, zero delta loss.',
    snapshotVizPanel: true,
    guidedTour: [
      { text: "The timeline is identical to PITR — same snapshots, same anomaly at 11:23, same T_clone = 11:22:59. The key difference: <b>no red delta zone</b>. The clone is created in isolation; production is never rewound.", element: ".snap-viz-panel" },
      { text: "The DocDB panel shows <b>production SSTs</b> (with tombstones + delta id=105) on top and the <b>clone SSTs</b> (green) below — the clone is at T_clone=11:22:59, sees id=101–104 cleanly with no tombstones.", element: ".docdb-panel" },
      { text: "Step 5 shows the final state: new <b>SST 000013.sst</b> contains the restored rows. The tombstones in 000012.sst are shadowed by the newer HLC. id=105 (delta) is preserved — PITR would have lost it.", element: ".docdb-panel" }
    ],
    latencies: [
      { lbl: 'Clone Bootstrap', cls: 'lm', max: 120 },
      { lbl: 'SELECT from clone', cls: 'll', max: 5 },
      { lbl: 'INSERT to prod', cls: 'll', max: 3 }
    ],
    init: (ctx) => {
      showDocdbPanel(true);
      S._docdb = { memtable: [], ssts: [], snapshotSsts: [] };
      setDocdbOp('Tablet-1 · orders shard · 0x0000–0x5554 (SOURCE — production leader)');
      S._docdb.ssts = [
        { name: 'SST (000010.sst)', entries: [
          { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1)' },
          { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' }
        ]},
        { name: 'SST (000011.sst)', entries: [
          { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
          { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
          { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2 update)' }
        ]}
      ];
      renderDocdbPanel();
      ctx.pitrViz({ snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}], walPct: 63, phase: 'running', retentionHours: 24,
        customPhaseLabels: { running: '🔄 Production live · target T_clone = 11:22:59' } });
    },
    steps: [
      {
        label: '1. Production Live — Recovery Target T_clone = 11:22:59',
        desc: 'The orders table has 4 rows (id=101–104). Scheduled snapshots are running — Snap-1 @ 09:00 and Snap-2 @ 11:00. The recovery target is <b>T_clone = 11:22:59</b> — the same timestamp PITR would restore to. YB will use Snap-2 + MVCC history up to that point to bootstrap the clone. The clone cluster does not exist yet.',
        action: async (ctx) => {
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 63, phase: 'running', retentionHours: 24,
            customPhaseLabels: { running: '🔄 Production live · target T_clone = 11:22:59' }
          });
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00 (basis for T_clone = 11:22:59)', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1) · pre-anomaly ✓' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104 · pre-anomaly ✓' }
            ]}
          ];
          renderDocdbPanel();
          addLog('Snap-1 @ 09:00 · Snap-2 @ 11:00 · 4 orders in production · all healthy', 'ls');
          addLog('Recovery target: T_clone = 11:22:59 · YB will use Snap-2 + MVCC to that point', 'lh');
        }
      },
      {
        label: '2. Anomaly — DELETE FROM orders at 11:23 + Delta Write Arrives',
        desc: 'A developer accidentally runs <code>DELETE FROM orders</code> at 11:23 — tombstones appended to 000012.sst. Critically, order id=105 (Eve · Headphones) arrives at 11:24 as a <b>legitimate delta write</b>. <b>PITR</b> would take an on-demand snapshot at 11:26 and rewind to 11:22:59 — losing id=105. <b>Clone</b> avoids this entirely: production keeps running, id=105 stays, and we fork the clone from Snap-2 to recover the deleted rows.',
        action: async (ctx) => {
          addLog('DELETE FROM orders at 11:23:07 → tombstones in 000012.sst', 'le');
          S._docdb.ssts = [
            { name: 'SST (000012.sst) ← DELETE anomaly', entries: [
              { display: 'orders/id=101', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=102', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=103', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=104', type: 'TOMBSTONE', hlc: '11:23:07', value: '' }
            ]},
            { name: 'SST (000011.sst)', entries: [
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2)' }
            ]},
            { name: 'SST (000010.sst)', entries: [
              { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1)' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299' }
            ]}
          ];
          S._docdb.memtable = [
            { display: 'orders/id=105 ⚠ DELTA', type: 'WRITE', hlc: '11:24:30', value: 'Eve · Headphones · $79 · PITR loses this · Clone keeps this ✓' }
          ];
          S._docdb.snapshotSsts = [
            { folder: 'snapshots/snap-20240518-002/tablet-1/  ← Snap-2 @ 11:00 (basis for T_clone = 11:22:59)', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=101, id=102(T1) — NO tombstones ✓' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: '→ same inode', value: 'id=102(T2), id=103, id=104 — NO tombstones ✓' }
            ]}
          ];
          renderDocdbPanel();
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83, anomaly: { time:'11:23 DELETE', pct:70 }, phase: 'running', retentionHours: 24,
            customPhaseLabels: { running: '⚠ Anomaly detected at 11:23 · choosing Clone over PITR' }
          });
          addLog('id=105 (Eve · Headphones · $79) placed at 11:24 — delta write, must not be lost', 'lw');
          addLog('Decision: Clone at T_clone = 11:22:59 — production never rewound, id=105 preserved', 'lh');
        }
      },
      {
        label: '3. Create Clone at T_clone = 11:22:59 — Production Keeps Running',
        desc: '<code>yb-admin create_database_clone --restore-at=11:22:59</code> provisions a new cluster (C1/C2/C3). YB internally uses <b>Snap-2 + MVCC history up to T_clone = 11:22:59</b> — the same recovery timestamp PITR targets. <b>Zero data copied</b> — the clone shares immutable SST hardlinks. The HLC filter (≤ 11:22:59) is applied: tombstones written at 11:23:07 are invisible in the clone. Production (T1/T2/T3) keeps running with id=105 intact.',
        action: async (ctx) => {
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83, anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_clone = 11:22:59', pct:69 },
            phase: 'restoring', retentionHours: 24,
            customPhaseLabels: { restoring: '🔁 Clone bootstrapping at T_clone = 11:22:59…' }
          });
          S._docdb.snapshotSsts = [
            { folder: 'CLONE cluster · clone-env-001/tablet-1/  ← T_clone = 11:22:59 (Snap-2 + MVCC ≤ 11:22:59)', entries: [
              { display: 'hardlink: 000010.sst', type: 'WRITE', hlc: 'HLC ≤ 11:22:59', value: 'id=101 Alice · id=102 Bob(T1) · pre-DELETE state ✓ · no tombstones' },
              { display: 'hardlink: 000011.sst', type: 'WRITE', hlc: 'HLC ≤ 11:22:59', value: 'id=102 Bob(T2) · id=103 Carol · id=104 Dan · pre-DELETE state ✓ · no tombstones' }
            ]}
          ];
          renderDocdbPanel();
          addLog('Clone C1/C2/C3 created at T_clone = 11:22:59 · zero bytes copied · SSTs hardlinked', 'ls');
          addLog('Production T1/T2/T3 still live · id=105 (Eve) written and safe in prod MemTable', 'ls');
        }
      },
      {
        label: '4. SELECT Deleted Rows from Clone',
        desc: 'The clone is fully up. Query it: <code>SELECT * FROM orders WHERE id IN (101,102,103,104)</code>. Because the clone is at T_clone = 11:22:59 (before the DELETE at 11:23), it returns all 4 rows — tombstones written at 11:23:07 are past the HLC filter and invisible. Meanwhile, production is still running with id=105 safely in its MemTable — untouched throughout this process.',
        action: async (ctx) => {
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83, anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_clone = 11:22:59', pct:69 },
            phase: 'restoring', retentionHours: 24,
            customPhaseLabels: { restoring: '🔎 Querying clone at T_clone = 11:22:59 · SELECT id=101–104…' }
          });
          S._docdb.snapshotSsts = [
            { folder: 'CLONE · SELECT result — all 4 deleted rows found ✓', entries: [
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299 · found in clone ✓' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 · found in clone ✓' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89 · found in clone ✓' },
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39 · found in clone ✓' }
            ]}
          ];
          renderDocdbPanel();
          addLog('SELECT id IN (101,102,103,104) on clone → 4 rows returned · no tombstones', 'ls');
          addLog('Production id=105 (Eve) still alive in prod MemTable — untouched', 'lh');
        }
      },
      {
        label: '5. Surgical INSERT → MemTable → Flush to SST 000013',
        desc: '<code>INSERT INTO orders SELECT * FROM clone.orders WHERE id IN (101,102,103,104)</code> first lands in the <b>MemTable</b> (in-memory), then flushes to a new <b>SST (000013.sst)</b> with fresh HLC timestamps (11:27:xx). In DocDB\'s LSM-tree, the reader always returns the version with the <b>highest HLC per key</b> — so the new WRITEs in 000013.sst shadow the tombstones in 000012.sst (HLC 11:23:07). id=105 (Eve) was in the MemTable throughout — never touched. Clone ends with all 5 orders intact.',
        action: async (ctx) => {
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83, anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_clone = 11:22:59', pct:69 },
            phase: 'restoring', retentionHours: 24,
            customPhaseLabels: { restoring: '🔁 INSERT recovered rows → landing in MemTable…' }
          });
          // Phase 1: INSERT lands in MemTable
          S._docdb.memtable = [
            { display: 'orders/id=104 [RECOVERING]', type: 'WRITE', hlc: '11:27:05', value: 'Dan · Mouse · $39 · from clone → MemTable' },
            { display: 'orders/id=103 [RECOVERING]', type: 'WRITE', hlc: '11:27:04', value: 'Carol · Keyboard · $89 · from clone → MemTable' },
            { display: 'orders/id=102 [RECOVERING]', type: 'WRITE', hlc: '11:27:03', value: 'Bob · Monitor · $399 · from clone → MemTable' },
            { display: 'orders/id=101 [RECOVERING]', type: 'WRITE', hlc: '11:27:02', value: 'Alice · Laptop · $1,299 · from clone → MemTable' },
            { display: 'orders/id=105 [DELTA ✓]', type: 'WRITE', hlc: '11:24:30', value: 'Eve · Headphones · $79 · in prod throughout · unaffected' }
          ];
          renderDocdbPanel();
          addLog('INSERT id=101–104 → MemTable · HLC 11:27:xx stamped', 'lh');
          await ctx.delay(1100);
          // Phase 2: MemTable flushes to SST 000013
          ctx.pitrViz({
            snapshots: [{label:'Snap-1',time:'09:00',pct:15},{label:'Snap-2',time:'11:00',pct:60}],
            walPct: 83, anomaly: { time:'11:23 DELETE', pct:70 },
            deltaZone: { from:70, to:83 },
            cursor: { time:'T_clone = 11:22:59', pct:69 },
            phase: 'complete', retentionHours: 24, fullRecovery: true,
            customPhaseLabels: { complete: '✓ MemTable flushed → SST 000013.sst · all 5 orders intact' }
          });
          S._docdb.memtable = [];
          S._docdb.ssts = [
            { name: 'SST (000013.sst) ← flushed from MemTable · newest HLC wins', entries: [
              { display: 'orders/id=105 [DELTA ✓]', type: 'WRITE', hlc: '11:24:30', value: 'Eve · Headphones · $79 · flushed with batch · PITR loses this · Clone keeps ✓' },
              { display: 'orders/id=104 [RESTORED]', type: 'WRITE', hlc: '11:27:05', value: 'Dan · Mouse · $39 · HLC 11:27 > tombstone 11:23 → live ✓' },
              { display: 'orders/id=103 [RESTORED]', type: 'WRITE', hlc: '11:27:04', value: 'Carol · Keyboard · $89 · HLC 11:27 > tombstone 11:23 → live ✓' },
              { display: 'orders/id=102 [RESTORED]', type: 'WRITE', hlc: '11:27:03', value: 'Bob · Monitor · $399 · HLC 11:27 > tombstone 11:23 → live ✓' },
              { display: 'orders/id=101 [RESTORED]', type: 'WRITE', hlc: '11:27:02', value: 'Alice · Laptop · $1,299 · HLC 11:27 > tombstone 11:23 → live ✓' }
            ]},
            { name: 'SST (000012.sst) — tombstones shadowed by 000013.sst', entries: [
              { display: 'orders/id=104 → shadowed', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=103 → shadowed', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=102 → shadowed', type: 'TOMBSTONE', hlc: '11:23:07', value: '' },
              { display: 'orders/id=101 → shadowed', type: 'TOMBSTONE', hlc: '11:23:07', value: '' }
            ]},
            { name: 'SST (000011.sst)', entries: [
              { display: 'orders/id=104', type: 'WRITE', hlc: '11:20:00', value: 'Dan · Mouse · $39' },
              { display: 'orders/id=103', type: 'WRITE', hlc: '10:15:00', value: 'Carol · Keyboard · $89' },
              { display: 'orders/id=102', type: 'WRITE', hlc: '10:05:00', value: 'Bob · Monitor · $399 (T2)' }
            ]},
            { name: 'SST (000010.sst)', entries: [
              { display: 'orders/id=102', type: 'WRITE', hlc: '09:00:02', value: 'Bob · Monitor · $449 (T1)' },
              { display: 'orders/id=101', type: 'WRITE', hlc: '09:00:01', value: 'Alice · Laptop · $1,299 (T1)' }
            ]}
          ];
          S._docdb.snapshotSsts = [
            { folder: '✓ Clone at T_clone = 11:22:59 — source of recovered rows', entries: [
              { display: 'hardlink: 000010.sst + 000011.sst', type: 'WRITE', hlc: 'HLC ≤ 11:22:59', value: 'id=101–104 SELECTed from here · flushed to 000013.sst ✓' }
            ]},
            { folder: '✕ PITR delta loss window — Clone avoids this entirely', entries: [
              { display: 'orders/id=105 Eve · Headphones · $79', type: 'WRITE', hlc: '11:24:30 · always in prod', value: 'PITR HLC filter would discard this · Clone never touches production SSTs ✓' }
            ]}
          ];
          renderDocdbPanel();
          addLog('MemTable flushed → SST (000013.sst) · HLC 11:27:xx > tombstone HLC 11:23:07', 'ls');
          addLog('000012.sst tombstones still on disk · shadowed by 000013.sst · GC removes at compaction', 'lh');
          addLog('✓ 5 orders in production · clone decommissioned · zero delta loss · zero downtime', 'ls');
        }
      }
    ]
  },

  "dm-timetravel": {
    group: "Data Management", icon: "⏮️", sortOrder: 5,
    name: 'Time Travel Queries', title: 'Time Travel Queries',
    subtitle: 'AS OF SYSTEM TIME — query any past snapshot',
    desc: 'YugabyteDB supports AS OF SYSTEM TIME queries: read data exactly as it existed at any past HLC timestamp within the retention window. No restore needed — the historical view is served live from MVCC storage.',
    snapshotVizPanel: true,
    guidedTour: [
      { text: "The <b>MVCC chain panel</b> shows multiple versions of the same key at different HLC timestamps. Older versions are never overwritten — new writes create new entries.", element: ".snap-viz-panel" },
      { text: "The <b>DocDB panel</b> is an LSM+MVCC store. Each WRITE entry carries a key + HLC timestamp. An AS OF read simply ignores entries with HLC > query_time.", element: ".docdb-panel" },
      { text: "Time travel is the lightest recovery tool: no restore, no restart — query the past, then <code>INSERT ... SELECT</code> back. RPO and RTO are both near-zero.", element: ".snap-viz-panel" }
    ],
    latencies: [
      { lbl: 'Live Read', cls: 'll', max: 5 },
      { lbl: 'AS OF Read', cls: 'll', max: 8 },
      { lbl: 'MVCC GC Lag', cls: 'lm', max: 300 }
    ],
    init: (ctx) => {
      showDocdbPanel(true);
      S._docdb = { memtable: [], ssts: [], snapshotSsts: [] };
      setDocdbOp('Tablet-1 · products shard · 0x0000–0xFFFF (leader on TServer-1)');
      renderDocdbPanel();
      ctx.ttViz({ versions: [], asCursor: 'current', phase: 'live' });
    },
    steps: [
      {
        label: '1. Initial Writes (T1 = 10:00)',
        desc: 'Three products are inserted. Each write lands in the MemTable with an HLC timestamp. MVCC never overwrites existing data — new timestamps create new entries below older ones in the LSM tree.',
        action: async (ctx) => {
          S._docdb.memtable = [
            { display: 'products/id=3', type: 'WRITE', hlc: '10:00:03', value: 'Widget C · Furniture · $199.99' },
            { display: 'products/id=2', type: 'WRITE', hlc: '10:00:02', value: 'Widget B · Electronics · $49.99' },
            { display: 'products/id=1', type: 'WRITE', hlc: '10:00:01', value: 'Widget A · Electronics · $29.99' }
          ];
          renderDocdbPanel();
          ctx.ttViz({
            versions: [
              { hlc: '10:00:01', key: 'id=1', value: 'Widget A · $29.99', active: true },
              { hlc: '10:00:02', key: 'id=2', value: 'Widget B · $49.99', active: true },
              { hlc: '10:00:03', key: 'id=3', value: 'Widget C · $199.99', active: true }
            ],
            asCursor: 'current (T1)',
            phase: 'live'
          });
          addLog('T1 = 10:00 · 3 rows inserted · HLC stamped per write', 'ls');
        }
      },
      {
        label: '2. Update + Delete at T2 (10:15)',
        desc: 'Widget A is deleted and Widget B gets a price cut. DocDB adds new MVCC entries (higher HLC) — the T1 versions remain in the LSM tree until MVCC GC runs. Both timestamps co-exist in storage.',
        action: async (ctx) => {
          S._docdb.ssts = [
            { layer: 0, entries: [
              { display: 'products/id=3', type: 'WRITE', hlc: '10:00:03', value: 'Widget C · Furniture · $199.99' },
              { display: 'products/id=2', type: 'WRITE', hlc: '10:00:02', value: 'Widget B · Electronics · $49.99 (T1)' },
              { display: 'products/id=1', type: 'WRITE', hlc: '10:00:01', value: 'Widget A · Electronics · $29.99 (T1)' }
            ]}
          ];
          S._docdb.memtable = [
            { display: 'products/id=2', type: 'WRITE', hlc: '10:15:01', value: 'Widget B · Electronics · $39.99 (T2 update)' },
            { display: 'products/id=1', type: 'WRITE', hlc: '10:15:00', value: 'DEL · Widget A discontinued (T2 delete)' }
          ];
          renderDocdbPanel();
          ctx.ttViz({
            versions: [
              { hlc: '10:15:01', key: 'id=2', value: 'Widget B · $39.99', active: true },
              { hlc: '10:15:00', key: 'id=1', value: 'Widget A', active: false, deleted: true },
              { hlc: '10:00:03', key: 'id=3', value: 'Widget C · $199.99', active: true },
              { hlc: '10:00:02', key: 'id=2', value: 'Widget B · $49.99 (T1)', active: false },
              { hlc: '10:00:01', key: 'id=1', value: 'Widget A · $29.99 (T1)', active: false }
            ],
            asCursor: 'current (T2)',
            phase: 'live'
          });
          addLog('T2 = 10:15 · Widget A deleted · Widget B: $49.99 → $39.99', 'ls');
          addLog('MVCC: T1 versions still in SST — not yet GC\'d', 'ls');
        }
      },
      {
        label: '3. AS OF T1 — Recover Deleted Row',
        desc: 'AS OF SYSTEM TIME \'10:00:03\' tells DocDB to read the version chain at HLC ≤ 10:00:03. Entries with higher HLC (T2 updates/deletes) are invisible. Widget A is alive again — no restore, no downtime.',
        action: async (ctx) => {
          ctx.ttViz({
            versions: [
              { hlc: '10:15:01', key: 'id=2', value: 'Widget B · $39.99', active: false },
              { hlc: '10:15:00', key: 'id=1', value: 'Widget A DEL', active: false },
              { hlc: '10:00:03', key: 'id=3', value: 'Widget C · $199.99', active: true },
              { hlc: '10:00:02', key: 'id=2', value: 'Widget B · $49.99', active: true },
              { hlc: '10:00:01', key: 'id=1', value: 'Widget A · $29.99', active: true }
            ],
            asCursor: "AS OF '10:00:03'",
            phase: 'asof'
          });
          addLog("AS OF SYSTEM TIME '10:00:03' → reads T1 snapshot", 'lh');
          addLog('3 rows returned · Widget A visible · T2 entries invisible to this query', 'ls');
          addLog('No restore · no downtime · live queries run in parallel', 'ls');
        }
      },
      {
        label: '4. Point Recovery — INSERT … SELECT',
        desc: 'Widget A is re-inserted into the live table using INSERT ... SELECT AS OF. This creates a new MVCC entry at the current HLC. DocDB now has Widget A at T1 (historical), deleted at T2, and re-inserted at T3.',
        action: async (ctx) => {
          S._docdb.memtable.unshift(
            { display: 'products/id=1', type: 'WRITE', hlc: '10:20:05', value: 'Widget A · Electronics · $29.99 (T3 re-insert)' }
          );
          renderDocdbPanel();
          ctx.ttViz({
            versions: [
              { hlc: '10:20:05', key: 'id=1', value: 'Widget A · $29.99 (re-inserted)', active: true },
              { hlc: '10:15:01', key: 'id=2', value: 'Widget B · $39.99', active: true },
              { hlc: '10:15:00', key: 'id=1', value: 'Widget A DEL (T2)', active: false, deleted: true },
              { hlc: '10:00:02', key: 'id=2', value: 'Widget B · $49.99 (T1)', active: false },
              { hlc: '10:00:01', key: 'id=1', value: 'Widget A · $29.99 (T1)', active: false }
            ],
            asCursor: 'current (T3)',
            phase: 'live'
          });
          addLog('INSERT INTO products SELECT * FROM products AS OF …', 'lh');
          addLog('Widget A re-inserted at T3=10:20:05 · 3 rows live · MVCC chain intact', 'ls');
        }
      },
      {
        label: '5. Concurrent Live + AS OF Reads',
        desc: 'A live read and an AS OF read run simultaneously — no locking, no blocking. MVCC isolation means each query sees exactly the right snapshot. The MVCC chain in DocDB serves both from the same physical storage.',
        action: async (ctx) => {
          ctx.ttViz({
            versions: [
              { hlc: '10:20:05', key: 'id=1', value: 'Widget A · $29.99', active: true },
              { hlc: '10:15:01', key: 'id=2', value: 'Widget B · $39.99', active: true },
              { hlc: '10:00:03', key: 'id=3', value: 'Widget C · $199.99', active: true },
              { hlc: '10:00:02', key: 'id=2', value: 'Widget B · $49.99 (T1, AS OF)', active: false },
              { hlc: '10:00:01', key: 'id=1', value: 'Widget A · $29.99 (T1, AS OF)', active: false }
            ],
            asCursor: "'10:00:03' (T1) — concurrent with live",
            phase: 'concurrent'
          });
          addLog('Live read (T3) + AS OF -5m read · concurrent · no locks', 'ls');
          addLog('MVCC GC controlled by --timestamp_history_retention_interval_sec', 'ls');
        }
      }
    ]
  },

  // ── CDC Logical Replication ────────────────────────────────────────────────

  "dm-cdc": {
    group: "Data Management", icon: "🔄", sortOrder: 6,
    name: 'CDC · Logical Replication',
    title: 'CDC · PostgreSQL Logical Replication',
    subtitle: 'CDC Service · Virtual WAL · walsender · Kafka',
    cdcPanel: true,
    desc: 'YugabyteDB CDC uses PostgreSQL logical replication protocol. A <b>CDC Service</b> polls each tablet WAL independently. A <b>Virtual WAL (VWAL)</b> assembles changes from all shards, assigns LSNs, and maintains commit-time order across tablets. The <b>walsender</b> streams BEGIN/CHANGE/COMMIT records via the <code>yboutput</code> plugin (default; <code>pgoutput</code> also supported) to consumers (Debezium, Kafka Connect, <code>pg_recvlogical</code>). Every replication slot tracks a <b>confirmed flush LSN</b> — WAL is retained until the consumer ACKs. Delivery guarantee: at-least-once, no gaps, commit-time ordered.',
    guidedTour: [
      { text: "The three <b>Tablet WAL</b> boxes at the top represent the CDC Service polling each tablet leader independently. Watch WAL records appear as writes land.", element: ".cdc-tablets-row" },
      { text: "The <b>Virtual WAL (VWAL)</b> is YugabyteDB's key differentiator — it assembles per-tablet changes into a single transactional stream and assigns LSNs. Note: YB LSNs are not byte offsets.", element: ".cdc-vwal-box" },
      { text: "The <b>walsender</b> process streams yboutput messages downstream (yboutput is the default plugin; pgoutput is also supported). The <b>confirmed flush LSN</b> tracks how far the consumer has committed — WAL before this point can be released.", element: ".cdc-walsender-box" }
    ],
    latencies: [
      { lbl: 'Slot creation',   cls: 'll', max: 20  },
      { lbl: 'Snapshot read',   cls: 'lm', max: 500 },
      { lbl: 'Stream lag',      cls: 'll', max: 50  }
    ],
    init: (ctx) => {
      ctx.cdcPanel({
        phase: 'idle',
        slotName: '—', pubName: '—',
        lsn: '—', confirmedLsn: '—',
        records: [], vwalAssembly: [],
        phaseLabel: '— run the steps to start CDC setup —'
      });
    },
    steps: [
      {
        label: '1. Create Publication & Replication Slot',
        desc: 'First, define which tables to stream with <code>CREATE PUBLICATION</code>. Then create a replication slot using <code>pg_create_logical_replication_slot(\'slot1\', \'yboutput\')</code> — <code>yboutput</code> is the default YugabyteDB output plugin; <code>pgoutput</code> is also supported. YugabyteDB returns a <b>snapshot_name</b> encoding the HybridTime consistent point — this is the anchor for the initial snapshot read.',
        action: async (ctx) => {
          addLog('CREATE PUBLICATION pub_orders FOR TABLE orders, users', 'li');
          await ctx.delay(400);
          addLog('Publication created: pub_orders (2 tables)', 'ls');
          await ctx.delay(300);
          addLog("SELECT * FROM pg_create_logical_replication_slot('slot1', 'yboutput')", 'li');
          await ctx.delay(500);
          addLog('Slot created: slot1 · snapshot_name=0000000100000001 (HybridTime anchor)', 'ls');
          addLog('WAL retention active from this point — slot lag begins accumulating', 'lw');
          ctx.cdcPanel({
            phase: 'idle',
            slotName: 'slot1', pubName: 'pub_orders',
            lsn: '0/1000000', confirmedLsn: '0/0',
            phaseLabel: '🔒 Slot created · snapshot_name = HybridTime consistent point',
            records: [
              { type: 'BEGIN', data: 'slot created · WAL retention starts', lsn: '0/1000000' },
            ],
            vwalAssembly: [
              { lsn: '0/1000000', type: 'BEGIN', data: 'slot boundary established' },
            ]
          });
        }
      },
      {
        label: '2. Snapshot Phase — Initial Table Read at HybridTime',
        desc: 'Before streaming begins, the consumer reads the initial table state at the <b>HybridTime anchor T₀</b> returned with the slot (<code>snapshot_name</code>). All rows are read via <code>SET LOCAL yb_read_time TO \'&lt;HybridTime&gt; ht\'</code> — a consistent point-in-time view with no partial rows. Crucially, <b>while the snapshot is being read</b>, live writes continue and their WAL is buffered after T₀. When the snapshot completes, streaming picks up from exactly T₀ — <b>no gap, no overlap</b>.',
        action: async (ctx) => {
          addLog('Consumer: reading initial snapshot at HybridTime anchor T₀', 'li');
          // walBuffered grows independently — simulates live writes during snapshot read
          const walPerStep = [0, 5, 11, 18, 26, 32];
          ctx.cdcPanel({
            phase: 'snapshot', snapshotPct: 0, walBufferedKb: 0,
            snapshotAnchorLsn: '0/1000050',
            slotName: 'slot1', pubName: 'pub_orders',
            lsn: '0/1000000', confirmedLsn: '0/0',
            phaseLabel: '📸 Snapshot Phase — reading all rows as-of T₀',
            records: [{ type: 'BEGIN', data: 'snapshot read starting…', lsn: '0/1000000' }],
            vwalAssembly: [{ lsn: '0/1000000', type: 'BEGIN', data: 'snapshot boundary — T₀' }]
          });
          for (let step = 0; step <= 5; step++) {
            const pct = step * 20;
            const walKb = walPerStep[step];
            await ctx.delay(380);
            const recs = [{ type: 'BEGIN', data: 'snapshot read', lsn: '0/1000000' }];
            if (pct >= 20)  recs.push({ type: 'CHANGE', table: 'orders', data: 'id=1 · amount=299.00', lsn: '0/1000010', tablet: 1, fresh: pct === 20 });
            if (pct >= 40)  recs.push({ type: 'CHANGE', table: 'orders', data: 'id=2 · amount=150.00', lsn: '0/1000020', tablet: 2, fresh: pct === 40 });
            if (pct >= 60)  recs.push({ type: 'CHANGE', table: 'users',  data: 'id=1 · name=Alice',    lsn: '0/1000030', tablet: 1, fresh: pct === 60 });
            if (pct >= 80)  recs.push({ type: 'CHANGE', table: 'users',  data: 'id=2 · name=Bob',      lsn: '0/1000040', tablet: 3, fresh: pct === 80 });
            if (pct >= 100) recs.push({ type: 'COMMIT', data: 'snapshot complete · 4 rows', lsn: '0/1000050', fresh: true });
            ctx.cdcPanel({
              phase: 'snapshot', snapshotPct: pct, walBufferedKb: walKb,
              snapshotAnchorLsn: '0/1000050',
              slotName: 'slot1', pubName: 'pub_orders',
              lsn: '0/1000050', confirmedLsn: '0/0',
              phaseLabel: pct < 100
                ? `📸 Snapshot ${pct}% · WAL buffering ${walKb} KB after T₀`
                : `📸 Snapshot complete · ${walKb} KB buffered · handoff to streaming`,
              records: recs, vwalAssembly: recs.map(r => ({ ...r })),
              tabletHighlight: pct < 60 ? 0 : pct < 80 ? 2 : -1
            });
            if (pct < 100) addLog(`Snapshot: ${pct}% · live writes buffering ${walKb} KB after T₀`, '');
          }
          addLog('Snapshot complete · 32 KB buffered since T₀ · streaming will replay from T₀ LSN', 'ls');
        }
      },
      {
        label: '3. Streaming — CDC Service → VWAL → walsender → Kafka',
        desc: 'Streaming picks up from exactly <b>T₀</b> — the HybridTime anchor set at slot creation. The first records streamed are the <b>32 KB buffered during snapshot</b> (writes that landed after T₀ while the snapshot was being read). Once those are replayed and ACKed, the consumer is at the live frontier. From there, the <b>CDC Service</b> polls each tablet leader WAL independently, the <b>VWAL</b> assembles and globally orders changes, and <b>walsender</b> encodes via <code>yboutput</code> and streams downstream — no gap from snapshot, no duplicates.',
        action: async (ctx) => {
          // Show handoff moment: replaying 32 KB buffered since T₀
          // Drain the 32 KB buffer first: 32→24→16→8→0
          addLog('Streaming started · replaying 32 KB WAL buffered since T₀', 'li');
          for (let rem = 32; rem >= 0; rem -= 8) {
            ctx.cdcPanel({
              phase: 'streaming', snapshotPct: 100, walBufferedKb: rem,
              snapshotAnchorLsn: '0/1000050',
              slotName: 'slot1', pubName: 'pub_orders',
              lsn: '0/1000050', confirmedLsn: '0/1000050',
              phaseLabel: rem > 0
                ? `⚡ Replaying buffered WAL — ${rem} KB remaining from T₀`
                : '🟢 Buffer cleared · streaming live from frontier',
              records: [{ type: 'COMMIT', data: 'snapshot complete · 4 rows', lsn: '0/1000050' }],
              vwalAssembly: [{ lsn: '0/1000050', type: 'COMMIT', data: `snapshot boundary · ${rem > 0 ? rem + ' KB remaining' : 'buffer clear'}`, fresh: rem === 32 }],
              tabletHighlight: -1
            });
            if (rem > 0) addLog(`Replaying buffered WAL: ${rem} KB remaining`, '');
            await ctx.delay(420);
          }
          addLog('Buffer cleared · now streaming live changes from frontier', 'ls');
          const txns = [
            { id: 'TX-A', table: 'orders', rows: [
              { data: 'INSERT id=10 · amount=499.00', tablet: 1 },
              { data: 'INSERT id=11 · amount=89.50',  tablet: 2 },
            ]},
            { id: 'TX-B', table: 'users', rows: [
              { data: 'UPDATE id=1 · email=alice@co', tablet: 1 },
            ]},
            { id: 'TX-C', table: 'orders', rows: [
              { data: 'DELETE id=2',                  tablet: 3 },
              { data: 'INSERT id=12 · amount=210.00', tablet: 2 },
            ]},
          ];
          let lsnCounter = 0x1000060;
          const allRecords = [
            { type: 'COMMIT', data: 'snapshot complete', lsn: '0/1000050' },
          ];
          const vwalAll = [...allRecords];
          for (const tx of txns) {
            const lsnHex = n => '0/' + n.toString(16).toUpperCase();
            addLog(`TX ${tx.id}: CDC Service detecting changes on tablets`, 'li');
            const beginLsn = lsnHex(lsnCounter++);
            allRecords.push({ type: 'BEGIN', data: tx.id, lsn: beginLsn });
            vwalAll.push({ lsn: beginLsn, type: 'BEGIN', data: tx.id, fresh: true });
            ctx.cdcPanel({
              phase: 'streaming', slotName: 'slot1', pubName: 'pub_orders',
              lsn: beginLsn, confirmedLsn: lsnHex(lsnCounter - 5),
              phaseLabel: '🟢 Streaming — CDC Service → VWAL → walsender → Kafka',
              records: [...allRecords], vwalAssembly: [...vwalAll],
              tabletHighlight: tx.rows[0].tablet - 1
            });
            await ctx.delay(400);
            for (const row of tx.rows) {
              const rowLsn = lsnHex(lsnCounter++);
              allRecords.push({ type: 'CHANGE', table: tx.table, data: row.data, lsn: rowLsn, tablet: row.tablet, fresh: true });
              vwalAll.push({ lsn: rowLsn, type: 'CHANGE', table: tx.table, data: row.data, fresh: true });
              ctx.cdcPanel({
                phase: 'streaming', slotName: 'slot1', pubName: 'pub_orders',
                lsn: rowLsn, confirmedLsn: lsnHex(lsnCounter - 6),
                phaseLabel: '🟢 Streaming — VWAL assembling cross-tablet changes',
                records: [...allRecords], vwalAssembly: [...vwalAll],
                tabletHighlight: row.tablet - 1
              });
              addLog(`VWAL: CHANGE ${tx.table} · ${row.data} · LSN=${rowLsn} · tablet-${row.tablet}`, '');
              await ctx.delay(350);
            }
            const commitLsn = lsnHex(lsnCounter++);
            allRecords.push({ type: 'COMMIT', data: tx.id + ' committed', lsn: commitLsn, fresh: true });
            vwalAll.push({ lsn: commitLsn, type: 'COMMIT', data: tx.id, fresh: true });
            ctx.cdcPanel({
              phase: 'streaming', slotName: 'slot1', pubName: 'pub_orders',
              lsn: commitLsn, confirmedLsn: lsnHex(lsnCounter - 4),
              phaseLabel: '🟢 Streaming — walsender → Kafka · consumer ACKing',
              records: [...allRecords], vwalAssembly: [...vwalAll],
              tabletHighlight: -1
            });
            addLog(`walsender: COMMIT ${tx.id} · LSN=${commitLsn} → Kafka`, 'ls');
            await ctx.delay(500);
          }
          addLog('All transactions streamed · confirmed flush LSN advancing · WAL released', 'ls');
        }
      },
      {
        label: '4. Slot Lag — Consumer Falls Behind',
        desc: 'If the consumer stalls, two things accumulate on <b>every TServer</b> simultaneously. <b>WAL retention</b> (LSN-gated): the slot holds back WAL GC until <code>confirmed_flush_lsn</code> advances — unread WAL files pile up proportionally to unread changes. <b>Intent retention</b> (time-gated): write intents in the intents RocksDB that haven\'t been streamed yet are kept beyond normal GC, controlled by <code>cdc_intent_retention_ms</code>. Both grow independently and create disk pressure cluster-wide.',
        action: async (ctx) => {
          const recs = [
            { type: 'COMMIT', data: 'TX-C committed',    lsn: '0/1000090' },
            { type: 'BEGIN',  data: 'TX-D',              lsn: '0/10000A0' },
            { type: 'CHANGE', table: 'orders', data: 'INSERT id=13 · amount=99.99', lsn: '0/10000B0', tablet: 2 },
            { type: 'CHANGE', table: 'orders', data: 'UPDATE id=10 · status=shipped', lsn: '0/10000C0', tablet: 1 },
            { type: 'COMMIT', data: 'TX-D committed',    lsn: '0/10000D0' },
            { type: 'BEGIN',  data: 'TX-E',              lsn: '0/10000E0' },
            { type: 'CHANGE', table: 'users',  data: 'DELETE id=2',  lsn: '0/10000F0', tablet: 3 },
            { type: 'COMMIT', data: 'TX-E committed',    lsn: '0/1000100' },
          ];
          const vwal = recs.map(r => ({ ...r }));
          addLog('Consumer stalled — WAL retention + intent retention both active', 'lw');
          for (let lag = 0; lag <= 80; lag += 16) {
            const intents = Math.round(lag * 0.25); // intents grow with time (slower, time-gated)
            await ctx.delay(420);
            ctx.cdcPanel({
              phase: 'lag', slotName: 'slot1', pubName: 'pub_orders',
              lsn: '0/1000100', confirmedLsn: '0/1000050',
              lagBytes: lag, walRetainedKb: lag, intentsHeld: intents,
              phaseLabel: `⚠ Slot lag: ${lag} KB · WAL held: ${lag} KB · Intents retained: ${intents}`,
              records: recs, vwalAssembly: vwal,
              tabletHighlight: -1
            });
            if (lag > 0) addLog(`WAL retained: ${lag} KB · Intents held: ${intents} (cdc_intent_retention_ms gate)`, 'lw');
          }
          addLog('⚠ SELECT slot_name, confirmed_flush_lsn, lag FROM pg_replication_slots', 'lw');
          addLog('⚠ Drop idle slots to release WAL and intent retention on TServers', 'lw');
        }
      },
      {
        label: '5. Consumer Recovers — Lag Clears',
        desc: 'When the consumer comes back online, it resumes from its last <b>confirmed flush LSN</b> — no changes are lost. As it processes each batch and ACKs, two things are released in tandem: <b>WAL GC resumes</b> (LSN-gated — as confirmed_flush_lsn advances, WAL files before it are eligible for GC), and <b>intents are cleared</b> (time-gate is lifted as the consumer streams and commits the pending changes). Both the WAL held and intent count drain toward zero.',
        action: async (ctx) => {
          const frozenRecs = [
            { type: 'COMMIT', data: 'TX-C committed',               lsn: '0/1000090' },
            { type: 'BEGIN',  data: 'TX-D',                          lsn: '0/10000A0' },
            { type: 'CHANGE', table: 'orders', data: 'INSERT id=13 · amount=99.99',     lsn: '0/10000B0', tablet: 2 },
            { type: 'CHANGE', table: 'orders', data: 'UPDATE id=10 · status=shipped',   lsn: '0/10000C0', tablet: 1 },
            { type: 'COMMIT', data: 'TX-D committed',                lsn: '0/10000D0' },
            { type: 'BEGIN',  data: 'TX-E',                          lsn: '0/10000E0' },
            { type: 'CHANGE', table: 'users',  data: 'DELETE id=2',  lsn: '0/10000F0', tablet: 3 },
            { type: 'COMMIT', data: 'TX-E committed',                lsn: '0/1000100' },
          ];
          addLog('Consumer reconnected to slot1 · resuming from confirmed_flush_lsn=0/1000050', 'li');
          await ctx.delay(400);
          const catchupLsns = ['0/1000060','0/1000070','0/1000080','0/1000090','0/10000D0','0/1000100'];
          for (let i = 0; i < catchupLsns.length; i++) {
            const lag     = Math.max(0, 80 - i * 16);
            const intents = Math.max(0, Math.round(lag * 0.25));
            await ctx.delay(380);
            ctx.cdcPanel({
              phase: lag > 0 ? 'lag' : 'streaming',
              slotName: 'slot1', pubName: 'pub_orders',
              lsn: '0/1000100', confirmedLsn: catchupLsns[i],
              lagBytes: lag, walRetainedKb: lag, intentsHeld: intents,
              phaseLabel: lag > 0
                ? `⚡ Catching up — WAL held: ${lag} KB · Intents: ${intents} · draining`
                : '🟢 Caught up — WAL GC resumed · intents cleared · streaming live',
              records: frozenRecs, vwalAssembly: frozenRecs.map(r => ({ ...r })),
              tabletHighlight: -1
            });
            addLog(`ACK: confirmed_flush_lsn=${catchupLsns[i]} · WAL held: ${lag} KB · intents: ${intents}`, lag > 0 ? 'lw' : 'ls');
          }
          await ctx.delay(300);
          addLog('WAL GC resumed · intents cleared · no records lost', 'ls');
        }
      }
    ]
  }
};
