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
    nodeStats
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
        readRow: undefined
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

function fdKillNode3() {
  S.nodes.find(n => n.id === 3).alive = false;
  renderNodeAlive(3, false); renderAllTablets();
  addLog('TServer-3: KILLED', 'le');
  toggleBtn('btn-k3', true); toggleBtn('btn-r3', false);
  fdRenderNodes();
}
function fdReviveNode3() {
  S.nodes.find(n => n.id === 3).alive = true;
  renderNodeAlive(3, true); renderAllTablets(); setTimeout(renderConnections, 50);
  addLog('TServer-3: REVIVED', 'ls');
  toggleBtn('btn-r3', true); toggleBtn('btn-k3', false);
  fdRenderNodes();
  if (S.nodeStats[3].lagRows > 0) fdCatchUp(3);
}
function fdPartitionNode3() {
  if (!S.partitioned.includes(3)) S.partitioned.push(3);
  // Draw partition wall
  drawPartitionWall(true);
  const card = document.getElementById('node-3');
  card.classList.add('n-partitioned');
  const ov = document.createElement('div');
  ov.className = 'part-overlay'; ov.id = 'part-3';
  ov.innerHTML = '⟊ PARTITIONED';
  card.appendChild(ov);
  addLog('Network partition: TS-3 isolated', 'le');
  toggleBtn('btn-prt', true); toggleBtn('btn-heal', false);
  fdRenderNodes();
}
function fdHealPartition() {
  S.partitioned = S.partitioned.filter(n => n !== 3);
  drawPartitionWall(false);
  const card = document.getElementById('node-3');
  card.classList.remove('n-partitioned');
  document.getElementById('part-3')?.remove();
  addLog('Partition healed: TS-3 reconnected', 'ls');
  toggleBtn('btn-heal', true); toggleBtn('btn-prt', false);
  fdRenderNodes();
  if (S.nodeStats[3].lagRows > 0) fdCatchUp(3);
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
  const filter = sc?.filterTable;
  for (const g of S.groups) {
    if (filter) {
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
  const ssts = rs?.ssts || [];
  const compacting = rs?.compacting || false;

  let sstHtml = '<div class="sst-container">';
  ssts.forEach(size => {
    sstHtml += `<div class="sst-file ${compacting ? 'compacting' : ''}" style="width:${Math.min(100, size)}%"></div>`;
  });
  sstHtml += '</div>';

  const roleC = isLdr ? 't-leader' : !alive ? 't-dead' : isPartitioned ? 't-follower t-stale' : 't-follower';

  let dHtml = '';
  if (g.data?.length || rs?.provisionalRows?.length) {
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

    const combined = [...g.data.map(d => ({ ...d, data: d, type: 'comm' })), ... (rs?.provisionalRows || []).map(d => ({ ...d, data: d, type: 'prov' }))];
    const rowsToShow = combined.slice(-3);

    for (let i = 0; i < rowsToShow.length; i++) {
      const entry = rowsToShow[i];
      const row = entry.data;
      const isProv = entry.type === 'prov';
      const isN = rs?.newRows?.includes(i);
      const isR = rs?.readRow === i;

      dHtml += `<div class="d-row ${isProv ? 'provisional' : ''} ${isN ? 'r-new' : ''} ${isR ? 'r-read' : ''} ${showReg ? 'is-geo' : ''}">`;

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
  return { roleC, ti, memP, ssP, role, dHtml, sstHtml };
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
  const { roleC, ti, memP, ssP, role, dHtml, sstHtml } = buildTabletHTML(g, nodeId);
  const div = document.createElement('div');
  div.id = `tablet-${g.id}-${nodeId}`;
  div.className = `tablet ${roleC}`;
  const nodeCard = document.getElementById(`node-${nodeId}`);
  const zoneTxt = nodeCard?.querySelector('.n-zone')?.textContent || '';
  const isGeo = document.getElementById('canvas-wrap').classList.contains('geo-mode');

  div.innerHTML = `
    <div class="t-top">
      ${g.isColocated ? `
        <div class="t-colordots">
          <div class="t-colordot" style="background:${TABLES['products'].color}"></div>
          <div class="t-colordot" style="background:${TABLES['categories'].color}"></div>
        </div>
      ` : `<div class="t-colordot" style="background:${ti.color}"></div>`}
      <div class="t-name">${g.isColocated ? 'Colocated Tablet' : ti.name + '.tablet' + g.tnum}</div>
      <div class="role-badge r-${role}">${role}</div>
    </div>
    <div class="t-meta"><div class="t-range">${g.range}</div><div class="t-term">term:${g.term}</div></div>
    ${dHtml}
    <div class="lsm-box">
      <div class="lsm-title">DocDB Storage <span class="lsm-fi">Mem=${Math.round(memP)}% SST=${Math.round(ssP)}%</span></div>
      <div class="lsm-row"><div class="lsm-lbl">Mem</div><div class="lsm-track"><div class="lsm-fill lsm-mem" style="width:${memP}%"></div></div><div class="lsm-pct">${Math.round(memP)}%</div></div>
      <div class="lsm-row"><div class="lsm-lbl">SST</div><div class="lsm-track"><div class="lsm-fill lsm-ss" style="width:${ssP}%"></div></div><div class="lsm-pct">${Math.round(ssP)}%</div></div>
      ${sstHtml}
    </div>`;
  div.onclick = () => onTabletClick(g, nodeId);
  document.getElementById(`nb-${nodeId}`).appendChild(div);
}

function reRenderTabletInternal(tgId, nodeId) {
  const g = S.groups.find(x => x.id === tgId); if (!g) return;
  const el = document.getElementById(`tablet-${tgId}-${nodeId}`); if (!el) return;
  const saved = ['t-hl', 't-hl2', 't-new', 't-candidate', 't-stale', 't-syncing'].filter(c => el.classList.contains(c));
  const { roleC, ti, memP, ssP, role, dHtml, sstHtml } = buildTabletHTML(g, nodeId);
  el.className = `tablet ${roleC} ${saved.join(' ')}`;
  el.innerHTML = `
    <div class="t-top"><div class="t-colordot" style="background:${ti.color}"></div><div class="t-name">${ti.name}.tablet${g.tnum}</div><div class="role-badge r-${role}">${role}</div></div>
    <div class="t-meta"><div class="t-range">${g.range}</div><div class="t-term">term:${g.term}</div></div>
    ${dHtml}
    <div class="lsm-box">
      <div class="lsm-title">DocDB Storage <span class="lsm-fi">Mem=${Math.round(memP)}% SST=${Math.round(ssP)}%</span></div>
      <div class="lsm-row"><div class="lsm-lbl">Mem</div><div class="lsm-track"><div class="lsm-fill lsm-mem" style="width:${memP}%"></div></div><div class="lsm-pct">${Math.round(memP)}%</div></div>
      <div class="lsm-row"><div class="lsm-lbl">SST</div><div class="lsm-track"><div class="lsm-fill lsm-ss" style="width:${ssP}%"></div></div><div class="lsm-pct">${Math.round(ssP)}%</div></div>
      ${sstHtml}
    </div>`;
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
    killNode: id => { S.nodes.find(n => n.id === id).alive = false; renderNodeAlive(id, false); renderAllTablets(); },
    reviveNode: id => { S.nodes.find(n => n.id === id).alive = true; renderNodeAlive(id, true); renderAllTablets(); setTimeout(renderConnections, 50); },
    reRenderTablet: (tgId, nId, markRow) => {
      if (markRow !== undefined && markRow !== false) {
        const g = S.groups.find(x => x.id === tgId);
        if (g) {
          const rs = S.replicaState[tgId][nId];
          const dataIdx = (markRow === true) ? g.data.length - 1 : markRow;
          const start = Math.max(0, g.data.length - 3);
          const sliceIdx = dataIdx - start;
          rs.newRows = (sliceIdx >= 0 && sliceIdx < 3) ? [sliceIdx] : [];
          reRenderTabletInternal(tgId, nId);
          setTimeout(() => { rs.newRows = []; reRenderTabletInternal(tgId, nId); }, 2000);
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

  const groupOrder = ["Architecture Concepts", "Architecture", "Sharding", "Write & Read Paths", "Global & High Availability", "Horizontal Scalability", "Geo-distribution", "Storage & Scalability", "Multi-Cluster & DR"];
  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });

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

  const gridWrap = document.createElement('div');
  gridWrap.className = 'home-sections-grid';

  const groupOrder = [
    "Architecture Concepts",
    "Architecture",
    "Sharding",
    "Write & Read Paths",
    "Global & High Availability",
    "Horizontal Scalability",
    "Geo-distribution",
    "Storage & Scalability",
    "Multi-Cluster & DR"
  ];
  const groupMeta = {
    "Architecture Concepts": { chapter: "CHAPTER 1", icon: "⚙️", desc: "Internal building blocks: Layers, Raft, and Distributed Time." },
    "Architecture": { chapter: "CHAPTER 2", icon: "🌐", desc: "Global deployment patterns and multi-cluster topologies." },
    "Sharding": { chapter: "CHAPTER 3", icon: "📦", desc: "Data distribution strategies for scale and performance." },
    "Write & Read Paths": { chapter: "CHAPTER 4", icon: "⚡", desc: "How requests flow through the distributed Raft layers." },
    "Global & High Availability": { chapter: "CHAPTER 5", icon: "🌎", desc: "Resilience, election, and multi-region patterns." },
    "Horizontal Scalability": { chapter: "CHAPTER 6", icon: "📈", desc: "Elastic scale-out and automatic data rebalancing." },
    "Geo-distribution": { chapter: "CHAPTER 7", icon: "📍", desc: "Multi-region clusters, data pinning, and leader preference." },
    "Storage & Scalability": { chapter: "CHAPTER 8", icon: "🗄️", desc: "Compaction, and storage internals." },
    "Multi-Cluster & DR": { chapter: "CHAPTER 9", icon: "🔁", desc: "Disaster recovery and active-active replication." }
  };

  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });

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
  fdCatchingUp = {};  // Cancel pending catch-up promises

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
  document.getElementById('client-box').textContent = '⬡ YB-TServer Gateway';
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

  const mrp = document.getElementById('mr-lat-panel');
  if (mrp) { mrp.style.display = ''; mrp.classList.toggle('visible', sc.name === 'Multi-Region'); }

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
  addLog(`▶ Step ${currentStep + 1}: ${lbl}`, 'li');
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
//  LOG
// ════════════════════════════════════════════
function addLog(msg, type = '') {
  logTime++;
  const icons = {
    li: 'ℹ', ls: '✓', lw: '⚠', le: '✕', lr: '◉', '': '·'
  };
  const el = document.createElement('div'); el.className = `log-entry ${type}`;
  el.innerHTML = `<div class="log-time">${String(logTime).padStart(3, '0')}</div><div class="log-icon">${icons[type] || '·'}</div><div class="log-msg">${msg}</div>`;
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
  for (const sst of (db.ssts || [])) {
    allLayers.push({ name: sst.name, badge: 'on-disk · immutable', entries: sst.entries, cls: 'dl-sst' });
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
        const typeCls = e.type === 'TOMBSTONE' ? 'dt-tombstone' : 'dt-write';
        const valHtml = e.type === 'TOMBSTONE'
          ? '<span class="de-val de-tomb">— deleted —</span>'
          : `<span class="de-val">${e.value || ''}</span>`;
        row.innerHTML = `<span class="de-key">${e.display}</span><span class="de-type-col ${typeCls}">${e.type}</span><span class="de-hlc">@${e.hlc}</span>${valHtml}`;
        div.appendChild(row);
      }
    }
    wrap.appendChild(div);
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
  el.innerHTML = `
          <div class="hrm-hdr">
            <span>Tablet</span><span>Hash Range</span><span>Leader</span>
          </div>
          ${groups.map(g => {
    const hit = targetTg && g.id === targetTg.id;
    return `<div class="hrm-row${hit ? ' hrm-hit' : ''}">
              <span class="hrm-name">tablet${g.tnum}</span>
              <span class="hrm-range">${g.range}</span>
              <span class="hrm-leader">N${g.leaderNode}</span>
              ${hit ? '<span class="hrm-ptr">◄</span>' : '<span></span>'}
            </div>`;
  }).join('')}`;
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
  const n2 = S.nodes[1]; n2.alive = !n2.alive; renderNodeAlive(2, n2.alive); renderAllTablets();
  const btn = document.getElementById('btn-tn'); if (btn) btn.textContent = n2.alive ? '💀 Kill Near Follower' : '✅ Revive Near Follower';
  addLog(`TServer-2: ${n2.alive ? 'REVIVED' : 'KILLED'}`, n2.alive ? 'ls' : 'le');
}
async function blacklistDrainNode() {
  if (stepRunning) return;
  stepRunning = true;
  const ctx = makeCtx();
  addLog('YB-Master: Blacklist/Drain TServer-2 initiated', 'li');
  addLog('TS-2: received BlacklistNode RPC — beginning graceful drain', 'lw');
  await ctx.delay(500);
  const ts2Leaders = S.groups.filter(g => g.leaderNode === 2);
  addLog('TS-2: leader for ' + ts2Leaders.map(g => g.id).join(', ') + ' — initiating LeaderStepDown', 'lr');
  await ctx.delay(300);
  const targets = [1, 3]; let ti = 0;
  for (const g of ts2Leaders) {
    const targetNode = targets[ti % targets.length]; ti++;
    addLog('TS-2→TS-' + targetNode + ': LeaderStepDown(' + g.id + ') — graceful transfer', 'lr');
    await ctx.pktTabletToTablet(g.id, 2, g.id, targetNode, 'pk-vote', 500);
    S.term = 5; g.leaderNode = targetNode; g.term = 5;
    document.getElementById('term-display').textContent = 'Raft Term: 5';
    ctx.setRole(g.id, targetNode, 'LEADER');
    ctx.hlTablet(g.id, targetNode, 't-hl');
    addLog('TS-' + targetNode + ': accepted leadership ' + g.id + ' (term=5) ✓', 'ls');
    await ctx.delay(300);
  }
  addLog('TS-2: all leader tablets transferred — drain complete', 'ls');
  addLog('TS-2: marked BLACKLISTED — no new tablets assigned', 'lw');
  const card = document.getElementById('node-2');
  card.style.opacity = '0.5'; card.style.borderColor = 'var(--warn)';
  const ind = card.querySelector('.n-indicator');
  ind.style.background = 'var(--warn)'; ind.style.animation = 'none';
  renderAllTablets();
  addLog('Leadership balanced: ' + S.groups.filter(g => g.leaderNode === 1).map(g => g.id).join(',') + '→TS-1, ' + S.groups.filter(g => g.leaderNode === 3).map(g => g.id).join(',') + '→TS-3', 'ls');
  document.getElementById('health-txt').textContent = '⚠️ TS-2 Blacklisted · leaders distributed to TS-1 & TS-3';
  toggleBtn('btn-bl', true);
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
let _archLeaderPref = -1; // -1=balanced, 0/1/2=preferred FD index

function _archEffectiveLeader(tablet) {
  const getFD = (nid) => ARCH_FDS.findIndex(fd => fd.nodes.includes(nid));
  let targetFD = _archLeaderPref;
  if (targetFD === -1) {
    if (_archFailedFD !== -1 && getFD(tablet.leader) === _archFailedFD)
      return tablet.replicas.find(n => getFD(n) !== _archFailedFD) ?? tablet.leader;
    return tablet.leader;
  }
  if (targetFD === _archFailedFD) {
    const survFDs = [0, 1, 2].filter(x => x !== _archFailedFD);
    targetFD = survFDs[ARCH_TABLETS.indexOf(tablet) % 2];
  }
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
    tgl.style.transform = 'rotate(0deg)';
  } else {
    el.style.display = 'none';
    tgl.textContent = '▶';
    tgl.style.transform = 'rotate(-90deg)'; // if I want smooth animation, or just text content is fine
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
  _archLeaderPref = (_archLeaderPref === fi) ? -1 : fi;
  document.querySelectorAll('.av-lp-btn').forEach(btn => {
    const bfi = parseInt(btn.dataset.fd);
    if (isNaN(bfi)) return; // Skip view mode buttons
    const isActive = bfi === _archLeaderPref;
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
}

function selectArch(tab) {
  currentScenario = tab;
  buildSidebar();
  scrollSidebarToActive();
  _exitArchMode(false);
  showDataPanel(false); showSplitPanel(false); showDocdbPanel(false);
  const av = document.getElementById('arch-view');
  if (!av) return;
  av.style.display = 'flex';
  const badgeMap = { 'universe-hierarchy': 'Architecture · Universe', universe: 'Architecture · Global Universe', xcl: 'Architecture · xCluster', 'read-replica': 'Architecture · Read Replica', 'fault-domains': 'Architecture · Fault Domains', consensus: 'Architecture · Consensus Quorum' };
  const titleMap = { 'universe-hierarchy': 'Universe Hierarchy', universe: 'Global Universe Architecture', xcl: 'xCluster Topology', 'read-replica': 'Read Replica Topology', 'fault-domains': 'Fault Domains', consensus: 'Consensus (Raft) Quorum' };
  document.getElementById('active-badge').textContent = badgeMap[tab] || tab;
  document.getElementById('i-title').textContent = titleMap[tab] || tab;
  _archFailedFD = -1;
  _archLeaderPref = -1;
  _archViewMode = 'zone';
  ARCH_FDS = [...ARCH_FDS_MODES.zone];
  av.innerHTML = '';
  if (tab === 'universe') _renderArchUniverse(av);
  else if (tab === 'universe-hierarchy') _renderArchUniverseHierarchy(av);
  else if (tab === 'consensus') _renderArchConsensus(av);
  else if (tab === 'control-plane') _renderArchControlPlane(av);
  else if (tab === 'hybrid-time') _renderArchHybridTime(av);
  else if (tab === 'read-replica') _renderArchReadReplica(av);
  else if (tab === 'fault-domains') _renderArchFaultDomains(av);
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
    const isActive = _archLeaderPref === i;
    h += `<button class="av-lp-btn${isActive ? ' active' : ''}" data-fd="${i}" onclick="archSetLeaderPref(${i})" style="border-color:${fc}55;color:${fc}${isActive ? `;background:${fc};color:#0f172a` : ''}">◎ Fault Domain ${i + 1}</button>`;
  }
  const balActive = _archLeaderPref === -1;
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
  if (_archLeaderPref === fi) {
    const survFDs = [0, 1, 2].filter(x => x !== fi).map(x => x + 1);
    prefNote = ` &nbsp;·&nbsp; <strong>Preferred FD down</strong> — leaders balanced across FD ${survFDs[0]} &amp; FD ${survFDs[1]}`;
  } else if (_archLeaderPref !== -1) {
    prefNote = ` &nbsp;·&nbsp; Leaders remain pinned to <strong>Fault Domain ${_archLeaderPref + 1}</strong>`;
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
  function miniCluster(label, region, cls) {
    let h = `<div class="av-xcl-cluster" style="display:flex;flex-direction:column">`;
    h += `<div class="av-xcl-hdr ${cls}">${label}<span class="av-xcl-region">${region}</span></div>`;
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
  h += miniCluster('PRIMARY', 'ap-south-1', 'av-xcl-primary');
  h += midSection('CDC Pollers', pollers, 'RPO ≈ seconds · async WAL · ordered delivery', false);
  h += miniCluster('SECONDARY', 'us-east-1', 'av-xcl-secondary');
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
  h += miniCluster('CLUSTER S1', 'ap-south-1', 'av-xcl-primary');
  h += midSection('Bidirectional Pollers', pollers, 'LWW by HLC · no cross-tablet ordering', true);
  h += miniCluster('CLUSTER S2', 'eu-central-1', 'av-xcl-primary');
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
  h += `<div style="font-size:13.5px;color:var(--txt);line-height:1.65">A <b>fault/failure domain (fd)</b> is a group of nodes that share a common failure mode — power, switch, zone, or region. When one node in the domain fails, all nodes in that domain may be affected simultaneously. It is any shared failure boundary — a node, a rack, an availability zone, a region, or a cloud provider. A failure of 1 FD not necessarily affect the others.</div>`;
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
      `Leadership is <b>per-tablet (Raft group)</b>, not per-node · Each node holds all 3 replicas but leads a <em>different</em> shard · <span style="color:#f59e0b">◎ t1 on Node 1</span> · <span style="color:#60a5fa">◎ t2 on Node 2</span> · <span style="color:#34d399">◎ t3 on Node 3</span>`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-rack · Each rack is an independent failure boundary · <span style="color:#f59e0b">◎ t1 in Rack 1</span> · <span style="color:#60a5fa">◎ t2 in Rack 2</span> · <span style="color:#34d399">◎ t3 in Rack 3</span> · even 4 nodes/rack · odd 3 racks`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-AZ · A zone outage loses only one replica · <span style="color:#f59e0b">◎ t1 in AZ-a</span> · <span style="color:#60a5fa">◎ t2 in AZ-b</span> · <span style="color:#34d399">◎ t3 in AZ-c</span> · odd 3 nodes/AZ · odd 3 AZs`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-region · A region outage loses only one replica — quorum survives · <span style="color:#f59e0b">◎ t1 us-east-1</span> · <span style="color:#60a5fa">◎ t2 eu-west-1</span> · <span style="color:#34d399">◎ t3 ap-south-1</span>`,
      `Leadership is <b>per-tablet (Raft group)</b>, not per-cloud · An entire cloud outage loses only one replica — quorum survives · <span style="color:#f59e0b">◎ t1 AWS</span> · <span style="color:#60a5fa">◎ t2 GCP</span> · <span style="color:#34d399">◎ t3 Azure</span>`,
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
  function uhNode(icon, cls, nameHtml, metaHtml, hasChildren) {
    const id = `uh-c-${_uhId++}`;
    let s = `<div class="uh-node ${cls}" ${hasChildren ? `onclick="uhToggle('${id}')" style="cursor:pointer"` : ''}>`;
    if (hasChildren) s += `<div class="uh-toggle" id="uh-t-${id}">▼</div>`;
    s += `<div class="uh-icon">${icon}</div><div class="uh-info"><div class="uh-name">${nameHtml}</div><div class="uh-meta">${metaHtml}</div></div></div>`;
    if (hasChildren) s += `<div class="uh-children" id="${id}">`;
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
      out += uhNode('🗄️', `uh-database" style="border-left-color:${db.color}`, `${db.api === 'YCQL' ? 'Keyspace' : 'Database'}: <span class="uh-val">${db.name}</span> <span class="uh-badge" style="background:${db.color}22;color:${db.color};border-color:${db.color}44">${db.api}</span>`, db.api === 'YSQL' ? 'PostgreSQL-compatible · supports schemas, roles, functions' : 'Cassandra-compatible · keyspace = database equivalent', true);

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
            out += `<span class="uh-tablet-chip uh-tc-f" style="border-color:#a78bfa;color:#a78bfa">○</span><span class="uh-tablet-chip uh-tc-f" style="border-color:#a78bfa;color:#a78bfa">○</span><span class="uh-tablet-lbl">observer×2</span>`;
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
            out += `<span class="uh-tablet-chip uh-tc-f" style="border-color:#a78bfa;color:#a78bfa">○</span><span class="uh-tablet-chip uh-tc-f" style="border-color:#a78bfa;color:#a78bfa">○</span><span class="uh-tablet-lbl">observer×2</span>`;
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

  // Tablet detail section
  h += `<div class="av-section-title">Tables & Indexes → Tablets (Sharding)</div>`;
  h += `<div class="uh-tablet-detail">`;
  h += `<div class="uh-td-left">`;
  h += `<div class="uh-td-title">How Tables Become Tablets</div>`;
  h += `<div class="uh-td-text">Every table and index in YugabyteDB is automatically sharded into <b>tablets</b>. Each tablet is a Raft group with one leader and RF−1 followers, distributed across fault domains.</div>`;
  h += `<div class="uh-td-flow">`;
  h += `<div class="uh-td-step"><div class="uh-td-step-num">1</div><div>CREATE TABLE users (...)</div></div>`;
  h += `<div class="uh-td-arrow">→</div>`;
  h += `<div class="uh-td-step"><div class="uh-td-step-num">2</div><div>Hash/Range Sharding splits key space</div></div>`;
  h += `<div class="uh-td-arrow">→</div>`;
  h += `<div class="uh-td-step"><div class="uh-td-step-num">3</div><div>Tablets created (default: based on node count)</div></div>`;
  h += `<div class="uh-td-arrow">→</div>`;
  h += `<div class="uh-td-step"><div class="uh-td-step-num">4</div><div>Each tablet → RF replicas across fault domains</div></div>`;
  h += `</div></div>`;
  h += `<div class="uh-td-right">`;
  h += `<div class="uh-td-example">`;
  h += `<div class="uh-td-ex-title">Example: users table (Hash, 3 tablets, RF=3)</div>`;
  const tabletEx = [
    { name: 'users.tablet1', range: '0x0000–0x54FF', leader: 'Node 1', followers: 'Node 4, Node 7', color: '#f59e0b' },
    { name: 'users.tablet2', range: '0x5500–0xA9FF', leader: 'Node 5', followers: 'Node 2, Node 8', color: '#60a5fa' },
    { name: 'users.tablet3', range: '0xAA00–0xFFFF', leader: 'Node 9', followers: 'Node 3, Node 6', color: '#34d399' },
  ];
  tabletEx.forEach(t => {
    h += `<div class="uh-td-tablet" style="border-left:3px solid ${t.color}">`;
    h += `<div class="uh-td-t-name" style="color:${t.color}">${t.name}</div>`;
    h += `<div class="uh-td-t-range">${t.range}</div>`;
    h += `<div class="uh-td-t-replicas"><span class="uh-td-t-l">◉ ${t.leader}</span> <span class="uh-td-t-f">○ ${t.followers}</span></div>`;
    h += `</div>`;
  });
  h += `</div></div>`;
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

  // ── Section 2: Write Flow ──
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

  // ── Section 3: Heartbeats & Leader Leases ──
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
  h += `<div class="cq-ed-replica" style="border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.05);"><div class="cq-ed-icon" style="color:#f59e0b">◉</div><div class="cq-ed-role" style="color:#f59e0b">LEADER</div><div class="cq-ed-node">Tablet 1 → Node 1</div><div class="cq-ed-status" style="color:var(--txt);font-weight:400;margin-top:6px;">Lease Valid ⏳</div></div>`;
  h += `<div class="cq-ed-mid"><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow" style="color:#f59e0b">Heartbeat (500ms) →</span></div><div class="cq-ed-vote-line"><span class="cq-ed-vote-arrow" style="color:var(--ok)">← ACK</span></div></div>`;
  h += `<div class="cq-ed-replica" style="border-color:rgba(96,165,250,.3);"><div class="cq-ed-icon" style="color:#60a5fa">○</div><div class="cq-ed-role">FOLLOWER</div><div class="cq-ed-node">Tablet 1 → Node 4</div><div class="cq-ed-status" style="color:var(--txt2);font-weight:400;margin-top:6px;">Timer Reset ⏱</div></div>`;
  h += `<div class="cq-ed-replica" style="border-color:rgba(52,211,153,.3);"><div class="cq-ed-icon" style="color:#34d399">○</div><div class="cq-ed-role">FOLLOWER</div><div class="cq-ed-node">Tablet 1 → Node 7</div><div class="cq-ed-status" style="color:var(--txt2);font-weight:400;margin-top:6px;">Timer Reset ⏱</div></div>`;
  h += `</div>`;
  h += `</div>`;

  // ── Section 4: Leader Election ──
  h += `<div class="av-section-title">Leader Election — Automatic Failover</div>`;
  h += `<div class="cq-election">`;

  const electionSteps = [
    { num: '1', title: 'Leader Fails', desc: 'Leader stops sending heartbeats', icon: '💀', color: 'var(--err)' },
    { num: '2', title: 'Election Timeout', desc: 'Follower\'s heartbeat timer expires (150–300ms randomized)', icon: '⏱', color: '#f59e0b' },
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
  h += `<div class="cq-ed-replica cq-ed-voter"><div class="cq-ed-icon" style="color:#60a5fa">○</div><div class="cq-ed-role">VOTER</div><div class="cq-ed-node">Tablet 1 → Node 7 (FD-3)</div><div class="cq-ed-status">GRANTED VOTE</div></div>`;
  h += `</div>`;

  // Quorum math
  h += `<div class="cq-quorum-math">`;
  h += `<div class="cq-qm-title">Quorum Requirement</div>`;
  h += `<div class="cq-qm-formula">Quorum = ⌊RF / 2⌋ + 1 = ⌊3 / 2⌋ + 1 = <strong>2 of 3</strong></div>`;
  h += `<div class="cq-qm-result">Tablet 1 on Node 4 (self-vote) + Tablet 1 on Node 7 (granted) = <span style="color:var(--ok);font-weight:700">2/3 = Majority ✓</span></div>`;
  h += `</div>`;

  h += `</div>`;

  // ── Section 4: Key Raft Properties ──
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
  h += `<div style="font-size:24px;font-family:var(--mono);color:#a78bfa;font-weight:bold;">1682782390123</div>`;
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
  const groupOrder = ["Architecture Concepts", "Architecture", "Sharding", "Write & Read Paths", "Global & High Availability", "Horizontal Scalability", "Geo-distribution", "Storage & Scalability", "Multi-Cluster & DR"];
  const groups = {};
  Object.keys(SCENARIOS).forEach(id => {
    if (id === 'home') return;
    const s = SCENARIOS[id];
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push({ id, ...s });
  });
  groupOrder.forEach(gname => {
    if (groups[gname]) groups[gname].forEach(s => order.push(s.id));
  });
  return order;
}

window.addEventListener('load', () => {
  buildSidebar();
  selectScenario('home');
  initInfoPanelResize();
  window.addEventListener('resize', () => setTimeout(renderConnections, 100));

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    if (key === 'f') toggleFocusMode();
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
  setTimeout(renderConnections, 310); // After transition
}

function toggleInfoPanel() {
  const ip = document.querySelector('.info-panel');
  ip.classList.toggle('collapsed');
  setTimeout(renderConnections, 310); // After transition
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
