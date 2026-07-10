'use strict';

//  HELP & KEYBOARD SHORTCUTS
// ════════════════════════════════════════════

let guideEnabled = false;

function toggleHelp() {
  const modal = document.getElementById('help-modal');
  if (modal) modal.classList.toggle('active');
}

window.toggleGuideSetting = function () {
  const check = document.getElementById('guide-toggle-check');
  guideEnabled = check ? check.checked : false;

  if (!guideEnabled) {
    closeTour();
  } else if (currentScenario && currentScenario.guidedTour) {
    renderTour(currentScenario);
  }
}

function renderTour(s) {
  if (!guideEnabled) return;
  const guide = document.getElementById('tour-guide');
  const content = document.getElementById('tour-content');
  if (!guide || !content) return;

  if (!s || !s.guidedTour) {
    guide.classList.remove('active');
    return;
  }

  content.innerHTML = s.guidedTour.map((step, idx) => `
        <div class="tour-step">
            <div class="tour-step-num">${idx + 1}</div>
            <div class="tour-step-txt">${step.text}</div>
        </div>
    `).join('');

  guide.classList.add('active');
}

function closeTour() {
  const guide = document.getElementById('tour-guide');
  if (guide) guide.classList.remove('active');
}


let S;
function freshState(numNodes = 9) {
  const nodes = [];
  const nodeStats = {};
  for (let i = 1; i <= numNodes; i++) {
    nodes.push({ id: i, alive: true });
    nodeStats[i] = { writes: 0, rows: 9, logIdx: 127, lagRows: 0 };
  }
  return {
    nodes,
    partitioned: [],   // node ids that are partitioned
    groups: JSON.parse(JSON.stringify(INITIAL_GROUPS)),
    replicaState: buildRS(INITIAL_GROUPS),
    term: 4,
    transactions: [], // { id, status, hb }
    nodeStats,
    compactMode: false
  };
}
function buildRS(groups = INITIAL_GROUPS) {
  const rs = {};
  for (const g of groups) {
    rs[g.id] = {};
    for (const n of g.replicas)
      rs[g.id][n] = {
        mem: 15 + Math.random() * 28,
        ss: 22 + Math.random() * 40,
        ssts: [Math.floor(20 + Math.random() * 30)], // Initial SST file size
        newRows: [],
        provisionalRows: [],
        readRow: undefined,
        safePulse: false
      };
  }
  return rs;
}
// ════════════════════════════════════════════
//  FAILURE DASHBOARD STATE
// ════════════════════════════════════════════

let fdAutoRunning = false;
let fdAutoTimer = null;
let fdWriteTotal = 0, fdWriteOk = 0, fdWriteLost = 0;
let fdCurrentTab = 'node'; // 'node' | 'part'

function fdReset() {
  fdAutoRunning = false;
  if (fdAutoTimer) { clearInterval(fdAutoTimer); fdAutoTimer = null; }
  fdWriteTotal = 0; fdWriteOk = 0; fdWriteLost = 0;
  const btn = document.getElementById('btn-fd-run');
  if (btn) btn.textContent = '▶ Start Writes';
  document.getElementById('fd-write-total').textContent = '0';
  document.getElementById('fd-write-ok').textContent = '0';
  document.getElementById('fd-write-lost').textContent = '0';
  document.getElementById('fd-write-lag').textContent = '0';
  document.getElementById('fd-write-log').innerHTML = '';
  // reset node stats (limit to first 3 as in reference.html)
  S.nodeStats = {};
  for (let n = 1; n <= 3; n++) {
    S.nodeStats[n] = { writes: 0, rows: 9, logIdx: 127, lagRows: 0 };
  }
  fdRenderNodes();
}

function fdToggleAutoWrite() {
  fdAutoRunning = !fdAutoRunning;
  const btn = document.getElementById('btn-fd-run');
  if (fdAutoRunning) {
    btn.textContent = '⏸ Pause Writes';
    fdAutoTimer = setInterval(fdAutoWrite, 1200 / Math.max(speedVal, 0.5));
  } else {
    btn.textContent = '▶ Start Writes';
    if (fdAutoTimer) { clearInterval(fdAutoTimer); fdAutoTimer = null; }
  }
}

function fdAutoWrite() {
  const masterNode = S.groups.find(g => g.id === 'tg1').leaderNode;
  const canReach = (n) => S.nodes.find(x => x.id === n).alive && !S.partitioned.includes(n);
  fdWriteTotal++;
  document.getElementById('fd-write-total').textContent = fdWriteTotal;

  const masterAlive = canReach(masterNode);
  // Try to find a viable leader (alive, not partitioned) for tg1
  const viableLeader = S.groups.find(g => g.id === 'tg1').leaderNode;
  const canWrite = canReach(viableLeader);

  if (canWrite) {
    fdWriteOk++;
    document.getElementById('fd-write-ok').textContent = fdWriteOk;
    // Increment stats for alive, reachable nodes (limit to first 3)
    for (let n = 1; n <= 3; n++) {
      if (canReach(n)) {
        S.nodeStats[n].writes++;
        S.nodeStats[n].rows++;
        S.nodeStats[n].logIdx++;
      } else {
        // This node missed the write — lag grows
        S.nodeStats[n].lagRows++;
      }
    }
    const maxLag = Math.max(...[1, 2, 3].map(n => S.nodeStats[n].lagRows));
    document.getElementById('fd-write-lag').textContent = maxLag;
    fdAddWriteEntry('ok', `w#${fdWriteTotal} → TS-${viableLeader} leader · rows+1 on all live nodes`);
  } else {
    fdWriteLost++;
    document.getElementById('fd-write-lost').textContent = fdWriteLost;
    fdAddWriteEntry('skip', `w#${fdWriteTotal} → REJECTED — no quorum available`);
  }
  fdRenderNodes();
}

function fdAddWriteEntry(type, txt) {
  const log = document.getElementById('fd-write-log');
  const el = document.createElement('div');
  el.className = 'fw-entry';
  const t = String(fdWriteTotal).padStart(3, '0');
  const badge = type === 'ok' ? 'fw-ok' : type === 'skip' ? 'fw-skip' : 'fw-sync';
  const label = type === 'ok' ? 'OK' : type === 'skip' ? 'SKIP' : 'SYNC';
  el.innerHTML = `<div class="fw-ts">#${t}</div><div class="fw-badge ${badge}">${label}</div><div class="fw-txt">${txt}</div>`;
  log.appendChild(el);
  // Keep last 30 entries
  while (log.children.length > 30) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function fdRenderNodes() {
  const container = document.getElementById('fd-nodes');
  container.innerHTML = '';
  for (let n = 1; n <= 3; n++) {
    const node = S.nodes.find(x => x.id === n);
    if (!node) continue;
    const isPartitioned = S.partitioned.includes(n);
    const isSyncing = node.alive && S.nodeStats[n].lagRows > 0 && !isPartitioned && !(!node.alive);
    const statusClass = !node.alive ? 'fdn-dead' : isPartitioned ? 'fdn-part' : isSyncing ? 'fdn-syncing' : 'fdn-ok';
    const statusTxt = !node.alive ? 'DEAD' : isPartitioned ? 'PARTITIONED' : isSyncing ? 'SYNCING' : 'HEALTHY';
    const st = S.nodeStats[n];
    const maxLog = Math.max(...[1, 2, 3].map(x => S.nodeStats[x].logIdx));
    const lagPct = maxLog > 127 ? Math.max(0, 100 - (st.lagRows / Math.max(1, maxLog - 127)) * 100) : 100;
    const isBehind = st.lagRows > 5;
    const isFarBehind = st.lagRows > 20;
    const lagClass = isFarBehind ? 'far-behind' : isBehind ? 'behind' : '';
    const syncPct = st.lagRows > 0 && !(!node.alive) && !isPartitioned ? Math.min(100, (st.writes / (st.writes + st.lagRows)) * 100) : 0;

    const card = document.createElement('div');
    card.className = `fd-node ${statusClass}`;
    card.innerHTML = `
      <div class="fdn-header">
        <div class="fdn-dot"></div>
        <div class="fdn-name">TServer-${n}</div>
        <div class="fdn-status">${statusTxt}</div>
      </div>
      <div class="fdn-stats">
        <div class="fdn-stat"><div class="fdn-stat-lbl">Writes Applied</div><div class="fdn-stat-val">${st.writes}</div></div>
        <div class="fdn-stat"><div class="fdn-stat-lbl">Row Count</div><div class="fdn-stat-val">${st.rows}</div></div>
        <div class="fdn-stat"><div class="fdn-stat-lbl">Raft LogIdx</div><div class="fdn-stat-val">${st.logIdx}</div></div>
        <div class="fdn-stat"><div class="fdn-stat-lbl">Log Lag</div><div class="fdn-stat-val" style="color:${isFarBehind ? 'var(--err)' : isBehind ? 'var(--warn)' : 'var(--ok)'}">${st.lagRows}</div></div>
      </div>
      <div class="fdn-lag">
        <div class="fdn-lag-fill ${lagClass}" style="width:${lagPct}%"></div>
      </div>
      ${isSyncing ? `<div class="fdn-sync-bar"><div class="fdn-sync-lbl">Catch-up</div><div class="fdn-sync-track"><div class="fdn-sync-fill" style="width:${syncPct}%"></div></div></div>` : ''}
    `;
    container.appendChild(card);
  }
}

let fdCatchingUp = {};
async function fdCatchUp(nodeId) {
  if (fdCatchingUp[nodeId]) return fdCatchingUp[nodeId];
  const ns = S.nodeStats[nodeId];
  if (!ns || ns.lagRows === 0) return;

  fdCatchingUp[nodeId] = (async () => {
    ns.syncing = true;
    const totalToCatch = ns.lagRows;
    const steps = 15;
    const perStep = Math.ceil(totalToCatch / steps);

    while (ns.lagRows > 0) {
      await new Promise(r => setTimeout(r, 200 / Math.max(speedVal, 0.5)));
      const caught = Math.min(perStep, ns.lagRows);
      ns.lagRows -= caught;
      ns.rows += caught;
      ns.logIdx += caught;
      ns.writes += caught;

      const maxLag = Math.max(...[1, 2, 3].map(x => S.nodeStats[x]?.lagRows || 0));
      document.getElementById('fd-write-lag').textContent = maxLag;
      fdAddWriteEntry('sync', `TS-${nodeId} catch-up: +${caught} entries · lag=${ns.lagRows}`);
      fdRenderNodes();
    }
    ns.lagRows = 0;
    ns.syncing = false;
    fdRenderNodes();
    delete fdCatchingUp[nodeId];
  })();

  return fdCatchingUp[nodeId];
}

function _shardingNodeHTML(state, loadPct, cpuPct, latencyMs) {
  const stateMap = {
    idle:      { icon: '🖥️', status: 'Standing by',       statusColor: 'var(--txt3)' },
    normal:    { icon: '🖥️', status: 'Processing writes', statusColor: '#22c55e' },
    saturated: { icon: '⚠️', status: 'Overloaded',         statusColor: '#ef4444' },
  };
  const s = stateMap[state] || stateMap.idle;
  const barColor = loadPct >= 80 ? '#ef4444' : loadPct >= 50 ? '#f97316' : loadPct >= 25 ? '#eab308' : '#22c55e';
  let h = `<div style="padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;box-sizing:border-box;min-height:80px;">`;
  h += `<div style="font-size:26px;">${s.icon}</div>`;
  h += `<div style="font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:0.08em;">Single Node</div>`;
  h += `<div style="font-size:11px;color:${s.statusColor};font-weight:600;">${s.status}</div>`;
  if (loadPct > 0) {
    h += `<div style="width:100%;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:10px;color:var(--txt3);">Write Load</span><span style="font-size:10px;color:${barColor};font-weight:700;">${loadPct}%</span></div><div style="width:100%;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${loadPct}%;background:${barColor};border-radius:3px;transition:width 0.8s ease,background 0.8s ease;"></div></div></div>`;
    h += `<div style="width:100%;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:10px;color:var(--txt3);">CPU</span><span style="font-size:10px;color:#22d3ee;font-weight:700;">${cpuPct}%</span></div><div style="width:100%;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${cpuPct}%;background:#22d3ee;border-radius:3px;transition:width 0.8s ease;"></div></div></div>`;
    if (latencyMs > 0) h += `<div style="font-size:11px;margin-top:2px;"><span style="color:var(--txt3);">latency: </span><span style="font-weight:700;color:${loadPct >= 80 ? '#ef4444' : 'var(--txt2)'};">${latencyMs} ms</span></div>`;
  }
  h += `</div>`;
  return h;
}

function renderShardingPerfPanel({ nodes = 1, shards = 6, throughput = 10000, maxThroughput = 60000, latency = 28, maxLatency = 100, nodeLoads = [], cpuLoads = [], insight = '' }) {
  const container = document.getElementById('shp-content');
  if (!container) return;

  const allNodes = [1, 2, 3, 4, 5, 6];
  const nodeGridHtml = allNodes.map(n => {
    const wInfo = nodeLoads.find(x => x.node === n);
    const cInfo = cpuLoads.find(x => x.node === n);
    const isActive = !!wInfo;
    const wPct = wInfo ? wInfo.pct : 0;
    const cPct = cInfo ? cInfo.pct : 0;
    const loadClass = wPct >= 80 ? 'load-critical' : wPct >= 50 ? 'load-high' : wPct >= 25 ? 'load-medium' : 'load-low';
    return `<div class="shp-node-box ${isActive ? 'active ' + loadClass : 'inactive'}">
      <div class="shp-node-lbl">TS-${n}</div>
      <div class="shp-node-load-bar"><div class="shp-node-load-fill" style="width:${isActive ? wPct : 0}%"></div></div>
      <div class="shp-node-load-pct">${isActive ? wPct + '%' : '—'} WR</div>
      ${isActive ? `<div class="shp-cpu-bar"><div class="shp-cpu-fill" style="width:${cPct}%"></div></div><div class="shp-cpu-pct">${cPct}% CPU</div>` : ''}
    </div>`;
  }).join('');

  const tpFill = Math.min(100, (throughput / maxThroughput) * 100);
  const latFill = Math.min(100, (latency / maxLatency) * 100);
  const ndFill = Math.min(100, (nodes / 6) * 100);
  const avgCpu = cpuLoads.length ? Math.round(cpuLoads.reduce((s, x) => s + x.pct, 0) / cpuLoads.length) : 0;

  container.innerHTML = `
    <div class="shp-section-lbl">Node Write Load &amp; CPU</div>
    <div class="shp-node-grid">${nodeGridHtml}</div>
    <div class="shp-divider"></div>
    <div class="shp-metric-row">
      <div class="shp-metric-lbl">Throughput</div>
      <div class="shp-metric-track"><div class="shp-metric-fill tp" style="width:${tpFill}%"></div></div>
      <div class="shp-metric-val">${throughput.toLocaleString()} /sec</div>
    </div>
    <div class="shp-metric-row">
      <div class="shp-metric-lbl">Write Latency</div>
      <div class="shp-metric-track"><div class="shp-metric-fill lat" style="width:${latFill}%"></div></div>
      <div class="shp-metric-val">${latency} ms avg</div>
    </div>
    <div class="shp-metric-row">
      <div class="shp-metric-lbl">Avg CPU</div>
      <div class="shp-metric-track"><div class="shp-metric-fill cpu" style="width:${avgCpu}%"></div></div>
      <div class="shp-metric-val">${avgCpu}%</div>
    </div>
    <div class="shp-metric-row">
      <div class="shp-metric-lbl">Active Nodes</div>
      <div class="shp-metric-track"><div class="shp-metric-fill nd" style="width:${ndFill}%"></div></div>
      <div class="shp-metric-val">${nodes} of 6 nodes</div>
    </div>
    ${insight ? `<div class="shp-insight">${insight}</div>` : ''}`;
}

function renderHaPanel({ nodes = [], rf = 3, quorum = true, availability = 100, phase = 'healthy', systems = null }) {
  const container = document.getElementById('hap-content');
  if (!container) return;

  // Split-view mode: two live systems shown side by side
  if (systems) {
    const colsHtml = systems.map(sys => {
      const aliveCount = sys.nodes.filter(n => n.alive).length;
      const ok = sys.available;
      const colCls = ok ? ' hap-sys-ok' : ' hap-sys-err';
      const badgeCls = ok ? 'hap-cmp-ok' : 'hap-cmp-err';
      const badgeTxt = ok ? '● AVAILABLE' : '✕ OUTAGE';
      const nodesHtml = sys.nodes.map(n => {
        const cls = n.alive ? 'hap-node-ok' : 'hap-node-dead';
        const dot = n.alive ? '●' : '✕';
        return `<div class="hap-node-box ${cls}">
          <div class="hap-nd-dot">${dot}</div>
          <div class="hap-nd-name">${n.name ?? `TS-${n.id}`}</div>
          <div class="hap-nd-lbl">${n.alive ? 'OK' : 'DOWN'}</div>
        </div>`;
      }).join('');
      return `<div class="hap-sys-col${colCls}">
        <div class="hap-sys-title">${sys.label}</div>
        <div class="hap-node-grid">${nodesHtml}</div>
        <div class="hap-sys-badge ${badgeCls}">${badgeTxt}</div>
        <div class="hap-sys-detail">${sys.detail || ''}</div>
      </div>`;
    }).join('<div class="hap-sys-vs">vs</div>');
    container.innerHTML = `<div class="hap-sys-row">${colsHtml}</div>`;
    return;
  }

  // Classic single-cluster mode
  const aliveCount = nodes.filter(n => n.alive).length;
  const totalNodes = nodes.length;
  const overallOk = quorum && aliveCount > 0;
  const badgeCls = overallOk ? 'hap-badge-ok' : 'hap-badge-err';
  const badgeTxt = overallOk ? '● AVAILABLE' : '✕ OUTAGE';
  const quorumTxt = `${aliveCount} of ${totalNodes} nodes alive — quorum ${quorum ? 'held ✓' : 'LOST ✗'}`;
  const nodeGridHtml = nodes.map(n => {
    const cls = n.alive ? 'hap-node-ok' : 'hap-node-dead';
    const dot = n.alive ? '●' : '✕';
    const lbl = n.alive ? `${n.leaders ?? 0}L` : 'DOWN';
    return `<div class="hap-node-box ${cls}">
      <div class="hap-nd-dot">${dot}</div>
      <div class="hap-nd-name">TS-${n.id}</div>
      <div class="hap-nd-lbl">${lbl}</div>
    </div>`;
  }).join('');
  const rf3Ok = quorum;
  const rf1Ok = aliveCount === totalNodes;
  const rf3StatusCls = rf3Ok ? 'hap-cmp-ok' : 'hap-cmp-err';
  const rf1StatusCls = rf1Ok ? 'hap-cmp-ok' : 'hap-cmp-err';
  const rf3Txt  = rf3Ok ? '● Serving normally' : '✕ OUTAGE';
  const rf1Txt  = rf1Ok ? '● Serving normally' : '✕ TOTAL OUTAGE';
  const rf3Note = rf3Ok ? `${aliveCount}/${totalNodes} alive — quorum held` : 'No quorum';
  const rf1Note = rf1Ok ? 'All nodes alive' : `${totalNodes - aliveCount} node(s) down — data unreachable`;
  const rf1Emphasis = !rf1Ok ? ' hap-cmp-emphasis' : '';
  container.innerHTML = `
    <div class="hap-top-row">
      <div class="hap-avail-badge ${badgeCls}">${badgeTxt}</div>
      <div class="hap-quorum-txt">${quorumTxt}</div>
    </div>
    <div class="hap-section-lbl">Node Health</div>
    <div class="hap-node-grid">${nodeGridHtml}</div>
    <div class="hap-divider"></div>
    <div class="hap-section-lbl">Why Replication Matters</div>
    <div class="hap-compare-row">
      <div class="hap-cmp-box">
        <div class="hap-cmp-title">RF=${rf} — this cluster</div>
        <div class="hap-cmp-status ${rf3StatusCls}">${rf3Txt}</div>
        <div class="hap-cmp-note">${rf3Note}</div>
      </div>
      <div class="hap-cmp-box${rf1Emphasis}">
        <div class="hap-cmp-title">RF=1 — no replication</div>
        <div class="hap-cmp-status ${rf1StatusCls}">${rf1Txt}</div>
        <div class="hap-cmp-note">${rf1Note}</div>
      </div>
    </div>`;
}

function renderSnapshotViz({ masterPhase = 'idle', masterOp = '', tablets = [], hlcNow = '', tSnap = '', waitPct = -1, phaseLabel = '', manifest = '' }) {
  const panel = document.getElementById('snap-viz-panel');
  if (panel && panel.dataset.vizType !== 'snapshot') {
    panel.dataset.vizType = 'snapshot';
    panel.innerHTML = `
      <div class="svp-left">
        <div class="svp-master-row">
          <div class="svp-master" id="svp-master">
            <div class="svp-m-label">YB-Master</div>
            <div class="svp-m-op" id="svp-m-op">—</div>
          </div>
        </div>
        <div class="svp-arrows-row">
          <div class="svp-arrow" id="svp-arrow-1"></div>
          <div class="svp-arrow" id="svp-arrow-2"></div>
          <div class="svp-arrow" id="svp-arrow-3"></div>
        </div>
        <div class="svp-tablets-row">
          ${[1,2,3].map(i => `
          <div class="svp-tablet" id="svp-tab-${i}">
            <div class="svp-t-name">Tablet-${i}</div>
            <div class="svp-t-range">${['0x0000–0x5554','0x5555–0xAAAA','0xAAAB–0xFFFF'][i-1]}</div>
            <div class="svp-t-phase" id="svp-phase-${i}">— idle —</div>
            <div class="svp-t-bar"><div class="svp-t-fill" id="svp-fill-${i}"></div></div>
          </div>`).join('')}
        </div>
      </div>
      <div class="svp-right">
        <div id="svp-hlc-panel" class="svp-hlc-panel"></div>
      </div>`;
  }
  const masterEl = document.getElementById('svp-master');
  if (masterEl) {
    masterEl.className = `svp-master${masterPhase !== 'idle' ? ' active' : ''}`;
    const opEl = document.getElementById('svp-m-op');
    if (opEl) opEl.textContent = masterOp || '—';
  }
  const phaseMap = {
    idle:        { cls: '',            label: '— idle —',              fill: 0   },
    rpc:         { cls: 'phase-rpc',   label: '⚡ RPC received',       fill: 33  },
    flushing:    { cls: 'phase-flush', label: '⬇ Flushing MemTable…', fill: 66  },
    hardlinking: { cls: 'phase-snap',  label: '🔗 Hardlinking SSTs…', fill: 88  },
    done:        { cls: 'phase-done',  label: '✓ Snapshot complete',   fill: 100 },
  };
  tablets.forEach(t => {
    const tabEl   = document.getElementById(`svp-tab-${t.id}`);
    const phaseEl = document.getElementById(`svp-phase-${t.id}`);
    const fillEl  = document.getElementById(`svp-fill-${t.id}`);
    const pm = phaseMap[t.phase] || phaseMap.idle;
    if (tabEl)   tabEl.className   = `svp-tablet ${pm.cls}`;
    if (phaseEl) phaseEl.textContent = pm.label;
    if (fillEl)  fillEl.style.width  = pm.fill + '%';
  });
  const broadcasting = tablets.some(t => t.phase === 'rpc');
  [1, 2, 3].forEach(i => {
    const arr = document.getElementById(`svp-arrow-${i}`);
    if (!arr) return;
    if (broadcasting) {
      arr.classList.add('broadcasting');
    } else {
      arr.classList.remove('broadcasting');
    }
  });
  const hlcPanel = document.getElementById('svp-hlc-panel');
  if (!hlcPanel) return;
  const waitRow = waitPct >= 0
    ? `<div class="svp-hlc-row">
        <span class="svp-lbl">Safe-time wait</span>
        <div class="svp-wait-wrap">
          <div class="svp-wait-track"><div class="svp-wait-fill ${waitPct >= 100 ? 'done' : ''}" style="width:${Math.min(100, waitPct)}%"></div></div>
          <span class="svp-wait-pct">${Math.min(100, waitPct)}%</span>
        </div>
       </div>` : '';
  hlcPanel.innerHTML = `
    <div class="svp-hlc-title">⏱ Hybrid Logical Clock</div>
    <div class="svp-hlc-row"><span class="svp-lbl">HLC_now</span><span class="svp-val">${hlcNow || '—'}</span></div>
    <div class="svp-hlc-row${tSnap ? ' hl' : ''}">
      <span class="svp-lbl">T_snap</span>
      <span class="svp-val${tSnap ? ' tsnap' : ''}">${tSnap || '—'}</span>
    </div>
    <div class="svp-hlc-row"><span class="svp-lbl">max_clock_skew</span><span class="svp-val">500 μs</span></div>
    ${waitRow}
    <div class="svp-hlc-row"><span class="svp-lbl">Phase</span><span class="svp-phase-val">${phaseLabel || '—'}</span></div>
    ${manifest ? `<div class="svp-manifest">${manifest}</div>` : ''}`;
}

function renderBackupViz({ nodes = [], totalPct = 0, status = 'Idle', elapsed = 0, target = '—' }) {
  const panel = document.getElementById('snap-viz-panel');
  if (!panel) return;
  if (panel.dataset.vizType !== 'backup') {
    panel.dataset.vizType = 'backup';
    panel.innerHTML = `
      <div class="bkv-left">
        ${[1,2,3].map(n => `
          <div class="bkv-row">
            <span class="bkv-lbl">TServer-${n}</span>
            <div class="bkv-track"><div class="bkv-fill" id="bkv-fill-${n}"></div></div>
            <span class="bkv-pct" id="bkv-pct-${n}">0%</span>
            <span class="bkv-cloud" id="bkv-cloud-${n}">☁</span>
          </div>`).join('')}
      </div>
      <div class="bkv-right">
        <div class="bkv-rtitle">Upload Status</div>
        <div class="bkv-stat"><span class="bkv-sl">Target</span><span id="bkv-target">—</span></div>
        <div class="bkv-stat"><span class="bkv-sl">Total</span><span id="bkv-total">0%</span></div>
        <div class="bkv-stat"><span class="bkv-sl">Elapsed</span><span id="bkv-elapsed">0s</span></div>
        <div class="bkv-status" id="bkv-status">Idle</div>
      </div>`;
  }
  nodes.forEach(info => {
    const pct = info.pct || 0;
    const fillEl = document.getElementById(`bkv-fill-${info.node}`);
    const pctEl  = document.getElementById(`bkv-pct-${info.node}`);
    const cloudEl = document.getElementById(`bkv-cloud-${info.node}`);
    if (fillEl)  { fillEl.style.width = pct + '%'; fillEl.classList.toggle('done', pct >= 100); }
    if (pctEl)   pctEl.textContent = pct + '%';
    if (cloudEl) cloudEl.classList.toggle('active', pct > 0);
  });
  const tEl   = document.getElementById('bkv-target');  if (tEl)   tEl.textContent   = target;
  const totEl = document.getElementById('bkv-total');   if (totEl) totEl.textContent  = totalPct + '%';
  const eEl   = document.getElementById('bkv-elapsed'); if (eEl)   eEl.textContent   = elapsed + 's';
  const stEl  = document.getElementById('bkv-status');
  if (stEl) { stEl.textContent = status; stEl.className = `bkv-status${totalPct >= 100 ? ' done' : ''}`; }
}

function renderPitrViz({ snapshots = [], walPct = 0, cursor = null, anomaly = null, deltaZone = null, phase = 'idle', retentionHours = 24, customPhaseLabels = null, fullRecovery = false }) {
  const panel = document.getElementById('snap-viz-panel');
  if (!panel) return;
  panel.style.height = '116px';
  if (panel.dataset.vizType !== 'pitr') {
    panel.dataset.vizType = 'pitr';
    panel.innerHTML = `
      <div class="pitv-wrap">
        <div class="pitv-header">
          <span class="pitv-title">PITR Retention Window: <span id="pitv-retention">${retentionHours}h</span></span>
          <span class="pitv-phase-val" id="pitv-phase"></span>
        </div>
        <div class="pitv-timeline-wrap">
          <span class="pitv-axis-lbl">T−<span id="pitv-axis-h">${retentionHours}</span>h</span>
          <div class="pitv-timeline">
            <div class="pitv-wal-fill" id="pitv-wal-fill"></div>
            <div class="pitv-flashback-zone" id="pitv-flashback-zone" style="display:none"><span class="pitv-flashback-lbl">← recovered</span></div>
            <div class="pitv-flashback-sweep" id="pitv-flashback-sweep" style="display:none"></div>
            <div class="pitv-delta-zone" id="pitv-delta-zone" style="display:none"></div>
            <div id="pitv-snaps"></div>
            <div class="pitv-anomaly" id="pitv-anomaly" style="display:none">
              <div class="pitv-anomaly-line"></div>
              <div class="pitv-anomaly-lbl" id="pitv-anomaly-lbl"></div>
            </div>
            <div class="pitv-cursor" id="pitv-cursor" style="display:none">
              <div class="pitv-cursor-line"></div>
              <div class="pitv-cursor-lbl" id="pitv-cursor-lbl"></div>
            </div>
          </div>
          <span class="pitv-axis-lbl">Now</span>
        </div>
        <div class="pitv-legend">
          <span class="pitv-leg-snap" id="pitv-leg-snap">● Scheduled snapshot</span>
          <span class="pitv-leg-ondemand" id="pitv-leg-ondemand" style="display:none">◆ On-demand snapshot</span>
          <span class="pitv-leg-wal">▬ MVCC history retained</span>
          <span class="pitv-leg-delta" id="pitv-leg-delta" style="display:none">▨ Delta loss window</span>
        </div>
      </div>`;
  }
  const walFill = document.getElementById('pitv-wal-fill');
  if (walFill) walFill.style.width = walPct + '%';
  const deltaEl = document.getElementById('pitv-delta-zone');
  if (deltaEl) {
    if (deltaZone) {
      deltaEl.style.display = '';
      deltaEl.style.left = deltaZone.from + '%';
      deltaEl.style.width = (deltaZone.to - deltaZone.from) + '%';
    } else {
      deltaEl.style.display = 'none';
    }
  }
  const deltaLegEl = document.getElementById('pitv-leg-delta');
  if (deltaLegEl) deltaLegEl.style.display = deltaZone ? '' : 'none';
  const flashbackEl = document.getElementById('pitv-flashback-zone');
  if (flashbackEl) {
    if (phase === 'complete' && (cursor || fullRecovery)) {
      flashbackEl.style.display = '';
      flashbackEl.style.width = (fullRecovery ? walPct : cursor.pct) + '%';
    } else {
      flashbackEl.style.display = 'none';
    }
  }
  const sweepEl = document.getElementById('pitv-flashback-sweep');
  if (sweepEl) {
    if (cursor && deltaZone && (phase === 'restoring' || phase === 'complete')) {
      sweepEl.style.left = cursor.pct + '%';
      sweepEl.style.width = (deltaZone.to - cursor.pct) + '%';
      sweepEl.style.display = '';
      if (phase === 'restoring') {
        sweepEl.classList.remove('active');
        void sweepEl.offsetWidth;
        sweepEl.classList.add('active');
      } else {
        sweepEl.classList.add('active');
      }
    } else {
      sweepEl.style.display = 'none';
      sweepEl.classList.remove('active');
    }
  }
  const snapsEl = document.getElementById('pitv-snaps');
  if (snapsEl) {
    snapsEl.innerHTML = snapshots.map(s => `
      <div class="pitv-snap${s.onDemand ? ' pitv-snap-ondemand' : ''}" style="left:${s.pct}%">
        <div class="pitv-snap-pin"></div>
        <div class="pitv-snap-lbl">${s.label}${s.onDemand ? '<br><span class="pitv-ondemand-badge">on-demand</span>' : ''}<br>${s.time}</div>
      </div>`).join('');
  }
  const snapLegEl = document.getElementById('pitv-leg-snap');
  if (snapLegEl) snapLegEl.style.display = snapshots.some(s => !s.onDemand) ? '' : 'none';
  const onDemandLegEl = document.getElementById('pitv-leg-ondemand');
  if (onDemandLegEl) onDemandLegEl.style.display = snapshots.some(s => s.onDemand) ? '' : 'none';
  const anomalyEl = document.getElementById('pitv-anomaly');
  if (anomalyEl) {
    if (anomaly) {
      anomalyEl.style.display = '';
      anomalyEl.style.left = anomaly.pct + '%';
      const anomalyLblEl = document.getElementById('pitv-anomaly-lbl');
      if (anomalyLblEl) anomalyLblEl.textContent = '⚡ ' + anomaly.time;
    } else {
      anomalyEl.style.display = 'none';
    }
  }
  const cursorEl = document.getElementById('pitv-cursor');
  if (cursorEl) {
    if (cursor) {
      cursorEl.style.display = '';
      cursorEl.style.left = cursor.pct + '%';
      cursorEl.classList.toggle('restoring', phase === 'restoring');
      cursorEl.classList.toggle('complete', phase === 'complete');
      const lblEl = document.getElementById('pitv-cursor-lbl');
      if (lblEl) lblEl.textContent = '⏱ ' + cursor.time;
    } else {
      cursorEl.style.display = 'none';
    }
  }
  const defaultPhaseLabels = { idle: '', running: '🔄 MVCC Retention Active', restoring: '🔁 On-demand snapshot + HLC flashback…', complete: '✓ Flashback complete — HLC filter set' };
  const phaseLabels = customPhaseLabels ? { ...defaultPhaseLabels, ...customPhaseLabels } : defaultPhaseLabels;
  const phaseEl = document.getElementById('pitv-phase');
  if (phaseEl) { phaseEl.textContent = phaseLabels[phase] || ''; phaseEl.className = `pitv-phase-val${phase === 'complete' ? ' ok' : phase === 'restoring' ? ' warn' : ''}`; }
  const retEl = document.getElementById('pitv-retention');
  if (retEl) retEl.textContent = retentionHours + 'h';
  const axhEl = document.getElementById('pitv-axis-h');
  if (axhEl) axhEl.textContent = retentionHours;
}

function renderCloneViz({ sourcePhase = 'idle', clonePhase = 'idle', snapLabel = '—', forkDone = false }) {
  const panel = document.getElementById('snap-viz-panel');
  if (!panel) return;
  if (panel.dataset.vizType !== 'clone') {
    panel.dataset.vizType = 'clone';
    panel.innerHTML = `
      <div class="clv-source">
        <div class="clv-cluster-title">SOURCE</div>
        ${[1,2,3].map(i => `<div class="clv-tab" id="clv-src-${i}">T${i}</div>`).join('')}
      </div>
      <div class="clv-fork-col">
        <div class="clv-snap-lbl" id="clv-snap-lbl">—</div>
        <div class="clv-fork-arrows" id="clv-fork-arrows">
          ${[1,2,3].map(() => '<div class="clv-arrow">→</div>').join('')}
        </div>
        <div class="clv-fork-label">Fork point</div>
      </div>
      <div class="clv-clone-col">
        <div class="clv-cluster-title">CLONE</div>
        ${[1,2,3].map(i => `<div class="clv-tab clv-clone-tab" id="clv-cln-${i}">C${i}</div>`).join('')}
      </div>`;
  }
  const phaseCls = { idle: '', active: 'clv-active', done: 'clv-done' };
  [1,2,3].forEach(i => {
    const srcEl = document.getElementById(`clv-src-${i}`);
    if (srcEl) srcEl.className = `clv-tab ${phaseCls[sourcePhase] || ''}`;
    const clnEl = document.getElementById(`clv-cln-${i}`);
    if (clnEl) clnEl.className = `clv-tab clv-clone-tab ${phaseCls[clonePhase] || ''} ${!forkDone && clonePhase === 'idle' ? 'clv-ghost' : ''}`;
  });
  const snapLblEl = document.getElementById('clv-snap-lbl');
  if (snapLblEl) snapLblEl.textContent = snapLabel;
  const arrowsEl = document.getElementById('clv-fork-arrows');
  if (arrowsEl) arrowsEl.classList.toggle('active', forkDone);
}

function renderTTViz({ versions = [], asCursor = null, phase = 'live' }) {
  const panel = document.getElementById('snap-viz-panel');
  if (!panel) return;
  panel.style.height = '185px';
  if (panel.dataset.vizType !== 'timetravel') {
    panel.dataset.vizType = 'timetravel';
    panel.innerHTML = `
      <div class="ttv-wrap">
        <div class="ttv-header">
          <span class="ttv-title">MVCC Version Chain · DocDB Key Space</span>
          <span class="ttv-phase" id="ttv-phase">Live read</span>
        </div>
        <div class="ttv-versions" id="ttv-versions"></div>
        <div class="ttv-cursor-row">
          <span class="ttv-lbl">AS OF</span>
          <span class="ttv-ts" id="ttv-ts">current</span>
        </div>
      </div>`;
  }
  const versionsEl = document.getElementById('ttv-versions');
  if (versionsEl) {
    versionsEl.innerHTML = versions.map(v => `
      <div class="ttv-ver${v.active ? ' ttv-active' : ''}${v.deleted ? ' ttv-deleted' : ''}">
        <span class="ttv-ver-ts">${v.hlc}</span>
        <span class="ttv-ver-key">${v.key}</span>
        <span class="ttv-ver-val">${v.value || v.val || ''}</span>
        <span class="ttv-ver-status${v.deleted ? ' del' : v.active ? '' : ' filtered'}">${v.deleted ? '✕ DEL' : v.active ? '▶ READ' : '⊘ AS OF'}</span>
      </div>`).join('');
  }
  const phaseMap = { live: 'Live read', asof: 'AS OF read', concurrent: 'Live + AS OF concurrent' };
  const phaseEl = document.getElementById('ttv-phase');
  if (phaseEl) phaseEl.textContent = phaseMap[phase] || phase;
  const tsEl = document.getElementById('ttv-ts');
  if (tsEl) tsEl.textContent = asCursor || 'current';
}

function renderBackupPanel({ nodes = [], totalPct = 0, status = 'In Progress', elapsed = 0, target = 'S3 (us-east-1)', manifest = '' }) {
  const cont = document.getElementById('bkp-content');
  if (!cont) return;
  const nodeRows = [1,2,3,4,5,6].map(n => {
    const info = nodes.find(x => x.node === n);
    if (!info) return '';
    const pct = info.pct || 0;
    const done = pct >= 100;
    return `<div class="bkp-node-row">
      <div class="bkp-node-lbl">TServer-${n}</div>
      <div class="bkp-progress-track"><div class="bkp-progress-fill ${done ? 'done' : ''}" style="width:${pct}%"></div></div>
      <div class="bkp-node-pct">${pct}%</div>
    </div>`;
  }).join('');
  const etaStr = totalPct > 0 && totalPct < 100 ? ` · ETA ${Math.round(elapsed * (100 - totalPct) / totalPct)}s` : '';
  cont.innerHTML = `
    <div class="bkp-header-row">
      <div class="bkp-target">Target: <span>${target}</span></div>
      <div class="bkp-status ${totalPct >= 100 ? 'done' : ''}">${status}</div>
      <div>${elapsed}s elapsed${etaStr}</div>
    </div>
    <div class="bkp-node-grid">${nodeRows}</div>
    <div class="bkp-total-row">
      <div class="bkp-total-lbl">Total Progress</div>
      <div class="bkp-total-track"><div class="bkp-total-fill" style="width:${totalPct}%"></div></div>
      <div class="bkp-total-pct">${totalPct}%</div>
    </div>
    ${manifest ? `<div class="bkp-manifest">${manifest}</div>` : ''}`;
}

function renderPitrPanel({ snapshots = [], walPct = 0, cursor = null, phase = 'idle', retentionHours = 24 }) {
  const cont = document.getElementById('pitr-content');
  if (!cont) return;
  const snapHtml = snapshots.map(s =>
    `<div class="pitr-snap" style="left:${s.pct}%">
      <div class="pitr-snap-pin"></div>
      <div class="pitr-snap-lbl">${s.label}<br>${s.time}</div>
    </div>`).join('');
  const cursorHtml = cursor
    ? `<div class="pitr-cursor ${phase === 'restoring' ? 'restoring' : ''}" style="left:${cursor.pct}%">
        <div class="pitr-cursor-line"></div>
        <div class="pitr-cursor-lbl">⏱ ${cursor.time}</div>
       </div>` : '';
  const phaseLabel = { idle: '', running: '🔄 WAL Archiving Active', restoring: '🔁 Restoring to target...', complete: '✓ Restore Complete' }[phase] || '';
  const phaseClass = phase === 'complete' ? 'ok' : '';
  cont.innerHTML = `
    <div class="pitr-header">
      <span class="pitr-retention">Retention Window: ${retentionHours}h</span>
      <span class="pitr-phase ${phaseClass}">${phaseLabel}</span>
    </div>
    <div class="pitr-timeline-wrap">
      <div class="pitr-axis-lbl">T−${retentionHours}h</div>
      <div class="pitr-timeline">
        <div class="pitr-wal-fill" style="width:${walPct}%"></div>
        ${snapHtml}${cursorHtml}
      </div>
      <div class="pitr-axis-lbl">Now</div>
    </div>
    <div class="pitr-legend">
      <span class="pitr-legend-snap">● Snapshot checkpoint</span>
      <span class="pitr-legend-wal">▬ WAL archive</span>
      ${cursor ? `<span class="pitr-legend-cursor">│ Recovery point: ${cursor.time}</span>` : ''}
    </div>`;
}

function renderTTPanel({ query = '', timestamp = '', hlc = '', rows = [] }) {
  const cont = document.getElementById('tt-content');
  if (!cont) return;
  const tsPct = rows._tsPct || 0;
  const rowHtml = rows.map(r =>
    `<div class="tt-row ${r.cls || ''}">${r.cells.map(c => `<span>${c}</span>`).join('')}</div>`
  ).join('');
  cont.innerHTML = `
    <div class="tt-timestamp-bar">
      <div class="tt-ts-lbl">Query time</div>
      <div class="tt-ts-track"><div class="tt-ts-fill" style="width:${tsPct}%"></div></div>
      <div class="tt-ts-val">${timestamp || 'current'}</div>
    </div>
    <div class="tt-query-box">${query || '— no query yet —'}</div>
    ${rows.length ? `<div class="tt-rows">
      <div class="tt-row-head"><span>id</span><span>customer</span><span>product</span><span>amount</span><span>created_at</span></div>
      ${rowHtml}
      <div style="font-size:10px;color:var(--txt2);margin-top:6px;">${rows.filter(r => r.cls !== 'ghost').length} row(s) returned</div>
    </div>` : ''}`;
}

// ── CDC Logical Replication Panel ────────────────────────────────────────────
function renderCdcPanel({
  phase = 'idle',           // 'idle' | 'snapshot' | 'streaming' | 'lag'
  snapshotPct = 0,          // 0-100 for snapshot phase progress
  slotName = 'slot1',
  pubName = 'pub_orders',
  lsn = '—',
  confirmedLsn = '—',
  lagBytes = 0,
  walRetainedKb = 0,        // KB of WAL held back by slot lag (LSN-gated)
  intentsHeld = 0,          // count of write intents retained past normal GC (time-gated)
  walBufferedKb = 0,        // KB of WAL accumulated after T₀ during snapshot phase
  snapshotAnchorLsn = '0/1000050', // LSN at T₀ — streaming picks up here
  packets = [],             // [{from, to, label, active}] for animated flow
  records = [],             // CDC records visible in the stream pane
  tabletHighlight = -1,     // 0-2 which tablet is emitting
  phaseLabel = '',
  vwalAssembly = [],        // rows being assembled in VWAL
  consumerType = 'kafka',   // 'kafka' | 'pgrecvlogical' | 'custom'
} = {}) {
  const cont = document.getElementById('cdc-content');
  if (!cont) return;

  const phaseColors = { idle: 'var(--txt3)', snapshot: '#f59e0b', streaming: '#34d399', lag: '#fb7185' };
  const phaseLabels = {
    idle: '— idle —',
    snapshot: '📸 Snapshot Phase — reading initial table state at HybridTime',
    streaming: '🟢 Streaming — WAL changes flowing to consumer',
    lag: '⚠ Slot lag growing — consumer behind, WAL retained',
  };
  const pColor = phaseColors[phase] || 'var(--txt3)';
  const pLabel = phaseLabel || phaseLabels[phase] || '';

  const tabletColors = ['#f59e0b', '#60a5fa', '#34d399'];
  const consumerIcon = { kafka: '☁ Kafka', pgrecvlogical: '$ pg_recvlogical', custom: '⬡ App Client' }[consumerType] || '☁ Kafka';

  // Tablet WAL boxes
  const showRetention = phase === 'lag' && (walRetainedKb > 0 || intentsHeld > 0);
  const walBarPct   = Math.min((walRetainedKb / 80) * 100, 100);
  const intentBarPct = Math.min((intentsHeld / 20) * 100, 100);
  const retentionBlock = showRetention ? `
    <div class="cdc-retention-block">
      <div class="cdc-ret-row">
        <span class="cdc-ret-lbl">WAL held</span>
        <div class="cdc-ret-track"><div class="cdc-ret-fill cdc-ret-wal" style="width:${walBarPct}%;"></div></div>
        <span class="cdc-ret-val" style="color:#f59e0b;">${walRetainedKb} KB</span>
      </div>
      <div class="cdc-ret-row">
        <span class="cdc-ret-lbl">Intents</span>
        <div class="cdc-ret-track"><div class="cdc-ret-fill cdc-ret-int" style="width:${intentBarPct}%;"></div></div>
        <span class="cdc-ret-val" style="color:#fb7185;">${intentsHeld}</span>
      </div>
    </div>` : '';

  const tabletHtml = [0,1,2].map(i => {
    const active = tabletHighlight === i || phase === 'streaming';
    const hl = tabletHighlight === i;
    return `<div class="cdc-tablet ${active ? 'active' : ''} ${hl ? 'hl' : ''}" style="border-color:${tabletColors[i]}${hl ? '' : '55'};background:${tabletColors[i]}${hl ? '18' : '09'};">
      <div class="cdc-tablet-hdr" style="color:${tabletColors[i]};font-weight:700;font-size:12px;">Tablet-${i+1}</div>
      <div style="font-size:10px;color:var(--txt3);margin-top:2px;">CDC Service</div>
      <div class="cdc-wal-lines">
        ${phase === 'idle' ? '<div class="cdc-wal-line dim">— no changes —</div>' : ''}
        ${(records.filter(r => r.tablet === i+1)).slice(-3).map(r =>
          `<div class="cdc-wal-line ${r.type === 'COMMIT' ? 'commit' : r.type === 'BEGIN' ? 'begin' : ''}">${r.type}: ${r.table} ${r.data}</div>`
        ).join('')}
        ${(phase === 'streaming' || phase === 'lag') && records.filter(r=>r.tablet===i+1).length === 0
          ? `<div class="cdc-wal-line dim">polling WAL…</div>` : ''}
      </div>
      ${retentionBlock}
      <div class="cdc-wal-indicator ${active ? 'pulse' : ''}" style="background:${tabletColors[i]};"></div>
    </div>`;
  }).join('');

  // VWAL assembly rows
  const vwalHtml = vwalAssembly.length
    ? vwalAssembly.slice(-6).map(r =>
        `<div class="cdc-vwal-row ${r.fresh ? 'fresh' : ''}">
          <span class="cdc-vwal-lsn">${r.lsn}</span>
          <span class="cdc-vwal-type ${r.type === 'COMMIT' ? 'commit' : r.type === 'BEGIN' ? 'begin' : ''}">${r.type}</span>
          <span class="cdc-vwal-body">${r.table ? r.table + ' · ' : ''}${r.data || ''}</span>
        </div>`
      ).join('')
    : `<div style="color:var(--txt3);font-size:10px;padding:10px 0;text-align:center;">— awaiting changes —</div>`;

  // CDC records in stream pane
  const streamHtml = records.length
    ? records.slice(-8).map(r =>
        `<div class="cdc-record ${r.type === 'COMMIT' ? 'commit' : r.type === 'BEGIN' ? 'begin' : ''} ${r.fresh ? 'fresh' : ''}">
          <span class="cdc-rec-type">${r.type}</span>
          ${r.table ? `<span class="cdc-rec-table">${r.table}</span>` : ''}
          <span class="cdc-rec-body">${r.data || ''}</span>
          ${r.lsn ? `<span class="cdc-rec-lsn">${r.lsn}</span>` : ''}
        </div>`
      ).join('')
    : `<div style="color:var(--txt3);font-size:10px;padding:10px 0;text-align:center;">— no records yet —</div>`;

  // Slot + LSN status
  const lagBar = lagBytes > 0
    ? `<div class="cdc-lag-track"><div class="cdc-lag-fill" style="width:${Math.min(lagBytes,100)}%;background:${lagBytes > 60 ? '#fb7185' : '#f59e0b'};"></div></div>
       <div class="cdc-lag-val" style="color:${lagBytes > 60 ? '#fb7185' : '#f59e0b'};">${lagBytes > 0 ? lagBytes + ' KB behind' : ''}</div>`
    : '';

  const isStreaming = phase === 'streaming' && snapshotPct >= 100;
  const showCheckpoint = phase === 'snapshot' || (isStreaming && walBufferedKb > 0);
  const totalBuffered = 32; // KB buffered during snapshot — fixed anchor
  // During snapshot: fill grows (buffering). During streaming: consumed portion grows green, remaining amber.
  const walConsumedKb = isStreaming ? Math.max(0, totalBuffered - walBufferedKb) : 0;
  const consumedPct   = Math.min((walConsumedKb / totalBuffered) * 100, 100);
  const remainingPct  = Math.min((walBufferedKb  / totalBuffered) * 100, 100);
  const bufferingPct  = Math.min((walBufferedKb  / totalBuffered) * 100, 100); // snapshot phase

  const snapshotBar = showCheckpoint
    ? `<div class="cdc-snap-section">

        <!-- Header -->
        <div class="cdc-snap-section-hdr">
          <span class="cdc-snap-hdr-lbl">📸 HybridTime Checkpoint</span>
          <code class="cdc-snap-hdr-val">T₀ = snapshot_name (slot creation)</code>
        </div>

        <!-- Timeline strip: past | T₀ pin | right zone -->
        <div class="cdc-snap-tl-wrap">
          <div class="cdc-snap-tl-past">
            <span class="cdc-snap-tl-past-lbl">history</span>
          </div>
          <div class="cdc-snap-tl-pin">T₀</div>
          <div class="cdc-snap-tl-future">
            ${isStreaming
              ? `<!-- consumed (green) grows left→right, remaining (amber) follows -->
                 <div class="cdc-snap-tl-consumed" style="width:${consumedPct}%;"></div>
                 <div class="cdc-snap-tl-remaining" style="width:${remainingPct}%;"></div>`
              : `<!-- buffering: amber fill grows right -->
                 <div class="cdc-snap-tl-fill" style="width:${bufferingPct}%;"></div>`
            }
          </div>
        </div>
        <div class="cdc-snap-tl-sublabels">
          <span>← rows read as-of T₀ (consistent, no partial TX)</span>
          <span>${isStreaming ? 'consuming buffered WAL →' : 'new writes → WAL buffered after T₀ →'}</span>
        </div>

        <!-- Two meters -->
        <div class="cdc-snap-meters">
          <div class="cdc-snap-meter-col">
            <div class="cdc-snap-meter-lbl">Snapshot read at T₀</div>
            <div class="cdc-snap-track"><div class="cdc-snap-fill" style="width:${snapshotPct}%;"></div></div>
            <div class="cdc-snap-meter-val" style="color:${snapshotPct >= 100 ? '#34d399' : '#f59e0b'};">${snapshotPct >= 100 ? '✓ 100%' : snapshotPct + '%'}</div>
            <div class="cdc-snap-meter-sub">SET LOCAL yb_read_time TO '&lt;HT&gt; ht'</div>
          </div>
          <div class="cdc-snap-meter-div"></div>
          <div class="cdc-snap-meter-col" style="text-align:right;">
            <div class="cdc-snap-meter-lbl">${isStreaming ? 'Buffer remaining' : 'WAL buffered after T₀'}</div>
            <div class="cdc-snap-meter-val" style="color:${isStreaming ? (walBufferedKb > 0 ? '#60a5fa' : '#34d399') : (walBufferedKb > 0 ? '#f59e0b' : 'var(--txt3)')};">
              ${isStreaming ? walBufferedKb + ' KB' : walBufferedKb + ' KB'}
            </div>
            <div class="cdc-snap-meter-sub">${isStreaming ? `${walConsumedKb} KB consumed · replaying from T₀` : 'live writes → queued for streaming'}</div>
          </div>
        </div>

        <!-- Handoff / status line -->
        <div class="cdc-snap-handoff done">
          ${isStreaming
            ? (walBufferedKb > 0
                ? `<span style="color:#60a5fa;font-weight:700;">⚡ Replaying</span>
                   buffered WAL from T₀ LSN <code class="cdc-snap-code">${snapshotAnchorLsn}</code>
                   · <b>${walBufferedKb} KB</b> remaining · streaming live when done`
                : `<span class="cdc-snap-handoff-ok">✓ Buffer cleared</span>
                   · streaming live from frontier · no gap from snapshot`)
            : (snapshotPct >= 100
                ? `<span class="cdc-snap-handoff-ok">✓ Snapshot complete</span>
                   → streaming picks up from LSN <code class="cdc-snap-code">${snapshotAnchorLsn}</code>
                   · <b>${walBufferedKb} KB</b> buffered WAL ready · no gap · no overlap`
                : `→ Streaming will resume from LSN <code class="cdc-snap-code">${snapshotAnchorLsn}</code>
                   — gap-free handoff at T₀ boundary`
              )
          }
        </div>

      </div>` : '';

  const FLAGS = [
    { flag: 'cdc_wal_retention_time_secs',              default: '14400',  scope: 'TServer', desc: 'Minimum WAL retention time (seconds) even without an active slot. Prevents GC before CDC picks up. Default 4 h.' },
    { flag: 'cdc_intent_retention_ms',                  default: '60000',  scope: 'TServer', desc: 'How long uncommitted write intents are retained for CDC. If a transaction exceeds this, CDC may miss its intents.' },
    { flag: 'cdc_enable_intra_transactional_before_image', default: 'false', scope: 'TServer', desc: 'Enable before-image for multiple row changes within the same transaction. Works in conjunction with REPLICA IDENTITY FULL on the table.' },
    { flag: 'cdc_poll_delay_ms',                        default: '0',      scope: 'TServer', desc: 'Delay between CDC Service polls of tablet WALs (ms). Increase to reduce TServer CPU at the cost of higher replication lag.' },
  ];

  const CONSTRAINTS = [
    { icon: '⚠', text: 'LSN ≠ byte offset — <code>pg_wal_lsn_diff()</code>, <code>pg_current_wal_lsn()</code>, and cross-slot LSN arithmetic are unsupported.' },
    { icon: '✕', text: '<code>TRUNCATE</code> and <code>DROP TABLE</code> are not supported after slot creation. <code>TRUNCATE</code> is never captured in the stream.' },
    { icon: '⚠', text: 'Incompatible with <b>xCluster</b> as a replication target — a cluster with an active slot cannot be an xCluster secondary.' },
    { icon: '⚠', text: 'After a <b>PITR restore</b>, all existing slots are invalidated and must be recreated from scratch.' },
    { icon: '✕', text: '<code>pg_stat_replication</code> and replication-protocol monitoring views are unsupported.' },
    { icon: '✕', text: 'Only YSQL tables added to a <code>PUBLICATION</code> are captured — YCQL is not supported for CDC.' },
  ];

  const flagsHtml = FLAGS.map(f => `
    <div class="cdc-flag-row">
      <div class="cdc-flag-name">${f.flag}</div>
      <div class="cdc-flag-default">${f.default}</div>
      <div class="cdc-flag-scope">${f.scope}</div>
      <div class="cdc-flag-desc">${f.desc}</div>
    </div>`).join('');

  const constraintsHtml = CONSTRAINTS.map(c => `
    <div class="cdc-constraint-row">
      <span class="cdc-constraint-icon ${c.icon === '✕' ? 'err' : 'warn'}">${c.icon}</span>
      <span class="cdc-constraint-text">${c.text}</span>
    </div>`).join('');

  cont.innerHTML = `
  <div class="cdc-layout">

    <!-- LEFT: Pipeline diagram -->
    <div class="cdc-pipeline">

      <!-- Phase banner -->
      <div class="cdc-phase-banner" style="color:${pColor};border-color:${pColor}40;background:${pColor}10;">
        ${pLabel}
      </div>

      <!-- Row 1: Tablet WALs -->
      <div class="cdc-section-lbl">Tablet WAL Leaders <span class="cdc-section-sub">CDC Service polls each independently</span></div>
      <div class="cdc-tablets-row">${tabletHtml}</div>

      <!-- Arrow: tablets → VWAL -->
      <div class="cdc-flow-arrow">
        <div class="cdc-arrow-line"></div>
        <div class="cdc-arrow-label">per-tablet WAL records · commit-time ordered</div>
        <div class="cdc-arrow-head">▼</div>
      </div>

      <!-- Row 2: Virtual WAL -->
      <div class="cdc-section-lbl">Virtual WAL (VWAL) <span class="cdc-section-sub">Assembles multi-tablet changes · assigns LSNs · maintains commit-time order</span></div>
      <div class="cdc-vwal-box">
        <div class="cdc-vwal-hdr">
          <span class="cdc-vwal-title">VWAL · LSN stream</span>
          <span class="cdc-vwal-note">LSN ≠ byte offset · no arithmetic · no cross-slot compare</span>
        </div>
        <div class="cdc-vwal-rows">${vwalHtml}</div>
      </div>

      <!-- Arrow: VWAL → walsender -->
      <div class="cdc-flow-arrow">
        <div class="cdc-arrow-line"></div>
        <div class="cdc-arrow-label">yboutput plugin (default) · BEGIN/CHANGE/COMMIT messages</div>
        <div class="cdc-arrow-head">▼</div>
      </div>

      <!-- Row 3: walsender -->
      <div class="cdc-section-lbl">walsender <span class="cdc-section-sub">PostgreSQL backend process · streams via PG wire protocol · handles ACKs</span></div>
      <div class="cdc-walsender-box">
        <div class="cdc-ws-left">
          <div class="cdc-ws-name">walsender</div>
          <div class="cdc-ws-detail">slot: <b>${slotName}</b> · pub: <b>${pubName}</b></div>
          <div class="cdc-ws-detail">plugin: <b>yboutput</b> (default)</div>
        </div>
        <div class="cdc-ws-lsns">
          <div class="cdc-lsn-row"><span class="cdc-lsn-lbl">LSN sent</span><span class="cdc-lsn-val">${lsn}</span></div>
          <div class="cdc-lsn-row"><span class="cdc-lsn-lbl">Confirmed flush LSN</span><span class="cdc-lsn-val ok">${confirmedLsn}</span></div>
          ${lagBar}
        </div>
      </div>
      ${snapshotBar}

      <!-- Arrow: walsender → consumer -->
      <div class="cdc-flow-arrow">
        <div class="cdc-arrow-line"></div>
        <div class="cdc-arrow-label">at-least-once · commit-time ordered · no gaps</div>
        <div class="cdc-arrow-head">▼</div>
      </div>

      <!-- Row 4: Consumer -->
      <div class="cdc-section-lbl">Consumer <span class="cdc-section-sub">ACKs advance confirmed flush LSN · releases WAL retention</span></div>
      <div class="cdc-consumer-box">
        <div class="cdc-consumer-icon">☁</div>
        <div class="cdc-consumer-detail">
          <div class="cdc-consumer-name">${consumerIcon}</div>
          <div class="cdc-consumer-sub">Kafka Connect · YugabyteDB Debezium Connector</div>
        </div>
        <div class="cdc-consumer-status ${phase === 'lag' ? 'lag' : phase === 'streaming' ? 'ok' : ''}">
          ${phase === 'lag' ? '⚠ behind' : phase === 'streaming' ? '✓ consuming' : phase === 'snapshot' ? '📸 snapshotting' : '— idle'}
        </div>
      </div>

    </div>

    <!-- RIGHT: Stream records + slot info -->
    <div class="cdc-stream-pane">
      <div class="cdc-stream-hdr">yboutput stream</div>
      <div class="cdc-records">${streamHtml}</div>
    </div>

  </div>

  <!-- STATIC CALLOUTS: always shown below the pipeline -->
  <div class="cdc-callouts">

    <!-- Constraints -->
    <div class="cdc-callout cdc-callout-warn">
      <div class="cdc-callout-hdr">
        <span class="cdc-callout-icon">⚠</span>
        <span class="cdc-callout-title">Key Constraints &amp; Incompatibilities</span>
      </div>
      <div class="cdc-constraint-list">${constraintsHtml}</div>
    </div>

    <!-- Flags -->
    <div class="cdc-callout cdc-callout-info">
      <div class="cdc-callout-hdr">
        <span class="cdc-callout-icon">⚙</span>
        <span class="cdc-callout-title">Important TServer Flags</span>
      </div>
      <div class="cdc-flags-table">
        <div class="cdc-flag-head">
          <span>Flag</span><span>Default</span><span>Scope</span><span>Purpose</span>
        </div>
        ${flagsHtml}
      </div>
    </div>

  </div>`;
}

function renderScalingStats() {
  const container = document.getElementById('sd-stats-grid');
  if (!container) return;

  const zones = {
    'Zone A': { l: 0, t: 0, nodes: [1, 4, 7] },
    'Zone B': { l: 0, t: 0, nodes: [2, 5, 8] },
    'Zone C': { l: 0, t: 0, nodes: [3, 6, 9] }
  };
  const nodeStats = {};

  S.nodes.forEach(n => {
    const el = document.getElementById(`node-${n.id}`);
    if (el && el.style.display !== 'none') {
      nodeStats[n.id] = { l: 0, t: 0 };
    }
  });

  S.groups.forEach(g => {
    if (nodeStats[g.leaderNode]) {
      nodeStats[g.leaderNode].l++;
      const zone = Object.keys(zones).find(z => zones[z].nodes.includes(g.leaderNode));
      if (zone) zones[zone].l++;
    }
    g.replicas.forEach(rid => {
      if (nodeStats[rid]) {
        nodeStats[rid].t++;
        const zone = Object.keys(zones).find(z => zones[z].nodes.includes(rid));
        if (zone) zones[zone].t++;
      }
    });
  });

  // Build HTML
  let html = '<div class="sd-section"><h4>Nodes</h4><div class="sd-grid">';
  Object.keys(nodeStats).sort((a, b) => a - b).forEach(nid => {
    html += `
          <div class="sd-card">
            <div class="sd-node-label">TServer-${nid}</div>
            <div class="sd-stat-row"><span class="sd-lbl">Leaders:</span><span class="sd-val ldr">${nodeStats[nid].l}</span></div>
            <div class="sd-stat-row"><span class="sd-lbl">Total Peers:</span><span class="sd-val">${nodeStats[nid].t}</span></div>
          </div>`;
  });
  html += '</div></div>';

  html += '<div class="sd-section"><h4>Zones</h4><div class="sd-grid">';
  Object.keys(zones).forEach(z => {
    const zoneNodes = zones[z].nodes.filter(nid => nodeStats[nid]);
    if (zoneNodes.length > 0) {
      html += `
            <div class="sd-card zone-card">
              <div class="sd-node-label">${z}</div>
              <div class="sd-stat-row"><span class="sd-lbl">Leaders:</span><span class="sd-val ldr">${zones[z].l}</span></div>
              <div class="sd-stat-row"><span class="sd-lbl">Total Peers:</span><span class="sd-val">${zones[z].t}</span></div>
            </div>`;
    }
  });
  html += '</div></div>';

  container.innerHTML = html;
}

function switchFDTab(tab) {
  fdCurrentTab = tab;
  document.getElementById('fdt-node').classList.toggle('active', tab === 'node');
  document.getElementById('fdt-part').classList.toggle('active', tab === 'part');
  const sc = SCENARIOS[currentScenario];
  if (tab !== (sc.failureMode === 'partition' ? 'part' : 'node')) {
    // Navigate to the matching scenario
    const target = tab === 'node' ? 11 : 12;
    selectScenario(target);
  }
}

// Drain leaders off a node onto the remaining alive, non-partitioned peers (balanced)
function _fdDrainLeaders(nodeId) {
  for (const g of S.groups) {
    if (g.leaderNode !== nodeId) continue;
    const candidates = g.replicas.filter(r =>
      r !== nodeId && S.nodes.find(n => n.id === r)?.alive && !S.partitioned.includes(r)
    );
    if (!candidates.length) continue;
    const newLeader = candidates.reduce((best, r) =>
      S.groups.filter(x => x.leaderNode === r).length <
      S.groups.filter(x => x.leaderNode === best).length ? r : best
    );
    g.leaderNode = newLeader;
    g.term = (g.term || 4) + 1;
    addLog(`Raft re-election: ${g.table}.tablet${g.tnum} → LEADER: TS-${newLeader} (term=${g.term})`, 'lw');
  }
}

// Animate FOLLOWER → CANDIDATE → LEADER transfers back to nodeId (balanced fair share)
async function _fdRebalanceToNode(nodeId) {
  const ctx = makeCtx();
  const eligible = S.groups.filter(g => g.replicas.includes(nodeId) && g.leaderNode !== nodeId);
  const totalWithNode = S.groups.filter(g => g.replicas.includes(nodeId)).length;
  const aliveCount = [...new Set(S.groups.flatMap(g => g.replicas))]
    .filter(r => S.nodes.find(n => n.id === r)?.alive && !S.partitioned.includes(r)).length;
  const target = Math.round(totalWithNode / aliveCount);
  const current = S.groups.filter(g => g.leaderNode === nodeId).length;
  const toTransfer = Math.max(0, target - current);

  // Greedy pick: maximise table diversity, break ties by draining busiest source node
  const chosen = [];
  const pickedTables = {};
  const remaining = [...eligible];
  for (let i = 0; i < toTransfer && remaining.length; i++) {
    const minUsed = Math.min(...remaining.map(g => pickedTables[g.table] || 0));
    const leastUsed = remaining.filter(g => (pickedTables[g.table] || 0) === minUsed);
    leastUsed.sort((a, b) =>
      S.groups.filter(g => g.leaderNode === b.leaderNode).length -
      S.groups.filter(g => g.leaderNode === a.leaderNode).length
    );
    const pick = leastUsed[0];
    chosen.push(pick);
    pickedTables[pick.table] = (pickedTables[pick.table] || 0) + 1;
    remaining.splice(remaining.indexOf(pick), 1);
  }

  for (const g of chosen) {
    const oldLeader = g.leaderNode;
    addLog(`YB-Master: LeaderStepDown(${g.table}.tablet${g.tnum}) → TS-${nodeId}`, 'li');
    // FOLLOWER → CANDIDATE
    ctx.setRole(g.id, nodeId, 'CANDIDATE');
    await ctx.delay(300);
    // Vote request + grant
    await ctx.pktTabletToTablet(g.id, nodeId, g.id, oldLeader, 'pk-vote', 500);
    await ctx.pktTabletToTablet(g.id, oldLeader, g.id, nodeId, 'pk-ack', 400);
    // Promote
    g.leaderNode = nodeId;
    g.term = (g.term || 4) + 1;
    renderAllTablets(); renderConnections();
    ctx.hlTablet(g.id, nodeId, 't-hl');
    addLog(`${g.table}.tablet${g.tnum} → LEADER: TS-${nodeId} (term=${g.term}) ✓`, 'ls');
    await ctx.delay(250);
  }
}

function fdKillNode3() {
  S.nodes.find(n => n.id === 3).alive = false;
  renderNodeAlive(3, false);
  addLog('TServer-3: KILLED', 'le');
  _fdDrainLeaders(3);
  renderAllTablets(); renderConnections();
  toggleBtn('btn-k3', true); toggleBtn('btn-r3', false);
  fdRenderNodes();
}
async function fdReviveNode3() {
  S.nodes.find(n => n.id === 3).alive = true;
  renderNodeAlive(3, true); renderAllTablets(); setTimeout(renderConnections, 50);
  addLog('TServer-3: REVIVED · catch-up starting', 'ls');
  toggleBtn('btn-r3', true); toggleBtn('btn-k3', false);
  fdRenderNodes();
  if (S.nodeStats?.[3]?.lagRows > 0) await fdCatchUp(3);
  addLog('TServer-3 caught up · rebalancing leaders', 'ls');
  await _fdRebalanceToNode(3);
}
function fdPartitionNode3() {
  if (!S.partitioned.includes(3)) S.partitioned.push(3);
  drawPartitionWall(true);
  const card = document.getElementById('node-3');
  card.classList.add('n-partitioned');
  const ov = document.createElement('div');
  ov.className = 'part-overlay'; ov.id = 'part-3';
  ov.innerHTML = '⟊ PARTITIONED';
  card.appendChild(ov);
  addLog('Network partition: TS-3 isolated', 'le');
  _fdDrainLeaders(3);
  renderAllTablets(); renderConnections();
  toggleBtn('btn-prt', true); toggleBtn('btn-heal', false);
  fdRenderNodes();
}
async function fdHealPartition() {
  S.partitioned = S.partitioned.filter(n => n !== 3);
  drawPartitionWall(false);
  const card = document.getElementById('node-3');
  card.classList.remove('n-partitioned');
  document.getElementById('part-3')?.remove();
  addLog('Partition healed: TS-3 reconnected', 'ls');
  toggleBtn('btn-heal', true); toggleBtn('btn-prt', false);
  fdRenderNodes();
  if (S.nodeStats?.[3]?.lagRows > 0) await fdCatchUp(3);
  addLog('Rebalancing leaders back to TS-3', 'li');
  await _fdRebalanceToNode(3);
}

function drawPartitionWall(show) {
  const svg = document.getElementById('svg-overlay');
  svg.querySelectorAll('.part-wall').forEach(e => e.remove());
  if (!show) return;
  const cw = document.getElementById('canvas-wrap');
  const cr = cw.getBoundingClientRect();
  const n2el = document.getElementById('node-2');
  const n3el = document.getElementById('node-3');
  if (!n2el || !n3el) return;
  const r2 = n2el.getBoundingClientRect();
  const r3 = n3el.getBoundingClientRect();
  const x = (r2.right - cr.left + r3.left - cr.left) / 2;
  const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  grp.className.baseVal = 'part-wall';
  // Zigzag wall
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x); line.setAttribute('y1', '0');
  line.setAttribute('x2', x); line.setAttribute('y2', '100%');
  line.setAttribute('stroke', 'rgba(232,121,249,0.6)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6 4');
  grp.appendChild(line);
  // Label
  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', x + 5); txt.setAttribute('y', '50%');
  txt.setAttribute('fill', 'rgba(232,121,249,0.9)'); txt.setAttribute('font-size', '10');
  txt.setAttribute('font-family', 'JetBrains Mono,monospace'); txt.setAttribute('transform', `rotate(90,${x + 5},${cr.height / 2})`);
  txt.textContent = '⟊ NETWORK PARTITION';
  grp.appendChild(txt);
  svg.appendChild(grp);
}

function toggleBtn(id, disabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = disabled;
}

// ════════════════════════════════════════════
//  CORE RENDERING
// ════════════════════════════════════════════

S = freshState();
let currentScenario = 0, currentStep = -1, playing = false, playTimer = null, speedVal = 1, logTime = 0, stepRunning = false;

function renderAllTablets() {
  // Clear all TServer tablet bodies
  for (let n = 1; n <= 9; n++) {
    const nb = document.getElementById(`nb-${n}`);
    if (nb) nb.innerHTML = '';
  }

  const sc = SCENARIOS[currentScenario];
  const filterIds = sc?.filterIds;
  const filter = sc?.filterTable;
  for (const g of S.groups) {
    if (filterIds) { if (!filterIds.includes(g.id)) continue; }
    else if (filter) {
      if (Array.isArray(filter)) { if (!filter.includes(g.table)) continue; }
      else if (g.table !== filter) continue;
    }
    for (const n of g.replicas) {
      const nb = document.getElementById(`nb-${n}`);
      if (nb) renderTabletCard(g, n);
    }
  }
}

function fmtHLC(t) { return t ? t.toFixed(3) : ''; }

function buildTabletHTML(g, nodeId) {
  const rs = S.replicaState[g.id]?.[nodeId];
  const alive = S.nodes.find(n => n.id === nodeId).alive;
  const isPartitioned = S.partitioned.includes(nodeId);
  const isLdr = g.leaderNode === nodeId && alive && !isPartitioned;
  const role = !alive ? 'DEAD' : isPartitioned ? 'PARTITIONED' : isLdr ? 'LEADER' : 'FOLLOWER';
  const ti = TABLES[g.table] || { name: g.table, color: '#94a3b8' };
  const memP = rs ? Math.min(100, rs.mem) : 0;
  const ssP = rs ? Math.min(100, rs.ss) : 0;
  const compact = !!SCENARIOS[currentScenario]?.compactTablets || !!S.compactMode;
  const ssts = rs?.ssts || [];
  const compacting = rs?.compacting || false;

  let sstHtml = '<div class="sst-container">';
  ssts.forEach(size => {
    sstHtml += `<div class="sst-file ${compacting ? 'compacting' : ''}" style="width:${Math.min(100, size)}%"></div>`;
  });
  sstHtml += '</div>';

  const roleC = isLdr ? 't-leader' : !alive ? 't-dead' : isPartitioned ? 't-follower t-stale' : 't-follower';

  let dHtml = '';
  if (!compact && (g.data?.length || rs?.provisionalRows?.length)) {
    const isGeo = document.getElementById('canvas-wrap').classList.contains('geo-mode');
    const showReg = isGeo || !!g.showReg;
    const showScore = showReg || !!g.showScore;
    const hasExt = g.data && g.data.some(r => r[5] === 'ext');
    dHtml = '<div class="t-data">';

    // Header Row
    if (g.table === 'users') {
      dHtml += `<div class="d-row t-data-header ${showReg ? 'is-geo' : ''}">
            <div class="dcell">ID</div><div class="dcell">NAME</div>${showScore ? '<div class="dcell dcell-score">SCR</div>' : ''}${showReg ? '<div class="dcell dcell-reg">REG</div>' : ''}${hasExt ? '<span class="xc-ext-badge xc-ext-hdr">SRC</span>' : ''}<div class="dcell-hlc">HLC</div>
          </div>`;
    } else if (g.table === 'orders') {
      dHtml += `<div class="d-row t-data-header">
            <div class="dcell">ID</div><div class="dcell">STATUS</div>${hasExt ? '<span class="xc-ext-badge xc-ext-hdr">SRC</span>' : ''}<div class="dcell-hlc">HLC</div>
          </div>`;
    }

    const combined = [...g.data.map(d => ({ ...d, data: d, type: 'comm' })), ...(rs?.provisionalRows || []).map(d => ({ ...d, data: d, type: 'prov' }))];
    const catchupOffset = rs?.catchupOffset ?? 0;
    const cappedCombined = catchupOffset > 0 ? combined.slice(0, combined.length - catchupOffset) : combined;
    const rowsToShow = cappedCombined.slice(-(g.maxRows ?? 3));

    for (let i = 0; i < rowsToShow.length; i++) {
      const entry = rowsToShow[i];
      const row = entry.data;
      const isProv = entry.type === 'prov';
      const isN = rs?.newRows?.includes(i);
      const isR = rs?.readRow === i;
      const isS = rs?.safePulse;

      dHtml += `<div class="d-row ${isProv ? 'provisional' : ''} ${isN ? 'r-new' : ''} ${isR ? 'r-read' : ''} ${isS ? 'r-safe' : ''} ${showReg ? 'is-geo' : ''}">`;

      if (g.isColocated) {
        const rowTable = row[5] || 'users';
        const subTi = TABLES[rowTable] || { color: '#94a3b8' };
        dHtml += `<div class="d-col-indicator" style="background:${subTi.color}"></div>`;
        dHtml += `<div class="dcell">#${row[0]}</div><div class="dcell" style="flex:1; overflow:hidden; text-overflow:ellipsis">${row[1]}</div><div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
      } else if (g.table === 'users') {
        const extBadge = row[5] === 'ext' ? '<span class="xc-ext-badge">EXT</span>' : '';
        dHtml += `<div class="dcell">${row[0]}</div><div class="dcell">${row[1]}</div>${showScore ? `<div class="dcell dcell-score">${row[3]}</div>` : ''}${showReg ? `<div class="dcell dcell-reg">${row[2]}</div>` : ''}${extBadge}<div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
      } else if (g.table === 'products') {
        dHtml += `<div class="dcell">${row[1]}</div><div class="dcell-hlc">${fmtHLC(row[3])}</div>`;
      } else if (g.table === 'users_email_idx') {
        dHtml += `<div class="dcell">${row[0]}</div><div class="dcell-hlc">${fmtHLC(row[2])}</div>`;
      } else if (g.table === 'transactions') {
        dHtml += `<div class="dcell">${row[0]}</div><div class="dcell">${row[1]}</div>`;
      } else if (g.table === 'orders') {
        const extBadge = row[5] === 'ext' ? '<span class="xc-ext-badge">EXT</span>' : '';
        dHtml += `<div class="dcell">#${row[0]}</div><div class="dcell" style="color:${row[3] === 'DONE' ? 'var(--ok)' : row[3] === 'PEND' ? 'var(--warn)' : 'var(--info)'}">${row[3]}</div>${extBadge}<div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
      } else {
        dHtml += `<div class="dcell">#${row[0]}</div><div class="dcell" style="color:${row[3] === 'DONE' ? 'var(--ok)' : row[3] === 'PEND' ? 'var(--warn)' : 'var(--info)'}">${row[3]}</div><div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
      }
      dHtml += '</div>';
    }
    dHtml += '</div>';
  }
  return { roleC, ti, memP, ssP, role, dHtml, sstHtml, compact };
}

function renderTxPanel() {
  const panel = document.getElementById('tx-panel');
  const list = document.getElementById('tx-list');
  const count = document.getElementById('tx-count');

  if (!S.transactions.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  count.textContent = S.transactions.length;
  list.innerHTML = '';

  S.transactions.forEach(tx => {
    const row = document.createElement('div');
    row.className = 'tx-row';
    row.innerHTML = `
          <div class="tx-header">
            <div class="tx-id">TXID: ${tx.id}</div>
            <div class="tx-status-badge txs-${tx.status.toLowerCase()}">${tx.status}</div>
          </div>
          <div class="tx-meta">
            <span>Participants: 2 Tablets</span>
          </div>
          <div class="tx-hb">
            <div class="tx-hb-fill" style="width: ${tx.hb || 0}%"></div>
          </div>
        `;
    list.appendChild(row);
  });
}

function renderTabletCard(g, nodeId) {
  const { roleC, ti, memP, ssP, role, dHtml, sstHtml, compact } = buildTabletHTML(g, nodeId);
  const div = document.createElement('div');
  div.id = `tablet-${g.id}-${nodeId}`;
  const effectiveRoleC = g.simpleTable ? 't-follower' : roleC;
  div.className = `tablet ${effectiveRoleC}${compact ? ' compact' : ''}`;
  const nodeCard = document.getElementById(`node-${nodeId}`);
  const zoneTxt = nodeCard?.querySelector('.n-zone')?.textContent || '';
  const isGeo = document.getElementById('canvas-wrap').classList.contains('geo-mode');
  const lsmHtml = g.hideStorage ? '' : compact
    ? `<div class="lsm-mini">Mem:${Math.round(memP)}% · SST:${Math.round(ssP)}%</div>`
    : `<div class="lsm-box">
      <div class="lsm-title">DocDB Storage <span class="lsm-fi">Mem=${Math.round(memP)}% SST=${Math.round(ssP)}%</span></div>
      <div class="lsm-row"><div class="lsm-lbl">Mem</div><div class="lsm-track"><div class="lsm-fill lsm-mem" style="width:${memP}%"></div></div><div class="lsm-pct">${Math.round(memP)}%</div></div>
      <div class="lsm-row"><div class="lsm-lbl">SST</div><div class="lsm-track"><div class="lsm-fill lsm-ss" style="width:${ssP}%"></div></div><div class="lsm-pct">${Math.round(ssP)}%</div></div>
      ${sstHtml}
    </div>`;

  div.innerHTML = `
    <div class="t-top">
      ${g.isColocated ? `
        <div class="t-colordots">
          <div class="t-colordot" style="background:${TABLES['products'].color}"></div>
          <div class="t-colordot" style="background:${TABLES['categories'].color}"></div>
        </div>
      ` : `<div class="t-colordot" style="background:${ti.color}"></div>`}
      <div class="t-name">${g.isColocated ? 'Colocated Tablet' : g.simpleTable ? ti.name : ti.name + '.tablet' + g.tnum}</div>
      ${g.simpleTable ? '' : `<div class="role-badge r-${role}">${role}</div>`}
    </div>
    ${g.simpleTable ? '' : `<div class="t-meta"><div class="t-range">${g.range}</div><div class="t-term">term:${g.term}</div></div>`}
    ${dHtml}
    ${lsmHtml}`;
  div.onclick = () => onTabletClick(g, nodeId);
  document.getElementById(`nb-${nodeId}`).appendChild(div);
}

function reRenderTabletInternal(tgId, nodeId) {
  const g = S.groups.find(x => x.id === tgId); if (!g) return;
  const el = document.getElementById(`tablet-${tgId}-${nodeId}`); if (!el) return;
  const saved = ['t-hl', 't-hl2', 't-new', 't-candidate', 't-stale', 't-syncing'].filter(c => el.classList.contains(c));
  const { roleC, ti, memP, ssP, role, dHtml, sstHtml, compact } = buildTabletHTML(g, nodeId);
  const effectiveRoleC2 = g.simpleTable ? 't-follower' : roleC;
  el.className = `tablet ${effectiveRoleC2} ${saved.join(' ')}${compact ? ' compact' : ''}`;
  const lsmHtml = g.hideStorage ? '' : compact
    ? `<div class="lsm-mini">Mem:${Math.round(memP)}% · SST:${Math.round(ssP)}%</div>`
    : `<div class="lsm-box">
      <div class="lsm-title">DocDB Storage <span class="lsm-fi">Mem=${Math.round(memP)}% SST=${Math.round(ssP)}%</span></div>
      <div class="lsm-row"><div class="lsm-lbl">Mem</div><div class="lsm-track"><div class="lsm-fill lsm-mem" style="width:${memP}%"></div></div><div class="lsm-pct">${Math.round(memP)}%</div></div>
      <div class="lsm-row"><div class="lsm-lbl">SST</div><div class="lsm-track"><div class="lsm-fill lsm-ss" style="width:${ssP}%"></div></div><div class="lsm-pct">${Math.round(ssP)}%</div></div>
      ${sstHtml}
    </div>`;
  el.innerHTML = `
    <div class="t-top"><div class="t-colordot" style="background:${ti.color}"></div><div class="t-name">${g.simpleTable ? ti.name : ti.name + '.tablet' + g.tnum}</div>${g.simpleTable ? '' : `<div class="role-badge r-${role}">${role}</div>`}</div>
    ${g.simpleTable ? '' : `<div class="t-meta"><div class="t-range">${g.range}</div><div class="t-term">term:${g.term}</div></div>`}
    ${dHtml}
    ${lsmHtml}`;
  el.onclick = () => onTabletClick(g, nodeId);
}

function renderConnections() {
  const svg = document.getElementById('svg-overlay');
  svg.querySelectorAll('.conn-grp').forEach(e => e.remove());
  const canvas = document.getElementById('canvas-wrap');
  const cr = canvas.getBoundingClientRect();

  // Update SVG height to cover all content
  svg.setAttribute('height', canvas.scrollHeight);

  for (const g of S.groups) {
    const pos = [];
    for (const n of g.replicas) {
      const el = document.getElementById(`tablet-${g.id}-${n}`); if (!el) continue;
      const r = el.getBoundingClientRect();
      pos.push({
        x: r.left - cr.left + r.width / 2 + canvas.scrollLeft,
        y: r.top - cr.top + r.height / 2 + canvas.scrollTop,
        n
      });
    }
    if (pos.length < 2) continue;
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g'); grp.className.baseVal = 'conn-grp';
    const color = TABLES[g.table].color;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const isPartEdge = S.partitioned.includes(pos[i].n) !== S.partitioned.includes(pos[j].n);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', pos[i].x); ln.setAttribute('y1', pos[i].y);
      ln.setAttribute('x2', pos[j].x); ln.setAttribute('y2', pos[j].y);
      ln.setAttribute('stroke', isPartEdge ? 'rgba(232,121,249,0.4)' : color);
      ln.setAttribute('stroke-width', '1');
      ln.setAttribute('stroke-dasharray', isPartEdge ? '4 3' : '3 4');
      ln.setAttribute('opacity', isPartEdge ? '0.5' : '0.25');
      ln.style.animation = 'dash-anim 2s linear infinite';
      grp.appendChild(ln);
    }
    svg.appendChild(grp);
  }
}
const svgSt = document.createElementNS('http://www.w3.org/2000/svg', 'style');
svgSt.textContent = '@keyframes dash-anim{to{stroke-dashoffset:-14}}';
document.getElementById('svg-overlay').appendChild(svgSt);

function renderLatencies(lats) {
  if (!lats?.length) { document.getElementById('lat-rows').innerHTML = '<div style="color:var(--txt3);font-size:10px">Run a scenario to see latency</div>'; return; }
  document.getElementById('lat-rows').innerHTML = lats.map((l, i) => `
    <div class="lat-row ${l.cls}" id="lat-${i}">
      <div class="lat-lbl">${l.lbl}</div>
      <div class="lat-track"><div class="lat-fill" id="lat-fill-${i}" style="width:0%"></div></div>
      <div class="lat-val" id="lat-val-${i}">—</div>
    </div>`).join('');
}
function setLatency(idx, val) {
  const sc = SCENARIOS[currentScenario]; if (!sc.latencies || idx >= sc.latencies.length) return;
  const max = sc.latencies[idx].max;
  const fill = document.getElementById(`lat-fill-${idx}`); const v = document.getElementById(`lat-val-${idx}`);
  if (fill) fill.style.width = Math.min(100, (val / max) * 100) + '%';
  if (v) v.textContent = typeof val === 'number' ? val + 'ms' : val;
}
function renderStepIndicator(steps, cur) {
  const sec = document.getElementById('step-sec');
  if (!steps?.length) { sec.innerHTML = '<span style="color:var(--txt3);font-size:10px">Explore freely</span>'; return; }
  let h = '';
  for (let i = 0; i < steps.length; i++) {
    const c = i < cur ? 'done' : i === cur ? 'active' : '';
    const lbl = typeof steps[i].label === 'function' ? steps[i].label() : steps[i].label;
    h += `<div class="sdot ${c}" title="${lbl}"></div>`;
  }
  h += `<span class="scount">${cur < 0 ? 0 : cur + 1}/${steps.length}</span>`;
  sec.innerHTML = h;
  const tracker = document.getElementById('steps-tracker');
  if (tracker && tracker.style.display !== 'none') {
    tracker.innerHTML = steps.map((s, i) => {
      const lbl = typeof s.label === 'function' ? s.label() : s.label;
      const state = i < cur ? 'done' : i === cur ? 'current' : 'pending';
      const icon = i < cur ? '✓' : i === cur ? '▶' : `${i + 1}`;
      return `<div class="stk-step stk-${state}"><span class="stk-icon">${icon}</span><span class="stk-lbl">${lbl}</span></div>`;
    }).join('');
  }
}
function renderNodeAlive(id, alive) {
  const card = document.getElementById(`node-${id}`);
  if (!card) return;
  const ind = card.querySelector('.n-indicator');
  if (!alive) {
    card.classList.add('n-dead'); ind.style.background = 'var(--dead)'; ind.style.animation = 'none';
    if (!card.querySelector('.dead-overlay')) {
      const ov = document.createElement('div'); ov.className = 'dead-overlay'; ov.id = `dead-${id}`; ov.textContent = 'NODE FAILED'; card.appendChild(ov);
    }
  } else {
    card.classList.remove('n-dead', 'n-partitioned');
    ind.style.background = 'var(--ok)'; ind.style.animation = 'blink 3s ease infinite';
    // Clear inline styles left by blacklist/drain
    card.style.opacity = ''; card.style.borderColor = '';
    // Remove all overlays
    document.getElementById(`dead-${id}`)?.remove();
    document.getElementById(`part-${id}`)?.remove();
  }
}

// ── Election Timeline Renderer ──
function renderElectionTimeline(sc, curStep) {
  const el = document.getElementById('elect-timeline');
  if (!sc.electionSteps) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const steps = sc.electionSteps;
  const activeElStep = curStep >= 0 ? (sc.steps[curStep]?.elStep ?? -1) : -1;
  const stepsEl = document.getElementById('et-steps');
  stepsEl.innerHTML = '';
  steps.forEach((lbl, i) => {
    const wrap = document.createElement('div'); wrap.className = 'et-step';
    const isDone = i < activeElStep;
    const isAct = i === activeElStep;
    if (i < steps.length - 1) {
      const line = document.createElement('div');
      line.className = 'et-line' + (isDone ? ' et-done' : '');
      wrap.appendChild(line);
    }
    const dot = document.createElement('div');
    dot.className = 'et-dot' + (isDone ? ' et-ok' : isAct ? ' et-active' : isDone ? ' et-done' : '');
    wrap.appendChild(dot);
    const l = document.createElement('div');
    l.className = 'et-lbl' + (isAct ? ' et-active' : '');
    l.textContent = lbl;
    wrap.appendChild(l);
    stepsEl.appendChild(wrap);
  });
}

// ════════════════════════════════════════════
//  CTX HELPERS
// ════════════════════════════════════════════

function makeCtx() {
  return {
    delay: ms => new Promise(r => setTimeout(r, ms / speedVal)),
    log: (msg, type = '') => addLog(msg, type),
    activateClient: on => { const el = document.getElementById('client-box'); el.classList.toggle('active', on); },
    setLat: (i, v) => setLatency(i, v),
    setDDL: code => {
      const sec = document.getElementById('ddl-sec'); const box = document.getElementById('ddl-code');
      if (code) {
        sec.style.display = 'block';
        // Basic syntax highlighting
        let html = code
          .replace(/\b(CREATE TABLE|PRIMARY KEY|SPLIT AT VALUES|VALUES|INT|TEXT|ASC|HASH)\b/g, (m) => {
            let cls = 'sql-kw';
            if (['INT', 'TEXT'].includes(m)) cls = 'sql-type';
            if (['HASH', 'ASC', 'SPLIT AT VALUES'].includes(m)) cls = 'sql-sh';
            return `<span class="${cls}">${m}</span>`;
          });
        box.innerHTML = html;
      } else { sec.style.display = 'none'; }
    },
    hlLatRow: i => { const el = document.getElementById(`lat-${i}`); if (el) { el.classList.add('hl-lat'); setTimeout(() => el.classList.remove('hl-lat'), 2500); } },
    hlTablet: (tgId, nId, cls) => {
      const el = document.getElementById(`tablet-${tgId}-${nId}`); if (!el) return;
      el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 2500);
    },
    hlNode: (nId, cls) => { const el = document.getElementById(`node-${nId}`); if (el) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 2000); } },
    hlTerm: () => {
      const el = document.getElementById('term-display');
      if (el) { el.classList.add('hl-term'); setTimeout(() => el.classList.remove('hl-term'), 2000); }
    },
    hlRow: (tgId, nId, ri) => {
      const rs = S.replicaState[tgId]?.[nId]; if (!rs) return;
      rs.readRow = ri; reRenderTabletInternal(tgId, nId);
      setTimeout(() => { rs.readRow = undefined; reRenderTabletInternal(tgId, nId); }, 2200);
    },
    safeFlash: (tgId, nId, durationMs = 3500) => {
      const rs = S.replicaState[tgId]?.[nId]; if (!rs) return;
      const el = document.getElementById(`tablet-${tgId}-${nId}`);
      rs.safePulse = true; reRenderTabletInternal(tgId, nId);
      if (el) { el.classList.add('t-safe'); }
      setTimeout(() => {
        rs.safePulse = false; reRenderTabletInternal(tgId, nId);
        if (el) el.classList.remove('t-safe');
      }, durationMs);
    },
    addMem: (tgId, nId, amt) => {
      const rs = S.replicaState[tgId]?.[nId]; if (!rs) return;
      rs.mem = Math.min(100, rs.mem + amt); reRenderTabletInternal(tgId, nId);
    },
    setRole: (tgId, nId, role) => {
      const g = S.groups.find(x => x.id === tgId); if (!g) return;
      if (role === 'LEADER') { g.leaderNode = nId; renderAllTablets(); renderConnections(); }
      else if (role === 'CANDIDATE') {
        const el = document.getElementById(`tablet-${tgId}-${nId}`);
        if (el) {
          el.classList.add('t-candidate');
          const b = el.querySelector('.role-badge');
          if (b) { b.className = 'role-badge r-CANDIDATE'; b.textContent = 'CANDIDATE'; }
        }
      }
    },
    killNode: id => { S.nodes.find(n => n.id === id).alive = false; renderNodeAlive(id, false); _fdDrainLeaders(id); renderAllTablets(); renderConnections(); },
    reviveNode: id => { S.nodes.find(n => n.id === id).alive = true; renderNodeAlive(id, true); renderAllTablets(); setTimeout(renderConnections, 50); },
    reRenderTablet: (tgId, nId, markRow) => {
      if (markRow !== undefined && markRow !== false) {
        const g = S.groups.find(x => x.id === tgId);
        if (g) {
          const rs = S.replicaState[tgId][nId];
          if (rs._nrTimer) { clearTimeout(rs._nrTimer); rs._nrTimer = null; }
          const maxRows = g.maxRows ?? 3;
          const dataIdx = (markRow === true) ? g.data.length - 1 : markRow;
          const start = Math.max(0, g.data.length - maxRows);
          const sliceIdx = dataIdx - start;
          rs.newRows = (sliceIdx >= 0 && sliceIdx < maxRows) ? [sliceIdx] : [];
          reRenderTabletInternal(tgId, nId);
          rs._nrTimer = setTimeout(() => { rs.newRows = []; rs._nrTimer = null; reRenderTabletInternal(tgId, nId); }, 2000);
          return;
        }
      }
      reRenderTabletInternal(tgId, nId);
    },
    renderHashCompute: async (id, hashHex, tabletId, range) => {
      const cw = document.getElementById('canvas-wrap');
      const card = document.createElement('div');
      card.className = 'hash-viz-card';
      card.innerHTML = `
            <div class="hash-title">Hash Sharding Logic</div>
            <div class="hash-flow">
              <span class="hash-val">ID: ${id}</span>
              <span class="hash-arr">→</span>
              <span class="hash-fn">hash()</span>
              <span class="hash-arr">→</span>
              <span class="hash-res">${hashHex}</span>
            </div>
            <div class="hash-dest">Tablet: ${tabletId}</div>
            <div class="hash-range">Range: ${range}</div>
          `;
      cw.appendChild(card);

      return new Promise(r => {
        card.onmouseleave = () => {
          card.remove();
          r();
        };
        setTimeout(() => {
          if (document.body.contains(card)) {
            // If user didn't mouse leave within 3s, remove it automatically
            card.remove();
            r();
          }
        }, 3000);
      });
    },
    pktClientToTablet: (tgId, nId, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const cb = document.getElementById('client-box').getBoundingClientRect();
      const from = {
        x: cb.left - cr.left + cb.width / 2 + cw.scrollLeft,
        y: cb.top - cr.top + cb.height / 2 + cw.scrollTop
      };
      const to = getTC(tgId, nId, cr); if (!to) { res(); return; }
      animPkt(from, { x: to.x + cw.scrollLeft, y: to.y + cw.scrollTop }, cls, dur / speedVal, res);
    }),
    pktClientToNode: (nId, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const cb = document.getElementById('client-box').getBoundingClientRect();
      const from = { x: cb.left - cr.left + cb.width / 2 + cw.scrollLeft, y: cb.top - cr.top + cb.height / 2 + cw.scrollTop };
      const nd = document.getElementById(`node-${nId}`); if (!nd) { res(); return; }
      const nr = nd.getBoundingClientRect();
      const to = { x: nr.left - cr.left + nr.width / 2 + cw.scrollLeft, y: nr.top - cr.top + nr.height / 2 + cw.scrollTop };
      animPkt(from, to, cls, dur / speedVal, res);
    }),
    pktTabletToClient: (tgId, nId, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const cb = document.getElementById('client-box').getBoundingClientRect();
      const to = {
        x: cb.left - cr.left + cb.width / 2 + cw.scrollLeft,
        y: cb.top - cr.top + cb.height / 2 + cw.scrollTop
      };
      const from = getTC(tgId, nId, cr); if (!from) { res(); return; }
      animPkt({ x: from.x + cw.scrollLeft, y: from.y + cw.scrollTop }, to, cls, dur / speedVal, res);
    }),
    pktFromElToTablet: (elId, tgId, nId, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const el = document.getElementById(elId); if (!el) { res(); return; }
      const eb = el.getBoundingClientRect();
      const from = { x: eb.left - cr.left + eb.width / 2 + cw.scrollLeft, y: eb.top - cr.top + eb.height / 2 + cw.scrollTop };
      const to = getTC(tgId, nId, cr); if (!to) { res(); return; }
      animPkt(from, { x: to.x + cw.scrollLeft, y: to.y + cw.scrollTop }, cls, dur / speedVal, res);
    }),
    pktTabletToEl: (tgId, nId, elId, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const el = document.getElementById(elId); if (!el) { res(); return; }
      const eb = el.getBoundingClientRect();
      const to = { x: eb.left - cr.left + eb.width / 2 + cw.scrollLeft, y: eb.top - cr.top + eb.height / 2 + cw.scrollTop };
      const from = getTC(tgId, nId, cr); if (!from) { res(); return; }
      animPkt({ x: from.x + cw.scrollLeft, y: from.y + cw.scrollTop }, to, cls, dur / speedVal, res);
    }),
    activateEl: (elId, on) => { const el = document.getElementById(elId); if (el) el.classList.toggle('active', on); },
    pktTabletToTablet: (fTg, fN, tTg, tN, cls, dur) => new Promise(res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const from = getTC(fTg, fN, cr); const to = getTC(tTg, tN, cr);
      if (!from || !to) { res(); return; }
      animPkt(
        { x: from.x + cw.scrollLeft, y: from.y + cw.scrollTop },
        { x: to.x + cw.scrollLeft, y: to.y + cw.scrollTop },
        cls, dur / speedVal, res
      );
    }),
    rebuildReplicaState: () => {
      S.replicaState = buildRS(S.groups);
    },
    shardingPanel: (data) => renderShardingPerfPanel(data),
    haPanel: (data) => renderHaPanel(data),
    snapshotViz: (data) => renderSnapshotViz(data),
    backupViz: (data) => renderBackupViz(data),
    pitrViz: (data) => renderPitrViz(data),
    cloneViz: (data) => renderCloneViz(data),
    ttViz: (data) => renderTTViz(data),
    backupPanel: (data) => renderBackupPanel(data),
    pitrPanel: (data) => renderPitrPanel(data),
    ttPanel: (data) => renderTTPanel(data),
    cdcPanel: (data) => renderCdcPanel(data),
    setNodeRegion: (nId, region, label) => {
      const card = document.getElementById(`node-${nId}`);
      if (!card) return;
      card.classList.remove('us-region', 'eu-region', 'apac-region');
      if (region) card.classList.add(`${region}-region`);
      const lbl = card.querySelector('.region-label');
      if (lbl) lbl.textContent = label || '';
      const z = card.querySelector('.n-zone');
      if (z) {
        const azSuffix = ['a', 'b', 'c'][(nId - 1) % 3];
        if (region === 'us') z.textContent = `us-east-1${azSuffix}`;
        else if (region === 'eu') z.textContent = `eu-central-1${azSuffix}`;
        else if (region === 'apac') z.textContent = `ap-south-1${azSuffix}`;
        else z.textContent = `ap-south-1${azSuffix}`;

      }
    },
    setCanvasRegionMode: (mode) => {
      const cw = document.getElementById('canvas-wrap');
      if (mode) cw.classList.add('region-distance');
      else cw.classList.remove('region-distance');
    },
    setNodeVisibility: (nId, visible) => {
      const card = document.getElementById(`node-${nId}`);
      if (card) card.style.display = visible ? '' : 'none';
    },
    setCanvasGeoMode: (mode) => {
      const cw = document.getElementById('canvas-wrap');
      if (mode) cw.classList.add('geo-mode');
      else cw.classList.remove('geo-mode');
    },
    setXClusterMode: (mode) => {
      const cw = document.getElementById('canvas-wrap');
      const pb = document.getElementById('xc-primary-bar');
      const lb = document.getElementById('xc-latency-band');
      const sb = document.getElementById('xc-secondary-bar');
      ['xc-p1', 'xc-p2', 'xc-p3'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.remove('polling', 'applying');
      });
      document.querySelectorAll('#lat-rows .lat-row').forEach(el => el.classList.remove('hl-lat'));
      if (mode) {
        cw.classList.add('xcluster-mode');
        if (pb) pb.style.display = 'flex';
        if (lb) lb.style.display = 'flex';
        if (sb) sb.style.display = 'flex';
        const badge = document.getElementById('xc-secondary-badge');
        if (badge) { badge.textContent = 'SECONDARY'; badge.className = 'xc-badge secondary'; }
      } else {
        cw.classList.remove('xcluster-mode');
        if (pb) pb.style.display = 'none';
        if (lb) lb.style.display = 'none';
        if (sb) sb.style.display = 'none';
        const p3r = document.getElementById('xc-p3'); if (p3r) p3r.style.display = '';
      }
    },
    hlPoller: (pollerId, state) => {
      const el = document.getElementById(`xc-p${pollerId}`);
      if (!el) return;
      el.classList.remove('polling', 'applying');
      if (state) el.classList.add(state);
    },
    hlLatRow: (idx) => {
      document.querySelectorAll('#lat-rows .lat-row').forEach(el => el.classList.remove('hl-lat'));
      const indices = Array.isArray(idx) ? idx : (idx !== null && idx !== undefined ? [idx] : []);
      indices.forEach(i => { const el = document.getElementById(`lat-${i}`); if (el) el.classList.add('hl-lat'); });
    },
    setLag: (val) => {
      const el = document.getElementById('xc-lag'); if (el) el.textContent = val;
    },
    setRPO: (val, warn) => {
      const el = document.getElementById('xc-rpo');
      if (el) { el.textContent = val; el.className = 'xc-metric-val' + (warn ? ' warn' : ''); }
    },
    pktXCluster: (pollerId, srcTgId, srcNode, tgtTgId, tgtNode, dur) => new Promise(async res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const pollerEl = document.getElementById(`xc-p${pollerId}`);
      const src = getTC(srcTgId, srcNode, cr);
      if (!src || !pollerEl) { res(); return; }
      const pr = pollerEl.getBoundingClientRect();
      const px = pr.left - cr.left + pr.width / 2 + cw.scrollLeft;
      const py = pr.top - cr.top + pr.height / 2 + cw.scrollTop;
      const sx = src.x + cw.scrollLeft, sy = src.y + cw.scrollTop;
      // Phase 1: Poll request — poller reaches up to source tablet
      await new Promise(r => animPkt({ x: px, y: py }, { x: sx, y: sy }, 'pk-xcl-req', dur * 0.2 / speedVal, r));
      // Phase 2: Source returns data — packet travels back to poller
      pollerEl.classList.add('polling');
      await new Promise(r => animPkt({ x: sx, y: sy }, { x: px, y: py }, 'pk-xcl', dur * 0.3 / speedVal, r));
      // Phase 3: Poller processes the CDC record
      await new Promise(r => setTimeout(r, dur * 0.1 / speedVal));
      pollerEl.classList.remove('polling'); pollerEl.classList.add('applying');
      // Phase 4: Apply — poller pushes to target tablet in same cluster
      const tgt = getTC(tgtTgId, tgtNode, cr);
      if (tgt) await new Promise(r => animPkt({ x: px, y: py }, { x: tgt.x + cw.scrollLeft, y: tgt.y + cw.scrollTop }, 'pk-xcl-apply', dur * 0.4 / speedVal, r));
      setTimeout(() => pollerEl.classList.remove('applying'), 500);
      res();
    }),
    pktXClusterNM: (pollerId, sources, targets, dur, onPollComplete) => new Promise(async res => {
      const cw = document.getElementById('canvas-wrap');
      const cr = cw.getBoundingClientRect();
      const pollerEl = document.getElementById(`xc-p${pollerId}`);
      if (!pollerEl) { res(); return; }
      const pr = pollerEl.getBoundingClientRect();
      const px = pr.left - cr.left + pr.width / 2 + cw.scrollLeft;
      const py = pr.top - cr.top + pr.height / 2 + cw.scrollTop;
      // Phase 1: Poll requests to all source tablets simultaneously
      await Promise.all(sources.map(s => {
        const src = getTC(s.tgId, s.node, cr); if (!src) return Promise.resolve();
        return new Promise(r => animPkt({ x: px, y: py }, { x: src.x + cw.scrollLeft, y: src.y + cw.scrollTop }, 'pk-xcl-req', dur * 0.15 / speedVal, r));
      }));
      // Phase 2: Data responses from all sources simultaneously
      pollerEl.classList.add('polling');
      await Promise.all(sources.map(s => {
        const src = getTC(s.tgId, s.node, cr); if (!src) return Promise.resolve();
        return new Promise(r => animPkt({ x: src.x + cw.scrollLeft, y: src.y + cw.scrollTop }, { x: px, y: py }, 'pk-xcl', dur * 0.25 / speedVal, r));
      }));
      if (onPollComplete) onPollComplete();
      // Phase 3: Process at poller
      await new Promise(r => setTimeout(r, dur * 0.1 / speedVal));
      pollerEl.classList.remove('polling'); pollerEl.classList.add('applying');
      // Phase 4: Apply to all target tablets simultaneously
      await Promise.all(targets.map(t => {
        const tgt = getTC(t.tgId, t.node, cr); if (!tgt) return Promise.resolve();
        return new Promise(r => animPkt({ x: px, y: py }, { x: tgt.x + cw.scrollLeft, y: tgt.y + cw.scrollTop }, 'pk-xcl-apply', dur * 0.5 / speedVal, r));
      }));
      setTimeout(() => pollerEl.classList.remove('applying'), 500);
      res();
    })
  };
}

function getTC(tgId, nId, cr) {
  const el = document.getElementById(`tablet-${tgId}-${nId}`); if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
}
function animPkt(from, to, cls, dur, cb) {
  const cw = document.getElementById('canvas-wrap');
  const el = document.createElement('div'); el.className = `pkt ${cls}`;
  // Initial position needs to be relative to the scrollable container
  el.style.left = from.x + 'px'; el.style.top = from.y + 'px';
  cw.appendChild(el); const t0 = performance.now();
  (function frame(now) {
    const t = Math.min((now - t0) / dur, 1); const e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.style.left = (from.x + (to.x - from.x) * e) + 'px'; el.style.top = (from.y + (to.y - from.y) * e) + 'px';
    if (t < 1) requestAnimationFrame(frame); else { el.remove(); if (cb) cb(); }
  })(t0);
}

// ════════════════════════════════════════════
//  SCENARIO CONTROL
// ════════════════════════════════════════════

function buildSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.innerHTML = '';

  // Add Home button
  const homeBtn = document.createElement('button');
  homeBtn.className = 'sbtn' + (currentScenario === 'home' ? ' active' : '');
  homeBtn.onclick = () => selectScenario('home');
  homeBtn.innerHTML = `
        <span class="sicon">🏠</span>
        <div>
          <div class="slabel">Explorer Home</div>
          <div class="ssub">Scenario Overview</div>
        </div>
      `;
  sb.appendChild(homeBtn);

  const groupOrder = ["Foundations", "Deployment Architectures", "Global Universe", "xCluster", "Data Distribution", "Consistency & High Availability", "Read & Write Paths", "Scalability", "Security", "Data Management", "System Internals"];
  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });
  Object.keys(groups).forEach(g => groups[g].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)));

  groupOrder.forEach(gname => {
    if (!groups[gname]) return;
    const div = document.createElement('div');
    div.className = 'sgroup';
    div.textContent = gname;
    sb.appendChild(div);

    groups[gname].forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'sbtn' + (currentScenario === s.id ? ' active' : '');
      if (s.isArch) {
        btn.setAttribute('data-arch', s.id);
        btn.onclick = () => selectArch(s.id);
      } else {
        btn.setAttribute('data-sc', s.id);
        btn.onclick = () => selectScenario(s.id);
      }
      btn.innerHTML = `
            <span class="sicon">${s.icon || '📦'}</span>
            <div>
              <div class="slabel">${s.name}</div>
              <div class="ssub">${s.subtitle || ''}</div>
            </div>
          `;
      sb.appendChild(btn);
    });
  });
}

function renderHome() {
  const hv = document.getElementById('home-view');
  if (!hv) return;
  hv.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'home-container';

  const sHome = SCENARIOS['home'];
  const hero = document.createElement('div');
  hero.className = 'home-hero';
  hero.innerHTML = `
        <h1>${sHome.title}</h1>
        <p>${sHome.description}</p>
      `;
  container.appendChild(hero);

  // Declare shared metadata before learning path and chapter grid both use it
  const groupOrder = [
    "Foundations", "Deployment Architectures", "Global Universe", "xCluster",
    "Data Distribution", "Consistency & High Availability", "Read & Write Paths",
    "Scalability", "Security", "Data Management", "System Internals"
  ];
  const groupMeta = {
    "Foundations":                     { chapter: "CHAPTER 1", icon: "🏗️", desc: "Core concepts: cluster structure, fault domains, and Raft consensus." },
    "Deployment Architectures":        { chapter: "CHAPTER 2", icon: "🗺️", desc: "The two YugabyteDB deployment models: Global Universe, xCluster, and Read Replica." },
    "Global Universe":                 { chapter: "CHAPTER 3", icon: "🌐", desc: "Single-universe deployment: global distribution and geo-partitioning." },
    "xCluster":                        { chapter: "CHAPTER 4", icon: "🔗", desc: "Multi-universe deployment: async replication for DR and active-active." },
    "Data Distribution":               { chapter: "CHAPTER 5", icon: "📦", desc: "Sharding strategies, tablet management, and data colocation." },
    "Consistency & High Availability": { chapter: "CHAPTER 6", icon: "🛡️", desc: "Raft leader election, node failure recovery, and partition handling." },
    "Read & Write Paths":              { chapter: "CHAPTER 7", icon: "⚡", desc: "How reads and writes flow through the distributed Raft layers." },
    "Scalability":                     { chapter: "CHAPTER 8", icon: "📈", desc: "Elastic scale-out and automatic tablet splitting as the cluster grows." },
    "Security":                         { chapter: "CHAPTER 9",  icon: "🔒", desc: "Encryption in transit, encryption at rest, row-level security, column-level encryption, authentication, and audit logging." },
    "Data Management":                 { chapter: "CHAPTER 10", icon: "💾", desc: "Consistent snapshots, distributed backup, point-in-time recovery, database cloning, time travel queries, and CDC logical replication." },
    "System Internals":                { chapter: "CHAPTER 11", icon: "🔬", desc: "DocDB storage engine, MVCC, control plane, and distributed time." },
  };

  // ── Learning Path ──────────────────────────────────────────────────────────
  const lpPhases = [
    { label: 'Cluster Basics',    color: '#60a5fa', chapters: ['Foundations', 'Deployment Architectures'] },
    { label: 'Global Topology',   color: '#34d399', chapters: ['Global Universe', 'xCluster'] },
    { label: 'Data Sharding',     color: '#f59e0b', chapters: ['Data Distribution'] },
    { label: 'High Availability', color: '#fb7185', chapters: ['Consistency & High Availability'] },
    { label: 'Read & Write',      color: '#a78bfa', chapters: ['Read & Write Paths'] },
    { label: 'Scalability',       color: '#6366f1', chapters: ['Scalability'] },
    { label: 'Security',          color: '#f43f5e', chapters: ['Security'] },
    { label: 'Data Management',   color: '#22d3ee', chapters: ['Data Management'] },
    { label: 'System Internals',  color: '#94a3b8', chapters: ['System Internals'] },
  ];

  const personas = [
    { id: 'all',  icon: '🗺️', label: 'All Chapters',       desc: 'Complete curriculum',         color: '#60a5fa',
      chapters: null },
    { id: 'dev',  icon: '💻', label: 'App Developer',       desc: 'Build on YugabyteDB',         color: '#34d399',
      chapters: ['Foundations', 'Data Distribution', 'Read & Write Paths', 'Consistency & High Availability', 'Security'] },
    { id: 'dba',  icon: '🛠️', label: 'DBA / SRE',           desc: 'Operate and tune clusters',   color: '#fb7185',
      chapters: ['Foundations', 'Deployment Architectures', 'Consistency & High Availability', 'Scalability', 'Security', 'Data Management', 'System Internals'] },
    { id: 'arch', icon: '🏛️', label: 'Solutions Architect', desc: 'Design global topologies',    color: '#f59e0b',
      chapters: ['Foundations', 'Deployment Architectures', 'Data Distribution', 'Global Universe', 'xCluster'] },
    { id: 'de',   icon: '📊', label: 'Data Engineer',       desc: 'Manage and scale data',       color: '#a78bfa',
      chapters: ['Foundations', 'Data Distribution', 'Read & Write Paths', 'Scalability', 'Data Management', 'System Internals'] },
  ];

  function lpFirstScenario(groupName) {
    return Object.keys(SCENARIOS)
      .filter(id => id !== 'home' && SCENARIOS[id].group === groupName)
      .map(id => ({ id, ...SCENARIOS[id] }))
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))[0];
  }

  const lpWrap = document.createElement('div');
  lpWrap.className = 'lp-wrap';
  lpWrap.innerHTML = `<div class="lp-heading">📚 Learning Path</div>
    <div class="lp-sub">Select your role for a curated sequence, or browse all chapters</div>`;

  // Persona selector bar
  const personaBar = document.createElement('div');
  personaBar.className = 'lp-personas';
  personas.forEach(p => {
    const card = document.createElement('div');
    card.className = 'lp-persona-card' + (p.id === 'all' ? ' active' : '');
    card.style.setProperty('--pc-color', p.color);
    card.dataset.pid = p.id;
    card.onclick = () => window.lpSetPersona(p.id);
    card.innerHTML = `<span class="lp-pcard-icon">${p.icon}</span>
      <span class="lp-pcard-label">${p.label}</span>
      <span class="lp-pcard-desc">${p.desc}</span>`;
    personaBar.appendChild(card);
  });
  lpWrap.appendChild(personaBar);

  const lpTrackWrap = document.createElement('div');
  lpTrackWrap.id = 'lp-track-wrap';
  lpWrap.appendChild(lpTrackWrap);

  function renderLpTrack(pid) {
    lpTrackWrap.innerHTML = '';
    const persona = personas.find(p => p.id === pid) || personas[0];

    if (pid === 'all') {
      // Phase-grouped view
      const lpTrack = document.createElement('div');
      lpTrack.className = 'lp-track';

      lpPhases.forEach((phase, pi) => {
        const phaseEl = document.createElement('div');
        phaseEl.className = 'lp-phase';
        phaseEl.style.setProperty('--ph-color', phase.color);

        const phaseLabel = document.createElement('div');
        phaseLabel.className = 'lp-phase-label';
        phaseLabel.textContent = phase.label;
        phaseEl.appendChild(phaseLabel);

        const nodesRow = document.createElement('div');
        nodesRow.className = 'lp-nodes';

        phase.chapters.forEach((chName, ci) => {
          const meta = groupMeta[chName];
          const first = lpFirstScenario(chName);
          if (!meta) return;

          const node = document.createElement('div');
          node.className = 'lp-node';
          node.title = `Start: ${first?.name || chName}`;
          node.onclick = () => {
            if (!first) return;
            first.isArch ? selectArch(first.id) : selectScenario(first.id);
          };
          node.innerHTML = `
            <div class="lp-node-icon">${meta.icon}</div>
            <div class="lp-node-badge">${meta.chapter.replace('CHAPTER ', 'CH')}</div>
            <div class="lp-node-name">${chName}</div>
            <div class="lp-node-cta">Start →</div>`;
          nodesRow.appendChild(node);

          if (ci < phase.chapters.length - 1) {
            const arr = document.createElement('div');
            arr.className = 'lp-arr-inner';
            arr.textContent = '→';
            nodesRow.appendChild(arr);
          }
        });

        phaseEl.appendChild(nodesRow);
        lpTrack.appendChild(phaseEl);

        if (pi < lpPhases.length - 1) {
          const sep = document.createElement('div');
          sep.className = 'lp-arr-phase';
          sep.textContent = '▶';
          lpTrack.appendChild(sep);
        }
      });

      lpTrackWrap.appendChild(lpTrack);

    } else {
      // Flat numbered sequence for persona
      const seqRow = document.createElement('div');
      seqRow.className = 'lp-seq-row';

      persona.chapters.forEach((chName, i) => {
        const meta = groupMeta[chName];
        const first = lpFirstScenario(chName);
        if (!meta) return;

        const step = document.createElement('div');
        step.className = 'lp-node lp-seq-step';
        step.style.setProperty('--ph-color', persona.color);
        step.title = `Start: ${first?.name || chName}`;
        step.onclick = () => {
          if (!first) return;
          first.isArch ? selectArch(first.id) : selectScenario(first.id);
        };
        step.innerHTML = `
          <div class="lp-seq-num">${i + 1}</div>
          <div class="lp-node-icon">${meta.icon}</div>
          <div class="lp-node-name">${chName}</div>
          <div class="lp-node-cta">Start →</div>`;
        seqRow.appendChild(step);

        if (i < persona.chapters.length - 1) {
          const arr = document.createElement('div');
          arr.className = 'lp-arr-persona';
          arr.innerHTML = `<span>→</span>`;
          seqRow.appendChild(arr);
        }
      });

      lpTrackWrap.appendChild(seqRow);
    }
  }

  window.lpSetPersona = function(pid) {
    lpWrap.querySelectorAll('.lp-persona-card').forEach(c => {
      c.classList.toggle('active', c.dataset.pid === pid);
    });
    renderLpTrack(pid);
  };

  renderLpTrack('all');
  container.appendChild(lpWrap);
  // ── End Learning Path ──────────────────────────────────────────────────────

  const gridWrap = document.createElement('div');
  gridWrap.className = 'home-sections-grid';

  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });
  Object.keys(groups).forEach(g => groups[g].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)));

  groupOrder.forEach(gname => {
    if (!groups[gname]) return;
    const meta = groupMeta[gname] || { chapter: "EXTRA", icon: "📂", desc: "" };

    const section = document.createElement('div');
    section.className = 'home-section';

    const hdr = document.createElement('div');
    hdr.className = 'home-section-hdr';
    hdr.innerHTML = `
          <div class="hc-chapter-badge">${meta.chapter}</div>
          <h3>${meta.icon} ${gname}</h3>
          <p>${meta.desc}</p>
        `;
    section.appendChild(hdr);

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'home-grid';

    groups[gname].forEach(s => {
      const card = document.createElement('div');
      card.className = 'home-card';
      card.onclick = () => s.isArch ? selectArch(s.id) : selectScenario(s.id);
      card.innerHTML = `
            <div class="hc-icon">${s.icon || '📦'}</div>
            <div class="hc-title">${s.name}</div>
            <div class="hc-sub">${s.subtitle || ''}</div>
            <div class="hc-desc">${s.desc || ''}</div>
            <button class="hc-btn">Explore &rarr;</button>
          `;
      cardsGrid.appendChild(card);
    });

    section.appendChild(cardsGrid);
    gridWrap.appendChild(section);
  });

  container.appendChild(gridWrap);
  hv.appendChild(container);
}

function scrollSidebarToActive() {
  setTimeout(() => {
    const active = document.querySelector('.sidebar .sbtn.active');
    const sb = document.getElementById('sidebar');
    if (active && sb) {
      // Manual calculation for more reliable centering
      const top = active.offsetTop;
      const target = top - (sb.clientHeight / 2) + (active.clientHeight / 2);
      sb.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, 200);
}

function selectScenario(id) {
  currentScenario = id; currentStep = -1; stepRunning = false; stopPlay();
  buildSidebar();
  scrollSidebarToActive();

  const hv = document.getElementById('home-view');
  const cw = document.getElementById('canvas-wrap');
  const ip = document.querySelector('.info-panel');
  const fd = document.getElementById('failure-dash');
  const sd = document.getElementById('scalability-dash');
  const dp = document.getElementById('data-panel');
  const sp = document.getElementById('split-panel');
  const dbp = document.getElementById('docdb-panel');
  const cb = document.querySelector('.ctrl-bar');

  if (id === 'home') {
    hv.style.display = 'block';
    cw.style.display = 'none';
    ip.style.display = 'none';
    fd.classList.remove('visible'); fd.style.display = '';
    sd.classList.remove('visible'); sd.style.display = '';
    const _mrp = document.getElementById('mr-lat-panel');
    if (_mrp) { _mrp.classList.remove('visible'); _mrp.style.display = ''; }
    const _shp2 = document.getElementById('sharding-perf-panel');
    if (_shp2) _shp2.classList.remove('visible');
    const _hap2 = document.getElementById('ha-panel');
    if (_hap2) _hap2.classList.remove('visible');
    const _bkp2 = document.getElementById('backup-panel');
    if (_bkp2) _bkp2.classList.remove('visible');
    const _pitrp2 = document.getElementById('pitr-panel');
    if (_pitrp2) _pitrp2.classList.remove('visible');
    const _ttp2 = document.getElementById('tt-panel');
    if (_ttp2) _ttp2.classList.remove('visible');
    const _cdcp2 = document.getElementById('cdc-panel');
    if (_cdcp2) _cdcp2.classList.remove('visible');
    const _svp2 = document.getElementById('snap-viz-panel');
    if (_svp2) _svp2.classList.remove('visible');
    const _cw2 = document.getElementById('canvas-wrap');
    if (_cw2) { _cw2.classList.remove('snap-hidden'); }
    const _dp2 = document.getElementById('docdb-panel');
    if (_dp2) _dp2.classList.remove('snap-expanded');
    dp.style.display = 'none';
    sp.style.display = 'none';
    dbp.style.display = 'none';
    cb.style.display = 'none';
    const _ch = document.querySelector('.cluster-health');
    if (_ch) _ch.style.display = 'none';
    closeTour();
    renderHome();
    document.getElementById('active-badge').textContent = 'Home';
    return;
  } else {
    hv.style.display = 'none';
    cw.style.display = 'flex';
    ip.style.display = 'flex';
    cb.style.display = 'flex';
  }

  S = freshState();
  fdReset();
  _exitArchMode(true);
  document.querySelectorAll('.sbtn[data-arch]').forEach(b => b.classList.remove('active'));

  const sc = SCENARIOS[id];
  const ctx = makeCtx();

  // Reset regional visuals & hide nodes 4-9 by default BEFORE scenario init
  ctx.setCanvasRegionMode(false);
  ctx.setCanvasGeoMode(false);
  ctx.setXClusterMode(false);
  document.getElementById('canvas-wrap').classList.remove('geo-partition');
  const isGeo = sc.name === 'Geo-Partition' || sc.name === 'Multi-Region';
  for (let n = 1; n <= 9; n++) {
    ctx.setNodeRegion(n, null, '');
    if (isGeo || n <= 3) {
      ctx.setNodeVisibility(n, true);
    } else {
      ctx.setNodeVisibility(n, false);
    }
  }

  // Clean up leftover DOM artifacts from previous scenarios
  drawPartitionWall(false);  // Remove partition wall SVG
  document.querySelectorAll('.canvas-wrap .pkt').forEach(el => el.remove()); // Remove stale packets
  const _cvd = document.getElementById('canvas-vs-divider');
  if (_cvd) _cvd.remove();
  fdCatchingUp = {};  // Cancel pending catch-up promises

  // Reset node display names before scenario init can override them
  for (let n = 1; n <= 9; n++) {
    const nameEl = document.querySelector(`#node-${n} .n-name`);
    if (nameEl) nameEl.textContent = `TServer-${n}`;
  }

  renderAllTablets(); setTimeout(renderConnections, 80);
  for (let n = 1; n <= 9; n++) renderNodeAlive(n, true);

  document.getElementById('active-badge').textContent = sc.name;
  document.getElementById('i-title').textContent = sc.name;
  document.getElementById('i-desc').innerHTML = sc.desc;
  document.getElementById('term-display').textContent = 'Raft Term: 4';
  const healthEl = document.querySelector('.cluster-health');
  if (healthEl) healthEl.style.display = '';
  const visibleNodes = new Set(S.groups.flatMap(g => g.replicas)).size;
  document.getElementById('health-txt').textContent = `Healthy · RF=3 · ${visibleNodes} TServers · ${S.groups.length} Raft Groups`;
  document.getElementById('health-dot').style.background = 'var(--ok)';
  document.getElementById('client-box').classList.remove('active');
  document.getElementById('client-box').textContent = '⬡ App Client';
  document.getElementById('ddl-sec').style.display = 'none';
  showDataPanel(false);
  showSplitPanel(false);
  showDocdbPanel(false);
  renderLatencies(sc.latencies);
  renderStepIndicator(sc.steps, -1);
  renderElectionTimeline(sc, -1);
  renderTxPanel();
  clearLog();

  clearLog();

  // Show/hide failure dashboard
  const isFailure = sc.failureMode;
  fd.style.display = ''; fd.classList.toggle('visible', !!isFailure);

  const isScaling = sc.name === 'Horizontal Scaling';
  sd.style.display = ''; sd.classList.toggle('visible', isScaling);

  const shp = document.getElementById('sharding-perf-panel');
  if (shp) shp.classList.toggle('visible', !!sc.shardingPanel);

  const hap = document.getElementById('ha-panel');
  if (hap) hap.classList.toggle('visible', !!sc.haPanel);

  const bkp = document.getElementById('backup-panel');
  if (bkp) bkp.classList.toggle('visible', !!sc.backupPanel);
  const pitrp = document.getElementById('pitr-panel');
  if (pitrp) pitrp.classList.toggle('visible', !!sc.pitrPanel);
  const ttp = document.getElementById('tt-panel');
  if (ttp) ttp.classList.toggle('visible', !!sc.ttPanel);
  const cdcp = document.getElementById('cdc-panel');
  if (cdcp) cdcp.classList.toggle('visible', !!sc.cdcPanel);
  const svp = document.getElementById('snap-viz-panel');
  if (svp) {
    svp.classList.toggle('visible', !!sc.snapshotVizPanel);
    delete svp.dataset.vizType;
    svp.style.height = '';
  }
  const cwEl = document.getElementById('canvas-wrap');
  if (cwEl) cwEl.classList.toggle('snap-hidden', !!sc.snapshotVizPanel || !!sc.cdcPanel);
  const dpEl = document.getElementById('docdb-panel');
  if (dpEl) dpEl.classList.toggle('snap-expanded', !!sc.snapshotVizPanel);
  const stkEl = document.getElementById('steps-tracker');
  if (stkEl) stkEl.style.display = (sc.snapshotVizPanel || sc.cdcPanel) && sc.steps?.length ? '' : 'none';

  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.style.display = sc.group === 'Data Management' ? 'none' : '';

  const mrp = document.getElementById('mr-lat-panel');
  if (mrp) { mrp.style.display = ''; mrp.classList.toggle('visible', sc.name === 'Multi-Region' || sc.name === 'Multi-Zone'); }

  document.getElementById('canvas-wrap').style.flex = (isFailure || isScaling) ? '1' : '1';

  if (isFailure) {
    fdCurrentTab = sc.failureMode === 'partition' ? 'part' : 'node';
    document.getElementById('fdt-node').classList.toggle('active', sc.failureMode === 'node');
    document.getElementById('fdt-part').classList.toggle('active', sc.failureMode === 'partition');
    document.getElementById('fd-phase-lbl').textContent = '';
    fdRenderNodes();
  }

  if (isScaling) {
    renderScalingStats();
  }

  // Extra buttons
  const eb = document.getElementById('extra-btns'); eb.innerHTML = '';
  if (sc.extraBtns) for (const b of sc.extraBtns) {
    const btn = document.createElement('button'); btn.className = `btn ${b.cls}`; btn.id = b.id;
    btn.innerHTML = b.label; btn.disabled = !!b.disabled; btn.onclick = () => window[b.cb]();
    eb.appendChild(btn);
  }

  document.querySelectorAll('.sidebar .sbtn').forEach(b => {
    const sid = b.dataset.sc;
    b.classList.toggle('active', sid === id.toString() || (id === 'home' && !sid && b.querySelector('.sicon').textContent === '🏠'));
  });
  const has = sc.steps?.length > 0;
  document.getElementById('btn-step').disabled = !has;
  document.getElementById('btn-play').disabled = !has;

  hideHashRouting();
  if (sc.init) {
    try { sc.init(ctx); } catch (e) { console.error("Init failed", e); }
  }
  renderTour(sc);
}

async function stepForward() {
  if (stepRunning) return;
  const sc = SCENARIOS[currentScenario]; if (!sc.steps?.length) return;
  if (currentStep >= sc.steps.length - 1) { resetScenario(); return; }
  currentStep++; stepRunning = true;
  renderStepIndicator(sc.steps, currentStep);
  renderElectionTimeline(sc, currentStep);
  const step = sc.steps[currentStep];
  const lbl = typeof step.label === 'function' ? step.label() : step.label;
  const dsc = typeof step.desc === 'function' ? step.desc() : step.desc;
  addLog(`▶ Step ${currentStep + 1}: ${lbl.replace(/^\d+\.\s*/, '')}`, 'li');
  if (dsc) document.getElementById('i-desc').innerHTML = dsc;
  const ctx = makeCtx();
  try {
    await step.action(ctx);
  } catch (e) {
    console.error("Step failed", e);
    addLog(`✕ Step Error: ${e.message}`, 'le');
  } finally {
    stepRunning = false;
  }
  if (playing) playTimer = setTimeout(stepForward, 900 / speedVal);
}
function togglePlay() {
  playing = !playing; document.getElementById('btn-play').textContent = playing ? '⏸ Pause' : '▶ Play';
  if (playing) stepForward(); else stopPlay();
}
function stopPlay() { playing = false; document.getElementById('btn-play').textContent = '▶ Play'; if (playTimer) { clearTimeout(playTimer); playTimer = null; } }
function resetScenario() { stopPlay(); stepRunning = false; selectScenario(currentScenario); }

// ════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'light' ? '☾' : '☀';
  const logo = document.getElementById('yb-logo');
  if (logo) logo.src = theme === 'light' ? '../logo_l.svg' : '../logo.svg';
}
function initTheme() {
  _applyTheme(localStorage.getItem('yb-theme') || 'dark');
}
function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('yb-theme', next);
  _applyTheme(next);
}

// ════════════════════════════════════════════
//  LOG
// ════════════════════════════════════════════
function addLog(msg, type = '') {
  logTime++;
  const icons = { li: 'ℹ', ls: '✓', lw: '⚠', le: '✕', lr: '◉', '': '·' };
  const el = document.createElement('div'); el.className = `log-entry ${type}`;
  const t = document.createElement('div'); t.className = 'log-time'; t.textContent = String(logTime).padStart(3, '0');
  const ic = document.createElement('div'); ic.className = 'log-icon'; ic.textContent = icons[type] || '·';
  const m = document.createElement('div'); m.className = 'log-msg'; m.textContent = msg;
  el.appendChild(t); el.appendChild(ic); el.appendChild(m);
  const body = document.getElementById('log-body'); body.appendChild(el); body.scrollTop = body.scrollHeight;
}
function clearLog() { document.getElementById('log-body').innerHTML = ''; logTime = 0; }

// ════════════════════════════════════════════
//  CLICK INSPECTOR & DATA TABLE
// ════════════════════════════════════════════
function onTabletClick(g, nodeId) {
  const ti = TABLES[g.table];
  const alive = S.nodes.find(n => n.id === nodeId).alive;
  const isPartitioned = S.partitioned.includes(nodeId);
  const isLdr = g.leaderNode === nodeId && alive && !isPartitioned;
  const role = !alive ? 'DEAD' : isPartitioned ? 'PARTITIONED' : isLdr ? 'LEADER' : 'FOLLOWER';

  addLog(`[INSPECT] ${ti.name}.tablet_${g.tnum} @ TServer-${nodeId}`, 'li');
  let rangeTxt = g.table === 'users' ? `Hash Range: ${g.range}` : `Key Range: ${g.range}`;
  addLog(`Role:${role} · Term:${g.term} · ${rangeTxt}`, '');

  const rs = S.replicaState[g.id]?.[nodeId];
  if (rs) addLog(`Mem:${Math.round(rs.mem)}% SST:${Math.round(rs.ss)}% Segs:${rs.ssts?.length || 0} Rows:${g.data?.length || 0}`, '');

  // If data panel is visible, update it to this table
  if (document.getElementById('data-panel').style.display !== 'none') {
    renderDataTable(g.table);
    // Highlight the rows belonging to this tablet
    const trs = document.querySelectorAll('#data-table-body tr');
    trs.forEach(tr => {
      if (tr.id.startsWith(`dr-${g.id}-`)) tr.classList.add('active-row');
      else tr.classList.remove('active-row');
    });
  }
}

function showDataPanel(show) {
  const dp = document.getElementById('data-panel');
  if (dp) dp.style.display = show ? 'flex' : 'none';
}

function showSplitPanel(show) {
  const sp = document.getElementById('split-panel');
  if (sp) sp.style.display = show ? 'flex' : 'none';
}

function showDocdbPanel(show) {
  const dp = document.getElementById('docdb-panel');
  if (dp) dp.style.display = show ? 'flex' : 'none';
  if (!show) {
    const rw = document.getElementById('docdb-readers-wrap');
    if (rw) rw.style.display = 'none';
    setDocdbOp('');
  }
}

function setDocdbOp(sql) {
  const el = document.getElementById('docdb-op');
  if (!el) return;
  if (sql) { el.textContent = sql; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function renderDocdbPanel() {
  const db = S._docdb;
  const wrap = document.getElementById('docdb-layers-wrap');
  if (!wrap || !db) return;
  wrap.innerHTML = '';
  const allLayers = [];
  if (db.memtable !== undefined) {
    allLayers.push({ name: 'MemTable', badge: 'in-memory · mutable', entries: db.memtable, cls: 'dl-mem' });
  }
  for (let i = 0; i < (db.ssts || []).length; i++) {
    const sst = db.ssts[i];
    allLayers.push({ name: sst.name || `SST-${i} (L${sst.layer ?? i})`, badge: 'on-disk · immutable', entries: sst.entries, cls: 'dl-sst' });
  }
  for (const layer of allLayers) {
    const div = document.createElement('div');
    div.className = 'docdb-layer';
    const hdr = document.createElement('div');
    hdr.className = `docdb-lhdr ${layer.cls}`;
    hdr.innerHTML = `<span class="dl-name">${layer.name}</span><span class="dl-badge">${layer.badge}</span><span class="dl-count">${layer.entries.length} entries</span>`;
    div.appendChild(hdr);
    if (layer.entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'docdb-empty';
      empty.textContent = 'empty';
      div.appendChild(empty);
    } else {
      for (const e of layer.entries) {
        const row = document.createElement('div');
        let cls = 'docdb-entry';
        if (e.isNew) cls += ' de-new';
        if (e.type === 'TOMBSTONE') cls += ' de-tombstone';
        row.className = cls;
        const typeCls = e.type === 'TOMBSTONE' ? 'dt-tombstone' : e.type === 'SNAPSHOT' ? 'dt-snapshot' : 'dt-write';
        const valHtml = e.type === 'TOMBSTONE'
          ? '<span class="de-val de-tomb">— deleted —</span>'
          : e.type === 'SNAPSHOT'
          ? `<span class="de-val de-snap">— raft snapshot record —</span>`
          : `<span class="de-val">${e.value || ''}</span>`;
        row.innerHTML = `<span class="de-key">${e.display}</span><span class="de-type-col ${typeCls}">${e.type}</span><span class="de-hlc">@${e.hlc}</span>${valHtml}`;
        div.appendChild(row);
      }
    }
    wrap.appendChild(div);
  }
  // Snapshot hardlink section
  if (db.snapshotSsts && db.snapshotSsts.length > 0) {
    const multiFolder = db.snapshotSsts.some(s => s.folder);
    if (!multiFolder) {
      const divEl = document.createElement('div');
      divEl.className = 'docdb-snap-divider';
      divEl.textContent = `snapshots/${db.snapshotId || 'snap-001'}/`;
      wrap.appendChild(divEl);
    }
    for (let si = 0; si < db.snapshotSsts.length; si++) {
      const sst = db.snapshotSsts[si];
      if (sst.folder) {
        // Multi-folder mode: each sst is a snapshot folder with hardlinked files as entries
        const folderDiv = document.createElement('div');
        folderDiv.className = 'docdb-snap-divider';
        folderDiv.textContent = sst.folder;
        wrap.appendChild(folderDiv);
        const div = document.createElement('div');
        div.className = 'docdb-layer';
        for (const e of sst.entries) {
          const row = document.createElement('div');
          const typeCls = e.type === 'TOMBSTONE' ? 'dt-tombstone' : e.type === 'SNAPSHOT' ? 'dt-snapshot' : 'dt-write';
          row.className = `docdb-entry${e.type === 'TOMBSTONE' ? ' de-tombstone' : ''}`;
          const valHtml = e.type === 'TOMBSTONE'
            ? `<span class="de-val de-tomb">${e.value || '— filtered out —'}</span>`
            : `<span class="de-val">${e.value || ''}</span>`;
          row.innerHTML = `<span class="de-key">${e.display}</span><span class="de-type-col ${typeCls}">${e.type}</span><span class="de-hlc">${e.hlc}</span>${valHtml}`;
          div.appendChild(row);
        }
        wrap.appendChild(div);
      } else {
        // Legacy mode: single SST file with KV entries
        const div = document.createElement('div');
        div.className = 'docdb-layer';
        const hdr = document.createElement('div');
        hdr.className = 'docdb-lhdr dl-snap';
        hdr.innerHTML = `<span class="dl-name">${sst.name || `SST-${si}`}</span><span class="dl-badge">hardlink · read-only · GC-pinned</span><span class="dl-count">${sst.entries.length} entries</span>`;
        div.appendChild(hdr);
        for (const e of sst.entries) {
          const row = document.createElement('div');
          row.className = 'docdb-entry';
          const typeCls = e.type === 'TOMBSTONE' ? 'dt-tombstone' : e.type === 'SNAPSHOT' ? 'dt-snapshot' : 'dt-write';
          const valHtml = e.type === 'TOMBSTONE'
            ? '<span class="de-val de-tomb">— deleted —</span>'
            : e.type === 'SNAPSHOT'
            ? `<span class="de-val de-snap">${e.value || '— snapshot record —'}</span>`
            : `<span class="de-val">${e.value || ''}</span>`;
          row.innerHTML = `<span class="de-key">${e.display}</span><span class="de-type-col ${typeCls}">${e.type}</span><span class="de-hlc">@${e.hlc}</span>${valHtml}`;
          div.appendChild(row);
        }
        wrap.appendChild(div);
      }
    }
  }
}

function renderDocdbReaders(readers) {
  const wrap = document.getElementById('docdb-readers-wrap');
  const list = document.getElementById('docdb-readers-list');
  if (!list || !wrap) return;
  wrap.style.display = 'block';
  list.innerHTML = '';
  for (const r of readers) {
    const div = document.createElement('div');
    div.className = 'docdb-reader';
    const resultCls = r.found ? 'dr-result' : 'dr-result dr-miss';
    const resultTxt = r.found ? r.value : 'NOT FOUND';
    div.innerHTML = `<span class="dr-lbl">${r.label}</span><span class="dr-ts">@${r.ts}</span><span class="dr-arrow">→</span><span class="${resultCls}">${resultTxt}</span>`;
    list.appendChild(div);
  }
}


function renderSplitInfo(parentRange, splitPoint) {
  const viz = document.getElementById('split-viz');
  if (!viz) return;

  let start, end, split, p1, p2, nextSplit, endHex, startHex;
  const isHash = parentRange.includes('0x');

  if (isHash) {
    const matches = parentRange.match(/0x([0-9A-Fa-f]+)[–-]0x([0-9A-Fa-f]+)/);
    if (!matches) return;
    start = parseInt(matches[1], 16);
    end = parseInt(matches[2], 16);
    split = parseInt(splitPoint.replace('0x', ''), 16);
    const total = end - start;
    p1 = Math.round(((split - start) / total) * 100);
    p2 = 100 - p1;
    nextSplit = '0x' + (split + 1).toString(16).toUpperCase().padStart(4, '0');
    endHex = '0x' + end.toString(16).toUpperCase().padStart(4, '0');
    startHex = '0x' + start.toString(16).toUpperCase().padStart(4, '0');
  } else {
    // Range split (e.g., "0 — 999")
    const matches = parentRange.match(/(\d+)\s*[–—\-]\s*(\d+)/);
    if (!matches) return;
    start = parseInt(matches[1]);
    end = parseInt(matches[2]);
    split = parseInt(splitPoint);
    const total = end - start;
    p1 = Math.round(((split - start) / total) * 100);
    p2 = 100 - p1;
    startHex = start.toString();
    splitPoint = split.toString();
    nextSplit = (split + 1).toString();
    endHex = end.toString();
  }

  viz.innerHTML = `
          <div style="flex: 1.2; min-width: 300px;">
            <div class="rs-row">
              <div class="rs-label">Parent Tablet</div>
              <div class="rs-bar-wrap">
                <div class="rs-bar rs-parent" style="width:100%">${parentRange}</div>
                <div class="rs-point" style="left:${p1}%"><span class="rs-point-lbl">Split Point: ${splitPoint}</span></div>
              </div>
            </div>
            <div class="rs-row" style="margin-top: 20px;">
              <div class="rs-label">Child Tablets</div>
              <div class="rs-bar-wrap" style="display:flex; gap:2px; background:transparent; border:none;">
                <div class="rs-bar rs-child1" style="width:${p1}%; position:relative;">${startHex}–${splitPoint}</div>
                <div class="rs-bar rs-child2" style="width:${p2}%; position:relative;">${nextSplit}–${endHex}</div>
              </div>
            </div>
          </div>

          <div class="rs-note" style="flex: 1; min-width: 250px; padding: 12px; background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--info); border-radius: 4px; font-size: 12.5px; line-height: 1.5; color: var(--txt2); margin-top: 0;">
            <div style="font-weight: 700; color: var(--info); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 14px;">💡</span> Split Logic Note
            </div>
            <div style="margin-bottom: 12px;">
              <b>HASH split</b> is based on the <b>mid of the current hash values</b> found in the tablet (not just the theoretical tablet range). This ensures child tablets are balanced by actual record count.
            </div>
            <div style="padding-top: 10px; border-top: 1px dashed rgba(59, 130, 246, 0.2);">
              <b>RANGE split</b> is based on the <b>mid of the entire range key row space</b> (the median key). This splits data based on actual distribution while preserving sequential order for scans.
            </div>
          </div>
        `;
}

function renderDataTable(tableId) {
  const table = TABLES[tableId] || { name: 'Colocated', color: '#94a3b8', cols: ['ID', 'VAL1', 'VAL2', 'EXTRA'] };
  if (!table && tableId !== 'colocated') return;
  const head = document.getElementById('data-table-head');
  const body = document.getElementById('data-table-body');
  if (!head || !body) return;

  if (tableId === 'colocated') {
    head.innerHTML = '<th>TBL</th><th>ID</th><th>DATA</th><th>HLC</th><th>TABLET</th>';
  } else {
    head.innerHTML = table.cols.map(c => `<th>${c.toUpperCase()}</th>`).join('') + '<th>HLC</th><th>TABLET</th>';
  }
  body.innerHTML = '';

  const rows = [];
  for (const g of S.groups) {
    if (tableId === 'colocated') {
      if (g.isColocated) {
        if (g.data) for (const r of g.data) rows.push({ r, tablet: 'COL', tId: g.id, isCol: true });
      }
    } else {
      if (g.table !== tableId) continue;
      if (g.data) for (const r of g.data) rows.push({ r, tablet: g.tnum, tId: g.id });
    }
  }

  rows.sort((a, b) => {
    const valA = (typeof a.r[0] === 'number') ? a.r[0] : parseInt(a.r[0]);
    const valB = (typeof b.r[0] === 'number') ? b.r[0] : parseInt(b.r[0]);
    return valA - valB;
  });

  rows.forEach(({ r, tablet, tId, isCol }) => {
    const tr = document.createElement('tr');
    tr.id = `dr-${tId}-${r[0]}`;
    if (selectedRow && selectedRow.tId === tId && selectedRow.pk === r[0]) tr.classList.add('active-row');

    if (isCol) {
      const rowTable = r[5];
      const subTi = TABLES[rowTable] || { color: '#ccc', cols: [] };
      let dataParts = [];
      for (let i = 1; i < subTi.cols.length; i++) {
        if (r[i] !== undefined && r[i] !== '') {
          dataParts.push(`<span style="color:var(--txt3)">${subTi.cols[i]}:</span> ${r[i]}`);
        }
      }
      const dataStr = dataParts.join(', ');
      tr.innerHTML = `<td><div class="d-col-indicator" style="display:inline-block; margin-right:5px; background:${subTi.color}"></div>${rowTable}</td>` +
        `<td>${r[0]}</td><td>${dataStr}</td><td>${fmtHLC(r[4])}</td>` +
        `<td style="color:var(--txt3)">Shared Group</td>`;
    } else {
      tr.innerHTML = r.map((c, i) => `<td style="${i === 0 ? 'color:var(--leader)' : ''}">${c}</td>`).join('') +
        `<td style="color:${table.color}">${table.name}.t${tablet}</td>`;
    }

    tr.onclick = () => {
      selectedRow = { tId, pk: r[0] };
      document.querySelectorAll('.tablet').forEach(el => el.classList.remove('t-hl', 't-hl2'));
      const g = S.groups.find(x => x.id === tId);
      if (g) {
        g.replicas.forEach(nodeId => {
          const el = document.getElementById(`tablet-${g.id}-${nodeId}`);
          if (el) el.classList.add(nodeId === g.leaderNode ? 't-hl' : 't-hl2');
        });
      }
      document.querySelectorAll('#data-table-body tr').forEach(x => x.classList.remove('active-row'));
      tr.classList.add('active-row');
    };
    body.appendChild(tr);
  });
}

// ════════════════════════════════════════════
//  SHARDING HELPERS
// ════════════════════════════════════════════
let _hashHistory = [];

function initHashRouting() {
  _hashHistory = [];
  const sec = document.getElementById('hash-routing-sec');
  if (sec) sec.style.display = '';
  document.getElementById('hash-cur').style.display = 'none';
  document.getElementById('hash-history-sec').style.display = 'none';
  _renderHashRangeMap(null);
}

function hideHashRouting() {
  const sec = document.getElementById('hash-routing-sec');
  if (sec) sec.style.display = 'none';
}

function _renderHashRangeMap(targetTg) {
  const el = document.getElementById('hash-range-map');
  if (!el) return;
  const groups = S.groups.filter(g => g.table === 'users');
  const TC = { 1: '#f59e0b', 2: '#60a5fa', 3: '#34d399' };

  function hexRangeToDec(rangeStr) {
    const m = rangeStr.match(/0x([0-9A-Fa-f]+)[–-]0x([0-9A-Fa-f]+)/);
    return m ? { lo: parseInt(m[1], 16), hi: parseInt(m[2], 16) } : null;
  }

  let h = '';

  // ── Key space header ──
  h += `<div style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;">`;
  h += `<div style="font-size:10px;font-weight:700;color:var(--txt2);letter-spacing:.07em;margin-bottom:7px;text-transform:uppercase;">16-bit Hash Key Space</div>`;
  h += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">`;
  h += `<div style="font-size:11px;font-family:var(--mono);color:var(--txt);background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.25);border-radius:4px;padding:3px 7px;">2<sup>16</sup> = <strong>65,536</strong></div>`;
  h += `<div style="font-size:11px;color:var(--txt2);">·</div>`;
  h += `<div style="font-size:11px;font-family:var(--mono);color:var(--txt2);">0x0000 – 0xFFFF</div>`;
  h += `<div style="font-size:11px;color:var(--txt2);">·</div>`;
  h += `<div style="font-size:11px;font-family:var(--mono);color:var(--txt2);">0 – 65,535</div>`;
  h += `</div></div>`;

  // ── Visual key space bar ──
  h += `<div style="margin-bottom:10px;">`;
  h += `<div style="display:flex;gap:3px;height:40px;">`;
  groups.forEach(g => {
    const c = TC[g.tnum] || '#aaa';
    const hit = targetTg && g.id === targetTg.id;
    h += `<div style="flex:1;background:${hit ? c + '35' : c + '18'};border:${hit ? '2' : '1'}px solid ${c}${hit ? '' : '44'};border-radius:5px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px;">`;
    h += `<div style="font-size:10px;font-weight:700;color:${c};">tablet${g.tnum}${hit ? ' ◄' : ''}</div>`;
    h += `<div style="font-size:9px;color:var(--txt2);font-family:var(--mono);">${g.range}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // boundary tick labels
  const decs = groups.map(g => hexRangeToDec(g.range));
  if (decs[0] && decs[decs.length - 1]) {
    h += `<div style="display:flex;font-size:9px;color:var(--txt2);font-family:var(--mono);margin-top:3px;">`;
    h += `<span style="flex:0 0 auto;">${decs[0].lo}</span>`;
    for (let i = 0; i < decs.length - 1; i++) {
      if (decs[i] && decs[i + 1]) {
        h += `<span style="flex:1;text-align:center;">${decs[i].hi.toLocaleString()}&hairsp;/&hairsp;${decs[i + 1].lo.toLocaleString()}</span>`;
      }
    }
    h += `<span style="flex:0 0 auto;">${decs[decs.length - 1].hi.toLocaleString()}</span>`;
    h += `</div>`;
  }
  h += `</div>`;

  // ── Routing table ──
  h += `<div style="font-size:10px;font-weight:700;color:var(--txt2);letter-spacing:.06em;margin-bottom:5px;text-transform:uppercase;">Tablet Routing</div>`;
  h += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;font-size:10px;">`;
  // header row
  h += `<div style="display:grid;grid-template-columns:0.8fr 1.2fr 1.3fr 0.5fr;background:var(--s2);">`;
  ['Tablet', 'Hex Range', 'Decimal Range', 'N'].forEach(lbl =>
    h += `<div style="padding:5px 8px;color:var(--txt2);font-weight:600;">${lbl}</div>`
  );
  h += `</div>`;
  groups.forEach((g, i) => {
    const c = TC[g.tnum] || '#aaa';
    const hit = targetTg && g.id === targetTg.id;
    const dec = hexRangeToDec(g.range);
    const rowBg = hit ? `${c}15` : (i % 2 ? 'rgba(255,255,255,.015)' : 'transparent');
    const rowBorder = `border-top:1px solid var(--border);${hit ? `border-left:3px solid ${c};` : ''}`;
    h += `<div style="display:grid;grid-template-columns:0.8fr 1.2fr 1.3fr 0.5fr;background:${rowBg};${rowBorder}">`;
    h += `<div style="padding:6px 8px;color:${c};font-weight:600;">tablet${g.tnum}</div>`;
    h += `<div style="padding:6px 8px;font-family:var(--mono);color:var(--txt);">${g.range}</div>`;
    h += `<div style="padding:6px 8px;font-family:var(--mono);color:var(--txt2);font-size:9px;">${dec ? `${dec.lo.toLocaleString()} – ${dec.hi.toLocaleString()}` : '—'}</div>`;
    h += `<div style="padding:6px 8px;color:var(--txt);">N${g.leaderNode}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  el.innerHTML = h;
}

function renderHashRouting(id, hashHex, tg) {
  _renderHashRangeMap(tg);
  const cur = document.getElementById('hash-cur');
  const flow = document.getElementById('hash-cur-flow');
  if (cur && flow) {
    cur.style.display = '';
    flow.innerHTML = `
            <div class="hcf-steps">
              <span class="hcf-key">id = ${id}</span>
              <span class="hcf-arr">→</span>
              <span class="hcf-fn">HASH()</span>
              <span class="hcf-arr">→</span>
              <span class="hcf-res">${hashHex}</span>
            </div>
            <div class="hcf-dest">→ <strong>users.tablet${tg.tnum}</strong> &nbsp;·&nbsp; Leader N${tg.leaderNode}</div>`;
  }
  _hashHistory.unshift({ id, hashHex, tnum: tg.tnum });
  if (_hashHistory.length > 8) _hashHistory.pop();
  const histSec = document.getElementById('hash-history-sec');
  const histList = document.getElementById('hash-history-list');
  if (histSec && histList) {
    histSec.style.display = '';
    histList.innerHTML = _hashHistory.map((h, i) =>
      `<div class="hh-row${i === 0 ? ' hh-new' : ''}">
              <span class="hh-id">id=${h.id}</span>
              <span class="hh-hex">${h.hashHex}</span>
              <span class="hh-arr">→</span>
              <span class="hh-tg">tablet${h.tnum}</span>
            </div>`
    ).join('');
  }
}

function hashKey(id) { return (id * 2654435761) & 0xFFFF; }
function hashInRange(hash, range) {
  const p = range.match(/0x([0-9A-Fa-f]+)[–-]0x([0-9A-Fa-f]+)/);
  if (!p) return false;
  return hash >= parseInt(p[1], 16) && hash <= parseInt(p[2], 16);
}
function rangeMatch(val, range) {
  const parts = range.split('–');
  if (parts.length !== 2) return false;
  const word = String(val).toUpperCase();
  return word[0] >= parts[0] && word[0] <= parts[1];
}

let selectedRow = null;
async function insertHashUser() {
  const sc = SCENARIOS[currentScenario];
  const isHash = sc.name.includes('Hash');
  const id = Math.floor(Math.random() * 999);
  const name = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank'][Math.floor(Math.random() * 6)];
  const city = ['NY', 'SF', 'CH', 'PH', 'TX', 'BO'][Math.floor(Math.random() * 6)];
  const row = [id, name, city, Math.floor(Math.random() * 100), performance.now() / 1000];

  let tg, hashHex;
  if (isHash) {
    const hash = hashKey(id);
    hashHex = '0x' + hash.toString(16).toUpperCase().padStart(4, '0');
    tg = S.groups.find(g => g.table === 'users' && hashInRange(hash, g.range));
    addLog(`PK id=${id} → HASH(${id}) = ${hashHex}`, 'li');
    if (tg) addLog(`Hash ${hashHex} falls into range ${tg.range} → users.tablet${tg.tnum}`, 'ls');
  } else {
    tg = S.groups.find(g => {
      const p = g.range.split(' — ');
      if (p.length !== 2) return false;
      const lo = p[0].trim() === '-∞' ? -Infinity : parseInt(p[0]);
      const hi = p[1].trim() === '∞' ? Infinity : parseInt(p[1]);
      return id >= lo && id <= hi;
    });
    hashHex = `${id} (Range)`;
    addLog(`PK id=${id} range lookup...`, 'li');
    if (tg) addLog(`Value ${id} falls into range [${tg.range}] → users.tablet${tg.tnum}`, 'ls');
  }

  if (tg) {
    const ctx = makeCtx();
    if (isHash) renderHashRouting(id, hashHex, tg);
    tg.data.push(row);
    ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500).then(() => {
      const follows = tg.replicas.filter(n => n !== tg.leaderNode);
      Promise.all(follows.map(f => ctx.pktTabletToTablet(tg.id, tg.leaderNode, tg.id, f, 'pk-raft', 400))).then(() => {
        addLog('Quorum achieved ✓', 'ls');
        for (const nid of tg.replicas) {
          ctx.hlTablet(tg.id, nid, isHash ? 't-hl' : 't-hl2');
          ctx.reRenderTablet(tg.id, nid, true);
        }
        renderDataTable('users');
      });
    });
  } else addLog(`No tablet found for key ${id}!`, 'le');
}

function locateRangeRows() {
  if (!selectedRow) { addLog('Select a row in the data panel first!', 'lw'); return; }
  const g = S.groups.find(x => x.id === selectedRow.tId); if (!g) return;
  addLog(`Locating quorum for ${g.table}.tablet${g.tnum}...`, 'li');
  const ctx = makeCtx();
  for (const nid of g.replicas) { ctx.hlTablet(g.id, nid, nid === g.leaderNode ? 't-hl' : 't-hl2'); addLog(`${nid === g.leaderNode ? 'LEADER' : 'FOLLOWER'} on TServer-${nid}`, 'ls'); }
}

window.insertColocatedA = async function () {
  const tg = S.groups.find(g => g.isColocated); if (!tg) return;
  const id = 200 + Math.floor(Math.random() * 100);
  const row = [id, 'New Prod ' + id, '$' + (Math.floor(Math.random() * 50) + 10), '', performance.now() / 1000, 'products'];
  addLog(`INSERT INTO products VALUES (${id}, ...) [Colocated]`, 'li');
  const ctx = makeCtx();
  await ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500);
  const follows = tg.replicas.filter(n => n !== tg.leaderNode);
  await Promise.all(follows.map(f => ctx.pktTabletToTablet(tg.id, tg.leaderNode, tg.id, f, 'pk-raft', 400)));
  tg.data.push(row);
  tg.replicas.forEach(n => { ctx.hlTablet(tg.id, n, 't-hl'); ctx.reRenderTablet(tg.id, n, true); });
  renderDataTable('colocated');
  addLog('Written to shared tablet ✓', 'ls');
}

window.insertColocatedB = async function () {
  const tg = S.groups.find(g => g.isColocated); if (!tg) return;
  const id = 10 + Math.floor(Math.random() * 90);
  const row = [id, 'New Cat ' + id, 'Description ' + id, '', performance.now() / 1000, 'categories'];
  addLog(`INSERT INTO categories VALUES (${id}, ...) [Colocated]`, 'li');
  const ctx = makeCtx();
  await ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500);
  const follows = tg.replicas.filter(n => n !== tg.leaderNode);
  await Promise.all(follows.map(f => ctx.pktTabletToTablet(tg.id, tg.leaderNode, tg.id, f, 'pk-raft', 400)));
  tg.data.push(row);
  tg.replicas.forEach(n => { ctx.hlTablet(tg.id, n, 't-hl'); ctx.reRenderTablet(tg.id, n, true); });
  renderDataTable('colocated');
  addLog('Written to shared tablet ✓', 'ls');
}

window.insertColocatedC = async function () {
  const tg = S.groups.find(g => g.isColocated); if (!tg) return;
  const id = 500 + Math.floor(Math.random() * 500);
  const name = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'][Math.floor(Math.random() * 5)];
  const row = [id, name, name.toLowerCase() + '@example.com', '', performance.now() / 1000, 'customers'];
  addLog(`INSERT INTO customers VALUES (${id}, ...) [Colocated]`, 'li');
  const ctx = makeCtx();
  await ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500);
  const follows = tg.replicas.filter(n => n !== tg.leaderNode);
  await Promise.all(follows.map(f => ctx.pktTabletToTablet(tg.id, tg.leaderNode, tg.id, f, 'pk-raft', 400)));
  tg.data.push(row);
  tg.replicas.forEach(n => { ctx.hlTablet(tg.id, n, 't-hl'); ctx.reRenderTablet(tg.id, n, true); });
  renderDataTable('colocated');
  addLog('Written to shared tablet ✓', 'ls');
}

function toggleNearFollower() {
  const n2 = S.nodes[1]; n2.alive = !n2.alive; renderNodeAlive(2, n2.alive);
  if (!n2.alive) { _fdDrainLeaders(2); renderAllTablets(); renderConnections(); }
  else { renderAllTablets(); renderConnections(); _fdRebalanceToNode(2); }
  const btn = document.getElementById('btn-tn'); if (btn) btn.textContent = n2.alive ? '💀 Kill Near Follower' : '✅ Revive Near Follower';
  addLog(`TServer-2: ${n2.alive ? 'REVIVED — rebalancing leaders' : 'KILLED'}`, n2.alive ? 'ls' : 'le');
}
async function blacklistDrainNode() {
  if (stepRunning) return;
  stepRunning = true;
  const ctx = makeCtx();
  addLog('YB-Master: Blacklist/Drain TServer-2 initiated', 'li');
  addLog('TS-2: received BlacklistNode RPC — beginning graceful drain', 'lw');
  await ctx.delay(300);

  // 1. Mark N2 as blacklisted first — before any leader moves
  const card = document.getElementById('node-2');
  card.style.opacity = '0.5'; card.style.borderColor = 'var(--warn)';
  const ind = card.querySelector('.n-indicator');
  ind.style.background = 'var(--warn)'; ind.style.animation = 'none';
  addLog('TS-2: marked BLACKLISTED — no new tablets will be assigned', 'lw');
  await ctx.delay(400);

  const ts2Leaders = S.groups.filter(g => g.leaderNode === 2);
  window._blDrained = ts2Leaders.map(g => g.id);
  addLog('TS-2: leader for ' + ts2Leaders.map(g => g.id).join(', ') + ' — initiating LeaderStepDown', 'lr');
  await ctx.delay(200);

  const targets = [1, 3]; let ti = 0;
  for (const g of ts2Leaders) {
    const targetNode = targets[ti % targets.length]; ti++;
    // 2. Show CANDIDATE on target first
    ctx.setRole(g.id, targetNode, 'CANDIDATE');
    addLog('TS-' + targetNode + ': election timeout → CANDIDATE for ' + g.id + ' (term=5)', 'lw');
    await ctx.delay(200);
    // 3. Vote request packet flies
    addLog('TS-2→TS-' + targetNode + ': LeaderStepDown(' + g.id + ') — graceful transfer', 'lr');
    await ctx.pktTabletToTablet(g.id, 2, g.id, targetNode, 'pk-vote', 500);
    // 4. Now becomes LEADER
    S.term = 5; g.leaderNode = targetNode; g.term = 5;
    document.getElementById('term-display').textContent = 'Raft Term: 5';
    ctx.setRole(g.id, targetNode, 'LEADER');
    ctx.hlTablet(g.id, targetNode, 't-hl');
    addLog('TS-' + targetNode + ': accepted leadership ' + g.id + ' (term=5) ✓', 'ls');
    await ctx.delay(300);
  }

  addLog('TS-2: all leader tablets transferred — drain complete', 'ls');
  renderAllTablets();
  addLog('Leadership balanced: ' + S.groups.filter(g => g.leaderNode === 1).map(g => g.id).join(',') + '→TS-1, ' + S.groups.filter(g => g.leaderNode === 3).map(g => g.id).join(',') + '→TS-3', 'ls');
  document.getElementById('health-txt').textContent = '⚠️ TS-2 Blacklisted · leaders distributed to TS-1 & TS-3';
  toggleBtn('btn-bl', true);
  toggleBtn('btn-ubl', false);
  stepRunning = false;
}

async function unblacklistNode() {
  if (stepRunning) return;
  stepRunning = true;
  const ctx = makeCtx();
  addLog('YB-Master: Remove TS-2 from blacklist — eligible for leader placement', 'li');
  await ctx.delay(400);

  // Restore node-2 visual state
  const card = document.getElementById('node-2');
  card.style.opacity = ''; card.style.borderColor = '';
  const ind = card.querySelector('.n-indicator');
  ind.style.background = 'var(--ok)'; ind.style.animation = 'blink 3s ease infinite';
  addLog('TS-2: removed from blacklist — accepting tablet leadership', 'ls');
  await ctx.delay(300);

  // Restore exactly the tablets that were drained during blacklist — no more, no less
  const drainedIds = window._blDrained || [];
  const toRestore = drainedIds.map(id => S.groups.find(g => g.id === id)).filter(Boolean);

  addLog(`YB-Master: Imbalance detected — restoring ${toRestore.length} leader(s) to TS-2`, 'li');

  for (const g of toRestore) {
    const from = g.leaderNode;
    addLog(`TS-${from}: LeaderStepDown(${g.id}) → Transfer to TS-2`, 'lr');
    await ctx.pktTabletToTablet(g.id, from, g.id, 2, 'pk-vote', 500);
    g.leaderNode = 2; g.term = (g.term || 5) + 1;
    document.getElementById('term-display').textContent = `Raft Term: ${g.term}`;
    ctx.setRole(g.id, 2, 'LEADER');
    ctx.hlTablet(g.id, 2, 't-hl');
    addLog(`TS-2: accepted leadership ${g.id} (term=${g.term}) ✓`, 'ls');
    await ctx.delay(300);
  }

  renderAllTablets(); renderConnections();
  const ts1 = S.groups.filter(g => g.leaderNode === 1).map(g => g.id).join(',') || '—';
  const ts2 = S.groups.filter(g => g.leaderNode === 2).map(g => g.id).join(',') || '—';
  const ts3 = S.groups.filter(g => g.leaderNode === 3).map(g => g.id).join(',') || '—';
  addLog(`Leadership balanced: ${ts1}→TS-1  ${ts2}→TS-2  ${ts3}→TS-3`, 'ls');
  document.getElementById('health-txt').textContent = 'Healthy · RF=3 · Leaders Balanced — TS-2 restored ✓';
  toggleBtn('btn-ubl', true);
  toggleBtn('btn-bl', false);
  stepRunning = false;
}
function execQuery() {
  const q = document.getElementById('qinput').value.trim(); if (!q) return;
  addLog(`YSQL: ${q}`, 'li');
  const ins = q.match(/insert\s+into\s+(\w+).*values\s*\((\d+)/i);
  const sel = q.match(/select.*from\s+(\w+).*where\s+id\s*=\s*(\d+)/i);

  function findTabletForTable(tbl, id) {
    const groups = S.groups.filter(g => g.table === tbl);
    if (!groups.length) return null;
    const hash = hashKey(id);
    const byHash = groups.find(g => hashInRange(hash, g.range));
    if (byHash) {
      addLog(`hash(${id})=0x${hash.toString(16).toUpperCase().padStart(4, '0')} → ${tbl}.tablet${byHash.tnum}`, '');
      return byHash;
    }
    const byRange = groups.find(g => {
      const p = g.range.split(' — ');
      if (p.length !== 2) return false;
      const lo = p[0].trim() === '-∞' ? -Infinity : parseInt(p[0]);
      const hi = p[1].trim() === '∞' ? Infinity : parseInt(p[1]);
      return !isNaN(lo) && !isNaN(hi) && id >= lo && id <= hi;
    });
    if (byRange) {
      addLog(`Range: id=${id} in [${byRange.range}] → ${tbl}.tablet${byRange.tnum}`, '');
      return byRange;
    }
    return null;
  }

  if (ins) {
    const tbl = ins[1].toLowerCase(); const id = parseInt(ins[2]);
    const tg = findTabletForTable(tbl, id);
    if (tg) {
      const ctx = makeCtx();
      ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500).then(() => {
        const follows = tg.replicas.filter(n => n !== tg.leaderNode);
        Promise.all(follows.map(f => ctx.pktTabletToTablet(tg.id, tg.leaderNode, tg.id, f, 'pk-raft', 400))).then(() => {
          addLog('Quorum achieved ✓', 'ls');
          for (const nid of tg.replicas) { ctx.hlTablet(tg.id, nid, 't-hl'); ctx.reRenderTablet(tg.id, nid, true); }
          addLog('Write committed ✓', 'ls');
        });
      });
    } else addLog(`No tablet found for id=${id} in table ${tbl}`, 'le');
  } else if (sel) {
    const tbl = sel[1].toLowerCase(); const id = parseInt(sel[2]);
    const groups = S.groups.filter(g => g.table === tbl);
    const hash = hashKey(id);
    const routedByHash = groups.find(g => hashInRange(hash, g.range));
    const routedByRange = !routedByHash && groups.find(g => {
      const p = g.range.split(/\s*[—–]\s*/);
      if (p.length !== 2) return false;
      const lo = p[0].trim() === '-∞' ? -Infinity : parseInt(p[0]);
      const hi = p[1].trim() === '∞' ? Infinity : parseInt(p[1]);
      return !isNaN(lo) && !isNaN(hi) && id >= lo && id <= hi;
    });
    if (routedByHash) addLog(`hash(${id})=0x${hash.toString(16).toUpperCase().padStart(4, '0')} → ${tbl}.tablet${routedByHash.tnum}`, '');
    else if (routedByRange) addLog(`Range: id=${id} in [${routedByRange.range}] → ${tbl}.tablet${routedByRange.tnum}`, '');
    const tg = (routedByHash && routedByHash.data.some(r => r[0] === id)) ? routedByHash
      : (routedByRange && routedByRange.data.some(r => r[0] === id)) ? routedByRange
        : groups.find(g => g.data.some(r => r[0] === id));
    if (tg) {
      const target = tg;
      const ctx = makeCtx();
      ctx.pktClientToTablet(target.id, target.leaderNode, 'pk-read', 500).then(() => {
        const row = target.data.find(r => r[0] === id);
        if (row) addLog(`Result: {${row.slice(0, 4).join(', ')}}`, 'ls'); else addLog(`Row ${id} not found`, 'lw');
        ctx.pktTabletToClient(target.id, target.leaderNode, 'pk-read', 400);
      });
    } else addLog(`No tablet found for id=${id} in table ${tbl}`, 'le');
  } else addLog(`Try: SELECT * FROM users WHERE id = 4`, 'lw');
}


// ── ARCHITECTURE VIEW ─────────────────────────────────────────────

const ARCH_FDS_MODES = {
  zone: [
    { name: 'AZ 1', az: 'ap-south-1a', nodes: [1, 2, 3], label: 'Fault Domain' },
    { name: 'AZ 2', az: 'ap-south-1b', nodes: [4, 5, 6], label: 'Fault Domain' },
    { name: 'AZ 3', az: 'ap-south-1c', nodes: [7, 8, 9], label: 'Fault Domain' },
  ],
  region: [
    { name: 'Region 1', az: 'ap-south-1', nodes: [1, 2, 3], label: 'Fault Domain' },
    { name: 'Region 2', az: 'us-east-1', nodes: [4, 5, 6], label: 'Fault Domain' },
    { name: 'Region 3', az: 'eu-west-1', nodes: [7, 8, 9], label: 'Fault Domain' },
  ],
  cloud: [
    { name: 'AWS', az: 'Global', nodes: [1, 2, 3], label: 'Fault Domain' },
    { name: 'GCP', az: 'Global', nodes: [4, 5, 6], label: 'Fault Domain' },
    { name: 'Azure', az: 'Global', nodes: [7, 8, 9], label: 'Fault Domain' },
  ]
};

let _archViewMode = 'zone';
let ARCH_FDS = [...ARCH_FDS_MODES.zone];

const ARCH_TABLETS = [
  { color: '#f59e0b', name: 'users.tg1', leader: 1, replicas: [1, 4, 7] },
  { color: '#f59e0b', name: 'users.tg2', leader: 5, replicas: [2, 5, 8] },
  { color: '#f59e0b', name: 'users.tg3', leader: 9, replicas: [3, 6, 9] },
  { color: '#60a5fa', name: 'products.tg1', leader: 4, replicas: [1, 4, 7] },
  { color: '#60a5fa', name: 'products.tg2', leader: 8, replicas: [2, 5, 8] },
  { color: '#34d399', name: 'orders.tg1', leader: 3, replicas: [3, 6, 9] },
  { color: '#a78bfa', name: 'orders.tg2', leader: 7, replicas: [1, 4, 7] },
  { color: '#fb7185', name: 'idx.tg1', leader: 2, replicas: [2, 5, 8] },
  { color: '#6366f1', name: 'txns.tg1', leader: 6, replicas: [3, 6, 9] },
];

let _archFailedFD = -1;
let _archLeaderPref = new Set(); // empty=balanced, else Set of preferred FD indices

function _archEffectiveLeader(tablet) {
  const getFD = (nid) => ARCH_FDS.findIndex(fd => fd.nodes.includes(nid));
  if (_archLeaderPref.size === 0) {
    if (_archFailedFD !== -1 && getFD(tablet.leader) === _archFailedFD)
      return tablet.replicas.find(n => getFD(n) !== _archFailedFD) ?? tablet.leader;
    return tablet.leader;
  }
  let selFDs = [..._archLeaderPref].filter(fd => fd !== _archFailedFD);
  if (selFDs.length === 0) selFDs = [0, 1, 2].filter(x => x !== _archFailedFD);
  const targetFD = selFDs[ARCH_TABLETS.indexOf(tablet) % selFDs.length];
  return tablet.replicas.find(n => getFD(n) === targetFD) ?? tablet.leader;
}

function _archRerenderChips(animate) {
  document.querySelectorAll('.av-node').forEach(nodeEl => {
    const nid = parseInt(nodeEl.querySelector('.av-node-id')?.textContent?.match(/\d+/)?.[0]);
    if (!nid) return;
    const chipsEl = nodeEl.querySelector('.av-chips');
    if (!chipsEl) return;
    const myT = ARCH_TABLETS.filter(t => t.replicas.includes(nid));
    const render = (promoted) => {
      chipsEl.innerHTML = myT.map(t => {
        const isL = _archEffectiveLeader(t) === nid;
        return `<div class="av-chip ${isL ? 'av-chip-l' + (promoted ? ' av-chip-promoted' : '') : 'av-chip-f'}" style="${isL ? `background:${t.color}` : `border-color:${t.color};color:${t.color}`}" title="${t.name} · ${isL ? 'Leader ◉' : 'Follower ○'}">${isL ? '◉' : '○'}</div>`;
      }).join('');
    };
    if (animate) {
      chipsEl.style.cssText = 'opacity:.15;transform:scale(.75);transition:opacity .15s,transform .15s';
      setTimeout(() => { render(true); chipsEl.style.cssText = 'opacity:1;transform:scale(1);transition:opacity .2s,transform .2s'; }, 190);
    } else {
      render(false);
    }
  });
}

const _archFdColors = ['#f59e0b', '#60a5fa', '#34d399'];

window.uhToggle = function (id) {
  const el = document.getElementById(id);
  const tgl = document.getElementById('uh-t-' + id);
  if (!el || !tgl) return;
  if (el.style.display === 'none') {
    el.style.display = '';
    tgl.textContent = '▼';
  } else {
    el.style.display = 'none';
    tgl.textContent = '▶';
  }
};

window.fdSetTab = function (idx) {
  document.querySelectorAll('[id^="fd-panel-"]').forEach((el, i) => { el.style.display = i === idx ? '' : 'none'; });
  const tabs = document.querySelectorAll('[id^="fd-tab-"]');
  const colors = ['#fb7185', '#f59e0b', '#34d399', '#60a5fa', '#a78bfa'];
  tabs.forEach((btn, i) => {
    const c = colors[i];
    const active = i === idx;
    btn.style.background = active ? `${c}18` : 'transparent';
    btn.style.borderBottom = `2px solid ${active ? c : 'transparent'}`;
    btn.style.color = active ? c : 'var(--txt2)';
  });
};

window.archSetLeaderPref = function (fi) {
  if (fi === -1) {
    _archLeaderPref.clear();
  } else {
    if (_archLeaderPref.has(fi)) _archLeaderPref.delete(fi);
    else _archLeaderPref.add(fi);
  }
  document.querySelectorAll('.av-lp-btn').forEach(btn => {
    const bfi = parseInt(btn.dataset.fd);
    if (isNaN(bfi)) return;
    const isActive = bfi === -1 ? _archLeaderPref.size === 0 : _archLeaderPref.has(bfi);
    btn.classList.toggle('active', isActive);
    const fc = bfi >= 0 ? _archFdColors[bfi] : 'var(--txt2)';
    btn.style.background = isActive ? fc : '';
    btn.style.color = isActive ? '#0f172a' : (bfi >= 0 ? fc : '');
    btn.style.borderColor = isActive ? fc : (bfi >= 0 ? fc + '55' : '');
  });
  _archRerenderChips(true);
};

window.archSetViewMode = function (mode) {
  _archViewMode = mode;
  ARCH_FDS = [...ARCH_FDS_MODES[mode]];
  _archFailedFD = -1; // Reset failure state when switching modes
  const av = document.getElementById('arch-view');
  if (av) _renderArchUniverse(av);
};

function _exitArchMode(showCanvas) {
  const av = document.getElementById('arch-view');
  if (av) av.style.display = 'none';
  const tb = document.querySelector('.cluster-area .toolbar');
  if (tb) tb.style.display = showCanvas ? '' : 'none';
  const cw = document.getElementById('canvas-wrap');
  if (cw) cw.style.display = showCanvas ? '' : 'none';
  const ip = document.querySelector('.info-panel');
  if (ip) ip.style.display = showCanvas ? '' : 'none';
  const hv = document.getElementById('home-view');
  if (hv) hv.style.display = 'none';
  const cb = document.querySelector('.ctrl-bar');
  if (cb) cb.style.display = showCanvas ? 'flex' : 'none';
  if (!showCanvas) {
    const ht = document.getElementById('health-txt');
    if (ht) ht.textContent = '';
    const hd = document.getElementById('health-dot');
    if (hd) hd.style.background = 'transparent';
  }
}

function selectArch(tab) {
  currentScenario = tab;
  buildSidebar();
  scrollSidebarToActive();
  _exitArchMode(false);
  showDataPanel(false); showSplitPanel(false); showDocdbPanel(false);
  // Hide simulation-only panels that may have been left visible
  const _shpA = document.getElementById('sharding-perf-panel');
  if (_shpA) _shpA.classList.remove('visible');
  const _hapA = document.getElementById('ha-panel');
  if (_hapA) _hapA.classList.remove('visible');
  const _mrpA = document.getElementById('mr-lat-panel');
  if (_mrpA) _mrpA.classList.remove('visible');
  const _bkpA = document.getElementById('backup-panel');
  if (_bkpA) _bkpA.classList.remove('visible');
  const _pitrA = document.getElementById('pitr-panel');
  if (_pitrA) _pitrA.classList.remove('visible');
  const _ttA = document.getElementById('tt-panel');
  if (_ttA) _ttA.classList.remove('visible');
  const _cdcA = document.getElementById('cdc-panel');
  if (_cdcA) _cdcA.classList.remove('visible');
  const _svpA = document.getElementById('snap-viz-panel');
  if (_svpA) _svpA.classList.remove('visible');
  const _cwA = document.getElementById('canvas-wrap');
  if (_cwA) _cwA.classList.remove('snap-hidden');
  const _dpA = document.getElementById('docdb-panel');
  if (_dpA) _dpA.classList.remove('snap-expanded');
  const av = document.getElementById('arch-view');
  if (!av) return;
  av.style.display = 'flex';
  const badgeMap = { 'universe-hierarchy': 'Architecture · Universe', universe: 'Architecture · Global Universe', xcl: 'Architecture · xCluster', 'read-replica': 'Architecture · Read Replica', 'cdc-arch': 'Architecture · CDC Logical Replication', 'fault-domains': 'Architecture · Fault Domains', consensus: 'Architecture · Consensus Quorum', 'security-tls': 'Security · Encryption in Transit', 'security-rest': 'Security · Encryption at Rest', 'security-rls': 'Security · Row Level Security', 'security-column': 'Security · Column Level Encryption', 'security-auth': 'Security · Authentication', 'security-audit': 'Security · Audit Logging' };
  const titleMap = { 'universe-hierarchy': 'Universe Hierarchy', universe: 'Global Universe Architecture', xcl: 'xCluster Topology', 'read-replica': 'Read Replica Topology', 'cdc-arch': 'CDC Logical Replication Architecture', 'fault-domains': 'Fault Domains', consensus: 'Consensus (Raft) Quorum', 'security-tls': 'Encryption in Transit', 'security-rest': 'Encryption at Rest', 'security-rls': 'Row Level Security', 'security-column': 'Column Level Encryption', 'security-auth': 'Authentication Methods', 'security-audit': 'Audit Logging' };
  document.getElementById('active-badge').textContent = badgeMap[tab] || tab;
  document.getElementById('i-title').textContent = titleMap[tab] || tab;
  _archFailedFD = -1;
  _archLeaderPref = new Set();
  _archViewMode = 'zone';
  ARCH_FDS = [...ARCH_FDS_MODES.zone];
  av.innerHTML = '';
  if (tab === 'universe') _renderArchUniverse(av);
  else if (tab === 'universe-hierarchy') _renderArchUniverseHierarchy(av);
  else if (tab === 'consensus') _renderArchConsensus(av);
  else if (tab === 'control-plane') _renderArchControlPlane(av);
  else if (tab === 'hybrid-time') _renderArchHybridTime(av);
  else if (tab === 'read-replica') _renderArchReadReplica(av);
  else if (tab === 'cdc-arch') _renderArchCDC(av);
  else if (tab === 'fault-domains') _renderArchFaultDomains(av);
  else if (tab === 'security-tls') _renderArchSecurityTLS(av);
  else if (tab === 'security-rest') _renderArchSecurityRest(av);
  else if (tab === 'security-rls') _renderArchSecurityRLS(av);
  else if (tab === 'security-column') _renderArchSecurityColumn(av);
  else if (tab === 'security-auth') _renderArchSecurityAuth(av);
  else if (tab === 'security-audit') _renderArchSecurityAudit(av);
  else _renderArchXCluster(av);

  if (SCENARIOS[tab]) renderTour(SCENARIOS[tab]);
}

function _renderArchUniverse(container) {
  let h = `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Global Universe Architecture</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">A global view of a YugabyteDB universe spanning multiple fault domains.</div>`;
  const stats = [
    { val: '3', lbl: 'Fault Domains' }, { val: 'RF=3', lbl: 'Replication' },
    { val: '9', lbl: 'TServers' }, { val: '9', lbl: 'Tablet Groups' }, { val: '27', lbl: 'Total Replicas' },
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  const highlights = [
    { icon: '◎', label: 'Zero RPO', cls: 'av-hl-green' },
    { icon: '⚡', label: 'Zero RTO', cls: 'av-hl-green' },
    { icon: '⊘', label: 'No Split-Brain', cls: 'av-hl-blue' },
    { icon: '≡', label: 'Strongly Consistent Reads &amp; Writes', cls: 'av-hl-blue' },
    { icon: '↻', label: 'Auto Leader Election', cls: 'av-hl-amber' },
    { icon: '⇄', label: 'Equal Read &amp; Write', cls: 'av-hl-amber' },
    { icon: '▣', label: 'Full Copy per FD', cls: 'av-hl-purple' },
    { icon: '⬡', label: 'Raft Consensus', cls: 'av-hl-purple' },
  ];
  h += `<div class="av-highlights">${highlights.map(hl => `<div class="av-hl ${hl.cls}"><span class="av-hl-icon">${hl.icon}</span><span class="av-hl-txt">${hl.label}</span></div>`).join('')}</div>`;

  h += `<div class="av-section-title">Cluster Layout — Nodes &amp; Tablet Distribution</div>`;

  h += `<div class="av-lp-bar">`;
  h += `<span class="av-lp-lbl">Leader Preference:</span>`;
  for (let i = 0; i < 3; i++) {
    const fc = _archFdColors[i];
    const isActive = _archLeaderPref.has(i);
    h += `<button class="av-lp-btn${isActive ? ' active' : ''}" data-fd="${i}" onclick="archSetLeaderPref(${i})" style="border-color:${fc}55;color:${fc}${isActive ? `;background:${fc};color:#0f172a` : ''}">◎ Fault Domain ${i + 1}</button>`;
  }
  const balActive = _archLeaderPref.size === 0;
  h += `<button class="av-lp-btn${balActive ? ' active' : ''}" data-fd="-1" onclick="archSetLeaderPref(-1)" style="${balActive ? 'background:var(--txt2);color:#0f172a;border-color:var(--txt2)' : ''}">⚖ Balanced</button>`;

  h += `<div style="margin-left:auto; display:flex; gap:8px; align-items:center">`;
  h += `<span class="av-lp-lbl">View By:</span>`;
  const modeLabels = { zone: 'Zone/Rack', region: 'Region/DC', cloud: 'Cloud' };
  ['zone', 'region', 'cloud'].forEach(m => {
    const isActive = _archViewMode === m;
    const label = modeLabels[m];
    h += `<button class="av-lp-btn${isActive ? ' active' : ''}" onclick="archSetViewMode('${m}')" style="${isActive ? 'background:var(--near);color:#0f172a;border-color:var(--near)' : 'border-color:var(--near)55;color:var(--near)'}">${label}</button>`;
  });
  h += `</div>`;
  h += `</div>`;

  h += `<div class="av-fd-row" id="av-fd-row">`;
  const fdColors = _archFdColors;
  for (let fi = 0; fi < 3; fi++) {
    const fd = ARCH_FDS[fi];
    const fc = _archFdColors[fi];
    h += `<div class="av-fd" id="av-fd-${fi}" style="border-top:3px solid ${fc}">`;
    h += `<div class="av-fd-hdr" style="display:flex; justify-content:space-between; align-items:flex-start">
                 <div>
                   <div class="av-fd-name" style="color:${fc}">${fd.name}</div>
                   <div class="av-fd-az">${fd.az}</div>
                 </div>
                 <div class="av-fd-tag" style="color:${fc}; font-size:18px; font-weight:700; font-family:var(--head); white-space:nowrap">
                   Fault Domain ${fi + 1}
                 </div>
               </div>`;
    h += `<div class="av-fd-nodes">`;
    for (const nid of fd.nodes) {
      const myT = ARCH_TABLETS.filter(t => t.replicas.includes(nid));
      h += `<div class="av-node"><div class="av-node-id">Node ${nid}</div><div class="av-chips">`;
      for (const t of myT) {
        const isL = _archEffectiveLeader(t) === nid;
        h += `<div class="av-chip ${isL ? 'av-chip-l' : 'av-chip-f'}" style="${isL ? `background:${t.color}` : `border-color:${t.color};color:${t.color}`}" title="${t.name} · ${isL ? 'Leader ◉' : 'Follower ○'}">${isL ? '◉' : '○'}</div>`;
      }
      h += `</div><div class="av-traf"><div class="av-traf-row"><span class="av-traf-r">Read</span><div class="av-tbar av-tbar-r"></div></div><div class="av-traf-row"><span class="av-traf-w">Write</span><div class="av-tbar av-tbar-w"></div></div></div></div>`;
    }
    h += `</div>`;
    h += `<div class="av-fd-copy">▣ Full Data Copy #${fi + 1}</div>`;
    h += `<button class="av-fd-fail-btn" onclick="archFailDomain(${fi})">⚡ Simulate Failure</button>`;
    h += `</div>`;
  }
  h += `</div>`;

  h += `<div class="av-quorum"><div class="av-q-title">Why Fault Domains Must Be Odd</div>`;
  h += `<div class="av-q-sub">Raft requires a strict majority (&gt;50%) of replicas to commit writes &amp; elect a leader. Even counts create split-brain risk.</div>`;
  h += `<div class="av-q-cases">`;
  const qcases = [
    { n: 2, fail: 1, survive: 1, pct: 50, ok: false, lbl: '2 Fault Domains (Even)' },
    { n: 3, fail: 1, survive: 2, pct: 67, ok: true, lbl: '3 Fault Domains (Odd) — Minimum' },
    { n: 5, fail: 2, survive: 3, pct: 60, ok: true, lbl: '5 Fault Domains (Odd) — Higher Tolerance' },
  ];
  for (const c of qcases) {
    h += `<div class="av-qcase ${c.ok ? 'av-qcase-ok' : 'av-qcase-bad'}">`;
    h += `<div class="av-qcase-lbl">${c.lbl}</div>`;
    h += `<div class="av-qcase-dots">${Array.from({ length: c.n }, (_, i) => `<span class="av-qd ${i < c.fail ? 'av-qd-fail' : 'av-qd-ok'}">${i < c.fail ? '✕' : '✓'}</span>`).join('')}</div>`;
    h += `<div class="av-qcase-calc">${c.survive}/${c.n} = ${c.pct}% — ${c.ok ? 'majority quorum' : 'no majority'}</div>`;
    h += `<div class="av-qcase-verdict">${c.ok ? '✓ CONTINUES' : '✗ UNAVAILABLE'}</div>`;
    h += `</div>`;
  }
  h += `</div></div>`;

  const tables = [
    { color: '#f59e0b', name: 'users (tg1–3)' },
    { color: '#60a5fa', name: 'products (tg4–5)' },
    { color: '#34d399', name: 'orders (tg6)' },
    { color: '#a78bfa', name: 'orders (tg7)' },
    { color: '#fb7185', name: 'sec-index (tg8)' },
    { color: '#6366f1', name: 'sys.txns (tg9)' },
  ];
  h += `<div class="av-legend"><span class="av-leg-title">Tables</span>`;
  h += tables.map(t => `<div class="av-leg-item"><div class="av-leg-dot" style="background:${t.color}"></div><span>${t.name}</span></div>`).join('');
  h += `<span class="av-leg-sep">|</span><div class="av-leg-item"><div class="av-chip av-chip-l" style="background:#aaa;width:14px;height:14px;font-size:8px">◉</div><span>Leader</span></div>`;
  h += `<div class="av-leg-item"><div class="av-chip av-chip-f" style="border-color:#aaa;color:#aaa;width:14px;height:14px;font-size:8px">○</div><span>Follower</span></div>`;
  h += `</div>`;

  container.innerHTML = h;
}

function archFailDomain(fi) {
  const fds = document.querySelectorAll('.av-fd');
  let msg = document.getElementById('av-fail-msg');
  if (_archFailedFD === fi) {
    _archFailedFD = -1;
    fds.forEach(el => el.classList.remove('av-fd-failed', 'av-fd-quorum'));
    if (msg) msg.remove();
    _archRerenderChips(true);
    return;
  }
  _archFailedFD = fi;
  fds.forEach((el, i) => { el.classList.toggle('av-fd-failed', i === fi); el.classList.toggle('av-fd-quorum', i !== fi); });
  const row = document.getElementById('av-fd-row');
  if (!msg) { msg = document.createElement('div'); msg.id = 'av-fail-msg'; msg.className = 'av-fail-msg'; row.after(msg); }
  let prefNote = '';
  const selFDs = [..._archLeaderPref];
  if (selFDs.length > 0 && selFDs.every(x => x === fi)) {
    const survFDs = [0, 1, 2].filter(x => x !== fi).map(x => x + 1);
    prefNote = ` &nbsp;·&nbsp; <strong>Preferred FD down</strong> — leaders balanced across FD ${survFDs[0]} &amp; FD ${survFDs[1]}`;
  } else if (selFDs.length > 0) {
    const surviving = selFDs.filter(x => x !== fi).map(x => `FD ${x + 1}`).join(' &amp; ');
    prefNote = ` &nbsp;·&nbsp; Leaders remain pinned to <strong>${surviving}</strong>`;
  } else {
    prefNote = ` &nbsp;·&nbsp; Leaders auto-elect on surviving nodes`;
  }
  msg.innerHTML = `⚡ <strong>${ARCH_FDS[fi].name}</strong> (${ARCH_FDS[fi].az}) offline &nbsp;·&nbsp; 2 of 3 FDs form quorum${prefNote} &nbsp;·&nbsp; <span class="av-restore-link" onclick="archFailDomain(${fi})">Restore ↺</span>`;
  _archRerenderChips(true);
}

function archToggle(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : '';
  const btn = document.querySelector(`[data-arch-toggle="${id}"]`);
  if (btn) btn.textContent = open ? '▶' : '▼';
}

function _renderArchCDC(container) {
  const fdColors = ['#f59e0b', '#60a5fa', '#34d399'];

  function statBar(stats) {
    return `<div class="av-xcl-statsbar">${stats.map(s => `<div class="av-xcl-stat"><span class="av-xcl-stat-v">${s.val}</span><span class="av-xcl-stat-l">${s.lbl}</span></div>`).join('')}</div>`;
  }

  // YB cluster box — 3 AZs × 3 nodes stacked vertically
  function ybCluster() {
    const fcVars  = ['var(--leader)', 'var(--follower)', 'var(--ok)'];
    const ldrBgs  = ['rgba(217,119,6,.12)', 'rgba(37,99,235,.12)', 'rgba(22,163,74,.12)'];
    let azs = '';
    for (let az = 0; az < 3; az++) {
      const fc = fcVars[az];
      let nodes = '';
      for (let n = 0; n < 3; n++) {
        const nodeNum = az * 3 + n + 1;
        const isLeader = n === az;
        nodes += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;border:1px solid ${isLeader ? fc : 'var(--border-hi)'};background:${isLeader ? ldrBgs[az] : 'transparent'};">
          <div style="font-size:11px;color:${isLeader ? fc : 'var(--txt2)'};">${isLeader ? '◉' : '○'}</div>
          <div style="flex:1;">
            <div style="font-size:9px;font-weight:700;color:${isLeader ? fc : 'var(--txt2)'};">${isLeader ? 'LEADER' : 'FOLLOWER'} · Node ${nodeNum}</div>
            ${isLeader ? `<div class="av-cdc-svc-badge" style="margin-top:3px;display:inline-block;">CDC Svc</div>` : ''}
          </div>
        </div>`;
      }
      azs += `<div class="av-xcl-az" style="display:flex;flex-direction:column;border-left:3px solid ${fc}">
        <div class="av-xcl-az-lbl">AZ-${az + 1}</div>
        <div style="display:flex;flex-direction:column;gap:6px;padding:8px 10px;flex:1;">${nodes}</div>
        <div style="font-size:9px;font-weight:600;color:${fc};text-align:center;padding:4px 0 2px;letter-spacing:.3px">Fault Domain ${az + 1}</div>
      </div>`;
    }
    return `<div class="av-xcl-cluster" style="display:flex;flex-direction:column;flex:1.4">
      <div class="av-xcl-hdr av-xcl-primary">YugabyteDB Cluster · RF=3<span class="av-xcl-region">3 AZs · 9 nodes · 3 tablet leaders</span></div>
      <div style="font-size:9px;color:var(--txt3);padding:4px 10px 2px;font-style:italic;">
        PUBLICATION pub_orders FOR TABLE orders, users
      </div>
      <div class="av-xcl-az-row" style="flex:1;align-items:stretch">${azs}</div>
      <div class="av-xcl-rpo">◉ Leaders emit WAL · CDC Service polls each independently · Raft RF=3 unaffected</div>
    </div>`;
  }

  // CDC pipeline middle column
  function cdcPipeline() {
    const tabletColors = ['var(--leader)', 'var(--follower)', 'var(--ok)'];
    const streams = tabletColors.map((c, i) =>
      `<div class="av-xcl-poller" style="border-color:${c};padding:4px 8px;">
         <span style="color:${c};font-size:9px;font-weight:600;">tablet-${i+1} WAL</span>
         <span class="av-xcl-a-fwd" style="color:${c};">→</span>
       </div>`
    ).join('');

    return `<div class="av-cdc-pipeline" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0 6px;min-width:172px;">
      <div class="av-xcl-mode-lbl" style="margin-bottom:5px;">CDC Service</div>
      ${streams}

      <!-- CDC Service → VWAL -->
      <div style="display:flex;flex-direction:column;align-items:center;margin:3px 0 2px;">
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
        <div style="font-size:8px;color:var(--txt2);font-style:italic;line-height:1.3;">assemble ▼</div>
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
      </div>

      <div class="av-cdc-pipe-box cdc-pipe-vwal" style="width:100%;">
        <div class="av-cdc-pipe-name" style="color:var(--follower);">Virtual WAL (VWAL)</div>
        <div class="av-cdc-pipe-sub">Assembles tablets · assigns LSNs<br>commit-time ordered</div>
      </div>

      <!-- VWAL → walsender -->
      <div style="display:flex;flex-direction:column;align-items:center;margin:3px 0 2px;">
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
        <div style="font-size:8px;color:var(--follower);font-style:italic;line-height:1.3;">LSN stream ▼</div>
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
      </div>

      <div class="av-cdc-pipe-box cdc-pipe-ws" style="width:100%;position:relative;">
        <div class="av-cdc-pipe-name" style="color:var(--candidate);">walsender</div>
        <div class="av-cdc-pipe-sub">yboutput / pgoutput plugin<br>BEGIN / CHANGE / COMMIT</div>
        <div style="font-size:8px;color:var(--candidate);margin-top:5px;text-align:right;letter-spacing:.2px;">PG wire → ▶</div>
      </div>

      <!-- walsender → Slot (tracked by) -->
      <div style="display:flex;flex-direction:column;align-items:center;margin:3px 0 2px;">
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
        <div style="font-size:8px;color:var(--txt2);font-style:italic;line-height:1.3;">tracked by ▼</div>
        <div style="width:2px;height:7px;background:var(--border-hi);"></div>
      </div>

      <div class="av-cdc-pipe-box cdc-pipe-slot" style="width:100%;">
        <div class="av-cdc-pipe-name" style="color:var(--warn);font-size:9px;">Replication Slot</div>
        <div class="av-cdc-pipe-sub">slot: slot1<br>confirmed flush LSN · WAL retained until ACK</div>
      </div>
      <div style="font-size:8px;color:var(--txt2);font-style:italic;margin-top:5px;text-align:center;">at-least-once · no gaps</div>
    </div>`;
  }

  // Consumer stack right column
  function consumerStack() {
    return `<div class="av-cdc-consumers" style="display:flex;flex-direction:column;gap:8px;flex:1.2;">
      <div class="av-cdc-consumer-block cdc-cons-kafka">
        <div class="av-cdc-consumer-hdr" style="color:var(--ok);">☁ Kafka Connect</div>
        <div class="av-cdc-consumer-sub">YugabyteDB Debezium Connector</div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">
          <div class="av-cdc-consumer-row"><span class="av-cdc-cr-lbl">Protocol</span><span class="av-cdc-cr-val">PostgreSQL wire (yboutput / pgoutput)</span></div>
          <div class="av-cdc-consumer-row"><span class="av-cdc-cr-lbl">Snapshot</span><span class="av-cdc-cr-val">HybridTime consistent read</span></div>
          <div class="av-cdc-consumer-row"><span class="av-cdc-cr-lbl">Ordering</span><span class="av-cdc-cr-val">Commit-time · cross-tablet</span></div>
          <div class="av-cdc-consumer-row"><span class="av-cdc-cr-lbl">Delivery</span><span class="av-cdc-cr-val">At-least-once</span></div>
        </div>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--txt3);">▼</div>

      <div class="av-cdc-consumer-block cdc-cons-broker">
        <div class="av-cdc-consumer-hdr" style="color:var(--candidate);">Apache Kafka Broker</div>
        <div class="av-cdc-consumer-sub">One topic per table (configurable)</div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">
          ${['orders','users','products'].map(t =>
            `<div class="cdc-cons-topic">${t}</div>`
          ).join('')}
        </div>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--txt3);">▼</div>

      <div class="av-cdc-consumer-block cdc-cons-downstream">
        <div class="av-cdc-consumer-hdr" style="color:var(--txt2);">Downstream Consumers</div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
          ${[
            { icon: '🏛', label: 'Data Warehouse', sub: 'Snowflake · BigQuery · Redshift' },
            { icon: '🔍', label: 'Search Index',   sub: 'Elasticsearch · OpenSearch' },
            { icon: '⬡',  label: 'Microservices',  sub: 'Event-driven via Kafka streams' },
          ].map(c =>
            `<div style="display:flex;align-items:center;gap:6px;">
               <span style="font-size:13px;">${c.icon}</span>
               <div>
                 <div style="font-size:10px;font-weight:600;color:var(--txt);">${c.label}</div>
                 <div style="font-size:9px;color:var(--txt2);">${c.sub}</div>
               </div>
             </div>`
          ).join('')}
        </div>
      </div>
    </div>`;
  }

  // Capabilities / Watch out for — reusing capsSection pattern
  function capsSection(id, pros, cons) {
    let h = `<div class="av-collapse-hdr" onclick="archToggle('${id}')"><span class="av-collapse-sub-lbl">Capabilities &amp; Watch out for</span><button class="av-collapse-btn" data-arch-toggle="${id}">▼</button></div>`;
    h += `<div id="${id}" class="av-xcl-caps">`;
    h += `<div class="av-xcl-cap-col av-xcl-cap-pros"><div class="av-xcl-cap-hdr">✓ Capabilities</div>`;
    pros.forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
    h += `</div><div class="av-xcl-cap-col av-xcl-cap-cons"><div class="av-xcl-cap-hdr">⚠ Watch out for</div>`;
    cons.forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
    h += `</div></div>`;
    return h;
  }

  let h = `<div class="av-xcl-title">CDC · PostgreSQL Logical Replication Architecture</div>`;
  h += `<div class="av-xcl-sub">YugabyteDB streams row-level changes via the PostgreSQL logical replication protocol. A <strong>CDC Service</strong> polls each tablet leader WAL independently. A <strong>Virtual WAL (VWAL)</strong> assembles and globally orders changes across shards. The <strong>walsender</strong> encodes records using the <code>yboutput</code> plugin (default; <code>pgoutput</code> also supported) and streams them to any PG-compatible consumer — Debezium, Kafka Connect, or <code>pg_recvlogical</code>.</div>`;
  h += `<div class="av-xcl-modes">`;

  // Main topology block
  h += `<div class="av-xcl-block">`;
  h += `<div class="av-xcl-block-hdr">
    <div class="av-xcl-block-lbl">Topology</div>
    <div class="av-xcl-order-badges">
      <span class="av-order-badge av-ob-ok">✓ Commit-time Ordered</span>
      <span class="av-order-badge av-ob-ok">✓ At-least-once</span>
      <span class="av-order-badge av-ob-ok">✓ yboutput / pgoutput</span>
      <span class="av-order-badge av-ob-warn">⚠ LSN ≠ Byte Offset</span>
      <span class="av-order-badge av-ob-warn">⚠ No xCluster as Target</span>
    </div>
  </div>`;
  h += statBar([
    { val: 'yboutput',    lbl: 'Output Plugin' },
    { val: 'VWAL',        lbl: 'Ordering Layer' },
    { val: 'at-least-once', lbl: 'Delivery' },
    { val: 'Slot + Pub',  lbl: 'Setup' },
    { val: 'HybridTime',  lbl: 'Snapshot anchor' },
  ]);
  h += `<div class="av-xcl-row" style="gap:0;align-items:stretch;">`;
  h += ybCluster();
  h += `<div style="display:flex;align-items:center;padding:0 4px;color:var(--border-hi);font-size:18px;">▶</div>`;
  h += cdcPipeline();
  h += `<div style="display:flex;align-items:center;padding:0 4px;color:var(--border-hi);font-size:18px;">▶</div>`;
  h += consumerStack();
  h += `</div>`;
  h += `</div>`;

  // Capabilities & Watch out for
  h += `<div class="av-xcl-block">`;
  h += capsSection('cdc-arch-caps',
    [
      'Row-level change capture (INSERT / UPDATE / DELETE) for any YSQL table in a publication',
      'Initial consistent snapshot at HybridTime before streaming — no partial or mid-TX rows',
      'VWAL guarantees commit-time ordering across all tablets — cross-shard TX visibility is atomic',
      'No gaps: receiving a change at LSN <em>n</em> means all prior changes are already delivered',
      '<code>yboutput</code> (default) or <code>pgoutput</code> plugin — compatible with Debezium, <code>pg_recvlogical</code>, and any PG wire client',
      '<code>REPLICA IDENTITY FULL</code> enables full before-image (old row) for UPDATE and DELETE operations',
      'v2026.1+: DDL changes detected in correct commit order via sys-catalog polling — no periodic publication refresh needed',
    ],
    [
      'LSN is not a byte offset — <code>pg_wal_lsn_diff()</code>, <code>pg_current_wal_lsn()</code>, and cross-slot arithmetic are unsupported',
      '<code>TRUNCATE</code> and <code>DROP TABLE</code> are not supported after slot creation — <code>TRUNCATE</code> is never captured in the stream',
      'A cluster with an active slot cannot be used as an xCluster replication target',
      'PITR restore invalidates all existing slots — they must be recreated and re-snapshotted',
      'Slot retains WAL until consumer ACKs (durable across restarts) — but unbounded lag if the consumer stalls; WAL accumulates on every TServer until it is released',
      'Only YSQL tables in a <code>PUBLICATION</code> are captured — CDC is not supported for YCQL',
    ]
  );
  h += `</div>`;

  // YB vs PG comparison table
  h += `<div class="av-xcl-block">`;
  h += `<div class="av-collapse-hdr" onclick="archToggle('cdc-arch-cmp')"><span class="av-collapse-sub-lbl">YugabyteDB vs PostgreSQL Logical Replication</span><button class="av-collapse-btn" data-arch-toggle="cdc-arch-cmp">▼</button></div>`;
  h += `<div id="cdc-arch-cmp" style="overflow-x:auto;">`;
  const cmpRows = [
    ['Feature',                    'YugabyteDB',                             'PostgreSQL'],
    ['Ordering layer',             'Virtual WAL (VWAL) — cross-shard',       'WAL stream — single node'],
    ['LSN semantics',              'Logical counter, no byte offset',         'Byte offset in WAL file'],
    ['pg_wal_lsn_diff()',          '✕ Unsupported',                          '✓ Supported'],
    ['pg_stat_replication',        '✕ Unsupported',                          '✓ Supported'],
    ['TRUNCATE capture',           '✕ Not captured; blocked post-slot',      '✓ Supported'],
    ['Tablet / shard awareness',   '✓ CDC polls each shard independently',   'N/A — single WAL'],
    ['Snapshot anchor',            'HybridTime (yb_read_time)',               'LSN-based snapshot'],
    ['DDL replication (v2026.1+)', '✓ Sys-catalog polling, commit-time order', '✓ Native DDL events'],
    ['PITR interaction',           '✗ Slots invalidated on restore',         'N/A'],
    ['xCluster compatibility',     '✗ Cannot be xCluster target',            'N/A'],
  ];
  h += `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;">`;
  cmpRows.forEach((r, i) => {
    const bg = i === 0 ? 'var(--s3)' : (i % 2 === 0 ? 'var(--s2)' : 'transparent');
    h += `<tr style="background:${bg};">`;
    r.forEach((c, j) => {
      const color = i === 0 ? 'var(--txt2)' : j === 0 ? 'var(--txt)' : j === 1 ? '#34d399' : '#60a5fa';
      const fw = (i === 0 || j === 0) ? '600' : '400';
      h += `<td style="padding:7px 10px;border-bottom:1px solid var(--border);color:${color};font-weight:${fw};">${c}</td>`;
    });
    h += `</tr>`;
  });
  h += `</table></div></div>`;

  h += `</div>`;
  container.innerHTML = h;
}

function _renderArchXCluster(container) {
  const pollers = [
    { name: 'users', color: '#f59e0b' },
    { name: 'products', color: '#60a5fa' },
    { name: 'orders', color: '#34d399' },
  ];
  const nodeStyle = 'width:72px;height:72px;font-size:11px';
  function xclStatBar(stats) {
    return `<div class="av-xcl-statsbar">${stats.map(s => `<div class="av-xcl-stat"><span class="av-xcl-stat-v">${s.val}</span><span class="av-xcl-stat-l">${s.lbl}</span></div>`).join('')}</div>`;
  }
  const fdColors = ['#f59e0b', '#60a5fa', '#34d399'];
  function miniCluster(label, region, cls, rwLabel) {
    let h = `<div class="av-xcl-cluster" style="display:flex;flex-direction:column">`;
    const rwBadge = rwLabel ? `<span class="av-xcl-rw-badge ${cls.includes('secondary') ? 'av-xcl-rw-ro' : 'av-xcl-rw-rw'}">${rwLabel}</span>` : '';
    h += `<div class="av-xcl-hdr ${cls}">${label}${rwBadge}<span class="av-xcl-region">${region}</span></div>`;
    h += `<div class="av-xcl-az-row" style="flex:1;align-items:stretch">`;
    for (let az = 0; az < 3; az++) {
      const fc = fdColors[az];
      h += `<div class="av-xcl-az" style="display:flex;flex-direction:column;border-left:3px solid ${fc}">`;
      h += `<div class="av-xcl-az-lbl">AZ-${az + 1}</div>`;
      h += `<div class="av-xcl-nodes" style="flex:1;flex-wrap:wrap;justify-content:center;align-content:center">`;
      for (let n = 0; n < 3; n++) h += `<div class="av-xcl-node" style="${nodeStyle}">Node<br>${az * 3 + n + 1}</div>`;
      h += `</div><div style="font-size:11px;font-weight:600;color:${fc};text-align:center;padding:5px 0 2px;letter-spacing:.3px">Fault Domain ${az + 1}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    h += `<div class="av-xcl-rpo">${cls.includes('primary') ? '⬡ Sync Raft within cluster · 0 data loss' : '⏱ Async CDC · RPO ≈ seconds'}</div>`;
    h += `</div>`;
    return h;
  }
  function midSection(label, pollerList, note, bidir) {
    let h = `<div class="av-xcl-mid"><div class="av-xcl-mode-lbl">${label}</div>`;
    for (const p of pollerList) {
      h += `<div class="av-xcl-poller" style="border-color:${p.color}"><span style="color:${p.color};font-size:9px">${p.name}</span>`;
      if (bidir) h += `<div class="av-xcl-arrows-aa"><span class="av-xcl-a-fwd">→</span><span class="av-xcl-a-rev">←</span></div>`;
      else h += `<span class="av-xcl-a-fwd">→</span>`;
      h += `</div>`;
    }
    h += `<div class="av-xcl-rpo-badge">${note}</div></div>`;
    return h;
  }
  function capsSection(id, pros, cons) {
    let h = `<div class="av-collapse-hdr" onclick="archToggle('${id}')"><span class="av-collapse-sub-lbl">Capabilities &amp; Trade-offs</span><button class="av-collapse-btn" data-arch-toggle="${id}">▼</button></div>`;
    h += `<div id="${id}" class="av-xcl-caps">`;
    h += `<div class="av-xcl-cap-col av-xcl-cap-pros"><div class="av-xcl-cap-hdr">✓ Capabilities</div>`;
    pros.forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
    h += `</div><div class="av-xcl-cap-col av-xcl-cap-cons"><div class="av-xcl-cap-hdr">⚠ Watch out for</div>`;
    cons.forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
    h += `</div></div>`;
    return h;
  }

  let h = `<div class="av-xcl-title">xCluster Replication Architecture</div>`;
  h += `<div class="av-xcl-sub">Each cluster is a fully independent YugabyteDB universe with its own RF=3 Raft groups. xCluster replicates via <strong>parallel CDC WAL streams</strong> — one independent poller per tablet, running concurrently across all tablet groups.</div>`;
  h += `<div class="av-xcl-modes">`;

  // DR
  h += `<div class="av-xcl-block av-xcl-block-dr">`;
  h += `<div class="av-xcl-block-hdr"><div class="av-xcl-block-lbl">DR — Unidirectional</div><div class="av-xcl-order-badges"><span class="av-order-badge av-ob-ok">✓ Global Ordering</span><span class="av-order-badge av-ob-ok">✓ Transactional Consistency</span><span class="av-order-badge av-ob-ok">✓ No Partial-TX Visibility</span><span class="av-order-badge av-ob-ok">✓ n:m Parallel Streams</span></div></div>`;
  h += xclStatBar([
    { val: 'RF=3', lbl: 'Replication' },
    { val: '3', lbl: 'Fault Domains' },
    { val: '9', lbl: 'Nodes/Cluster' },
    { val: '2', lbl: 'Clusters' },
    { val: 'Async', lbl: 'CDC Mode' },
  ]);
  h += `<div class="av-xcl-row" style="min-height:280px">`;
  h += miniCluster('PRIMARY', 'ap-south-1', 'av-xcl-primary', 'Read / Write');
  h += midSection('CDC Pollers', pollers, 'RPO ≈ seconds · async WAL · ordered delivery', false);
  h += miniCluster('SECONDARY', 'us-east-1', 'av-xcl-secondary', 'Read Only');
  h += `</div>`;
  h += capsSection('xcl-dr-caps',
    ['Full transactional consistency — no partial-TX windows at secondary', 'Global write ordering preserved across all tablets', 'n:m parallel CDC streams — one independent WAL poller per tablet, all running concurrently', 'Per-tablet ordered delivery — each stream maintains commit order end-to-end', 'Failover &amp; Switchover — promote on unplanned failure or planned switchover with zero data loss', 'Secondary serves local reads — reduces latency for read-heavy workloads'],
    ['Secondary is a read-only standby — no writes during normal operation', 'RPO ≈ seconds–minutes depending on replication lag at time of failure', 'Controlled promotion required — failover or switchover must be explicitly triggered', 'Replication lag grows under high primary write load or network disruption', 'Large catch-up backlogs after extended network partitions', 'No automatic re-direction of application writes after promotion']);
  h += `</div>`;

  // Active-Active
  h += `<div class="av-xcl-block">`;
  h += `<div class="av-xcl-block-hdr"><div class="av-xcl-block-lbl">Active-Active — Bidirectional (BDR)</div><div class="av-xcl-order-badges"><span class="av-order-badge av-ob-ok">✓ n:m Parallel Streams</span><span class="av-order-badge av-ob-warn">⚡ LWW Conflict Resolution</span><span class="av-order-badge av-ob-warn">⚠ No Global Ordering</span></div></div>`;
  h += xclStatBar([
    { val: 'RF=3', lbl: 'Replication' },
    { val: '3', lbl: 'Fault Domains' },
    { val: '9', lbl: 'Nodes/Cluster' },
    { val: '2', lbl: 'Clusters' },
    { val: 'Async', lbl: 'CDC Mode' },
  ]);
  h += `<div class="av-xcl-row" style="min-height:280px">`;
  h += miniCluster('CLUSTER S1', 'ap-south-1', 'av-xcl-primary', 'Read / Write');
  h += midSection('Bidirectional Pollers', pollers, 'LWW by HLC · no cross-tablet ordering', true);
  h += miniCluster('CLUSTER S2', 'eu-central-1', 'av-xcl-primary', 'Read / Write');
  h += `</div>`;
  h += capsSection('xcl-aa-caps',
    ['Both clusters accept writes simultaneously — write-anywhere for all regions', 'Local low-latency writes for users in each geographic region', 'n:m parallel bidirectional CDC streams — one WAL poller per tablet in each direction', 'Replication throughput scales with tablet count — more tablets, more parallelism', 'Either cluster survives full failure; peer continues independently', 'No single point of write bottleneck across regions'],
    ['No guaranteed global ordering across tablets — each stream is independent', 'Conflicting concurrent writes resolved by LWW — last-write-wins via HLC timestamp', 'Cross-tablet transactions may arrive at peer with visibility gaps', 'Additive operations (counters, inventory) risk lost updates under conflicts', 'Application must tolerate eventual consistency for conflicting writes', 'Schema changes must be coordinated across both clusters manually']);
  h += `</div>`;

  h += `</div>`;
  container.innerHTML = h;
}

function _renderArchReadReplica(container) {
  // RF=3 replica: 3 AZs × 1 observer each (spread across AZs)
  // RF=1 replica: 1 AZ × 3 observers (all in single AZ)
  const RR_REGIONS = [
    { code: 'us-east-1', name: 'Virginia', rf: 3, numAzs: 3, nodesPerAz: 1, nw: '64px', nh: '110px', nfs: '9.5px', color: '#a78bfa', alpha: '.5' },
    { code: 'eu-central-1', name: 'Frankfurt', rf: 1, numAzs: 1, nodesPerAz: 3, nw: '64px', nh: '110px', nfs: '9.5px', color: '#818cf8', alpha: '.35' },
  ];
  const ndsS = 'justify-content:center;flex-wrap:wrap';
  const fdColors = ['#f59e0b', '#60a5fa', '#34d399'];

  function primaryCluster() {
    let azs = '';
    for (let az = 0; az < 3; az++) {
      const fc = fdColors[az];
      let nodes = '';
      for (let n = 0; n < 3; n++)
        nodes += `<div class="av-xcl-node" style="width:82px;height:auto;font-size:10px">Node<br>${az * 3 + n + 1}</div>`;
      azs += `<div class="av-xcl-az" style="display:flex;flex-direction:column;border-left:3px solid ${fc}"><div class="av-xcl-az-lbl">AZ-${az + 1}</div><div class="av-xcl-nodes" style="flex:1;justify-content:center;align-items:stretch;flex-wrap:nowrap">${nodes}</div><div style="font-size:11px;font-weight:600;color:${fc};text-align:center;padding:5px 0 2px;letter-spacing:.3px">Fault Domain ${az + 1}</div></div>`;
    }
    return `<div class="av-xcl-cluster" style="display:flex;flex-direction:column;flex:1.8"><div class="av-xcl-hdr av-xcl-primary">PRIMARY · RF=3<span class="av-xcl-region">ap-south-1 · Mumbai</span></div><div class="av-xcl-az-row" style="flex:1;align-items:stretch">${azs}</div><div class="av-xcl-rpo">⬡ Sync Raft · RF=3 · full read+write</div></div>`;
  }

  function replicaCluster(cfg) {
    const { code, name, rf, numAzs, nodesPerAz, nw, nh, nfs, color, alpha } = cfg;
    let azs = '';
    for (let az = 0; az < numAzs; az++) {
      const fc = fdColors[az];
      let nodes = '';
      for (let n = 0; n < nodesPerAz; n++)
        nodes += `<div class="av-xcl-node" style="width:${nw};height:${nh};font-size:${nfs};border-color:${color};color:${color}">👁<br>Obs<br>${az + 1}${nodesPerAz > 1 ? '.' + (n + 1) : ''}</div>`;
      azs += `<div class="av-xcl-az" style="display:flex;flex-direction:column;border-left:3px solid ${fc}"><div class="av-xcl-az-lbl">AZ-${az + 1}</div><div class="av-xcl-nodes" style="${ndsS}">${nodes}</div><div style="font-size:11px;font-weight:600;color:${fc};text-align:center;padding:5px 0 2px;letter-spacing:.3px">Fault Domain ${az + 1}</div></div>`;
    }
    const rpoNote = numAzs > 1
      ? `RF=${rf} · ${numAzs} AZs · 1 observer/AZ · async ≈ ms–s`
      : `RF=${rf} · 1 AZ · ${nodesPerAz} observers · async ≈ ms–s`;
    return `<div class="av-xcl-cluster" style="display:flex;flex-direction:column;justify-content:space-between;flex:1;border-color:rgba(167,139,250,${alpha})"><div class="av-xcl-hdr" style="background:rgba(167,139,250,.1);color:${color};">READ REPLICA · RF=${rf}<span class="av-xcl-region">${code} · ${name}</span></div><div class="av-xcl-az-row">${azs}</div><div class="av-xcl-rpo" style="color:${color}">${rpoNote}</div></div>`;
  }

  function midSection() {
    let h = `<div class="av-xcl-mid" style="width:120px">`;
    h += `<div class="av-xcl-mode-lbl">Async WAL</div>`;
    RR_REGIONS.forEach(r => {
      h += `<div class="av-xcl-poller" style="border-color:${r.color}"><span style="color:${r.color};font-size:8.5px">${r.code}</span><span class="av-xcl-a-fwd" style="color:${r.color}">→</span></div>`;
    });
    h += `<div class="av-xcl-rpo-badge">RPO ≈ ms–s<br>read-only</div>`;
    h += `</div>`;
    return h;
  }

  let h = `<div class="av-xcl-title">Read Replica Architecture</div>`;
  h += `<div class="av-xcl-sub">Observer nodes receive an async WAL stream from the primary tablet leaders. They serve <strong>low-latency local reads</strong> for remote users without joining Raft consensus — no vote, no write path, no added write latency. Each region can be configured with a different RF and node configuration.</div>`;
  h += `<div class="av-xcl-modes">`;

  function rrStatBar() {
    const stats = [
      { val: 'RF=3', lbl: 'Primary RF' },
      { val: '9', lbl: 'Primary Nodes' },
      { val: '3', lbl: 'Fault Domains' },
      { val: 'RF=3', lbl: 'us-east-1' },
      { val: 'RF=1', lbl: 'eu-central-1' },
    ];
    return `<div class="av-xcl-statsbar">${stats.map(s => `<div class="av-xcl-stat"><span class="av-xcl-stat-v">${s.val}</span><span class="av-xcl-stat-l">${s.lbl}</span></div>`).join('')}</div>`;
  }

  h += `<div class="av-xcl-block" style="border-color:rgba(167,139,250,.25);background:rgba(167,139,250,.02)">`;
  h += `<div class="av-xcl-block-hdr"><div class="av-xcl-block-lbl">Topology</div><div class="av-xcl-order-badges"><span class="av-order-badge av-ob-ok">✓ Non-voting Observer</span><span class="av-order-badge av-ob-ok">✓ Per-region RF</span><span class="av-order-badge av-ob-warn">⚠ Eventual Consistency</span><span class="av-order-badge av-ob-warn">⚠ Read-Only at Replica</span></div></div>`;
  h += rrStatBar();
  h += `<div class="av-xcl-row">`;
  h += primaryCluster();
  h += midSection();
  h += `<div style="display:flex;flex-direction:column;gap:10px;flex:1">`;
  RR_REGIONS.forEach(r => h += replicaCluster(r));
  h += `</div>`;
  h += `</div></div>`;

  h += `<div class="av-xcl-block">`;
  h += `<div class="av-collapse-hdr" onclick="archToggle('rr-caps')"><span class="av-collapse-sub-lbl">Capabilities &amp; Trade-offs</span><button class="av-collapse-btn" data-arch-toggle="rr-caps">▼</button></div>`;
  h += `<div id="rr-caps" class="av-xcl-caps">`;
  h += `<div class="av-xcl-cap-col av-xcl-cap-pros"><div class="av-xcl-cap-hdr">✓ Capabilities</div>`;
  ['Low-latency local reads for users in remote regions — read from nearby observer node', 'Non-voting observer — zero impact on primary write latency or Raft quorum', 'Async WAL streaming — continuously replicated from primary tablet leaders', 'Each region can use a different RF — high-traffic regions get RF=3, others RF=1', 'Primary retains full RF=3 Raft protection — read replicas add no quorum complexity', 'Lag is typically milliseconds under normal network conditions'].forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
  h += `</div><div class="av-xcl-cap-col av-xcl-cap-cons"><div class="av-xcl-cap-hdr">⚠ Watch out for</div>`;
  ['Read replicas are strictly read-only — application writes must go to the primary', 'Reads may return slightly stale data — async lag means eventual consistency only', 'Observer nodes do not form a standalone cluster — not a substitute for xCluster DR', 'Replica lag grows under high primary write throughput or network disruption', 'No switchover or standalone promotion path from read replica', 'Schema changes must be applied to the primary first and propagate via WAL'].forEach(t => h += `<div class="av-xcl-cap-item">${t}</div>`);
  h += `</div></div></div>`;

  h += `<div class="av-xcl-block">`;
  h += `<div class="av-collapse-hdr" onclick="archToggle('rr-cmp')"><span class="av-collapse-sub-lbl">Read Replica vs xCluster DR</span><button class="av-collapse-btn" data-arch-toggle="rr-cmp">▼</button></div>`;
  h += `<div id="rr-cmp" style="overflow-x:auto">`;
  const rows = [
    ['Feature', 'Read Replica', 'xCluster DR'],
    ['Raft participation', 'Non-voting observer', 'Full RF=3|5|7 cluster'],
    ['RF per region', 'Configurable (1, 3, …)', 'Full RF=3|5|7 always'],
    ['Write path', 'Read-only', 'Read-only (secondary)'],
    ['Replication', 'Async WAL', 'Async CDC WAL'],
    ['Typical lag', 'ms–seconds', 'ms–seconds'],
    ['Use case', 'Low-latency remote reads', 'Disaster recovery'],
  ];
  h += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">`;
  rows.forEach((r, i) => {
    const bg = i === 0 ? 'var(--s3)' : (i % 2 === 0 ? 'var(--s2)' : 'transparent');
    h += `<tr style="background:${bg}">`;
    r.forEach((c, j) => h += `<td style="padding:7px 10px;border-bottom:1px solid var(--border);font-weight:${i === 0 ? '700' : j === 0 ? '600' : '400'};color:${i === 0 ? 'var(--txt2)' : j === 1 ? '#a78bfa' : j === 2 ? 'var(--info)' : 'var(--txt)'}">${c}</td>`);
    h += `</tr>`;
  });
  h += `</table></div></div>`;

  h += `</div>`;
  container.innerHTML = h;
}

function _renderArchFaultDomains(container) {
  // Hero: definition left + stats right
  let h = `<div style="display:flex;gap:14px;align-items:stretch">`;

  h += `<div style="flex:1.8;background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:18px 22px;display:flex;flex-direction:column;justify-content:center">`;
  h += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--txt2);margin-bottom:10px">What is a Fault Domain?</div>`;
  h += `<div style="font-size:13.5px;color:var(--txt);line-height:1.65">A <b>fault/failure domain (fd)</b> is a group of nodes that share a common failure mode — power, switch, zone, or region. When one node in the domain fails, all nodes in that domain may be affected simultaneously. It is any shared failure boundary — a node, a rack, an availability zone, a region, or a cloud provider. A failure of one fault domain does not necessarily affect the others.</div>`;
  h += `<div style="font-size:13.5px;color:var(--txt);line-height:1.65;margin-top:8px">YugabyteDB places exactly <b>one Raft replica per fault domain</b>. Raft requires a strict majority (&gt;50%) to commit — so RF and the number of fault domains must always be <b>odd</b>.</div>`;
  h += `</div>`;

  const statBoxes = [
    { val: '3', lbl: 'Minimum RF', sub: 'recommended', color: '#34d399' },
    { val: '5', lbl: 'FD Levels', sub: 'node → cloud', color: '#60a5fa' },
    { val: 'Odd', lbl: 'Optimal RF', sub: '3, 5, 7 …', color: '#f59e0b' },
    { val: '>50%', lbl: 'Quorum Rule', sub: 'strict majority', color: '#a78bfa' },
  ];
  h += `<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px">`;
  statBoxes.forEach(s => {
    h += `<div style="background:var(--s1);border:1px solid var(--border);border-top:3px solid ${s.color};border-radius:8px;padding:14px 12px;text-align:center;display:flex;flex-direction:column;justify-content:center">`;
    h += `<span style="display:block;font-size:26px;font-weight:700;color:${s.color};font-family:var(--head);line-height:1.1">${s.val}</span>`;
    h += `<span style="display:block;font-size:11.5px;font-weight:700;color:var(--txt);text-transform:uppercase;letter-spacing:.7px;margin-top:5px">${s.lbl}</span>`;
    h += `<span style="display:block;font-size:10.5px;color:var(--txt2);margin-top:2px">${s.sub}</span>`;
    h += `</div>`;
  });
  h += `</div>`;

  h += `</div>`;

  const highlights = [
    { icon: '⬡', label: 'Raft Quorum: Strict &gt;50%', cls: 'av-hl-blue' },
    { icon: '⊘', label: 'No Split-Brain', cls: 'av-hl-green' },
    { icon: '▣', label: 'One Replica per Fault Domain', cls: 'av-hl-purple' },
    { icon: '↑', label: 'Higher FD = Stronger Isolation', cls: 'av-hl-blue' },
    { icon: '⊞', label: 'Odd RF = Optimal Efficiency', cls: 'av-hl-amber' },
    { icon: '↻', label: 'Auto Leader Election on Failure', cls: 'av-hl-green' },
    { icon: '⇶', label: 'Horizontally Scalable', cls: 'av-hl-purple' },
    { icon: '▲', label: 'Vertically Scalable', cls: 'av-hl-amber' },
  ];
  h += `<div class="av-highlights">${highlights.map(hl => `<div class="av-hl ${hl.cls}"><span class="av-hl-icon">${hl.icon}</span><span class="av-hl-txt">${hl.label}</span></div>`).join('')}</div>`;

  // Fault Domain Levels — tabbed with diagrams
  h += `<div class="av-section-title">Fault Domain Levels — Finest to Coarsest Isolation</div>`;

  const FD_TABS = [
    {
      icon: '▣', name: 'Node', color: '#fb7185', sub: 'Weakest isolation',
      failOn: 'Individual server crash, OOM kill, kernel panic, or disk failure',
      why: 'All Raft processes on that server stop. Only the replicas hosted on this node become unavailable.',
      example: 'RF=3 — 3 TServer processes on 3 different physical servers',
      policy: 'fault_tolerance: NODE',
      scope: 'Single TServer process'
    },
    {
      icon: '⊟', name: 'Rack', color: '#f59e0b', sub: 'On-premises isolation',
      failOn: 'Top-of-rack switch failure, shared PDU, or shared physical cage',
      why: 'All servers sharing the switch or power strip lose network/power together.',
      example: 'RF=3 — 3 racks in one data center, 3 nodes per rack',
      policy: 'fault_tolerance: RACK',
      scope: 'Servers behind one ToR switch'
    },
    {
      icon: '⬡', name: 'Zone / AZ', color: '#34d399', sub: 'Standard HA · recommended default',
      failOn: 'Availability zone power loss, cooling failure, or network partition',
      why: 'Cloud AZs share underlying infrastructure — a zone outage takes every node in it offline.',
      example: 'RF=3 — AZ-a, AZ-b, AZ-c in the same cloud region',
      policy: 'placement_zone (cloud)  /  rack = AZ (on-prem)',
      scope: 'One cloud availability zone'
    },
    {
      icon: '🌐', name: 'Region / DC', color: '#60a5fa', sub: 'Geographic isolation',
      failOn: 'Entire cloud region or data center offline — storm, fire, fiber cut',
      why: 'Regions are independent control planes. A regional failure takes all AZs inside it.',
      example: 'RF=3 — us-east-1, eu-west-1, ap-south-1',
      policy: 'placement_region',
      scope: 'One cloud region or data center campus'
    },
    {
      icon: '☁', name: 'Cloud', color: '#a78bfa', sub: 'Strongest isolation',
      failOn: 'Entire cloud provider outage — control plane, networking, or global DNS',
      why: 'Provider-wide incidents (BGP hijack, IAM outage, DNS failure) affect all regions.',
      example: 'RF=3 — AWS + GCP + Azure (multi-cloud)',
      policy: 'placement_cloud',
      scope: 'One cloud provider (AWS / GCP / Azure)'
    },
  ];

  // diagram generator
  function fdDiagram(idx) {
    // 3 tablets, RF=3: one replica per FD, leadership rotates per tablet
    const T = [
      { c: '#f59e0b', n: 'orders.tablet1' },
      { c: '#60a5fa', n: 'orders.tablet2' },
      { c: '#34d399', n: 'orders.tablet3' },
    ];
    // 4th tablet for Rack tab (4 nodes/rack needs 4 tablets)
    const T4 = { c: '#a78bfa', n: 'users.tablet1' };
    const FD_COLORS = ['#fb7185', '#f59e0b', '#34d399'];

    // circular chip — identical to Global Universe av-chip pattern
    const chip = (t, isLeader) =>
      `<div class="av-chip ${isLeader ? 'av-chip-l' : 'av-chip-f'}" style="${isLeader ? `background:${t.c}` : `border-color:${t.c};color:${t.c}`}" title="${t.n} · ${isLeader ? 'Leader ◎' : 'Follower ○'}">${isLeader ? '◎' : '○'}</div>`;

    // standard av-node box with chips inside
    const nodeBox = (id, chipsHtml, short = false) =>
      `<div class="av-node"${short ? ' style="min-width:0"' : ''}>
               <div class="av-node-id">${id}</div>
               <div class="av-chips">${chipsHtml}</div>
             </div>`;

    const captions = [
      `Leadership is <b>per-tablet (Raft group)</b>, not per-node · Each node holds all 3 replicas but leads a <em>different</em> shard · <span style="color:var(--leader)">◎ t1 on Node 1</span> · <span style="color:var(--follower)">◎ t2 on Node 2</span> · <span style="color:var(--near)">◎ t3 on Node 3</span>`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-rack · Each rack is an independent failure boundary · <span style="color:var(--leader)">◎ t1 in Rack 1</span> · <span style="color:var(--follower)">◎ t2 in Rack 2</span> · <span style="color:var(--near)">◎ t3 in Rack 3</span> · even 4 nodes/rack · odd 3 racks`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-AZ · A zone outage loses only one replica · <span style="color:var(--leader)">◎ t1 in AZ-a</span> · <span style="color:var(--follower)">◎ t2 in AZ-b</span> · <span style="color:var(--near)">◎ t3 in AZ-c</span> · odd 3 nodes/AZ · odd 3 AZs`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-region · A region outage loses only one replica — quorum survives · <span style="color:var(--leader)">◎ t1 us-east-1</span> · <span style="color:var(--follower)">◎ t2 eu-west-1</span> · <span style="color:var(--near)">◎ t3 ap-south-1</span>`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-cloud · An entire cloud outage loses only one replica — quorum survives · <span style="color:var(--leader)">◎ t1 AWS</span> · <span style="color:var(--follower)">◎ t2 GCP</span> · <span style="color:var(--near)">◎ t3 Azure</span>`,
    ];
    const captionBar =
      `<div style="font-size:14px;color:var(--txt2);background:var(--s2);border:1px solid var(--border);border-radius:7px;padding:11px 16px;text-align:center;line-height:1.7;margin-top:8px">
               ${captions[idx]}
             </div>`;

    // ── Node tab ─────────────────────────────────────────────────────────────────────
    if (idx === 0) {
      const fds = [0, 1, 2].map(fi => {
        const fc = FD_COLORS[fi];
        const chips = T.map((t, ti) => chip(t, ti === fi)).join('');
        return `<div class="av-fd" style="border-top:3px solid ${fc}">
                <div class="av-fd-name" style="color:${fc}">Fault Domain ${fi + 1}</div>
                <div class="av-fd-az">Node = FD · finest granularity</div>
                <div class="av-fd-nodes">${nodeBox(`Node ${fi + 1}`, chips)}</div>
                <div class="av-fd-copy">▣ Full Copy #${fi + 1}</div>
              </div>`;
      }).join('');
      return `<div style="display:flex;flex-direction:column;gap:8px">
              <div class="av-fd-row">${fds}</div>
              ${captionBar}
            </div>`;
    }

    // ── Rack tab ──────────────────────────────────────────────────────────────────────
    if (idx === 1) {
      const tablets4 = [T[0], T[1], T[2], T4];
      const leaders4 = [0, 1, 2, 1];
      const fds = [0, 1, 2].map(fi => {
        const fc = FD_COLORS[fi];
        const nodes = [0, 1, 2, 3].map(ni => {
          const t = tablets4[ni];
          const isL = leaders4[ni] === fi;
          return nodeBox(`N${fi * 4 + ni + 1}`, chip(t, isL), true);
        }).join('');
        return `<div class="av-fd" style="border-top:3px solid ${fc}">
                <div class="av-fd-name" style="color:${fc}">Fault Domain ${fi + 1}</div>
                <div class="av-fd-az">Rack ${fi + 1}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1">${nodes}</div>
                <div style="font-size:11px;color:var(--txt2);background:var(--s2);border-radius:5px;padding:4px 8px;text-align:center;border:1px solid var(--border);margin-top:6px">⇆ ToR Switch</div>
                <div class="av-fd-copy">▣ Full Copy #${fi + 1}</div>
              </div>`;
      }).join('');
      return `<div style="display:flex;flex-direction:column;gap:8px">
              <div style="text-align:center;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px">Data Center — 4 nodes / rack (even) · 3 racks (odd FDs)</div>
              <div class="av-fd-row">${fds}</div>
              ${captionBar}
            </div>`;
    }

    // ── Zone/AZ tab ────────────────────────────────────────────────────────────────────
    if (idx === 2) {
      const azNames = ['AZ-a', 'AZ-b', 'AZ-c'];
      const fds = [0, 1, 2].map(fi => {
        const fc = FD_COLORS[fi];
        const nodes = [0, 1, 2].map(ni => {
          const isL = ni === fi;
          return nodeBox(`N${fi * 3 + ni + 1}`, chip(T[ni], isL), true);
        }).join('');
        return `<div class="av-fd" style="border-top:3px solid ${fc}">
                <div class="av-fd-name" style="color:${fc}">Fault Domain ${fi + 1}</div>
                <div class="av-fd-az">${azNames[fi]}</div>
                <div class="av-fd-nodes">${nodes}</div>
                <div class="av-fd-copy">▣ Full Copy #${fi + 1}</div>
              </div>`;
      }).join('');
      return `<div style="display:flex;flex-direction:column;gap:8px">
              <div style="text-align:center;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px">Cloud Region — 3 nodes / AZ (odd) · 3 AZs (odd FDs)</div>
              <div class="av-fd-row">${fds}</div>
              ${captionBar}
            </div>`;
    }

    // ── Region/DC tab ──────────────────────────────────────────────────────────────────
    if (idx === 3) {
      const regions = ['us-east-1', 'eu-west-1', 'ap-south-1'];
      const azNames = ['AZ-a', 'AZ-b', 'AZ-c'];
      const fds = [0, 1, 2].map(fi => {
        const fc = FD_COLORS[fi];
        const azRows = [0, 1, 2].map(ai => {
          const isL = ai === fi;
          return `<div style="display:flex;align-items:center;gap:8px;background:var(--s2);border-radius:7px;padding:7px 10px;border:1px solid var(--border)">
                  <span style="font-size:11px;font-weight:700;color:var(--txt2);min-width:36px;font-family:var(--mono)">${azNames[ai]}</span>
                  <div style="font-size:10px;font-weight:600;color:var(--txt2);font-family:var(--mono);flex:1">Node ${fi * 3 + ai + 1}</div>
                  <div style="display:flex;gap:4px">${chip(T[ai], isL)}</div>
                </div>`;
        }).join('');
        return `<div class="av-fd" style="border-top:3px solid ${fc}">
                <div class="av-fd-name" style="color:${fc}">Fault Domain ${fi + 1}</div>
                <div class="av-fd-az" style="font-family:var(--mono)">${regions[fi]}</div>
                <div style="display:flex;flex-direction:column;gap:6px;flex:1">${azRows}</div>
                <div class="av-fd-copy">▣ Full Copy #${fi + 1}</div>
              </div>`;
      }).join('');
      return `<div style="display:flex;flex-direction:column;gap:8px">
              <div style="text-align:center;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px">Multi-Region — 3 regions (odd FDs) · 3 AZs per region</div>
              <div class="av-fd-row">${fds}</div>
              ${captionBar}
            </div>`;
    }

    // ── Cloud tab ────────────────────────────────────────────────────────────────────────
    const clouds = [
      { name: 'AWS', region: 'us-east-1' },
      { name: 'GCP', region: 'us-central1' },
      { name: 'Azure', region: 'East US' },
    ];
    const azNames = ['AZ-1', 'AZ-2', 'AZ-3'];
    const fds = [0, 1, 2].map(fi => {
      const fc = FD_COLORS[fi];
      const cl = clouds[fi];
      const azRows = [0, 1, 2].map(ai => {
        const isL = ai === fi;
        return `<div style="display:flex;align-items:center;gap:8px;background:var(--s2);border-radius:7px;padding:7px 10px;border:1px solid var(--border)">
                <span style="font-size:11px;font-weight:700;color:var(--txt2);min-width:36px;font-family:var(--mono)">${azNames[ai]}</span>
                <div style="font-size:10px;font-weight:600;color:var(--txt2);font-family:var(--mono);flex:1">Node ${fi * 3 + ai + 1}</div>
                <div style="display:flex;gap:4px">${chip(T[ai], isL)}</div>
              </div>`;
      }).join('');
      return `<div class="av-fd" style="border-top:3px solid ${fc}">
              <div class="av-fd-name" style="color:${fc}">Fault Domain ${fi + 1}</div>
              <div style="text-align:center;margin-bottom:4px">
                <div style="font-size:16px;font-weight:800;color:var(--txt)">${cl.name}</div>
                <div class="av-fd-az" style="font-family:var(--mono)">${cl.region}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;flex:1">${azRows}</div>
              <div class="av-fd-copy">▣ Full Copy #${fi + 1}</div>
            </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:8px">
            <div style="text-align:center;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:1px">Multi-Cloud — 3 providers (odd FDs) · strongest isolation</div>
            <div class="av-fd-row">${fds}</div>
            ${captionBar}
          </div>`;
  }
  // Tab container — no overflow:hidden so tabs never clip
  h += `<div style="background:var(--s1);border:1px solid var(--border);border-radius:10px">`;
  // Tab bar — scrollable if narrow, but tabs use flex so they share width evenly
  h += `<div style="display:flex;border-bottom:1px solid var(--border);border-radius:10px 10px 0 0;overflow:hidden">`;
  FD_TABS.forEach((lv, i) => {
    const active = i === 0;
    h += `<button id="fd-tab-${i}" onclick="fdSetTab(${i})" style="flex:1;padding:14px 4px;background:${active ? `${lv.color}18` : 'transparent'};border:none;border-bottom:3px solid ${active ? lv.color : 'transparent'};cursor:pointer;font-size:12px;font-weight:700;color:${active ? lv.color : 'var(--txt2)'};font-family:var(--head);transition:color .15s,background .15s,border-color .15s">${lv.icon} ${lv.name}</button>`;
  });
  h += `</div>`;

  // Tab panels
  FD_TABS.forEach((lv, i) => {
    h += `<div id="fd-panel-${i}" style="${i > 0 ? 'display:none' : ''}">`;
    // diagram — full width, generous padding, no fixed height so it never clips
    h += `<div style="background:var(--s2);border-bottom:1px solid var(--border);padding:28px 22px;border-radius:0">${fdDiagram(i)}</div>`;
    // info strip
    h += `<div style="padding:18px 22px 20px;display:flex;gap:24px;flex-wrap:wrap">`;
    h += `<div style="flex:1;min-width:200px">`;
    h += `<div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">Fails together when</div>`;
    h += `<div style="font-size:13.5px;color:var(--txt);line-height:1.55;margin-bottom:7px">${lv.failOn}</div>`;
    h += `<div style="font-size:12.5px;color:var(--txt2);line-height:1.5">${lv.why}</div>`;
    h += `</div>`;
    h += `<div style="flex:1;min-width:200px">`;
    h += `<div style="font-size:11px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">Deployment Example</div>`;
    h += `<div style="font-size:13.5px;color:var(--txt);margin-bottom:10px;line-height:1.5">${lv.example}</div>`;
    h += `<div style="display:flex;gap:8px;flex-wrap:wrap">`;
    h += `<span style="font-size:12px;color:${lv.color};background:${lv.color}18;border:1px solid ${lv.color}44;border-radius:5px;padding:4px 10px;font-family:var(--mono)">${lv.policy}</span>`;
    h += `<span style="font-size:12px;color:var(--txt2);background:var(--s2);border:1px solid var(--border);border-radius:5px;padding:4px 10px">${lv.scope}</span>`;
    h += `</div></div></div>`;
    h += `</div>`;
  });

  h += `</div>`;

  // Why Odd Numbers
  h += `<div class="av-quorum"><div class="av-q-title">Why Fault Domains Must Be Odd</div>`;
  h += `<div class="av-q-sub">Raft requires a <b>strict majority (&gt;50%)</b> of replicas to commit writes and elect a new leader. With an even count, a single failure leaves two equal halves — neither can claim a majority, causing the cluster to go unavailable to avoid split-brain.</div>`;
  h += `<div class="av-q-cases">`;
  const qcases = [
    { n: 2, fail: 1, survive: 1, pct: 50, ok: false, warn: false, lbl: '2 FDs (Even)', calc: '1/2 = 50% — no strict majority' },
    { n: 3, fail: 1, survive: 2, pct: 67, ok: true, warn: false, lbl: '3 FDs (Odd) — Minimum', calc: '2/3 = 67% — quorum holds' },
    { n: 4, fail: 1, survive: 3, pct: 75, ok: false, warn: true, lbl: '4 FDs (Even) — Suboptimal', calc: '3/4 = 75% — same tolerance as RF=3, extra cost' },
    { n: 5, fail: 2, survive: 3, pct: 60, ok: true, warn: false, lbl: '5 FDs (Odd)', calc: '3/5 = 60% — tolerates 2 failures' },
  ];
  for (const c of qcases) {
    const cls = c.warn ? '' : (c.ok ? 'av-qcase-ok' : 'av-qcase-bad');
    const warnStyle = c.warn ? 'border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.06)' : '';
    h += `<div class="av-qcase ${cls}" style="${warnStyle}">`;
    h += `<div class="av-qcase-lbl">${c.lbl}</div>`;
    h += `<div class="av-qcase-dots">${Array.from({ length: c.n }, (_, i) => `<span class="av-qd ${i < c.fail ? 'av-qd-fail' : 'av-qd-ok'}">${i < c.fail ? '✕' : '✓'}</span>`).join('')}</div>`;
    h += `<div class="av-qcase-calc">${c.calc}</div>`;
    const verdict = c.warn ? '⚠ SUBOPTIMAL' : (c.ok ? '✓ CONTINUES' : '✗ UNAVAILABLE');
    const verdictColor = c.warn ? 'color:var(--warn)' : '';
    h += `<div class="av-qcase-verdict" style="${verdictColor}">${verdict}</div>`;
    h += `</div>`;
  }
  h += `</div></div>`;

  // RF & Fault Tolerance Formula
  h += `<div class="av-section-title">Replication Factor &amp; Fault Tolerance Formula</div>`;
  h += `<div style="display:flex;gap:12px;flex-wrap:wrap">`;
  const formulas = [
    { lbl: 'Quorum — replicas needed to commit', val: '⌊RF / 2⌋ + 1', color: '#60a5fa' },
    { lbl: 'Max tolerable simultaneous failures', val: '⌊(RF − 1) / 2⌋', color: '#34d399' },
    { lbl: 'Fault domains required', val: 'RF  (1 replica / FD)', color: '#a78bfa' },
  ];
  formulas.forEach(f => {
    h += `<div style="flex:1;min-width:170px;background:var(--s1);border:1px solid var(--border);border-top:3px solid ${f.color};border-radius:8px;padding:13px 16px;text-align:center">`;
    h += `<div style="font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">${f.lbl}</div>`;
    h += `<div style="font-size:18px;font-weight:700;color:${f.color};font-family:var(--head)">${f.val}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // RF table
  const rfRows = [
    { rf: 1, q: 1, f: 0, ok: false, note: 'No redundancy — development only' },
    { rf: 2, q: 2, f: 0, ok: false, note: 'No failure tolerance — even number' },
    { rf: 3, q: 2, f: 1, ok: true, note: 'Minimum recommended — tolerates 1 FD' },
    { rf: 4, q: 3, f: 1, ok: false, note: 'Same tolerance as RF=3 — extra cost' },
    { rf: 5, q: 3, f: 2, ok: true, note: 'High availability — tolerates 2 FDs' },
    { rf: 6, q: 4, f: 2, ok: false, note: 'Same tolerance as RF=5 — extra cost' },
    { rf: 7, q: 4, f: 3, ok: true, note: 'Maximum resilience — tolerates 3 FDs' },
  ];
  h += `<div id="av-fd-rf-table" style="overflow-x:auto;background:var(--s1);border:1px solid var(--border);border-radius:8px">`;
  h += `<table style="width:100%;border-collapse:collapse;font-size:13px">`;
  h += `<thead><tr style="background:var(--s3)">`;
  ['RF', 'Quorum', 'Max Failures', 'Fault Domains', 'Notes'].forEach((c, j) => {
    h += `<th style="padding:10px 14px;text-align:${j === 4 ? 'left' : 'center'};font-size:11px;color:var(--txt2);text-transform:uppercase;letter-spacing:.8px;font-weight:700;border-bottom:1px solid var(--border)">${c}</th>`;
  });
  h += `</tr></thead><tbody>`;
  for (const r of rfRows) {
    const rfColor = r.ok ? 'var(--ok)' : (r.f === 0 ? 'var(--err)' : 'var(--warn)');
    const badge = r.ok ? `<span style="font-size:10px;color:var(--ok);background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:middle">Odd</span>` : '';
    const failColor = r.f === 0 ? 'var(--err)' : r.f >= 2 ? 'var(--ok)' : 'var(--warn)';
    h += `<tr style="border-bottom:1px solid var(--border)">`;
    h += `<td style="padding:9px 14px;text-align:center;font-weight:700;font-family:var(--head);color:${rfColor};font-size:15px">RF=${r.rf}${badge}</td>`;
    h += `<td style="padding:9px 14px;text-align:center;color:var(--txt)">${r.q}</td>`;
    h += `<td style="padding:9px 14px;text-align:center;font-weight:600;color:${failColor}">${r.f}</td>`;
    h += `<td style="padding:9px 14px;text-align:center;color:var(--txt)">${r.rf}</td>`;
    h += `<td style="padding:9px 14px;color:var(--txt2);font-size:12px">${r.note}</td>`;
    h += `</tr>`;
  }
  h += `</tbody></table></div>`;

  container.innerHTML = h;
}

// ════════════════════════════════════════════
//  UNIVERSE HIERARCHY RENDERER
// ════════════════════════════════════════════
function _renderArchUniverseHierarchy(container) {
  let h = '';
  // Title
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Universe Object Hierarchy</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">A <strong>Universe</strong> is the top-level deployment unit. It contains one primary cluster and optionally multiple read replica clusters. Data is organized into databases, schemas, tables, indexes, and other objects — all physically sharded into tablets distributed across TServer nodes.</div>`;

  // Stats bar
  const stats = [
    { val: '1', lbl: 'Universe' }, { val: '1+N', lbl: 'Clusters' },
    { val: 'N', lbl: 'Databases' }, { val: 'N', lbl: 'Schemas' },
    { val: 'N', lbl: 'Tables & Indexes' }, { val: 'N×S', lbl: 'Tablets' },
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // Highlights
  const highlights = [
    { icon: '⬡', label: 'Raft Consensus per Tablet', cls: 'av-hl-purple' },
    { icon: '⊞', label: 'Hash or Range Sharding', cls: 'av-hl-blue' },
    { icon: '◎', label: 'YSQL & YCQL APIs', cls: 'av-hl-green' },
    { icon: '↻', label: 'Auto-Sharding & Splitting', cls: 'av-hl-amber' },
  ];
  h += `<div class="av-highlights">${highlights.map(hl => `<div class="av-hl ${hl.cls}"><span class="av-hl-icon">${hl.icon}</span><span class="av-hl-txt">${hl.label}</span></div>`).join('')}</div>`;

  h += `<div class="av-section-title">Visual Hierarchy</div>`;

  // ── Nested hierarchy tree ──
  // unique id counter for expand/collapse
  let _uhId = 0;
  function uhNode(icon, cls, nameHtml, metaHtml, hasChildren, defaultCollapsed = false) {
    const id = `uh-c-${_uhId++}`;
    let s = `<div class="uh-node ${cls}" ${hasChildren ? `onclick="uhToggle('${id}')" style="cursor:pointer"` : ''}>`;
    if (hasChildren) s += `<div class="uh-toggle" id="uh-t-${id}">${defaultCollapsed ? '▶' : '▼'}</div>`;
    s += `<div class="uh-icon">${icon}</div><div class="uh-info"><div class="uh-name">${nameHtml}</div><div class="uh-meta">${metaHtml}</div></div></div>`;
    if (hasChildren) s += `<div class="uh-children" id="${id}"${defaultCollapsed ? ' style="display:none"' : ''}>`;
    return s;
  }
  function uhClose() { return `</div></div>`; } // close children + level

  h += `<div class="uh-tree">`;

  // Level 0: Universe
  h += `<div class="uh-level uh-l0">`;
  h += uhNode('🌌', 'uh-universe', 'Universe: <span class="uh-val">my-yugabyte-universe</span>', 'Top-level deployment · managed by YugabyteDB Anywhere or yugabyted', true);

  // Level 1: Primary Cluster
  h += `<div class="uh-level uh-l1">`;
  h += uhNode('🟢', 'uh-cluster uh-primary-cl', 'Primary Cluster <span class="uh-badge uh-badge-green">READ + WRITE</span>', 'RF=3 · 3 Fault Domains · Sync Raft replication · serves all reads &amp; writes', true);

  // Level 2: Databases
  const databases = [
    {
      name: 'yugabyte', api: 'YSQL', color: '#94a3b8', schemas: [
        { name: 'public', tables: ['yb_nodes', 'yb_tablets'], indexes: [], others: ['admin_role'] }
      ]
    },
    {
      name: 'ecommerce', api: 'YSQL', color: '#60a5fa', schemas: [
        { name: 'public', tables: ['users', 'orders', 'products'], indexes: ['users_email_idx', 'orders_date_idx'], others: ['get_user_by_id()', 'update_inventory()', 'app_role'] },
        { name: 'analytics', tables: ['events', 'sessions'], indexes: ['events_ts_idx'], others: ['generate_report()', 'analyst_role'] }
      ]
    },
    {
      name: 'sensor_network', api: 'YCQL', color: '#34d399', schemas: [
        { name: 'iot_data', tables: ['sensor_data', 'device_registry'], indexes: ['sensor_ts_idx'], others: ['iot_role', 'process_alert()'] }
      ]
    }
  ];

  function renderDatabases(isPrimary) {
    let out = '';
    databases.forEach(db => {
      out += `<div class="uh-level uh-l2">`;
      out += uhNode('🗄️', `uh-database" style="border-left-color:${db.color}`, `${db.api === 'YCQL' ? 'Keyspace' : 'Database'}: <span class="uh-val">${db.name}</span> <span class="uh-badge" style="background:${db.color}22;color:${db.color};border-color:${db.color}44">${db.api}</span>`, db.api === 'YSQL' ? 'PostgreSQL-compatible · supports schemas, roles, functions' : 'Cassandra-compatible · keyspace = database equivalent', true, true);

      db.schemas.forEach(schema => {
        out += `<div class="uh-level uh-l3">`;
        out += uhNode('📂', 'uh-schema', `Schema: <span class="uh-val">${schema.name}</span>`, `${schema.tables.length} tables · ${schema.indexes.length} indexes · ${schema.others.length} other objects`, true);

        // Tables
        out += `<div class="uh-obj-group">`;
        out += `<div class="uh-obj-group-hdr"><span class="uh-obj-icon">📊</span> Tables</div>`;
        out += `<div class="uh-obj-items">`;
        schema.tables.forEach(t => {
          out += `<div class="uh-obj-item uh-table-item"><span class="uh-obj-name">${t}</span>`;
          out += `<div class="uh-tablets" title="${isPrimary ? 'Each table is sharded into tablets' : 'Read replica observer tablets'}">`;
          if (isPrimary) {
            out += `<span class="uh-tablet-chip uh-tc-l">◉</span><span class="uh-tablet-chip uh-tc-f">○</span><span class="uh-tablet-chip uh-tc-f">○</span><span class="uh-tablet-lbl">tablet×3</span>`;
          } else {
            out += `<span class="uh-tablet-chip uh-tc-f" style="border-color:var(--sql-kw);color:var(--sql-kw)">○</span><span class="uh-tablet-chip uh-tc-f" style="border-color:var(--sql-kw);color:var(--sql-kw)">○</span><span class="uh-tablet-lbl">observer×2</span>`;
          }
          out += `</div></div>`;
        });
        out += `</div></div>`;

        // Indexes
        out += `<div class="uh-obj-group">`;
        out += `<div class="uh-obj-group-hdr"><span class="uh-obj-icon">🔍</span> Indexes</div>`;
        out += `<div class="uh-obj-items">`;
        schema.indexes.forEach(idx => {
          out += `<div class="uh-obj-item uh-index-item"><span class="uh-obj-name">${idx}</span>`;
          out += `<div class="uh-tablets">`;
          if (isPrimary) {
            out += `<span class="uh-tablet-chip uh-tc-l">◉</span><span class="uh-tablet-chip uh-tc-f">○</span><span class="uh-tablet-chip uh-tc-f">○</span><span class="uh-tablet-lbl">tablet×3</span>`;
          } else {
            out += `<span class="uh-tablet-chip uh-tc-f" style="border-color:var(--sql-kw);color:var(--sql-kw)">○</span><span class="uh-tablet-chip uh-tc-f" style="border-color:var(--sql-kw);color:var(--sql-kw)">○</span><span class="uh-tablet-lbl">observer×2</span>`;
          }
          out += `</div></div>`;
        });
        out += `</div></div>`;

        // Other objects
        out += `<div class="uh-obj-group">`;
        out += `<div class="uh-obj-group-hdr"><span class="uh-obj-icon">⚙️</span> Other Objects</div>`;
        out += `<div class="uh-obj-items uh-others-grid">`;
        schema.others.forEach(o => {
          const isFunc = o.includes('(');
          const isRole = o.includes('role');
          const icon = isFunc ? '⨍' : isRole ? '👤' : '⚙';
          const cls = isFunc ? 'uh-func' : isRole ? 'uh-role' : '';
          out += `<div class="uh-obj-item uh-other-item ${cls}"><span class="uh-other-icon">${icon}</span><span class="uh-obj-name">${o}</span></div>`;
        });
        out += `</div></div>`;

        out += uhClose(); // close schema
      });
      out += uhClose(); // close db
    });
    return out;
  }

  h += renderDatabases(true);
  h += uhClose(); // close primary cluster

  // Level 1: Read Replica Clusters
  const rrClusters = [
    { name: 'us-east-1 Read Replica', rf: 3, azs: 3 },
    { name: 'eu-central-1 Read Replica', rf: 1, azs: 1 },
  ];
  rrClusters.forEach((rr, idx) => {
    h += `<div class="uh-level uh-l1">`;
    h += uhNode('👁', 'uh-cluster uh-replica-cl', `${rr.name} <span class="uh-badge uh-badge-purple">READ ONLY</span>`, `RF=${rr.rf} · ${rr.azs} AZ${rr.azs > 1 ? 's' : ''} · Async WAL replication · observer nodes · no Raft vote`, true);
    h += renderDatabases(false);
    h += uhClose();
  });

  h += uhClose(); // close universe
  h += `</div>`; // close uh-tree

  // Tablet sharding visual section
  h += `<div class="av-section-title">Tables & Indexes → Tablets (Sharding)</div>`;
  h += `<div style="background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:20px 20px 16px;margin-bottom:20px;">`;
  h += `<div style="font-size:11px;font-weight:700;color:var(--txt2);letter-spacing:.07em;margin-bottom:14px;text-transform:uppercase;">Example · users table · Hash Sharding · 3 Tablets · RF=3</div>`;

  // Step 1: CREATE TABLE → sharding
  h += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">`;
  h += `<div style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);border-radius:6px;padding:8px 14px;font-family:var(--mono);font-size:12px;color:var(--sql-num);white-space:nowrap;"><span style="color:var(--txt2)">CREATE TABLE </span>users <span style="color:var(--txt2)">(id INT </span>PRIMARY KEY<span style="color:var(--txt2)">, name TEXT, city TEXT, ...)</span></div>`;
  h += `<div style="color:var(--txt2);font-size:13px;flex-shrink:0;">→</div>`;
  h += `<div style="font-size:11px;color:var(--txt);background:var(--s2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;white-space:nowrap;">⊞ Hash sharding on <code style="color:var(--follower)">id</code> &nbsp;·&nbsp; 3 tablets by default</div>`;
  h += `</div>`;
  h += `<div style="text-align:center;color:var(--txt2);font-size:16px;line-height:1;margin:2px 0 8px;">↓</div>`;

  // Step 2: Key space bar
  const tbs = [
    { name: 'users.tablet1', range: '0x0000 – 0x54FF', color: '#f59e0b' },
    { name: 'users.tablet2', range: '0x5500 – 0xA9FF', color: '#60a5fa' },
    { name: 'users.tablet3', range: '0xAA00 – 0xFFFF', color: '#34d399' },
  ];
  h += `<div style="font-size:12px;color:var(--txt2);font-family:var(--mono);display:flex;justify-content:space-between;margin-bottom:4px;padding:0 2px;"><span>0x0000</span><span>← Hash Key Space →</span><span>0xFFFF</span></div>`;
  h += `<div style="display:flex;gap:4px;height:56px;margin-bottom:4px;">`;
  tbs.forEach(t => {
    h += `<div style="flex:1;background:${t.color}28;border:2px solid ${t.color}88;border-radius:6px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:3px;">`;
    h += `<div style="font-size:13px;font-weight:700;color:${t.color};">${t.name}</div>`;
    h += `<div style="font-size:12px;color:var(--txt2);font-family:var(--mono);">${t.range}</div>`;
    h += `</div>`;
  });
  h += `</div>`;
  h += `<div style="text-align:center;color:var(--txt2);font-size:13px;margin:8px 0 12px;">↓ &nbsp;RF=3 replication — each tablet replica placed on one node per Fault Domain</div>`;

  // Step 3: Fault domain placement grid
  const fdC = ['#fb7185', '#f59e0b', '#34d399'];
  const ndData = [
    [0, 1, 0, true],  [0, 2, 1, false], [0, 3, 2, false],
    [1, 4, 0, false], [1, 5, 1, true],  [1, 6, 2, false],
    [2, 7, 0, false], [2, 8, 1, false], [2, 9, 2, true],
  ];
  h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">`;
  for (let fi = 0; fi < 3; fi++) {
    h += `<div style="background:${fdC[fi]}20;border:1.5px solid ${fdC[fi]}55;border-radius:8px;overflow:hidden;">`;
    h += `<div style="background:${fdC[fi]}35;padding:8px 12px;font-size:12px;font-weight:700;color:${fdC[fi]};letter-spacing:.07em;text-align:center;">FAULT DOMAIN ${fi + 1}</div>`;
    ndData.filter(n => n[0] === fi).forEach(([, nid, ti, isL]) => {
      const tc = tbs[ti].color;
      h += `<div style="padding:9px 12px;border-top:1px solid ${fdC[fi]}20;display:flex;align-items:center;gap:8px;">`;
      h += `<div style="font-size:12px;color:var(--txt2);min-width:48px;flex-shrink:0;">Node ${(nid - 1) % 3 + 1}</div>`;
      h += `<div style="width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;${isL ? `background:${tc};color:#0f172a;font-weight:700` : `border:1.5px solid ${tc};color:${tc}`}">${isL ? '◉' : '○'}</div>`;
      h += `<div style="font-size:12px;color:${tc};font-weight:${isL ? 600 : 400};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tbs[ti].name}</div>`;
      if (isL) h += `<div style="font-size:11px;background:${tc}22;color:${tc};border-radius:3px;padding:2px 7px;border:1px solid ${tc}44;font-weight:700;letter-spacing:.05em;flex-shrink:0;">LEADER</div>`;
      h += `</div>`;
    });
    h += `</div>`;
  }
  h += `</div>`;

  // Footer note
  h += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:13px;color:var(--txt2);line-height:1.6;">`;
  h += `Each tablet is an independent <strong style="color:var(--txt)">Raft group</strong> — 1 leader + 2 followers, each in a separate Fault Domain. `;
  h += `Leaders distribute evenly so no single node becomes a hotspot. When a leader fails, the remaining followers elect a new one automatically within ~150–300 ms.`;
  h += `</div>`;
  h += `</div>`;

  container.innerHTML = h;
}

// ════════════════════════════════════════════
//  CONSENSUS QUORUM RENDERER
// ════════════════════════════════════════════
function _renderArchConsensus(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Consensus (Raft) Quorum</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">Every tablet in YugabyteDB is a <strong>Raft group</strong>. Raft guarantees strong consistency by requiring a <strong>strict majority (quorum)</strong> to acknowledge every write before it is committed. Leader election is fully automatic — no manual failover is ever needed.</div>`;

  // Stats bar
  const stats = [
    { val: 'RF=3', lbl: 'Replication' }, { val: '2/3', lbl: 'Quorum' },
    { val: '1', lbl: 'Leader' }, { val: '2', lbl: 'Followers' },
    { val: '>50%', lbl: 'Majority Rule' }, { val: 'Auto', lbl: 'Elections' },
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // Highlights
  const highlights = [
    { icon: '◉', label: 'Single Leader per Tablet', cls: 'av-hl-green' },
    { icon: '○', label: 'N−1 Followers', cls: 'av-hl-blue' },
    { icon: '⬡', label: 'Strict Majority Commits', cls: 'av-hl-purple' },
    { icon: '↻', label: 'Auto Leader Election', cls: 'av-hl-amber' },
    { icon: '⊘', label: 'No Split-Brain', cls: 'av-hl-green' },
    { icon: '≡', label: 'WAL-based Replication', cls: 'av-hl-blue' },
  ];
  h += `<div class="av-highlights">${highlights.map(hl => `<div class="av-hl ${hl.cls}"><span class="av-hl-icon">${hl.icon}</span><span class="av-hl-txt">${hl.label}</span></div>`).join('')}</div>`;

  // ── Section 1: Raft Group Anatomy ──
  h += `<div class="av-section-title">Raft Group Anatomy — Tablet Replica Roles</div>`;
  h += `<div class="cq-group-anatomy">`;

  // Visual: 3 replicas in a Raft group
  h += `<div class="cq-replicas-row">`;
  const replicas = [
    { node: 'Tablet 1 → Node 1 (FD-1)', role: 'LEADER', icon: '◉', cls: 'cq-leader', color: '#f59e0b', desc: 'Handles all reads & writes. Appends to WAL first, then replicates to followers.' },
    { node: 'Tablet 1 → Node 2 (FD-2)', role: 'FOLLOWER', icon: '○', cls: 'cq-follower', color: '#60a5fa', desc: 'Receives AppendEntries from leader. Applies to local WAL. Sends ACK back.' },
    { node: 'Tablet 1 → Node 3 (FD-3)', role: 'FOLLOWER', icon: '○', cls: 'cq-follower', color: '#34d399', desc: 'Same as other follower. Participates in quorum voting and leader election.' },
  ];
  replicas.forEach(r => {
    h += `<div class="cq-replica ${r.cls}">`;
    h += `<div class="cq-rep-icon" style="color:${r.color}">${r.icon}</div>`;
    h += `<div class="cq-rep-role" style="color:${r.color}">${r.role}</div>`;
    h += `<div class="cq-rep-node">${r.node}</div>`;
    h += `<div class="cq-rep-desc">${r.desc}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // Raft group label
  h += `<div class="cq-group-label">`;
  h += `<span class="cq-gl-dot" style="background:#f59e0b"></span>`;
  h += `<span>users.tablet1 — Raft Group (term: 4)</span>`;
  h += `</div>`;
  h += `</div>`;

  // ── Section 2: Node States ──
  h += `<div class="av-section-title">Node States & Transitions</div>`;
  h += `<div style="display:flex;gap:12px;align-items:stretch;margin-bottom:20px;flex-wrap:wrap;">`;

  h += `<div style="flex:1;min-width:170px;background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.3);border-radius:10px;padding:16px;">`;
  h += `<div style="font-size:22px;text-align:center;color:var(--sql-num);margin-bottom:6px;">○</div>`;
  h += `<div style="font-size:12px;font-weight:700;text-align:center;color:var(--sql-num);letter-spacing:.07em;margin-bottom:8px;">FOLLOWER</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;margin-bottom:10px;">Default state. Receives heartbeats &amp; log entries from Leader. Resets election timer on every heartbeat.</div>`;
  h += `<div style="font-size:11px;color:var(--txt2);border-top:1px solid var(--border);padding-top:8px;"><strong style="color:var(--sql-kw)">→ Candidate</strong><br/>Election timer expires with no heartbeat (randomized ms interval)</div>`;
  h += `</div>`;

  h += `<div style="display:flex;align-items:center;color:var(--txt2);font-size:18px;padding:0 4px;">→</div>`;

  h += `<div style="flex:1;min-width:170px;background:rgba(167,139,250,.07);border:1px solid rgba(167,139,250,.3);border-radius:10px;padding:16px;">`;
  h += `<div style="font-size:22px;text-align:center;color:var(--sql-kw);margin-bottom:6px;">🗳️</div>`;
  h += `<div style="font-size:12px;font-weight:700;text-align:center;color:var(--sql-kw);letter-spacing:.07em;margin-bottom:8px;">CANDIDATE</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;margin-bottom:10px;">Increments term, votes for itself, broadcasts RequestVote RPCs to all peers. Only one candidate can win per term.</div>`;
  h += `<div style="font-size:11px;color:var(--txt2);border-top:1px solid var(--border);padding-top:8px;">`;
  h += `<strong style="color:#22c55e">→ Leader</strong>&nbsp;&nbsp;Majority votes received<br/>`;
  h += `<strong style="color:var(--follower)">→ Follower</strong>&nbsp;Higher term seen or split vote`;
  h += `</div></div>`;

  h += `<div style="display:flex;align-items:center;color:var(--txt2);font-size:18px;padding:0 4px;">→</div>`;

  h += `<div style="flex:1;min-width:170px;background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:16px;">`;
  h += `<div style="font-size:22px;text-align:center;color:var(--sql-str);margin-bottom:6px;">◉</div>`;
  h += `<div style="font-size:12px;font-weight:700;text-align:center;color:var(--sql-str);letter-spacing:.07em;margin-bottom:8px;">LEADER</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;margin-bottom:10px;">Handles all client reads &amp; writes. Appends to WAL, replicates to followers, commits on majority ACK. Sends periodic heartbeats.</div>`;
  h += `<div style="font-size:11px;color:var(--txt2);border-top:1px solid var(--border);padding-top:8px;"><strong style="color:var(--follower)">→ Follower</strong><br/>Discovers a higher Raft term from any peer</div>`;
  h += `</div>`;

  h += `</div>`;

  // ── Section 3: Write Flow ──
  h += `<div class="av-section-title">Write Path — Raft Consensus Commit Flow</div>`;
  h += `<div class="cq-write-flow">`;

  const writeSteps = [
    { num: '1', title: 'Client Write', desc: 'INSERT/UPDATE sent to leader', icon: '📝', color: '#f59e0b' },
    { num: '2', title: 'WAL Append', desc: 'Leader appends entry to its Write-Ahead Log', icon: '📋', color: '#60a5fa' },
    { num: '3', title: 'Replicate', desc: 'Leader sends AppendEntries RPC to all followers in parallel', icon: '📡', color: '#a78bfa' },
    { num: '4', title: 'Follower ACK', desc: 'Each follower appends to its WAL and sends ACK', icon: '✓', color: '#34d399' },
    { num: '5', title: 'Majority', desc: 'Leader + 1 follower ACK = 2/3 = quorum. Write is committed.', icon: '⬡', color: '#22c55e' },
    { num: '6', title: 'Respond', desc: 'Leader responds SUCCESS to client. Remaining follower catches up async.', icon: '✅', color: '#f59e0b' },
  ];

  h += `<div class="cq-write-steps">`;
  writeSteps.forEach((s, i) => {
    h += `<div class="cq-ws">`;
    h += `<div class="cq-ws-num" style="background:${s.color}">${s.num}</div>`;
    h += `<div class="cq-ws-icon">${s.icon}</div>`;
    h += `<div class="cq-ws-title">${s.title}</div>`;
    h += `<div class="cq-ws-desc">${s.desc}</div>`;
    h += `</div>`;
    if (i < writeSteps.length - 1) h += `<div class="cq-ws-arrow">→</div>`;
  });
  h += `</div>`;

  // Write flow diagram
  h += `<div class="cq-flow-diagram">`;
  h += `<div class="cq-fd-col cq-fd-client"><div class="cq-fd-box cq-fd-client-box">Client</div></div>`;
  h += `<div class="cq-fd-arrows">`;
  h += `<div class="cq-fd-arrow cq-fd-a-write">INSERT →</div>`;
  h += `<div class="cq-fd-arrow cq-fd-a-ack">← SUCCESS</div>`;
  h += `</div>`;
  h += `<div class="cq-fd-col cq-fd-leader"><div class="cq-fd-box cq-fd-leader-box">◉ Leader<div class="cq-fd-sub">Tablet 1 · Node 1 · WAL</div></div></div>`;
  h += `<div class="cq-fd-arrows">`;
  h += `<div class="cq-fd-arrow cq-fd-a-raft">AppendEntries →</div>`;
  h += `<div class="cq-fd-arrow cq-fd-a-ack2">← ACK (majority)</div>`;
  h += `</div>`;
  h += `<div class="cq-fd-col cq-fd-followers">`;
  h += `<div class="cq-fd-box cq-fd-f-box">○ Follower<div class="cq-fd-sub">Tablet 1 · Node 4 · WAL</div></div>`;
  h += `<div class="cq-fd-box cq-fd-f-box">○ Follower<div class="cq-fd-sub">Tablet 1 · Node 7 · WAL</div></div>`;
  h += `</div>`;
  h += `</div>`;
  h += `</div>`;

  // ── Section 4: Heartbeats & Leader Leases ──
  h += `<div class="av-section-title">Heartbeats & Leader Leases</div>`;
  h += `<div class="cq-election">`;

  const leaseSteps = [
    { num: '1', title: 'Periodic Heartbeats', desc: 'Leader sends empty AppendEntries RPCs every 500ms', icon: '💓', color: '#f59e0b' },
    { num: '2', title: 'Follower ACK', desc: 'Followers reset their election timers and acknowledge', icon: '✓', color: '#60a5fa' },
    { num: '3', title: 'Lease Renewal', desc: 'Leader extends its time-based lease upon majority ACK', icon: '⏳', color: '#a78bfa' },
    { num: '4', title: 'Local Reads', desc: 'Leader serves strong reads locally while lease is valid', icon: '📖', color: '#22c55e' },
  ];

  h += `<div class="cq-election-steps">`;
  leaseSteps.forEach((s, i) => {
    h += `<div class="cq-es">`;
    h += `<div class="cq-es-num" style="background:${s.color};color:#000">${s.num}</div>`;
    h += `<div class="cq-es-icon">${s.icon}</div>`;
    h += `<div class="cq-es-title">${s.title}</div>`;
    h += `<div class="cq-es-desc">${s.desc}</div>`;
    h += `</div>`;
    if (i < leaseSteps.length - 1) h += `<div class="cq-es-arrow">→</div>`;
  });
  h += `</div>`;

  // Diagram for Heartbeats
  h += `<div class="cq-elect-diagram" style="margin-top:20px;">`;
  h += `<div class="cq-ed-replica" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.05);"><div class="cq-ed-icon" style="color:var(--leader)">◉</div><div class="cq-ed-role" style="color:var(--leader)">LEADER</div><div class="cq-ed-node">Tablet 1 → Node 1</div><div class="cq-ed-status" style="color:var(--txt);font-weight:400;margin-top:6px;">Lease Valid ⏳</div></div>`;
  h += `<div class="cq-ed-mid"><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow" style="color:var(--leader)">Heartbeat (500ms) →</span></div><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow" style="color:var(--ok)">← ACK</span></div></div>`;
  h += `<div class="cq-ed-replica" style="border-color:rgba(96,165,250,.3);"><div class="cq-ed-icon" style="color:var(--follower)">○</div><div class="cq-ed-role">FOLLOWER</div><div class="cq-ed-node">Tablet 1 → Node 4</div><div class="cq-ed-status" style="color:var(--txt2);font-weight:400;margin-top:6px;">Timer Reset ⏱</div></div>`;
  h += `<div class="cq-ed-replica" style="border-color:rgba(52,211,153,.3);"><div class="cq-ed-icon" style="color:var(--near)">○</div><div class="cq-ed-role">FOLLOWER</div><div class="cq-ed-node">Tablet 1 → Node 7</div><div class="cq-ed-status" style="color:var(--txt2);font-weight:400;margin-top:6px;">Timer Reset ⏱</div></div>`;
  h += `</div>`;
  h += `</div>`;

  // ── Section 5: Leader Election ──
  h += `<div class="av-section-title">Leader Election — Automatic Failover</div>`;
  h += `<div class="cq-election">`;

  const electionSteps = [
    { num: '1', title: 'Leader Fails', desc: 'Leader stops sending heartbeats', icon: '💀', color: 'var(--err)' },
    { num: '2', title: 'Election Timeout', desc: 'Follower\'s heartbeat timer expires (randomized ms interval)', icon: '⏱', color: '#f59e0b' },
    { num: '3', title: 'Become Candidate', desc: 'Follower increments term, votes for itself, sends RequestVote RPCs', icon: '🗳️', color: '#a78bfa' },
    { num: '4', title: 'Majority Vote', desc: 'Receives votes from majority of replicas (including self)', icon: '⬡', color: '#60a5fa' },
    { num: '5', title: 'New Leader Elected', desc: 'Candidate wins election and immediately begins sending heartbeats', icon: '◉', color: '#22c55e' },
    { num: '6', title: 'Wait for Old Lease', desc: 'New leader waits for the old leader\'s lease to expire before serving reads/writes', icon: '⏳', color: '#f43f5e' },
  ];

  h += `<div class="cq-election-steps">`;
  electionSteps.forEach((s, i) => {
    h += `<div class="cq-es">`;
    h += `<div class="cq-es-num" style="background:${s.color}">${s.num}</div>`;
    h += `<div class="cq-es-icon">${s.icon}</div>`;
    h += `<div class="cq-es-title">${s.title}</div>`;
    h += `<div class="cq-es-desc">${s.desc}</div>`;
    h += `</div>`;
    if (i < electionSteps.length - 1) h += `<div class="cq-es-arrow">→</div>`;
  });
  h += `</div>`;

  // Election diagram
  h += `<div class="cq-elect-diagram">`;
  h += `<div class="cq-ed-replica cq-ed-dead"><div class="cq-ed-icon">✕</div><div class="cq-ed-role">OLD LEADER</div><div class="cq-ed-node">Tablet 1 → Node 1 (FD-1)</div><div class="cq-ed-status">FAILED</div></div>`;
  h += `<div class="cq-ed-mid"><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow">RequestVote →</span></div><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow">← VoteGranted</span></div><div class="cq-ed-term-badge">term: 4 → 5</div></div>`;
  h += `<div class="cq-ed-replica cq-ed-candidate"><div class="cq-ed-icon" style="color:#22c55e">◉</div><div class="cq-ed-role" style="color:#22c55e">NEW LEADER</div><div class="cq-ed-node">Tablet 1 → Node 4 (FD-2)</div><div class="cq-ed-status cq-ed-promoted">ELECTED ✓</div></div>`;
  h += `<div class="cq-ed-replica cq-ed-voter"><div class="cq-ed-icon" style="color:var(--follower)">○</div><div class="cq-ed-role">VOTER</div><div class="cq-ed-node">Tablet 1 → Node 7 (FD-3)</div><div class="cq-ed-status">GRANTED VOTE</div></div>`;
  h += `</div>`;

  // Quorum math
  h += `<div class="cq-quorum-math">`;
  h += `<div class="cq-qm-title">Quorum Requirement</div>`;
  h += `<div class="cq-qm-formula">Quorum = ⌊RF / 2⌋ + 1 = ⌊3 / 2⌋ + 1 = <strong>2 of 3</strong></div>`;
  h += `<div class="cq-qm-result">Tablet 1 on Node 4 (self-vote) + Tablet 1 on Node 7 (granted) = <span style="color:var(--ok);font-weight:700">2/3 = Majority ✓</span></div>`;
  h += `</div>`;

  h += `</div>`;

  // ── Section 6: Key Raft Properties ──
  h += `<div class="av-section-title">Key Raft Properties</div>`;
  const props = [
    { icon: '⬡', title: 'Strong Consistency', desc: 'Every committed write is visible to all subsequent reads. No stale reads from the leader.', color: '#60a5fa' },
    { icon: '⊘', title: 'No Split-Brain', desc: 'Only one leader per term. Two candidates in the same term cannot both win — majority is exclusive.', color: '#22c55e' },
    { icon: '↻', title: 'Automatic Failover', desc: 'Leader failure triggers election within 150–300ms. No manual intervention or external failover tool needed.', color: '#f59e0b' },
    { icon: '≡', title: 'Log-based Replication', desc: 'Every mutation is a WAL entry replicated in order. Followers replay the exact same log — deterministic state machine.', color: '#a78bfa' },
    { icon: '▣', title: 'Per-Tablet Leadership', desc: 'Each tablet has its own independent Raft group. Leaders are spread across nodes for load balancing.', color: '#fb7185' },
    { icon: '⇄', title: 'Catch-up Recovery', desc: 'When a failed node recovers, it receives missing WAL entries from the current leader and rejoins the quorum.', color: '#34d399' },
  ];
  h += `<div class="cq-props">`;
  props.forEach(p => {
    h += `<div class="cq-prop" style="border-top:3px solid ${p.color}">`;
    h += `<div class="cq-prop-icon" style="color:${p.color}">${p.icon}</div>`;
    h += `<div class="cq-prop-title">${p.title}</div>`;
    h += `<div class="cq-prop-desc">${p.desc}</div>`;
    h += `</div>`;
  });
  h += `</div>`;
  container.innerHTML = h;
}

// ════════════════════════════════════════════
//  CONTROL PLANE (MASTER VS TSERVER) RENDERER
// ════════════════════════════════════════════
function _renderArchControlPlane(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Control Plane vs Data Plane</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">A YugabyteDB cluster separates system metadata and orchestration (Control Plane) from actual user data storage and query execution (Data Plane).</div>`;
  const stats = [
    { val: '3', lbl: 'YB-Masters' }, { val: 'N', lbl: 'YB-TServers' },
    { val: 'DDL', lbl: 'Catalog' }, { val: 'DML', lbl: 'Queries' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  h += `<div class="av-section-title">YB-Master (Control Plane)</div>`;
  h += `<div class="av-master-section" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px;">`;
  h += `<div style="display:flex;gap:20px;align-items:center;">`;
  h += `<div style="flex:1;font-size:14px;color:var(--txt);line-height:1.6;">`;
  h += `<strong>Responsibilities:</strong><br/>`;
  h += `• <b>System Catalog:</b> Stores schemas, tables, and roles.<br/>`;
  h += `• <b>Tablet Metadata:</b> Tracks which TServer holds which tablet.<br/>`;
  h += `• <b>Load Balancing:</b> Moves tablets seamlessly to balance data across TServers.<br/>`;
  h += `• <b>Background Operations:</b> Manages backups, scaling, and DDL operations.`;
  h += `</div>`;
  h += `<div style="flex:1;display:flex;flex-direction:column;gap:8px;">`;
  h += `<div style="text-align:center;font-size:12px;color:var(--txt2);font-family:var(--mono);">Master Raft Group (sys_catalog)</div>`;
  h += `<div style="display:flex;gap:10px;justify-content:center;">`;
  h += `<div class="av-node" style="min-width:0;flex:1"><div class="av-node-id">Master 1</div><div class="av-chips"><div class="av-chip av-chip-l" style="background:#22c55e" title="Leader">◉</div></div></div>`;
  h += `<div class="av-node" style="min-width:0;flex:1"><div class="av-node-id">Master 2</div><div class="av-chips"><div class="av-chip av-chip-f" style="border-color:#22c55e;color:#22c55e" title="Follower">○</div></div></div>`;
  h += `<div class="av-node" style="min-width:0;flex:1"><div class="av-node-id">Master 3</div><div class="av-chips"><div class="av-chip av-chip-f" style="border-color:#22c55e;color:#22c55e" title="Follower">○</div></div></div>`;
  h += `</div></div></div></div>`;

  h += `<div class="av-section-title">YB-TServer (Data Plane)</div>`;
  h += `<div class="av-tserver-section" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div style="display:flex;gap:20px;align-items:center;">`;
  h += `<div style="flex:1;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-content:flex-start;">`;
  const tsData = [
    { id: 1, l: { n: 'A', c: '#3b82f6' }, f1: { n: 'C', c: '#eab308' }, f2: { n: 'D', c: '#a78bfa' } },
    { id: 2, l: { n: 'B', c: '#22c55e' }, f1: { n: 'A', c: '#3b82f6' }, f2: { n: 'D', c: '#a78bfa' } },
    { id: 3, l: { n: 'C', c: '#eab308' }, f1: { n: 'A', c: '#3b82f6' }, f2: { n: 'B', c: '#22c55e' } },
    { id: 4, l: { n: 'D', c: '#a78bfa' }, f1: { n: 'B', c: '#22c55e' }, f2: { n: 'C', c: '#eab308' } }
  ];
  tsData.forEach(ts => {
    h += `<div class="av-node" style="min-width:0;flex:0 0 calc(50% - 5px);"><div class="av-node-id">TServer ${ts.id}</div><div class="av-chips"><div style="font-size:10px;font-weight:600;color:var(--txt2);margin-bottom:2px;">Tablets</div><div style="display:flex;gap:6px;">`;
    h += `<div class="av-chip av-chip-l" style="background:${ts.l.c}" title="Tablet ${ts.l.n} Leader">◉</div>`;
    h += `<div class="av-chip av-chip-f" style="border-color:${ts.f1.c};color:${ts.f1.c}" title="Tablet ${ts.f1.n} Follower">○</div>`;
    h += `<div class="av-chip av-chip-f" style="border-color:${ts.f2.c};color:${ts.f2.c}" title="Tablet ${ts.f2.n} Follower">○</div>`;
    h += `</div></div></div>`;
  });
  h += `</div>`;
  h += `<div style="flex:1;font-size:14px;color:var(--txt);line-height:1.6;">`;
  h += `<strong>Responsibilities:</strong><br/>`;
  h += `• <b>Query Execution:</b> Parses, plans, and executes YSQL & YCQL queries.<br/>`;
  h += `• <b>Data Storage:</b> Stores actual user data in the distributed DocDB storage engine.<br/>`;
  h += `• <b>Raft Consensus:</b> Participates in data replication and leader elections.<br/>`;
  h += `• <b>Distributed TXNs:</b> Manages global locks and transaction coordinators.`;
  h += `</div>`;
  h += `</div></div>`;

  container.innerHTML = h;
}



// ════════════════════════════════════════════
//  HYBRID TIME RENDERER
// ════════════════════════════════════════════
function _renderArchHybridTime(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Distributed Hybrid Time</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">YugabyteDB uses Hybrid Logical Clocks (HLC) to achieve global transaction ordering and Multi-Version Concurrency Control (MVCC) without relying on specialized atomic clock hardware.</div>`;
  const stats = [
    { val: '64-bit', lbl: 'Timestamp' }, { val: 'NTP', lbl: 'Clock Sync' },
    { val: 'MVCC', lbl: 'Concurrency' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // Diagram
  h += `<div class="av-ht-diagram" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:24px;text-align:center;margin-bottom:20px;">`;
  h += `<div style="font-size:14px;color:var(--txt2);text-transform:uppercase;letter-spacing:1px;font-weight:bold;margin-bottom:16px;">Anatomy of a Hybrid Time Timestamp</div>`;
  h += `<div style="display:inline-flex;border:1px solid #a78bfa;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(167,139,250,0.1);">`;
  h += `<div style="background:rgba(167,139,250,0.1);padding:16px 24px;border-right:1px solid #a78bfa;">`;
  h += `<div style="font-size:24px;font-family:var(--mono);color:var(--sql-kw);font-weight:bold;">1682782390123</div>`;
  h += `<div style="font-size:12px;color:var(--txt);margin-top:4px;">Physical Time (Microseconds)</div>`;
  h += `</div>`;
  h += `<div style="background:rgba(236,72,153,0.1);padding:16px 24px;">`;
  h += `<div style="font-size:24px;font-family:var(--mono);color:#ec4899;font-weight:bold;">0014</div>`;
  h += `<div style="font-size:12px;color:var(--txt);margin-top:4px;">Logical Component (Counter)</div>`;
  h += `</div>`;
  h += `</div>`;
  h += `<div style="font-size:13.5px;color:var(--txt2);line-height:1.6;margin-top:20px;max-width:600px;margin-left:auto;margin-right:auto;">`;
  h += `The Physical component tracks wall-clock time. If multiple events occur within the same physical microsecond, the Logical component increments. This guarantees every event gets a strictly monotonically increasing, unique timestamp across the cluster.`;
  h += `</div></div>`;

  // Sync visual
  h += `<div class="av-ht-sync" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:24px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Clock Synchronization via RPC Piggybacking</div>`;
  h += `<div style="font-size:13.5px;color:var(--txt);line-height:1.6;margin-bottom:20px;">`;
  h += `When a node receives an RPC, it compares the piggybacked <b>Remote Hybrid Time</b> with its own <b>Local Physical Clock</b>. The local clock is then updated to ensure causal ordering using the rule: <code>HT_new.physical = max(Local, Remote)</code>.`;
  h += `</div>`;

  h += `<div style="display:flex;gap:15px;margin-top:15px;">`;

  // Case 1: Remote > Local
  h += `<div style="flex:1;background:rgba(236,72,153,0.05);border:1px solid rgba(236,72,153,0.3);border-radius:8px;padding:15px;">`;
  h += `<div style="font-size:13px;font-weight:bold;color:#ec4899;margin-bottom:10px;">1. Remote is Ahead</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);margin-bottom:8px;min-height:36px;">Incoming physical time is strictly greater than the local state.</div>`;
  h += `<div style="font-family:var(--mono);font-size:11px;color:var(--txt);background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;border:1px solid var(--border);">`;
  h += `Remote HT: 1000.001<br/>Local HT: 990.005<br/>Local Physical: 990<br/>`;
  h += `<div style="margin:6px 0;border-top:1px dashed var(--border);"></div>`;
  h += `<span style="color:var(--ok);font-weight:bold;">New HT: 1000.002</span>`;
  h += `</div>`;
  h += `<div style="font-size:11.5px;color:var(--txt2);line-height:1.4;">Jumps to the remote physical time. Logical counter = <code>Remote.logical + 1</code>.</div>`;
  h += `</div>`;

  // Case 2: Local Clock Ticks
  h += `<div style="flex:1;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:15px;">`;
  h += `<div style="font-size:13px;font-weight:bold;color:#3b82f6;margin-bottom:10px;">2. Local Clock Ticks</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);margin-bottom:8px;min-height:36px;">Local physical clock ticks forward past all known states.</div>`;
  h += `<div style="font-family:var(--mono);font-size:11px;color:var(--txt);background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;border:1px solid var(--border);">`;
  h += `Remote HT: 1000.001<br/>Local HT: 1000.005<br/>Local Physical: 1010<br/>`;
  h += `<div style="margin:6px 0;border-top:1px dashed var(--border);"></div>`;
  h += `<span style="color:var(--ok);font-weight:bold;">New HT: 1010.000</span>`;
  h += `</div>`;
  h += `<div style="font-size:11.5px;color:var(--txt2);line-height:1.4;">Uses the new physical time. Since it's a new microsecond, logical counter resets to <code>000</code>.</div>`;
  h += `</div>`;

  // Case 3: Time Collision
  h += `<div style="flex:1;background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.3);border-radius:8px;padding:15px;">`;
  h += `<div style="font-size:13px;font-weight:bold;color:#eab308;margin-bottom:10px;">3. Time Collision</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);margin-bottom:8px;min-height:36px;">Incoming RPC occurs on the exact same physical microsecond as local state.</div>`;
  h += `<div style="font-family:var(--mono);font-size:11px;color:var(--txt);background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;border:1px solid var(--border);">`;
  h += `Remote HT: 1000.001<br/>Local HT: 1000.005<br/>Local Physical: 1000<br/>`;
  h += `<div style="margin:6px 0;border-top:1px dashed var(--border);"></div>`;
  h += `<span style="color:var(--ok);font-weight:bold;">New HT: 1000.006</span>`;
  h += `</div>`;
  h += `<div style="font-size:11.5px;color:var(--txt2);line-height:1.4;">Physical time stays the same. Logical counter = <code>max(Local, Remote) + 1</code>.</div>`;
  h += `</div>`;

  h += `</div></div>`;

  container.innerHTML = h;
}


function _renderArchSecurityTLS(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Encryption in Transit</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">All network traffic in YugabyteDB — client-to-node and node-to-node — is encrypted using TLS 1.2+. Mutual TLS (mTLS) with certificate-based authentication is supported on both paths.</div>`;
  const stats = [
    { val: 'TLS 1.2+', lbl: 'Protocol' }, { val: 'mTLS', lbl: 'Auth Mode' },
    { val: 'AES-256', lbl: 'Cipher' }, { val: '0', lbl: 'Plaintext on wire' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">`;

  // Client-to-Node
  h += `<div class="sec-client-node" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div style="font-size:13px;font-weight:700;color:var(--sql-num);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Client → Node Traffic</div>`;
  h += `<div style="font-size:13px;color:var(--txt2);line-height:1.6;margin-bottom:16px;">Application drivers and admin tools connect over TLS 1.2+. Supports one-way TLS (server certificate only) or full mutual TLS where the client also presents a certificate.</div>`;
  h += `<div style="display:flex;flex-direction:column;gap:10px;">`;
  const clientPorts = [
    { port: ':5433', label: 'YSQL (PostgreSQL)', color: '#60a5fa' },
    { port: ':9042', label: 'YCQL (Cassandra)', color: '#34d399' },
    { port: ':7000', label: 'YB-Master Admin UI', color: '#a78bfa' },
    { port: ':9000', label: 'TServer Admin UI', color: '#f59e0b' },
    { port: ':7100', label: 'yb-admin (Master RPC)', color: '#a78bfa' },
    { port: ':9100', label: 'yb-ts-cli (TServer RPC)', color: '#f59e0b' },
  ];
  clientPorts.forEach(p => {
    h += `<div style="display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">`;
    h += `<span style="font-size:13px;font-family:var(--mono);color:${p.color};font-weight:700;min-width:52px;">${p.port}</span>`;
    h += `<span style="font-size:12px;color:var(--txt2);">${p.label}</span>`;
    h += `<span style="margin-left:auto;font-size:11px;background:rgba(96,165,250,0.1);color:var(--sql-num);border:1px solid rgba(96,165,250,0.2);border-radius:4px;padding:2px 7px;">TLS 1.2+</span>`;
    h += `</div>`;
  });
  h += `</div>`;
  h += `<div style="margin-top:14px;font-size:12px;color:var(--txt3);line-height:1.5;">Configure via: <code style="font-size:11px;">--use_client_to_server_encryption</code></div>`;
  h += `</div>`;

  // Node-to-Node
  h += `<div class="sec-node-node" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div style="font-size:13px;font-weight:700;color:#f43f5e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Node ↔ Node Traffic (mTLS)</div>`;
  h += `<div style="font-size:13px;color:var(--txt2);line-height:1.6;margin-bottom:16px;">All intra-cluster RPC traffic is always mutual TLS — both nodes present and verify certificates. This covers Raft replication, tablet load balancing, and master-tserver coordination.</div>`;
  h += `<div style="display:flex;flex-direction:column;gap:10px;">`;
  const nodePorts = [
    { ports: ':9100 ↔ :9100', label: 'TServer ↔ TServer (Raft RPC)', color: '#f43f5e' },
    { ports: ':7100 ↔ :9100', label: 'YB-Master ↔ TServer', color: '#f43f5e' },
    { ports: ':7100 ↔ :7100', label: 'YB-Master ↔ YB-Master (Raft)', color: '#f43f5e' },
  ];
  nodePorts.forEach(p => {
    h += `<div style="display:flex;align-items:center;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">`;
    h += `<span style="font-size:12px;font-family:var(--mono);color:${p.color};font-weight:700;min-width:108px;">${p.ports}</span>`;
    h += `<span style="font-size:12px;color:var(--txt2);">${p.label}</span>`;
    h += `<span style="margin-left:auto;font-size:11px;background:rgba(244,63,94,0.08);color:#f43f5e;border:1px solid rgba(244,63,94,0.2);border-radius:4px;padding:2px 7px;">mTLS</span>`;
    h += `</div>`;
  });
  h += `</div>`;
  h += `<div style="margin-top:14px;font-size:12px;color:var(--txt3);line-height:1.5;">Configure via: <code style="font-size:11px;">--use_node_to_node_encryption</code></div>`;
  h += `</div>`;

  h += `</div>`;

  // Certificate hierarchy
  h += `<div style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Certificate Hierarchy</div>`;
  h += `<div style="display:flex;gap:16px;flex-wrap:wrap;">`;
  const certs = [
    { title: 'Root CA', desc: 'Self-signed root certificate authority. Signs all node and client certificates. Rotated infrequently.', color: '#a78bfa' },
    { title: 'Node Certificates', desc: 'Each YB-Master and TServer gets a unique certificate signed by the Root CA. Used for mTLS on all RPC ports.', color: '#60a5fa' },
    { title: 'Client Certificates', desc: 'Issued to application clients for mutual TLS on YSQL/YCQL connections. Identifies the client to the server.', color: '#34d399' },
  ];
  certs.forEach(c => {
    h += `<div style="flex:1;min-width:160px;background:var(--bg);border:1px solid rgba(${c.color === '#a78bfa' ? '167,139,250' : c.color === '#60a5fa' ? '96,165,250' : '52,211,153'},0.2);border-radius:8px;padding:14px;">`;
    h += `<div style="font-size:13px;font-weight:700;color:${c.color};margin-bottom:6px;">${c.title}</div>`;
    h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;">${c.desc}</div>`;
    h += `</div>`;
  });
  h += `</div></div>`;

  container.innerHTML = h;
}

function _renderArchSecurityRest(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Encryption at Rest</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">YugabyteDB protects stored data using envelope encryption: each flushed SST file (and WAL segment) gets a unique Data Key (DEK) embedded in its header. The DEK is encrypted by a Universe Key (UK) maintained by YB-Masters and distributed via heartbeat — never stored on TServers in plaintext.</div>`;
  const stats = [
    { val: 'AES-256', lbl: 'Algorithm' }, { val: 'Per-file', lbl: 'DEK Scope' },
    { val: 'Universe Key', lbl: 'Key Hierarchy' }, { val: 'Zero re-enc', lbl: 'On Rotation' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // Envelope diagram
  h += `<div class="sec-dek-layer" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:22px;margin-bottom:16px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Envelope Encryption Model</div>`;
  h += `<div style="display:flex;align-items:stretch;gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">`;

  // Layer 1 — Data
  h += `<div style="flex:1;padding:16px 18px;background:rgba(96,165,250,0.05);border-right:1px solid var(--border);">`;
  h += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--sql-num);margin-bottom:8px;">Layer 1 · Data</div>`;
  h += `<div style="font-size:22px;margin-bottom:6px;">📄</div>`;
  h += `<div style="font-size:13px;font-weight:600;color:var(--txt1);margin-bottom:4px;">SST Files (Tablets)</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;">Plaintext rows on write → encrypted to disk with DEK (AES-256-CTR). Decrypted on read by the TServer in memory only.</div>`;
  h += `</div>`;

  // Arrow
  h += `<div style="display:flex;align-items:center;padding:0 8px;font-size:18px;color:var(--txt3);">🔒</div>`;

  // Layer 2 — DEK
  h += `<div style="flex:1;padding:16px 18px;background:rgba(167,139,250,0.05);border-right:1px solid var(--border);">`;
  h += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--sql-kw);margin-bottom:8px;">Layer 2 · DEK</div>`;
  h += `<div style="font-size:22px;margin-bottom:6px;">🗝️</div>`;
  h += `<div style="font-size:13px;font-weight:600;color:var(--txt1);margin-bottom:4px;">Data Encryption Key</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;">Unique per flushed SST file. Encrypted with the Universe Key and <b>embedded in the SST file header</b> (EncryptionHeaderPB). Never stored in plaintext on disk.</div>`;
  h += `</div>`;

  // Arrow
  h += `<div style="display:flex;align-items:center;padding:0 8px;font-size:18px;color:var(--txt3);">🔒</div>`;

  // Layer 3 — KMS
  h += `<div class="sec-kms-layer" style="flex:1;padding:16px 18px;background:rgba(244,63,94,0.05);">`;
  h += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#f43f5e;margin-bottom:8px;">Layer 3 · KMS</div>`;
  h += `<div style="font-size:22px;margin-bottom:6px;">🏛️</div>`;
  h += `<div style="font-size:13px;font-weight:600;color:var(--txt1);margin-bottom:4px;">Universe Key (UK)</div>`;
  h += `<div style="font-size:12px;color:var(--txt2);line-height:1.5;">Symmetric key managed by YB-Masters. Stored encrypted in the master system catalog. Distributed to TServers via heartbeat — never persisted in plaintext on any node.</div>`;
  h += `</div>`;

  h += `</div>`;
  h += `</div>`;

  // Key rotation + KMS providers
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">`;

  h += `<div style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div style="font-size:13px;font-weight:700;color:var(--sql-fn);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Key Rotation (Zero Downtime)</div>`;
  h += `<div style="font-size:13px;color:var(--txt2);line-height:1.6;margin-bottom:12px;">Universe Key rotation is a two-phase cluster operation. Only newly flushed SST files use the new key — existing files are re-encrypted lazily during compaction.</div>`;
  h += `<div style="display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--txt2);">`;
  [
    'New Universe Key received in-memory by all YB-Masters',
    'Cluster config change: Masters decrypt the existing key registry, append the new Universe Key with a new version ID, re-encrypt the registry with the new key, and persist to system catalog',
    'New version ID broadcast to TServers via heartbeat',
    'Newly flushed SST files embed the new uk_version in their EncryptionHeaderPB',
    'Older SST files retain their original uk_version — re-encrypted transparently during compaction',
    'Old Universe Key remains "in-use" (can decrypt old files) until all files are compacted'
  ].forEach((s, i) => {
    h += `<div style="display:flex;gap:8px;align-items:flex-start;"><span style="color:var(--sql-fn);font-weight:700;min-width:14px;">${i+1}.</span><span>${s}</span></div>`;
  });
  h += `</div></div>`;

  h += `<div style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div style="font-size:13px;font-weight:700;color:var(--sql-str);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Supported KMS Providers</div>`;
  const kms = [
    { name: 'AWS KMS', desc: 'Managed keys in AWS Key Management Service' },
    { name: 'HashiCorp Vault', desc: 'Self-managed secrets engine (Transit backend)' },
    { name: 'Google Cloud KMS', desc: 'GCP-managed keys via Cloud KMS API' },
    { name: 'Azure Key Vault', desc: 'Azure-managed key storage and HSM' },
    { name: 'Thales CipherTrust', desc: 'Enterprise key management via CipherTrust Manager' },
  ];
  kms.forEach(k => {
    h += `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">`;
    h += `<span style="color:var(--sql-str);font-size:14px;margin-top:1px;">◈</span>`;
    h += `<div><div style="font-size:13px;font-weight:600;color:var(--txt1);">${k.name}</div><div style="font-size:12px;color:var(--txt2);">${k.desc}</div></div>`;
    h += `</div>`;
  });
  h += `</div>`;

  h += `</div>`;

  container.innerHTML = h;
}

function _renderArchSecurityRLS(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Row Level Security (RLS)</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">YSQL supports PostgreSQL-compatible RLS policies. A policy attaches a predicate to a table that is automatically applied to every query — users see only the rows their policy allows. Zero application code changes required.</div>`;
  const stats = [
    { val: 'Per-table', lbl: 'Policy Scope' }, { val: 'Per-role', lbl: 'Granularity' },
    { val: 'Auto', lbl: 'Enforcement' }, { val: '0', lbl: 'App changes' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // Policy definition
  h += `<div class="sec-rls-policy" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Defining a Policy</div>`;
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">`;

  h += `<div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-bottom:8px;">Step 1 — Enable RLS on the table</div>`;
  h += `<div style="font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;line-height:1.7;color:var(--txt);">`;
  h += `<span style="color:var(--sql-kw);">ALTER TABLE</span> accounts<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">ENABLE ROW LEVEL SECURITY</span>;`;
  h += `</div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-top:14px;margin-bottom:8px;">Step 2 — Create an isolation policy</div>`;
  h += `<div style="font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;line-height:1.7;color:var(--txt);">`;
  h += `<span style="color:var(--sql-kw);">CREATE POLICY</span> tenant_isolation<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">ON</span> accounts<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">USING</span> (owner_id = <span style="color:var(--sql-fn);">current_user</span>());`;
  h += `</div>`;
  h += `</div>`;

  h += `<div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-bottom:8px;">Optional — command-specific policy</div>`;
  h += `<div style="font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;line-height:1.7;color:var(--txt);">`;
  h += `<span style="color:var(--sql-kw);">CREATE POLICY</span> active_read<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">ON</span> accounts<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">FOR SELECT</span><br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-kw);">USING</span> (status = <span style="color:var(--sql-str);">'active'</span>);`;
  h += `</div>`;
  h += `<div style="margin-top:14px;font-size:12px;color:var(--txt2);line-height:1.6;">The policy predicate is <b>transparently appended</b> as a WHERE clause by the query planner. The application issues a plain <code>SELECT * FROM accounts</code> and sees only its permitted rows.</div>`;
  h += `</div>`;

  h += `</div></div>`;

  // Table visualization
  h += `<div class="sec-rls-table" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Enforcement — What Each Role Sees</div>`;
  h += `<div style="overflow-x:auto;">`;
  h += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
  h += `<thead><tr>`;
  ['id', 'owner_id', 'balance', 'status', 'alice sees', 'bob sees', 'reader role sees'].forEach((col, i) => {
    const isLabel = i < 4;
    h += `<th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${i >= 4 ? (i === 4 ? '#60a5fa' : i === 5 ? '#34d399' : '#f59e0b') : 'var(--txt3)'};border-bottom:1px solid var(--border);white-space:nowrap;">${col}</th>`;
  });
  h += `</tr></thead><tbody>`;

  const rows = [
    { id: 1, owner: 'alice', balance: '$1,000', status: 'active',  alice: true,  bob: false, reader: true },
    { id: 2, owner: 'bob',   balance: '$2,000', status: 'active',  alice: false, bob: true,  reader: true },
    { id: 3, owner: 'alice', balance: '$500',   status: 'inactive',alice: true,  bob: false, reader: false },
    { id: 4, owner: 'bob',   balance: '$3,500', status: 'inactive',alice: false, bob: true,  reader: false },
  ];
  rows.forEach(r => {
    h += `<tr style="border-bottom:1px solid var(--border);">`;
    h += `<td style="padding:8px 12px;font-family:var(--mono);color:var(--txt2);">${r.id}</td>`;
    h += `<td style="padding:8px 12px;font-family:var(--mono);color:var(--txt);">${r.owner}</td>`;
    h += `<td style="padding:8px 12px;font-family:var(--mono);color:var(--txt2);">${r.balance}</td>`;
    h += `<td style="padding:8px 12px;"><span style="font-size:11px;padding:2px 8px;border-radius:4px;${r.status === 'active' ? 'background:rgba(52,211,153,0.1);color:var(--sql-fn);border:1px solid rgba(52,211,153,0.2);' : 'background:rgba(148,163,184,0.1);color:var(--txt3);border:1px solid var(--border);'}">${r.status}</span></td>`;
    [r.alice, r.bob, r.reader].forEach(v => {
      h += `<td style="padding:8px 12px;text-align:center;"><span style="font-size:15px;">${v ? '✓' : '–'}</span></td>`;
    });
    h += `</tr>`;
  });
  h += `</tbody></table></div></div>`;

  container.innerHTML = h;
}

function _renderArchSecurityColumn(container) {
  let h = '';
  h += `<div class="av-xcl-block" style="margin-bottom:16px">`;
  h += `<div class="av-xcl-title">Column Level Encryption</div>`;
  h += `<div class="av-xcl-sub" style="margin-bottom:16px">YugabyteDB supports column-level encryption via the pgcrypto extension in YSQL. Sensitive fields (PII, PCI data) are encrypted at the SQL layer using pgp_sym_encrypt(). Only callers with the correct key can decrypt — the rest of the row remains fully queryable.</div>`;
  const stats = [
    { val: 'pgcrypto', lbl: 'Extension' }, { val: 'AES / PGP', lbl: 'Algorithm' },
    { val: 'Per-column', lbl: 'Granularity' }, { val: 'Queryable', lbl: 'Other cols' }
  ];
  h += `<div class="av-stats-bar">${stats.map(s => `<div class="av-stat"><span class="av-sv">${s.val}</span><span class="av-sl">${s.lbl}</span></div>`).join('')}</div>`;
  h += `</div>`;

  // SQL examples
  h += `<div class="sec-col-encrypt" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;">`;
  h += `<div class="av-section-title" style="margin-top:0">pgcrypto Usage</div>`;
  h += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">`;

  h += `<div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-bottom:8px;">Enable extension &amp; write encrypted data</div>`;
  h += `<div style="font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;line-height:1.8;color:var(--txt);">`;
  h += `<span style="color:var(--sql-kw);">CREATE EXTENSION</span> pgcrypto;<br/><br/>`;
  h += `<span style="color:var(--sql-kw);">INSERT INTO</span> customers (name, ssn, email)<br/>`;
  h += `<span style="color:var(--sql-kw);">VALUES</span> (<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-str);">'Alice'</span>,<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-fn);">pgp_sym_encrypt</span>(<span style="color:var(--sql-str);">'123-45-6789'</span>, <span style="color:var(--sql-str);">'$KEY'</span>),<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-fn);">pgp_sym_encrypt</span>(<span style="color:var(--sql-str);">'alice@co.com'</span>, <span style="color:var(--sql-str);">'$KEY'</span>)<br/>`;
  h += `);`;
  h += `</div>`;
  h += `</div>`;

  h += `<div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-bottom:8px;">Read — decrypt only when key is supplied</div>`;
  h += `<div style="font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;line-height:1.8;color:var(--txt);">`;
  h += `<span style="color:var(--sql-kw);">SELECT</span><br/>`;
  h += `&nbsp;&nbsp;name,<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-fn);">pgp_sym_decrypt</span>(ssn::bytea, <span style="color:var(--sql-str);">'$KEY'</span>)<br/>`;
  h += `&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--sql-kw);">AS</span> ssn_plain,<br/>`;
  h += `&nbsp;&nbsp;<span style="color:var(--sql-fn);">pgp_sym_decrypt</span>(email::bytea, <span style="color:var(--sql-str);">'$KEY'</span>)<br/>`;
  h += `&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:var(--sql-kw);">AS</span> email_plain<br/>`;
  h += `<span style="color:var(--sql-kw);">FROM</span> customers <span style="color:var(--sql-kw);">WHERE</span> id = <span style="color:var(--sql-num);">1</span>;`;
  h += `</div>`;
  h += `</div>`;

  h += `</div></div>`;

  // Table visualization
  h += `<div class="sec-col-table" style="background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px;">`;
  h += `<div class="av-section-title" style="margin-top:0">Storage Layout — Encrypted vs Plaintext Columns</div>`;
  h += `<div style="overflow-x:auto;">`;
  h += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
  h += `<thead><tr>`;
  [
    { label: 'id', enc: false }, { label: 'name', enc: false }, { label: 'created_at', enc: false },
    { label: 'ssn', enc: true }, { label: 'email', enc: true }, { label: 'card_no', enc: true }
  ].forEach(col => {
    h += `<th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">`;
    h += `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:${col.enc ? '#f43f5e' : 'var(--txt3)'};">${col.label}</div>`;
    if (col.enc) h += `<div style="font-size:10px;color:#f43f5e;margin-top:2px;">🔒 encrypted</div>`;
    else h += `<div style="font-size:10px;color:var(--txt3);margin-top:2px;">plaintext</div>`;
    h += `</th>`;
  });
  h += `</tr></thead><tbody>`;

  const custRows = [
    { id: 1, name: 'Alice', date: '2024-01-15', ssn: '\\xc3057a...', email: '\\xa1f823...', card: '\\xb9e21c...' },
    { id: 2, name: 'Bob',   date: '2024-02-20', ssn: '\\xd4128b...', email: '\\x9c347f...', card: '\\xe8f12a...' },
  ];
  custRows.forEach(r => {
    h += `<tr style="border-bottom:1px solid var(--border);">`;
    h += `<td style="padding:8px 12px;font-family:var(--mono);color:var(--txt2);">${r.id}</td>`;
    h += `<td style="padding:8px 12px;color:var(--txt);">${r.name}</td>`;
    h += `<td style="padding:8px 12px;font-family:var(--mono);font-size:12px;color:var(--txt2);">${r.date}</td>`;
    [r.ssn, r.email, r.card].forEach(v => {
      h += `<td style="padding:8px 12px;font-family:var(--mono);font-size:11px;color:#f43f5e;">${v}</td>`;
    });
    h += `</tr>`;
  });
  h += `</tbody></table></div>`;
  h += `<div style="margin-top:12px;font-size:12px;color:var(--txt3);line-height:1.5;">Non-sensitive columns (<code>id</code>, <code>name</code>, <code>created_at</code>) are indexed and queryable normally. Encrypted columns store PGP-encrypted bytea — unreadable without the decryption key.</div>`;
  h += `</div>`;

  container.innerHTML = h;
}

function _renderArchSecurityAuth(container) {
  const methods = [
    {
      icon: '🔐', name: 'SCRAM-SHA-256', tag: 'Recommended',
      tagColor: '#22c55e',
      desc: 'Challenge-response password authentication. Credentials never travel in plaintext. Default for new YSQL clusters.',
      hba: 'host all all 0.0.0.0/0 scram-sha-256',
    },
    {
      icon: '🏢', name: 'LDAP / Active Directory', tag: 'Enterprise',
      tagColor: '#3b82f6',
      desc: 'Delegates credential verification to an LDAP directory (OpenLDAP, Microsoft AD). YugabyteDB performs a bind operation — passwords never stored locally.',
      hba: 'host all all 0.0.0.0/0 ldap ldapserver=ldap.corp.com ldapbasedn="dc=corp,dc=com"',
    },
    {
      icon: '🪙', name: 'OIDC / JWT', tag: 'Enterprise',
      tagColor: '#3b82f6',
      desc: 'OAuth 2.0 / OpenID Connect token-based auth. Integrates with Okta, Azure AD, Keycloak, and any JWKS-endpoint provider. Token validated server-side.',
      hba: 'host all all 0.0.0.0/0 jwt jwt_jwks_uri="https://auth.corp.com/.well-known/jwks.json"',
    },
    {
      icon: '🎟️', name: 'Kerberos (GSSAPI)', tag: 'Enterprise',
      tagColor: '#3b82f6',
      desc: 'Mutual authentication via Kerberos tickets. Zero-password SSO in Kerberos-enabled environments (MIT KDC, Active Directory KDC).',
      hba: 'host all all 0.0.0.0/0 gss include_realm=0 krb_realm=CORP.COM',
    },
    {
      icon: '📜', name: 'Certificate-based (mTLS)', tag: 'Zero-trust',
      tagColor: '#a855f7',
      desc: 'Client authenticates with an X.509 certificate. Works alongside TLS encryption — the same cert that encrypts the channel also proves identity.',
      hba: 'hostssl all all 0.0.0.0/0 cert clientcert=verify-full',
    },
  ];

  let h = `<div style="display:flex;flex-direction:column;gap:20px;padding:4px 0;">`;

  // Header
  h += `<div style="display:flex;align-items:center;gap:12px;">`;
  h += `<div style="font-size:28px;">🪪</div>`;
  h += `<div>`;
  h += `<div style="font-size:16px;font-weight:700;color:var(--txt);">Authentication Methods</div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-top:2px;">Method selection is per-connection via HBA rules in <code>pg_hba.conf</code>. YSQL and YCQL each have their own HBA configuration.</div>`;
  h += `</div></div>`;

  // Stats row
  h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">`;
  const stats = [
    { label: 'Auth Methods', value: '5', sub: 'YSQL supported' },
    { label: 'HBA Rules', value: 'Per-conn', sub: 'Fine-grained control' },
    { label: 'Standard', value: 'RFC 5802', sub: 'SCRAM-SHA-256' },
  ];
  stats.forEach(s => {
    h += `<div style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;text-align:center;">`;
    h += `<div style="font-size:18px;font-weight:700;color:var(--accent);">${s.value}</div>`;
    h += `<div style="font-size:11px;font-weight:600;color:var(--txt2);margin-top:2px;">${s.label}</div>`;
    h += `<div style="font-size:10px;color:var(--txt3);margin-top:1px;">${s.sub}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // Method cards
  h += `<div class="sec-auth-methods" style="display:flex;flex-direction:column;gap:10px;">`;
  methods.forEach(m => {
    h += `<div style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;">`;
    h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">`;
    h += `<span style="font-size:18px;">${m.icon}</span>`;
    h += `<span style="font-size:13px;font-weight:700;color:var(--txt);">${m.name}</span>`;
    h += `<span style="margin-left:auto;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:${m.tagColor}22;color:${m.tagColor};">${m.tag}</span>`;
    h += `</div>`;
    h += `<div style="font-size:12px;color:var(--txt2);margin-bottom:8px;line-height:1.5;">${m.desc}</div>`;
    h += `<div style="background:var(--canvas-bg);border:1px solid var(--border);border-radius:5px;padding:6px 10px;font-family:var(--mono);font-size:10px;color:var(--txt3);white-space:nowrap;overflow:auto;">${m.hba}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // Connection flow
  h += `<div class="sec-auth-enterprise" style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:14px;">`;
  h += `<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:10px;">Connection Authentication Flow</div>`;
  const flow = [
    { icon: '🖥️', label: 'Client connects', detail: 'TLS handshake (optional but recommended)' },
    { icon: '📋', label: 'HBA lookup', detail: 'Match on host, user, db, IP range → select method' },
    { icon: '🔑', label: 'Authenticate', detail: 'Method-specific exchange (SCRAM / LDAP bind / JWT verify / Kerberos / cert CN)' },
    { icon: '✅', label: 'Session granted', detail: 'Role privileges applied; audit log entry written' },
  ];
  flow.forEach((f, i) => {
    h += `<div style="display:flex;align-items:flex-start;gap:10px;${i < flow.length - 1 ? 'margin-bottom:8px;' : ''}">`;
    h += `<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-dim,#1e3a5f);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;">${f.icon}</div>`;
    h += `<div>`;
    h += `<div style="font-size:12px;font-weight:600;color:var(--txt);">${f.label}</div>`;
    h += `<div style="font-size:11px;color:var(--txt3);margin-top:1px;">${f.detail}</div>`;
    h += `</div></div>`;
    if (i < flow.length - 1) {
      h += `<div style="margin-left:14px;width:1px;height:8px;background:var(--border);margin-bottom:0;"></div>`;
    }
  });
  h += `</div>`;

  h += `</div>`;
  container.innerHTML = h;
}

function _renderArchSecurityAudit(container) {
  const stmtClasses = [
    { cls: 'READ',  color: '#3b82f6', desc: 'SELECT, COPY TO',                        example: 'SELECT * FROM payments' },
    { cls: 'WRITE', color: '#f59e0b', desc: 'INSERT, UPDATE, DELETE, TRUNCATE, COPY FROM', example: 'UPDATE accounts SET balance=...' },
    { cls: 'DDL',   color: '#a855f7', desc: 'CREATE, ALTER, DROP (tables, indexes, schemas, sequences)', example: 'ALTER TABLE orders ADD COLUMN...' },
    { cls: 'ROLE',  color: '#ec4899', desc: 'GRANT, REVOKE, CREATE ROLE, DROP ROLE',   example: 'GRANT SELECT ON payments TO analyst' },
    { cls: 'MISC',  color: '#6b7280', desc: 'FETCH, MOVE, VACUUM, SET',                example: 'SET search_path TO finance' },
  ];

  const complianceMap = [
    { std: 'SOC 2 Type II', reqs: 'CC6.1 · CC6.3', classes: ['DDL', 'ROLE', 'WRITE'] },
    { std: 'PCI-DSS v4',    reqs: 'Req 10.2.x',     classes: ['READ', 'WRITE', 'DDL', 'ROLE'] },
    { std: 'HIPAA',         reqs: '§ 164.312(b)',    classes: ['READ', 'WRITE', 'DDL'] },
    { std: 'ISO 27001',     reqs: 'A.12.4.1',        classes: ['DDL', 'ROLE', 'MISC'] },
  ];

  const clsColor = cls => stmtClasses.find(s => s.cls === cls)?.color || '#6b7280';

  let h = `<div style="display:flex;flex-direction:column;gap:20px;padding:4px 0;">`;

  // Header
  h += `<div style="display:flex;align-items:center;gap:12px;">`;
  h += `<div style="font-size:28px;">📋</div>`;
  h += `<div>`;
  h += `<div style="font-size:16px;font-weight:700;color:var(--txt);">Audit Logging</div>`;
  h += `<div style="font-size:12px;color:var(--txt3);margin-top:2px;">Powered by the <code>pgaudit</code> extension. Configurable at session and object level. Logs flow through PostgreSQL's standard logging infrastructure.</div>`;
  h += `</div></div>`;

  // Stats row
  h += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">`;
  [
    { label: 'Extension', value: 'pgaudit', sub: 'PostgreSQL-standard' },
    { label: 'Log levels', value: 'Session + Object', sub: 'Fine-grained targeting' },
    { label: 'Stmt classes', value: '5', sub: 'READ · WRITE · DDL · ROLE · MISC' },
  ].forEach(s => {
    h += `<div style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;text-align:center;">`;
    h += `<div style="font-size:15px;font-weight:700;color:var(--accent);">${s.value}</div>`;
    h += `<div style="font-size:11px;font-weight:600;color:var(--txt2);margin-top:2px;">${s.label}</div>`;
    h += `<div style="font-size:10px;color:var(--txt3);margin-top:1px;">${s.sub}</div>`;
    h += `</div>`;
  });
  h += `</div>`;

  // Setup
  h += `<div style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:14px;">`;
  h += `<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:8px;">Setup</div>`;
  const setupLines = [
    '-- 1. Enable via YB flag (shared_preload_libraries)',
    '--    --ysql_pg_conf_csv="shared_preload_libraries=pgaudit"',
    '',
    '-- 2. Session-level: log write + DDL + role changes',
    "SET pgaudit.log = 'write, ddl, role';",
    '',
    '-- 3. Object-level: create an audit role, grant the',
    '--    objects you want to audit, then point pgaudit at it',
    "CREATE ROLE pgaudit_role NOINHERIT;",
    "GRANT SELECT ON public.payments TO pgaudit_role;",
    "SET pgaudit.role = 'pgaudit_role';",
  ];
  h += `<div style="background:var(--canvas-bg);border:1px solid var(--border);border-radius:5px;padding:10px 12px;font-family:var(--mono);font-size:11px;color:var(--txt2);line-height:1.7;">`;
  setupLines.forEach(l => {
    if (l.startsWith('--')) h += `<div style="color:var(--txt3);">${l}</div>`;
    else if (l === '') h += `<div style="height:6px;"></div>`;
    else h += `<div>${l}</div>`;
  });
  h += `</div></div>`;

  // Statement classes
  h += `<div class="sec-audit-classes" style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:14px;">`;
  h += `<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:10px;">Statement Classes</div>`;
  h += `<div style="display:flex;flex-direction:column;gap:6px;">`;
  stmtClasses.forEach(s => {
    h += `<div style="display:flex;align-items:baseline;gap:10px;">`;
    h += `<span style="width:48px;flex-shrink:0;font-size:11px;font-weight:700;font-family:var(--mono);padding:2px 6px;border-radius:4px;background:${s.color}22;color:${s.color};">${s.cls}</span>`;
    h += `<span style="font-size:11px;color:var(--txt2);flex:1;">${s.desc}</span>`;
    h += `<span style="font-size:10px;color:var(--txt3);font-family:var(--mono);white-space:nowrap;">${s.example}</span>`;
    h += `</div>`;
  });
  h += `</div></div>`;

  // Audit record format
  h += `<div class="sec-audit-format" style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:14px;">`;
  h += `<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:8px;">Audit Record Format</div>`;
  h += `<div style="background:var(--canvas-bg);border:1px solid var(--border);border-radius:5px;padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--txt3);line-height:1.7;overflow:auto;">`;
  h += `<div style="color:var(--txt3);">-- Example pgaudit log line</div>`;
  h += `<div style="color:var(--txt2);margin-top:4px;">AUDIT: SESSION,1,1,WRITE,UPDATE,TABLE,public.accounts,</div>`;
  h += `<div style="color:var(--txt2);">&nbsp;&nbsp;"UPDATE accounts SET balance = balance - 500</div>`;
  h += `<div style="color:var(--txt2);">&nbsp;&nbsp; WHERE account_id = 42"</div>`;
  h += `</div>`;
  const fields = [
    { f: 'AUDIT_TYPE', v: 'SESSION or OBJECT' },
    { f: 'STATEMENT_ID', v: 'Monotonic counter per session' },
    { f: 'SUBSTATEMENT_ID', v: 'For nested statements' },
    { f: 'CLASS', v: 'WRITE / READ / DDL / ROLE / MISC' },
    { f: 'COMMAND', v: 'UPDATE / SELECT / ALTER TABLE …' },
    { f: 'OBJECT_TYPE', v: 'TABLE / INDEX / FUNCTION …' },
    { f: 'OBJECT_NAME', v: 'Fully-qualified name' },
    { f: 'STATEMENT', v: 'Full SQL text' },
  ];
  h += `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-top:10px;">`;
  fields.forEach(f => {
    h += `<div style="font-size:10px;font-family:var(--mono);color:var(--accent);white-space:nowrap;">${f.f}</div>`;
    h += `<div style="font-size:10px;color:var(--txt3);">${f.v}</div>`;
  });
  h += `</div></div>`;

  // Compliance mapping
  h += `<div style="background:var(--node-bg);border:1px solid var(--border);border-radius:8px;padding:14px;">`;
  h += `<div style="font-size:12px;font-weight:700;color:var(--txt);margin-bottom:10px;">Compliance Framework Mapping</div>`;
  h += `<div style="display:flex;flex-direction:column;gap:6px;">`;
  complianceMap.forEach(c => {
    h += `<div style="display:flex;align-items:center;gap:8px;">`;
    h += `<div style="width:120px;flex-shrink:0;">`;
    h += `<div style="font-size:11px;font-weight:600;color:var(--txt);">${c.std}</div>`;
    h += `<div style="font-size:10px;color:var(--txt3);margin-top:1px;">${c.reqs}</div>`;
    h += `</div>`;
    h += `<div style="display:flex;gap:4px;flex-wrap:wrap;">`;
    c.classes.forEach(cls => {
      h += `<span style="font-size:10px;font-weight:700;font-family:var(--mono);padding:2px 6px;border-radius:4px;background:${clsColor(cls)}22;color:${clsColor(cls)};">${cls}</span>`;
    });
    h += `</div></div>`;
  });
  h += `</div></div>`;

  h += `</div>`;
  container.innerHTML = h;
}

function initInfoPanelResize() {
  const handle = document.getElementById('info-resize-handle');
  const panel = document.querySelector('.info-panel');
  if (!handle || !panel) return;
  let startX, startW;
  handle.addEventListener('mousedown', e => {
    if (panel.classList.contains('collapsed')) return;
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.classList.add('dragging');
    panel.style.transition = 'none';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(e) {
      const w = Math.max(240, Math.min(680, startW + (startX - e.clientX)));
      panel.style.width = w + 'px';
    }
    function onUp() {
      handle.classList.remove('dragging');
      panel.style.transition = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(renderConnections, 50);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

function _getSidebarScenarioOrder() {
  const order = ['home'];
  const groupOrder = ["Foundations", "Deployment Architectures", "Global Universe", "xCluster", "Data Distribution", "Consistency & High Availability", "Read & Write Paths", "Scalability", "Security", "Data Management", "System Internals"];
  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });
  Object.keys(groups).forEach(g => groups[g].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)));
  groupOrder.forEach(gname => {
    if (groups[gname]) groups[gname].forEach(s => order.push(s.id));
  });
  return order;
}

window.addEventListener('load', () => {
  initTheme();
  buildSidebar();
  selectScenario('home');
  initInfoPanelResize();
  window.addEventListener('resize', () => setTimeout(renderConnections, 100));

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    if (key === 't' && !e.ctrlKey && !e.metaKey) toggleTheme();
    if (key === 'f' && !e.ctrlKey && !e.metaKey) toggleFocusMode();
    if (key === '[') toggleSidebar();
    if (key === ']') toggleInfoPanel();
    if (key === 'h') selectScenario('home');
    if (key === '?' || key === '/') toggleHelp();
    if (key === 's') stepForward();
    if (key === 'r') resetScenario();
    if (key === ' ') { e.preventDefault(); togglePlay(); }
    if (key === 'arrowup' || key === 'arrowdown') {
      e.preventDefault();
      const order = _getSidebarScenarioOrder();
      const curIdx = order.indexOf(String(currentScenario));
      if (curIdx === -1) return;
      let nextIdx = curIdx + (key === 'arrowdown' ? 1 : -1);
      if (nextIdx >= 0 && nextIdx < order.length) {
        const nextId = order[nextIdx];
        if (SCENARIOS[nextId] && SCENARIOS[nextId].isArch) selectArch(nextId);
        else selectScenario(nextId);
      }
    }
    if (key === 'g') {
      const check = document.getElementById('guide-toggle-check');
      if (check) {
        check.checked = !check.checked;
        toggleGuideSetting();
      }
    }
    if (key === 'escape') {
      const modal = document.getElementById('help-modal');
      if (modal && modal.classList.contains('active')) modal.classList.remove('active');
      closeTour();
    }
  });
});

function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  sb.classList.toggle('collapsed');
  setTimeout(renderConnections, 310);
}

function toggleInfoPanel() {
  const ip = document.querySelector('.info-panel');
  ip.classList.toggle('collapsed');
  setTimeout(renderConnections, 310);
}

function toggleFocusMode() {
  const sb = document.querySelector('.sidebar');
  const ip = document.querySelector('.info-panel');
  const body = document.body;

  const isFocus = body.classList.toggle('focus-mode');

  if (isFocus) {
    sb.classList.add('collapsed');
    ip.classList.add('collapsed');
  } else {
    sb.classList.remove('collapsed');
    ip.classList.remove('collapsed');
  }

  setTimeout(renderConnections, 310);
}
