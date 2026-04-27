'use strict';
let currentScenarioId = null, currentScenario = null, scenarioState = {};
let queryStepIndex = 0, queryPlaying = false;
let scanState = null;

document.addEventListener('DOMContentLoaded', () => {
    buildSidebar();
    initTabs();
    initKeyboardShortcuts();
    selectScenario('home');
});

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        if (!isInput) {
            if (e.key === '[' || e.key.toLowerCase() === 'f') {
                document.body.classList.toggle('focus-mode');
            }
            if (e.key.toLowerCase() === 'h') {
                selectScenario('home');
            }
            if (e.key === '?' || e.key === '/') {
                toggleHelp();
            }
            if (e.key === 'Escape') {
                const modal = document.getElementById('help-modal');
                if (modal && modal.classList.contains('active')) {
                    modal.classList.remove('active');
                }
                closeTour();
            }
            if (e.key.toLowerCase() === 'g') {
                const check = document.getElementById('guide-toggle-check');
                if (check) {
                    check.checked = !check.checked;
                    toggleGuideSetting();
                }
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const btns = [...document.querySelectorAll('#sidebar .sbtn')];
                const activeIdx = btns.findIndex(b => b.classList.contains('active'));
                const delta = e.key === 'ArrowDown' ? 1 : -1;
                const next = btns[activeIdx + delta];
                if (next) {
                    const id = next.dataset.id || 'home';
                    selectScenario(id);
                    e.preventDefault();
                }
            }
        }
    });
}

let guideEnabled = false;

function toggleHelp() {
    const modal = document.getElementById('help-modal');
    if (modal) modal.classList.toggle('active');
}

window.toggleGuideSetting = function() {
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

window.closeTour = function() {
    const guide = document.getElementById('tour-guide');
    if (guide) guide.classList.remove('active');
}

function buildSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.innerHTML = '';

    const homeBtn = document.createElement('button');
    homeBtn.className = 'sbtn' + (currentScenarioId === 'home' ? ' active' : '');
    homeBtn.onclick = () => selectScenario('home');
    homeBtn.innerHTML = `
        <span class="sicon">🏠</span>
        <div>
            <div class="slabel">Explorer Home</div>
            <div class="ssub">Scenario Overview</div>
        </div>
    `;
    sb.appendChild(homeBtn);

    let lastGroup = '';
    for (const [id, s] of Object.entries(SCENARIOS)) {
        if (id === 'home') continue;
        if (s.group !== lastGroup) {
            lastGroup = s.group;
            const g = document.createElement('div');
            g.className = 'sgroup';
            g.textContent = s.group;
            sb.appendChild(g);
        }
        const btn = document.createElement('button');
        btn.className = 'sbtn' + (currentScenarioId === id ? ' active' : '');
        btn.dataset.id = id;
        btn.innerHTML = `<span class="sicon">${s.icon||'📄'}</span><div><div class="slabel">${s.title}</div><div class="ssub">${s.subtitle||''}</div></div>`;
        btn.onclick = () => selectScenario(id);
        sb.appendChild(btn);
    }
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
        };
    });
}

function scrollSidebarToActive() {
    setTimeout(() => {
        const active = document.querySelector('.sidebar .sbtn.active');
        const sb = document.getElementById('sidebar');
        if (active && sb) {
            const top = active.offsetTop;
            const target = top - (sb.clientHeight / 2) + (active.clientHeight / 2);
            sb.scrollTo({ top: target, behavior: 'smooth' });
        }
    }, 200);
}

function selectScenario(id) {
    currentScenarioId = id;
    currentScenario = SCENARIOS[id];
    buildSidebar();
    scrollSidebarToActive();

    if (!currentScenario) return;
    queryStepIndex = 0;
    queryPlaying = false;

    document.getElementById('scenario-title').textContent = currentScenario.title;
    document.getElementById('scenario-desc').innerHTML = currentScenario.description;
    const activeScenarioBadge = document.getElementById('active-scenario-badge');
    if (activeScenarioBadge) activeScenarioBadge.textContent = currentScenario.group;
    const sqlDisplay = document.getElementById('sql-display');
    if (sqlDisplay) sqlDisplay.innerHTML = currentScenario.guide?.richSql || '';
    scenarioState = JSON.parse(JSON.stringify(currentScenario.initialState || {}));

    const isHome = currentScenario.visual?.type === 'home';
    const hv = document.getElementById('home-view');
    const simControls = document.getElementById('sim-controls');

    if (hv) {
        hv.style.display = isHome ? 'block' : 'none';
        if (isHome) renderHome(hv);
    }

    document.getElementById('scenario-info').style.display = isHome ? 'none' : 'block';
    const tabs = document.querySelector('.tabs-container');
    if (tabs) tabs.style.display = isHome ? 'none' : 'flex';
    document.getElementById('key-legend').style.display = isHome ? 'none' : 'flex';
    if (simControls) simControls.style.display = isHome ? 'none' : 'block';

    const content = document.getElementById('content');
    if (content) content.style.display = isHome ? 'none' : 'flex';

    scanState = null;

    if (!isHome) {
        const isQueryExec = currentScenario.visual?.type === 'query-exec';
        if (isQueryExec) {
            const qc = currentScenario.queryConfig;
            const totalSteps = qc.steps.length;
            simControls.innerHTML = `
                <div class="control-group" style="width: 100%;">
                    <label>Query:</label>
                    <div class="query-display">${qc.sql}</div>
                    <div class="query-controls">
                        <button class="step-btn" id="qe-step-btn" onclick="runQueryStep()">⏭ Step</button>
                        <button class="play-btn" id="qe-play-btn" onclick="runAllSteps()">▶ Play All</button>
                        <button class="secondary-btn reset-btn" onclick="resetQuery()">↺ Reset</button>
                        <span class="step-counter" id="qe-step-counter">0 / ${totalSteps}</span>
                    </div>
                </div>
                <div id="sim-feedback"></div>
            `;
        } else {
            const vtype = currentScenario.visual?.type;
            const scanSupported = vtype === 'sharding-view' || vtype === 'index-mapping';
            const scanDefault = currentScenario.scanDefault || '';
            simControls.innerHTML = `
                <div class="control-group">
                    <label>Simulate Insert:</label>
                    <div class="input-row">
                        <input type="text" id="sim-input-val" placeholder="${currentScenario.inputPlaceholder || 'Value...'}">
                        <button class="primary-btn" onclick="simulateInsert()">Insert Row</button>
                        <button class="secondary-btn" onclick="autoInsert()">⚡ Auto Generate</button>
                        <button class="secondary-btn reset-btn" onclick="resetScenario()">↺ Reset</button>
                    </div>
                </div>
                ${scanSupported ? `<div class="control-group scan-group">
                    <label>Scan Query:</label>
                    <div class="input-row">
                        <span class="scan-prefix">WHERE</span>
                        <input type="text" id="scan-input-val" value="${scanDefault}" placeholder="${scanDefault || 'e.g. price BETWEEN 20 AND 80'}">
                        <button class="secondary-btn" onclick="runScan()">▶ Run Scan</button>
                        <button class="secondary-btn reset-btn" id="scan-clear-btn" onclick="clearScan()" style="display:none">✕ Clear</button>
                    </div>
                </div>` : ''}
                <div id="sim-feedback"></div>
            `;
        }
    }

    const feedback = document.getElementById('sim-feedback');
    if (feedback) feedback.textContent = '';
    renderLegend();
    renderVisual();
    renderTour(currentScenario);
}

window.resetScenario = function() {
    if (!currentScenario) return;
    scanState = null;
    scenarioState = JSON.parse(JSON.stringify(currentScenario.initialState || {}));
    const simInput = document.getElementById('sim-input-val');
    if (simInput) simInput.value = '';
    const scanInput = document.getElementById('scan-input-val');
    if (scanInput) scanInput.value = currentScenario.scanDefault || '';
    const clearBtn = document.getElementById('scan-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const feedback = document.getElementById('sim-feedback');
    if (feedback) { feedback.className = ''; feedback.textContent = 'Reset to initial state'; feedback.className = 'active'; }
    renderVisual();
};

function renderLegend() {
    const el = document.getElementById('key-legend');
    const legend = currentScenario.legend;
    if (!legend || !legend.length) { el.innerHTML = ''; return; }
    el.innerHTML = legend.map(l => `<div class="legend-item"><div class="legend-dot ${l.type}"></div><div><span class="legend-desc">${l.label}</span><span class="legend-explain"> — ${l.explain}</span></div></div>`).join('');
}

function renderVisual() {
    const area = document.getElementById('visual-render-area');
    const feedback = document.getElementById('sim-feedback');
    if (!area) return;
    area.innerHTML = '';

    if (feedback) {
        if (feedback.innerHTML.trim() || feedback.textContent.trim()) {
            feedback.classList.add('active');
        } else {
            feedback.classList.remove('active');
        }
    }

    const v = currentScenario.visual;
    if (!v) return;
    if (v.type === 'home') return;
    renderArchitectureDiagram(area, v);
    if (v.type === 'sharding-view') renderShardingView(area, v);
    else if (v.type === 'data-org') renderDataOrg(area);
    else if (v.type === 'index-mapping') renderIndexMapping(area, v);
    else if (v.type === 'partitioning') renderPartitioning(area, v);
    else if (v.type === 'partition-index') renderPartitionIndex(area, v);
    else if (v.type === 'colocated') renderColocated(area, v);
    else if (v.type === 'query-exec') renderQueryExecution(area, v);
}

/* ═══ COLOCATED TABLES VIEW ═══ */
function renderColocated(container, v) {
    const wrap = document.createElement('div');
    wrap.className = 'idx-section';
    wrap.innerHTML = `<div class="idx-section-title" style="color:var(--accent)">▸ Shared Physical Tablet</div>`;

    const grid = document.createElement('div');
    grid.className = 'tablet-grid';
    grid.appendChild(buildTabletCard(scenarioState.tablet, v.columns, 'accent'));
    wrap.appendChild(grid);
    container.appendChild(wrap);

    scenarioState.tablet.rows.forEach(r => delete r._isNew);

    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout info`;
        c.style.margin = "20px 0";
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon}</span><div>${currentScenario.callout.text}</div>`;
        container.appendChild(c);
    }
}

function renderArchitectureDiagram(container, v) {
    if (v.type === 'data-org' || v.type === 'colocated') return; // Skip for these types

    let cols = v.type === 'index-mapping' ? v.indexColumns : v.columns;
    if (!cols) return;

    let shCols = cols.filter(c => c.role === 'sh');
    let clCols = cols.filter(c => c.role === 'cl');
    let incCols = cols.filter(c => c.role === 'inc');

    // Default to Hash if not explicitly Range
    let isHash = v.shardingType !== 'RANGE';

    // A [hash] sys column is the definitive signal for hash sharding — check it first.
    // Only fall back to direction-based auto-detection when no sys column is present,
    // because hash scenarios give their sh columns a dir for display purposes too.
    const hasSysCol = cols.some(c => c.role === 'sys');
    if (hasSysCol) {
        isHash = true;
    } else {
        // No sys column: infer from direction on the first key-like column
        const firstKey = cols.find(c => c.role === 'sh' || c.role === 'cl');
        if (firstKey && (firstKey.dir === 'ASC' || firstKey.dir === 'DESC')) {
            isHash = false;
        }
        // Range sharding view with only clustering keys and no sharding keys
        if (shCols.length === 0 && clCols.length > 0 && v.type === 'sharding-view') {
            isHash = false;
        }
    }

    const diag = document.createElement('div');
    diag.className = 'arch-diagram';

    // 1. Sharding Keys Node (only for Hash)
    if (shCols.length > 0) {
        let keysHtml = shCols.map(c => `<span class="arch-key-item sh">${c.label}</span>`).join('');
        diag.innerHTML += `
            <div class="arch-node">
                <div class="arch-node-title">Sharding Key</div>
                <div class="arch-keys">${keysHtml}</div>
            </div>
            <div class="arch-edge">➔</div>
        `;
    }

    // 2. Partitioner Node
    let partitionerIcon = isHash
        ? `<svg viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M10,10H14V14H10V10M10,19V16H14V19H10M19,10H16V14H19V10M14,5V8H10V5H14M5,10H8V14H5V10M8,5V8H5V5H8M5,19V16H8V19H5M16,19V16H19V19H16M19,5V8H16V5H19Z" /></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M3,5H9V11H3V5M14,5H20V11H14V5M3,13H9V19H3V13M14,13H20V19H14V13M11,7H12V9H11V7M11,15H12V17H11V15M7,11H9V12H7V11M15,11H17V12H15V11Z" /></svg>`;
    let partitionerName = isHash ? "Hash Sharding" : "Range Sharding";

    diag.innerHTML += `
        <div class="arch-partitioner">
            ${partitionerIcon}
            <span style="font-size:10px;text-transform:uppercase">${partitionerName}</span>
        </div>
    `;

    // 4. Clustering Keys Node
    if (clCols.length > 0) {
        let clHtml = clCols.map(c => `<span class="arch-key-item cl">${c.label} ${c.dir||''}</span>`).join('');
        diag.innerHTML += `
            <div class="arch-edge">➔</div>
            <div class="arch-node" style="border-style:dashed; border-color:var(--blue)">
                <div class="arch-node-title" style="color:var(--blue)">Organized Per Tablet</div>
                <div class="arch-keys">${clHtml}</div>
            </div>
        `;
    }

    container.appendChild(diag);
}

const COL_TOOLTIPS = {
    sys: '[hash] — DocDB-computed hash token that determines which tablet stores this row',
    sh:  'Sharding key — hashed to route each row to a specific tablet',
    cl:  'Clustering key — controls physical sort order within each tablet',
    inc: 'INCLUDE column — duplicated in the index to enable index-only scans (no 2nd RPC)',
    ptr: 'PK pointer — references the main table row; triggers the 2nd RPC to fetch the full row',
    pk:  'Primary key — the lookup target used when fetching from the main table'
};

function buildTableHeaderCols(cols) {
    let sortCount = 0;
    const totalSort = cols.filter(c => c.dir).length;

    return cols.map(c => {
        let cls = '';
        let displayLabel = c.label;
        if (c.role === 'sh') cls = 'col-sh';
        else if (c.role === 'sys') cls = 'col-sys';
        else if (c.role === 'cl') cls = 'col-cl';
        else if (c.role === 'inc') cls = 'col-inc';
        else if (c.role === 'ptr' || c.role === 'pk') cls = 'col-ptr';

        if (c.dir) {
            sortCount++;
            let arrow = c.dir === 'DESC' ? '▼' : (c.dir === 'ASC' ? '▲' : '⇅');
            let indicator = arrow;
            if (totalSort > 1) indicator += ` ${sortCount}`;

            let color = 'var(--blue)';
            if (c.role === 'sys') color = 'var(--txt3)';
            else if (c.role === 'sh') color = 'var(--accent)';

            displayLabel += ` <span style="font-size:13px;opacity:0.9;margin-left:4px;color:${color};font-weight:bold">${indicator}</span>`;
        }

        const tip = COL_TOOLTIPS[c.role] || '';
        return `<th class="${cls}"${tip ? ` title="${tip}"` : ''}>${displayLabel}</th>`;
    }).join('');
}

/* ═══ SHARDING VIEW ═══ */
function renderShardingView(container, v) {
    const grid = document.createElement('div');
    grid.className = 'tablet-grid';
    scenarioState.tablets.forEach(t => {
        const card = document.createElement('div');
        let scanCls = '';
        if (scanState) {
            if (scanState.scanned.has(t.id)) scanCls = ' scan-done';
            else if (scanState.pruned.has(t.id)) scanCls = ' scan-dimmed';
        }
        card.className = 'tablet-card' + scanCls;
        const cols = v.columns;
        let thHtml = buildTableHeaderCols(cols);
        let tbHtml = t.rows.map(row => {
            const cls = row._isNew ? 'new-row-anim' : '';
            const excl = row._excluded ? 'excluded-row' : '';
            const tds = row.data.map((d, i) => {
                let cc = '';
                if (cols[i]?.role === 'sh') cc = 'col-sh';
                else if (cols[i]?.role === 'sys') cc = 'col-sys';
                else if (cols[i]?.role === 'cl') cc = 'col-cl';
                else if (cols[i]?.role === 'inc') cc = 'col-inc';
                else if (cols[i]?.role === 'ptr') cc = 'col-ptr';
                return `<td class="${cc}">${d}</td>`;
            }).join('');
            return `<tr class="${cls} ${excl}">${tds}</tr>`;
        }).join('');
        const capNotice = t._capped ? `<div class="tablet-cap-notice">⚠ Display capped at 20 rows — oldest entries dropped</div>` : '';
        const rc = t.rows.length;
        const rcCls = rc <= 1 ? 'rc-low' : rc <= 4 ? 'rc-mid' : rc === 5 ? 'rc-high' : 'rc-max';
        const rcBadge = `<div class="t-row-count ${rcCls}">${rc} ${rc === 1 ? 'row' : 'rows'}</div>`;
        const rangeHtml = t.range ? `<div class="t-range">${t.range}</div>` : '';
        card.innerHTML = `<div class="t-header"><div class="t-name">${t.id}</div><div class="t-header-right">${rcBadge}${rangeHtml}</div></div><div class="table-scroll"><table class="data-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>${capNotice}`;
        grid.appendChild(card);
        t.rows.forEach(r => delete r._isNew);
    });
    container.appendChild(grid);
    // Callouts
    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout ${currentScenario.callout.type||'info'}`;
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon||'💡'}</span><div>${currentScenario.callout.text}</div>`;
        container.appendChild(c);
    }
}

/* ═══ DATA ORG VIEW ═══ */
function renderDataOrg(container) {
    const wrap = document.createElement('div');
    wrap.className = 'org-container';
    scenarioState.blocks.forEach(b => {
        const block = document.createElement('div');
        block.className = 'org-block';
        const dirCls = b.dir === 'ASC' ? 'asc' : 'desc';
        block.innerHTML = `<div class="org-block-header"><div class="org-block-title">${b.id}</div><span class="org-direction-arrow ${dirCls}">${b.dir||''}</span><div class="org-block-desc">${b.desc||''}</div></div>`;
        const body = document.createElement('div');
        body.className = 'org-body';
        b.items.forEach(it => {
            const part = document.createElement('div');
            part.className = 'org-partition';
            part.innerHTML = `<div class="org-partition-key">${it.key}</div>`;
            const rows = document.createElement('div');
            rows.className = 'org-rows';
            it.rows.forEach(r => {
                const item = document.createElement('div');
                item.className = `org-row-item${r._isNew ? ' new-val' : ''}`;
                item.innerHTML = `<span class="org-row-cl">${r.cl}</span><span class="org-row-data">${r.vals.join(' · ')}</span>`;
                rows.appendChild(item);
            });
            part.appendChild(rows);
            body.appendChild(part);
        });
        block.appendChild(body);
        wrap.appendChild(block);
    });
    container.appendChild(wrap);
}

/* ═══ INDEX MAPPING VIEW (Multi-tablet) ═══ */
function renderIndexMapping(container, v) {
    const wrap = document.createElement('div');
    wrap.className = 'index-map-container';
    // Badges
    let badges = '';
    if (v.isCovering) badges += `<div class="index-no-rpc">✓ Index-only scan — no 2nd RPC to main table needed</div>`;
    else badges += `<div class="index-rpc-needed">⚠ Requires 2nd RPC to fetch full row from main table</div>`;
    if (v.partialFilter) badges += `<div class="partial-filter-badge">WHERE ${v.partialFilter}</div>`;
    wrap.innerHTML = `<div class="index-badges-row">${badges}</div>`;

    // ── TOP: Index Data ──
    const idxCols = v.indexColumns || [];
    const idxSection = document.createElement('div');
    idxSection.className = 'idx-section';
    idxSection.innerHTML = `<div class="idx-section-title" style="color:var(--purple)">▸ Index Data</div>`;
    const idxGrid = document.createElement('div');
    idxGrid.className = 'tablet-grid';
    (scenarioState.indexTablets||[]).forEach(t => {
        const card = buildTabletCard(t, idxCols, 'purple');
        if (scanState) {
            if (scanState.scanned.has(t.id)) card.classList.add('scan-done');
            else if (scanState.pruned.has(t.id)) card.classList.add('scan-dimmed');
        }
        idxGrid.appendChild(card);
        t.rows.forEach(r => { delete r._isNew; });
    });
    idxSection.appendChild(idxGrid);
    wrap.appendChild(idxSection);

    // Callout (Moving it here to be "below the index view" per user request)
    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout ${currentScenario.callout.type||'info'}`;
        c.style.margin = "10px 0 20px 0"; // Add some spacing
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon||'💡'}</span><div>${currentScenario.callout.text}</div>`;
        wrap.appendChild(c);
    }

    // ── DIVIDER ──
    const divider = document.createElement('div');
    divider.className = 'idx-divider';
    const dividerLabel = v.isCovering ? 'Index Scan ⟶ No Table Fetch (index covers all queried columns)' : 'Index Scan ⟶ Table Fetch (via PK)';
    divider.innerHTML = `<div class="idx-divider-line"></div><div class="idx-divider-label">${dividerLabel}</div><div class="idx-divider-line"></div>`;
    wrap.appendChild(divider);

    // ── BOTTOM: Table Data ──
    const tblCols = v.tableColumns || [];
    const tblSection = document.createElement('div');
    tblSection.className = 'idx-section';
    tblSection.innerHTML = `<div class="idx-section-title" style="color:var(--green)">▸ Table Data</div>`;
    const tblGrid = document.createElement('div');
    tblGrid.className = 'tablet-grid';
    (scenarioState.tableTablets||[]).forEach(t => {
        const card = buildTabletCard(t, tblCols, 'green');
        if (scanState) {
            if (scanState.scanned.has(t.id)) card.classList.add('scan-done');
            else if (scanState.pruned.has(t.id)) card.classList.add('scan-dimmed');
        }
        tblGrid.appendChild(card);
        t.rows.forEach(r => { delete r._isNew; });
    });
    tblSection.appendChild(tblGrid);
    wrap.appendChild(tblSection);

    container.appendChild(wrap);
}

/* ═══ TABLE PARTITIONING VIEW ═══ */
function renderPartitioning(container, v) {
    const wrap = document.createElement('div');
    wrap.className = 'index-map-container';

    wrap.innerHTML = `<div class="index-badges-row">
        <div class="partial-filter-badge">Declarative Sharding (Range)</div>
    </div>`;

    // ── TOP: Physical Partitions ──
    const partCols = v.partitionColumns || [];
    const partSection = document.createElement('div');
    partSection.className = 'idx-section';
    partSection.innerHTML = `<div class="idx-section-title" style="color:var(--green)">▸ Physical Partitions (Child Tables)</div>`;

    (scenarioState.partitions||[]).forEach(p => {
        const pGroup = document.createElement('div');
        pGroup.className = 'partition-group-wrap';
        pGroup.innerHTML = `<div class="partition-group-header">
            <div class="partition-group-name">
                ${p.id} ${p.region ? `<span class="region-badge">${p.region}</span>` : ''}
                ${p.placement ? `<div class="partition-placement">${p.placement}</div>` : ''}
            </div>
            <div class="partition-group-range">${p.range}</div>
        </div>`;

        const partGrid = document.createElement('div');
        partGrid.className = 'tablet-grid';
        (p.tablets||[]).forEach(t => {
            const card = buildTabletCard(t, partCols, 'green');
            partGrid.appendChild(card);
            t.rows.forEach(r => { delete r._isNew; });
        });
        pGroup.appendChild(partGrid);
        partSection.appendChild(pGroup);
    });
    wrap.appendChild(partSection);

    // ── DIVIDER ──
    const divider = document.createElement('div');
    divider.className = 'idx-divider';
    divider.innerHTML = `<div class="idx-divider-line"></div><div class="idx-divider-label">Logical Parent View (Unified)</div><div class="idx-divider-line"></div>`;
    wrap.appendChild(divider);

    // ── BOTTOM: Logical Parent Table ──
    const parentCols = v.parentColumns || [];
    const parentSection = document.createElement('div');
    parentSection.className = 'idx-section';
    parentSection.innerHTML = `<div class="idx-section-title" style="color:var(--accent)">▸ Logical Parent Table (orders)</div>`;

    const parentTable = document.createElement('div');
    parentTable.className = 'tablet-grid';
    // Use a single "virtual" tablet for the parent
    const parentCard = buildTabletCard({ id: "Parent Table (Logical)", rows: scenarioState.parentRows || [] }, parentCols, 'accent');
    parentTable.appendChild(parentCard);
    parentSection.appendChild(parentTable);
    wrap.appendChild(parentSection);

    container.appendChild(wrap);

    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout ${currentScenario.callout.type||'info'}`;
        c.style.margin = "20px 0";
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon||'💡'}</span><div>${currentScenario.callout.text}</div>`;
        container.appendChild(c);
    }
}

/* ═══ LOCAL INDEX ON PARTITIONED TABLE ═══ */
function renderPartitionIndex(container, v) {
    const wrap = document.createElement('div');
    wrap.className = 'index-map-container';

    wrap.innerHTML = `<div class="index-badges-row">
        <div class="index-rpc-needed">Sharded Index (Local) — Index is split per child table</div>
    </div>`;

    // ── TOP: Physical Partitions with Local Indexes ──
    const idxCols = v.indexColumns || [];
    const partCols = v.partitionColumns || [];

    const partSection = document.createElement('div');
    partSection.className = 'idx-section';

    (scenarioState.partitions||[]).forEach(p => {
        const pGroup = document.createElement('div');
        pGroup.className = 'partition-group-wrap';
        pGroup.innerHTML = `<div class="partition-group-header">
            <div class="partition-group-name">${p.id} (Child Table)</div>
            <div class="partition-group-range">${p.range}</div>
        </div>`;

        // Local Index Tablets
        const idxTitle = document.createElement('div');
        idxTitle.className = 'idx-section-title';
        idxTitle.style = 'font-size:10px; color:var(--purple); margin: 8px 0 4px 0;';
        idxTitle.innerText = `▸ Local Index Tablets (${p.id}_idx)`;
        pGroup.appendChild(idxTitle);

        const idxGrid = document.createElement('div');
        idxGrid.className = 'tablet-grid';
        (p.indexTablets||[]).forEach(t => {
            idxGrid.appendChild(buildTabletCard(t, idxCols, 'purple'));
            t.rows.forEach(r => { delete r._isNew; });
        });
        pGroup.appendChild(idxGrid);

        // Data Tablets
        const dataTitle = document.createElement('div');
        dataTitle.className = 'idx-section-title';
        dataTitle.style = 'font-size:10px; color:var(--green); margin: 12px 0 4px 0;';
        dataTitle.innerText = `▸ Data Tablets (${p.id})`;
        pGroup.appendChild(dataTitle);

        const partGrid = document.createElement('div');
        partGrid.className = 'tablet-grid';
        (p.tablets||[]).forEach(t => {
            const card = buildTabletCard(t, partCols, 'green');
            partGrid.appendChild(card);
            t.rows.forEach(r => { delete r._isNew; });
        });
        pGroup.appendChild(partGrid);
        partSection.appendChild(pGroup);
    });
    wrap.appendChild(partSection);

    // ── DIVIDER ──
    const divider = document.createElement('div');
    divider.className = 'idx-divider';
    divider.innerHTML = `<div class="idx-divider-line"></div><div class="idx-divider-label">Logical Parent View (Unified)</div><div class="idx-divider-line"></div>`;
    wrap.appendChild(divider);

    // ── BOTTOM: Logical Parent Table ──
    const parentCols = v.parentColumns || [];
    const parentSection = document.createElement('div');
    parentSection.className = 'idx-section';
    const parentTableName = v.parentTable || 'orders';
    parentSection.innerHTML = `<div class="idx-section-title" style="color:var(--accent)">▸ Logical Parent Table (${parentTableName})</div>`;
    const parentCard = buildTabletCard({ id: "Logical Table", rows: scenarioState.parentRows || [] }, parentCols, 'accent');
    parentSection.appendChild(parentCard);
    wrap.appendChild(parentSection);

    container.appendChild(wrap);

    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout ${currentScenario.callout.type||'info'}`;
        c.style.margin = "20px 0";
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon||'💡'}</span><div>${currentScenario.callout.text}</div>`;
        container.appendChild(c);
    }
}

function buildTabletCard(t, cols, accentColor, tabletIdx) {
    const card = document.createElement('div');
    card.className = 'tablet-card';
    if (tabletIdx !== undefined) card.dataset.tabletId = tabletIdx;
    const nameColor = accentColor === 'purple' ? 'var(--purple)' : accentColor === 'green' ? 'var(--green)' : 'var(--accent)';
    let thHtml = buildTableHeaderCols(cols);
    let tbHtml = t.rows.map((row, rIdx) => {
        const anim = row._isNew ? 'new-row-anim' : '';
        const excl = row._excluded ? 'excluded-row' : '';
        const tds = row.data ? row.data.map((d, i) => {
            let cc = '';
            if (cols[i]?.role === 'sh') cc = 'col-sh';
            else if (cols[i]?.role === 'sys') cc = 'col-sys';
            else if (cols[i]?.role === 'cl') cc = 'col-cl';
            else if (cols[i]?.role === 'inc') cc = 'col-inc';
            else if (cols[i]?.role === 'pk') cc = 'col-ptr';
            return `<td class="${cc}">${d}</td>`;
        }).join('') : cols.map(c => `<td class="${c.role==='sys'?'col-sys':c.role==='sh'?'col-sh':c.role==='cl'?'col-cl':c.role==='pk'?'col-ptr':''}">${row.fields[cols.indexOf(c)]||''}</td>`).join('');
        return `<tr class="${anim} ${excl}" data-row-idx="${rIdx}">${tds}</tr>`;
    }).join('');
    const rowCount = t.rows.length;
    const rcClass = rowCount <= 1 ? 'rc-low' : rowCount <= 4 ? 'rc-mid' : rowCount === 5 ? 'rc-high' : 'rc-max';
    const rowBadge = `<div class="t-row-count ${rcClass}">${rowCount} ${rowCount === 1 ? 'row' : 'rows'}</div>`;
    const rangeHtml = t.range ? `<div class="t-range">${t.range}</div>` : '';
    card.innerHTML = `<div class="t-header"><div class="t-name" style="color:${nameColor}">${t.id}</div><div class="t-header-right">${rowBadge}${rangeHtml}</div></div><div class="table-scroll"><table class="data-table"><thead><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`;
    return card;
}

/* ═══ INSERT LOGIC ═══ */
function simulateInsert() {
    const val = document.getElementById('sim-input-val').value.trim();
    if (!val && !currentScenario.generateRow) return;
    doInsert(val || 'auto');
}

function autoInsert() {
    // Generate varied names/keys to distribute across tablets
    const names = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Hank','Ivy','Jack','Kim','Leo','Mia','Nora','Omar'];
    const domains = ['acme.com','globex.io','initech.co','umbrella.net','wayne.org'];
    const ids = ['user-'+Math.floor(Math.random()*999), 'S-'+Math.floor(Math.random()*999), String.fromCharCode(65+Math.floor(Math.random()*26))+Math.floor(Math.random()*999)];
    let val;
    if (currentScenarioId.startsWith('idx-')) {
        if (['idx-hash-composite', 'idx-range-single', 'idx-range-single-split'].includes(currentScenarioId)) {
            val = String((Math.random() * 200).toFixed(2));
        } else if (currentScenarioId === 'idx-range-composite') {
            val = ["Laptop", "Monitor", "Keyboard", "Mouse", "Tablet"][Math.floor(Math.random() * 5)];
        } else if (currentScenarioId === 'idx-bucket') {
            val = ["Purchase", "Refund", "Return"][Math.floor(Math.random() * 3)];
        } else if (currentScenarioId === 'idx-expression') {
            const raw = names[Math.floor(Math.random()*names.length)];
            const dom = domains[Math.floor(Math.random()*domains.length)].toUpperCase();
            val = raw + '@' + dom;
        } else if (currentScenarioId === 'idx-multi-hash') {
            val = ["click", "view", "purchase", "login", "logout"][Math.floor(Math.random() * 5)];
        } else {
            val = names[Math.floor(Math.random()*names.length)].toLowerCase() + '@' + domains[Math.floor(Math.random()*domains.length)];
        }
    } else if (currentScenarioId === 'pattern-timeseries') {
        const months = ['2024-01', '2024-02', '2024-03'];
        const month = months[Math.floor(Math.random() * months.length)];
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        val = `${month}-${day}`;
    } else if (currentScenarioId === 'pattern-multitenant') {
        const tenants = ['acme-corp', 'globex-inc', 'initech', 'umbrella', 'waystar-royco'];
        val = tenants[Math.floor(Math.random() * tenants.length)];
    } else if (currentScenarioId === 'pattern-jsonb') {
        const colors = ['red', 'blue', 'green', 'black', 'white', 'yellow'];
        val = colors[Math.floor(Math.random() * colors.length)];
    } else if (currentScenarioId === 'partition-index') {
        val = 'cust-' + Math.floor(Math.random() * 500);
    } else if (currentScenarioId === 'colocated-tables') {
        const items = ["Admin", "PowerUser", "Standard", "Guest", "Premium", "Silver", "Gold", "Platinum"];
        val = items[Math.floor(Math.random() * items.length)];
    } else if (currentScenarioId === 'partition-range') {
        const years = [2023, 2024, 2025, 2026];
        const y = years[Math.floor(Math.random() * years.length)];
        const m = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const d = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        val = `${y}-${m}-${d}`;
    } else if (currentScenarioId === 'geo-partitioning') {
        const regions = ["US", "EU", "APAC"];
        val = regions[Math.floor(Math.random() * regions.length)];
    } else if (currentScenarioId === 'range-composite') {
        val = "S-" + String(Math.floor(Math.random() * 999)).padStart(3, '0');
    } else if (currentScenarioId.includes('range')) {
        val = ids[2]; // letter+number for range split
    } else {
        val = names[Math.floor(Math.random()*names.length)] + '-' + Math.floor(Math.random()*999);
    }
    document.getElementById('sim-input-val').value = val;
    doInsert(val);
}

function getStableHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function doInsert(val) {
    const feedback = document.getElementById('sim-feedback');
    const v = currentScenario.visual;
    if (!currentScenario.generateRow) { feedback.textContent = 'Insert not available for this view.'; return; }

    if (v.type === 'sharding-view') {
        const rowData = currentScenario.generateRow(val);
        let tabletIdx = 0;
        const numTablets = scenarioState.tablets.length;
        if (v.shardingType === 'HASH') {
            // Determine sharding key values for deterministic routing
            const dataCols = v.columns.filter(c => c.role !== 'sys');
            const shValues = [];
            v.columns.forEach(c => {
                if (c.role === 'sh') {
                    const dataIdx = dataCols.indexOf(c);
                    shValues.push(rowData[dataIdx]);
                }
            });
            const shKey = shValues.join('|');
            const stableHash = getStableHash(shKey);

            tabletIdx = stableHash % numTablets;

            // Map to tablet range
            let min = 0, max = 0xFFFF;
            if (numTablets === 3) {
                if (tabletIdx === 0) { min = 0x0000; max = 0x5555; }
                else if (tabletIdx === 1) { min = 0x5556; max = 0xAAAA; }
                else { min = 0xAAAB; max = 0xFFFF; }
            } else if (numTablets === 2) {
                if (tabletIdx === 0) { min = 0x0000; max = 0x7FFF; }
                else { min = 0x8000; max = 0xFFFF; }
            }

            // Deterministic hash within tablet range
            const hashVal = min + (stableHash % (max - min + 1));
            const hashValStr = '0x' + hashVal.toString(16).toUpperCase().padStart(4, '0');

            rowData.unshift(hashValStr);
            const existingCount = scenarioState.tablets[tabletIdx].rows.length;
            const colocationNote = existingCount > 0
                ? ` · <span style="color:var(--txt3)">co-located with ${existingCount} other key${existingCount > 1 ? 's' : ''} in this partition</span>`
                : '';
            feedback.innerHTML = `<code>hex(hash("${shKey}")) = ${hashValStr}</code> → Routed to <b>${scenarioState.tablets[tabletIdx].id}</b>${colocationNote}`;
        } else {
            // Range routing
            const valStr = String(rowData[0]);
            if (valStr.startsWith('S-')) {
                // specific fix for sensor ID ranges [S-001, S-500) and [S-500, S-999]
                const num = parseInt(valStr.substring(2)) || 0;
                tabletIdx = num < 500 ? 0 : 1;
            } else {
                const first = valStr.toUpperCase()[0];
                if (numTablets === 2) tabletIdx = first < 'M' ? 0 : 1;
                else tabletIdx = first < 'J' ? 0 : first < 'R' ? 1 : Math.min(2, numTablets - 1);
            }
            tabletIdx = Math.min(tabletIdx, numTablets - 1);
            feedback.innerHTML = `Range split "${rowData[0]}" → Routed to <b>${scenarioState.tablets[tabletIdx].id}</b>`;
        }
        const newRow = { data: rowData, _isNew: true };
        scenarioState.tablets[tabletIdx].rows.push(newRow);
        // Sort by clustering key if specified
        if (v.sortConfig) {
            scenarioState.tablets[tabletIdx].rows.sort((a, b) => {
                for (const sc of v.sortConfig) {
                    const va = a.data[sc.idx], vb = b.data[sc.idx];
                    const cmp = String(va).localeCompare(String(vb));
                    if (cmp !== 0) return sc.dir === 'DESC' ? -cmp : cmp;
                }
                return 0;
            });
        }
        // Cap rows per tablet to avoid slowdown
        if (scenarioState.tablets[tabletIdx].rows.length > 20) {
            scenarioState.tablets[tabletIdx].rows.pop();
            scenarioState.tablets[tabletIdx]._capped = true;
        }
    } else if (v.type === 'index-mapping') {
        const result = currentScenario.generateRow(val);
        if (result.index && result.table) {
            // GIN multi-entry insert (pattern-jsonb)
            if (result._ginEntries) {
                const tblTablets = scenarioState.tableTablets || [];
                const idxTablets = scenarioState.indexTablets || [];
                const tblIdx = Math.floor(Math.random() * tblTablets.length);
                if (tblTablets[tblIdx]) tblTablets[tblIdx].rows.unshift({...result.table, _isNew: true});
                result._ginEntries.forEach(entry => {
                    // Route by key: "a"–"h" → tablet 0 (category, color), "i"–"z" → tablet 1 (in_stock, size)
                    const ginIdx = entry.key < 'i' ? 0 : 1;
                    if (idxTablets[ginIdx]) idxTablets[ginIdx].rows.unshift({ fields: [entry.key, entry.val, entry.ptr], _isNew: true });
                });
                tblTablets.forEach(t => { if (t.rows.length > 6) t.rows.pop(); });
                idxTablets.forEach(t => { if (t.rows.length > 6) t.rows.pop(); });
                feedback.className = 'active';
                feedback.innerHTML = `TABLE → <b>${tblTablets[tblIdx]?.id}</b> | GIN: <b>${result._ginEntries.length} index entries</b> across ${idxTablets.length} tablets`;
                renderVisual();
                return;
            }
            // Route to random table tablet
            const tblTablets = scenarioState.tableTablets || [];
            const idxTablets = scenarioState.indexTablets || [];
            const tblIdx = Math.floor(Math.random() * tblTablets.length);
            let idxIdx = Math.floor(Math.random() * idxTablets.length);
            if ((currentScenarioId === 'idx-bucket' || currentScenarioId === 'pattern-timeseries') && result.index.fields.length > 0) {
                idxIdx = parseInt(result.index.fields[0]);
                if (isNaN(idxIdx) || idxIdx >= idxTablets.length) idxIdx = 0;
            }

            // Unique index: reject duplicates now, before hash is prepended to fields
            if (currentScenarioId === 'idx-unique') {
                const candidateKey = result.index.fields[0];
                if (!scenarioState.usedEmails) scenarioState.usedEmails = [];
                if (scenarioState.usedEmails.includes(candidateKey)) {
                    feedback.className = 'active';
                    feedback.innerHTML = `⛔ UNIQUE violation: <code>${candidateKey}</code> already exists in the index — INSERT rejected`;
                    renderVisual();
                    return;
                }
                scenarioState.usedEmails.push(candidateKey);
            }

            // Compute hash and route deterministically for any index that has a [hash] sys column
            const hasSysColumn = (v.indexColumns || []).some(c => c.role === 'sys');
            let idxFeedback;
            if (hasSysColumn) {
                const idxKey = result.index._hashKey || String(result.index.fields[0]);
                const stableHash = getStableHash(idxKey);
                idxIdx = stableHash % idxTablets.length;

                let min = 0, max = 0xFFFF;
                if (idxTablets.length === 3) {
                    if (idxIdx === 0) { min = 0x0000; max = 0x5555; }
                    else if (idxIdx === 1) { min = 0x5556; max = 0xAAAA; }
                    else { min = 0xAAAB; max = 0xFFFF; }
                } else if (idxTablets.length === 2) {
                    if (idxIdx === 0) { min = 0x0000; max = 0x7FFF; }
                    else { min = 0x8000; max = 0xFFFF; }
                }

                const hashVal = min + (stableHash % (max - min + 1));
                const hashValStr = '0x' + hashVal.toString(16).toUpperCase().padStart(4, '0');
                result.index.fields.unshift(hashValStr);
                idxFeedback = `<code>hex(hash("${idxKey}")) = ${hashValStr}</code> → <b>${idxTablets[idxIdx]?.id}</b>`;
            }

            // Expression index: prepend the transformation to feedback
            if (result._exprNote && idxFeedback) {
                idxFeedback = `${result._exprNote} · ${idxFeedback}`;
            }

            // Range-index routing: route by indexed value instead of randomly
            if (!hasSysColumn && !idxFeedback) {
                if (currentScenarioId === 'idx-range-single-split') {
                    const price = parseFloat(result.index.fields[0]);
                    if (!isNaN(price)) {
                        if (price < 50) idxIdx = 0;
                        else if (price < 150) idxIdx = 1;
                        else idxIdx = 2;
                        idxIdx = Math.min(idxIdx, idxTablets.length - 1);
                    }
                    const rangeLabel = [' <span style="color:var(--txt3)">(-∞, 50)</span>', ' <span style="color:var(--txt3)">[50, 150)</span>', ' <span style="color:var(--txt3)">[150, ∞)</span>'][idxIdx] || '';
                    idxFeedback = `price <b>${result.index.fields[0]}</b>${rangeLabel} → <b>${idxTablets[idxIdx]?.id}</b>`;
                } else if (currentScenarioId === 'idx-range-single') {
                    idxIdx = 0;
                    idxFeedback = `price <b>${result.index.fields[0]}</b> → <b>${idxTablets[0]?.id}</b> <span style="color:var(--txt3)">(splits automatically when size threshold is reached)</span>`;
                } else if (currentScenarioId === 'idx-range-composite') {
                    idxIdx = 0;
                    idxFeedback = `region <b>${result.index.fields[0]}</b> → <b>${idxTablets[0]?.id}</b> <span style="color:var(--txt3)">(splits automatically when size threshold is reached)</span>`;
                } else if (currentScenarioId === 'idx-bucket') {
                    const ts = result.index.fields[1];
                    idxFeedback = `<code>yb_hash_code("${ts}") % 3 = ${idxIdx}</code> → <b>${idxTablets[idxIdx]?.id}</b>`;
                } else if (currentScenarioId === 'pattern-timeseries') {
                    const ts = result.index.fields[1];
                    idxFeedback = `<code>yb_hash_code("${ts}") % 3 = ${idxIdx}</code> → <b>${idxTablets[idxIdx]?.id}</b>`;
                }
            }

            // Add to table tablet
            const tblRow = {...result.table, _isNew: true};
            if (tblTablets[tblIdx]) tblTablets[tblIdx].rows.unshift(tblRow);
            // For partial indexes, only add to index if row matches filter
            const addToIndex = !v.partialFilter || !result.table._excluded;
            if (addToIndex) {
                if (idxTablets[idxIdx]) idxTablets[idxIdx].rows.unshift({...result.index, _isNew: true});
                if (!idxFeedback) idxFeedback = `INDEX → ${idxTablets[idxIdx]?.id}`;
                feedback.innerHTML = `TABLE → <b>${tblTablets[tblIdx]?.id}</b> | ${idxFeedback}`;
            } else {
                tblRow._excluded = true;
                feedback.textContent = `Row in TABLE (${tblTablets[tblIdx]?.id}) but EXCLUDED from INDEX (WHERE ${v.partialFilter})`;
            }
            // Cap rows per tablet
            tblTablets.forEach(t => { if (t.rows.length > 6) t.rows.pop(); });
            idxTablets.forEach(t => { if (t.rows.length > 6) t.rows.pop(); });
        }
    } else if (v.type === 'data-org') {
        const result = currentScenario.generateRow(val);
        if (result) {
            result.forEach(r => {
                const block = scenarioState.blocks[r.blockIdx];
                if (!block) return;
                const part = block.items.find(it => it.key === r.key);
                if (part) {
                    part.rows.push({ cl: r.cl, vals: r.vals, _isNew: true });
                    part.rows.sort((a, b) => block.dir === 'DESC' ? b.cl.localeCompare(a.cl) : a.cl.localeCompare(b.cl));
                }
            });
            feedback.textContent = `Inserted and re-sorted by clustering key`;
        }
    } else if (v.type === 'partitioning' && currentScenarioId !== 'geo-partitioning') {
        const result = currentScenario.generateRow(val);
        if (result) {
            // Generate deterministic hash for order_id (sharding key)
            const shKey = String(result.fields[0]);
            const stableHash = getStableHash(shKey);
            const hashVal = 0x0000 + (stableHash % (0xFFFF + 1));
            const hashValStr = '0x' + hashVal.toString(16).toUpperCase().padStart(4, '0');

            result.fields.unshift(hashValStr);

            // Add to parent logical view
            scenarioState.parentRows.unshift({...result, _isNew: true});
            if (scenarioState.parentRows.length > 5) scenarioState.parentRows.pop();

            // Route to partition
            const dateStr = String(result.fields[2]); // order_date
            const year = parseInt(dateStr.substring(0, 4));
            let partIdx = 2; // Default to orders_default (index 2)
            if (year === 2023) partIdx = 0;
            else if (year === 2024) partIdx = 1;

            const part = scenarioState.partitions[partIdx];
            if (part && part.tablets) {
                const tabletIdx = stableHash % part.tablets.length;
                const tablet = part.tablets[tabletIdx];
                tablet.rows.unshift({...result, _isNew: true});
                if (tablet.rows.length > 5) tablet.rows.pop();
                feedback.innerHTML = `Logical table → Routed to physical partition: <b>${part.id}</b> | Tablet: <b>${tablet.id}</b>`;
            }
        }
    } else if (v.type === 'partition-index') {
        const result = currentScenario.generateRow(val);
        if (result) {
            const shKey = String(result.fields[0]);
            const stableHashTbl = getStableHash(shKey);
            const hashValTbl = 0x0000 + (stableHashTbl % (0xFFFF + 1));
            const hashValTblStr = '0x' + hashValTbl.toString(16).toUpperCase().padStart(4, '0');
            const rowWithHash = { fields: [hashValTblStr, ...result.fields], _isNew: true };

            scenarioState.parentRows.unshift(rowWithHash);
            if (scenarioState.parentRows.length > 5) scenarioState.parentRows.pop();

            // Default partition-index routing (year-based, customer_id index key)
            const dateStr = String(result.fields[1]);
            const year = parseInt(dateStr.substring(0, 4));
            let partIdx = 2;
            if (year === 2023) partIdx = 0;
            else if (year === 2024) partIdx = 1;
            const part = scenarioState.partitions[partIdx];
            if (part && part.tablets) {
                const dTabletIdx = stableHashTbl % part.tablets.length;
                const dTablet = part.tablets[dTabletIdx];
                dTablet.rows.unshift(rowWithHash);
                if (dTablet.rows.length > 5) dTablet.rows.pop();

                const custId = String(result.fields[2]);
                const stableHashIdx = getStableHash(custId);
                const iTabletIdx = stableHashIdx % part.indexTablets.length;
                const iTablet = part.indexTablets[iTabletIdx];
                const hashValIdxStr = '0x' + (0x0000 + (stableHashIdx % (0xFFFF + 1))).toString(16).toUpperCase().padStart(4, '0');

                iTablet.rows.unshift({ fields: [hashValIdxStr, custId, shKey, dateStr], _isNew: true });
                if (iTablet.rows.length > 5) iTablet.rows.pop();

                feedback.innerHTML = `Logical table → <b>${part.id}</b> | Local Index Updated: <b>${iTablet.id}</b> | Data Tablet: <b>${dTablet.id}</b>`;
            }
        }
    } else if (v.type === 'colocated') {
        const result = currentScenario.generateRow(val);
        if (result) {
            const tbl = result.fields[0];
            scenarioState.tablet.rows.push({...result, _isNew: true});
            // Range-based sorting: Table Name (prefix) then ID
            scenarioState.tablet.rows.sort((a, b) => {
                if (a.fields[0] !== b.fields[0]) return a.fields[0].localeCompare(b.fields[0]);
                return String(a.fields[1]).localeCompare(String(b.fields[1]), undefined, {numeric: true});
            });
            if (scenarioState.tablet.rows.length > 12) scenarioState.tablet.rows.pop();
            feedback.innerHTML = `Inserted into <b>${tbl}</b> table → Range-sorted in shared tablet`;
        }
    } else if (v.type === 'partitioning' && currentScenarioId === 'geo-partitioning') {
        const result = currentScenario.generateRow(val);
        if (result) {
            // Generate deterministic hash for order_id
            const shKey = String(result.fields[0]);
            const stableHash = getStableHash(shKey);
            const hashVal = 0x0000 + (stableHash % (0xFFFF + 1));
            const hashValStr = '0x' + hashVal.toString(16).toUpperCase().padStart(4, '0');
            result.fields.unshift(hashValStr);

            // Add to parent logical view
            scenarioState.parentRows.unshift({...result, _isNew: true});
            if (scenarioState.parentRows.length > 5) scenarioState.parentRows.pop();

            const region = String(result.fields[2]).toUpperCase();
            const partIdx = scenarioState.partitions.findIndex(p => p.id.includes(region.toLowerCase()));
            const part = scenarioState.partitions[partIdx === -1 ? 0 : partIdx];

            if (part && part.tablets) {
                const tablet = part.tablets[0];
                tablet.rows.unshift({...result, _isNew: true});
                if (tablet.rows.length > 5) tablet.rows.pop();
                feedback.innerHTML = `Region <b>${region}</b> detected → Routed to local partition: <b>${part.id}</b>`;
            }
        }
    }
    renderVisual();
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) { h = ((h << 5) - h) + String(str).charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

/* ═══════════════════════════════════════════════════════════
   SCAN PREDICATE SIMULATOR (#4)
   ═══════════════════════════════════════════════════════════ */

// Strip trailing role descriptors like " (UNIQUE)", " (PK)", " (Ptr)" from column labels,
// but preserve expression forms like "lower(email)" where parens immediately follow the name.
function getColumnBaseName(label) {
    return label.replace(/\s+\([^)]*\)\s*$/, '').trim().toLowerCase();
}

function parseScanPredicate(text) {
    text = text.trim();
    let m;
    m = text.match(/^(\w+)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
    if (m) return { column: m[1].toLowerCase(), op: 'BETWEEN', low: m[2].replace(/'/g,'').trim(), high: m[3].replace(/'/g,'').trim() };
    // Handle expression forms like lower(email) = 'value'
    m = text.match(/^(\w+\([^)]+\))\s*(!=|<=|>=|=|<|>)\s*'?([^']+?)'?\s*$/i);
    if (m) return { column: m[1].toLowerCase(), op: m[2], value: m[3].trim() };
    m = text.match(/^(\w+)\s*(!=|<=|>=|=|<|>)\s*'?([^']+?)'?\s*$/);
    if (m) return { column: m[1].toLowerCase(), op: m[2], value: m[3].trim() };
    return null;
}

function valueMeetsPredicate(val, pred) {
    const s = String(val).toLowerCase().trim();
    const numVal = parseFloat(s);
    switch (pred.op) {
        case '=':  return s === pred.value.toLowerCase();
        case '!=': return s !== pred.value.toLowerCase();
        case '<':  { const n = parseFloat(pred.value); return isNaN(n) ? s < pred.value.toLowerCase() : numVal < n; }
        case '>':  { const n = parseFloat(pred.value); return isNaN(n) ? s > pred.value.toLowerCase() : numVal > n; }
        case '<=': { const n = parseFloat(pred.value); return isNaN(n) ? s <= pred.value.toLowerCase() : numVal <= n; }
        case '>=': { const n = parseFloat(pred.value); return isNaN(n) ? s >= pred.value.toLowerCase() : numVal >= n; }
        case 'BETWEEN': {
            const low = parseFloat(pred.low), high = parseFloat(pred.high);
            if (!isNaN(numVal) && !isNaN(low) && !isNaN(high)) return numVal >= low && numVal <= high;
            return s >= pred.low.toLowerCase() && s <= pred.high.toLowerCase();
        }
    }
    return false;
}

function tabletHasMatchingRows(tablet, pred, colIdx) {
    if (tablet.rows.length === 0) return null; // unknown — no data yet
    return tablet.rows.some(row => {
        const val = row.data ? row.data[colIdx] : (row.fields ? row.fields[colIdx] : null);
        return val !== null && val !== undefined && valueMeetsPredicate(val, pred);
    });
}

window.runScan = function() {
    const input = document.getElementById('scan-input-val');
    if (!input || !input.value.trim()) return;

    const pred = parseScanPredicate(input.value.trim());
    const feedback = document.getElementById('sim-feedback');

    if (!pred) {
        if (feedback) {
            feedback.className = 'active scan-mode';
            feedback.innerHTML = `<span style="color:var(--red)">Cannot parse predicate — try: <code>price BETWEEN 20 AND 80</code>  or  <code>email = 'alice@co.com'</code></span>`;
        }
        return;
    }

    const v = currentScenario?.visual;
    if (!v) return;

    // Validate that the predicate column exists in the scenario
    let validColumns = [];
    if (v.type === 'sharding-view') {
        validColumns = (v.columns || [])
            .filter(c => c.role !== 'sys')
            .map(c => getColumnBaseName(c.label));
    } else if (v.type === 'index-mapping') {
        validColumns = (v.indexColumns || [])
            .filter(c => c.role === 'sh' || c.role === 'cl')
            .map(c => getColumnBaseName(c.label));
    }
    if (validColumns.length > 0 && !validColumns.includes(pred.column)) {
        if (feedback) {
            feedback.className = 'active scan-mode';
            feedback.innerHTML = `<span style="color:var(--red)">Unknown column <b>'${pred.column}'</b> — valid: ${validColumns.map(c => `<code>${c}</code>`).join(', ')}</span>`;
        }
        return;
    }

    scanState = { scanned: new Set(), pruned: new Set() };
    let msg = '';

    if (v.type === 'sharding-view') {
        const cols = v.columns || [];
        const shCol = cols.find(c => c.role === 'sh');
        const isOnShardKey = shCol && getColumnBaseName(shCol.label) === pred.column;
        const colIdx = cols.findIndex(c => c.label.toLowerCase() === pred.column);
        const shIdx = cols.findIndex(c => c.role === 'sh');
        const safeIdx = colIdx >= 0 ? colIdx : (shIdx >= 0 ? shIdx : 1);

        if (v.shardingType === 'HASH' && pred.op === '=' && isOnShardKey) {
            const hash = getStableHash(pred.value);
            const numTablets = scenarioState.tablets.length;
            const hit = hash % numTablets;
            scenarioState.tablets.forEach((t, i) => {
                if (i === hit) scanState.scanned.add(t.id);
                else scanState.pruned.add(t.id);
            });
            const hitTablet = scenarioState.tablets[hit];
            const rowFound = (hitTablet?.rows || []).some(row => {
                const val = row.data ? row.data[safeIdx] : (row.fields ? row.fields[safeIdx] : null);
                return val != null && valueMeetsPredicate(String(val), pred);
            });
            const notFoundNote = rowFound ? '' : ` · <span style="color:var(--red)">⚠ No row found (value not in table)</span>`;
            msg = `HASH POINT LOOKUP · <code>hash("${pred.value}")</code> → <b>${hitTablet?.id}</b> · ${numTablets - 1} tablet${numTablets > 2 ? 's' : ''} pruned${notFoundNote}`;
        } else if (v.shardingType === 'HASH') {
            scenarioState.tablets.forEach(t => scanState.scanned.add(t.id));
            msg = `FULL SCAN · Range predicate on hash-sharded table — all ${scenarioState.tablets.length} tablets must be scanned`;
        } else {
            let scanned = 0, pruned = 0;
            scenarioState.tablets.forEach(t => {
                const match = tabletHasMatchingRows(t, pred, safeIdx);
                if (match || match === null) { scanState.scanned.add(t.id); scanned++; }
                else { scanState.pruned.add(t.id); pruned++; }
            });
            msg = `RANGE SCAN · ${scanned} tablet${scanned !== 1 ? 's' : ''} in range · ${pruned} pruned`;
        }
    } else if (v.type === 'index-mapping') {
        const idxTablets = scenarioState.indexTablets || [];
        const tblTablets = scenarioState.tableTablets || [];
        const hasSysCol = (v.indexColumns || []).some(c => c.role === 'sys');
        const idxCols = v.indexColumns || [];
        // Use getColumnBaseName so "email (UNIQUE)" matches pred.column "email"
        const colIdx = idxCols.findIndex(c => getColumnBaseName(c.label) === pred.column);
        const safeIdx = colIdx >= 0 ? colIdx : 1;

        // Collect PKs (last field) only from rows that satisfy the predicate at safeIdx.
        // This ensures the 2nd RPC is counted only for rows that actually match —
        // not over-counting by assuming all rows in a scanned index tablet are fetched.
        const collectMatchingPKs = (tablets) => {
            const pks = new Set();
            tablets.forEach(t => {
                (t.rows || []).forEach(row => {
                    if (!row.fields) return;
                    const val = row.fields[safeIdx];
                    if (val != null && valueMeetsPredicate(val, pred)) {
                        pks.add(row.fields[row.fields.length - 1]);
                    }
                });
            });
            return pks;
        };

        // Mark exactly the data tablets containing the given PKs; prune the rest.
        const applyDataTablets = (pks) => {
            let count = 0;
            tblTablets.forEach(t => {
                const hit = (t.rows || []).some(r => r.fields && pks.has(r.fields[0]));
                if (hit) { scanState.scanned.add(t.id); count++; }
                else scanState.pruned.add(t.id);
            });
            return count;
        };

        if (hasSysCol && pred.op === '=') {
            const hash = getStableHash(pred.value);
            const hit = hash % idxTablets.length;
            idxTablets.forEach((t, i) => {
                if (i === hit) scanState.scanned.add(t.id);
                else scanState.pruned.add(t.id);
            });
            if (v.isCovering) {
                tblTablets.forEach(t => scanState.pruned.add(t.id));
                msg = `INDEX-ONLY SCAN · 1 index tablet hit · No 2nd RPC — all queried columns covered by index`;
            } else {
                const matchPKs = collectMatchingPKs(idxTablets[hit] ? [idxTablets[hit]] : []);
                if (matchPKs.size === 0) {
                    tblTablets.forEach(t => scanState.pruned.add(t.id));
                    msg = `INDEX POINT LOOKUP · 1 index tablet hit · No matching rows — no 2nd RPC`;
                } else {
                    const tblCount = applyDataTablets(matchPKs);
                    if (v.isUnique) {
                        msg = `INDEX POINT LOOKUP · 1 index tablet hit · 2nd RPC to 1 data tablet (unique key → at most 1 match)`;
                    } else {
                        msg = `INDEX POINT LOOKUP · 1 index tablet hit · 2nd RPC to ${tblCount} data tablet${tblCount !== 1 ? 's' : ''}`;
                    }
                }
            }
        } else if (hasSysCol) {
            idxTablets.forEach(t => scanState.scanned.add(t.id));
            if (v.isCovering) {
                tblTablets.forEach(t => scanState.pruned.add(t.id));
                msg = `INDEX-ONLY FULL SCAN · All ${idxTablets.length} index tablets · No 2nd RPC — all queried columns covered by index`;
            } else {
                const matchPKs = collectMatchingPKs(idxTablets);
                if (matchPKs.size === 0) {
                    tblTablets.forEach(t => scanState.pruned.add(t.id));
                    msg = `INDEX FULL SCAN · All ${idxTablets.length} index tablets · No matching rows — no 2nd RPC`;
                } else {
                    const tblCount = applyDataTablets(matchPKs);
                    msg = `INDEX FULL SCAN · All ${idxTablets.length} index tablets · 2nd RPC to ${tblCount} data tablet${tblCount !== 1 ? 's' : ''}`;
                }
            }
        } else {
            let scanned = 0, pruned = 0;
            const scannedIdxTablets = [];
            idxTablets.forEach(t => {
                const match = tabletHasMatchingRows(t, pred, safeIdx);
                if (match || match === null) { scanState.scanned.add(t.id); scannedIdxTablets.push(t); scanned++; }
                else { scanState.pruned.add(t.id); pruned++; }
            });
            if (v.isCovering) {
                tblTablets.forEach(t => scanState.pruned.add(t.id));
                msg = `INDEX-ONLY RANGE SCAN · ${scanned} index tablet${scanned !== 1 ? 's' : ''} hit · ${pruned} pruned · No 2nd RPC — all queried columns covered by index`;
            } else {
                const matchPKs = collectMatchingPKs(scannedIdxTablets);
                if (matchPKs.size === 0) {
                    tblTablets.forEach(t => scanState.pruned.add(t.id));
                    msg = `INDEX RANGE SCAN · ${scanned} index tablet${scanned !== 1 ? 's' : ''} hit · ${pruned} pruned · No matching rows — no 2nd RPC`;
                } else {
                    const tblCount = applyDataTablets(matchPKs);
                    msg = `INDEX RANGE SCAN · ${scanned} index tablet${scanned !== 1 ? 's' : ''} hit · ${pruned} pruned · 2nd RPC to ${tblCount} data tablet${tblCount !== 1 ? 's' : ''}`;
                }
            }
        }
    }

    if (feedback && msg) {
        feedback.className = 'active scan-mode';
        feedback.innerHTML = msg;
    }

    const clearBtn = document.getElementById('scan-clear-btn');
    if (clearBtn) clearBtn.style.display = '';
    renderVisual();
};

window.clearScan = function() {
    scanState = null;
    const clearBtn = document.getElementById('scan-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const scanInput = document.getElementById('scan-input-val');
    if (scanInput) scanInput.value = currentScenario?.scanDefault || '';
    const feedback = document.getElementById('sim-feedback');
    if (feedback) { feedback.className = ''; feedback.innerHTML = ''; }
    renderVisual();
};


window.copySQL = function() {
    const sql = document.getElementById('sql-display').innerText;
    navigator.clipboard.writeText(sql).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Code', 2000);
    });
};

/* ═══════════════════════════════════════════════════════════
   QUERY EXECUTION ENGINE
   ═══════════════════════════════════════════════════════════ */

function renderQueryExecution(container, v) {
    const cols = v.columns || [];

    // YSQL layer banner
    const ysqlLayer = document.createElement('div');
    ysqlLayer.className = 'ysql-layer';
    ysqlLayer.id = 'ysql-layer';
    const sql = currentScenario.queryConfig?.sql || '';
    ysqlLayer.innerHTML = `
        <div class="ysql-top">
            <span class="ysql-badge">YSQL Query Layer</span>
            <span class="ysql-rpc-pill" id="ysql-rpc-pill"></span>
        </div>
        <code class="ysql-sql">${sql}</code>
        <div class="ysql-status" id="ysql-status">Click <b>Step</b> or <b>Play All</b> to begin execution</div>
    `;
    container.appendChild(ysqlLayer);

    // RPC flow connector
    const rpcFlow = document.createElement('div');
    rpcFlow.className = 'rpc-flow';
    rpcFlow.id = 'rpc-flow';
    rpcFlow.innerHTML = `<span class="rpc-flow-label" id="rpc-flow-label">▼ RPC</span>`;
    container.appendChild(rpcFlow);

    const wrapper = document.createElement('div');
    wrapper.id = 'qe-tablet-grid';

    if (v.indexColumns && v.tableColumns) {
        let globalIdx = 0;

        // 1. Top Tablets
        const idxTitle = document.createElement('div');
        idxTitle.className = 'idx-section-title';
        idxTitle.style.color = v.topColor || 'var(--purple)';
        idxTitle.style.margin = '0 0 8px 0';
        idxTitle.innerText = v.topTitle || `▸ Secondary Index Tablets`;
        wrapper.appendChild(idxTitle);

        const idxGrid = document.createElement('div');
        idxGrid.className = 'tablet-grid';
        (scenarioState.indexTablets || []).forEach(t => {
            const card = buildTabletCard(t, v.indexColumns, v.topColor === 'var(--accent)' ? 'accent' : 'purple', globalIdx++);
            idxGrid.appendChild(card);
        });
        wrapper.appendChild(idxGrid);

        // 2. Bottom Tablets
        const tblTitle = document.createElement('div');
        tblTitle.className = 'idx-section-title';
        tblTitle.style.color = v.bottomColor || 'var(--accent)';
        tblTitle.style.margin = '20px 0 8px 0';
        tblTitle.innerText = v.bottomTitle || `▸ Main Table Tablets`;
        wrapper.appendChild(tblTitle);

        const tblGrid = document.createElement('div');
        tblGrid.className = 'tablet-grid';
        (scenarioState.tableTablets || []).forEach(t => {
            const card = buildTabletCard(t, v.tableColumns, 'accent', globalIdx++);
            tblGrid.appendChild(card);
        });
        wrapper.appendChild(tblGrid);

    } else {
        const grid = document.createElement('div');
        grid.className = 'tablet-grid';
        (scenarioState.tablets || []).forEach((t, idx) => {
            const card = buildTabletCard(t, cols, 'accent', idx);
            grid.appendChild(card);
        });
        wrapper.appendChild(grid);
    }
    container.appendChild(wrapper);

    // Execution Log
    const log = document.createElement('div');
    log.className = 'exec-log';
    log.id = 'qe-exec-log';
    log.innerHTML = `<div class="exec-log-title">📋 DocDB Execution Log</div><div class="exec-log-entries" id="qe-log-entries"></div>`;
    container.appendChild(log);

    // Callout
    if (currentScenario.callout) {
        const c = document.createElement('div');
        c.className = `callout ${currentScenario.callout.type||'info'}`;
        c.style.margin = '20px 0';
        c.innerHTML = `<span class="callout-icon">${currentScenario.callout.icon}</span><div>${currentScenario.callout.text}</div>`;
        container.appendChild(c);
    }
}

function applyQueryStep(stepIdx) {
    const qc = currentScenario.queryConfig;
    if (!qc || stepIdx >= qc.steps.length) return;
    const step = qc.steps[stepIdx];
    const grid = document.getElementById('qe-tablet-grid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.tablet-card');
    const totalTablets = cards.length;

    // Reset all visual states
    cards.forEach(card => {
        card.classList.remove('scan-active', 'scan-dimmed', 'scan-done');
        card.querySelectorAll('tr[data-row-idx]').forEach(tr => {
            tr.classList.remove('row-returned', 'row-scanned', 'row-skipped', 'scan-cursor');
        });
    });

    // Apply tablet states
    if (step.dimOthers) {
        cards.forEach(card => card.classList.add('scan-dimmed'));
    }
    (step.tablets || []).forEach(ts => {
        const card = cards[ts.id];
        if (!card) return;
        card.classList.remove('scan-dimmed');
        if (ts.state === 'active') card.classList.add('scan-active');
        else if (ts.state === 'done') card.classList.add('scan-done');
    });

    // Apply row states
    (step.rows || []).forEach(rs => {
        const card = cards[rs.tablet];
        if (!card) return;
        card.classList.remove('scan-dimmed');
        const tr = card.querySelector(`tr[data-row-idx="${rs.row}"]`);
        if (!tr) return;
        if (rs.state === 'returned') tr.classList.add('row-returned');
        else if (rs.state === 'scanned') tr.classList.add('row-scanned');
        else if (rs.state === 'skipped') tr.classList.add('row-skipped');
        else if (rs.state === 'cursor') tr.classList.add('scan-cursor');
    });

    // Update YSQL layer
    const ysqlStatus = document.getElementById('ysql-status');
    const rpcFlowLabel = document.getElementById('rpc-flow-label');
    const ysqlRpcPill = document.getElementById('ysql-rpc-pill');
    const ysqlLayer = document.getElementById('ysql-layer');
    const defaultYsqlStatus = {
        route: 'Analyzing query plan and tablet boundaries...',
        hash: 'Hash routing — directing to single tablet...',
        fanout: 'Dispatching parallel RPCs to tablet servers...',
        seek: 'Seeking to start positions in tablet(s)...',
        next: 'Scanning rows from tablet(s)...',
        skip: 'Skip scan — jumping to next key boundary...',
        return: 'Rows returning to query layer...',
        agg: 'Receiving partial aggregate from tablet...',
        done: '✓ Query complete'
    };
    if (ysqlStatus) ysqlStatus.innerHTML = step.ysqlStatus || defaultYsqlStatus[step.op] || '';
    if (ysqlLayer) {
        ysqlLayer.className = 'ysql-layer ysql-op-' + step.op;
    }
    const isReturn = ['return', 'agg', 'done'].includes(step.op);
    const isBoth = step.op === 'next';
    if (rpcFlowLabel) {
        rpcFlowLabel.textContent = isBoth ? '⇅ In flight' : isReturn ? '▲ Results' : '▼ RPC';
        rpcFlowLabel.className = 'rpc-flow-label ' + (isReturn ? 'rpc-up' : isBoth ? 'rpc-both' : 'rpc-down');
    }
    const activeCount = (step.tablets || []).filter(t => t.state === 'active' || t.state === 'done').length;
    if (ysqlRpcPill && activeCount > 0) {
        ysqlRpcPill.textContent = `${activeCount} tablet${activeCount !== 1 ? 's' : ''}`;
        ysqlRpcPill.style.display = '';
    } else if (ysqlRpcPill) {
        ysqlRpcPill.style.display = 'none';
    }

    // Add log entry
    const logEntries = document.getElementById('qe-log-entries');
    if (logEntries) {
        const entry = document.createElement('div');
        entry.className = `exec-entry op-${step.op}`;
        entry.innerHTML = `<span class="op-label">${step.op}</span><span class="op-detail">${step.detail}</span>`;
        logEntries.appendChild(entry);
        logEntries.scrollTop = logEntries.scrollHeight;
    }

    // Show summary on done
    if (step.op === 'done' && step.summary) {
        const s = step.summary;
        const log = document.getElementById('qe-exec-log');
        if (log) {
            const sumDiv = document.createElement('div');
            sumDiv.className = 'exec-summary';
            sumDiv.innerHTML = `
                <div class="exec-stat"><div class="exec-stat-val">${s.tablets}</div><div class="exec-stat-label">Tablets</div></div>
                <div class="exec-stat"><div class="exec-stat-val">${s.seeks}</div><div class="exec-stat-label">Seeks</div></div>
                <div class="exec-stat"><div class="exec-stat-val">${s.nexts}</div><div class="exec-stat-label">Nexts</div></div>
                <div class="exec-stat"><div class="exec-stat-val">${s.rows}</div><div class="exec-stat-label">Rows</div></div>
            `;
            log.appendChild(sumDiv);
        }
        // Restore all tablet visibility on done
        cards.forEach(card => {
            card.classList.remove('scan-dimmed', 'scan-active');
            card.classList.add('scan-done');
        });
    }

    // Update step counter
    const counter = document.getElementById('qe-step-counter');
    if (counter) counter.textContent = `${stepIdx + 1} / ${qc.steps.length}`;

    // Update feedback
    const feedback = document.getElementById('sim-feedback');
    if (feedback) feedback.innerHTML = step.detail;

    // Disable step button if done
    const stepBtn = document.getElementById('qe-step-btn');
    const playBtn = document.getElementById('qe-play-btn');
    if (stepIdx >= qc.steps.length - 1) {
        if (stepBtn) stepBtn.disabled = true;
        if (playBtn) playBtn.disabled = true;
    }
}

window.runQueryStep = function() {
    const qc = currentScenario?.queryConfig;
    if (!qc || queryStepIndex >= qc.steps.length) return;
    applyQueryStep(queryStepIndex);
    queryStepIndex++;
};

window.runAllSteps = function() {
    const qc = currentScenario?.queryConfig;
    if (!qc || queryPlaying) return;
    queryPlaying = true;
    const playBtn = document.getElementById('qe-play-btn');
    if (playBtn) { playBtn.textContent = '⏸ Playing...'; playBtn.disabled = true; }

    function playNext() {
        if (queryStepIndex >= qc.steps.length) {
            queryPlaying = false;
            return;
        }
        applyQueryStep(queryStepIndex);
        queryStepIndex++;
        setTimeout(playNext, 800);
    }
    playNext();
};

window.resetQuery = function() {
    queryStepIndex = 0;
    queryPlaying = false;
    scenarioState = JSON.parse(JSON.stringify(currentScenario.initialState || {}));
    const feedback = document.getElementById('sim-feedback');
    if (feedback) feedback.textContent = 'Reset — ready to step through query';
    renderVisual();
    // Re-render controls
    const qc = currentScenario.queryConfig;
    const stepBtn = document.getElementById('qe-step-btn');
    const playBtn = document.getElementById('qe-play-btn');
    const counter = document.getElementById('qe-step-counter');
    if (stepBtn) stepBtn.disabled = false;
    if (playBtn) { playBtn.disabled = false; playBtn.textContent = '▶ Play All'; }
    if (counter) counter.textContent = `0 / ${qc.steps.length}`;
    // Clear log
    const logEntries = document.getElementById('qe-log-entries');
    if (logEntries) logEntries.innerHTML = '';
    // Remove summary
    const summary = document.querySelector('.exec-summary');
    if (summary) summary.remove();
};

function renderHome(container) {
    container.innerHTML = `
        <div class="home-container">
            <div class="home-hero">
                <h2>YugabyteDB Data Model Explorer</h2>
                <p>Welcome to the interactive visualization engine. Explore how YugabyteDB's distributed DocDB storage layer handles sharding, secondary indexes, advanced topologies, and query execution under the hood.</p>
            </div>

            <div class="home-sections-grid">
                <div class="home-section">
                    <div class="home-section-hdr">
                        <div class="hc-chapter-badge">Chapter 1</div>
                        <h3>📦 Core Sharding &amp; Storage</h3>
                        <p>How data is physically sliced and spread across cluster nodes.</p>
                    </div>
                    <div class="home-grid">
                        <div class="home-card" onclick="selectScenario('hash-single')">
                            <div class="home-card-icon">🔢</div>
                            <div class="home-card-title">Hash Sharding</div>
                            <div class="home-card-desc">Distributed storage using consistent hashing. Optimized for massive point-lookup scalability.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('range-single')">
                            <div class="home-card-icon">📏</div>
                            <div class="home-card-title">Range Sharding</div>
                            <div class="home-card-desc">Native ordered data distribution. Perfect for contiguous range scans and time-series workloads.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('hash-data-org')">
                            <div class="home-card-icon">📊</div>
                            <div class="home-card-title">Data Org</div>
                            <div class="home-card-desc">Understand DocDB's physical layout: Key-Value packing and ASC vs DESC sorting in storage.</div>
                            <button class="home-card-btn">See Layout &rarr;</button>
                        </div>
                    </div>
                </div>

                <div class="home-section">
                    <div class="home-section-hdr">
                        <div class="hc-chapter-badge">Chapter 2</div>
                        <h3>⚡ Secondary Indexes</h3>
                        <p>Global indexes for finding data without scanning every tablet.</p>
                    </div>
                    <div class="home-grid">
                        <div class="home-card" onclick="selectScenario('idx-hash-single')">
                            <div class="home-card-icon">📇</div>
                            <div class="home-card-title">Hash Indexes</div>
                            <div class="home-card-desc">Global distributed secondary indexes. Map non-primary key columns to tablet locations — single-RPC point lookups on any column.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-range-single')">
                            <div class="home-card-icon">📐</div>
                            <div class="home-card-title">Range Indexes</div>
                            <div class="home-card-desc">Globally ordered secondary indexes. Efficient BETWEEN and ORDER BY queries — with automatic tablet splits as the index grows.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-covering')">
                            <div class="home-card-icon">⚡</div>
                            <div class="home-card-title">Covering Index</div>
                            <div class="home-card-desc">INCLUDE columns stored in the index entry. Satisfies the entire query from the index — zero heap fetches back to the base table.</div>
                            <button class="home-card-btn">Optimize &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-partial')">
                            <div class="home-card-icon">✂️</div>
                            <div class="home-card-title">Partial Index</div>
                            <div class="home-card-desc">Conditional indexing with a WHERE clause. Index only the rows that queries actually touch — smaller index, faster scans.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-bucket')">
                            <div class="home-card-icon">🪣</div>
                            <div class="home-card-title">Hot Key Mitigation</div>
                            <div class="home-card-desc">Synthetic bucketing strategy. Spread write load on monotonic keys (timestamps, serial IDs) to eliminate write hotspots.</div>
                            <button class="home-card-btn">Mitigate &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-expression')">
                            <div class="home-card-icon">ƒ(x)</div>
                            <div class="home-card-title">Expression Index</div>
                            <div class="home-card-desc">Index on a computed value. Enable case-insensitive lookups and function-based predicates without changing stored data.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-unique')">
                            <div class="home-card-icon">🔒</div>
                            <div class="home-card-title">Unique Index</div>
                            <div class="home-card-desc">Cross-tablet uniqueness enforcement. Try inserting a duplicate to see the distributed constraint rejection in action.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('idx-multi-hash')">
                            <div class="home-card-icon">🔑</div>
                            <div class="home-card-title">Multi-column Hash Index</div>
                            <div class="home-card-desc">Both columns hashed together as one compound key. Enables equality lookups on column combinations with a single index RPC.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                    </div>
                </div>

                <div class="home-section">
                    <div class="home-section-hdr">
                        <div class="hc-chapter-badge">Chapter 3</div>
                        <h3>🌎 Global Topologies</h3>
                        <p>Optimizing for latency and regional data residency.</p>
                    </div>
                    <div class="home-grid">
                        <div class="home-card" onclick="selectScenario('colocated-tables')">
                            <div class="home-card-icon">📦</div>
                            <div class="home-card-title">Colocated Tables</div>
                            <div class="home-card-desc">Optimization for small datasets. Group multiple tables into a single tablet to reduce RPC overhead.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('partition-range')">
                            <div class="home-card-icon">🍰</div>
                            <div class="home-card-title">Table Partitioning</div>
                            <div class="home-card-desc">Logical data division. Efficient life cycle management and query pruning for large-scale datasets.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('geo-partitioning')">
                            <div class="home-card-icon">🌍</div>
                            <div class="home-card-title">Geo-Partitioning</div>
                            <div class="home-card-desc">Compliance and low latency. Pin data shards to specific geographic regions using Tablespaces.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('partition-index')">
                            <div class="home-card-icon">📑</div>
                            <div class="home-card-title">Partitioned Index</div>
                            <div class="home-card-desc">Local indexes on partitioned tables. Each partition gets its own index tablet — partition pruning eliminates irrelevant index seeks automatically.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                    </div>
                </div>

                <div class="home-section">
                    <div class="home-section-hdr">
                        <div class="hc-chapter-badge">Chapter 4</div>
                        <h3>⚙️ Execution Engine</h3>
                        <p>How queries interact with distributed storage.</p>
                    </div>
                    <div class="home-grid">
                        <div class="home-card" onclick="selectScenario('qe-full-scan')">
                            <div class="home-card-icon">🔍</div>
                            <div class="home-card-title">Full Table Scan</div>
                            <div class="home-card-desc">The baseline. Sequential scan across all tablets with no index — shows why column selection and predicate pushdown matter even without an index.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-hash-point')">
                            <div class="home-card-icon">🎯</div>
                            <div class="home-card-title">Point Lookups</div>
                            <div class="home-card-desc">High-performance O(1) row retrieval. Direct tablet routing with DocDB's packed row format.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-range-scan')">
                            <div class="home-card-icon">📊</div>
                            <div class="home-card-title">Scans &amp; Skips</div>
                            <div class="home-card-desc">Advanced scan techniques. Efficient contiguous walks and Skip Scan logic for multi-column indexes.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-index-lookup')">
                            <div class="home-card-icon">🗂️</div>
                            <div class="home-card-title">Index Scans</div>
                            <div class="home-card-desc">Index Scan vs Index-Only Scan. See when DocDB needs a second lookup to the base table and when covering columns eliminate it entirely.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-expr-pushdown')">
                            <div class="home-card-icon">⬇️</div>
                            <div class="home-card-title">Expression Pushdown</div>
                            <div class="home-card-desc">DocDB filter evaluation. Predicate expressions pushed to the storage layer — only matching rows cross the RPC boundary to YSQL.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-agg-pushdown')">
                            <div class="home-card-icon">∑</div>
                            <div class="home-card-title">Aggregate Pushdown</div>
                            <div class="home-card-desc">Distributed COUNT &amp; SUM. DocDB computes partial aggregates per tablet and merges at the query layer — zero raw row transfers.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-join-nl')">
                            <div class="home-card-icon">🤝</div>
                            <div class="home-card-title">Distributed Joins</div>
                            <div class="home-card-desc">Query coordination. Multi-tablet Nested Loop joins and distributed RPC planning across the cluster.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-parallel-scan')">
                            <div class="home-card-icon">⇄</div>
                            <div class="home-card-title">Parallel Range Scan</div>
                            <div class="home-card-desc">Multi-tablet parallel RPCs. Range queries fire simultaneous seeks across all overlapping tablets — wall-clock time ≈ slowest single tablet.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('qe-bucket-scan')">
                            <div class="home-card-icon">🪣</div>
                            <div class="home-card-title">Bucket Index Scan</div>
                            <div class="home-card-desc">Merge Append across all bucket tablets. Every ts range query fans out to all buckets — YSQL merges 3 ts-sorted streams without an extra sort pass.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                    </div>
                </div>

                <div class="home-section">
                    <div class="home-section-hdr">
                        <div class="hc-chapter-badge">Chapter 5</div>
                        <h3>🏗️ Data Modeling Patterns</h3>
                        <p>Production schema recipes that combine sharding, indexing, and clustering into real-world solutions.</p>
                    </div>
                    <div class="home-grid">
                        <div class="home-card" onclick="selectScenario('pattern-timeseries')">
                            <div class="home-card-icon">📅</div>
                            <div class="home-card-title">Time-Series</div>
                            <div class="home-card-desc">Bucket index on timestamp. Eliminates the write hotspot a plain ts index creates — spreads concurrent writes across N tablets from day one.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('pattern-multitenant')">
                            <div class="home-card-icon">🏢</div>
                            <div class="home-card-title">Multi-Tenant</div>
                            <div class="home-card-desc">tenant_id HASH as the first PK component. Routes every per-tenant query to exactly one tablet — no cluster-wide scatter-gather.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                        <div class="home-card" onclick="selectScenario('pattern-jsonb')">
                            <div class="home-card-icon">🗄️</div>
                            <div class="home-card-title">JSONB & GIN Index</div>
                            <div class="home-card-desc">Opaque JSONB storage with an inverted GIN index. One row generates N sorted index entries — <code>@&gt;</code> queries seek directly without scanning any JSON blobs.</div>
                            <button class="home-card-btn">Explore &rarr;</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
