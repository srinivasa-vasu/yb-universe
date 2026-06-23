'use strict';

// Guarded DOM lookup: returns the element, or null + a console warning if missing.
// Use `$('id')?.foo` so a stale/renamed id degrades gracefully instead of throwing
// and silently killing a scenario step mid-run.
function $(id) {
    const el = document.getElementById(id);
    if (!el) console.warn('[vector-explorer] missing element #' + id);
    return el;
}
window.$ = $;

// Run a scenario step/tour action without letting one bad lookup kill the whole flow.
// Handles both sync throws and rejected promises from async actions.
function runSafely(fn, label) {
    try {
        const r = fn();
        if (r && typeof r.catch === 'function') {
            r.catch(err => console.error('[vector-explorer] step "' + label + '" failed:', err));
        }
    } catch (err) {
        console.error('[vector-explorer] step "' + label + '" failed:', err);
    }
}

// Seeded PRNG (mulberry32) so structural demos — HNSW graph layouts, scatter clouds —
// reproduce the same picture every time a step is replayed, and match the narration's
// stated node counts. Genuine interactions (Add Random Item, token sampling) keep Math.random.
let _rngState = 0x9e3779b9;
function srand(seed) { _rngState = seed >>> 0; }
function srandom() {
    _rngState = (_rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
window.srand = srand;
window.srandom = srandom;

let speedVal = 1;
let currentScenarioIdx = -1;
let currentStepIdx = -1;
let isPlaying = false;
let playTimer = null;

// State snapshots for step-back
let stateSnapshots = [];

let svg, mathOverlay, distLabOverlay, ddlCode, logBody, iTitle, iDesc, activeBadge, dataPanel, ddlSec, normOverlay;

let vectors = [];
let queryVector = null;
let hnswNodes = [];
let activePath = [];
let lastAddedVector = null;
let labNormalize = false;
let highlightedIdx = -1;
let selectedTargetIdx = 0;
let hoveredIdx = -1;
let isDraggingQuery = false;
let probingNode = null;
let selectedSampleIdx = -1;
let sampleAnalysis = null;

let paramM = 16, paramEFC = 64, paramEFS = 40, paramK = 5, paramP = 0.70;
let currentDistMetric = 'l2';
window.setDistMetric = (m) => { currentDistMetric = m; };

// Guide System State
let guideEnabled = false;
let currentTourIdx = 0;
let currentTourScenario = null;

const mag = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
const dot = (v1, v2) => v1.x * v2.x + v1.y * v2.y;
const cosSim = (v1, v2) => {
    const m1 = mag(v1), m2 = mag(v2);
    return (m1 === 0 || m2 === 0) ? 0 : dot(v1, v2) / (m1 * m2);
};
const distL2 = (v1, v2) => Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.y - v2.y, 2));

const SVG_CENTER = 300;
const SVG_SCALE = 200;
const HNSW_LAYER_RADII = [200, 130, 60]; // L0=outer, L1=mid, L2=inner

const toCanvas = (x, y) => ({ cx: SVG_CENTER + x * SVG_SCALE, cy: SVG_CENTER - y * SVG_SCALE });
const fromCanvas = (cx, cy) => ({ x: (cx - SVG_CENTER) / SVG_SCALE, y: (SVG_CENTER - cy) / SVG_SCALE });

// Radial projection for HNSW: Layer 2 (Inner) -> Layer 0 (Outer)
const toHNSWCanvas = (x, y, layer) => {
    const angle = Math.atan2(y, x);
    const r = HNSW_LAYER_RADII[layer] ?? HNSW_LAYER_RADII[0];
    return {
        cx: SVG_CENTER + r * Math.cos(angle),
        cy: SVG_CENTER - r * Math.sin(angle)
    };
};

function initEngine() {
    svg = $('vector-canvas');
    mathOverlay = $('math-overlay');
    distLabOverlay = $('dist-lab-overlay');
    normOverlay = $('norm-info-overlay');
    ddlCode = $('ddl-code');
    ddlSec = $('ddl-sec');
    logBody = $('log-body');
    iTitle = $('i-title');
    iDesc = $('i-desc');
    activeBadge = $('active-badge');
    dataPanel = $('data-panel');

    const hookSlider = (id, targetId, cb, fmt) => {
        const el = document.getElementById(id);
        if (el) el.oninput = (e) => {
            const v = parseInt(e.target.value);
            $(targetId).textContent = fmt ? fmt(v) : v;
            cb(v);

            // SQL Reactivity for parameters
            if (id === 'param-m' || id === 'param-efc') {
                setInteractiveSQL(`CREATE INDEX ON items \nUSING hnsw (embedding vector_cosine_ops)\nWITH (m = ${paramM}, ef_construction = ${paramEFC});`);
            } else if (id === 'param-efs') {
                setInteractiveSQL(`SET hnsw.ef_search = ${paramEFS};\nSELECT * FROM items ORDER BY embedding <=> '[0.12, 0.45]' LIMIT 5;`);
            }
        };
    };
    hookSlider('param-m', 'val-m', v => { paramM = v; render(); });
    hookSlider('param-efc', 'val-efc', v => { paramEFC = v; render(); });
    hookSlider('param-efs', 'val-efs', v => { paramEFS = v; render(); });
    hookSlider('param-k', 'val-k', v => { paramK = v; render(); });
    hookSlider('param-k-2', 'val-k-2', v => { paramK = v; render(); });
    hookSlider('param-p', 'val-p', v => { paramP = v / 100; render(); }, v => (v / 100).toFixed(2));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.key.toLowerCase()) {
            case 'arrowright':
            case 's':
                if (e.metaKey || e.ctrlKey) break;
                e.preventDefault();
                if (guideEnabled) nextTourStep();
                else stepForward();
                break;
            case 'arrowleft':
                e.preventDefault();
                if (guideEnabled) prevTourStep();
                else stepBack();
                break;
            case 'arrowup':
                e.preventDefault();
                if (currentScenarioIdx > 0) selectScenario(currentScenarioIdx - 1);
                break;
            case 'arrowdown':
                e.preventDefault();
                if (currentScenarioIdx < AI_SCENARIOS.length - 1) selectScenario(currentScenarioIdx + 1);
                break;
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'r':
                if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    resetScenario();
                }
                break;
            case 'f':
                if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    toggleFocusMode();
                }
                break;
            case 'h':
                e.preventDefault();
                selectScenario(0);
                break;
            case 'g':
                e.preventDefault();
                const gToggle = $('guide-toggle');
                if (gToggle) {
                    gToggle.checked = !gToggle.checked;
                    toggleGuideSetting(gToggle.checked);
                }
                break;
            case '[':
                e.preventDefault();
                toggleSidebar();
                break;
            case ']':
                e.preventDefault();
                toggleInfoPanel();
                break;
            case '?':
            case '/':
                if (e.shiftKey || e.key === '?') {
                    e.preventDefault();
                    toggleHelp();
                }
                break;
            case 'escape':
                const helpModal = $('help-modal');
                if (helpModal && window.getComputedStyle(helpModal).display !== 'none') {
                    e.preventDefault();
                    toggleHelp();
                }
                break;
            default:
                // Scenario selection: 0-9
                const num = parseInt(e.key);
                if (!isNaN(num) && num >= 0 && num <= 9 && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    selectScenario(num);
                }
        }
    });

    // Inject copy buttons into guide code blocks
    injectCopyButtons();

    if (typeof AI_SCENARIOS !== 'undefined') selectScenario(0);

    // Initialize dragging handlers
    window.onmousemove = handleMouseMove;
    window.onmouseup = handleMouseUp;

    // Use handleMouseDown as the primary handler
    svg.onmousedown = handleMouseDown;
}

// ── STATE SNAPSHOT MANAGEMENT ──

function captureState() {
    return {
        vectors: JSON.parse(JSON.stringify(vectors)),
        queryVector: queryVector ? { ...queryVector } : null,
        hnswNodes: JSON.parse(JSON.stringify(hnswNodes)),
        activePath: JSON.parse(JSON.stringify(activePath)),
        logBodyHTML: logBody.innerHTML,
        ddlHTML: ddlCode.innerHTML,
        showCategoryHulls: window.showCategoryHulls || false,
    };
}

function restoreState(snapshot) {
    vectors = snapshot.vectors;
    queryVector = snapshot.queryVector;
    hnswNodes = snapshot.hnswNodes;
    activePath = snapshot.activePath;
    logBody.innerHTML = snapshot.logBodyHTML;
    ddlCode.innerHTML = snapshot.ddlHTML;
    window.showCategoryHulls = snapshot.showCategoryHulls;
    render();
}

// ── NARRATION BAR ──

function updateNarration() {
    const bar = $('narration-bar');
    const badge = $('narration-badge');
    const text = $('narration-text');
    if (!bar) return;

    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (!sc) return;

    if (sc.isHome) {
        bar.style.display = 'none';
        return;
    }

    if (currentStepIdx < 0) {
        bar.classList.add('idle');
        bar.style.display = 'flex';
        badge.textContent = 'Ready';
        text.textContent = `${sc.name} — click Step → to begin`;
    } else if (sc.steps && sc.steps[currentStepIdx]) {
        bar.classList.remove('idle');
        bar.style.display = 'flex';
        const step = sc.steps[currentStepIdx];
        badge.textContent = `Step ${currentStepIdx + 1} of ${sc.steps.length}`;
        // Strip HTML tags for narration
        const d = step.desc || '';
        text.textContent = step.label + (d ? ' — ' + d.replace(/<[^>]*>/g, '') : '');
    }
}

// ── STEP PROGRESS ──

function updateStepProgress() {
    const sec = $('step-sec');
    if (!sec) return;
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (!sc || !sc.steps) {
        sec.innerHTML = '<span class="scount">—</span>';
        return;
    }

    let html = '<div class="step-progress">';
    sc.steps.forEach((step, i) => {
        let cls = 'step-dot';
        if (i < currentStepIdx) cls += ' done';
        else if (i === currentStepIdx) cls += ' active';
        html += `<div class="${cls}" title="${step.label}" onclick="jumpToStep(${i})"></div>`;
    });
    html += '</div>';
    html += `<span class="scount" style="margin-left:auto; font-family:var(--mono); font-size:9px; color:var(--txt3)">${currentStepIdx + 1} / ${sc.steps.length}</span>`;
    sec.innerHTML = html;
}

function selectScenario(idx) {
    if (idx < 0 || idx >= AI_SCENARIOS.length) return;
    currentScenarioIdx = idx; currentStepIdx = -1; isPlaying = false;
    stateSnapshots = [];
    if (playTimer) clearInterval(playTimer);
    if (window._dimTimer) { clearInterval(window._dimTimer); window._dimTimer = null; }
    const sc = AI_SCENARIOS[idx];

    iTitle.textContent = sc.name;
    iDesc.innerHTML = sc.desc;

    // Set badge text - use a generic one for home, or the scenario name
    if (sc.isHome) {
        const hv = $('home-view');
        if (hv) hv.dataset.rendered = '';
    }

    if (activeBadge) {
        if (sc.isHome) {
            activeBadge.textContent = "AI & Vector Explorer";
            activeBadge.style.color = "var(--accent)";
            activeBadge.style.background = "rgba(168, 85, 247, 0.1)";
            activeBadge.style.borderColor = "rgba(168, 85, 247, 0.3)";
        } else {
            activeBadge.textContent = sc.name;
            activeBadge.style.color = "var(--accent)";
            activeBadge.style.background = "rgba(168, 85, 247, 0.08)";
            activeBadge.style.borderColor = "rgba(168, 85, 247, 0.3)";
        }
    }

    document.querySelectorAll('.sbtn').forEach((b, i) => b.classList.toggle('active', i === idx));
    window.showCategoryHulls = false;

    if (guideEnabled) {
        renderTour();
    } else {
        closeTour();
    }

    resetScenario();
}

function resetScenario() {
    currentStepIdx = -1; const sc = AI_SCENARIOS[currentScenarioIdx];
    stateSnapshots = [];
    logBody.innerHTML = '';
    if (sc.sql) { ddlSec.style.display = 'block'; ddlCode.innerHTML = highlightSQL(sc.sql); }
    else { ddlSec.style.display = 'none'; ddlCode.innerHTML = ''; }
    lastAddedVector = null; labNormalize = false; highlightedIdx = -1; selectedTargetIdx = 0;
    selectedSampleIdx = -1;
    sampleAnalysis = null;
    window.rangeSearchRadius = 0;
    window.showCategoryHulls = false;
    queryVector = null;
    activePath = [];
    if (svg) svg.innerHTML = '';

    // Reset Overlays
    const refOverlay = $('metrics-ref-overlay');
    if (refOverlay) refOverlay.style.display = 'none';
    const dlo = $('dist-lab-overlay');
    if (dlo) dlo.style.display = 'none';
    const sco = $('sampling-controls');
    if (sco) sco.style.display = 'none';
    if (typeof normOverlay !== 'undefined' && normOverlay) normOverlay.style.display = 'none';

    if (sc.init) sc.init();
    renderExtraBtns(sc.extraBtns);
    updateNarration();
    updateStepProgress();
    updateBackButton();
    render();
}

function renderExtraBtns(btns) {
    const container = $('extra-btns'); container.innerHTML = '';
    if (!btns) return;
    btns.forEach(b => {
        const btn = document.createElement('button');
        btn.className = `btn ${b.cls || ''}`; btn.style.fontSize = '10px'; btn.style.padding = '5px 10px';
        btn.textContent = b.label; btn.onclick = () => window[b.cb] ? window[b.cb]() : console.error(b.cb);
        container.appendChild(btn);
    });
}

function highlightVector(idx) {
    highlightedIdx = idx;
    addLog('HIGHLIGHT', `Focusing on: ${vectors[idx].label}`);
    render();
    if (window._highlightTimer) clearTimeout(window._highlightTimer);
    window._highlightTimer = setTimeout(() => {
        highlightedIdx = -1;
        render();
    }, 3000);
}

function setInteractiveSQL(code) {
    if (!code) return;
    const highlighted = highlightSQL(code);
    ddlSec.style.display = 'block';
    ddlCode.innerHTML = `<div style="color:var(--leader); font-size:9px; margin-bottom:5px; border-bottom:1px solid var(--border-hi)">-- LIVE ACTION SQL</div>${highlighted}`;
}
window.setInteractiveSQL = setInteractiveSQL;

// Semantic Pool - Fixed items with consistent coordinates
const SEMANTIC_POOL = [
    { label: 'Orange', x: 0.82, y: 0.15, cat: 'Fruits' },
    { label: 'Pineapple', x: 0.75, y: 0.35, cat: 'Fruits' },
    { label: 'Mango', x: 0.90, y: 0.10, cat: 'Fruits' },
    { label: 'Kiwi', x: 0.65, y: 0.40, cat: 'Fruits' },
    { label: 'Blueberry', x: 0.88, y: 0.25, cat: 'Fruits' },
    { label: 'Laptop', x: -0.60, y: 0.75, cat: 'Electronics' },
    { label: 'Smartphone', x: -0.50, y: 0.85, cat: 'Electronics' },
    { label: 'Tablet', x: -0.45, y: 0.65, cat: 'Electronics' },
    { label: 'Monitor', x: -0.75, y: 0.55, cat: 'Electronics' },
    { label: 'Camera', x: -0.30, y: 0.90, cat: 'Electronics' },
    { label: 'Coffee', x: 0.10, y: -0.80, cat: 'Beverage' },
    { label: 'Tea', x: 0.20, y: -0.75, cat: 'Beverage' },
    { label: 'Juice', x: 0.35, y: -0.60, cat: 'Beverage' }
];

const PRODUCT_CATALOG = [
    { name: 'Tablet', category: 'Electronics', price: 449, x: 0.18, y: 0.48, shard: 1 },
    { name: 'E-Reader', category: 'Electronics', price: 129, x: 0.05, y: 0.42, shard: 2 },
    { name: 'Noise-Canceling Headphones', category: 'Electronics', price: 299, x: 0.12, y: 0.58, shard: 3 },
    { name: 'Gaming Laptop', category: 'Electronics', price: 1299, x: 0.82, y: 0.74, shard: 1 },
    { name: 'Mirrorless Camera', category: 'Electronics', price: 899, x: 0.58, y: 0.66, shard: 2 },
    { name: 'Smartwatch', category: 'Electronics', price: 249, x: 0.25, y: 0.54, shard: 3 },
    { name: 'Blender', category: 'Home', price: 89, x: -0.58, y: -0.10, shard: 1 },
    { name: 'Desk Lamp', category: 'Home', price: 59, x: -0.35, y: 0.05, shard: 2 },
    { name: 'Running Shoes', category: 'Sports', price: 119, x: -0.12, y: -0.52, shard: 3 }
];

const KNOWLEDGE_BASE = [
    {
        id: 1,
        title: 'Raft Replication',
        content: 'YugabyteDB replicates each shard with the Raft consensus protocol so a healthy replica can take over leadership automatically.',
        x: -0.05,
        y: 0.82
    },
    {
        id: 2,
        title: 'Availability Zones',
        content: 'Tablet replicas are typically spread across availability zones to preserve availability during zone-level failures.',
        x: 0.05,
        y: 0.74
    },
    {
        id: 3,
        title: 'Elastic Scaling',
        content: 'Tablet rebalancing lets YugabyteDB add capacity online while continuing to serve reads and writes.',
        x: 0.68,
        y: 0.18
    },
    {
        id: 4,
        title: 'Follower Reads',
        content: 'Follower reads reduce latency for globally distributed applications by serving nearby consistent reads.',
        x: 0.46,
        y: -0.22
    }
];

function cloneVectors(items, scaleMap = {}) {
    return items.map((item, i) => {
        const scale = scaleMap[item.label] || 1;
        return {
            idx: i,
            x: item.x * scale,
            y: item.y * scale,
            ox: item.x * scale,
            oy: item.y * scale,
            label: item.label,
            cat: item.cat,
            color: item.cat === 'Fruits' ? '#f59e0b' : (item.cat === 'Electronics' ? '#3b82f6' : '#10b981')
        };
    });
}

function loadSemanticScenarioSet(type = 'standard') {
    const base = SEMANTIC_POOL.filter((item) => item.cat !== 'Beverage').slice(0, 6);
    if (type === 'magnitude') {
        return cloneVectors(base, {
            Orange: 0.75,
            Pineapple: 0.95,
            Mango: 1.1,
            Laptop: 0.8,
            Smartphone: 1.2,
            Tablet: 0.65
        });
    }
    return cloneVectors(base);
}

function getScenarioMetric(sc) {
    if (!sc) return 'l2';
    if (sc.name === 'Distance Metrics') return currentDistMetric;
    if (sc.name === 'Cosine Similarity Search') return 'cosine';
    if (sc.name === 'Inner Product Search') return 'ip';
    if (sc.name === 'Top-K Sampling' || sc.name === 'Top-P (Nucleus) Sampling' || sc.name === 'Hybrid Sampling (Synergy)') return 'sampling';
    return 'l2';
}

function getMetricSQL(metric) {
    if (metric === 'cosine') return '<=>';
    if (metric === 'ip') return '<#>';
    return '<->';
}

function getMetricValue(metric, q, v) {
    if (metric === 'cosine') {
        const similarity = cosSim(q, v);
        return { orderValue: 1 - similarity, primaryValue: 1 - similarity, secondaryValue: similarity, label: 'Cos Dist' };
    }
    if (metric === 'ip') {
        const score = dot(q, v);
        return { orderValue: -score, primaryValue: score, secondaryValue: -score, label: 'IP Score' };
    }
    const distance = distL2(q, v);
    return { orderValue: distance, primaryValue: distance, secondaryValue: distance, label: 'L2 Dist' };
}

function computeSamplingAnalysis(selectedIndex = null) {
    if (!vectors.length) return null;
    const items = vectors.map((v, i) => {
        const baseProb = typeof v.prob === 'number' ? v.prob : 1 / vectors.length;
        return { i, prob: baseProb, label: v.label || `Token ${i + 1}` };
    }).sort((a, b) => b.prob - a.prob);

    const topKIndices = new Set(items.slice(0, paramK).map((it) => it.i));
    const topPIndices = new Set();
    let cumulative = 0;
    for (const item of items) {
        const nextCumulative = cumulative + item.prob;
        if (nextCumulative <= paramP || topPIndices.size === 0) {
            topPIndices.add(item.i);
            cumulative = nextCumulative;
        } else {
            break;
        }
    }

    const sc = AI_SCENARIOS[currentScenarioIdx];
    let eligible = items;
    if (sc.name === 'Top-K Sampling') eligible = items.filter((it) => topKIndices.has(it.i));
    else if (sc.name === 'Top-P (Nucleus) Sampling') eligible = items.filter((it) => topPIndices.has(it.i));
    else eligible = items.filter((it) => topKIndices.has(it.i) && topPIndices.has(it.i));

    const eligibleMass = eligible.reduce((sum, item) => sum + item.prob, 0);
    const selected = eligible.find((item) => item.i === selectedIndex) || null;
    return { items, topKIndices, topPIndices, eligible, eligibleMass, selected };
}

function formatHybridResults(results) {
    if (!results.length) return 'No rows matched the structural filter.';
    return results.map((item, idx) => `${idx + 1}. <b>${item.name}</b> - $${item.price} (Dist: ${item.distance.toFixed(3)})`).join('<br>');
}

function computeHybridResults(limit = Math.max(2, paramK)) {
    const query = { x: 0.12, y: 0.45 };
    return PRODUCT_CATALOG
        .filter((item) => item.category === 'Electronics' && item.price < 500)
        .map((item) => ({ ...item, distance: 1 - cosSim(query, item) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
}

function computeDistributedShardResults(limit = Math.max(3, paramK)) {
    const query = { x: 0.12, y: 0.45 };
    const perShard = [1, 2, 3].map((shard) =>
        PRODUCT_CATALOG
            .filter((item) => item.shard === shard)
            .map((item) => ({ ...item, distance: 1 - cosSim(query, item) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, Math.min(3, limit))
    );
    const merged = perShard.flat().sort((a, b) => a.distance - b.distance).slice(0, limit);
    return { perShard, merged };
}

function computeRAGResults(limit = 2) {
    const query = { x: 0.0, y: 0.78 };
    const chunks = KNOWLEDGE_BASE
        .map((chunk) => ({ ...chunk, distance: 1 - cosSim(query, chunk) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
    return { query, chunks };
}

const SAMPLING_VOCAB = [
    'relevant', 'grounded', 'retrieval', 'ranking', 'context', 'embedding', 'cluster', 'signal',
    'precision', 'recall', 'latency', 'filter', 'semantic', 'search', 'vector', 'prompt',
    'answer', 'chunk', 'document', 'query', 'result', 'candidate', 'response', 'token',
    'nucleus', 'diversity', 'quality', 'hybrid', 'safety', 'reasoning', 'memory', 'intent',
    'summary', 'evidence', 'citation', 'alignment', 'coverage', 'confidence', 'match', 'focus'
];

// Actions
window.showL2Example = () => {
    queryVector = { x: 0.1, y: 0.1 };
    vectors = [
        { idx: 0, x: 0.1, y: 0.1, label: 'Perfect Match (Dist 0)', color: '#10b981' },
        { idx: 1, x: 0.5, y: 0.5, label: 'Near (Dist ~0.56)', color: '#3b82f6' },
        { idx: 2, x: -0.8, y: 0.9, label: 'Far (Dist ~1.2)', color: '#ef4444' }
    ];
    if (selectedTargetIdx >= vectors.length) selectedTargetIdx = 0;
    if (labNormalize) window.toggleLabNorm();
    addLog('L2 Distance', 'Measures straight-line Euclidean distance. Range [0, ∞). 0 is a perfect match.');
    setInteractiveSQL(`-- L2 Distance: Finds closest vectors in Euclidean space\nSELECT name, embedding <-> '[0.1, 0.1]' as dist FROM items ORDER BY dist LIMIT 3;`);
    render();
};

window.showCosineExample = () => {
    queryVector = { x: 0.5, y: 0.5 };
    vectors = [
        { idx: 0, x: 0.8, y: 0.8, label: 'Parallel (Sim 1, Dist 0)', color: '#10b981' },
        { idx: 1, x: -0.5, y: 0.5, label: 'Orthogonal (Sim 0, Dist 1)', color: '#f59e0b' },
        { idx: 2, x: -0.5, y: -0.5, label: 'Opposite (Sim -1, Dist 2)', color: '#ef4444' }
    ];
    if (selectedTargetIdx >= vectors.length) selectedTargetIdx = 0;
    if (labNormalize) window.toggleLabNorm();
    addLog('Cosine Distance', 'Measures angle between vectors, ignoring magnitude. Dist = 1 - CosineSimilarity. Range [0, 2].');
    setInteractiveSQL(`-- Cosine Distance: Finds vectors pointing in the most similar direction\nSELECT name, embedding <=> '[0.5, 0.5]' as dist FROM items ORDER BY dist LIMIT 3;`);
    render();
};

window.showIPExample = () => {
    queryVector = { x: 0.8, y: 0.8 };
    vectors = [
        { idx: 0, x: 1.2, y: 1.2, label: 'Large Pos (Similar & Large Mag)', color: '#10b981' },
        { idx: 1, x: -1.2, y: -1.2, label: 'Large Neg (Opposite & Large Mag)', color: '#ef4444' },
        { idx: 2, x: -0.2, y: 0.8, label: 'Near Zero (Orthogonal)', color: '#f59e0b' }
    ];
    if (selectedTargetIdx >= vectors.length) selectedTargetIdx = 0;
    if (labNormalize) window.toggleLabNorm();
    addLog('Inner Product', 'Multiplies vectors. Higher positive = more similar. YugabyteDB uses -IP for distance. Range (-∞, ∞).');
    setInteractiveSQL(`-- Inner Product: Distance is calculated as negative inner product\nSELECT name, embedding <#> '[0.8, 0.8]' as dist FROM items ORDER BY dist LIMIT 3;`);
    render();
};

window.addRandomVector = () => {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (sc.showHNSW) {
        const layer = Math.floor(Math.random() * 3);
        hnswNodes.push({ x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 2.4, layer: layer });
        render();
        return;
    }

    const available = SEMANTIC_POOL.filter(p => !vectors.find(v => v.label && v.label.startsWith(p.label)));

    let x, y, label, cat;

    if (available.length > 0) {
        const item = available[Math.floor(Math.random() * available.length)];
        x = item.x;
        y = item.y;
        label = item.label;
        cat = item.cat;
    } else {
        // Fallback to purely random
        x = (Math.random() - 0.5) * 2;
        y = (Math.random() - 0.5) * 2;
        label = `Object-${vectors.length + 1}`;
        cat = 'Misc';
        addLog('Random', 'Pool exhausted, generating random coordinates.');
    }

    if (labNormalize) {
        const m = Math.sqrt(x*x + y*y);
        if (m > 0) { x /= m; y /= m; }
    }

    const newVec = {
        x, y, ox: x, oy: y,
        label: label + (labNormalize ? ' (Norm)' : ''),
        color: cat === 'Fruits' ? '#f59e0b' : (cat === 'Electronics' ? '#3b82f6' : cat === 'Beverage' ? '#10b981' : '#6366f1'),
        cat: cat
    };
    vectors.push(newVec);

    setInteractiveSQL(`INSERT INTO items (name, embedding) \nVALUES ('${label}', '[${x.toFixed(3)}, ${y.toFixed(3)}]');`);

    addLog('INSERT', `Inserted ${label} (${cat}) at [${x.toFixed(2)}, ${y.toFixed(2)}]`);
    render();
};

window.runVectorSearch = async () => {
    if (!queryVector) return addLog('Notice', 'Click canvas to place Query!');

    const sc = AI_SCENARIOS[currentScenarioIdx];
    const metric = getScenarioMetric(sc);
    const op = getMetricSQL(metric);
    const selectExpr = metric === 'ip' ? `(embedding <#> '[${queryVector.x.toFixed(3)}, ${queryVector.y.toFixed(3)}]') * -1` : `embedding ${op} '[${queryVector.x.toFixed(3)}, ${queryVector.y.toFixed(3)}]'`;
    const alias = metric === 'ip' ? 'score' : 'dist';
    setInteractiveSQL(`SELECT name, ${selectExpr} AS ${alias}\nFROM items\nORDER BY ${metric === 'ip' ? `embedding ${op}` : alias} LIMIT ${Math.max(1, paramK)};`);

    let best = null;
    let bestMetric = Infinity;
    let bestIdx = -1;
    vectors.forEach((v, i) => {
        const metricValue = getMetricValue(metric, queryVector, v).orderValue;
        if (metricValue < bestMetric) {
            bestMetric = metricValue;
            best = v;
            bestIdx = i;
        }
    });
    if (best) {
        addLog('RESULT', `${best.label} ranked #1 by ${metric === 'cosine' ? 'cosine distance' : (metric === 'ip' ? 'inner product score' : 'L2 distance')}.`);
        highlightVector(bestIdx);
    }
};

window.normalizeStep = async () => {
    if (window._isNormalizing) return;
    if (vectors.length === 0) return addLog('Notice', 'Add a vector first!');
    window._isNormalizing = true;
    const original = JSON.parse(JSON.stringify(vectors));
    for(let s = 0; s <= 20; s++) {
        vectors = original.map(v => {
            const m = mag(v); const factor = s / 20;
            return { ...v, x: v.x + (v.x/m - v.x) * factor, y: v.y + (v.y/m - v.y) * factor, label: v.label, color: s === 20 ? '#10b981' : v.color };
        });
        render(); await new Promise(r => setTimeout(r, 20));
    }
    const magEl = $('mag-readout');
    if (magEl) {
        const avg = vectors.reduce((s, v) => s + Math.sqrt(v.x*v.x + v.y*v.y), 0) / (vectors.length || 1);
        const normalized = Math.abs(avg - 1) < 0.01;
        // Symbol prefix so the state reads without relying on color alone
        magEl.textContent = (normalized ? '✓ ' : '⚠ ') + 'avg |v| = ' + avg.toFixed(3);
        magEl.style.color = normalized ? '#10b981' : '#f59e0b';
    }
    window._isNormalizing = false;
};

window.addScatterVectors = (clear = false) => {
    if (clear) { vectors = []; srand(0x5ca77e); } // reproducible initial cloud
    const rnd = clear ? srandom : Math.random; // appended points stay varied
    const numPoints = 8;
    for (let i = 0; i < numPoints; i++) {
        const angle = rnd() * 2 * Math.PI;
        const r = 0.3 + rnd() * 1.5; // Radius between 0.3 and 1.8
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        vectors.push({
            x, y,
            ox: x, oy: y,
            label: `v${vectors.length+1}`,
            color: r > 1 ? '#ef4444' : '#60a5fa'
        });
    }
    lastAddedVector = vectors[vectors.length - 1];
    render();
};

window.randomizeQueryVector = () => {
    queryVector = { x: (Math.random() - 0.5) * 2.0, y: (Math.random() - 0.5) * 2.0 };
    render();
};

window.traceHNSWPath = async () => {
    if (window._isTracing) return;
    window._isTracing = true;

    if (!queryVector) queryVector = { x: 0.5, y: 0.5 };
    activePath = [queryVector];
    probingNode = null;
    const layers = [2, 1, 0];

    for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        const layerNodes = hnswNodes.filter(n => n.layer === l);
        if (layerNodes.length === 0) continue;

        const startNode = activePath[activePath.length - 1];
        let best = startNode;

        // Entry into new layer
        let entryInLayer = layerNodes[0];
        let minD = Infinity;
        for (const n of layerNodes) {
            const d = distL2(n, startNode);
            if (d < minD) { minD = d; entryInLayer = n; }
        }

        activePath.push(entryInLayer);
        best = entryInLayer;
        render();
        await new Promise(r => setTimeout(r, 400));

        // Search candidates
        let bestInLayer = best;
        for (const n of layerNodes) {
            if (distL2(queryVector, n) < distL2(queryVector, bestInLayer)) {
                probingNode = n;
                render();
                await new Promise(r => setTimeout(r, 100));
                bestInLayer = n;
                best = n;
            }
        }
        probingNode = null;
        activePath.push(best);
        render();
        await new Promise(r => setTimeout(r, 400));
    }
    window._isTracing = false;
};

window.traceHybridPath = async () => {
    if (window._isTracing) return;
    window._isTracing = true;
    if (!queryVector) queryVector = { x: 0.85, y: 0.22 };
    activePath = [queryVector];
    probingNode = null;
    const layers = [2, 1, 0];

    for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        // Only evaluate UNFILTERED nodes
        const layerNodes = hnswNodes.filter(n => n.layer === l && !n.filtered);
        if (layerNodes.length === 0) {
            addLog(`L${l} HOP`, 'No valid unfiltered nodes at this layer, dropping down.');
            continue;
        }

        const startNode = activePath[activePath.length - 1];
        let best = startNode === queryVector ? layerNodes[0] : startNode;
        if (best.filtered && layerNodes.length > 0) best = layerNodes[0];

        // Show "drop" to new layer
        if (startNode !== queryVector) {
            const entryInLayer = layerNodes.find(n => n.x === startNode.x && n.y === startNode.y) || layerNodes[0];
            activePath.push(entryInLayer);
            render();
            await new Promise(r => setTimeout(r, 300 / speedVal));
        } else {
            activePath.push(layerNodes[0]);
            render();
        }

        for (const n of layerNodes) {
            const currentEntry = activePath[activePath.length - 1];
            if (currentEntry !== queryVector && distL2(currentEntry, n) > (l === 1 ? 1.5 : 0.8)) continue;

            probingNode = n;
            render();
            await new Promise(r => setTimeout(r, 60 / speedVal));
            if (distL2(queryVector, n) < distL2(queryVector, best)) best = n;
        }

        probingNode = null;
        activePath[activePath.length - 1] = best;
        render();
        addLog(`L${l} HOP`, `Closest VALID node at [${best.x.toFixed(2)}, ${best.y.toFixed(2)}]`);
        await new Promise(r => setTimeout(r, 400 / speedVal));
    }
    window._isTracing = false;
};

window.rebuildHNSW = () => {
    hnswNodes = []; activePath = [];
    addLog('INDEX', `Rebuilding index: M=${paramM}, ef_construction=${paramEFC}`);
    setInteractiveSQL(`CREATE INDEX ON items \nUSING hnsw (embedding vector_cosine_ops)\nWITH (m = ${paramM}, ef_construction = ${paramEFC});`);
    render();
};

window.runRAGSimulation = async () => {
    selectScenario(11);
    resetScenario();
    isPlaying = true;
    $('btn-play').textContent = '⏸ Pause';
    playTimer = setInterval(stepForward, 2500 / speedVal);
};

window.toggleLabNorm = () => {
    labNormalize = !labNormalize;
    const btn = $('btn-toggle-norm');
    btn.textContent = `Normalize: ${labNormalize ? 'ON' : 'OFF'}`;
    btn.classList.toggle('btn-p', labNormalize);

    if (labNormalize) {
        setInteractiveSQL(`-- With Normalization, Cosine Distance is 1 - Inner Product\nSELECT name, (embedding <#> '[0.707, 0.707]') * -1 as similarity \nFROM items \nORDER BY embedding <#> '[0.707, 0.707]' LIMIT 5;`);
    } else {
        setInteractiveSQL(`-- Standard Cosine Distance\nSELECT name, embedding <=> '[0.12, 0.45]' as dist \nFROM items \nORDER BY dist LIMIT 5;`);
    }

    render();
};

function highlightSQL(code) {
    return code
        .replace(/\b(CREATE|TABLE|EXTENSION|INSERT|INTO|VALUES|SELECT|FROM|WHERE|ORDER BY|LIMIT|SET|INDEX|USING|WITH|IF NOT EXISTS|REINDEX|CONCURRENTLY|OR|LIKE|AND|AS)\b/g, '<span class="sql-kw">$1</span>')
        .replace(/\b(vector|int|text|SERIAL|PRIMARY KEY)\b/g, '<span class="sql-type">$1</span>')
        .replace(/(--.*)/g, '<span style="color:var(--txt3)">$1</span>');
}

// ── STEP NAVIGATION ──

function stepForward() {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (currentStepIdx < sc.steps.length - 1) {
        // Save state before stepping forward
        stateSnapshots.push(captureState());

        currentStepIdx++;
        const step = sc.steps[currentStepIdx];
        addLog(step.label, step.desc);
        if (step.action) runSafely(step.action, step.label);
        updateNarration();
        updateStepProgress();
        updateBackButton();
        render();
    } else {
        isPlaying = false;
        $('btn-play').textContent = '▶ Play';
        if (playTimer) clearInterval(playTimer);
    }
}

function stepBack() {
    if (stateSnapshots.length === 0 || currentStepIdx < 0) return;

    const snapshot = stateSnapshots.pop();
    currentStepIdx--;
    restoreState(snapshot);
    updateNarration();
    updateStepProgress();
    updateBackButton();
}

function jumpToStep(targetIdx) {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (targetIdx > currentStepIdx) {
        // Forward jump: step through each
        while (currentStepIdx < targetIdx) {
            stepForward();
        }
    } else if (targetIdx < currentStepIdx) {
        // Backward jump: replay from beginning
        resetScenario();
        for (let i = 0; i <= targetIdx; i++) {
            stepForward();
        }
    }
}
window.jumpToStep = jumpToStep;

function updateBackButton() {
    const btn = $('btn-back');
    if (btn) btn.disabled = (stateSnapshots.length === 0);
}

function togglePlay() {
    isPlaying = !isPlaying; const btn = $('btn-play');
    if (isPlaying) { btn.textContent = '⏸ Pause'; playTimer = setInterval(stepForward, 2000 / speedVal); }
    else { btn.textContent = '▶ Play'; clearInterval(playTimer); }
}

function addLog(title, txt) {
    const entry = document.createElement('div'); entry.className = 'log-entry'; entry.style.marginBottom = '12px';
    entry.innerHTML = `<div class="log-t" style="color:#f59e0b; font-weight:600; font-size:12px; margin-bottom:2px">● ${title}</div><div class="log-m" style="color:#7a869a; font-size:11px; line-height:1.4">${txt}</div>`;
    logBody.prepend(entry);
}

// ── RENDER ──

function render() {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (!sc) return;
    
    // Clear SVG before rendering to prevent residues
    if (svg) svg.innerHTML = '';
    
    const isSamplingView = sc.showSampling;

    if (svg) {
        if (isSamplingView) {
            svg.setAttribute('viewBox', '0 0 1024 768');
            svg.setAttribute('width', '1024');
            svg.setAttribute('height', '768');
        } else {
            svg.setAttribute('viewBox', '0 0 600 600');
            svg.setAttribute('width', '600');
            svg.setAttribute('height', '600');
        }
        drawAxes(); addArrowDefs();
    }

    // Visibility toggles
    const isHome = sc.isHome || false;
    $('hnsw-controls').style.display = sc.showHNSW ? 'block' : 'none';
    const samplingControls = $('sampling-controls');
    if (sc.showSampling) {
        samplingControls.style.display = 'block';
        // Dynamically hide sliders based on scenario
        const rowK = samplingControls.querySelector('.param-row:nth-child(1)');
        const rowP = samplingControls.querySelector('.param-row:nth-child(2)');
        const desc = samplingControls.querySelector('div:last-child');

        if (sc.name === 'Top-K Sampling') {
            rowK.style.display = 'flex'; rowP.style.display = 'none'; desc.style.display = 'none';
        } else if (sc.name === 'Top-P (Nucleus) Sampling') {
            rowK.style.display = 'none'; rowP.style.display = 'flex'; desc.style.display = 'none';
        } else {
            rowK.style.display = 'flex'; rowP.style.display = 'flex'; desc.style.display = 'block';
        }
    } else {
        samplingControls.style.display = 'none';
    }
    const isFlowMode = !!(sc.showRAG || sc.showHybrid || sc.showMCP || sc.showDistributed || sc.showDimensions);
    $('rag-flow-container').style.display = isFlowMode ? 'flex' : 'none';
    document.querySelector('.canvas-container').classList.toggle('flow-mode', isFlowMode);

    const guideContainer = $('main-guide');
    if (guideContainer) guideContainer.style.display = sc.showGuide ? 'block' : 'none';

    const canvas = $('vector-canvas');
    canvas.style.display = (sc.showRAG || sc.showHybrid || sc.showMCP || sc.showDistributed || sc.showDimensions || sc.showGuide || isHome) ? 'none' : 'block';

    const mainCanvasWrap = $('main-canvas-wrap');
    if (mainCanvasWrap) mainCanvasWrap.style.display = (sc.showGuide || isHome) ? 'none' : 'flex';

    dataPanel.style.display = (sc.showRAG || sc.showHybrid || sc.showMCP || sc.showDistributed || sc.showDimensions || sc.showGuide || isHome || isSamplingView) ? 'none' : 'flex';

    // Render home view content if active
    const homeView = $('home-view');
    const tabContainer = $('tab-container');
    const narrationBar = $('narration-bar');
    const infoPanel = $('info-panel');
    if (infoPanel) infoPanel.classList.toggle('sampling-mode', isSamplingView);

    if (isHome) {
        if (tabContainer) tabContainer.style.display = 'none';
        if (narrationBar) narrationBar.style.display = 'none';
        if (infoPanel) infoPanel.style.display = 'none';
        if (homeView) {
            homeView.style.display = 'block';
            if (homeView.dataset.rendered === '1') return;
            homeView.dataset.rendered = '1';
            if (tabContainer) tabContainer.style.display = 'none';
            if (narrationBar) narrationBar.style.display = 'none';
            if (infoPanel) infoPanel.style.display = 'none';

            const groups = {};
            AI_SCENARIOS.forEach((s, idx) => {
                if (s.isHome) return;
                if (!groups[s.group]) groups[s.group] = [];
                groups[s.group].push({ ...s, index: idx });
            });

            const groupMetadata = {
                'Fundamentals': { badge: 'Chapter 1', title: 'Vector Fundamentals', desc: 'Core concepts of embeddings, dimensions, and normalization.' },
                'Similarity': { badge: 'Chapter 2', title: 'Similarity Search', desc: 'Mathematical metrics for measuring semantic proximity.' },
                'HNSW Indexing': { badge: 'Chapter 3', title: 'HNSW Indexing', desc: 'High-performance graph-based indexing mechanics.' },
                'MCP Integration': { badge: 'Chapter 4', title: 'AI Ecosystem', desc: 'Connecting YugabyteDB to the Model Context Protocol ecosystem.' },
                'Architecture': { badge: 'Chapter 5', title: 'Production Architecture', desc: 'RAG, Hybrid Search, and Distributed Scaling.' },
                'Advanced Sampling': { badge: 'Chapter 6', title: 'Advanced Sampling', desc: 'Fine-tuning LLM response diversity with Top-K and Top-P.' }
            };

            const groupIcon = {
                'Fundamentals': '🧩',
                'Similarity': '📏',
                'HNSW Indexing': '🏗️',
                'MCP Integration': '🔌',
                'Architecture': '🌐',
                'Advanced Sampling': '🎲'
            };

            let html = `
                <div class="home-container" style="animation: fadeInUp 0.8s ease-out">
                    <div class="home-hero">
                        <div class="hero-badge">YugabyteDB 2024.2+</div>
                        <h1>AI & Vector Explorer</h1>
                        <p>Explore the mechanics of distributed vector search, from pgvector basics to production-grade HNSW architecture and MCP integration.</p>
                    </div>

                    <div style="background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.2); border-radius: 12px; padding: 20px 24px; margin: 0 0 32px 0;">
                        <div style="font-family: var(--head); font-size: 12px; color: var(--leader); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 14px;">Suggested Learning Path</div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                            ${[
                                { idx: 1,  label: '1. Embeddings' },
                                { idx: 4,  label: '2. Distance Metrics' },
                                { idx: 8,  label: '3. HNSW Index' },
                                { idx: 9,  label: '4. HNSW Search' },
                                { idx: 11, label: '5. RAG Pipeline' },
                                { idx: 12, label: '6. Hybrid Search' },
                                { idx: 13, label: '7. Distributed' },
                                { idx: 10, label: '8. MCP' },
                            ].map((s, i, arr) => `
                                <button onclick="selectScenario(${s.idx})" style="background: rgba(168,85,247,0.12); border: 1px solid rgba(168,85,247,0.3); color: var(--txt); font-family: var(--head); font-size: 12px; padding: 6px 14px; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: all 0.15s;" onmouseover="this.style.background='rgba(168,85,247,0.25)'" onmouseout="this.style.background='rgba(168,85,247,0.12)'">${s.label}</button>
                                ${i < arr.length - 1 ? '<span style="color: var(--txt3); font-size: 16px; line-height: 1;">→</span>' : ''}
                            `).join('')}
                        </div>
                    </div>

                    <div class="home-sections-grid">
            `;

            const groupOrder = ['Fundamentals', 'Similarity', 'HNSW Indexing', 'MCP Integration', 'Architecture', 'Advanced Sampling'];

            const scenariosWithBetterDesc = {
                'Vector Embeddings': 'Convert unstructured data into high-dimensional vectors. Map semantic similarity to spatial proximity.',
                'Vector Dimensions': 'Explore feature intensities. Visualize how production models (1536+ dims) capture complex data relationships.',
                'Vector Normalization': 'Scale vectors to unit length. Optimize your data for high-speed Inner Product and Cosine similarity.',
                'Distance Metrics': 'L2, Cosine, and Inner Product. Choose the right mathematical model for your specific embedding requirements.',
                'L2 (Euclidean) Search': 'Measure absolute spatial distance. Ideal for geometric data and range-based similarity queries.',
                'Cosine Similarity Search': 'Rank by angular orientation. The gold standard for RAG and semantic text similarity across varying lengths.',
                'Inner Product Search': 'Highest performance scoring. Project vectors onto each other to capture both direction and intensity at scale.',
                'HNSW Construction': 'Build hierarchical small-world graphs. Create sparse express lanes and dense local streets for fast search.',
                'HNSW Search': 'Navigate the graph at sub-millisecond speeds. Trace the greedy search path from entry points to neighbors.',
                'Model Context Protocol (MCP)': 'Connect AI assistants securely. Expose database tools and resources via the JSON-RPC protocol.',
                'RAG Pipeline': 'Retrieval Augmented Generation. Ground LLMs in private data using an end-to-end distributed vector search flow.',
                'Hybrid Search': 'Atomic relational + vector queries. Combine structural WHERE filters with similarity in a single scan.',
                'Distributed HNSW Search': 'Scale vectors horizontally. Parallel scatter-gather search across shards for high-throughput apps.',
                'Top-K Sampling': 'Prevent hallucinations. Restrict token selection to the most probable K candidates for safer AI output.',
                'Top-P (Nucleus) Sampling': 'Adaptive sampling. Dynamically adjust the candidate set based on the model\'s cumulative confidence.',
                'Hybrid Sampling (Synergy)': 'The ultimate control. Combine Top-K and Top-P for the perfect balance of creative diversity and safety.'
            };

            groupOrder.forEach((group) => {
                const scenarios = groups[group];
                if (!scenarios) return;
                const meta = groupMetadata[group] || { badge: 'Chapter', title: group, desc: '' };
                html += `
                    <div class="home-section" style="animation: slideInUp 0.6s ease-out forwards">
                        <div class="home-section-hdr">
                            <div class="hc-chapter-badge">${meta.badge}</div>
                            <h3>${meta.title}</h3>
                            <p>${meta.desc}</p>
                        </div>
                        <div class="scenario-grid">
                            ${scenarios.map(s => `
                                <div class="home-card" onclick="selectScenario(${s.index})">
                                    <div class="home-card-icon">${s.icon || getIconForGroup(group)}</div>
                                    <h4 class="home-card-title">${s.name}</h4>
                                    <p class="home-card-desc">${scenariosWithBetterDesc[s.name] || s.desc}</p>
                                    <button class="home-card-btn">Explore &rarr;</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
            homeView.innerHTML = html;
        }
    } else {
        if (tabContainer) tabContainer.style.display = 'flex';
        if (narrationBar) narrationBar.style.display = 'flex';
        if (infoPanel) infoPanel.style.display = 'flex';
        if (homeView) homeView.style.display = 'none';
    }

    if (sc.showSampling) {
        renderSamplingScene(sc);
    } else if (!sc.showRAG && !sc.showHybrid && !sc.showMCP && !sc.showDistributed && !sc.showDimensions && !sc.showGuide && !isHome) {
        // Draw category hulls if enabled
        if (window.showCategoryHulls) drawCategoryHulls();

        if (window.showUnitCircle) {
            const uc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            uc.setAttribute('cx', SVG_CENTER);
            uc.setAttribute('cy', SVG_CENTER);
            uc.setAttribute('r', SVG_SCALE);
            uc.setAttribute('fill', 'none');
            uc.setAttribute('stroke', 'rgba(255,255,255,0.18)');
            uc.setAttribute('stroke-width', '1.5');
            uc.setAttribute('stroke-dasharray', '6 4');
            svg.appendChild(uc);
            const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', SVG_CENTER + SVG_SCALE + 6);
            lbl.setAttribute('y', SVG_CENTER + 4);
            lbl.setAttribute('fill', 'rgba(255,255,255,0.35)');
            lbl.setAttribute('font-size', '11');
            lbl.setAttribute('font-family', 'var(--mono)');
            lbl.textContent = '|v|=1';
            svg.appendChild(lbl);
        }

        // Ensure all vectors have an idx and compute Top-K for similarity views
        const topKIndices = new Set();
        const topPIndices = new Set();
        const metric = getScenarioMetric(sc);
        const showMetric = vectors.length > 0 && queryVector;

        if (showMetric && !sc.showSampling) {
            const indexed = vectors.map((v, i) => {
                if (v.idx === undefined) v.idx = i;
                const metricData = getMetricValue(metric, queryVector, v);
                return { i, orderValue: metricData.orderValue };
            }).sort((a, b) => a.orderValue - b.orderValue);

            indexed.slice(0, paramK).forEach(item => topKIndices.add(item.i));
        } else {
            vectors.forEach((v, i) => { if (v.idx === undefined) v.idx = i; });
        }

        vectors.forEach((v, i) => {
            const isK = topKIndices.has(i);
            const isP = topPIndices.has(i);
            let color = v.color || '#3b82f6';

            if (sc.name === 'Top-K Sampling') {
                if (isK) color = 'var(--ok)';
                else color = 'rgba(255,255,255,0.05)';
            } else if (sc.name === 'Top-P (Nucleus) Sampling') {
                if (isP) color = '#a855f7';
                else color = 'rgba(255,255,255,0.05)';
            } else if (sc.showSampling || sc.name.includes('Hybrid Sampling')) {
                if (isK && isP) color = '#10b981'; // Green (Both)
                else if (isK) color = '#3b82f6';   // Blue (K only)
                else if (isP) color = '#a855f7';   // Purple (P only)
                else color = 'rgba(255,255,255,0.1)';
            } else if (isK) {
                color = 'var(--ok)';
            }

            const shouldHighlight = i === highlightedIdx
                || i === selectedSampleIdx
                || (sc.group === 'Similarity' && i === selectedTargetIdx)
                || (sc.showSampling && (isK || isP))
                || (sc.name === 'Top-K Sampling' && isK)
                || (sc.name === 'Top-P (Nucleus) Sampling' && isP);
            drawVector(v, color, v.label, false, shouldHighlight);
        });

        if (queryVector) drawVector(queryVector, '#f59e0b', 'Query', true);

        const isLab = sc.name === 'Distance Metrics';
        if (isLab && labNormalize && queryVector && vectors.length > 0) {
            let tIdx = selectedTargetIdx < vectors.length ? selectedTargetIdx : 0;
            const mq = mag(queryVector), mt = mag(vectors[tIdx]);
            if (mq > 0 && mt > 0) {
                // Draw small phantom dots for normalized positions
                drawVector({ x: queryVector.x / mq, y: queryVector.y / mq }, '#10b981', 'Norm Q', false);
                drawVector({ x: vectors[tIdx].x / mt, y: vectors[tIdx].y / mt }, '#10b981', 'Norm T', false);
            }
        }
    }

    if (sc.name === 'Distance Metrics') {
        const refOverlay = $('metrics-ref-overlay');
        if (refOverlay) refOverlay.style.display = 'block';
        if (queryVector && vectors.length > 0) {
            distLabOverlay.style.display = 'block';

            let tIdx = selectedTargetIdx < vectors.length ? selectedTargetIdx : 0;
            let q = queryVector, t = vectors[tIdx];

            if (labNormalize) {
                const mq = mag(q), mt = mag(t);
                if (mq > 0 && mt > 0) {
                    q = { x: q.x / mq, y: q.y / mq };
                    t = { x: t.x / mt, y: t.y / mt };
                }
            }

            updateDistLab(q, t);
            drawMathVisuals(q, t);
        } else {
            distLabOverlay.style.display = 'none';
        }
    }

    if (sc.name === 'L2 (Euclidean) Search') {
        if (queryVector && window.rangeSearchRadius) {
            const { cx, cy } = toCanvas(queryVector.x, queryVector.y);
            const r = window.rangeSearchRadius * 200;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
            circle.setAttribute('fill', 'rgba(59, 130, 246, 0.05)');
            circle.setAttribute('stroke', 'var(--accent)');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('stroke-dasharray', '5 5');
            svg.appendChild(circle);

            vectors.forEach((v, idx) => {
                if (distL2(queryVector, v) <= window.rangeSearchRadius) {
                    const p = toCanvas(v.x, v.y);
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', cx); line.setAttribute('y1', cy); line.setAttribute('x2', p.cx); line.setAttribute('y2', p.cy);
                    line.setAttribute('stroke', 'rgba(16, 185, 129, 0.4)');
                    line.setAttribute('stroke-width', '1');
                    svg.appendChild(line);
                }
            });
        }

        const activeIdx = highlightedIdx !== -1 ? highlightedIdx : (sc.group === 'Similarity' ? selectedTargetIdx : -1);
        if (queryVector && activeIdx !== -1 && vectors[activeIdx]) {
            const v = vectors[activeIdx];
            const q = queryVector;
            const pV = toCanvas(v.x, v.y);
            const pQ = toCanvas(q.x, q.y);

            const distLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            distLine.setAttribute('x1', pQ.cx); distLine.setAttribute('y1', pQ.cy);
            distLine.setAttribute('x2', pV.cx); distLine.setAttribute('y2', pV.cy);
            distLine.setAttribute('stroke', '#f59e0b');
            distLine.setAttribute('stroke-width', '2');
            distLine.setAttribute('stroke-dasharray', '5 3');
            svg.appendChild(distLine);

            const d = distL2(q, v);
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', (pQ.cx + pV.cx) / 2);
            label.setAttribute('y', (pQ.cy + pV.cy) / 2 - 10);
            label.setAttribute('fill', '#f59e0b');
            label.setAttribute('font-size', '8px');
            label.setAttribute('font-weight', '600');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = `d = ${d.toFixed(3)}`;
            svg.appendChild(label);
        }
    }

    if (sc.name === 'Cosine Similarity Search') {
        const activeIdx = highlightedIdx !== -1 ? highlightedIdx : (sc.group === 'Similarity' ? selectedTargetIdx : -1);
        if (queryVector && activeIdx !== -1 && vectors[activeIdx]) {
            const v = vectors[activeIdx];
            const q = queryVector;
            const magQ = mag(q), magV = mag(v);
            if (magQ > 0 && magV > 0) {
                // Draw arc between q and v
                const angleQ = Math.atan2(q.y, q.x);
                const angleV = Math.atan2(v.y, v.x);
                const r = 40;
                const start = { x: 300 + Math.cos(angleQ) * r, y: 300 - Math.sin(angleQ) * r };
                const end = { x: 300 + Math.cos(angleV) * r, y: 300 - Math.sin(angleV) * r };
                const largeArc = Math.abs(angleV - angleQ) > Math.PI ? 1 : 0;
                const sweep = angleV > angleQ ? 0 : 1;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', 'var(--accent)');
                path.setAttribute('stroke-width', '2');
                svg.appendChild(path);

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                const midAngle = (angleQ + angleV) / 2 + (largeArc ? Math.PI : 0);
                label.setAttribute('x', 300 + Math.cos(midAngle) * (r + 15));
                label.setAttribute('y', 300 - Math.sin(midAngle) * (r + 15));
                label.setAttribute('fill', 'var(--accent)');
                label.setAttribute('font-size', '8px');
                label.setAttribute('text-anchor', 'middle');
                const deg = Math.abs(angleV - angleQ) * (180 / Math.PI);
                label.textContent = `${deg.toFixed(1)}°`;
                svg.appendChild(label);
            }
        }
    }

    if (sc.name === 'Inner Product Search') {
        const activeIdx = highlightedIdx !== -1 ? highlightedIdx : (sc.group === 'Similarity' ? selectedTargetIdx : -1);
        if (queryVector && activeIdx !== -1 && vectors[activeIdx]) {
            drawProjectionVisuals(queryVector, vectors[activeIdx], '#a855f7');
        }
    }

    if (sc.name === 'Vector Normalization') { normOverlay.style.display = 'block'; updateNormLab(); }
    else normOverlay.style.display = 'none';

    if (sc.showHNSW) renderHNSW();
    if (activePath.length > 1) {
        for (let i = 0; i < activePath.length - 1; i++) {
            const node1 = activePath[i], node2 = activePath[i+1];
            let p1, p2;

            if (sc.showHNSW) {
                // HNSW path: All path segments from the entry point onwards should use radial projection.
                // If it's a node, use its layer-specific radial projection.
                // The query vector acts as an external point, so we project it manually to the entry point's layer (e.g., L2).
                const entryLayer = node2.layer || 2;
                p1 = node1.layer !== undefined ? toHNSWCanvas(node1.x, node1.y, node1.layer) : toHNSWCanvas(node1.x, node1.y, entryLayer);
                p2 = node2.layer !== undefined ? toHNSWCanvas(node2.x, node2.y, node2.layer) : toHNSWCanvas(node2.x, node2.y, node2.layer);
            } else {
                p1 = toCanvas(node1.x, node1.y);
                p2 = toCanvas(node2.x, node2.y);
            }

            const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            l.setAttribute('x1', p1.cx); l.setAttribute('y1', p1.cy); l.setAttribute('x2', p2.cx); l.setAttribute('y2', p2.cy);
            l.setAttribute('stroke', '#f59e0b'); l.setAttribute('stroke-width', '2.5'); l.setAttribute('stroke-dasharray', '5 3');
            svg.appendChild(l);
        }
    }
    renderDataTable();
}

function renderSamplingScene(sc) {
    sampleAnalysis = computeSamplingAnalysis(selectedSampleIdx);
    svg.innerHTML = '';
    const W = 1024;
    const H = 768;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const probabilityColumnX = 880;
    const cumulativeColumnX = 1000;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0);
    bg.setAttribute('y', 0);
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#0b1020');
    svg.appendChild(bg);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', 40);
    title.setAttribute('y', 40);
    title.setAttribute('fill', '#dde3f0');
    title.setAttribute('font-size', '28px');
    title.setAttribute('font-family', 'var(--head)');
    title.setAttribute('font-weight', '700');
    title.textContent = sc.name;
    svg.appendChild(title);

    const subtitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subtitle.setAttribute('x', 40);
    subtitle.setAttribute('y', 65);
    subtitle.setAttribute('fill', '#7a869a');
    subtitle.setAttribute('font-size', '15px');
    subtitle.setAttribute('font-family', 'var(--mono)');
    subtitle.textContent = 'Ranked next-token distribution';
    svg.appendChild(subtitle);

    if (!sampleAnalysis || !sampleAnalysis.items.length) return;

    const sorted = sampleAnalysis.items.slice(0, 12);
    const stepIdx = currentStepIdx;
    const maxProb = sorted[0].prob || 1;
    const chartLeft = 240;
    const chartTop = 150;
    const chartWidth = 580;
    const rowHeight = 46;
    const barHeight = 26;
    const labelX = 40;

    const gridLabels = [0, 0.25, 0.5, 0.75, 1];
    gridLabels.forEach((tick) => {
        const x = chartLeft + (chartWidth * tick);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', chartTop - 20);
        line.setAttribute('x2', x);
        line.setAttribute('y2', chartTop + rowHeight * sorted.length - 4);
        line.setAttribute('stroke', 'rgba(255,255,255,0.07)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);

        const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tickLabel.setAttribute('x', x);
        tickLabel.setAttribute('y', chartTop - 32);
        tickLabel.setAttribute('fill', '#4a5568');
        tickLabel.setAttribute('font-size', '13px');
        tickLabel.setAttribute('font-family', 'var(--mono)');
        tickLabel.setAttribute('text-anchor', 'middle');
        tickLabel.textContent = `${Math.round(tick * 100)}%`;
        svg.appendChild(tickLabel);
    });

    const probabilityHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    probabilityHeader.setAttribute('x', probabilityColumnX);
    probabilityHeader.setAttribute('y', chartTop - 32);
    probabilityHeader.setAttribute('fill', '#64748b');
    probabilityHeader.setAttribute('font-size', '13px');
    probabilityHeader.setAttribute('font-family', 'var(--mono)');
    probabilityHeader.setAttribute('text-anchor', 'end');
    probabilityHeader.textContent = 'probability';
    svg.appendChild(probabilityHeader);

    if (sc.name !== 'Top-K Sampling') {
        const cumulativeHeader = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cumulativeHeader.setAttribute('x', cumulativeColumnX);
        cumulativeHeader.setAttribute('y', chartTop - 32);
        cumulativeHeader.setAttribute('fill', '#64748b');
        cumulativeHeader.setAttribute('font-size', '13px');
        cumulativeHeader.setAttribute('font-family', 'var(--mono)');
        cumulativeHeader.setAttribute('text-anchor', 'end');
        cumulativeHeader.textContent = 'cumulative';
        svg.appendChild(cumulativeHeader);
    }

    let cumulative = 0;
    let lastEligibleTopPY = null;
    let cutoffKY = null;
    sorted.forEach((item, idx) => {
        cumulative += item.prob;
        const y = chartTop + idx * rowHeight;
        const barWidth = Math.max(10, (item.prob / maxProb) * chartWidth);
        const inTopK = sampleAnalysis.topKIndices.has(item.i);
        const inTopP = sampleAnalysis.topPIndices.has(item.i);
        const isSampled = item.i === selectedSampleIdx;
        let fill = 'rgba(255,255,255,0.12)';
        let stroke = 'rgba(255,255,255,0.08)';
        let labelFill = '#dde3f0';
        let rowFill = isSampled ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.02)';

        if (sc.name === 'Top-K Sampling' && stepIdx === 0) {
            fill = 'rgba(59,130,246,0.22)';
            stroke = 'rgba(59,130,246,0.28)';
        }

        if (sc.name === 'Top-K Sampling') {
            if (stepIdx >= 1) {
                fill = inTopK ? '#3b82f6' : 'rgba(255,255,255,0.08)';
                stroke = inTopK ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.06)';
                if (!inTopK) labelFill = '#64748b';
            }
        } else if (sc.name === 'Top-P (Nucleus) Sampling') {
            if (stepIdx <= 0) {
                fill = 'rgba(168,85,247,0.22)';
                stroke = 'rgba(168,85,247,0.28)';
            } else {
                fill = inTopP ? '#a855f7' : 'rgba(255,255,255,0.08)';
                stroke = inTopP ? 'rgba(168,85,247,0.55)' : 'rgba(255,255,255,0.06)';
                if (!inTopP) labelFill = '#64748b';
            }
        } else {
            if (stepIdx <= 0) {
                if (inTopK) {
                    fill = '#3b82f6';
                    stroke = 'rgba(59,130,246,0.55)';
                } else if (inTopP) {
                    fill = '#a855f7';
                    stroke = 'rgba(168,85,247,0.55)';
                } else {
                    fill = 'rgba(255,255,255,0.08)';
                    stroke = 'rgba(255,255,255,0.06)';
                    labelFill = '#64748b';
                }
            } else {
                if (inTopK && inTopP) {
                    fill = '#22c55e';
                    stroke = 'rgba(34,197,94,0.55)';
                } else if (inTopK) {
                    fill = '#3b82f6';
                    stroke = 'rgba(59,130,246,0.55)';
                } else if (inTopP) {
                    fill = '#a855f7';
                    stroke = 'rgba(168,85,247,0.55)';
                } else {
                    fill = 'rgba(255,255,255,0.08)';
                    stroke = 'rgba(255,255,255,0.06)';
                    labelFill = '#64748b';
                }
            }
        }

        const rowBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rowBg.setAttribute('x', 20);
        rowBg.setAttribute('y', y - 10);
        rowBg.setAttribute('width', W - 40);
        rowBg.setAttribute('height', rowHeight);
        rowBg.setAttribute('fill', rowFill);
        rowBg.setAttribute('rx', 4);
        svg.appendChild(rowBg);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', labelX);
        label.setAttribute('y', y + 10);
        label.setAttribute('fill', labelFill);
        label.setAttribute('font-size', '8px');
        label.setAttribute('font-family', 'var(--mono)');
        label.setAttribute('font-weight', isSampled ? '700' : '400');
        label.textContent = `${idx + 1}. ${item.label}`;
        svg.appendChild(label);

        const barTrack = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        barTrack.setAttribute('x', chartLeft);
        barTrack.setAttribute('y', y - 4);
        barTrack.setAttribute('width', chartWidth);
        barTrack.setAttribute('height', barHeight);
        barTrack.setAttribute('rx', 14);
        barTrack.setAttribute('fill', 'rgba(255,255,255,0.05)');
        svg.appendChild(barTrack);

        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', chartLeft);
        bar.setAttribute('y', y - 4);
        bar.setAttribute('width', barWidth);
        bar.setAttribute('height', barHeight);
        bar.setAttribute('rx', 14);
        bar.setAttribute('fill', fill);
        bar.setAttribute('stroke', stroke);
        bar.setAttribute('stroke-width', isSampled ? '2' : '1');
        svg.appendChild(bar);

        const probLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        probLabel.setAttribute('x', probabilityColumnX);
        probLabel.setAttribute('y', y + 10);
        probLabel.setAttribute('fill', isSampled ? '#f59e0b' : '#cbd5e1');
        probLabel.setAttribute('font-size', '15px');
        probLabel.setAttribute('font-family', 'var(--mono)');
        probLabel.setAttribute('text-anchor', 'end');
        probLabel.textContent = `${(item.prob * 100).toFixed(1)}%`;
        svg.appendChild(probLabel);

        if (sc.name !== 'Top-K Sampling') {
            const cumLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            cumLabel.setAttribute('x', cumulativeColumnX);
            cumLabel.setAttribute('y', y + 10);
            cumLabel.setAttribute('fill', inTopP ? '#a855f7' : '#64748b');
            cumLabel.setAttribute('font-size', '14px');
            cumLabel.setAttribute('font-family', 'var(--mono)');
            cumLabel.setAttribute('text-anchor', 'end');
            cumLabel.textContent = `${(cumulative * 100).toFixed(0)}%`;
            svg.appendChild(cumLabel);
        }

        if (inTopP) lastEligibleTopPY = y;
        if (idx === Math.min(paramK, sorted.length) - 1) cutoffKY = y;
    });

    if (sc.name === 'Top-K Sampling' && stepIdx >= 1 && cutoffKY !== null) {
        const lineY = cutoffKY + 24;
        const cutoffLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        cutoffLine.setAttribute('x1', labelX);
        cutoffLine.setAttribute('y1', lineY);
        cutoffLine.setAttribute('x2', cumulativeColumnX);
        cutoffLine.setAttribute('y2', lineY);
        cutoffLine.setAttribute('stroke', '#3b82f6');
        cutoffLine.setAttribute('stroke-width', '2');
        cutoffLine.setAttribute('stroke-dasharray', '6 4');
        svg.appendChild(cutoffLine);

        const cutoffBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        cutoffBadge.setAttribute('x', cumulativeColumnX);
        cutoffBadge.setAttribute('y', lineY + 16);
        cutoffBadge.setAttribute('fill', '#3b82f6');
        cutoffBadge.setAttribute('font-size', '12px');
        cutoffBadge.setAttribute('font-family', 'var(--mono)');
        cutoffBadge.setAttribute('text-anchor', 'end');
        cutoffBadge.textContent = `K cutoff`;
        svg.appendChild(cutoffBadge);
    }

    if (sc.name !== 'Top-K Sampling' && stepIdx >= 1 && lastEligibleTopPY !== null) {
        const thresholdY = lastEligibleTopPY + 24;
        const pLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        pLine.setAttribute('x1', probabilityColumnX + 12);
        pLine.setAttribute('y1', thresholdY);
        pLine.setAttribute('x2', cumulativeColumnX);
        pLine.setAttribute('y2', thresholdY);
        pLine.setAttribute('stroke', '#a855f7');
        pLine.setAttribute('stroke-width', '2');
        pLine.setAttribute('stroke-dasharray', '6 4');
        svg.appendChild(pLine);

        const pBadge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        pBadge.setAttribute('x', cumulativeColumnX);
        pBadge.setAttribute('y', thresholdY + 16);
        pBadge.setAttribute('fill', '#a855f7');
        pBadge.setAttribute('font-size', '12px');
        pBadge.setAttribute('font-family', 'var(--mono)');
        pBadge.setAttribute('text-anchor', 'end');
        pBadge.textContent = `P threshold ${Math.round(paramP * 100)}%`;
        svg.appendChild(pBadge);
    }

    const summary = [
        { x: 32, text: `K ${paramK}`, fill: '#3b82f6' },
        { x: 112, text: `P ${paramP.toFixed(2)}`, fill: '#a855f7' },
        { x: 222, text: `Eligible ${sampleAnalysis.eligible.length}`, fill: sc.name === 'Top-K Sampling' ? '#3b82f6' : '#22c55e' }
    ];
    if (sampleAnalysis.selected) {
        summary.push({ x: 385, text: `Sampled ${sampleAnalysis.selected.label}`, fill: '#f59e0b' });
    }

    summary.forEach((pill) => {
        const width = Math.max(72, pill.text.length * 8 + 24);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pill.x);
        rect.setAttribute('y', 95);
        rect.setAttribute('width', width);
        rect.setAttribute('height', 26);
        rect.setAttribute('rx', 13);
        rect.setAttribute('fill', 'rgba(255,255,255,0.05)');
        rect.setAttribute('stroke', `${pill.fill}55`);
        svg.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pill.x + width / 2);
        text.setAttribute('y', 113);
        text.setAttribute('fill', pill.fill);
        text.setAttribute('font-size', '12px');
        text.setAttribute('font-family', 'var(--mono)');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = pill.text;
        svg.appendChild(text);
    });

    const footer = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    footer.setAttribute('x', 32);
    footer.setAttribute('y', H - 24);
    footer.setAttribute('fill', '#7a869a');
    footer.setAttribute('font-size', '11px');
    footer.setAttribute('font-family', 'var(--body)');
    footer.textContent = sc.name === 'Top-K Sampling'
        ? 'Fixed cutoff: only the highest-ranked K candidates remain eligible.'
        : (sc.name === 'Top-P (Nucleus) Sampling'
            ? 'Adaptive cutoff: the nucleus ends where cumulative probability stays within P.'
            : 'Hybrid view: blue = Top-K, purple = Top-P, green = overlap.');
    svg.appendChild(footer);
}

function updateDistLab(q, target) {
    if (!q || !target) return;
    const l2 = distL2(q, target), sim = cosSim(q, target), ip = dot(q, target);
    $('lab-l2').textContent = l2.toFixed(3);
    $('lab-cos-sim').textContent = sim.toFixed(3);
    $('lab-cos-dist').textContent = (1 - sim).toFixed(3);
    $('lab-ip').textContent = ip.toFixed(3);
    $('lab-ip-dist').textContent = (-ip).toFixed(3);

    const qStr = `'[${q.x.toFixed(2)}, ${q.y.toFixed(2)}]'`;
    const tStr = `'[${target.x.toFixed(2)}, ${target.y.toFixed(2)}]'`;

    $('sql-l2').innerHTML = `<span class="sql-kw">SELECT</span> ${tStr} <span class="sql-kw" style="color:#f59e0b">&lt;-&gt;</span> ${qStr}; <span style="float:right; color:var(--txt3)">-- ${l2.toFixed(3)}</span>`;
    $('sql-cos').innerHTML = `<span class="sql-kw">SELECT</span> ${tStr} <span class="sql-kw" style="color:#f59e0b">&lt;=&gt;</span> ${qStr}; <span style="float:right; color:var(--txt3)">-- ${(1 - sim).toFixed(3)}</span>`;
    $('sql-ip').innerHTML = `<span class="sql-kw">SELECT</span> ${tStr} <span class="sql-kw" style="color:#f59e0b">&lt;#&gt;</span> ${qStr}; <span style="float:right; color:var(--txt3)">-- ${(-ip).toFixed(3)}</span>`;

    const hint = $('lab-norm-hint');
    if (hint) hint.style.display = labNormalize ? 'block' : 'none';
}

function updateNormLab() {
    const v = lastAddedVector || { x: 0.5, y: 0.5 };
    const ox = v.ox !== undefined ? v.ox : v.x;
    const oy = v.oy !== undefined ? v.oy : v.y;
    const m = Math.sqrt(ox * ox + oy * oy);
    const nv = { x: ox / m, y: oy / m };

    $('norm-v').textContent = `[${ox.toFixed(3)}, ${oy.toFixed(3)}]`;

    $('norm-mag-calc').textContent = `√(${ox.toFixed(2)}² + ${oy.toFixed(2)}²)`;
    $('norm-mag').textContent = m.toFixed(4);

    $('norm-res').textContent = `[${nv.x.toFixed(4)}, ${nv.y.toFixed(4)}]`;
    $('norm-sql').innerHTML = `<span class="sql-kw">SELECT</span> l2_normalize(<span class="sql-type">'[${ox.toFixed(3)}, ${oy.toFixed(3)}]'</span>::vector);`;
}

// ── DRAWING ──

function drawAxes() {
    svg.innerHTML = '';
    const line = (x1, y1, x2, y2) => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('stroke', '#4a5568'); l.setAttribute('stroke-width', '1'); l.setAttribute('opacity', '0.2');
        svg.appendChild(l);
    };
    line(0, 300, 600, 300); line(300, 0, 300, 600);
    const sc = AI_SCENARIOS[currentScenarioIdx];
    // Show hypersphere if scenario explicitly requests it or is a similarity metric
    const showSphere = sc.showSphere || sc.name.includes('Distance') || sc.name.includes('Similarity') || sc.name.includes('Product') || sc.name.includes('Embeddings') || sc.name.includes('Normalization') || sc.name.includes('L2');
    if (showSphere) {
        // Hypersphere base (radial gradient for 3D effect)
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', 300); circle.setAttribute('cy', 300); circle.setAttribute('r', 200);
        circle.setAttribute('fill', 'url(#sphere-grad)');
        circle.setAttribute('stroke', 'rgba(16, 185, 129, 0.3)');
        circle.setAttribute('stroke-dasharray', '4 4');
        svg.appendChild(circle);

        // Longitude wireframe
        const ellipse1 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse1.setAttribute('cx', 300); ellipse1.setAttribute('cy', 300);
        ellipse1.setAttribute('rx', 70); ellipse1.setAttribute('ry', 200);
        ellipse1.setAttribute('fill', 'none'); ellipse1.setAttribute('stroke', 'rgba(16, 185, 129, 0.15)');
        svg.appendChild(ellipse1);

        // Latitude wireframe
        const ellipse2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse2.setAttribute('cx', 300); ellipse2.setAttribute('cy', 300);
        ellipse2.setAttribute('rx', 200); ellipse2.setAttribute('ry', 70);
        ellipse2.setAttribute('fill', 'none'); ellipse2.setAttribute('stroke', 'rgba(16, 185, 129, 0.15)');
        svg.appendChild(ellipse2);
    }
}

function drawVector(v, color, label, isQuery = false, isHighlighted = false) {
    const { cx, cy } = toCanvas(v.x, v.y);
    const opacity = v.filtered ? '0.15' : '1';

    // Show pulsing animation only for temporary highlights (click action)
    if (v.idx !== undefined && v.idx === highlightedIdx && !v.filtered) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', '14');
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#f59e0b'); ring.setAttribute('stroke-width', '3');
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'r'); anim.setAttribute('values', '10;22;10'); anim.setAttribute('dur', '1.2s'); anim.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(anim);

        const opac = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        opac.setAttribute('attributeName', 'opacity'); opac.setAttribute('values', '1;0.2;1'); opac.setAttribute('dur', '1.2s'); opac.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(opac);

        svg.appendChild(ring);
    }

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', 300); line.setAttribute('y1', 300); line.setAttribute('x2', cx); line.setAttribute('y2', cy);
    line.setAttribute('stroke', color); line.setAttribute('stroke-width', isQuery ? '3' : '2');
    line.setAttribute('opacity', (isHighlighted || (v.idx !== undefined && v.idx === hoveredIdx)) ? '1' : (isQuery ? '1' : opacity));
    line.setAttribute('marker-end', `url(#arrow-${isQuery ? 'q' : 't'})`);
    svg.appendChild(line);

    const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    d.setAttribute('cx', cx); d.setAttribute('cy', cy); d.setAttribute('r', isQuery ? '6' : '5');
    d.setAttribute('fill', color);
    d.setAttribute('stroke', (isHighlighted || (v.idx !== undefined && v.idx === hoveredIdx)) ? '#fff' : 'none');
    d.setAttribute('stroke-width', '2');
    d.setAttribute('opacity', isQuery ? '1' : opacity);
    d.style.cursor = isQuery ? 'grab' : 'default';

    svg.appendChild(d);

    if (label) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', cx + 10); t.setAttribute('y', cy - 10); t.setAttribute('fill', '#dde3f0');
        t.setAttribute('font-size', '11px'); t.setAttribute('opacity', isQuery ? '1' : opacity);
        t.textContent = label; svg.appendChild(t);
    }
}

function drawCategoryHulls() {
    const cats = {};
    vectors.forEach(v => {
        if (!v.cat) return;
        if (!cats[v.cat]) cats[v.cat] = [];
        cats[v.cat].push(v);
    });

    const catColors = { 'Fruits': '#f59e0b', 'Electronics': '#3b82f6', 'Beverage': '#10b981' };

    Object.entries(cats).forEach(([cat, vecs]) => {
        if (vecs.length < 2) return;
        const color = catColors[cat] || '#ffffff';
        let sumX = 0, sumY = 0;
        vecs.forEach(v => { sumX += v.x; sumY += v.y; });
        const centX = sumX / vecs.length, centY = sumY / vecs.length;
        let maxR = 0;
        vecs.forEach(v => { const d = distL2(v, { x: centX, y: centY }); if (d > maxR) maxR = d; });
        maxR = Math.max(maxR + 0.15, 0.2);

        const { cx, cy } = toCanvas(centX, centY);
        const r = maxR * 200;

        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx); ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', r); ellipse.setAttribute('ry', r * 0.8);
        ellipse.setAttribute('fill', color); ellipse.setAttribute('opacity', '0.06');
        ellipse.setAttribute('stroke', color); ellipse.setAttribute('stroke-opacity', '0.15');
        ellipse.setAttribute('stroke-dasharray', '4 2');
        svg.appendChild(ellipse);

        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', cx); t.setAttribute('y', cy + r + 15);
        t.setAttribute('fill', color); t.setAttribute('font-size', '10px');
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('opacity', '0.5');
        t.setAttribute('font-family', 'var(--mono)');
        t.textContent = `${cat} (${vecs.length})`;
        svg.appendChild(t);
    });
}

function addArrowDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const arrow = (id, color) => {
        const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', '8'); m.setAttribute('refY', '5');
        m.setAttribute('markerWidth', '6'); m.setAttribute('markerHeight', '6'); m.setAttribute('orient', 'auto-start-reverse');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill', color); m.appendChild(p); return m;
    };
    defs.appendChild(arrow('arrow-q', '#f59e0b')); defs.appendChild(arrow('arrow-t', '#3b82f6'));

    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.setAttribute('id', 'sphere-grad');
    grad.setAttribute('cx', '30%'); grad.setAttribute('cy', '30%'); grad.setAttribute('r', '70%');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', 'rgba(16, 185, 129, 0.1)');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', 'rgba(16, 185, 129, 0.01)');
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);
}

function renderDataTable() {
    const head = $('data-table-head'), body = $('data-table-body');
    if (!head || !body) return;

    const sc = AI_SCENARIOS[currentScenarioIdx];
    const metric = getScenarioMetric(sc);
    const showMetric = vectors.length > 0 && (sc.showSampling || queryVector);
    const showCat = vectors.some(v => v.cat);
    const showMag = sc && sc.name === 'Vector Normalization';
    if (sc.showSampling) sampleAnalysis = computeSamplingAnalysis(selectedSampleIdx);

    let headerHTML = '<th>ID</th><th>Object Name</th>';
    if (showCat) headerHTML += '<th>Category</th>';
    headerHTML += showMag ? '<th>Original Vector [x, y]</th><th>Magnitude</th><th>Normalized [x, y]</th>' : '<th>Vector [x, y]</th>';
    if (showMetric) {
        if (sc.showSampling) headerHTML += '<th class="sortable">Probability ▾</th><th>Status</th>';
        else headerHTML += `<th class="sortable">${metric === 'cosine' ? 'Cos Dist' : (metric === 'ip' ? 'IP Score' : 'L2 Dist')} ▾</th>`;
    }
    head.innerHTML = headerHTML;
    body.innerHTML = '';

    const indexed = vectors.map((v, i) => {
        if (sc.showSampling) {
            const item = sampleAnalysis ? sampleAnalysis.items.find((entry) => entry.i === i) : null;
            return { v, i, metricValue: item ? item.prob : (v.prob || 0), orderValue: item ? -item.prob : -(v.prob || 0) };
        }
        const metricData = queryVector ? getMetricValue(metric, queryVector, v) : null;
        return { v, i, metricValue: metricData ? metricData.primaryValue : 0, orderValue: metricData ? metricData.orderValue : 0 };
    });
    if (showMetric) indexed.sort((a, b) => a.orderValue - b.orderValue);

    const catColors = { 'Fruits': '#f59e0b', 'Electronics': '#3b82f6', 'Beverage': '#10b981' };

    indexed.forEach(({ v, i, metricValue }, rank) => {
        const r = document.createElement('tr');
        const isHighlighted = highlightedIdx === i || ((sc.showMath || sc.group === 'Similarity' || sc.name === 'Vector Normalization') && selectedTargetIdx === i);
        const isTopK = showMetric && !sc.showSampling && rank < paramK;
        const isHovered = (i === hoveredIdx);
        const isSampled = i === selectedSampleIdx;

        if (isHighlighted) {
            r.style.background = 'rgba(245, 158, 11, 0.25)';
            if (sc.showMath) r.style.borderLeft = '3px solid var(--leader)';
        } else if (isSampled) {
            r.style.background = 'rgba(16, 185, 129, 0.2)';
        } else if (isHovered) {
            r.style.background = 'rgba(255, 255, 255, 0.1)';
        } else if (isTopK) {
            r.style.background = 'rgba(16, 185, 129, 0.1)';
        }

        r.onmouseover = () => { hoveredIdx = i; render(); };
        r.onmouseout = () => { hoveredIdx = -1; render(); };
        r.style.cursor = 'pointer';
        r.onclick = () => {
            selectedTargetIdx = i;
            if (sc.name === 'Vector Normalization') lastAddedVector = v;
            highlightVector(i);
        };

        let cells = `<td>${i+1}</td><td>${v.label || 'Node'}</td>`;
        if (showCat) {
            const catColor = catColors[v.cat] || '#666';
            cells += `<td><span class="cat-dot" style="background:${catColor}"></span>${v.cat || '—'}</td>`;
        }
        if (showMag) {
            const ox = v.ox !== undefined ? v.ox : v.x;
            const oy = v.oy !== undefined ? v.oy : v.y;
            const m = Math.sqrt(ox*ox + oy*oy);
            const nx = ox / m, ny = oy / m;
            cells += `<td>[${ox.toFixed(2)}, ${oy.toFixed(2)}]</td>`;
            cells += `<td>${m.toFixed(3)}</td>`;
            cells += `<td><span style="color:var(--ok)">[${nx.toFixed(2)}, ${ny.toFixed(2)}]</span></td>`;
        } else {
            cells += `<td>[${v.x.toFixed(2)}, ${v.y.toFixed(2)}]</td>`;
        }
        if (showMetric) {
            if (sc.showSampling) {
                const inTopK = sampleAnalysis && sampleAnalysis.topKIndices.has(i);
                const inTopP = sampleAnalysis && sampleAnalysis.topPIndices.has(i);
                let status = 'Pruned';
                if (sc.name === 'Top-K Sampling') status = inTopK ? 'Eligible' : 'Pruned';
                else if (sc.name === 'Top-P (Nucleus) Sampling') status = inTopP ? 'Eligible' : 'Pruned';
                else status = inTopK && inTopP ? 'Eligible' : (inTopK ? 'Top-K only' : (inTopP ? 'Top-P only' : 'Pruned'));
                if (isSampled) status = 'Sampled';
                cells += `<td class="dist-val">${(metricValue * 100).toFixed(2)}%</td><td>${status}</td>`;
            } else {
                const absMetric = metric === 'ip' ? Math.abs(metricValue) : metricValue;
                const cls = absMetric < 0.3 ? 'dist-val' : absMetric < 0.8 ? 'dist-val far' : 'dist-val very-far';
                cells += `<td class="${cls}">${metricValue.toFixed(3)}</td>`;
            }
        }
        r.innerHTML = cells;
        body.appendChild(r);
    });
}

function renderHNSW() {
    if (hnswNodes.length === 0) {
        srand(0x40bea7); // reproducible fallback graph
        for (let i = 0; i < 25; i++) hnswNodes.push({ x: (srandom() - 0.5) * 2.4, y: (srandom() - 0.5) * 2.4, layer: 0 });
        const l0 = [...hnswNodes];
        l0.filter(() => srandom() < 0.3).forEach(n => hnswNodes.push({ x: n.x, y: n.y, layer: 1 }));
        hnswNodes.filter(n => n.layer === 1).filter(() => srandom() < 0.4).forEach(n => hnswNodes.push({ x: n.x, y: n.y, layer: 2 }));
    }

    const layerColors = { 0: '#3b82f6', 1: '#10b981', 2: '#f59e0b' };
    const layerNames = { 0: 'Layer 0 (Crust)', 1: 'Layer 1 (Mid)', 2: 'Layer 2 (Core)' };

    [0, 1, 2].forEach(layer => {
        const r = 200 - (layer * 70);
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', 300); ring.setAttribute('cy', 300); ring.setAttribute('r', r);
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', layerColors[layer]);
        ring.setAttribute('stroke-opacity', '0.15'); ring.setAttribute('stroke-dasharray', '5 5');
        svg.appendChild(ring);

        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', 300); lbl.setAttribute('y', 300 - r - 8);
        lbl.setAttribute('fill', layerColors[layer]); lbl.setAttribute('font-size', '8px');
        lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('opacity', '0.8');
        lbl.setAttribute('font-family', 'var(--head)'); lbl.setAttribute('font-weight', '600');
        lbl.textContent = layerNames[layer];
        svg.appendChild(lbl);
    });

    hnswNodes.forEach((n, i) => {
        // Sort other nodes by distance and connect to the nearest M
        const others = hnswNodes
            .filter((m, j) => i !== j && n.layer === m.layer)
            .map(m => ({ node: m, dist: distL2(n, m) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, paramM);

        others.forEach(o => {
            const p1 = toHNSWCanvas(n.x, n.y, n.layer), p2 = toHNSWCanvas(o.node.x, o.node.y, o.node.layer);
            const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            l.setAttribute('x1', p1.cx); l.setAttribute('y1', p1.cy); l.setAttribute('x2', p2.cx); l.setAttribute('y2', p2.cy);
            l.setAttribute('stroke', n.color || layerColors[n.layer]); l.setAttribute('stroke-width', '1.5');
            l.setAttribute('opacity', '0.1');
            svg.appendChild(l);
        });
    });

    [0, 1, 2].forEach(layer => {
        hnswNodes.filter(n => n.layer === layer).forEach(n => {
            const { cx, cy } = toHNSWCanvas(n.x, n.y, n.layer);
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 5 + layer * 1.5);
            c.setAttribute('fill', n.color || layerColors[layer]);
            c.setAttribute('opacity', '0.8'); // Ensure visibility
            if (layer === 2) { c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '2'); c.setAttribute('stroke-opacity', '0.9'); }
            svg.appendChild(c);
        });
    });

    if (queryVector) {
        const { cx, cy } = toHNSWCanvas(queryVector.x, queryVector.y, 0);
        const q = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        q.setAttribute('cx', cx); q.setAttribute('cy', cy); q.setAttribute('r', '10');
        q.setAttribute('fill', '#f59e0b'); q.setAttribute('stroke', '#fff'); q.setAttribute('stroke-width', '2');
        q.style.cursor = 'grab';
        svg.appendChild(q);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', cx + 15); t.setAttribute('y', cy - 15); t.setAttribute('fill', '#f59e0b');
        t.setAttribute('font-size', '10px'); t.setAttribute('font-weight', 'bold');
        t.textContent = 'Query'; svg.appendChild(t);
    }
}

function drawMathVisuals(q, v) {
    const pQ = toCanvas(q.x, q.y), pV = toCanvas(v.x, v.y);
    const origin = { cx: 300, cy: 300 };

    // 1. L2 BRIDGE (Amber)
    const l2Line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2Line.setAttribute('x1', pQ.cx); l2Line.setAttribute('y1', pQ.cy); l2Line.setAttribute('x2', pV.cx); l2Line.setAttribute('y2', pV.cy);
    l2Line.setAttribute('stroke', '#f59e0b'); l2Line.setAttribute('stroke-width', '2');
    l2Line.setAttribute('stroke-dasharray', '5 3');
    l2Line.setAttribute('opacity', '0.7');
    svg.appendChild(l2Line);

    const d = distL2(q, v);
    const dLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dLabel.setAttribute('x', (pQ.cx + pV.cx) / 2); dLabel.setAttribute('y', (pQ.cy + pV.cy) / 2 - 12);
    dLabel.setAttribute('fill', '#f59e0b'); dLabel.setAttribute('font-size', '11px'); dLabel.setAttribute('font-weight', 'bold');
    dLabel.setAttribute('text-anchor', 'middle'); dLabel.textContent = `L2: ${d.toFixed(2)}`;
    svg.appendChild(dLabel);

    // 2. COSINE ARC (Cyan)
    const magQ = mag(q), magV = mag(v);
    if (magQ > 0 && magV > 0) {
        const aQ = Math.atan2(q.y, q.x), aV = Math.atan2(v.y, v.x);
        const r = 35;
        const s = { x: 300 + Math.cos(aQ) * r, y: 300 - Math.sin(aQ) * r };
        const e = { x: 300 + Math.cos(aV) * r, y: 300 - Math.sin(aV) * r };
        const la = Math.abs(aV - aQ) > Math.PI ? 1 : 0;
        const sw = aV > aQ ? 0 : 1;

        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arc.setAttribute('d', `M ${s.x} ${s.y} A ${r} ${r} 0 ${la} ${sw} ${e.x} ${e.y}`);
        arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', '#60a5fa'); arc.setAttribute('stroke-width', '2');
        svg.appendChild(arc);

        const cLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const midA = (aQ + aV) / 2 + (la ? Math.PI : 0);
        cLabel.setAttribute('x', 300 + Math.cos(midA) * (r + 14)); cLabel.setAttribute('y', 300 - Math.sin(midA) * (r + 14));
        cLabel.setAttribute('fill', '#60a5fa'); cLabel.setAttribute('font-size', '10px');
        cLabel.setAttribute('text-anchor', 'middle');
        const deg = Math.abs(aV - aQ) * (180 / Math.PI);
        cLabel.textContent = `${deg.toFixed(0)}°`;
        svg.appendChild(cLabel);
    }

    // 3. INNER PRODUCT PROJECTION (Purple)
    drawProjectionVisuals(q, v, '#a855f7');
}

function drawProjectionVisuals(q, v, color) {
    const pQ = toCanvas(q.x, q.y), pV = toCanvas(v.x, v.y);
    const origin = { cx: 300, cy: 300 };

    const dotVal = dot(q, v);
    const magQ2 = dot(q, q);
    if (magQ2 > 0) {
        // Draw the Axis of Projection (infinite-ish line through Q)
        const angleQ = Math.atan2(q.y, q.x);
        const axisS = { x: 300 - Math.cos(angleQ) * 500, y: 300 + Math.sin(angleQ) * 500 };
        const axisE = { x: 300 + Math.cos(angleQ) * 500, y: 300 - Math.sin(angleQ) * 500 };

        const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        axis.setAttribute('x1', axisS.x); axis.setAttribute('y1', axisS.y); axis.setAttribute('x2', axisE.x); axis.setAttribute('y2', axisE.y);
        axis.setAttribute('stroke', color); axis.setAttribute('stroke-width', '1'); axis.setAttribute('opacity', '0.1');
        svg.appendChild(axis);

        const scale = dotVal / magQ2;
        const proj = { x: q.x * scale, y: q.y * scale };
        const pP = toCanvas(proj.x, proj.y);

        // Perpendicular line from V to Projection Point
        const perpLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        perpLine.setAttribute('x1', pV.cx); perpLine.setAttribute('y1', pV.cy); perpLine.setAttribute('x2', pP.cx); perpLine.setAttribute('y2', pP.cy);
        perpLine.setAttribute('stroke', color); perpLine.setAttribute('stroke-dasharray', '3 2');
        perpLine.setAttribute('opacity', '0.6');
        svg.appendChild(perpLine);

        // Dot at projection point
        const pDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pDot.setAttribute('cx', pP.cx); pDot.setAttribute('cy', pP.cy); pDot.setAttribute('r', '3');
        pDot.setAttribute('fill', color);
        svg.appendChild(pDot);
    }
}

function copySQL() {
    const text = ddlCode.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.ddl-sec button'); btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
    });
}

function injectCopyButtons() {
    setTimeout(() => {
        const guide = $('main-guide');
        if (!guide) return;
        guide.querySelectorAll('pre').forEach(pre => {
            if (pre.parentElement.classList.contains('code-block-wrap')) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrap';
            pre.parentNode.insertBefore(wrapper, pre); wrapper.appendChild(pre);
            const btn = document.createElement('button');
            btn.className = 'code-copy-btn'; btn.textContent = 'Copy';
            btn.onclick = () => {
                navigator.clipboard.writeText(pre.innerText).then(() => {
                    btn.textContent = '✓ Copied'; btn.classList.add('copied');
                    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
                });
            };
            wrapper.appendChild(btn);
        });
    }, 500);
}

window.toggleSidebar = () => {
    const sb = $('sidebar');
    sb.classList.toggle('collapsed');
    const btn = sb.querySelector('.toggle-left');
    btn.textContent = sb.classList.contains('collapsed') ? '▶' : '◀';
};

window.toggleInfoPanel = () => {
    const ip = $('info-panel');
    ip.classList.toggle('collapsed');
    const btn = ip.querySelector('.toggle-right');
    btn.textContent = ip.classList.contains('collapsed') ? '◀' : '▶';
};

window.toggleExpandInfoPanel = () => {
    const ip = $('info-panel');
    ip.classList.toggle('expanded');
};

window.toggleFocusMode = () => {
    document.body.classList.toggle('focus-mode');
};

window.switchMainTab = (tab, sectionId) => {
    const explorerCanvas = $('main-canvas-wrap');
    const explorerData = $('data-panel');
    const guide = $('main-guide');
    const btnExplorer = $('tab-btn-explorer');
    const btnGuide = $('tab-btn-guide');
    const narrationBar = $('narration-bar');
    const homeView = $('home-view');
    const infoPanel = $('info-panel');
    const tabContainer = $('tab-container');

    if (tab === 'explorer') {
        const sc = AI_SCENARIOS[currentScenarioIdx] || {};
        const isHome = sc.isHome || false;
        const isSamplingView = sc.showSampling || false;
        const isSpecialView = sc.showRAG || sc.showHybrid || sc.showMCP || sc.showDistributed || sc.showDimensions || sc.showGuide;
        if (infoPanel) infoPanel.classList.toggle('sampling-mode', isSamplingView);

        if (isHome) {
            if (homeView) homeView.style.display = 'block';
            if (tabContainer) tabContainer.style.display = 'none';
            if (narrationBar) narrationBar.style.display = 'none';
            if (infoPanel) infoPanel.style.display = 'none';
            if (explorerCanvas) explorerCanvas.style.display = 'none';
            if (explorerData) explorerData.style.display = 'none';
            const ragFlow = $('rag-flow-container');
            if (ragFlow) ragFlow.style.display = 'none';
        } else {
            if (homeView) homeView.style.display = 'none';
            if (tabContainer) tabContainer.style.display = 'flex';
            if (narrationBar) narrationBar.style.display = 'flex';
            if (infoPanel) infoPanel.style.display = 'flex';
            if (explorerCanvas) explorerCanvas.style.display = 'flex';
            if (explorerData) explorerData.style.display = isSpecialView ? 'none' : 'flex';
            const ragFlow = $('rag-flow-container');
            if (ragFlow) ragFlow.style.display = isSpecialView ? 'block' : 'none';
        }

        guide.style.display = 'none';
        btnExplorer.style.color = 'var(--leader)';
        btnExplorer.style.borderBottomColor = 'var(--leader)';
        btnGuide.style.color = 'var(--txt3)';
        btnGuide.style.borderBottomColor = 'transparent';
    } else if (tab === 'guide') {
        if (homeView) homeView.style.display = 'none';
        if (tabContainer) tabContainer.style.display = 'flex';
        explorerCanvas.style.display = 'none';
        explorerData.style.display = 'none';
        guide.style.display = 'block';
        if (narrationBar) narrationBar.style.display = 'none';
        if (infoPanel) infoPanel.style.display = 'none';
        btnGuide.style.color = 'var(--leader)';
        btnGuide.style.borderBottomColor = 'var(--leader)';
        btnExplorer.style.color = 'var(--txt3)';
        btnExplorer.style.borderBottomColor = 'transparent';

        let targetId = sectionId;
        if (!targetId) {
            if (currentScenarioIdx >= 1 && currentScenarioIdx <= 3) targetId = 'guide-s1';
            else if (currentScenarioIdx >= 4 && currentScenarioIdx <= 7) targetId = 'guide-s4';
            else if (currentScenarioIdx >= 8 && currentScenarioIdx <= 9) targetId = 'guide-s5';
            else if (currentScenarioIdx === 10) targetId = 'guide-s9';
            else if (currentScenarioIdx === 11) targetId = 'guide-s6';
            else if (currentScenarioIdx === 12) targetId = 'guide-s7';
            else if (currentScenarioIdx === 13) targetId = 'guide-s8';
            else if (currentScenarioIdx >= 14) targetId = 'guide-s10';
        }

        if (targetId) {
            const el = $(targetId);
            if (el) {
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
        injectCopyButtons();
    }
};

function toggleHelp() {
    const modal = $('help-modal');
    if (modal) {
        modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
    }
}

window.toggleGuideSetting = function(enabled) {
    guideEnabled = enabled;
    const feedback = $('sim-feedback');
    if (feedback) feedback.textContent = '';

    svg.onmousedown = handleMouseDown;
    window.onmousemove = handleMouseMove;
    window.onmouseup = handleMouseUp;

    render();
    renderTour();
}

function handleMouseDown(e) {
    if (!queryVector) return;

    // Get SVG bounding rect
    const rect = svg.getBoundingClientRect();
    const qPos = toCanvas(queryVector.x, queryVector.y);
    const qScreenX = rect.left + qPos.cx;
    const qScreenY = rect.top + qPos.cy;

    // Check if clicking near the query vector dot for dragging
    const dist = Math.sqrt(Math.pow(e.clientX - qScreenX, 2) + Math.pow(e.clientY - qScreenY, 2));
    if (dist < 40) {
        isDraggingQuery = true;
        svg.style.cursor = 'grabbing';
        return;
    }

    // Otherwise, move query vector to the clicked position
    const scaleX = 600 / rect.width;
    const scaleY = 600 / rect.height;
    const v = fromCanvas((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    const sc = AI_SCENARIOS[currentScenarioIdx];

    if (sc.name.includes('Distance') || sc.name.includes('HNSW') || sc.name.includes('Embeddings') || sc.name.includes('Sampling') || sc.name.includes('L2') || sc.name.includes('Cosine') || sc.name.includes('Product')) {
        queryVector = v;
        // Reset search path and steps without destroying index
        activePath = []; 
        currentStepIdx = -1;
        
        if (!sc.name.includes('Sampling')) {
             setInteractiveSQL(`-- Query at [${v.x.toFixed(3)}, ${v.y.toFixed(3)}]\nSELECT name, embedding <=> '[${v.x.toFixed(3)}, ${v.y.toFixed(3)}]' AS dist\nFROM items ORDER BY dist LIMIT 3;`);
        }
        render();
    } else if (sc.name === 'Vector Normalization') {
        lastAddedVector = v;
        vectors.push({ x: v.x, y: v.y, label: `Mag: ${mag(v).toFixed(2)}`, color: mag(v) > 1 ? '#ef4444' : '#60a5fa' });
        render();
    }
}

function handleMouseMove(e) {
    if (!isDraggingQuery) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    queryVector = fromCanvas(svgPt.x, svgPt.y);
    render();
}

function handleMouseUp() {
    if (isDraggingQuery) {
        isDraggingQuery = false;
        svg.style.cursor = 'crosshair';
    }
}

function renderTour() {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (!sc || !sc.guidedTour || !guideEnabled) {
        closeTour();
        return;
    }

    const tour = $('tour-guide');
    const titleEl = $('tg-title');
    const textEl = $('tg-text');
    const currentEl = $('tg-current');
    const totalEl = $('tg-total');
    const nextBtn = $('tg-next-btn');

    if (currentTourScenario !== sc.name) {
        currentTourIdx = 0;
        currentTourScenario = sc.name;
        resetScenario();
    }

    tour.style.display = 'flex';
    const step = sc.guidedTour[currentTourIdx];

    // Trigger active action if present in tour step
    if (step.onStart) runSafely(step.onStart, step.title);
    else if (sc.steps && sc.steps[currentTourIdx]) jumpToStep(currentTourIdx);

    titleEl.textContent = step.title;
    textEl.innerHTML = step.text;
    currentEl.textContent = currentTourIdx + 1;
    totalEl.textContent = sc.guidedTour.length;
    nextBtn.textContent = (currentTourIdx === sc.guidedTour.length - 1) ? 'Finish' : 'Next';
}

function nextTourStep() {
    const sc = AI_SCENARIOS[currentScenarioIdx];
    if (!sc || !sc.guidedTour) return;

    if (currentTourIdx < sc.guidedTour.length - 1) {
        currentTourIdx++;
        renderTour();
    } else {
        const gToggle = $('guide-toggle');
        if (gToggle) {
            gToggle.checked = false;
            toggleGuideSetting(false);
        }
    }
}

function prevTourStep() {
    if (currentTourIdx > 0) {
        currentTourIdx--;
        renderTour();
    }
}

function closeTour() {
    const tour = $('tour-guide');
    if (tour) tour.style.display = 'none';
    currentTourScenario = null;
    currentTourIdx = 0;
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        const modal = $('help-modal');
        if (modal && modal.style.display === 'flex') modal.style.display = 'none';
        if (guideEnabled) {
            const gToggle = $('guide-toggle');
            if (gToggle) {
                gToggle.checked = false;
                toggleGuideSetting(false);
            }
        }
    }
});

window.seedSamplingPoints = () => {
    vectors = [];
    for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.5) * 2.5;
        const label = SAMPLING_VOCAB[i] || `candidate_${i + 1}`;
        // Create a more skewed distribution so we cross 70% within ~10 items
        let prob = Math.random() * 0.05;
        if (i < 8) prob = Math.random() * 0.3 + 0.1;

        vectors.push({
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r,
            color: '#3b82f6',
            prob: prob,
            label
        });
    }
    const sum = vectors.reduce((a, b) => a + b.prob, 0);
    vectors.forEach(v => v.prob /= sum);
    selectedSampleIdx = -1;
    sampleAnalysis = computeSamplingAnalysis(selectedSampleIdx);
    render();
};

window.runSamplingQuery = () => {
    sampleAnalysis = computeSamplingAnalysis();
    if (!sampleAnalysis || !sampleAnalysis.eligible.length) return;
    let threshold = Math.random() * sampleAnalysis.eligibleMass;
    let selected = sampleAnalysis.eligible[0];
    for (const item of sampleAnalysis.eligible) {
        threshold -= item.prob;
        if (threshold <= 0) {
            selected = item;
            break;
        }
    }
    selectedSampleIdx = selected.i;
    sampleAnalysis = computeSamplingAnalysis(selectedSampleIdx);
    const mode = AI_SCENARIOS[currentScenarioIdx].name;
    addLog('SAMPLER', `${mode}: kept ${sampleAnalysis.eligible.length} candidates (${(sampleAnalysis.eligibleMass * 100).toFixed(1)}% probability mass), sampled ${sampleAnalysis.selected.label}.`);
    render();
};
window.showRankingFlip = () => {
    if (!vectors.length || !queryVector) return;
    const q = queryVector;
    const items = vectors.map(v => ({
        label: v.label || '?',
        l2: distL2(q, v),
        cos: 1 - cosSim(q, v),
        ip: -dot(q, v)
    }));
    const rank = (key) => [...items].sort((a, b) => a[key] - b[key]).map(x => x.label);
    const l2R = rank('l2'), cosR = rank('cos'), ipR = rank('ip');
    const changed = l2R.join() !== cosR.join() || cosR.join() !== ipR.join();
    const rowStyle = 'border-bottom:1px solid rgba(255,255,255,0.06);';
    const rows = l2R.map((_, i) => {
        const match = l2R[i] === cosR[i] && cosR[i] === ipR[i];
        const hi = match ? '' : 'color:#f59e0b; font-weight:600;';
        const mark = match ? '' : ' ⚠'; // non-color cue for changed position
        return `<tr style="${rowStyle}"><td style="padding:3px 8px; color:var(--txt3);">#${i+1}${mark}</td><td style="padding:3px 8px; ${hi}">${l2R[i]}</td><td style="padding:3px 8px; ${hi}">${cosR[i]}</td><td style="padding:3px 8px; ${hi}">${ipR[i]}</td></tr>`;
    }).join('');
    const hdr = `<tr style="border-bottom:1px solid var(--border);"><th style="padding:3px 8px; color:var(--txt3); font-weight:600;">Rank</th><th style="padding:3px 8px; color:#60a5fa; font-weight:600;">L2 ↑</th><th style="padding:3px 8px; color:#10b981; font-weight:600;">Cosine ↑</th><th style="padding:3px 8px; color:#a855f7; font-weight:600;">Inner Product ↑</th></tr>`;
    addLog('FLIP', `Same 5 vectors, 3 metrics — rankings ${changed ? '<b style="color:#f59e0b">do differ</b>' : 'happen to match'}:<br><table style="border-collapse:collapse; font-size:12px; font-family:var(--mono); margin-top:4px;">${hdr}${rows}</table><em style="font-size:11px; color:var(--txt3);">${changed ? '⚠ (amber) = position changed across metrics.' : 'All metrics agree on this dataset.'}</em>`);
};
window.runRangeSearch = (radius = 0.6) => {
    window.rangeSearchRadius = radius;
    const hits = vectors.filter((v) => distL2(queryVector, v) <= window.rangeSearchRadius).length;
    addLog('L2', `Running Range Search (Radius: ${radius}). ${hits} vectors fall within the threshold.`);
    render();
};
window.showAngularGap = () => { if (highlightedIdx === -1) highlightedIdx = 0; addLog('COSINE', 'Visualizing the angular gap (theta) between vectors.'); render(); };

window.showProjection = () => {
    if (highlightedIdx === -1) highlightedIdx = 0;
    addLog('IP', 'Visualizing vector projection. Inner Product = Magnitude(A) * Magnitude(B) * Cos(theta).');
    render();
};

function prevTourStep() {
    if (currentTourIdx > 0) {
        currentTourIdx--;
        renderTour();
    }
    // Global Escape listener moved to main switch case
}

function closeTour() {
    const tour = $('tour-guide');
    if (tour) tour.style.display = 'none';
}

function getIconForGroup(group) {
    switch (group) {
        case 'Fundamentals': return '🧩';
        case 'Similarity': return '📏';
        case 'HNSW Indexing': return '🏗️';
        case 'Architecture': return '🌐';
        case 'MCP Integration': return '🔌';
        case 'Advanced Sampling': return '🎲';
        default: return '📦';
    }
}

// ── INIT ──

document.addEventListener('DOMContentLoaded', initEngine);
if (document.readyState === 'complete' || document.readyState === 'interactive') initEngine();
