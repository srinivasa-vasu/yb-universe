// ── Multi-Region Cluster interactive state ──────────────────────────────────
window._mrPrefs  = ['us']; // array of preferred regions (multi-select)
window._mrFailed = null;   // currently failed region (null | 'us' | 'eu' | 'apac')
window._mrCtx    = null;   // live ctx reference set in scenario init

const _mrNodes  = { us: [1,2,3], eu: [4,5,6], apac: [7,8,9] };
const _mrLabel  = { us: 'US-East', eu: 'EU-West', apac: 'APAC' };
const _mrColors = { us: '#60a5fa', eu: '#34d399', apac: '#f59e0b' };
const _mrAll    = ['us', 'eu', 'apac'];

function _mrEffRegs() {
  const active = window._mrPrefs.filter(r => r !== window._mrFailed);
  return active.length ? active : _mrAll.filter(r => r !== window._mrFailed);
}

function _mrEffReg(gi = 0) { const e = _mrEffRegs(); return e[gi % e.length]; }
function _mrLeader(gi)      { return _mrNodes[_mrEffReg(gi)][gi]; }
function _mrNodeReg(nid)    { return _mrAll.find(r => _mrNodes[r].includes(nid)); }

function _mrOW(a, b) {
  if (a === b) return 2;
  const t = { us:{ eu:45, apac:90 }, eu:{ us:45, apac:70 }, apac:{ us:90, eu:70 } };
  return t[a]?.[b] || 45;
}

function _mrLatsAll() {
  const fail = window._mrFailed;
  return [0,1,2].map(gi => {
    const eff = _mrEffReg(gi);
    const cl  = _mrOW('us', eff);
    const followers = _mrAll.filter(r => r !== eff && r !== fail);
    const minRaft   = followers.length ? Math.min(...followers.map(r => _mrOW(eff, r))) : 0;
    const read  = cl < 5 ? 2 : cl * 2;
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
  const cl        = _mrOW('us', reg);
  const followers = _mrAll.filter(r => r !== reg && r !== fail);
  const minRaft   = followers.length ? Math.min(...followers.map(r => _mrOW(reg, r))) : 0;
  const read  = cl < 5 ? 2 : cl * 2;
  const write = cl < 5 ? (2 + minRaft) : (cl + minRaft + cl);
  return { read, write };
}

function _mrAnimDur(owMs) { return Math.max(300, owMs * 6); }

// ── Bottom comparison panel ──────────────────────────────────────────────────
function _mrRenderLatPanel() {
  const panel = document.getElementById('mr-lat-panel');
  if (!panel) return;
  const effRegs = _mrEffRegs();
  const failed  = window._mrFailed;
  const prefs   = window._mrPrefs;

  let rows = '';
  _mrAll.forEach(reg => {
    const isEff    = effRegs.includes(reg);
    const isFailed = reg === failed;
    const isPref   = prefs.includes(reg);
    const done  = window._mrPanelDone || {};
    const lats  = !isFailed ? _mrRegionLats(reg) : null;
    const c     = _mrColors[reg];

    let st, stCls;
    if (isFailed)             { st = '✕ OFFLINE';   stCls = 'mr-st-fail'; }
    else if (isEff && isPref) { st = '● Pinned';    stCls = 'mr-st-pin'; }
    else if (isEff)           { st = '◉ Balancing'; stCls = 'mr-st-eff'; }
    else                      { st = '—';            stCls = 'mr-st-idle'; }

    const readVal  = (lats && done[reg + ':read'])  ? lats.read  + 'ms' : '—';
    const writeVal = (lats && done[reg + ':write']) ? lats.write + 'ms' : '—';
    const bl  = isEff ? `border-left:3px solid ${c}` : isFailed ? 'border-left:3px solid var(--err)' : 'border-left:3px solid transparent';
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
    const val  = document.getElementById(`lat-val-${i}`);
    if (fill) fill.style.width = '0%';
    if (val)  val.textContent = '—';
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
    btn.style.background  = active ? c : '';
    btn.style.color       = active ? '#0f172a' : c;
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
  ['mr1','mr2','mr3'].forEach((id, i) => ctx.setRole(id, _mrLeader(i), 'LEADER'));
}

function _mrAnimateLeaderTransfer(ctx, oldLeaders, newLeaders) {
  [0,1,2].filter(gi => oldLeaders[gi] !== newLeaders[gi]).forEach(gi => {
    const oldR = _mrNodeReg(oldLeaders[gi]), newR = _mrNodeReg(newLeaders[gi]);
    ctx.pktTabletToTablet(`mr${gi+1}`, oldLeaders[gi], `mr${gi+1}`, newLeaders[gi], 'pk-vote', _mrAnimDur(_mrOW(oldR, newR)));
  });
}

function _mrLogShards() {
  const effRegs = _mrEffRegs();
  if (effRegs.length > 1) {
    [0,1,2].forEach(gi => {
      const l = _mrLatsAll()[gi];
      addLog(`  shard-${gi+1} → ${_mrLabel[l.region]} (Node ${_mrLeader(gi)}) · read ~${l.read}ms · write ~${l.write}ms`, 'li');
    });
  }
}

window.mrSetPrefUs   = () => window.mrSetPref('us');
window.mrSetPrefEu   = () => window.mrSetPref('eu');
window.mrSetPrefApac = () => window.mrSetPref('apac');

window.mrSetPref = function(reg) {
  if (window._mrFailed === reg) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const oldLeaders = [0,1,2].map(gi => _mrLeader(gi));

  const idx = window._mrPrefs.indexOf(reg);
  if (idx === -1) {
    window._mrPrefs.push(reg);
    window._mrPrefs.sort((a, b) => _mrAll.indexOf(a) - _mrAll.indexOf(b));
  } else {
    if (window._mrPrefs.length === 1) return;
    window._mrPrefs.splice(idx, 1);
  }

  const newLeaders = [0,1,2].map(gi => _mrLeader(gi));
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

window.mrFailRegion = function() {
  const ctx = window._mrCtx; if (!ctx || window._mrFailed) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const toFail     = window._mrPrefs.find(r => r !== window._mrFailed) || window._mrPrefs[0];
  const oldLeaders = [0,1,2].map(gi => _mrLeader(gi));

  window._mrFailed = toFail;
  _mrNodes[toFail].forEach(n => ctx.killNode(n));

  const newLeaders = [0,1,2].map(gi => _mrLeader(gi));
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

window.mrRestore = function() {
  const ctx = window._mrCtx; if (!ctx || !window._mrFailed) return;
  window._mrPanelDone = {};
  _mrResetLatBars();
  const failed     = window._mrFailed;
  const oldLeaders = [0,1,2].map(gi => _mrLeader(gi));

  window._mrFailed = null;
  _mrNodes[failed].forEach(n => ctx.reviveNode(n));

  const newLeaders = [0,1,2].map(gi => _mrLeader(gi));
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
      // 0: Overview
      "0": {
        group: "Architecture", icon: "🗺️",
        name: 'Cluster Overview', title: 'Cluster Overview', subtitle: 'Node & tablet layout',
        steps: [], latencies: [],
        desc: 'YugabyteDB distributes data across TServers using tablet-based sharding. Each table is split into multiple tablets, each of which is a Raft group replicated across nodes. This architecture ensures high availability, scalability, and strong consistency.',
        guidedTour: [
          { text: "Explore the nodes in the cluster. Each box represents a <b>TServer</b>.", element: ".node-card" },
          { text: "Look at the small circles inside. These are <b>Tablets</b> — the unit of sharding.", element: ".n-body" },
          { text: "The filled circles (◉) are <b>Raft Leaders</b>; the empty ones (○) are followers.", element: ".toolbar" }
        ]
      },

      "universe": {
        group: "Architecture", icon: "🌐",
        name: 'Global Universe', title: 'Global Universe Architecture', subtitle: 'Fault domains',
        isArch: true,
        desc: 'A single logical database spanning multiple fault domains (zones or regions). Highly available with Zero RPO and Zero RTO, using synchronous replication.',
        guidedTour: [
          { text: "This view shows a <b>Global Universe</b> spanning 3 regions.", element: ".arch-view" },
          { text: "Each region hosts a full copy of the data across 3 nodes.", element: ".av-stats-bar" },
          { text: "Synchronous replication ensures <b>Zero RPO</b> — no data is lost during a region failure.", element: ".av-highlights" }
        ]
      },
      "xcl": {
        group: "Architecture", icon: "🔗",
        name: 'xCluster', title: 'xCluster Topology', subtitle: 'Cross-cluster',
        isArch: true,
        desc: 'Asynchronous replication between independent clusters. Used for disaster recovery (DR), low-latency local reads in multiple regions, and data migration.',
        guidedTour: [
          { text: "xCluster links <b>independent clusters</b> together via async replication.", element: ".arch-view" },
          { text: "Writes happen locally in each cluster, then replicate across the link.", element: ".av-sv" },
          { text: "Ideal for <b>Disaster Recovery</b> scenarios where clusters are thousands of miles apart.", element: ".av-highlights" }
        ]
      },
      "read-replica": {
        group: "Architecture", icon: "📖",
        name: 'Read Replica', title: 'Read Replica Topology', subtitle: 'Low-latency reads',
        isArch: true,
        desc: 'Read-only clones of a primary universe. They provide low-latency reads in remote regions without affecting the write performance of the primary cluster.',
        guidedTour: [
          { text: "Read Replicas are <b>read-only</b> copies of your data.", element: ".arch-view" },
          { text: "They don't participate in Raft quorums, so they don't add write latency.", element: ".av-stats-bar" },
          { text: "Use them to provide <b>local read latency</b> in regions far from your primary cluster.", element: ".av-highlights" }
        ]
      },

      // 1: Hash Sharding
      "1": {
        group: "Sharding", icon: "🔢",
        name: 'Hash Sharding', title: 'Hash Sharding', subtitle: 'MurmurHash2 distribution',
        desc: 'The Primary Key is hashed to determine tablet placement. This provides uniform distribution across the cluster, preventing hotspots.',
        latencies: [{ lbl: 'Hash Calculation', cls: 'll', max: 1 }, { lbl: 'Tablet Lookup', cls: 'll', max: 2 }, { lbl: 'Raft Commit', cls: 'lm', max: 10 }],
        extraBtns: [{ id: 'btn-hash', label: '➕ Insert Random User', cls: 'btn-p', cb: 'insertHashUser' }],
        init: (ctx) => {
          showDataPanel(true);
          renderDataTable('users');
          ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY HASH,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
          initHashRouting();
        },
        steps: [
          { label: 'Hash Mapping', desc: 'The primary key is hashed into a 0x0000–0xFFFF space. Each tablet owns a contiguous slice. YugabyteDB routes every write directly to the tablet whose range covers the hash — no scatter-gather needed.', action: async (ctx) => {
            for (const g of S.groups.filter(x => x.table === 'users')) {
              ctx.hlTablet(g.id, g.leaderNode, 't-hl');
              await ctx.delay(350);
            }
            ctx.setLat(0, 0.1); ctx.setLat(1, 0.4);
            addLog('hash(id) → 0x0000–0xFFFF space partitioned across tg1, tg2, tg3', 'li');
          }},
          { label: 'Write to Leader', desc: 'Client INSERT is routed to the tablet leader that owns the key\'s hash range. The leader appends to WAL and marks the row provisional — visible on the leader immediately but not yet committed. It then fans out Raft AppendEntries to both followers.', action: async (ctx) => {
            const pendingRow = [10, 'Jack', 'MUM', 88, Date.now()/1000];
            ctx.activateClient(true);
            addLog('INSERT id=10 → hash(10)=0x3A2F → tg1 (0x0000–0x54FF), leader N1', 'li');
            await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
            ctx.hlTablet('tg1', 1, 't-hl');
            const rs = S.replicaState['tg1']?.[1];
            if (rs) rs.provisionalRows = [pendingRow];
            ctx.reRenderTablet('tg1', 1);
            addLog('Leader N1: WAL append, row provisional ⏳ → fanning out to N2, N3', '');
            ctx.activateClient(false);
          }},
          { label: 'Raft Replication', desc: 'The leader simultaneously replicates to both followers. Once a majority (2 of 3) ACKs, the provisional row is committed and becomes durable on all three replicas.', action: async (ctx) => {
            await Promise.all([
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
            ]);
            const g = S.groups.find(x => x.id === 'tg1');
            const rs1 = S.replicaState['tg1']?.[1];
            const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now()/1000];
            if (g) {
              g.data.push(row);
              for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            ctx.setLat(2, 2.1);
            addLog('Majority ACK received — write committed (RF=3, quorum=2) ✓', 'ls');
            renderDataTable('users');
          }}
        ]
      },

      // 2: Range (Default)
      "2": {
        group: "Sharding", icon: "📏",
        name: 'Range (Default)', title: 'Range (Default)', subtitle: 'Single tablet start',
        filterTable: 'users',
        desc: 'Standard Range Sharding starts with a single tablet. As data grows, YugabyteDB automatically splits the tablet. This is ideal for small tables or when range scans are frequently used.',
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
          { label: 'Initial State', desc: 'Range-sharded tables start with a single tablet on TServer-1, covering the full key range. Writes land sequentially on the same leader — efficient for reads but prone to write hotspots as load grows.', action: async (ctx) => {
            ctx.hlTablet('tg1', 1, 't-hl2');
            addLog('Single tablet tg1 covers 0–999 on N1 (leader)', 'li');
            addLog('All writes route to N1 — sequential hotspot risk', 'lw');
          }},
          { label: 'Write to Leader', desc: 'INSERT is routed to the single tablet leader (N1). The leader B-Tree compares the key, appends to WAL, and marks the row provisional — visible on the leader immediately but not yet committed. It then fans out to followers.', action: async (ctx) => {
            const pendingRow = [10, 'Jack', 'MUM', 88, Date.now()/1000];
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
          }},
          { label: 'Raft Replication', desc: 'Leader replicates in parallel to both followers. Majority ACK promotes the provisional row to committed — it becomes durable and visible on all three replicas.', action: async (ctx) => {
            await Promise.all([
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
            ]);
            const g = S.groups.find(x => x.id === 'tg1');
            const rs1 = S.replicaState['tg1']?.[1];
            const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now()/1000];
            if (g) {
              g.data.push(row);
              for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            ctx.setLat(1, 2.1);
            addLog('Majority ACK — write committed ✓', 'ls');
            renderDataTable('users');
          }}
        ]
      },

      // 3: Range (Pre-split)
      "3": {
        group: "Sharding", icon: "✂️",
        name: 'Range (Pre-split)', title: 'Range (Pre-split)', subtitle: 'SPLIT AT VALUES',
        filterTable: 'users',
        desc: 'Optimize range sharding by pre-splitting the table into multiple tablets during creation.',
        latencies: [{ lbl: 'Range Lookup', cls: 'll', max: 1 }, { lbl: 'Tablet Lookup', cls: 'll', max: 2 }, { lbl: 'Raft Commit', cls: 'lm', max: 10 }],
        extraBtns: [{ id: 'btn-presplit', label: '➕ Insert Row', cls: 'btn-p', cb: 'insertHashUser' }],
        init: (ctx) => {
          showDataPanel(true);
          renderDataTable('users');
          const d = [[10, 'Alice', 'NY', 87], [50, 'Bob', 'CH', 92], [150, 'Carol', 'HOU', 78], [250, 'David', 'PHX', 95], [450, 'Eve', 'SEA', 83], [850, 'Frank', 'MIA', 94]];
          S.groups = S.groups.filter(g => g.table !== 'users');
          S.groups.push({ id: 'tg1', table: 'users', tnum: 1, range: '0 — 99', leaderNode: 1, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] < 100) });
          S.groups.push({ id: 'tg2', table: 'users', tnum: 2, range: '100 — 199', leaderNode: 2, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] >= 100 && r[0] < 200) });
          S.groups.push({ id: 'tg3', table: 'users', tnum: 3, range: '200 — 999', leaderNode: 3, term: 4, replicas: [1, 2, 3], data: d.filter(r => r[0] >= 200) });
          ctx.rebuildReplicaState();
          ctx.setDDL('CREATE TABLE users (...) \nSPLIT AT VALUES ((100), (200));');
          renderAllTablets(); setTimeout(renderConnections, 80);
        },
        steps: [
          { label: 'Multi-Tablet', desc: 'Table is pre-split into 3 tablets: 0–99, 100–199, 200–999. Each tablet is owned by a different leader, distributing load from day one.', action: async (ctx) => {
            for (const g of S.groups.filter(x => x.table === 'users')) {
              ctx.hlTablet(g.id, g.leaderNode, 't-hl');
              await ctx.delay(400);
            }
          } },
          { label: 'Write → Routed', desc: 'Client inserts id=75. Range lookup maps 75 → tablet tg1 (0–99). Write goes to tg1 leader which appends to WAL and marks the row provisional — visible on the leader immediately but not yet committed.', action: async (ctx) => {
            const pendingRow = [75, 'Jack', 'MUM', 88, Date.now()/1000];
            ctx.activateClient(true);
            await ctx.pktClientToTablet('tg1', 1, 'pk-write', 400);
            ctx.hlTablet('tg1', 1, 't-hl');
            const rs = S.replicaState['tg1']?.[1];
            if (rs) rs.provisionalRows = [pendingRow];
            ctx.reRenderTablet('tg1', 1);
            ctx.setLat(0, 0.1);
            ctx.setLat(1, 0.4);
            addLog('Client INSERT id=75 → range 0–99 → tg1 (N1)', 'li');
            addLog('Key ordered, WAL append, row provisional ⏳ → fanning out to N2, N3', '');
            ctx.activateClient(false);
          } },
          { label: 'Raft Replication', desc: 'Leader fans out to both followers in parallel. Majority ACK promotes the provisional row to committed — durable and visible on all three replicas.', action: async (ctx) => {
            await Promise.all([
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300),
              ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 300)
            ]);
            const g = S.groups.find(x => x.id === 'tg1');
            const rs1 = S.replicaState['tg1']?.[1];
            const row = rs1?.provisionalRows?.[0] || [75, 'Jack', 'MUM', 88, Date.now()/1000];
            if (g) {
              g.data.push(row);
              for (const n of [1, 2, 3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1, 2, 3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            ctx.setLat(2, 2.1);
            addLog('Majority ACK → committed, id=75 visible on all tg1 replicas', 'ls');
            renderDataTable('users');
          } }
        ]
      },

      "4": {
        group: "Write & Read Paths", icon: "⚡",
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
          { label: 'Client INSERT', desc: 'Client sends INSERT to gateway TServer. Once the write packet reaches the leader, it is appended to the WAL and shown as provisional.', action: async (ctx) => {
            const pendingRow = [10, 'Jack', 'MUM', 88, Date.now()/1000];
            ctx.activateClient(true);
            await ctx.pktClientToTablet('tg1', 1, 'pk-write', 500);
            const rs = S.replicaState['tg1']?.[1];
            if (rs) rs.provisionalRows = [pendingRow];
            ctx.reRenderTablet('tg1', 1);
            addLog('INSERT id=10 → tg1 leader N1: WAL append, row provisional ⏳', 'li');
          } },
          { label: 'Leader WAL & Replicate', desc: 'Leader fans out AppendEntries to both followers simultaneously — near follower (N2, ~0.8ms) and far follower (N3, ~2.5ms).', action: async (ctx) => { ctx.setLat(0, 0.8); ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300); ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 1000); await ctx.delay(800); } },
          {
            label: 'First ACK = Majority', desc: 'Near follower ACKs first (~0.8ms). Majority reached. Far follower ACK arrives later but not on critical path.', action: async (ctx) => {
              if (S.nodes[1].alive) {
                ctx.setLat(1, 1.2); ctx.setLat(2, 9.5);
                await ctx.pktTabletToTablet('tg1', 2, 'tg1', 1, 'pk-ack', 300);
                ctx.setLat(3, 0.5); ctx.setLat(4, 2.5);
              } else {
                await ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-ack', 1000);
                ctx.setLat(1, 0); ctx.setLat(2, 10.5); ctx.setLat(3, 0.5); ctx.setLat(4, 11.8);
              }
            }
          },
          { label: 'Commit & ACK Client', desc: 'Majority ACK received — provisional row is committed to MemTable on all replicas. ACK returned to client.', action: async (ctx) => {
            if (S.nodes[1].alive) { ctx.hlLatRow([0, 1, 3, 4]); }
            else { ctx.hlLatRow([0, 2, 3, 4]); }
            const g = S.groups.find(x => x.id === 'tg1');
            const rs1 = S.replicaState['tg1']?.[1];
            const row = rs1?.provisionalRows?.[0] || [10, 'Jack', 'MUM', 88, Date.now()/1000];
            if (g) {
              g.data.push(row);
              for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
            }
            for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
            addLog('Write committed — row visible on all replicas ✓', 'ls');
            await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400); ctx.activateClient(false);
          } }
        ]
      },

      "5": {
        group: "Write & Read Paths", icon: "⚖️",
        name: 'Distributed Transactions', title: 'Distributed Transactions', subtitle: 'Multi-tablet atomicity (2PC)',
        filterTable: ['users', 'transactions'],
        desc: 'Transactions spanning multiple tablets (e.g. updating users in different shards) use a high-performance 2-Phase Commit protocol (2PC). Visibility is atomic across all shards.',
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
            desc: 'Writes are sent to the target tablet leaders (users.t1, users.t2) with the transaction ID. Data is "provisional" and not yet visible.',
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
        group: "Write & Read Paths", icon: "🧬",
        name: 'Index Data Write', title: 'Index Data Write', subtitle: 'Primary + Secondary (2PC)',
        filterTable: ['users', 'users_email_idx', 'transactions'],
        desc: 'Secondary indexes are stored in separate tablets. Updating a row with an index requires a distributed transaction to ensure both are updated atomically.',
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
              S.groups.find(g => g.id === 'tg1').data.push([1, 'Alice Chen', 'NY', 87, 102.0]);
              S.groups.find(g => g.id === 'tg8').data.push(['alice@yugabyte.com', 1, 102.0]);
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
        group: "Write & Read Paths", icon: "📖",
        name: 'Consistent Read', title: 'Consistent Read', subtitle: 'Leader reads',
        filterTable: 'users',
        desc: 'Strong-consistency reads always go to the Raft LEADER. If request lands on a follower, it transparently redirects to the leader.',
        latencies: [{ lbl: 'Gateway Hop', cls: 'll', max: 2 }, { lbl: 'Remote Redir', cls: 'll', max: 2 }, { lbl: 'Leader Read', cls: 'll', max: 2 }, { lbl: 'Total', cls: 'll', max: 6 }],
        steps: [
          { label: 'Local Read (Fast)', desc: 'Request lands directly on the leader (TServer-1) — no redirect needed.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 1, 'pk-read', 400); ctx.setLat(0, 0.5); ctx.setLat(2, 0.8); ctx.setLat(3, 1.3); ctx.hlLatRow([0, 2, 3]); await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400); ctx.activateClient(false); } },
          { label: 'Remote Read (Request)', desc: 'Request lands on TServer-3 (follower). It detects this is not the leader.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.hlTablet('tg1', 3, 't-hl2'); addLog('TS-3: Received request — redirecting to leader', 'lw'); } },
          { label: 'Remote Read (Redirect)', desc: 'TServer-3 redirects the client to TServer-1 (leader). TServer-1 processes the read request.', action: async (ctx) => { ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-read', 500); await ctx.delay(600); ctx.setLat(3, 3.4); ctx.hlLatRow(3); await ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-ack', 400); await ctx.pktTabletToClient('tg1', 3, 'pk-ack', 400); ctx.activateClient(false); } }
        ]
      },

      "8": {
        group: "Write & Read Paths", icon: "⚡",
        name: 'Follower Reads', title: 'Follower Reads', subtitle: 'Bounded staleness',
        filterTable: 'users',
        desc: 'SET yb_read_from_followers=TRUE allows reads from nearest replica, skipping the leader. Data may be bounded-stale (default 10ms).',
        latencies: [{ lbl: 'Route to Follower', cls: 'll', max: 1 }, { lbl: 'Staleness Check', cls: 'll', max: 1 }, { lbl: 'Local Read', cls: 'll', max: 1 }, { lbl: 'Total', cls: 'll', max: 3 }],
        steps: [
          { label: 'Read from Nearest', desc: 'Routes to TServer-3 (follower, nearest to client), bypassing TServer-1 (leader, far).', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.setLat(0, 0.6); ctx.hlLatRow(0); } },
          { label: 'Check & Serve', desc: 'Follower confirms HybridTime within staleness window, serves locally.', action: async (ctx) => { ctx.setLat(1, 0.5); ctx.hlRow('tg1', 3, 0); await ctx.delay(400); ctx.setLat(3, 1.8); ctx.hlLatRow([1, 2, 3]); await ctx.pktTabletToClient('tg1', 3, 'pk-read', 400); ctx.activateClient(false); } }
        ]
      },


      "10": {
        group: "Global & High Availability", icon: "🗳️",
        name: 'Leader Election', title: 'Leader Election', subtitle: 'Raft lifecycle & recovery',
        desc: 'Full Raft lifecycle: 6 consecutive heartbeat failures → node declared dead → election timeout → Follower→Candidate→Leader. Leaders are distributed fairly across surviving peers. Also supports graceful Blacklist/Drain for planned maintenance.',
        guidedTour: [
          { text: "Raft ensures there is always exactly one <b>Leader</b> per tablet.", element: ".canvas-wrap" },
          { text: "Click <b>Step Forward</b> to witness the heartbeat failure and re-election logic.", element: "#btn-step" },
          { text: "Watch the <b>Raft Term</b> increment in the toolbar as new leaders are elected.", element: "#term-display" },
          { text: "Try <b>Blacklist TS-2</b> to see how leaders are gracefully moved away before maintenance.", element: "#btn-bl" }
        ],
        latencies: [{ lbl: 'Heartbeat RTT', cls: 'll', max: 2 }, { lbl: 'HB Failures', cls: 'lh', max: 6 }, { lbl: 'Crash Detection', cls: 'lh', max: 400 }, { lbl: 'Leader Lease Expiry', cls: 'lm', max: 2000 }, { lbl: 'Vote RPCs', cls: 'lm', max: 10 }, { lbl: 'New Leaders Up', cls: 'll', max: 5 }, { lbl: 'Re-replication', cls: 'lm', max: 200 }, { lbl: 'Leader Balancing', cls: 'll', max: 15 }],
        electionSteps: ['Heartbeats', 'Miss ×1-3', 'Miss ×4-6', 'Timeout', 'Candidate', 'RequestVote', 'Vote Grant', 'Elected', 'Recovery', 'Balancing'],
        extraBtns: [{ id: 'btn-bl', label: '🚫 Blacklist TS-2', cls: 'btn-d', cb: 'blacklistDrainNode' }],
        steps: [
          {
            label: 'Healthy — Heartbeats Flowing',
            desc: 'TServer-2 is LEADER for tg2 (users.t2), tg4 (categories.t1), and tg8 (email_idx.t1). It sends periodic heartbeat AppendEntries every ~200ms to peers, asserting leadership and resetting their election timers.',
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
            elStep: 8,
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
        group: "Global & High Availability", icon: "💥",
        name: 'Node Failure', title: 'Node Failure', subtitle: 'Crash & catch-up',
        desc: 'TServer-3 crashes. Raft re-election gives new leaders for tg3 (users.t3) & tg6 (products.t2). Auto-writes continue during outage. On recovery, TServer-3 catches up all missed writes and leaders are rebalanced back to it.',
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
            desc: 'Start auto-writes to see the cluster in steady state. All 3 TServers are alive. TServer-3 is LEADER for tg3 (users.t3) and tg6 (products.t2).',
            action: async (ctx) => {
              addLog('Cluster healthy · auto-writes recommended', 'ls');
              addLog('TServer-3 leads: users.t3 (tg3), products.t2 (tg6)', 'li');
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
        group: "Global & High Availability", icon: "🔀",
        name: 'Network Partition', title: 'Network Partition', subtitle: 'Split-brain & quorum',
        desc: 'TServer-3 is cut off from TServer-1 and TServer-2 by a network partition. TS-3 tries to elect itself leader but cannot win majority (1/3 < 2). TS-1 & TS-2 (quorum) continue serving writes. TS-3 returns stale reads.',
        latencies: [{ lbl: 'Partition Detected', cls: 'lh', max: 500 }, { lbl: 'TS-3 Election Attempt', cls: 'lm', max: 10 }, { lbl: 'Write (majority side)', cls: 'll', max: 4 }, { lbl: 'Read (TS-3 stale)', cls: 'lm', max: 2 }, { lbl: 'Heal & Resync', cls: 'lm', max: 200 }],
        failureMode: 'partition',
        extraBtns: [
          { id: 'btn-prt', label: '⟊ Partition TS-3', cls: 'btn-o', cb: 'fdPartitionNode3' },
          { id: 'btn-heal', label: '🔗 Heal Partition', cls: 'btn-g', cb: 'fdHealPartition', disabled: true }
        ],
        steps: [
          {
            label: 'Healthy Cluster + Writes',
            desc: 'All nodes connected. TServer-3 leads tg3 (users.t3) & tg6 (products.t2). Start writes to observe the steady state before partition.',
            action: async (ctx) => {
              addLog('Cluster fully connected', 'ls');
              addLog('TServer-3 leads: users.t3 (tg3), products.t2 (tg6)', 'li');
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

      "13": {
        group: "Horizontal Scalability", icon: "📈",
        name: 'Horizontal Scaling', title: 'Horizontal Scaling', subtitle: 'Add/remove nodes & rebalance',
        desc: 'Observe how YugabyteDB scales out from 3 to 6 nodes within the APAC region. As new nodes are added, YB-Master automatically rebalances both tablet leaders and followers to distribute data and load evenly across all available zones.',
        latencies: [{ lbl: 'Leader Rebalance', cls: 'll', max: 50 }, { lbl: 'Data Copy (Replica)', cls: 'lm', max: 200 }],
        init: (ctx) => {
          ctx.setCanvasGeoMode(false);
          ctx.setCanvasRegionMode(true);
          // Set labels to Zones (Zones A, B, C correspond to columns 1, 2, 3)
          ctx.setNodeRegion(1, 'apac', 'Zone A'); ctx.setNodeRegion(4, 'apac', 'Zone A');
          ctx.setNodeRegion(2, 'apac', 'Zone B'); ctx.setNodeRegion(5, 'apac', 'Zone B');
          ctx.setNodeRegion(3, 'apac', 'Zone C'); ctx.setNodeRegion(6, 'apac', 'Zone C');

          // Initial 3 nodes: 1, 2, 3 (One per zone)
          for(let n=1; n<=9; n++) ctx.setNodeVisibility(n, n <= 3);

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

      "14": {
        group: "Horizontal Scalability", icon: "🔄",
        name: 'Tablet Split', title: 'Tablet Split', subtitle: 'Auto-sharding growth',
        filterTable: 'users',
        desc: 'YugabyteDB automatically splits tablets when they exceed ~64MB. New Raft groups are created for the split halves, and the parent is retired.',
        latencies: [{ lbl: 'Size Check', cls: 'll', max: 1 }, { lbl: 'Split Point', cls: 'll', max: 2 }, { lbl: 'New Group', cls: 'lm', max: 50 }],
        steps: [
          { label: 'Growth', desc: 'Bulk writes fill the tablet beyond the 64MB threshold.', action: async (ctx) => { for (let i = 0; i < 3; i++) { await ctx.pktClientToTablet('tg1', 1, 'pk-write', 300); ctx.addMem('tg1', 1, 20); } } },
          { label: 'Analyze Range', desc: 'TServer identifies the median split point for the hash range.', action: async (ctx) => {
            ctx.setLat(0, 0.8); ctx.setLat(1, 1.2);
            showSplitPanel(true);
            renderSplitInfo('0x0000–0x54FF', '0x2A87');
            addLog('Split threshold reached. Identifying median hash...', 'li');
          } },
          {
            label: 'Spawn Children', desc: 'Two new child tablets (tg1a, tg1b) are created. For a brief moment, parent and children coexist.', action: async (ctx) => {
              addLog('Spawning child tablets: tg1a and tg1b', 'ls');
              const g1a = { id: 'tg1a', table: 'users', tnum: '1a', range: '0x0000–0x2A87', leaderNode: 1, term: 5, replicas: [1, 2, 3], data: [[1, 'A', 'NY', 87]] };
              const g1b = { id: 'tg1b', table: 'users', tnum: '1b', range: '0x2A88–0x54FF', leaderNode: 1, term: 5, replicas: [1, 2, 3], data: [[4, 'D', 'P', 95]] };
              S.groups.push(g1a, g1b);
              S.replicaState['tg1a'] = {}; S.replicaState['tg1b'] = {};
              for (let n of [1, 2, 3]) {
                S.replicaState['tg1a'][n] = { mem: 10, ss: 15, ssts: [15], newRows: [], readRow: undefined };
                S.replicaState['tg1b'][n] = { mem: 10, ss: 15, ssts: [15], newRows: [], readRow: undefined };
              }
              renderAllTablets(); renderConnections();
              ctx.setLat(2, 42);
              addLog('Child tablets online. Transitioning traffic...', 'li');
            }
          },
          {
            label: 'Finalize Split', desc: 'Traffic fully moved to children. Parent tablet (tg1) is retired and removed from the nodes.', action: async (ctx) => {
              addLog('Retiring parent tablet tg1...', 'lw');
              S.groups = S.groups.filter(g => g.id !== 'tg1');
              renderAllTablets(); renderConnections();
              showSplitPanel(false);
              addLog('Split complete. tg1 retired. children tg1a & tg1b now active ✓', 'ls');
            }
          }
        ]
      },

      "15": {
        group: "Storage & Scalability", icon: "🗜️",
        name: 'LSM Compaction', title: 'LSM Compaction', subtitle: 'DocDB storage engine',
        desc: 'DocDB (RocksDB LSM-tree): writes → MemTable → L0 SSTable flush → L0→L1 compaction → lower read amplification.',
        latencies: [{ lbl: 'L0 Flush', cls: 'lm', max: 50 }, { lbl: 'Compaction', cls: 'lm', max: 200 }, { lbl: 'Final Read', cls: 'll', max: 2 }],
        steps: [
          { label: 'Writes & Flush #1', desc: 'Incoming writes fill MemTable (TS-1). When full, it flushes as an immutable L0 SSTable.', action: async (ctx) => {
            for (let n of [1, 2, 3]) {
              const rs = S.replicaState['tg1'][n];
              rs.mem = 90; reRenderTabletInternal('tg1', n);
              await ctx.delay(400);
              rs.mem = 5; rs.ssts.push(25); rs.ss = rs.ssts.reduce((a,b)=>a+b, 0);
              reRenderTabletInternal('tg1', n);
            }
            ctx.setLat(0, 32); addLog('L0 Flush complete: SST segment #1 created', 'ls');
          } },
          { label: 'Writes & Flush #2', desc: 'Another burst of writes creates a second L0 file. Multiple L0 files increase read amplification.', action: async (ctx) => {
            for (let n of [1, 2, 3]) {
              const rs = S.replicaState['tg1'][n];
              rs.mem = 85; reRenderTabletInternal('tg1', n);
              await ctx.delay(400);
              rs.mem = 5; rs.ssts.push(30); rs.ss = rs.ssts.reduce((a,b)=>a+b, 0);
              reRenderTabletInternal('tg1', n);
            }
            ctx.setLat(0, 41); addLog('L0 Flush complete: SST segment #2 created', 'ls');
          } },
          { label: 'Compaction (Merge)', desc: 'DocDB triggers compaction to merge small L0 files into a larger L1 file, removing duplicates/deleted keys.', action: async (ctx) => {
            for (let n of [1, 2, 3]) { S.replicaState['tg1'][n].compacting = true; reRenderTabletInternal('tg1', n); }
            addLog('Compaction started: Merging SST segments...', 'li');
            await ctx.delay(1200);
            for (let n of [1, 2, 3]) {
              const rs = S.replicaState['tg1'][n]; rs.compacting = false;
              const total = rs.ssts.reduce((a,b)=>a+b, 0);
              rs.ssts = [Math.min(95, total * 0.85)]; // Compressed merge
              rs.ss = rs.ssts[0];
              reRenderTabletInternal('tg1', n);
            }
            ctx.setLat(1, 185); addLog('Compaction complete: Segments merged into optimized L1 SST', 'ls');
          } },
          { label: 'Fast Read', desc: 'With fewer SST files to check, the read request completes much faster.', action: async (ctx) => {
            await ctx.pktClientToTablet('tg1', 1, 'pk-read', 400);
            ctx.setLat(2, 0.8);
            await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400);
            addLog('Read complete: 0.8ms (optimized by compaction)', 'ls');
          } }
        ]
      },

      "16": {
        group: "Storage & Scalability", icon: "📦",
        name: 'Colocated Tables', title: 'Colocated Tables', subtitle: 'Shared tablet groups',
        filterTable: 'colocated',
        desc: 'Colocation allows multiple small tables to share the same underlying tablet group. These shared tablets are range-sharded by default, using the entire row key (including Colocation ID) to maintain global order. This significantly reduces metadata overhead and per-table Raft costs for reference or master tables.',
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
              S.groups[0].data.push([3, 'Home', 'Home decor', '', performance.now()/1000, 'categories']);
              // Sort data as it is range sharded
              S.groups[0].data.sort((a,b) => a[0]-b[0]);
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
              S.groups[0].data.push([501, 'John Doe', 'john@example.com', '', performance.now()/1000, 'customers']);
              renderAllTablets();
              renderDataTable('colocated');
              await ctx.pktTabletToClient('tg-col', 1, 'pk-ack', 400);
              addLog('Customer data stored in shared tablet group ✓', 'ls');
            }
          }
        ]
      },

      "17": {
        group: "Multi-Cluster & DR", icon: "🔁",
        name: 'xCluster DR', title: 'xCluster DR', subtitle: 'Turnkey async replication',
        desc: 'Turnkey xCluster Disaster Recovery replicates changes from a PRIMARY cluster (ap-south-1) to a SECONDARY cluster (ap-south-2) asynchronously via CDCSDK pollers. Writes commit via Raft on PRIMARY (~2ms), then stream near-realtime (~45ms) to SECONDARY. A single n:m poller bridges multiple source tablets to multiple target tablets simultaneously.',
        latencies: [
          { lbl: 'Raft commit', cls: 'll', max: 2 },
          { lbl: 'CDC poll', cls: 'lm', max: 10 },
          { lbl: 'WAN + apply', cls: 'lh', max: 55 },
          { lbl: 'Repl lag', cls: 'lh', max: 60 },
        ],
        init: (ctx) => {
          S.groups = [
            { id: 'xpu', table: 'users',  tnum: 1, range: 'all rows', leaderNode: 1, term: 4, replicas: [1,2,3], showReg: true,
              data: [[1,'Alice Chen','S1',87,1713289000.100],[4,'David Park','S1',95,1713289000.400]] },
            { id: 'xpo', table: 'orders', tnum: 1, range: 'all rows', leaderNode: 2, term: 4, replicas: [1,2,3],
              data: [[101,1,'item-A','DONE',1713289000.500],[102,4,'item-B','DONE',1713289000.600]] },
            { id: 'xsu', table: 'users',  tnum: 1, range: 'all rows', leaderNode: 4, term: 4, replicas: [4,5,6], showReg: true,
              data: [[1,'Alice Chen','S1',87,1713289000.100,'ext'],[4,'David Park','S1',95,1713289000.400,'ext']] },
            { id: 'xso', table: 'orders', tnum: 1, range: 'all rows', leaderNode: 5, term: 4, replicas: [4,5,6],
              data: [[101,1,'item-A','DONE',1713289000.500,'ext'],[102,4,'item-B','DONE',1713289000.600,'ext']] }
          ];
          ctx.rebuildReplicaState();
          ctx.setXClusterMode(true);
          [4,5,6].forEach(n => ctx.setNodeVisibility(n, true));
          [1,2,3].forEach((n,i) => {
            const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-1${'abc'[i]}`;
            const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-1';
          });
          [4,5,6].forEach((n,i) => {
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
            desc: 'PRIMARY (ap-south-1) holds a users tablet (leader N1) and an orders tablet (leader N2). SECONDARY (ap-south-2) mirrors both. P-1 is dedicated to the users source tablet leader; P-2 is dedicated to the orders source tablet leader \u2014 1 poller per source tablet leader.',
            action: async (ctx) => {
              addLog('PRIMARY: ap-south-1 (N1\u2013N3) \u2014 users on N1, orders on N2', 'li');
              addLog('SECONDARY: ap-south-2 (N4\u2013N6) \u2014 mirrors users + orders', 'li');
              addLog('P-1 \u2192 users tablet leader (N1) | P-2 \u2192 orders tablet leader (N2)', 'li');
              addLog('Rule: 1 CDCSDK poller per source tablet leader', '');
              for (const id of ['xpu','xpo']) {
                const g = S.groups.find(g=>g.id===id); if (g) ctx.hlTablet(id, g.leaderNode, 't-hl');
              }
              await ctx.delay(500);
              for (const id of ['xsu','xso']) {
                const g = S.groups.find(g=>g.id===id); if (g) ctx.hlTablet(id, g.leaderNode, 't-hl2');
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
              addLog('hash(10) \u2192 xpu leader N1, HLC='+hlcU.toFixed(3), '');
              await ctx.pktClientToTablet('xpu', 1, 'pk-write', 300);
              ctx.hlTablet('xpu', 1, 't-hl');
              addLog('Raft: N1 \u2192 N2, N3 (\u22482ms)', '');
              await Promise.all([
                ctx.pktTabletToTablet('xpu', 1, 'xpu', 2, 'pk-raft', 300),
                ctx.pktTabletToTablet('xpu', 1, 'xpu', 3, 'pk-raft', 300)
              ]);
              S.groups.find(g=>g.id==='xpu').data.push([10,'Jack Russo','S1',89,hlcU]);
              for (const n of [1,2,3]) { ctx.hlTablet('xpu', n, 't-hl'); ctx.reRenderTablet('xpu', n, true); }
              addLog('users id=10 committed, HLC='+hlcU.toFixed(3)+' in WAL \u2713', 'ls');
              setLatency(0, 2);
              await ctx.pktTabletToClient('xpu', 1, 'pk-ack', 250);
              ctx.activateClient(false);
              ctx.setLag('~45ms');
            }
          },
          {
            label: '1:1 Replication (P-1)',
            desc: 'P-1 polls the users tablet leader (N1) and streams the WAL batch to xsu (N4) on SECONDARY. This is a 1:1 stream: one source tablet \u2192 one dedicated poller \u2192 one target tablet. The SECONDARY then Raft-replicates within its cluster for durability.',
            action: async (ctx) => {
              ctx.hlLatRow(1);
              addLog('P-1 polls xpu (N1): finds {id=10 Jack} in WAL', 'li');
              addLog('P-1 streams batch \u2192 xsu (N4) on SECONDARY (~45ms)', '');
              await ctx.pktXCluster(1, 'xpu', 1, 'xsu', 4, 1000);
              setLatency(1, 5);
              setLatency(2, 45);
              const hlcU = S.groups.find(g=>g.id==='xpu').data.find(r=>r[0]===10)?.[4] ?? 1713289100.100;
              S.groups.find(g=>g.id==='xsu').data.push([10,'Jack Russo','S1',89,hlcU,'ext']);
              for (const n of [4,5,6]) { ctx.hlTablet('xsu', n, 't-hl2'); ctx.reRenderTablet('xsu', n, true); }
              addLog('xsu: id=10 applied (EXT, REG=S1, HLC='+hlcU.toFixed(3)+') \u2713', 'ls');
              addLog('SECONDARY Raft: N4 \u2192 N5, N6 (\u22482ms)', '');
              await Promise.all([
                ctx.pktTabletToTablet('xsu', 4, 'xsu', 5, 'pk-raft', 280),
                ctx.pktTabletToTablet('xsu', 4, 'xsu', 6, 'pk-raft', 280)
              ]);
              setLatency(3, 47);
              addLog('1:1 stream complete \u2014 1 poller, 1 source tablet, 1 target tablet \u2713', 'ls');
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
                  S.groups.find(g=>g.id==='xpu').data.push([11,'Eva Reyes','S1',82,hlcU2]);
                  for (const n of [1,2,3]) { ctx.hlTablet('xpu', n, 't-hl'); ctx.reRenderTablet('xpu', n, true); }
                  addLog('users id=11 committed, HLC='+hlcU2.toFixed(3)+' \u2713', 'ls');
                })(),
                (async () => {
                  await ctx.pktClientToTablet('xpo', 2, 'pk-write', 280);
                  ctx.hlTablet('xpo', 2, 't-hl');
                  await Promise.all([
                    ctx.pktTabletToTablet('xpo', 2, 'xpo', 1, 'pk-raft', 280),
                    ctx.pktTabletToTablet('xpo', 2, 'xpo', 3, 'pk-raft', 280)
                  ]);
                  S.groups.find(g=>g.id==='xpo').data.push([103,10,'item-C','PEND',hlcO]);
                  for (const n of [1,2,3]) { ctx.hlTablet('xpo', n, 't-hl'); ctx.reRenderTablet('xpo', n, true); }
                  addLog('orders id=103 committed, HLC='+hlcO.toFixed(3)+' \u2713', 'ls');
                })()
              ]);
              setLatency(0, 2);
              await ctx.pktTabletToClient('xpu', 1, 'pk-ack', 200);
              ctx.activateClient(false);
              ctx.setLag('~45ms');
            }
          },
          {
            label: 'Parallel Streams (P-1 \u2225 P-2)',
            desc: 'P-1 and P-2 fire simultaneously and independently: P-1 polls the users leader (N1) and delivers id=11 to xsu; P-2 polls the orders leader (N2) and delivers id=103 to xso. Both SECONDARY tablets then Raft-replicate in parallel. This is the n:m pattern: multiple source tablets, multiple pollers, multiple targets, all in one round.',
            action: async (ctx) => {
              ctx.hlLatRow(1);
              addLog('P-1 \u2225 P-2: both pollers fire simultaneously', 'li');
              addLog('P-1: xpu (N1) \u2192 xsu (N4) | P-2: xpo (N2) \u2192 xso (N5)', '');
              await Promise.all([
                ctx.pktXCluster(1, 'xpu', 1, 'xsu', 4, 1000),
                ctx.pktXCluster(2, 'xpo', 2, 'xso', 5, 1000)
              ]);
              setLatency(1, 5); setLatency(2, 45);
              const hlcU2 = S.groups.find(g=>g.id==='xpu').data.find(r=>r[0]===11)?.[4] ?? 1713289100.300;
              const hlcO  = S.groups.find(g=>g.id==='xpo').data.find(r=>r[0]===103)?.[4] ?? 1713289100.400;
              S.groups.find(g=>g.id==='xsu').data.push([11,'Eva Reyes','S1',82,hlcU2,'ext']);
              S.groups.find(g=>g.id==='xso').data.push([103,10,'item-C','PEND',hlcO,'ext']);
              for (const n of [4,5,6]) { ctx.hlTablet('xsu', n, 't-hl2'); ctx.reRenderTablet('xsu', n, true); }
              for (const n of [4,5,6]) { ctx.hlTablet('xso', n, 't-hl2'); ctx.reRenderTablet('xso', n, true); }
              addLog('SECONDARY Raft: xsu N4\u2192N5,N6 | xso N5\u2192N4,N6 simultaneously', '');
              await Promise.all([
                ctx.pktTabletToTablet('xsu', 4, 'xsu', 5, 'pk-raft', 260),
                ctx.pktTabletToTablet('xsu', 4, 'xsu', 6, 'pk-raft', 260),
                ctx.pktTabletToTablet('xso', 5, 'xso', 4, 'pk-raft', 260),
                ctx.pktTabletToTablet('xso', 5, 'xso', 6, 'pk-raft', 260)
              ]);
              setLatency(3, 52);
              addLog('Both tablets replicated to SECONDARY RF=3 \u2713', 'ls');
              ctx.setRPO('<1s', false);
              ctx.setLag('~5ms');
            }
          },
          {
            label: 'Primary Failure \u2192 RPO',
            desc: 'PRIMARY cluster becomes unavailable. WAL entries logged but not yet polled by P-1 define the RPO window. The last polled change sequence number (LSN) on SECONDARY marks the recovery point.',
            action: async (ctx) => {
              ctx.hlLatRow(null);
              addLog('\u26a0 PRIMARY cluster unreachable (ap-south-1 failure)', 'le');
              for (const n of [1,2,3]) ctx.killNode(n);
              await ctx.delay(600);
              ctx.setLag('\u2014');
              ctx.setRPO('~45ms window', true);
              addLog('RPO \u2248 CDC lag at failure \u2014 up to ~45ms of uncommitted changes', 'lw');
              addLog('Last polled LSN on SECONDARY marks the safe recovery point', '');
            }
          },
          {
            label: 'Failover to SECONDARY',
            desc: 'Administrator promotes the SECONDARY cluster to PRIMARY. It now accepts writes for both users and orders tablets. RTO \u224835s (detect 5s + promote 20s + redirect 10s). Old primary rejoins as new secondary after recovery.',
            action: async (ctx) => {
              addLog('Initiating failover: SECONDARY promoted to PRIMARY', 'li');
              const badge = document.getElementById('xc-secondary-badge');
              if (badge) { badge.textContent = 'PRIMARY'; badge.className = 'xc-badge primary'; }
              await ctx.delay(600);
              for (const id of ['xsu','xso']) {
                const g = S.groups.find(x=>x.id===id);
                if (g) ctx.hlTablet(id, g.leaderNode, 't-hl');
              }
              ctx.setRPO('Failover complete', false);
              addLog('ap-south-2 now serving as PRIMARY \u2014 users + orders \u2713', 'ls');
              addLog('RTO \u224835s (detect 5s + promote 20s + redirect 10s)', '');
              addLog('Old primary will rejoin as SECONDARY after recovery', '');
            }
          }
        ]
      },

      "18": {
        group: "Multi-Cluster & DR", icon: "⚡",
        name: 'Active-Active xCluster', title: 'Active-Active xCluster', subtitle: 'Bidirectional xCluster',
        desc: 'Bidirectional xCluster: both clusters act as PRIMARY and accept local writes simultaneously. P-1 (forward) and P-2 (reverse) stream changes in both directions. The REG column in every tablet shows the origin cluster of each row. Conflicts on the same key are resolved via Last-Writer-Wins (LWW) using Hybrid Logical Clocks (HLC).',
        latencies: [
          { lbl: 'Raft commit', cls: 'll', max: 2 },
          { lbl: 'Repl lag', cls: 'lh', max: 65 },
          { lbl: 'LWW resolve', cls: 'll', max: 1 },
          { lbl: 'Txn gap', cls: 'lh', max: 30 }
        ],
        init: (ctx) => {
          S.groups = [
            { id: 'xp1', table: 'users', tnum: 1, range: '0x0000-0x7FFF', leaderNode: 1, term: 4, replicas: [1,2,3], showReg: true,
              data: [[1,'Alice','S1',87,1713289000.100],[4,'David','S1',95,1713289000.400]] },
            { id: 'xp2', table: 'users', tnum: 2, range: '0x8000-0xFFFF', leaderNode: 2, term: 4, replicas: [1,2,3], showReg: true,
              data: [[2,'Bob','S1',92,1713289000.200],[3,'Carol','S1',78,1713289000.300]] },
            { id: 'xs1', table: 'users', tnum: 1, range: '0x0000-0x7FFF', leaderNode: 4, term: 4, replicas: [4,5,6], showReg: true,
              data: [[1,'Alice','S1',87,1713289000.100,'ext'],[4,'David','S1',95,1713289000.400,'ext']] },
            { id: 'xs2', table: 'users', tnum: 2, range: '0x8000-0xFFFF', leaderNode: 5, term: 4, replicas: [4,5,6], showReg: true,
              data: [[2,'Bob','S1',92,1713289000.200,'ext'],[3,'Carol','S1',78,1713289000.300,'ext']] }
          ];
          ctx.rebuildReplicaState();
          ctx.setXClusterMode(true);
          [4,5,6].forEach(n => ctx.setNodeVisibility(n, true));
          [1,2,3].forEach((n,i) => {
            const z = document.querySelector(`#node-${n} .n-zone`); if (z) z.textContent = `ap-south-1${'abc'[i]}`;
            const r = document.querySelector(`#node-${n} .region-label`); if (r) r.textContent = 'ap-south-1';
          });
          [4,5,6].forEach((n,i) => {
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
          ctx.setLag('\u2014'); ctx.setRPO('\u2014', false);
          renderAllTablets();
        },
        steps: [
          {
            label: 'Active-Active Setup',
            desc: 'Both clusters are PRIMARY and accept local writes. P-1 replicates forward (S1\u2192S2), P-2 replicates in reverse (S2\u2192S1). The REG column in each tablet shows which cluster originated the row. EXT badge marks rows that arrived via replication.',
            action: async (ctx) => {
              addLog('ap-south-1 (S1): PRIMARY \u2014 REG=S1 for local writes', 'li');
              addLog('ap-south-2 (S2): PRIMARY \u2014 REG=S2 for local writes', 'li');
              addLog('P-1: forward poller S1\u2192S2 | P-2: reverse poller S2\u2192S1', 'li');
              addLog('REG column tracks origin cluster per row in every tablet', '');
              for (const id of ['xp1','xp2']) ctx.hlTablet(id, S.groups.find(g=>g.id===id).leaderNode, 't-hl');
              await ctx.delay(350);
              for (const id of ['xs1','xs2']) ctx.hlTablet(id, S.groups.find(g=>g.id===id).leaderNode, 't-hl');
            }
          },
          {
            label: 'Local Writes \u2192 Bidirectional Replication',
            desc: 'S1 writes a new row (id=10, Jack, REG=S1) to xp1. Simultaneously S2 writes a new row (id=11, Lena, REG=S2) to xs2. After local Raft commits, P-1 ships Jack\u2019s row to xs1, and P-2 ships Lena\u2019s row to xp2. Both clusters converge with all data.',
            action: async (ctx) => {
              ctx.hlLatRow(0);
              const T10 = 1713289100.100, T11 = 1713289100.150;
              addLog('S1: INSERT id=10 Jack REG=S1 HLC='+T10.toFixed(3)+' \u2192 xp1 (N1)', 'li');
              addLog('S2: INSERT id=11 Lena REG=S2 HLC='+T11.toFixed(3)+' \u2192 xs2 (N5) [simultaneous]', 'li');
              await Promise.all([
                (async () => {
                  ctx.hlTablet('xp1', 1, 't-hl');
                  await Promise.all([
                    ctx.pktTabletToTablet('xp1', 1, 'xp1', 2, 'pk-raft', 280),
                    ctx.pktTabletToTablet('xp1', 1, 'xp1', 3, 'pk-raft', 280)
                  ]);
                  S.groups.find(g=>g.id==='xp1').data.push([10,'Jack','S1',89,T10]);
                  for (const n of [1,2,3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, true); }
                  addLog('xp1 (S1): id=10 Jack committed REG=S1 HLC='+T10.toFixed(3)+' \u2713', 'ls');
                })(),
                (async () => {
                  ctx.hlTablet('xs2', 5, 't-hl');
                  await Promise.all([
                    ctx.pktTabletToTablet('xs2', 5, 'xs2', 4, 'pk-raft', 280),
                    ctx.pktTabletToTablet('xs2', 5, 'xs2', 6, 'pk-raft', 280)
                  ]);
                  S.groups.find(g=>g.id==='xs2').data.push([11,'Lena','S2',73,T11]);
                  for (const n of [4,5,6]) { ctx.hlTablet('xs2', n, 't-hl'); ctx.reRenderTablet('xs2', n, true); }
                  addLog('xs2 (S2): id=11 Lena committed REG=S2 HLC='+T11.toFixed(3)+' \u2713', 'ls');
                })()
              ]);
              setLatency(0, 2);
              await ctx.delay(300);
              ctx.hlLatRow(1);
              addLog('P-1 (forward): shipping id=10 Jack \u2192 xs1 (S2)', 'li');
              addLog('P-2 (reverse): shipping id=11 Lena \u2192 xp2 (S1)', 'li');
              await Promise.all([
                ctx.pktXCluster(1, 'xp1', 1, 'xs1', 4, 900),
                ctx.pktXCluster(2, 'xs2', 5, 'xp2', 2, 900)
              ]);
              S.groups.find(g=>g.id==='xs1').data.push([10,'Jack','S1',89,T10,'ext']);
              for (const n of [4,5,6]) ctx.reRenderTablet('xs1', n, true);
              S.groups.find(g=>g.id==='xp2').data.push([11,'Lena','S2',73,T11,'ext']);
              for (const n of [1,2,3]) ctx.reRenderTablet('xp2', n, true);
              setLatency(1, 45);
              ctx.setLag('~10ms');
              addLog('xs1: Jack (EXT REG=S1 HLC='+T10.toFixed(3)+') | xp2: Lena (EXT REG=S2 HLC='+T11.toFixed(3)+') \u2713', 'ls');
              addLog('Both clusters converged \u2014 bidirectional replication complete', '');
            }
          },
          {
            label: 'Same-Row Conflict',
            desc: 'Both clusters update the same key (id=4) concurrently. S1 sets score=99 (REG=S1, HLC=T1=1713289100.500). S2 sets score=77 (REG=S2, HLC=T2=1713289100.520 \u2014 slightly later). Each commits via Raft locally. The differing HLC values in the tablets reveal the conflict.',
            action: async (ctx) => {
              const T1 = 1713289100.500, T2 = 1713289100.520;
              ctx.hlLatRow(0);
              addLog('S1: UPDATE id=4 score=99 REG=S1 HLC='+T1.toFixed(3)+' \u2192 xp1 (N1)', 'li');
              addLog('S2: UPDATE id=4 score=77 REG=S2 HLC='+T2.toFixed(3)+' \u2192 xs1 (N4) [simultaneous]', 'li');
              await Promise.all([
                (async () => {
                  ctx.hlTablet('xp1', 1, 't-hl');
                  await Promise.all([
                    ctx.pktTabletToTablet('xp1', 1, 'xp1', 2, 'pk-raft', 280),
                    ctx.pktTabletToTablet('xp1', 1, 'xp1', 3, 'pk-raft', 280)
                  ]);
                  const gp1 = S.groups.find(g=>g.id==='xp1');
                  const r = gp1.data.find(x=>x[0]===4);
                  if (r) { r[2]='S1'; r[3]=99; r[4]=T1; delete r[5]; }
                  const di1 = gp1.data.findIndex(x=>x[0]===4);
                  for (const n of [1,2,3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di1); }
                  addLog('xp1: id=4 score=99 REG=S1 HLC='+T1.toFixed(3)+' \u2713', 'ls');
                })(),
                (async () => {
                  ctx.hlTablet('xs1', 4, 't-hl');
                  await Promise.all([
                    ctx.pktTabletToTablet('xs1', 4, 'xs1', 5, 'pk-raft', 280),
                    ctx.pktTabletToTablet('xs1', 4, 'xs1', 6, 'pk-raft', 280)
                  ]);
                  const gs1 = S.groups.find(g=>g.id==='xs1');
                  const r = gs1.data.find(x=>x[0]===4);
                  if (r) { r[2]='S2'; r[3]=77; r[4]=T2; delete r[5]; }
                  const di2 = gs1.data.findIndex(x=>x[0]===4);
                  for (const n of [4,5,6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di2); }
                  addLog('xs1: id=4 score=77 REG=S2 HLC='+T2.toFixed(3)+' \u2713', 'ls');
                })()
              ]);
              setLatency(0, 2);
              addLog('xp1 HLC='+T1.toFixed(3)+' vs xs1 HLC='+T2.toFixed(3)+' \u2014 same key, different versions', 'lw');
            }
          },
          {
            label: 'Replication + LWW Resolution',
            desc: 'P-1 ships S1\u2019s update (score=99, T1) to xs1. P-2 ships S2\u2019s update (score=77, T2) to xp1. Both clusters now see both versions. LWW: T2 (1713289100.520) > T1 (1713289100.500) \u2014 S2 write wins. The winning row is applied everywhere; WAL entries from the peer are tagged with origin_uuid to prevent re-replication loops.',
            action: async (ctx) => {
              const T1 = 1713289100.500, T2 = 1713289100.520;
              ctx.hlLatRow(1);
              addLog('P-1 (forward): id=4 S1 score=99 HLC='+T1.toFixed(3)+' \u2192 xs1', 'li');
              addLog('P-2 (reverse): id=4 S2 score=77 HLC='+T2.toFixed(3)+' \u2192 xp1', 'li');
              await Promise.all([
                ctx.pktXCluster(1, 'xp1', 1, 'xs1', 4, 900),
                ctx.pktXCluster(2, 'xs1', 4, 'xp1', 1, 900)
              ]);
              setLatency(1, 45);
              addLog('Conflict: xp1 HLC='+T1.toFixed(3)+' vs xs1 HLC='+T2.toFixed(3)+' \u2014 applying LWW', 'lw');
              ctx.hlLatRow(2);
              await ctx.delay(400);
              ctx.hlPoller(1, 'applying');
              ctx.hlPoller(2, 'applying');
              await ctx.delay(500);
              ctx.hlPoller(1, null);
              ctx.hlPoller(2, null);
              const gp1 = S.groups.find(g=>g.id==='xp1');
              const r1 = gp1.data.find(x=>x[0]===4);
              if (r1) { r1[2]='S2'; r1[3]=77; r1[4]=T2; r1[5]='ext'; }
              const di1 = gp1.data.findIndex(x=>x[0]===4);
              for (const n of [1,2,3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di1); }
              const gs1 = S.groups.find(g=>g.id==='xs1');
              const r2 = gs1.data.find(x=>x[0]===4);
              if (r2) { r2[2]='S2'; r2[3]=77; r2[4]=T2; delete r2[5]; }
              const di2 = gs1.data.findIndex(x=>x[0]===4);
              for (const n of [4,5,6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di2); }
              setLatency(2, 1);
              addLog('LWW: '+T2.toFixed(3)+' > '+T1.toFixed(3)+' \u2014 S2 write wins', 'ls');
              addLog('xp1 id=4: REG=S2 score=77 HLC='+T2.toFixed(3)+' (EXT from S2) \u2713', 'ls');
              addLog('xs1 id=4: REG=S2 score=77 HLC='+T2.toFixed(3)+' (local winner) \u2713', 'ls');
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
                  for (const n of [1,2,3]) { ctx.hlTablet('xp1', n, 't-hl'); ctx.reRenderTablet('xp1', n, di); }
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
                  for (const n of [1,2,3]) { ctx.hlTablet('xp2', n, 't-hl'); ctx.reRenderTablet('xp2', n, di); }
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
              for (const n of [4,5,6]) { ctx.hlTablet('xs1', n, 't-hl'); ctx.reRenderTablet('xs1', n, di1); }
              ctx.setLat(1, 45);
              addLog('⚠ Partial-TX window — S2 read sees inconsistent state:', 'lw');
              addLog('  SELECT score WHERE id=1 → 100 (new) ✓', 'lw');
              addLog('  SELECT score WHERE id=3 → 78 (pre-TX stale) ✗', 'lw');
              for (const n of [4,5,6]) ctx.hlTablet('xs2', n, 't-hl2');
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
              for (const n of [4,5,6]) { ctx.hlTablet('xs2', n, 't-hl'); ctx.reRenderTablet('xs2', n, di2); }
              ctx.setLat(1, 65);
              ctx.setLat(3, 20);
              addLog('xs2 id=3 Carol score=100 ✓ — S2 now consistent', 'ls');
              addLog('⚠ xCluster delivers no cross-tablet commit ordering — apps must tolerate this gap', 'lw');
            }
          }
        ]
      },

      "19": {
        group: "Storage & Scalability", icon: "🗄️",
        name: 'DocDB Storage', title: 'DocDB Storage', subtitle: 'LSM + MVCC internals',
        desc: 'DocDB is YugabyteDB’s RocksDB-based storage engine. Every write is an immutable append — updates create new versions, deletes write tombstones. MVCC keeps all versions for consistent snapshot reads without locks.',
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
                for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
              }
              for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
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
                for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
              }
              for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
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
                for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
              }
              for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n); }
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
                for (const n of [1,2,3]) { const rs = S.replicaState['tg1']?.[n]; if (rs) rs.provisionalRows = []; }
              }
              for (const n of [1,2,3]) { ctx.hlTablet('tg1', n, 't-hl'); ctx.reRenderTablet('tg1', n, true); }
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
                { label: 'Reader-A', ts: '1713289200.200', found: true,  value: 'score=95  (T1 WRITE)' },
                { label: 'Reader-B', ts: '1713289200.400', found: true,  value: 'score=99  (T2 WRITE)' },
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

      "20": {
        group: "Geo-distribution", icon: "🌍",
        name: 'Multi-Region', title: 'Multi-Region', subtitle: 'RF=3 · Leader preference · Failure simulation',
        desc: 'A single YugabyteDB cluster spanning US-East, EU-West, and APAC. The <b>orders</b> table has 3 shards, each replicated to all 3 regions (RF=3). Pin leaders to any region, simulate a regional outage, and observe Raft re-election and latency impact in real time.',
        latencies: [
          { lbl: 'Client → Leader',  cls: 'll', max: 200 },
          { lbl: 'Read Latency',     cls: 'll', max: 200 },
          { lbl: 'Raft Replication', cls: 'lm', max: 300 },
          { lbl: 'Write Latency',    cls: 'lm', max: 300 },
        ],
        guidedTour: [
          { text: "9 nodes across 3 regions. The <b>orders</b> table has 3 shards — each replicated to all 3 regions (RF=3).", element: ".canvas-wrap" },
          { text: "Use <b>📍 preference buttons</b> to pin leaders to any region. Leaders move instantly and latency reflects the new topology.", element: "#extra-btns" },
          { text: "Click <b>⚡ Fail</b> to take the preferred region offline. Raft elects new leaders in a surviving region automatically.", element: "#extra-btns" },
          { text: "Step through <b>Read</b> and <b>Write</b> to see animated packets and live latency updates reflecting the current state.", element: ".step-bar" }
        ],
        extraBtns: [
          { id: 'mr-pref-us',   label: '📍 US-East',    cls: 'btn-info', cb: 'mrSetPrefUs',   disabled: false },
          { id: 'mr-pref-eu',   label: '📍 EU-West',    cls: 'btn-info', cb: 'mrSetPrefEu',   disabled: false },
          { id: 'mr-pref-apac', label: '📍 APAC',       cls: 'btn-info', cb: 'mrSetPrefApac', disabled: false },
          { id: 'mr-fail',      label: '⚡ Fail US-East', cls: 'btn-warn', cb: 'mrFailRegion', disabled: false },
          { id: 'mr-restore',   label: '↺ Restore',     cls: 'btn-ok',   cb: 'mrRestore',     disabled: true  },
        ],
        init: (ctx) => {
          window._mrPrefs  = ['us']; // reset to single-region default
          window._mrFailed = null;
          window._mrCtx    = ctx;
          window._mrPanelDone = {};

          ctx.setCanvasGeoMode(true);
          for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, true);
          ctx.setNodeRegion(1, 'us', 'us-east-1a'); ctx.setNodeRegion(2, 'us', 'us-east-1b'); ctx.setNodeRegion(3, 'us', 'us-east-1c');
          ctx.setNodeRegion(4, 'eu', 'eu-central-1a'); ctx.setNodeRegion(5, 'eu', 'eu-central-1b'); ctx.setNodeRegion(6, 'eu', 'eu-central-1c');
          ctx.setNodeRegion(7, 'apac', 'ap-south-1a'); ctx.setNodeRegion(8, 'apac', 'ap-south-1b'); ctx.setNodeRegion(9, 'apac', 'ap-south-1c');

          S.groups = [
            { id: 'mr1', table: 'orders', tnum: 1, range: '[0x0000, 0x5554]', leaderNode: 1, term: 4, replicas: [1,4,7],
              data: [[1042,'Widget Pro','Alice','DONE',1713.241],[1087,'Keyboard','Bob','SHIP',1713.298],[1103,'Monitor','Carol','PEND',1713.341]] },
            { id: 'mr2', table: 'orders', tnum: 2, range: '[0x5555, 0xAAA9]', leaderNode: 2, term: 4, replicas: [2,5,8],
              data: [[2011,'Headset','Dave','DONE',1713.188],[2056,'SSD 1TB','Eve','DONE',1713.221],[2098,'Cable','Frank','PEND',1713.317]] },
            { id: 'mr3', table: 'orders', tnum: 3, range: '[0xAAAA, 0xFFFF]', leaderNode: 3, term: 4, replicas: [3,6,9],
              data: [[3007,'Desk Lamp','Grace','SHIP',1713.163],[3049,'Notebook','Hank','DONE',1713.275],[3091,'Pen Set','Iris','PEND',1713.359]] },
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
          ...[0,1,2].flatMap(gi => {
            const ranges = ['[0x0000,0x5554]','[0x5555,0xAAA9]','[0xAAAA,0xFFFF]'];
            const hrange = ['0x0000–0x5554','0x5555–0xAAA9','0xAAAA–0xFFFF'][gi];
            return [
              // ── READ step ──
              {
                label: () => `Shard-${gi+1} Read · ${ranges[gi]} · ${_mrLabel[_mrEffReg(gi)]}`,
                desc: () => {
                  const eff = _mrEffReg(gi);
                  const { cl, read } = _mrLatsAll()[gi];
                  return `Client sends a <b>read</b> to the <b>shard-${gi+1}</b> leader in <b>${_mrLabel[eff]}</b>. ${eff === 'us' ? 'Leader is in the same region — minimal latency.' : `Cross-region hop to ${_mrLabel[eff]} — round-trip ~${read}ms.`} Latency bars update on completion.`;
                },
                action: async (ctx) => {
                  _mrResetLatBars();
                  const eff = _mrEffReg(gi), leaderNode = _mrLeader(gi);
                  const { cl, read } = _mrLatsAll()[gi];
                  const tid = `mr${gi+1}`;
                  addLog(`READ  shard-${gi+1} → Node ${leaderNode} (${_mrLabel[eff]}) [${hrange}]`, 'li');
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
                label: () => `Shard-${gi+1} Write · ${ranges[gi]} · ${_mrLabel[_mrEffReg(gi)]}`,
                desc: () => {
                  const eff = _mrEffReg(gi), fail = window._mrFailed;
                  const { cl, raft, write } = _mrLatsAll()[gi];
                  const followers = _mrAll.filter(r => r !== eff && r !== fail);
                  return `Client sends a <b>write</b> to the <b>shard-${gi+1}</b> leader in <b>${_mrLabel[eff]}</b>. The leader replicates via Raft to <b>${followers.map(r => _mrLabel[r]).join(' &amp; ')}</b> — quorum in ~${raft}ms, end-to-end write ~${write}ms.`;
                },
                action: async (ctx) => {
                  _mrResetLatBars();
                  const eff = _mrEffReg(gi), leaderNode = _mrLeader(gi), fail = window._mrFailed;
                  const { cl, raft, write } = _mrLatsAll()[gi];
                  const followers = _mrAll.filter(r => r !== eff && r !== fail);
                  const followerNodes = followers.map(r => _mrNodes[r][gi]);
                  const tid = `mr${gi+1}`;
                  addLog(`WRITE shard-${gi+1} → Node ${leaderNode} (${_mrLabel[eff]}) [${hrange}]`, 'li');
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
                  const newRow = [nextId, items[Math.floor(Math.random()*5)], customers[Math.floor(Math.random()*5)], 'PEND', performance.now()/1000];
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
        group: "Geo-distribution", icon: "🌎",
        name: 'Geo-Partition', title: 'Geo-Partition', subtitle: 'Multi-region geo(row) pinning',
        filterTable: 'users',
        desc: 'YugabyteDB pins rows to specific regions via a <b>tablegroup</b> per region. Each Raft group has 3 replicas in the same region — reads and writes are always local. Region-specific clients see sub-5ms latency; a global client crossing regions pays the full cross-region RTT penalty.',
        latencies: [
          { lbl: 'Client → Leader', cls: 'll', max: 200 },
          { lbl: 'Read Latency',    cls: 'll', max: 200 },
          { lbl: 'Raft Replication', cls: 'lm', max: 50  },
          { lbl: 'Write Latency',   cls: 'lm', max: 200 },
        ],
        init: (ctx) => {
          ctx.setCanvasGeoMode(true);
          document.getElementById('canvas-wrap').classList.add('geo-partition');
          for (let n = 1; n <= 9; n++) ctx.setNodeVisibility(n, true);
          ctx.setNodeRegion(1, 'us', 'US-East'); ctx.setNodeRegion(2, 'us', 'US-East'); ctx.setNodeRegion(3, 'us', 'US-East');
          ctx.setNodeRegion(4, 'eu', 'Europe');  ctx.setNodeRegion(5, 'eu', 'Europe');  ctx.setNodeRegion(6, 'eu', 'Europe');
          ctx.setNodeRegion(7, 'apac', 'APAC');  ctx.setNodeRegion(8, 'apac', 'APAC');  ctx.setNodeRegion(9, 'apac', 'APAC');
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
            { reg: 'us',   elId: 'geo-client-us',   tg: 'tg-us',   leader: 1, followers: [2,3], lbl: 'US-East', raft: 2 },
            { reg: 'eu',   elId: 'geo-client-eu',   tg: 'tg-eu',   leader: 4, followers: [5,6], lbl: 'EU-West', raft: 2 },
            { reg: 'apac', elId: 'geo-client-apac', tg: 'tg-apac', leader: 7, followers: [8,9], lbl: 'APAC',    raft: 2 },
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
                const names = { us: ['Alice','Bob'], eu: ['Anna','Hans'], apac: ['Raj','Mei'] };
                const data  = { us: [12,'US',79], eu: [11,'DE',90], apac: [10,'IN',85] };                const [score, regCode, id2] = data[reg];
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
      }
    };
