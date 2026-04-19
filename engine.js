'use strict';
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
      Object.keys(nodeStats).sort((a,b) => a-b).forEach(nid => {
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

    function fmtHLC(t) { return t ? t.toFixed(1).split('.').join('.') : ''; }

    function buildTabletHTML(g, nodeId) {
      const rs = S.replicaState[g.id]?.[nodeId];
      const alive = S.nodes.find(n => n.id === nodeId).alive;
      const isPartitioned = S.partitioned.includes(nodeId);
      const isLdr = g.leaderNode === nodeId && alive && !isPartitioned;
      const role = !alive ? 'DEAD' : isPartitioned ? 'PARTITIONED' : isLdr ? 'LEADER' : 'FOLLOWER';
      const ti = TABLES[g.table] || { name: 'Colocated', color: '#94a3b8' };
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
        dHtml = '<div class="t-data">';

        // Header Row
        if (g.table === 'users') {
          dHtml += `<div class="d-row t-data-header ${isGeo ? 'is-geo' : ''}">
            <div class="dcell">ID</div><div class="dcell">NAME</div>${isGeo ? '<div class="dcell-reg">REG</div>' : ''}<div class="dcell-hlc">HLC</div>
          </div>`;
        }

        const combined = [...g.data.map(d => ({...d, data: d, type: 'comm'})), ... (rs?.provisionalRows || []).map(d => ({...d, data: d, type: 'prov'}))];
        const rowsToShow = combined.slice(-3);

        for (let i = 0; i < rowsToShow.length; i++) {
          const entry = rowsToShow[i];
          const row = entry.data;
          const isProv = entry.type === 'prov';
          const isN = rs?.newRows?.includes(i);
          const isR = rs?.readRow === i;

          dHtml += `<div class="d-row ${isProv ? 'provisional' : ''} ${isN ? 'r-new' : ''} ${isR ? 'r-read' : ''} ${isGeo ? 'is-geo' : ''}">`;

          if (g.isColocated) {
            const rowTable = row[5] || 'users';
            const subTi = TABLES[rowTable] || { color: '#94a3b8' };
            dHtml += `<div class="d-col-indicator" style="background:${subTi.color}"></div>`;
            dHtml += `<div class="dcell">#${row[0]}</div><div class="dcell" style="flex:1; overflow:hidden; text-overflow:ellipsis">${row[1]}</div><div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
          } else if (g.table === 'users') {
            dHtml += `<div class="dcell">${row[0]}</div><div class="dcell">${row[1]}</div>${isGeo ? `<div class="dcell dcell-reg">${row[2]}</div>` : ''}<div class="dcell-hlc">${fmtHLC(row[4])}</div>`;
          } else if (g.table === 'products') {
            dHtml += `<div class="dcell">${row[1]}</div><div class="dcell-hlc">${fmtHLC(row[3])}</div>`;
          } else if (g.table === 'users_email_idx') {
            dHtml += `<div class="dcell">${row[0]}</div><div class="dcell-hlc">${fmtHLC(row[2])}</div>`;
          } else if (g.table === 'transactions') {
             dHtml += `<div class="dcell">${row[0]}</div><div class="dcell">${row[1]}</div>`;
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
      <div class="t-name">${g.isColocated ? 'Colocated Tablet' : ti.name + '.t' + g.tnum}</div>
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
    <div class="t-top"><div class="t-colordot" style="background:${ti.color}"></div><div class="t-name">${ti.name}.t${g.tnum}</div><div class="role-badge r-${role}">${role}</div></div>
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
        reRenderTablet: (tgId, nId, markLast) => {
          if (markLast) { const g = S.groups.find(x => x.id === tgId); if (g) { const rs = S.replicaState[tgId][nId]; rs.newRows = [g.data.length - 1]; reRenderTabletInternal(tgId, nId); setTimeout(() => { rs.newRows = []; reRenderTabletInternal(tgId, nId); }, 2000); return; } }
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
            else {
              // Restore default zones (us-east-1)
              z.textContent = `us-east-1${azSuffix}`;
            }

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
        }
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

    function selectScenario(id) {
      currentScenario = id; currentStep = -1; stepRunning = false; stopPlay();
      S = freshState();
      fdReset();

      const sc = SCENARIOS[id];
      const ctx = makeCtx();

      // Reset regional visuals & hide nodes 4-9 by default BEFORE scenario init
      ctx.setCanvasRegionMode(false);
      ctx.setCanvasGeoMode(false);
      const isGeo = (sc.name === 'Geo-Partitioning');
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
      const visibleNodes = new Set(S.groups.flatMap(g => g.replicas)).size;
      document.getElementById('health-txt').textContent = `Healthy · RF=3 · ${visibleNodes} TServers · ${S.groups.length} Raft Groups`;
      document.getElementById('health-dot').style.background = 'var(--ok)';
      document.getElementById('client-box').classList.remove('active');
      document.getElementById('client-box').textContent = '⬡ YB-TServer Gateway';
      document.getElementById('ddl-sec').style.display = 'none';
      showDataPanel(false);
      showSplitPanel(false);
      renderLatencies(sc.latencies);
      renderStepIndicator(sc.steps, -1);
      renderElectionTimeline(sc, -1);
      renderTxPanel();
      clearLog();

      clearLog();

      // Show/hide failure dashboard
      const fd = document.getElementById('failure-dash');
      const isFailure = sc.failureMode;
      fd.classList.toggle('visible', !!isFailure);

      const sd = document.getElementById('scalability-dash');
      const isScaling = sc.name === 'Horizontal Scaling';
      sd.classList.toggle('visible', isScaling);

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

      document.querySelectorAll('.sidebar .sbtn').forEach((b, i) => b.classList.toggle('active', i === id));
      const has = sc.steps?.length > 0;
      document.getElementById('btn-step').disabled = !has;
      document.getElementById('btn-play').disabled = !has;

      if (sc.init) {
        try { sc.init(ctx); } catch (e) { console.error("Init failed", e); }
      }
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
      } catch(e) {
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
        li: 'ℹ', ls: '✓', lw: '⚠', le: '✕', lr: '◉', '': '·'};
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

      function renderSplitInfo(parentRange, splitPoint) {
        const viz = document.getElementById('split-viz');
        if (!viz) return;

        const matches = parentRange.match(/0x([0-9A-Fa-f]+)[–-]0x([0-9A-Fa-f]+)/);
        if (!matches) return;

        const start = parseInt(matches[1], 16);
        const end = parseInt(matches[2], 16);
        const split = parseInt(splitPoint.replace('0x', ''), 16);

        const total = end - start;
        const p1 = Math.round(((split - start) / total) * 100);
        const p2 = 100 - p1;

        const nextSplit = '0x' + (split + 1).toString(16).toUpperCase().padStart(4, '0');
        const endHex = '0x' + end.toString(16).toUpperCase().padStart(4, '0');
        const startHex = '0x' + start.toString(16).toUpperCase().padStart(4, '0');

        viz.innerHTML = `
          <div class="rs-row">
            <div class="rs-label">Parent Tablet</div>
            <div class="rs-bar-wrap">
              <div class="rs-bar rs-parent" style="width:100%">${parentRange}</div>
              <div class="rs-point" style="left:${p1}%"><span class="rs-point-lbl">Split Point: ${splitPoint}</span></div>
            </div>
          </div>
          <div class="rs-row" style="margin-top: 15px;">
            <div class="rs-label">Child Tablets</div>
            <div class="rs-bar-wrap" style="display:flex; gap:2px; background:transparent; border:none;">
              <div class="rs-bar rs-child1" style="width:${p1}%; position:relative;">${startHex}–${splitPoint}</div>
              <div class="rs-bar rs-child2" style="width:${p2}%; position:relative;">${nextSplit}–${endHex}</div>
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

        rows.sort((a,b) => {
          const valA = (typeof a.r[0] === 'number') ? a.r[0] : parseInt(a.r[0]);
          const valB = (typeof b.r[0] === 'number') ? b.r[0] : parseInt(b.r[0]);
          return valA - valB;
        });

        rows.forEach(({r, tablet, tId, isCol}) => {
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
            tr.innerHTML = r.map((c, i) => `<td style="${i===0?'color:var(--leader)':''}">${c}</td>`).join('') +
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
          if (tg) addLog(`Hash ${hashHex} falls into range ${tg.range} → users.t${tg.tnum}`, 'ls');
        } else {
          tg = S.groups.find(g => {
            const p = g.range.split(' — ');
            if (p.length === 2) return id >= parseInt(p[0]) && id <= parseInt(p[1]);
            return false;
          });
          hashHex = `${id} (Range)`;
          addLog(`PK id=${id} range lookup...`, 'li');
          if (tg) addLog(`Value ${id} falls into range [${tg.range}] → users.t${tg.tnum}`, 'ls');
        }

        if (tg) {
          const ctx = makeCtx();
          await ctx.renderHashCompute(id, hashHex, `${tg.table}.t${tg.tnum}`, tg.range);
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
        addLog(`Locating quorum for ${g.table}.t${g.tnum}...`, 'li');
        const ctx = makeCtx();
        for (const nid of g.replicas) { ctx.hlTablet(g.id, nid, nid === g.leaderNode ? 't-hl' : 't-hl2'); addLog(`${nid === g.leaderNode ? 'LEADER' : 'FOLLOWER'} on TServer-${nid}`, 'ls'); }
      }

      window.insertColocatedA = async function() {
        const tg = S.groups.find(g => g.isColocated); if (!tg) return;
        const id = 200 + Math.floor(Math.random() * 100);
        const row = [id, 'New Prod ' + id, '$' + (Math.floor(Math.random()*50)+10), '', performance.now()/1000, 'products'];
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

      window.insertColocatedB = async function() {
        const tg = S.groups.find(g => g.isColocated); if (!tg) return;
        const id = 10 + Math.floor(Math.random() * 90);
        const row = [id, 'New Cat ' + id, 'Description ' + id, '', performance.now()/1000, 'categories'];
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

      window.insertColocatedC = async function() {
        const tg = S.groups.find(g => g.isColocated); if (!tg) return;
        const id = 500 + Math.floor(Math.random() * 500);
        const name = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'][Math.floor(Math.random() * 5)];
        const row = [id, name, name.toLowerCase() + '@example.com', '', performance.now()/1000, 'customers'];
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
        if (ins) {
          const tbl = ins[1].toLowerCase(); const id = parseInt(ins[2]); const hash = hashKey(id);
          const tg = S.groups.find(g => g.table === tbl && hashInRange(hash, g.range));
          if (tg) {
            addLog(`hash(${id})=0x${hash.toString(16).toUpperCase().padStart(4, '0')} → ${tbl}.t${tg.tnum}`, '');
            const ctx = makeCtx(); ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-write', 500).then(() => { ctx.hlTablet(tg.id, tg.leaderNode, 't-hl'); addLog('Write committed ✓', 'ls'); });
          }
        } else if (sel) {
          const tbl = sel[1].toLowerCase(); const id = parseInt(sel[2]); const hash = hashKey(id);
          const tg = S.groups.find(g => g.table === tbl && hashInRange(hash, g.range));
          if (tg) {
            addLog(`hash(${id})=0x${hash.toString(16).toUpperCase().padStart(4, '0')} → ${tbl}.t${tg.tnum}`, '');
            const ctx = makeCtx(); ctx.pktClientToTablet(tg.id, tg.leaderNode, 'pk-read', 500).then(() => {
              const row = tg.data.find(r => r[0] === id);
              if (row) addLog(`Result: {${row.join(', ')}}`, 'ls'); else addLog(`Row ${id} not found`, 'lw');
              ctx.pktTabletToClient(tg.id, tg.leaderNode, 'pk-read', 400);
            });
          }
        } else addLog(`Try: SELECT * FROM users WHERE id = 4`, 'lw');
      }

      window.addEventListener('load', () => {
        selectScenario(0);
        window.addEventListener('resize', () => setTimeout(renderConnections, 100));
      });
