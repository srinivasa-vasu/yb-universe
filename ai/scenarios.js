const AI_SCENARIOS = [
    {
        name: 'home',
        desc: 'Home',
        isHome: true,
        init: () => {
            vectors = [];
            queryVector = null;
            hnswNodes = [];
            window.showCategoryHulls = false;
            window.showUnitCircle = false;
        }
    },
    {
        name: 'Vector Embeddings',
        group: 'Fundamentals',
        icon: '🧩',
        desc: 'Understand how real-world data (text, images) is transformed into mathematical vectors. In vector space, similar concepts sit closer together.',
        sql: '-- 1. Enable pgvector extension\nCREATE EXTENSION IF NOT EXISTS vector;\n\n-- 2. Create table with vector type\nCREATE TABLE items (\n  id SERIAL PRIMARY KEY,\n  name TEXT,\n  embedding vector(2) -- 2 dimensions for this demo\n);\n\n-- 3. Insert vector data\nINSERT INTO items (name, embedding) VALUES \n(\'Apple\', \'[0.85, 0.22]\'),\n(\'Banana\', \'[0.72, 0.38]\'),\n(\'Laptop\', \'[-0.55, 0.81]\');\n\n-- 4. Cast array to vector explicitly\nSELECT \'[0.1, 0.2, 0.3]\'::vector;',
        extraBtns: [
            { label: '➕ Add Random Item', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '🔍 Find Nearest', cb: 'runVectorSearch', cls: 'btn-g' }
        ],
        init: () => {
            vectors = [];
            queryVector = { x: 0.5, y: 0.5 };
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Vector Space', text: 'This is where data becomes geometry. Click anywhere to simulate adding a new vector.', onStart: () => { window.jumpToStep(2); } },
            { target: '#ddl-panel', title: 'SQL Schema', text: 'YugabyteDB is PostgreSQL-compatible. Notice the "vector" type used to store embeddings.', onStart: () => { window.jumpToStep(1); } }
        ],
        steps: [
            {
                label: 'Enable Extension',
                desc: 'pgvector is a PostgreSQL extension. The first step is always <b>CREATE EXTENSION vector</b>. YugabyteDB 2.20+ ships it built-in — no separate install needed. The canvas activates once we INSERT vectors in step 3.',
                action: () => {
                    window.setInteractiveSQL('-- Step 1: Enable pgvector\nCREATE EXTENSION IF NOT EXISTS vector;\n\n-- Verify it loaded\nSELECT * FROM pg_extension WHERE extname = \'vector\';');
                    addLog('DDL', 'pgvector enabled. The <b>vector</b> type and distance operators (<->, <=>, <#>) are now available.');
                }
            },
            {
                label: 'Create Table',
                desc: 'Declare an <b>embedding vector(N)</b> column alongside your regular columns. <code>N</code> must match your embedding model — 1536 for OpenAI ada-002, 768 for MiniLM. We use 2D here so vectors are visible on the canvas.',
                action: () => {
                    window.setInteractiveSQL('-- Step 2: Table with vector column\nCREATE TABLE items (\n  id SERIAL PRIMARY KEY,\n  name TEXT,\n  category TEXT,\n  embedding vector(2) -- 2D for this demo; production uses 768–1536\n);');
                    addLog('DDL', 'Table created. The <b>vector(2)</b> column will hold 2D coordinates — one per item we insert.');
                }
            },
            {
                label: 'Insert Fruits',
                desc: 'Each INSERT stores a coordinate in vector space. Notice how fruit items cluster together — they share semantic meaning.',
                action: async () => {
                    const fruits = [
                        { x: 0.85, y: 0.22, label: 'Apple', color: '#f59e0b', cat: 'Fruits' },
                        { x: 0.72, y: 0.38, label: 'Banana', color: '#f59e0b', cat: 'Fruits' },
                        { x: 0.90, y: 0.10, label: 'Mango', color: '#f59e0b', cat: 'Fruits' }
                    ];
                    for (const f of fruits) {
                        vectors.push(f);
                        window.setInteractiveSQL(`INSERT INTO items (name, category, embedding)\nVALUES ('${f.label}', 'Fruits', '[${f.x}, ${f.y}]');`);
                        render();
                        await new Promise(r => setTimeout(r, 400 / speedVal));
                    }
                }
            },
            {
                label: 'Insert Electronics',
                desc: 'Electronics cluster in a different region of the space — far from fruits. <b>Semantic proximity = spatial proximity</b>.',
                action: async () => {
                    const elec = [
                        { x: -0.55, y: 0.81, label: 'Laptop', color: '#3b82f6', cat: 'Electronics' },
                        { x: -0.50, y: 0.85, label: 'Smartphone', color: '#3b82f6', cat: 'Electronics' },
                        { x: -0.45, y: 0.65, label: 'Tablet', color: '#3b82f6', cat: 'Electronics' }
                    ];
                    for (const e of elec) {
                        vectors.push(e);
                        window.setInteractiveSQL(`INSERT INTO items (name, category, embedding)\nVALUES ('${e.label}', 'Electronics', '[${e.x}, ${e.y}]');`);
                        render();
                        await new Promise(r => setTimeout(r, 400 / speedVal));
                    }
                }
            },
            {
                label: 'Semantic Clusters',
                desc: 'Items with similar meaning naturally form clusters. The <span class="c-amber">amber</span> cluster is Fruits, the <span class="c-blue">blue</span> cluster is Electronics. But this isn\'t unique to products — <b>any data with semantic similarity clusters together</b>. Continue to see a word example.',
                action: () => {
                    window.showCategoryHulls = true;
                    render();
                }
            },
            {
                label: 'Word Proximity',
                desc: 'The same principle works for language: <span class="c-green"><b>Dog, Puppy, Wolf</b></span> cluster together — they share semantic meaning. <span style="color:#ec4899"><b>Telescope, Microscope</b></span> form a separate cluster. These two groups stay far apart because they describe different concepts.',
                action: async () => {
                    const words = [
                        { x:  0.65, y: -0.65, label: 'Dog',        color: '#10b981', cat: 'Animals' },
                        { x:  0.75, y: -0.55, label: 'Puppy',       color: '#10b981', cat: 'Animals' },
                        { x:  0.58, y: -0.72, label: 'Wolf',        color: '#10b981', cat: 'Animals' },
                        { x: -0.65, y: -0.50, label: 'Telescope',   color: '#ec4899', cat: 'Optics'  },
                        { x: -0.55, y: -0.62, label: 'Microscope',  color: '#ec4899', cat: 'Optics'  },
                    ];
                    for (const w of words) {
                        vectors.push(w);
                        render();
                        await new Promise(r => setTimeout(r, 350 / speedVal));
                    }
                    window.showCategoryHulls = true;
                    render();
                    addLog('EMBED', '4 semantic clusters visible: Fruits · Electronics · Animals · Optics. Same-cluster items are always closer than cross-cluster items.');
                }
            },
            {
                label: 'KNN Search',
                desc: 'Place a query vector and find the nearest neighbor. This is the foundation of similarity search: <b>ORDER BY embedding &lt;=&gt; query LIMIT K</b>.',
                action: () => {
                    queryVector = { x: 0.5, y: 0.5 };
                    window.setInteractiveSQL("-- Find the nearest item to a query vector\nSELECT name, embedding <=> '[0.5, 0.5]' AS dist\nFROM items\nORDER BY dist LIMIT 1;");
                    render();
                    window.runVectorSearch();
                }
            }
        ]
    },
    {
        name: 'Vector Dimensions',
        group: 'Fundamentals',
        icon: '📊',
        desc: 'Production embedding models use high dimensions (e.g., 1536 for OpenAI). Higher dimensions allow for more complex semantic capture.',
        sql: '-- pgvector supports up to 16,000 dimensions\nCREATE TABLE high_dim (\n  id SERIAL PRIMARY KEY,\n  v vector(1536)\n);\n\n-- Inspect dimensions\nSELECT vector_dims(v) FROM high_dim LIMIT 1;',
        showDimensions: true,
        init: () => {
            const container = $('rag-flow-container');
            container.innerHTML = `
                <div class="rag-flow-main" style="display:flex; flex-direction:column; gap:20px; width:100%; padding:40px; box-sizing:border-box;">
                    <div style="font-family:var(--head); color:var(--leader); font-size:18px; margin-bottom:10px;">High-Dimensional Feature Map</div>
                    <p style="color:var(--txt2); font-size:14px; max-width:600px;">While we visualize vectors in 2D, production models like <b>OpenAI ada-002</b> operate in 1536 dimensions. Each "cell" below represents a feature intensity.</p>
                    
                    <div style="display:grid; grid-template-columns: repeat(32, 1fr); gap:2px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
                        ${Array.from({length: 512}, (_, i) => `
                            <div class="dim-cell" id="dim-${i}" style="aspect-ratio:1; background:rgba(168,85,247,${0.1 + Math.random()*0.6}); border-radius:1px; transition:all 0.3s;"></div>
                        `).join('')}
                    </div>
                    <div style="display:flex; justify-content:space-between; color:var(--txt3); font-size:10px; font-family:var(--mono);">
                        <span>Dimension 1</span>
                        <span>Dimension 512 (of 1536)</span>
                    </div>
                    <div style="margin-top:20px; width:100%;">
                      <div style="font-family:var(--head); font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--leader); margin-bottom:10px;">Popular Embedding Models</div>
                      <table style="width:100%; border-collapse:collapse; font-size:12px; font-family:var(--mono);">
                        <thead><tr style="border-bottom:1px solid var(--border);">
                          <th style="text-align:left; padding:5px 8px; color:var(--txt3); font-weight:600;">Model</th>
                          <th style="text-align:right; padding:5px 8px; color:var(--txt3); font-weight:600;">Dims</th>
                          <th style="text-align:left; padding:5px 8px; color:var(--txt3); font-weight:600;">Best For</th>
                        </tr></thead>
                        <tbody>
                          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:5px 8px; color:var(--txt2);">all-MiniLM-L6</td><td style="padding:5px 8px; color:#60a5fa; text-align:right;">384</td><td style="padding:5px 8px; color:var(--txt3);">Fast, low memory</td></tr>
                          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:5px 8px; color:var(--txt2);">BERT-base</td><td style="padding:5px 8px; color:#60a5fa; text-align:right;">768</td><td style="padding:5px 8px; color:var(--txt3);">Balanced quality</td></tr>
                          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:5px 8px; color:var(--txt2);">Cohere Embed v3</td><td style="padding:5px 8px; color:#a78bfa; text-align:right;">1024</td><td style="padding:5px 8px; color:var(--txt3);">Better recall</td></tr>
                          <tr style="border-bottom:1px solid rgba(255,255,255,0.04);"><td style="padding:5px 8px; color:var(--txt2);">OpenAI ada-002</td><td style="padding:5px 8px; color:#a855f7; text-align:right; font-weight:600;">1536</td><td style="padding:5px 8px; color:var(--txt3);">Production default ★</td></tr>
                          <tr><td style="padding:5px 8px; color:var(--txt2);">text-embedding-3-large</td><td style="padding:5px 8px; color:#ec4899; text-align:right; font-weight:600;">3072</td><td style="padding:5px 8px; color:var(--txt3);">Highest quality</td></tr>
                        </tbody>
                      </table>
                    </div>
                </div>`;
            window._dimTimer = setInterval(() => {
                const cells = document.querySelectorAll('.dim-cell');
                if (cells.length) {
                    for (let i = 0; i < 10; i++) {
                        const idx = Math.floor(Math.random() * cells.length);
                        cells[idx].style.background = `rgba(168,85,247,${0.1 + Math.random()*0.8})`;
                    }
                }
            }, 500);
        },
        steps: [
            {
                label: 'What Are Dimensions?',
                desc: 'Each cell in the grid represents one <b>dimension</b> of the vector. Brighter cells carry more signal for that feature. A 1536-dim vector has 1536 such values — all computed by the embedding model at once.',
                action: () => { addLog('DIM', 'Each dimension is a learned feature weight. Brighter = stronger activation.'); }
            },
            {
                label: 'Why More Dimensions?',
                desc: 'Higher dimensions capture finer semantic distinctions. See the model table: going from 384 (MiniLM) to 1536 (ada-002) captures ~4× more nuance, but each step costs memory — a million 1536-dim vectors need ~12 GB just for the HNSW graph.',
                action: () => { addLog('DIM', 'Typical ranges: 768 (MiniLM), 1024 (Cohere), 1536 (OpenAI ada-002), 3072 (OpenAI text-3-large).'); }
            },
            {
                label: 'Dimension Limits in YugabyteDB',
                desc: 'pgvector supports up to <b>16,000 dimensions</b>. The HNSW index has no hard cap beyond that. For most production workloads, 768–1536 dims hit the best recall-vs-performance balance.',
                action: () => {
                    window.setInteractiveSQL('-- Check dimension count of stored vectors\nSELECT vector_dims(embedding) AS dims\nFROM items LIMIT 1;\n\n-- pgvector max: 16,000 dimensions\nCREATE TABLE high_dim (\n  id SERIAL PRIMARY KEY,\n  v vector(1536)\n);');
                    addLog('DIM', 'YugabyteDB pgvector supports up to 16,000 dimensions per vector.');
                }
            }
        ],
        guidedTour: [
            { target: '#rag-flow-container', title: 'High Dimensions', text: 'Production models operate in 1536+ dimensions. This heatmap visualizes feature intensities across a high-dimensional vector space.' }
        ]
    },
    {
        name: 'Vector Normalization',
        group: 'Fundamentals',
        icon: '⚖️',
        desc: 'Normalization scales a vector so its magnitude is exactly 1. This places all vectors on a "Unit Circle" (or hypersphere in higher dimensions).',
        sql: '-- Normalizing a vector to length 1 (Unit Circle/Hypersphere)\nSELECT l2_normalize(\'[3.0, 4.0]\'::vector);\n-- Result: [0.6, 0.8]\n\n-- Checking dimensions of a vector\nSELECT vector_dims(embedding) FROM items LIMIT 1;\n\n-- Inner Product of normalized vectors = Cosine Similarity\n-- This is computationally faster for similarity search\nSELECT name, \n       (l2_normalize(embedding) <#> \'[0.707, 0.707]\') * -1 AS similarity\nFROM items ORDER BY (l2_normalize(embedding) <#> \'[0.707, 0.707]\') LIMIT 5;',
        extraBtns: [
            { label: '➕ Scatter Points', cb: 'addScatterVectors', cls: 'btn-p' },
            { label: '⚡ Normalize All', cb: 'normalizeStep', cls: 'btn-g' }
        ],
        init: () => {
            vectors = [];
            window.addScatterVectors(true);
            window.showUnitCircle = true;
            queryVector = null;
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Normalization', text: 'Normalization scales vectors to a length of 1. Click "Normalize All" to see vectors project onto the Unit Circle boundary.', onStart: () => { window.addScatterVectors(true); } }
        ],
        steps: [
            {
                label: 'Inside vs Outside',
                desc: 'The dashed circle is the <b>unit circle</b> (|v| = 1.0). <span style="color:#60a5fa">Blue dots</span> are inside the unit circle (magnitude &lt; 1), <span class="c-red">red dots</span> are outside (magnitude &gt; 1). All have different lengths — making distance comparisons unstable.',
                action: () => {
                    window.addScatterVectors();
                    if (!$('mag-readout')) {
                        const el = document.createElement('div');
                        el.id = 'mag-readout';
                        el.style.cssText = 'font-family:var(--mono); font-size:13px; color:var(--txt2); padding:5px 10px; background:var(--s2); border:1px solid var(--border); border-radius:5px; margin-top:8px; display:inline-block;';
                        el.textContent = 'avg |v| = …';
                        const logArea = document.querySelector('.log-sec');
                        if (logArea) logArea.insertAdjacentElement('beforebegin', el);
                    }
                    addLog('NORM', 'Vectors scattered at random magnitudes. Blue = inside unit circle (mag < 1), Red = outside (mag > 1).');
                }
            },
            {
                label: 'Projection onto Unit Circle',
                desc: 'Normalization divides each vector by its own length, projecting it onto the unit hypersphere (magnitude exactly 1.0). Direction is preserved — only length changes.',
                action: () => { window.normalizeStep(); }
            },
            {
                label: 'Why It Matters',
                desc: 'Once all vectors have length 1, <b>Inner Product becomes identical to Cosine Similarity</b> — but requires fewer CPU operations. Normalize on write, index with <code>vector_ip_ops</code>, and search with <code>&lt;#&gt;</code> for maximum throughput.',
                action: () => {
                    window.setInteractiveSQL('-- Normalize at insert time\nINSERT INTO items (name, embedding)\nSELECT name, l2_normalize(raw_embedding) FROM source;\n\n-- After normalization: IP = Cosine, but faster\nSELECT l2_normalize(\'[3.0, 4.0]\'::vector) <#>\n       l2_normalize(\'[3.0, 4.0]\'::vector) * -1 AS ip_score,\n       \'[3.0, 4.0]\'::vector <=> \'[3.0, 4.0]\'::vector AS cosine_dist;\n-- ip_score = 1.0, cosine_dist = 0.0 — equivalent results');
                    addLog('NORM', 'After normalization: Inner Product ≡ Cosine. Use <#> with vector_ip_ops for the fastest production queries.');
                }
            }
        ]
    },
    {
        name: 'Distance Metrics',
        group: 'Similarity',
        icon: '🎯',
        desc: 'YugabyteDB supports three main distance metrics. Choosing the right one depends on your <b>embedding model</b> (OpenAI, BERT, etc.) and your performance requirements.',
        sql: '-- 1. L2 (Euclidean) Distance <->\n-- Best for: Absolute distance, spatial data, color matching.\nSELECT name, embedding <-> \'[0.12, 0.75]\' AS dist\nFROM items ORDER BY dist LIMIT 3;\n\n-- 2. Cosine Distance <=>\n-- Best for: NLP, text similarity where angle matters more than length.\nSELECT name, embedding <=> \'[0.12, 0.75]\' AS dist\nFROM items ORDER BY dist LIMIT 3;\n\n-- 3. Inner Product <#>\n-- Best for: Pre-normalized vectors, recommendation systems.\nSELECT name, (embedding <#> \'[0.12, 0.75]\') * -1 AS similarity\nFROM items ORDER BY embedding <#> \'[0.12, 0.75]\' LIMIT 3;',
        extraBtns: [
            { label: '➕ Add Random Item', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '🎯 Run KNN Search', cb: 'runVectorSearch', cls: 'btn-g' }
        ],
        init: () => {
            vectors = [
                { idx: 0, x: 0.6, y: 0.4, label: 'Standard Doc', color: '#3b82f6', cat: 'Docs' },
                { idx: 1, x: 0.8, y: 0.2, label: 'Similar Doc', color: '#3b82f6', cat: 'Docs' }
            ];
            queryVector = { x: 0.12, y: 0.75 };
            window.setDistMetric && window.setDistMetric('l2');
        },
        guidedTour: [
            { target: '#dist-lab-overlay', title: 'Distance Lab', text: 'This panel shows live calculations for L2, Cosine, and Inner Product as you move the query.', onStart: () => { window.showL2Example(); } },
            { target: '#vector-canvas', title: 'Querying', text: 'Click the canvas to move the query vector (Amber) and see how distances update.', onStart: () => { window.showCosineExample(); } }
        ],
        showMath: true,
        steps: [
            {
                label: 'L2 (Euclidean)',
                desc: 'Measures the "ordinary" straight-line distance between two points. Use this when the <b>magnitude</b> of your vectors is important (e.g., coordinates, physical measurements). <em>Watch the Vector Data View below — rows sort by L2 distance and the top-K are highlighted green.</em>',
                action: () => {
                    window.setDistMetric('l2');
                    window.showL2Example();
                    window.runVectorSearch();
                }
            },
            {
                label: 'Cosine Similarity',
                desc: 'Measures the <b>angle</b> between vectors. Ideal for text (RAG) because it doesn\'t care if one document is longer than another, only that they discuss the same topics. <em>Notice the table column switches to "Cos Dist" and the ranking order changes.</em>',
                action: () => {
                    window.setDistMetric('cosine');
                    window.showCosineExample();
                    window.runVectorSearch();
                }
            },
            {
                label: 'Inner Product',
                desc: 'Multiplies vectors. Higher positive = more similar. YugabyteDB uses the negative inner product (<#>) so that "most similar" equals "smallest distance". <em>The table now sorts by IP Score — observe how magnitude shifts the ranking compared to Cosine.</em>',
                action: () => {
                    window.setDistMetric('ip');
                    window.showIPExample();
                    window.runVectorSearch();
                }
            },
            {
                label: 'Rankings Flip',
                desc: 'The <b>same 5 vectors</b>, ranked under all three metrics simultaneously. Amber cells mark positions that change — demonstrating that metric choice can flip which document comes up first.',
                action: () => {
                    window.showRankingFlip();
                    addLog('KEY', 'Takeaway: metric choice is not cosmetic. It changes which results surface. Always match the metric to your embedding model\'s training objective.');
                }
            },
            {
                label: 'Quick Decision Guide',
                desc: '<b>Choosing the right metric:</b><br>• <b>L2 (<->)</b> — spatial data, coordinates, image pixels, or any workload where absolute magnitude matters.<br>• <b>Cosine (<=>)</b> — NLP, RAG, text similarity; ignore document length differences.<br>• <b>Inner Product (<#>)</b> — pre-normalized vectors (OpenAI, Cohere outputs); fastest math, identical ranking to Cosine when norms are 1.',
                action: () => {
                    window.setInteractiveSQL('-- Match index operator class to your metric\n\n-- Text / RAG workloads\nCREATE INDEX idx_docs_cosine ON docs\n  USING hnsw (embedding vector_cosine_ops);\n\n-- Pre-normalized embeddings (fastest)\nCREATE INDEX idx_items_ip ON items\n  USING hnsw (embedding vector_ip_ops);\n\n-- Spatial / coordinate data\nCREATE INDEX idx_loc_l2 ON locations\n  USING hnsw (embedding vector_l2_ops);');
                    addLog('METRICS', 'Rule of thumb: Cosine for text, IP for normalized vectors, L2 for spatial data.');
                }
            }
        ]
    },
    {
        name: 'L2 (Euclidean) Search',
        group: 'Similarity',
        icon: '📏',
        desc: 'Euclidean distance measures the physical gap between points. Beyond KNN, YugabyteDB supports range queries to find all vectors within a specific radius.',
        sql: '-- Find all vectors within a radius of 0.6\nSELECT name, embedding <-> \'[0.5, 0.5]\' AS dist\nFROM items \nWHERE embedding <-> \'[0.5, 0.5]\' < 0.6\nORDER BY dist;',
        extraBtns: [
            { label: '➕ Add Random Node', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '🎯 Run Range Search', cb: 'runRangeSearch', cls: 'btn-g' }
        ],
        init: () => {
            vectors = loadSemanticScenarioSet();
            queryVector = { x: 0.5, y: 0.5 };
            window.rangeSearchRadius = 0;
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Range Search', text: 'L2 distance measures physical proximity. The amber circle visualizes the search radius for range-based similarity queries.', onStart: () => { window.runRangeSearch(); } }
        ],
        steps: [
            {
                label: 'Spatial Distance',
                desc: 'L2 measures the straight-line "ruler" distance between two points. Unlike Cosine, it is sensitive to <b>both direction and magnitude</b> — a larger vector is genuinely farther away.',
                action: () => {
                    render();
                    window.setInteractiveSQL('-- L2: physical gap between vectors\nSELECT name,\n  embedding <-> \'[0.5, 0.5]\' AS distance\nFROM items\nORDER BY distance\nLIMIT 5;');
                    addLog('L2', 'Euclidean distance: the literal ruler gap between two points in vector space.');
                }
            },
            {
                label: 'KNN Search',
                desc: 'K-Nearest Neighbors returns a <b>fixed count</b> K of the closest vectors, regardless of how far away they are. Useful when you always want exactly K results.',
                action: () => {
                    window.runVectorSearch();
                    window.setInteractiveSQL('-- KNN: fixed count, variable distance\nSELECT name,\n  embedding <-> \'[0.5, 0.5]\' AS dist\nFROM items\nORDER BY embedding <-> \'[0.5, 0.5]\'\nLIMIT 5;');
                    addLog('L2 KNN', 'Top 5 nearest neighbors returned. Distance varies — the 5th result may be far away.');
                }
            },
            {
                label: 'Range Search',
                desc: 'A range query returns <b>all vectors within radius R</b> — unlike KNN which always returns exactly K results. Try different radii below: small R may return <b>0 results</b>, large R may return <b>all vectors</b>. This illustrates the precision–recall tradeoff.',
                action: () => {
                    const container = $('extra-btns');
                    if (container && !$('radius-btns')) {
                        const wrap = document.createElement('div');
                        wrap.id = 'radius-btns';
                        wrap.style.cssText = 'display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;';
                        [0.3, 0.5, 0.6, 0.8, 1.0].forEach(r => {
                            const btn = document.createElement('button');
                            btn.className = 'btn btn-p';
                            btn.textContent = `R = ${r}`;
                            btn.onclick = () => window.runRangeSearch(r);
                            wrap.appendChild(btn);
                        });
                        container.appendChild(wrap);
                    }
                    window.runRangeSearch(0.6);
                }
            }
        ]
    },
    {
        name: 'Cosine Similarity Search',
        group: 'Similarity',
        icon: '📐',
        desc: 'Cosine distance focuses on the orientation (angle) of vectors. It is the gold standard for RAG and text-based semantic search.',
        sql: '-- Standard Cosine Similarity Query\nSELECT name, embedding <=> \'[0.8, 0.3]\' AS dist\nFROM documents \nORDER BY dist LIMIT 5;',
        extraBtns: [
            { label: '➕ Add Random Node', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '📐 Show Angular Gap', cb: 'showAngularGap', cls: 'btn-g' }
        ],
        init: () => {
            vectors = loadSemanticScenarioSet();
            queryVector = { x: 0.8, y: 0.3 };
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Cosine Search', text: 'Observe how Cosine similarity ignores length and focuses on the orientation. Similar items share the same angular direction from the origin.', onStart: () => { window.showAngularGap(); } }
        ],
        steps: [
            {
                label: 'Angular Proximity',
                desc: 'Cosine distance measures the <b>angle</b> between two vectors, not the gap between their tips. Vectors pointing in the same direction have distance 0 regardless of how long they are.',
                action: () => { window.showAngularGap(); }
            },
            {
                label: 'Scale Invariance',
                desc: 'Cosine distance measures <b>angle only — magnitude is irrelevant</b>. Below, the original doc vector and a version scaled to <b>1/10th</b> its length have <b>cosine distance = 0.000</b>. They point in the exact same direction, so they are semantically identical to this metric. This is why embedding models normalize their outputs before storage.',
                action: () => {
                    const ref = vectors[0];
                    const scale = 0.1;
                    const tiny = { x: ref.x * scale, y: ref.y * scale, label: '1/10 Scale', color: '#f59e0b', cat: ref.cat };
                    vectors.push(tiny);
                    render();
                    const cd = (1 - cosSim(ref, tiny)).toFixed(4);
                    addLog('COSINE', `Original: [${ref.x.toFixed(2)}, ${ref.y.toFixed(2)}]  Magnitude: ${mag(ref).toFixed(3)}`);
                    addLog('COSINE', `1/10 Scale: [${tiny.x.toFixed(3)}, ${tiny.y.toFixed(3)}]  Magnitude: ${mag(tiny).toFixed(3)}`);
                    addLog('COSINE', `Cosine distance between them: <b class="c-green">${cd}</b> — perfectly identical direction`);
                    addLog('KEY', 'This is why text embedding models (OpenAI, Cohere, etc.) L2-normalize outputs before returning them — cosine distance then equals inner product, which is faster to compute.');
                }
            },
            {
                label: 'The <=> Operator',
                desc: 'The <b>&lt;=&gt;</b> operator returns cosine <em>distance</em> (0 = identical direction, 2 = opposite). Subtract from 1 to convert to cosine <em>similarity</em> for display.',
                action: () => {
                    window.runVectorSearch();
                    window.setInteractiveSQL("-- Cosine distance → similarity\nSELECT name,\n  embedding <=> '[0.8, 0.3]' AS cosine_dist,\n  1 - (embedding <=> '[0.8, 0.3]') AS cosine_sim\nFROM documents\nORDER BY embedding <=> '[0.8, 0.3]' LIMIT 5;");
                    addLog('COSINE', 'ORDER BY uses <=> (distance) to hit the HNSW index. SELECT converts to similarity (1 - dist) for display.');
                }
            }
        ]
    },
    {
        name: 'Inner Product Search',
        group: 'Similarity',
        icon: '✖️',
        desc: 'Inner Product measures how much one vector "aligns" with another. When vectors are pre-normalized, it provides the fastest possible similarity scoring.',
        sql: '-- Inner Product search (Negative Dot Product)\nSELECT name, (embedding <#> \'[0.6, 0.8]\') * -1 AS score\nFROM items \nORDER BY embedding <#> \'[0.6, 0.8]\' LIMIT 5;',
        extraBtns: [
            { label: '➕ Add Random Node', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '⚖️ Show Projection', cb: 'showProjection', cls: 'btn-g' },
            { label: 'Normalize All → IP = Cosine', action: () => window.normalizeStep() }
        ],
        init: () => {
            vectors = loadSemanticScenarioSet('magnitude');
            queryVector = { x: 0.6, y: 0.8 };
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Inner Product', text: 'Inner product measures vector projection. Notice how it captures both orientation and magnitude in a single, fast operation.', onStart: () => { window.showProjection(); } }
        ],
        steps: [
            {
                label: 'Vector Projection',
                desc: '<span class="c-red"><b>IP can be negative</b></span> — unlike L2 or Cosine (always ≥ 0). Vectors pointing in opposite directions produce a negative dot product; pgvector uses <code>&lt;#&gt;</code> (negated IP) to turn it into a minimization problem. IP measures both <b>alignment</b> (angle) and <b>intensity</b> (magnitude) — unlike Cosine which ignores magnitude.',
                action: () => { window.showProjection(); }
            },
            {
                label: 'Normalization Unlock',
                desc: 'When all vectors are on the unit circle (|v|=1), <b>Inner Product and Cosine Similarity become identical</b>. Click <em>Normalize All → IP = Cosine</em> above to project all vectors onto the unit circle, then observe that the IP ranking now exactly matches the Cosine ranking. This equivalence is why normalized embeddings always use <code>vector_ip_ops</code> — it\'s the same accuracy as Cosine but faster.',
                action: () => {
                    window.setInteractiveSQL("-- Normalize at insert time so IP == Cosine at query time\nINSERT INTO items (name, embedding)\nSELECT name, l2_normalize(raw_embedding) FROM source;\n\n-- IP on normalized vectors: identical ranking to cosine\nSELECT name,\n  (embedding <#> '[0.6, 0.8]') * -1 AS ip_score\nFROM items\nORDER BY embedding <#> '[0.6, 0.8]' LIMIT 5;");
                    addLog('IP', 'Normalized vectors: (A · B) = cos(θ). Inner Product returns the same ranking as Cosine — but faster.');
                }
            },
            {
                label: 'Build the Right Index',
                desc: 'Create the HNSW index with <b>vector_ip_ops</b> to enable the <code>&lt;#&gt;</code> operator to use the index. Using <code>&lt;#&gt;</code> against a cosine index silently falls back to a seq scan.',
                action: () => {
                    window.runVectorSearch();
                    window.setInteractiveSQL("-- Index must match the operator class\nCREATE INDEX idx_items_ip\nON items USING hnsw (embedding vector_ip_ops);\n\n-- Now <#> is index-backed — maximum throughput\nSET hnsw.ef_search = 100;\nSELECT name FROM items\nORDER BY embedding <#> '[0.6, 0.8]' LIMIT 5;");
                    addLog('IP', 'vector_ip_ops index wired. <#> now hits HNSW — highest-throughput path for normalized embeddings.');
                }
            }
        ]
    },
    {
        name: 'HNSW Construction',
        group: 'HNSW Indexing',
        icon: '🏗️',
        desc: 'HNSW (Hierarchical Navigable Small World) is the gold standard for vector indexing. It builds a multi-layered graph for logarithmic search performance.',
        sql: '-- Create an HNSW Index optimized for Cosine Distance\nCREATE INDEX idx_products_v ON products \nUSING hnsw (embedding vector_cosine_ops) \nWITH (m = 16, ef_construction = 128);\n\n-- Higher M = Better recall, more memory used.\n-- Higher ef_construction = Better index quality, slower build.',
        extraBtns: [
            { label: '➕ Insert & Index Node', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '🏗️ Trace HNSW Path', cb: 'traceHNSWPath', cls: 'btn-g' }
        ],
        showHNSW: true,
        init: () => {
            vectors = [];
            queryVector = { x: 0.85, y: 0.22 };
            hnswNodes = [];
            window._hnswBuildStep = 0;
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Layered Graph', text: 'HNSW builds hierarchical lanes. Top layers are sparse highways, bottom layers are dense local streets.', onStart: () => { window.jumpToStep(3); } }
        ],
        steps: [
            {
                label: 'The Concept',
                desc: 'HNSW builds a <b>multi-layered graph</b>. Think of it as a highway system: Layer 2 has express lanes (few nodes), Layer 0 has local roads (all nodes).',
                action: () => {
                    hnswNodes = [];
                    window._hnswBuildStep = 0;
                    render();
                }
            },
            {
                label: 'Build Layer 0',
                desc: 'All vectors live in Layer 0 (the base layer). Each node connects to up to <b>M</b> nearest neighbors. More nodes = denser graph.',
                action: async () => {
                    hnswNodes = [];
                    window.srand(0x1a7e0); // reproducible layout — re-clicking rebuilds the same graph
                    const baseNodes = [];
                    for (let i = 0; i < 20; i++) {
                        baseNodes.push({
                            x: (window.srandom() - 0.5) * 2.4,
                            y: (window.srandom() - 0.5) * 2.4,
                            layer: 0
                        });
                    }
                    for (const n of baseNodes) {
                        hnswNodes.push(n);
                        render();
                        await new Promise(r => setTimeout(r, 120 / speedVal));
                    }
                    window.setInteractiveSQL(`-- Building Layer 0: ${baseNodes.length} nodes inserted\n-- Each connected to M=${paramM} nearest neighbors`);
                }
            },
            {
                label: 'Promote to Layer 1',
                desc: 'A random subset (~30%) of Layer 0 nodes are <b>promoted</b> to Layer 1 with long-range "skip" connections — like highway on-ramps.',
                action: async () => {
                    window.srand(0x2b1c0);
                    const l0 = hnswNodes.filter(n => n.layer === 0);
                    const promoted = l0.filter(() => window.srandom() < 0.3);
                    for (const n of promoted) {
                        hnswNodes.push({ x: n.x, y: n.y, layer: 1 });
                        render();
                        await new Promise(r => setTimeout(r, 150 / speedVal));
                    }
                    window.setInteractiveSQL(`-- Layer 1: ${promoted.length} nodes promoted\n-- These act as express "skip" connections`);
                    addLog('HNSW', `Promoted ${promoted.length} nodes to Layer 1`);
                }
            },
            {
                label: 'Promote to Layer 2',
                desc: 'An even smaller subset reaches Layer 2 — the topmost express lane. Search always starts here for maximum efficiency.',
                action: async () => {
                    window.srand(0x3c2d0);
                    const l1 = hnswNodes.filter(n => n.layer === 1);
                    const promoted = l1.filter(() => window.srandom() < 0.35);
                    for (const n of promoted) {
                        hnswNodes.push({ x: n.x, y: n.y, layer: 2 });
                        render();
                        await new Promise(r => setTimeout(r, 200 / speedVal));
                    }
                    window.setInteractiveSQL(`-- Layer 2: ${promoted.length} nodes (entry points)\n-- Search starts at this top layer`);
                    addLog('HNSW', `Promoted ${promoted.length} nodes to Layer 2 (entry points)`);
                }
            },
            {
                label: 'Link Density (M)',
                desc: 'The <b>M</b> parameter (default 16) controls how many neighbors each node connects to. Higher M = denser graph = better recall, but <b>more memory and slower inserts</b>. Click a preset below to see the graph density change live.',
                action: () => {
                    window.setInteractiveSQL(`-- M controls neighbor count per node\nCREATE INDEX ON items\nUSING hnsw (embedding vector_cosine_ops)\nWITH (m = ${paramM}, ef_construction = ${paramEFC});`);
                    const container = $('extra-btns');
                    if (container && !$('m-preset-btns')) {
                        const wrap = document.createElement('div');
                        wrap.id = 'm-preset-btns';
                        wrap.style.cssText = 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;';
                        [[2,'sparse'],[8,'light'],[16,'default'],[32,'dense']].forEach(([m, lbl]) => {
                            const btn = document.createElement('button');
                            btn.className = 'btn btn-p';
                            btn.textContent = `M=${m} (${lbl})`;
                            btn.onclick = () => {
                                paramM = m;
                                const sl = $('param-m');
                                if (sl) { sl.value = m; $('val-m').textContent = m; }
                                window.rebuildHNSW();
                                const nodeCount = Math.max(hnswNodes.length, 10);
                                const memMB = (nodeCount * m * 2 * 8 / 1024 / 1024 * 1_000_000).toFixed(0);
                                addLog('M', `M=${m}: each node → up to ${m} links × 2 layers. At 1M vectors: ~${memMB} MB graph memory.`);
                            };
                            wrap.appendChild(btn);
                        });
                        container.appendChild(wrap);
                    }
                }
            },
            {
                label: 'ef_construction',
                desc: 'This parameter (default 64) controls how hard the builder searches for the best neighbors during index build. Set to <b>≥ 2× M</b>. <span class="c-amber"><b>⚠ Insert cost:</b></span> ef_construction=256 can make bulk inserts 3–5× slower than ef_construction=64. Choose based on your ingest SLA — use lower values during bulk load, then reindex offline with higher quality settings.',
                action: () => {
                    window.setInteractiveSQL(`-- ef_construction: builder effort\n-- Rule of thumb: ef_construction >= 2 * M\nCREATE INDEX ON items\nUSING hnsw (embedding vector_cosine_ops)\nWITH (m = ${paramM}, ef_construction = ${paramEFC});`);
                }
            }
        ]
    },
    {
        name: 'HNSW Search',
        group: 'HNSW Indexing',
        icon: '🔍',
        desc: 'At search time, YugabyteDB navigates the HNSW graph from the "entry point" to the nearest neighbors of your query.',
        sql: '-- Tune recall vs. latency per session\nSET hnsw.ef_search = 100;\n\n-- The index pushes down the KNN search to the storage layer\nSELECT name FROM items \nORDER BY embedding <=> \'[0.85, 0.22]\' \nLIMIT 5;',
        extraBtns: [
            { label: '➕ Add Random Item', cb: 'addRandomVector', cls: 'btn-p' },
            { label: '🔍 Run Greedy Search', cb: 'traceHNSWPath', cls: 'btn-g' }
        ],
        showHNSW: true,
        init: () => {
            queryVector = { x: 0.5, y: 0.5 };
            hnswNodes = [];
            window.srand(0x5ea2c); // reproducible layered graph
            // Pre-build a proper layered graph
            for (let i = 0; i < 25; i++) {
                hnswNodes.push({ x: (window.srandom() - 0.5) * 2.4, y: (window.srandom() - 0.5) * 2.4, layer: 0 });
            }
            const l0 = [...hnswNodes];
            l0.filter(() => window.srandom() < 0.3).forEach(n => hnswNodes.push({ x: n.x, y: n.y, layer: 1 }));
            hnswNodes.filter(n => n.layer === 1).filter(() => window.srandom() < 0.4).forEach(n => hnswNodes.push({ x: n.x, y: n.y, layer: 2 }));
        },
        guidedTour: [
            { target: '#vector-canvas', title: 'Greedy Search', text: 'Follow the HNSW traversal as it jumps between graph layers to find the nearest neighbor with logarithmic efficiency.', onStart: () => { window.traceHNSWPath(); } }
        ],
        steps: [
            {
                label: 'Query Arrives',
                desc: 'A query vector <span class="c-amber">[0.85, 0.22]</span> arrives. The search begins at the topmost layer (Layer 2) — the express highway.',
                action: () => {
                    activePath = [];
                    render();
                    addLog('SEARCH', 'Query vector placed. Starting greedy search from Layer 2...');
                }
            },
            {
                label: 'Layer 2: Entry Point',
                desc: 'Search begins at the topmost express layer. With only a handful of nodes we quickly find the closest global landmark — a coarse starting position for the descent.',
                action: async () => {
                    activePath = [queryVector];
                    probingNode = null;
                    const l2 = hnswNodes.filter(n => n.layer === 2);
                    if (l2.length > 0) {
                        activePath.push(l2[0]);
                        let best = l2[0];
                        for (const n of l2) {
                            probingNode = n; render();
                            await new Promise(r => setTimeout(r, 100 / speedVal));
                            if (distL2(queryVector, n) < distL2(queryVector, best)) best = n;
                        }
                        probingNode = null;
                        activePath[1] = best; render();
                        addLog('L2 HOP', `Found closest L2 node at [${best.x.toFixed(2)}, ${best.y.toFixed(2)}] (dist: ${distL2(queryVector, best).toFixed(3)})`);
                    }
                    window.setInteractiveSQL('-- Layer 2: Coarse scan (express highway)\n-- Found approximate starting region');
                }
            },
            {
                label: 'Layer 1: Refinement',
                desc: 'Drop to Layer 1 and use its denser connections to refine our position, homing in on the neighborhood that contains the query.',
                action: async () => {
                    const l1 = hnswNodes.filter(n => n.layer === 1);
                    if (l1.length > 0 && activePath.length > 1) {
                        const startNode = activePath[1];
                        // Find entry in L1
                        const entry = l1.find(n => n.x === startNode.x && n.y === startNode.y) || l1[0];
                        activePath.push(entry);
                        let best = entry;
                        for (const n of l1) {
                            if (distL2(entry, n) > 1.2) continue; 
                            probingNode = n; render();
                            await new Promise(r => setTimeout(r, 80 / speedVal));
                            if (distL2(queryVector, n) < distL2(queryVector, best)) best = n;
                        }
                        probingNode = null;
                        activePath[activePath.length - 1] = best; render();
                        addLog('L1 HOP', `Refined to L1 node at [${best.x.toFixed(2)}, ${best.y.toFixed(2)}] (dist: ${distL2(queryVector, best).toFixed(3)})`);
                    }
                    window.setInteractiveSQL('-- Layer 1: Refine position\n-- More nodes = finer granularity');
                }
            },
            {
                label: 'Layer 0: Base Search',
                desc: 'The base layer holds every node. The algorithm evaluates up to <b>ef_search</b> local candidates and returns the exact nearest neighbors from the densest part of the graph.',
                action: async () => {
                    const l0 = hnswNodes.filter(n => n.layer === 0);
                    if (l0.length > 0 && activePath.length > 1) {
                        const startNode = activePath[activePath.length - 1];
                        // Find entry in L0
                        const entry = l0.find(n => n.x === startNode.x && n.y === startNode.y) || l0[0];
                        activePath.push(entry);
                        let best = entry;
                        for (const n of l0) {
                            if (distL2(entry, n) > 0.6) continue;
                            probingNode = n; render();
                            await new Promise(r => setTimeout(r, 50 / speedVal));
                            if (distL2(queryVector, n) < distL2(queryVector, best)) best = n;
                        }
                        probingNode = null;
                        activePath[activePath.length - 1] = best; render();
                        addLog('L0 FINAL', `Nearest neighbor at [${best.x.toFixed(2)}, ${best.y.toFixed(2)}] (dist: ${distL2(queryVector, best).toFixed(3)})`);
                    }
                    window.setInteractiveSQL(`-- Layer 0: Precision scan\n-- ef_search = ${paramEFS} candidates evaluated\nSET hnsw.ef_search = ${paramEFS};`);
                }
            },
            {
                label: 'ef_search Tuning',
                desc: '<b>ef_search</b> controls how many candidates the greedy search tracks at Layer 0. Higher = better recall, slower query. <span class="c-red"><b>⚠ Silent failure:</b></span> if ef_search &lt; LIMIT K, pgvector silently returns fewer results than requested — no error, no warning, just degraded recall. Always set <code>ef_search ≥ LIMIT</code>.',
                action: () => {
                    const container = $('extra-btns');
                    if (container && !$('efs-preset-btns')) {
                        const wrap = document.createElement('div');
                        wrap.id = 'efs-preset-btns';
                        wrap.style.cssText = 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;';
                        [[5,'⚠ risky'],[20,'low'],[40,'default'],[100,'safe'],[200,'thorough']].forEach(([efs, lbl]) => {
                            const btn = document.createElement('button');
                            btn.className = 'btn btn-p';
                            btn.textContent = `ef=${efs} (${lbl})`;
                            if (efs < paramK) btn.style.color = '#ef4444';
                            btn.onclick = () => {
                                paramEFS = efs;
                                const sl = $('param-efs');
                                if (sl) { sl.value = efs; $('val-efs').textContent = efs; }
                                window.setInteractiveSQL(`SET hnsw.ef_search = ${efs};\n\nSELECT name FROM items\nORDER BY embedding <=> '[0.85, 0.22]'\nLIMIT ${paramK};`);
                                const warn = efs < paramK
                                    ? `⚠ ef_search(${efs}) < LIMIT(${paramK}) → silent recall degradation!`
                                    : `ef_search(${efs}) ≥ LIMIT(${paramK}) ✓ recall is safe`;
                                addLog('EFS', warn);
                                window.traceHNSWPath && window.traceHNSWPath();
                            };
                            wrap.appendChild(btn);
                        });
                        container.appendChild(wrap);
                    }
                    window.setInteractiveSQL(`-- Tune per-session for your recall/latency SLA\nSET hnsw.ef_search = ${paramEFS};\n\nSELECT name FROM items\nORDER BY embedding <=> '[0.85, 0.22]'\nLIMIT 5;`);
                    addLog('TUNING', `Current ef_search = ${paramEFS}. Higher values improve recall but increase query latency.`);
                }
            }
        ]
    },
    {
        name: 'Model Context Protocol (MCP)',
        group: 'MCP Integration',
        icon: '🔌',
        desc: '<b>MCP</b> allows AI assistants (like Claude) to connect directly to YugabyteDB to query data, schema, and execute tools securely without custom API integrations.',
        sql: '-- Example Queries to test MCP integration\n\n-- 1. Check database version\nSELECT version();\n\n-- 2. List all tables in the current schema\nSELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = \'public\';\n\n-- 3. Perform a similarity search via MCP tool\nSELECT name FROM products ORDER BY embedding <=> \'[0.1, 0.2, 0.3]\' LIMIT 3;',
        showMCP: true,
        init: () => {
            const container = $('rag-flow-container');
            container.innerHTML = `
                <div class="rag-flow-main" style="display:flex; flex-direction:column; gap:20px; width:100%; padding:30px; box-sizing:border-box;">
                    <!-- MCP Flow -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <div class="rag-box" id="mcp-client" style="flex:1">
                            <div class="rag-box-title">🤖 AI Assistant</div>
                            <div class="rag-box-content" id="mcp-client-msg" style="font-style:italic">Waiting for user input...</div>
                        </div>
                        <div class="rag-arrow-h" id="mcp-a1" style="opacity:0.2; margin: 0 15px; position:relative;">
                            ↔
                            <div id="mcp-pkt-1" style="position:absolute; width:10px; height:10px; background:var(--leader); border-radius:50%; top:50%; transform:translateY(-50%); left:0; opacity:0; transition:all 0.5s; box-shadow: 0 0 8px var(--leader);"></div>
                        </div>
                        <div class="rag-box" id="mcp-server" style="flex:1; border-style:dashed; border-color:#a855f7">
                            <div class="rag-box-title c-purple">🔌 YugabyteDB MCP Server</div>
                            <div class="rag-box-content" style="font-size:10px" id="mcp-server-msg">Exposes DB as Tools & Resources</div>
                        </div>
                        <div class="rag-arrow-h" id="mcp-a2" style="opacity:0.2; margin: 0 15px; position:relative;">
                            ↔
                            <div id="mcp-pkt-2" style="position:absolute; width:10px; height:10px; background:var(--ok); border-radius:50%; top:50%; transform:translateY(-50%); left:0; opacity:0; transition:all 0.5s; box-shadow: 0 0 8px var(--ok);"></div>
                        </div>
                        <div class="rag-box" id="mcp-db" style="flex:1; border-color:#10b981">
                            <div class="rag-box-title c-green">🐘 YugabyteDB</div>
                            <div class="rag-box-content" id="mcp-db-msg">Storage & Vector Engine</div>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:20px;">
                        <div class="rag-box" id="mcp-rpc-call" style="flex:1; opacity:0; transition: opacity 0.3s;">
                            <div class="rag-box-title c-amber">JSON-RPC Protocol</div>
                            <div class="rag-code" id="mcp-rpc-code" style="font-size:10px; color:#e9d5ff; white-space:pre-wrap; font-family:var(--mono)"></div>
                        </div>
                        <div class="rag-box" id="mcp-embed-panel" style="flex:1; opacity:0; transition: opacity 0.3s; border-color:#3b82f6;">
                            <div class="rag-box-title c-blue">🔢 Embedding Model</div>
                            <div class="rag-code" id="mcp-embed-input" style="font-size:10px; color:rgba(255,255,255,0.55); font-family:var(--mono); margin-bottom:4px;"></div>
                            <div style="font-size:10px; color:#555; text-align:center; margin:4px 0; font-style:italic;">↓ text-embedding-3-small</div>
                            <div class="rag-code" id="mcp-embed-output" style="font-size:10px; white-space:pre-wrap; font-family:var(--mono);"></div>
                        </div>
                        <div class="rag-box" id="mcp-tool-call" style="flex:1; opacity:0; transition: opacity 0.3s;">
                            <div class="rag-box-title c-green">Database Execution</div>
                            <div class="rag-code" id="mcp-db-code" style="font-size:10px; color:#e9d5ff; white-space:pre-wrap; font-family:var(--mono)"></div>
                        </div>
                    </div>
                    <div class="rag-box" id="mcp-context-panel" style="width:100%; opacity:0; transition: opacity 0.4s; box-sizing:border-box;">
                        <div class="rag-box-title c-purple">📋 Augmented Context Window (sent to LLM)</div>
                        <div class="rag-code" id="mcp-context-code" style="font-size:10px; color:#e9d5ff; white-space:pre-wrap; font-family:var(--mono); line-height:1.6;"></div>
                    </div>
                </div>
            `;
            window.animatePacket = (id, direction) => {
                const pkt = $(id);
                if (!pkt) return;
                pkt.style.opacity = '1';
                pkt.style.transition = 'none';
                pkt.style.left = direction === 'forward' ? '0%' : '100%';
                setTimeout(() => {
                    pkt.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                    pkt.style.left = direction === 'forward' ? '100%' : '0%';
                    setTimeout(() => { pkt.style.opacity = '0'; }, 600);
                }, 20);
            };
        },
        guidedTour: [
            { target: '#rag-flow-container', title: 'MCP Protocol', text: 'Follow the JSON-RPC packet flow between Claude (AI), the MCP server, and YugabyteDB. MCP turns your database into a set of interactive AI tools.', onStart: () => { window.jumpToStep(0); } }
        ],
        steps: [
            {
                label: '1. Discovery Phase',
                desc: 'The AI Assistant (Claude) connects to the MCP server and requests a list of available tools.',
                action: () => {
                    $('mcp-client').classList.add('active');
                    $('mcp-a1').style.opacity = '1';
                    window.animatePacket('mcp-pkt-1', 'forward');
                    $('mcp-client-msg').textContent = 'Listing available tools...';
                    $('mcp-rpc-call').style.opacity = '1';
                    $('mcp-rpc-code').textContent = '{\n  "jsonrpc": "2.0",\n  "method": "tools/list",\n  "id": 1\n}';
                }
            },
            {
                label: '2. Tool Capabilities',
                desc: 'The server returns tool definitions including input schemas. Claude now knows it can search vectors or query schemas.',
                action: () => {
                    $('mcp-server').classList.add('active');
                    window.animatePacket('mcp-pkt-1', 'backward');
                    $('mcp-server-msg').innerHTML = '<span class="c-ok">Exposing: [vector_search, list_tables]</span>';
                }
            },
            {
                label: '3. Schema Introspection',
                desc: 'Before calling any tool Claude reads the table schema to understand column names and types. This prevents hallucinated column names in generated SQL.',
                action: () => {
                    $('mcp-server').classList.add('active');
                    window.animatePacket('mcp-pkt-1', 'forward');
                    $('mcp-rpc-code').textContent = '{\n  "jsonrpc": "2.0",\n  "method": "resources/read",\n  "params": {\n    "uri": "db://public/products/schema"\n  },\n  "id": 2\n}';
                    setTimeout(() => {
                        window.animatePacket('mcp-pkt-1', 'backward');
                        $('mcp-db-code') && ($('mcp-tool-call').style.opacity = '1');
                        if ($('mcp-db-code')) {
                            $('mcp-db-code').textContent = 'products(\n  id       SERIAL PK,\n  name     TEXT,\n  category TEXT,\n  price    NUMERIC,\n  embedding vector(1536)\n)';
                        }
                        addLog('MCP', 'Schema returned: products has embedding vector(1536). Claude now knows which operator to use.');
                    }, 700);
                }
            },
            {
                label: '4. Natural Language Query',
                desc: 'User asks: <i>"Find me electronics under $500"</i>. Armed with the schema, Claude identifies that <b>vector_search</b> is the right tool and dispatches a tool call — but first the query text must become a vector.',
                action: () => {
                    $('mcp-client-msg').innerHTML = 'User: "Find electronics &lt; $500"';
                    window.animatePacket('mcp-pkt-1', 'forward');
                    $('mcp-rpc-code').textContent = '{\n  "method": "tools/call",\n  "params": {\n    "name": "vector_search",\n    "arguments": {\n      "query": "Find electronics under $500",\n      "price_limit": 500\n    }\n  }\n}';
                }
            },
            {
                label: '4b. Embed the Query',
                desc: 'Before the search can run, the query text is passed to an <b>embedding model</b> (e.g. <code>text-embedding-3-small</code>). This converts natural language into a 1536-dimensional vector. <b>This is the bridge from language to geometry</b> — without this step there is nothing to compare against the stored embeddings.',
                action: () => {
                    const embedPanel = $('mcp-embed-panel');
                    if (embedPanel) {
                        embedPanel.style.opacity = '1';
                        $('mcp-embed-input').textContent = '"Find electronics under $500"';
                        setTimeout(() => {
                            $('mcp-embed-output').textContent = '[0.127, 0.843, -0.231,\n 0.592, 0.018, -0.774,\n 0.445, 0.309,  ...\n <1536 total dimensions>]';
                            $('mcp-embed-output').style.color = '#10b981';
                            addLog('EMBED', 'Text → 1536-dim vector in ~20ms. This vector ($1) is passed to the <=> operator in the SQL query.');
                            window.setInteractiveSQL("-- MCP embeds the user query before the search\nSELECT ai.openai_embed(\n  'text-embedding-3-small',\n  'Find electronics under $500'\n) AS query_vector;\n-- Returns: [0.127, 0.843, -0.231, ...]");
                        }, 700);
                    }
                }
            },
            {
                label: '5. Database Execution',
                desc: 'The MCP server passes the embedded vector as <code>$1</code> to a pgvector query and runs it against YugabyteDB. The <code>&lt;=&gt;</code> operator does cosine distance in the storage layer — no data leaves the DB.',
                action: () => {
                    const results = computeHybridResults(3);
                    $('mcp-a2').style.opacity = '1';
                    window.animatePacket('mcp-pkt-2', 'forward');
                    $('mcp-db').classList.add('active');
                    $('mcp-tool-call').style.opacity = '1';
                    $('mcp-db-code').textContent = `-- $1 = the 1536-dim query vector\nSELECT name, price,\n  embedding <=> $1 AS dist\nFROM products\nWHERE category = 'Electronics'\n  AND price < 500\nORDER BY dist\nLIMIT 3;\n-- ${results.length} rows returned`;
                    addLog('SQL', `YugabyteDB executed pgvector cosine search. ${results.length} results ranked by semantic similarity.`);
                }
            },
            {
                label: '6. Context Injection',
                desc: 'Results flow back through MCP and are <b>injected into the LLM context window</b> alongside the original user question. The LLM generates a grounded response from retrieved facts — not from training data. <b>The LLM never wrote SQL.</b> It described intent, MCP translated to vectors, YugabyteDB executed the search.',
                action: () => {
                    const results = computeHybridResults(3);
                    const best = results[0];
                    window.animatePacket('mcp-pkt-2', 'backward');
                    setTimeout(() => {
                        window.animatePacket('mcp-pkt-1', 'backward');
                        const ctxPanel = $('mcp-context-panel');
                        if (ctxPanel) {
                            ctxPanel.style.opacity = '1';
                            const rows = results.slice(0, 3).map((r, i) => `  ${i+1}. ${r.name} — $${r.price} (similarity: ${(1 - (i * 0.04 + 0.05)).toFixed(2)})`).join('\n');
                            $('mcp-context-code').innerHTML =
                                `<span style="color:#64748b">[system]</span> You are a helpful shopping assistant. Answer only from the provided context.\n\n` +
                                `<span class="c-blue">[retrieved context — via MCP + pgvector]</span>\n${rows}\n\n` +
                                `<span class="c-amber">[user]</span> Find me electronics under $500\n\n` +
                                `<span class="c-green">[assistant]</span> Based on the search results, I recommend <b>${best.name}</b>` +
                                ` at $${best.price} — it's the closest semantic match to your query. ` +
                                `(${results.length} options retrieved from YugabyteDB via pgvector <=> cosine search.)`;
                        }
                        $('mcp-client-msg').innerHTML = `<span class="c-ok">Claude: "${best.name} at $${best.price} — closest match." ✓ Grounded</span>`;
                    }, 600);
                    addLog('MCP', 'Full cycle complete: natural language → embed → vector search → context injection → grounded reply. The LLM never touched SQL.');
                }
            }
        ]
    },
    {
        name: 'RAG Pipeline',
        group: 'Architecture',
        icon: '🔄',
        desc: 'Retrieval Augmented Generation (RAG) grounds LLMs with your private data. This demo shows <b>Ingestion</b> (Phase 1) and <b>Live Inference</b> (Phase 2).',
        sql: '-- PHASE 1: INGESTION\nCREATE TABLE knowledge_base (content TEXT, embedding vector(1536));\n\n-- Bulk populate using generate_series and synthetic vectors\nINSERT INTO knowledge_base (content, embedding)\nSELECT \'Distributed SQL Chunk #\' || i, random_vector(1536)\nFROM generate_series(1, 1000) AS i;\n\n-- PHASE 2: INFERENCE\nSELECT content FROM knowledge_base \nORDER BY embedding <=> \'[-0.012, 0.551, 0.892]\' LIMIT 2;',
        showRAG: true,
        init: () => {
            const container = $('rag-flow-container');
            container.innerHTML = `
                <div class="rag-flow-main" style="display:flex; flex-direction:column; gap:30px; width:100%; padding:30px; box-sizing:border-box;">
                    
                    <!-- PHASE 1: INGESTION -->
                    <div class="rag-section" id="rag-sec-1" style="border: 1px dashed rgba(255,255,255,0.15); padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.015);">
                        <div style="font-family:var(--head); font-size:13px; color:var(--leader); margin-bottom:15px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.7; font-weight:600">Phase 1: Knowledge Base Ingestion</div>
                        <div style="display:flex; gap:15px; align-items:center;">
                            <div class="rag-box" id="rag-ingest-src" style="flex:0.8">
                                <div class="rag-box-title">📄 Source</div>
                                <div class="rag-box-content" style="font-size:11px">PDFs, Wikis</div>
                            </div>
                            <div class="rag-arrow-h" id="ai1" style="opacity:0.2">→</div>
                            <div class="rag-box" id="rag-ingest-model" style="flex:1.2">
                                <div class="rag-box-title">🧠 Embedding Model</div>
                                <div class="rag-box-content" id="rag-model-desc">Splits text into chunks & creates vectors.</div>
                                <div class="chunk-container" id="chunk-anim"></div>
                            </div>
                            <div class="rag-arrow-h" id="ai-norm" style="opacity:0.2">→</div>
                            <div class="rag-box" id="rag-ingest-norm" style="flex:1">
                                <div class="rag-box-title">⚖️ Normalizer</div>
                                <div class="rag-box-content" id="rag-norm-desc">Scales vectors to length 1.</div>
                                <div class="opt-badge">Optional</div>
                                <div class="norm-badge" id="norm-badge-1">L2 Norm</div>
                            </div>
                            <div class="rag-arrow-h" id="ai2" style="opacity:0.2">→</div>
                            <div class="rag-box" id="rag-ingest-db" style="flex:1">
                                <div class="rag-box-title">🐘 YugabyteDB</div>
                                <div class="rag-box-content" style="font-size:11px">HNSW Storage</div>
                                <div class="rag-code" id="rag-ingest-sql" style="display:none; font-size:10px; margin-top:10px">INSERT INTO kb... SELECT... generate_series(1,1000)</div>
                            </div>
                        </div>
                    </div>

                    <!-- PHASE 2: INFERENCE -->
                    <div class="rag-section" id="rag-sec-2" style="border: 1px solid rgba(59, 130, 246, 0.25); padding: 25px; border-radius: 16px; background: rgba(59, 130, 246, 0.04);">
                        <div style="font-family:var(--head); font-size:13px; color:var(--leader); margin-bottom:20px; text-transform:uppercase; letter-spacing:1.5px; font-weight:600">Phase 2: Live RAG Inference Flow</div>
                        <div class="rag-flow" style="padding:0; gap:25px; flex-direction:row; align-items:stretch">
                            <div class="rag-col">
                                <div class="rag-box" id="rag-q">
                                    <div class="rag-box-title">👤 User Query</div>
                                    <div class="rag-box-content" style="font-weight:500">"How does YugabyteDB handle high availability?"</div>
                                </div>
                                <div class="rag-arrow-v" id="a1" style="opacity:0.2">↓</div>
                                <div class="rag-box" id="rag-model-inference">
                                    <div class="rag-box-title">🧠 Embedding Model</div>
                                    <div class="rag-box-content">Query → Vector Space</div>
                                    <div class="rag-code" id="rag-code-1" style="display:none">const vec = await model.embed(query);<br><b>[-0.012, 0.551, 0.892]</b></div>
                                </div>
                                <div class="rag-arrow-v" id="a1-inf" style="opacity:0.2">↓</div>
                                <div class="rag-box" id="rag-db">
                                    <div class="rag-box-title">🐘 YugabyteDB Search</div>
                                    <div class="rag-box-content">HNSW KNN search</div>
                                    <div class="rag-code" id="rag-code-2" style="display:none"><span class="c-amber">SELECT</span> content <span class="c-amber">FROM</span> knowledge_base<br><span class="c-amber">ORDER BY</span> embedding &lt;=&gt; <span class="c-green">$1</span>::vector<br><span class="c-amber">LIMIT</span> 2;</div>
                                </div>
                            </div>
                            <div class="rag-arrow-h" id="a2" style="align-self:center; opacity:0.2">→</div>
                            <div class="rag-col">
                                <div class="rag-box" id="rag-ctx">
                                    <div class="rag-box-title">📄 Retrieved Context</div>
                                    <div class="rag-box-content" id="rag-ctx-content">Relevant Semantic Clusters...</div>
                                    <div class="rag-code" id="rag-code-3" style="display:none"><b>[Chunk 1]:</b> "YugabyteDB uses Raft protocol..."<br><b>[Chunk 2]:</b> "Data shards replicate across AZs..."</div>
                                </div>
                                <div class="rag-arrow-v" id="a3" style="opacity:0.2">↓</div>
                                <div class="rag-box" id="rag-llm">
                                    <div class="rag-box-title">🤖 LLM Augmentation</div>
                                    <div class="rag-box-content">Context Injected Prompt</div>
                                    <div class="rag-code" id="rag-code-4" style="display:none"><span class="c-green">Prompt:</span> Use ONLY the context below:<br><b>Context:</b> [Chunk 1] [Chunk 2]</div>
                                </div>
                                <div class="rag-arrow-v" id="a4" style="opacity:0.2">↓</div>
                                <div class="rag-box" id="rag-res" style="border-color:var(--ok)">
                                    <div class="rag-box-title c-ok">✨ Grounded Answer</div>
                                    <div class="rag-box-content" id="rag-res-txt" style="font-style:italic">...generating answer...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },
        guidedTour: [
            { target: '#rag-flow-container', title: 'RAG Pipeline', text: 'The RAG flow has two phases: Ingestion (Phase 1) and Inference (Phase 2). Observe how private data is retrieved to ground the LLM response.', onStart: () => { window.jumpToStep(0); } }
        ],
        steps: [
            {
                label: '1. Source Documents',
                desc: 'Raw enterprise knowledge is partitioned into semantic "chunks" to maintain high-quality context windows.',
                action: () => {
                    $('rag-ingest-src').classList.add('active');
                }
            },
            {
                label: '2. Chunk & Embed',
                desc: 'Large documents are split into <b>chunks</b> before embedding. Common strategies: <b>fixed-size</b> (512 tokens with 50-token overlap), <b>sentence boundaries</b>, or <b>semantic chunking</b> (group by topic). Chunk size matters: too large = imprecise retrieval, too small = missing context. Each chunk is embedded independently and stored as its own row.',
                action: async () => {
                    $('ai1').style.opacity = '1';
                    $('rag-ingest-model').classList.add('active');
                    const container = $('chunk-anim');
                    container.innerHTML = '';
                    for(let i=0; i<8; i++) {
                        const c = document.createElement('div');
                        c.className = 'chunk-item';
                        container.appendChild(c);
                        setTimeout(() => c.classList.add('active'), i * 150);
                    }
                }
            },
            {
                label: '3. Optional Normalization',
                desc: '<b>Normalization</b> ensures all vectors have a length of 1. This "optional" step allows for faster <b>Inner Product</b> searches while maintaining precision.',
                action: () => {
                    $('ai-norm').style.opacity = '1';
                    $('rag-ingest-norm').classList.add('active');
                    $('norm-badge-1').classList.add('active');
                }
            },
            {
                label: '4. Store in YugabyteDB',
                desc: 'Metadata, raw text, and embeddings are persisted in YugabyteDB. Use <b>generate_series</b> for high-performance synthetic data creation.',
                action: () => {
                    $('ai2').style.opacity = '1';
                    $('rag-ingest-db').classList.add('active');
                    $('rag-ingest-sql').style.display = 'block';
                    window.setInteractiveSQL(`-- Bulk Ingest Knowledge Base\nINSERT INTO knowledge_base (content, embedding)\nSELECT 'Distributed SQL Chunk #' || i, random_vector(1536) \nFROM generate_series(1, 1000) AS i;`);
                }
            },
            {
                label: '5. Build HNSW Index',
                desc: 'Before serving queries, build the HNSW index on the embedding column. Without it every similarity search is a full sequential scan — dramatically slower at scale.',
                action: () => {
                    window.setInteractiveSQL(`-- Build HNSW index after bulk ingest\n-- (always build index AFTER INSERT, not before)\nCREATE INDEX idx_kb_cosine\n  ON knowledge_base\n  USING hnsw (embedding vector_cosine_ops)\n  WITH (m = 16, ef_construction = 64);\n\n-- Verify index is ready\nSELECT indexname, indexdef\nFROM pg_indexes\nWHERE tablename = 'knowledge_base';`);
                    addLog('INDEX', 'HNSW index created on knowledge_base(embedding). KNN queries are now sub-millisecond.');
                }
            },
            {
                label: '6. User Query',
                desc: 'A user query initiates the inference cycle. The question is "How does YugabyteDB handle HA?".',
                action: () => {
                    $('rag-sec-2').classList.add('active');
                    $('rag-q').classList.add('active');
                }
            },
            {
                label: '7. Vectorize Query',
                desc: 'The real-time prompt is vectorized by the <b>same model</b> used during ingestion for semantic alignment.',
                action: () => {
                    $('a1').style.opacity = '1';
                    $('rag-model-inference').classList.add('active');
                    $('rag-code-1').style.display = 'block';
                }
            },
            {
                label: '8. Vector Search',
                desc: 'YugabyteDB executes a sub-millisecond HNSW search to find relevant facts across millions of rows.',
                action: () => {
                    const rag = computeRAGResults(2);
                    $('a1-inf').style.opacity = '1';
                    $('rag-db').classList.add('active');
                    $('rag-code-2').style.display = 'block';
                    $('rag-code-2').innerHTML = `<span class="c-amber">SELECT</span> content <span class="c-amber">FROM</span> knowledge_base<br><span class="c-amber">ORDER BY</span> embedding &lt;=&gt; <span class="c-green">$1</span>::vector<br><span class="c-amber">LIMIT</span> 2;<br><span style="color:var(--txt3)">-- top chunk: ${rag.chunks[0].title}</span>`;
                    window.setInteractiveSQL(`-- Semantic Search for Context\nSELECT content FROM knowledge_base\nORDER BY embedding <=> '[${rag.query.x.toFixed(3)}, ${rag.query.y.toFixed(3)}]'\nLIMIT 2;`);
                }
            },
            {
                label: '8a. Relevance Guard',
                desc: 'Before injecting results into the prompt, check if retrieved chunks are actually relevant. If the closest chunk\'s distance exceeds a threshold, there are <b>no relevant results</b> — the LLM should say <em>"I don\'t have information on that."</em> rather than hallucinate. This guard prevents confident wrong answers.',
                action: () => {
                    const threshold = 0.55;
                    const results = computeRAGResults(3);
                    if (results.length > 0) {
                        const best = results[0];
                        const d = best.distance;
                        if (d > threshold) {
                            addLog('GUARD', `⚠ Best match distance: ${d.toFixed(3)} > threshold ${threshold}. No relevant chunks found.`);
                            addLog('LLM', '"I don\'t have enough information about this topic in my knowledge base. Please rephrase or try a different query."');
                        } else {
                            addLog('GUARD', `✓ Best match: "${best.label || best.name}" at distance ${d.toFixed(3)} < threshold ${threshold} — proceeding.`);
                        }
                    }
                    window.setInteractiveSQL(`-- Only inject if distance is below threshold\nSELECT chunk_text, embedding <=> $1 AS dist\nFROM documents\nORDER BY embedding <=> $1\nLIMIT 5\nHAVING MIN(embedding <=> $1) < 0.55;`);
                }
            },
            {
                label: '8b. Re-ranking',
                desc: 'Retrieve <b>Top-50</b> by vector similarity, then re-score with a cross-encoder model to get the final <b>Top-5</b> for context injection. Raw vector order is approximate — re-ranking catches semantically close but topically irrelevant chunks that slipped through. Common re-rankers: Cohere Rerank, cross-encoders, or an LLM-as-judge.',
                action: () => {
                    addLog('RERANK', 'Step 1 — vector recall: retrieve Top-50 by embedding <=> query_vector');
                    addLog('RERANK', 'Step 2 — cross-encoder: score each (query, chunk) pair → relevance 0.0–1.0');
                    addLog('RERANK', 'Step 3 — re-sort by relevance score → inject Top-5 into prompt');
                    addLog('KEY', 'Re-ranking adds ~50–200 ms latency but can double retrieval precision on ambiguous queries.');
                    window.setInteractiveSQL(`-- Retrieve wider pool for re-ranking\nSELECT id, chunk_text,\n  embedding <=> $1 AS vec_dist\nFROM documents\nORDER BY embedding <=> $1\nLIMIT 50;\n\n-- Then re-rank in application layer\n-- and inject only the top 5 by relevance score`);
                }
            },
            {
                label: '9. Context Injection',
                desc: 'The database context is "stuffed" into the LLM prompt, grounding the model in proprietary facts.',
                action: () => {
                    const rag = computeRAGResults(2);
                    $('a2').style.opacity = '1';
                    $('rag-ctx').classList.add('active');
                    $('rag-code-3').style.display = 'block';
                    $('rag-ctx-content').textContent = `${rag.chunks.length} retrieved chunks ready for prompt injection`;
                    $('rag-code-3').innerHTML = rag.chunks.map((chunk, idx) => `<b>[Chunk ${idx + 1}]</b> ${chunk.content}`).join('<br>');
                    setTimeout(() => {
                        $('a3').style.opacity = '1';
                        $('rag-llm').classList.add('active');
                        $('rag-code-4').style.display = 'block';
                        $('rag-code-4').innerHTML = `<span class="c-green">Prompt:</span> Use ONLY the context below:<br>${rag.chunks.map((chunk) => chunk.title).join(' + ')}`;
                    }, 400);
                }
            },
            {
                label: '10. Grounded Response',
                desc: 'The LLM returns an accurate, hallucination-free answer based strictly on the retrieved database records.',
                action: () => {
                    const rag = computeRAGResults(2);
                    $('a4').style.opacity = '1';
                    $('rag-res').classList.add('active');
                    $('rag-res-txt').innerHTML = `<span class="c-ok">"${rag.chunks.map((chunk) => chunk.content).join(' ')}"</span>`;
                }
            }
        ]
    },
    {
        name: 'Hybrid Search',
        group: 'Architecture',
        icon: '🧬',
        desc: '<b>Hybrid Search</b> is the ability to combine relational filtering (WHERE) with vector similarity (ORDER BY) in a single, atomic execution.',
        sql: '-- Step 1: Create a partial HNSW index for the filtered category\nCREATE INDEX idx_elec_cosine ON products\n  USING hnsw (embedding vector_cosine_ops)\n  WHERE category = \'Electronics\';\n\n-- Step 2: The optimizer uses the partial index automatically\nSELECT name, price FROM products\nWHERE category = \'Electronics\'\n  AND price < 500\nORDER BY embedding <=> \'[0.12, 0.45, 0.89]\'\nLIMIT 2;',
        showHybrid: true,
        init: () => {
            const container = $('rag-flow-container');
            container.innerHTML = `
                <div class="rag-flow-main" style="display:flex; flex-direction:column; gap:25px; width:100%; padding:30px; box-sizing:border-box;">
                    
                    <!-- STEP 1: INPUT -->
                    <div class="rag-box" id="hyb-input" style="width:100%;">
                        <div class="rag-box-title">📝 Incoming Hybrid Query</div>
                        <div class="rag-code" style="font-size:12px; color:#e9d5ff">
                            <span class="c-amber">SELECT</span> * <span class="c-amber">FROM</span> products<br>
                            <span class="c-amber">WHERE</span> <span id="hyb-sql-filter">category = 'Electronics' AND price < 500</span><br>
                            <span class="c-amber">ORDER BY</span> <span id="hyb-sql-vec">embedding &lt;=&gt; '[0.12, 0.45, 0.89]'</span><br>
                            <span class="c-amber">LIMIT</span> 2;
                        </div>
                    </div>

                    <div class="rag-arrow-v" id="hy-a1" style="opacity:0.2; margin:-5px 0; text-align:center">↓</div>

                    <!-- STEP 2: OPTIMIZER -->
                    <div class="rag-box" id="hyb-opt" style="width:100%; border-style:dashed">
                        <div class="rag-box-title c-purple">🔍 YugabyteDB Optimizer</div>
                        <div class="rag-box-content">Planning atomic execution strategy...</div>
                        <div id="hyb-plan" style="display:none; font-size:10px; font-family:var(--mono); margin-top:8px; color:var(--txt3)">
                            > Found Partial HNSW Index: idx_elec_v<br>
                            > Pushing down filter: price < 500
                        </div>
                    </div>

                    <div class="rag-arrow-v" id="hy-a2" style="opacity:0.2; margin:-5px 0; text-align:center">↓</div>

                    <!-- STEP 3: AT ONE GO EXECUTION -->
                    <div class="hybrid-engine-box" id="hyb-engine" style="opacity:0.3; filter:grayscale(1); transition:all 0.5s; width:100%; position:relative;">
                        <div style="flex:1; display:flex; flex-direction:column; gap:10px">
                            <div class="rag-box hybrid-active" id="hyb-structural" style="opacity:1; filter:none">
                                <div class="rag-box-title" style="font-size:11px">Structural Engine</div>
                                <div class="rag-box-content" style="font-size:10px">Evaluates relational predicates (Price, Category)</div>
                            </div>
                        </div>

                        <div style="font-size:24px; color:var(--leader); font-weight:900">＋</div>

                        <div style="flex:1; display:flex; flex-direction:column; gap:10px">
                            <div class="rag-box hybrid-active" id="hyb-similarity" style="opacity:1; filter:none">
                                <div class="rag-box-title" style="font-size:11px">Similarity Engine</div>
                                <div class="rag-box-content" style="font-size:10px">Scans HNSW graph for nearest neighbors</div>
                            </div>
                        </div>

                        <div id="hyb-label-1" style="position:absolute; bottom:-25px; left:50%; transform:translateX(-50%); font-family:var(--head); font-size:10px; color:var(--ok); text-transform:uppercase; font-weight:800; opacity:0">Atomic Hybrid Scan</div>
                    </div>

                    <div class="rag-arrow-v" id="hy-a3" style="opacity:0.2; margin:5px 0; text-align:center">↓</div>

                    <!-- STEP 4: RESULTS -->
                    <div class="rag-box" id="hyb-results" style="width:100%; border-color:var(--ok)">
                        <div class="rag-box-title c-ok">✨ Ranked Hybrid Results</div>
                        <div class="rag-box-content" id="hyb-res-list" style="font-size:11px">...waiting for engine...</div>
                    </div>
                </div>
            `;
        },
        guidedTour: [
            { target: '#rag-flow-container', title: 'Hybrid Search', text: 'Observe how YugabyteDB combines structural filters (WHERE) and vector similarity (ORDER BY) into a single, atomic operation.', onStart: () => { window.jumpToStep(0); } },
            { target: '#hyb-engine', title: 'Atomic Execution', text: 'Relational predicates are pushed down directly into the vector index scan, ensuring maximum performance.', onStart: () => { window.jumpToStep(2); } }
        ],
        steps: [
            {
                label: '1. The Hybrid Prompt',
                desc: 'The user wants to find <b>Electronics</b> that are <b>under $500</b>, but also <b>semantically similar</b> to a specific concept.',
                action: () => {
                    $('hyb-input').classList.add('active');
                    $('hyb-sql-filter').style.background = 'rgba(245, 158, 11, 0.2)';
                    $('hyb-sql-vec').style.background = 'rgba(168, 85, 247, 0.2)';
                }
            },
            {
                label: '2. Optimizer Analysis',
                desc: 'YugabyteDB analyzes the query. It identifies that it can use a <b>Partial HNSW Index</b> to satisfy the category filter instantly.',
                action: () => {
                    const candidates = computeHybridResults(Math.max(2, paramK));
                    $('hy-a1').style.opacity = '1';
                    $('hyb-opt').classList.add('active');
                    $('hyb-plan').style.display = 'block';
                    $('hyb-plan').innerHTML = `> Partial HNSW Index: idx_elec_v<br>> Filtered rows: ${PRODUCT_CATALOG.filter((item) => item.category === 'Electronics' && item.price < 500).length}<br>> Returning top ${candidates.length} by cosine distance`;
                }
            },
            {
                label: '2b. Post-Filter Trap',
                desc: '<span class="c-red"><b>Post-filter (wrong way):</b></span> run KNN across the full table → take Top-10 → filter by category in the app. When the filter is selective, few results survive — recall collapses to near zero. <span class="c-green"><b>Partial index (right way):</b></span> build the HNSW index <em>only on matching rows</em> so every result already passes the filter.',
                action: () => {
                    const electronics = vectors.filter(v => v.cat === 'Electronics' || v.color === '#3b82f6');
                    const allSorted  = [...vectors].sort((a, b) => distL2(queryVector, a) - distL2(queryVector, b));
                    const knn10      = allSorted.slice(0, 10);
                    const postFilter = knn10.filter(v => v.cat === 'Electronics' || v.color === '#3b82f6');
                    addLog('TRAP', `Post-filter: KNN Top-10 across all ${vectors.length} vectors → filter Electronics → ${postFilter.length} results survive`);
                    addLog('TRAP', `Effective recall: ${postFilter.length}/${Math.min(5, electronics.length)} = ${electronics.length ? Math.round(postFilter.length/Math.min(5,electronics.length)*100) : 0}%`);
                    addLog('FIX', `Partial index: CREATE INDEX ... WHERE category='Electronics' → search only ${electronics.length} indexed rows → always returns full Top-K. Recall = 100%.`);
                    window.setInteractiveSQL(`-- ❌ Post-filter (bad recall when selective)\nSELECT name, embedding <=> '[0.12, 0.45]' dist\nFROM items\nORDER BY embedding <=> '[0.12, 0.45]'\nLIMIT 10;\n-- then filter by category in app layer\n\n-- ✅ Partial index (correct approach)\nCREATE INDEX idx_elec_v\n  ON items USING hnsw (embedding vector_l2_ops)\n  WHERE category = 'Electronics';\n\nSELECT name FROM items\nWHERE category = 'Electronics'\nORDER BY embedding <=> '[0.12, 0.45]'\nLIMIT 5;`);
                }
            },
            {
                label: '3. Atomic Hybrid Execution',
                desc: 'Crucially, the database does NOT do this in two steps. The <b>Structural</b> and <b>Similarity</b> engines run together in a single index scan.',
                action: () => {
                    $('hy-a2').style.opacity = '1';
                    $('hyb-engine').style.opacity = '1';
                    $('hyb-engine').style.filter = 'none';
                    $('hyb-label-1').style.opacity = '1';
                    $('hyb-engine').style.borderColor = 'var(--ok)';
                }
            },
            {
                label: '4. Precision Results',
                desc: 'The results are returned. They are strictly within the relational constraints and perfectly ranked by vector distance.',
                action: () => {
                    const results = computeHybridResults(Math.max(2, paramK));
                    $('hy-a3').style.opacity = '1';
                    $('hyb-results').classList.add('active');
                    $('hyb-res-list').innerHTML = formatHybridResults(results);
                }
            }
        ]
    },
    {
        name: 'Distributed HNSW Search',
        group: 'Architecture',
        icon: '🌐',
        desc: '<b>Distributed Vector Search</b> demonstrates how YugabyteDB scales vector search horizontally by sharding HNSW indexes across multiple nodes and performing parallel Scatter-Gather execution.',
        sql: '-- Querying a Distributed HNSW Index\nSELECT name FROM items \nORDER BY embedding <=> \'[0.1, 0.5, 0.8]\' \nLIMIT 5;',
        showDistributed: true,
        init: () => {
            const container = $('rag-flow-container');
            container.innerHTML = `
                <div class="rag-flow-main" style="display:flex; flex-direction:column; gap:60px; width:100%; padding:60px; box-sizing:border-box; align-items:center;">
                    
                    <!-- CLIENT & GATEWAY -->
                    <div style="display:flex; align-items:center; gap:30px; width:100%; justify-content:center;">
                        <div class="rag-box" id="dist-client" style="width:180px; border-style:dashed;">
                            <div class="rag-box-title" style="font-size:12px; justify-content:center;">💻 Client</div>
                            <div style="text-align:center; font-size:12px; color:var(--txt3)">[Query Vector]</div>
                        </div>
                        <div class="rag-arrow-h" id="dist-a1" style="opacity:0.2; font-size:24px;">→</div>
                        <div class="rag-box" id="dist-gw" style="width:240px;">
                            <div class="rag-box-title" style="font-size:14px; justify-content:center;">🌐 Gateway Node</div>
                            <div id="dist-gw-msg" style="text-align:center; font-size:12px; color:var(--txt2)">Listening...</div>
                        </div>
                    </div>

                    <!-- CLUSTER NODES -->
                    <div style="display:flex; justify-content:space-between; width:100%; max-width:1000px; position:relative; margin-top:20px;">
                        <!-- SCATTER ARROWS -->
                        <div id="scatter-lines" style="position:absolute; top:-40px; left:0; width:100%; height:40px; pointer-events:none;">
                            <svg width="100%" height="100%" style="overflow:visible">
                                <path id="p1" d="M 500 0 L 165 60" stroke="var(--leader)" stroke-width="3" fill="none" stroke-dasharray="8 8" style="opacity:0; transition:opacity 0.3s" />
                                <path id="p2" d="M 500 0 L 500 60" stroke="var(--leader)" stroke-width="3" fill="none" stroke-dasharray="8 8" style="opacity:0; transition:opacity 0.3s" />
                                <path id="p3" d="M 500 0 L 835 60" stroke="var(--leader)" stroke-width="3" fill="none" stroke-dasharray="8 8" style="opacity:0; transition:opacity 0.3s" />
                            </svg>
                        </div>

                        <div class="rag-box dist-node" id="dn1" style="flex:1; margin:0 15px; border-color:rgba(59, 130, 246, 0.3)">
                            <div class="rag-box-title" style="font-size:14px; color:var(--follower)">Tablet 1</div>
                            <div class="rag-code" id="dc1" style="margin-top:10px; font-size:12px; display:none">Local HNSW Search...</div>
                            <div id="dr1" style="margin-top:10px; font-size:14px; color:var(--ok); display:none">Top 5 results</div>
                        </div>
                        <div class="rag-box dist-node" id="dn2" style="flex:1; margin:0 15px; border-color:rgba(59, 130, 246, 0.3)">
                            <div class="rag-box-title" style="font-size:14px; color:var(--follower)">Tablet 2</div>
                            <div class="rag-code" id="dc2" style="margin-top:10px; font-size:12px; display:none">Local HNSW Search...</div>
                            <div id="dr2" style="margin-top:10px; font-size:14px; color:var(--ok); display:none">Top 5 results</div>
                        </div>
                        <div class="rag-box dist-node" id="dn3" style="flex:1; margin:0 15px; border-color:rgba(59, 130, 246, 0.3)">
                            <div class="rag-box-title" style="font-size:14px; color:var(--follower)">Tablet 3</div>
                            <div class="rag-code" id="dc3" style="margin-top:10px; font-size:12px; display:none">Local HNSW Search...</div>
                            <div id="dr3" style="margin-top:10px; font-size:14px; color:var(--ok); display:none">Top 5 results</div>
                        </div>
                    </div>

                    <!-- FINAL RESULTS -->
                    <div class="rag-box" id="dist-final" style="width:100%; max-width:600px; border-color:var(--ok); opacity:0; transform:translateY(20px)">
                        <div class="rag-box-title" style="font-size:16px; color:var(--ok); justify-content:center;">✨ Global Top-K (Merged)</div>
                        <div id="dist-res-list" style="font-size:14px; text-align:center;">...</div>
                    </div>
                </div>
            `;
        },
        guidedTour: [
            { target: '#dist-gw', title: 'Query Gateway', text: 'Any node in the cluster can coordinate a vector search, identifying which tablets contain relevant shards.', onStart: () => { window.jumpToStep(0); } },
            { target: '#scatter-lines', title: 'Parallel Execution', text: 'YugabyteDB scatters the search to all shard leaders simultaneously for high-throughput scaling.', onStart: () => { window.jumpToStep(2); } }
        ],
        steps: [
            {
                label: '1. Vector Query Arrival',
                desc: 'A client sends a vector search request to any node in the YugabyteDB cluster. This node acts as the <b>Query Gateway</b>.',
                action: () => {
                    $('dist-client').classList.add('active');
                    $('dist-a1').style.opacity = '1';
                    $('dist-gw').classList.add('active');
                    $('dist-gw-msg').textContent = 'Parsing Vector...';
                }
            },
            {
                label: '2. Shard Mapping',
                desc: 'The gateway identifies that the HNSW index is distributed across multiple <b>Tablets</b>. It prepares to broadcast the query.',
                action: () => {
                    $('dist-gw-msg').innerHTML = '<span style="color:var(--leader)">Routing to Shards...</span>';
                    window.setInteractiveSQL(`-- Gateway determines shard locations\nSELECT yb_get_tablet_nodes('items_embedding_idx');`);
                }
            },
            {
                label: '3. Parallel Scatter',
                desc: 'The query is sent in parallel to every <b>tablet leader</b> — not followers — ensuring <b>strong consistency</b>: each search sees the latest committed writes. This means leader replicas bear the full read load. Horizontal scaling comes from adding more tablets; each new shard adds a leader and parallelises the scatter further.',
                action: () => {
                    ['p1', 'p2', 'p3'].forEach(id => {
                        const p = $(id);
                        p.style.opacity = '1';
                        p.style.strokeDashoffset = '100';
                        p.animate([{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }], { duration: 800, iterations: Infinity });
                    });
                    ['dn1', 'dn2', 'dn3'].forEach(id => $(id).classList.add('active'));
                }
            },
            {
                label: '4. Local Shard Search',
                desc: 'Each node performs a <b>Local Greedy Search</b> on its own HNSW graph shard. This happens concurrently across the cluster.',
                action: () => {
                    const shardResults = computeDistributedShardResults(Math.max(3, paramK));
                    ['dc1', 'dc2', 'dc3'].forEach(id => $(id).style.display = 'block');
                    shardResults.perShard.forEach((rows, idx) => {
                        $(`dc${idx + 1}`).textContent = rows.length
                            ? rows.map((row) => `${row.name} (${row.distance.toFixed(3)})`).join('\n')
                            : 'No local matches';
                    });
                    window.setInteractiveSQL(`-- Local execution on each tablet leader\nSELECT * FROM items_shard_N\nORDER BY embedding <=> '[0.12, 0.45]'\nLIMIT ${Math.max(3, paramK)};`);
                }
            },
            {
                label: '5. Gather & Merge',
                desc: 'Each node returns its local Top-K results. The gateway merges these results (Top-K of Top-Ks) to produce the final global set.',
                action: () => {
                    const shardResults = computeDistributedShardResults(Math.max(3, paramK));
                    ['dr1', 'dr2', 'dr3'].forEach(id => {
                        const el = $(id);
                        el.style.display = 'block';
                        el.classList.add('new-row-anim');
                    });
                    shardResults.perShard.forEach((rows, idx) => {
                        $(`dr${idx + 1}`).textContent = rows.length
                            ? `Top ${rows.length}: ${rows.map((row) => row.name).join(', ')}`
                            : 'No local rows';
                    });
                    $('dist-gw-msg').innerHTML = '<span class="c-ok">Merging Results...</span>';
                }
            },
            {
                label: '5b. Shard Imbalance',
                desc: '<span class="c-amber"><b>⚠ Watch out:</b></span> if data is skewed — e.g. 80% of vectors land on one tablet due to a non-uniform hash key — that tablet becomes a <b>bottleneck</b>. Total search latency = slowest shard. Use a high-cardinality hash key (e.g. UUID) or <b>pre-split tablets</b> to distribute load evenly before bulk insert.',
                action: () => {
                    addLog('SKEW', 'Balanced:   Tablet-1=33%  Tablet-2=34%  Tablet-3=33%  → latency driven by average');
                    addLog('SKEW', 'Imbalanced: Tablet-1=80%  Tablet-2=15%  Tablet-3=5%   → latency driven by Tablet-1 alone');
                    addLog('FIX', 'Fix: use UUID primary key, or run:');
                    window.setInteractiveSQL(`-- Pre-split tablets for even distribution\nALTER TABLE items SPLIT INTO 6 TABLETS;\n\n-- Or use a UUID to avoid hot partitions\nCREATE TABLE items (\n  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  name TEXT,\n  embedding vector(1536)\n);`);
                    addLog('KEY', 'Rule of thumb: number of tablets ≥ 2× vCPUs for even scatter-gather load.');
                }
            },
            {
                label: '6. Global Result',
                desc: 'The final, globally sorted Top-K list is returned to the client. YugabyteDB handles all the complexity of distribution transparently.',
                action: () => {
                    const shardResults = computeDistributedShardResults(Math.max(3, paramK));
                    const final = $('dist-final');
                    final.style.opacity = '1';
                    final.style.transform = 'translateY(0)';
                    $('dist-res-list').innerHTML = shardResults.merged
                        .map((row, idx) => `${idx + 1}. ${row.name} (${row.distance.toFixed(3)})`)
                        .join('<br>');
                }
            }
        ]
    },
    {
        name: 'Top-K Sampling',
        group: 'Advanced Sampling',
        icon: '📈',
        desc: 'Top-K sampling restricts the next token to the K most likely candidates. This prevents the model from choosing highly improbable "tail" tokens.',
        sql: '-- Top-K sampling (K=5)\n-- Restricts selection to the top 5 most probable tokens\nSELECT token, probability \nFROM llm_output \nORDER BY probability DESC \nLIMIT 5;',
        showSampling: true,
        extraBtns: [
            { label: '🎲 Run Sampling Query', cb: 'runSamplingQuery', cls: 'btn-g' },
            { label: '➕ Re-Seed Points', cb: 'seedSamplingPoints', cls: 'btn-p' }
        ],
        init: () => { 
            vectors = []; 
            queryVector = { x: 0, y: 0 };
            window.seedSamplingPoints();
            render();
        },
        guidedTour: [
            { target: '#sampling-controls', title: 'Top-K Sampling', text: 'Set a hard limit on the number of candidates. Only the top K most likely tokens are considered for the next sample.', onStart: () => { window.runSamplingQuery(); } }
        ],
        steps: [
            {
                label: 'Ranked Candidates',
                desc: 'The chart orders all candidates by next-token probability. Longer blue bars carry more probability mass. Notice how the tail tokens have near-zero probability — they could produce nonsense.',
                action: () => {
                    window.runSamplingQuery();
                    addLog('TOP-K', 'All tokens visible — including low-probability tail tokens that the model deems unlikely.');
                }
            },
            {
                label: 'Apply the Cutoff',
                desc: 'Top-K prunes every token below rank K, regardless of its probability. Watch the chart collapse as K drops — only the top-ranked survive.',
                action: () => {
                    paramK = 3;
                    const slider = $('param-k-2');
                    const valEl = $('val-k-2');
                    if (slider) slider.value = 3;
                    if (valEl) valEl.textContent = 3;
                    window.runSamplingQuery();
                    addLog('TOP-K', `K=3: only the top 3 tokens survive. The rest are pruned — even tokens with meaningful probability.`);
                }
            }
        ]
    },
    {
        name: 'Top-P (Nucleus) Sampling',
        group: 'Advanced Sampling',
        icon: '🌊',
        desc: 'Top-P sampling (Nucleus) dynamically selects the smallest set of tokens whose cumulative probability exceeds P. It adapts to the "certainty" of the model.',
        sql: '-- Top-P sampling (P=0.70)\n-- Selects tokens until cumulative probability hits 70%\nWITH ranked AS (\n  SELECT token, probability, \n         SUM(probability) OVER (ORDER BY probability DESC) as cum_p\n  FROM llm_output\n)\nSELECT token FROM ranked WHERE cum_p <= 0.70;',
        showSampling: true,
        extraBtns: [
            { label: '🎲 Run Sampling Query', cb: 'runSamplingQuery', cls: 'btn-g' },
            { label: '➕ Re-Seed Points', cb: 'seedSamplingPoints', cls: 'btn-p' }
        ],
        init: () => { 
            vectors = []; 
            queryVector = { x: 0, y: 0 };
            window.seedSamplingPoints();
            render();
        },
        guidedTour: [
            { target: '#sampling-controls', title: 'Top-P (Nucleus)', text: 'Instead of a fixed count, Top-P selects the smallest set of tokens whose cumulative probability exceeds P. It adapts to the model\'s confidence.', onStart: () => { window.runSamplingQuery(); } }
        ],
        steps: [
            {
                label: 'Cumulative Window',
                desc: 'Read the cumulative column top-to-bottom. Top-P keeps adding candidates until the running total crosses threshold P. The purple boundary stops wherever the mass is covered.',
                action: () => {
                    paramP = 0.70;
                    const slider = $('param-p');
                    const valEl = $('val-p');
                    if (slider) slider.value = 70;
                    if (valEl) valEl.textContent = '0.70';
                    window.runSamplingQuery();
                    addLog('TOP-P', 'P=0.70: nucleus covers the first 70% of cumulative probability mass. Boundary adapts to each distribution.');
                }
            },
            {
                label: 'Adaptive vs Fixed',
                desc: 'Drop P to 0.50 and watch the nucleus shrink — a confident model needs only 1–2 tokens. Raise to 0.95 and the whole tail enters. Top-K can never do this automatically.',
                action: () => {
                    paramP = 0.50;
                    const slider = $('param-p');
                    const valEl = $('val-p');
                    if (slider) slider.value = 50;
                    if (valEl) valEl.textContent = '0.50';
                    window.runSamplingQuery();
                    addLog('TOP-P', 'P=0.50: nucleus shrinks to the fewest tokens covering 50% of probability mass — adapts to model confidence.');
                }
            }
        ]
    },
    {
        name: 'Hybrid Sampling (Synergy)',
        group: 'Advanced Sampling',
        icon: '🎲',
        desc: 'Combining Top-K and Top-P provides the ultimate control. Top-K prunes the absolute worst candidates, while Top-P adapts the selection to the model\'s confidence.',
        sql: '-- Hybrid Sampling: Top-K=50 AND Top-P=0.70\nWITH filtered AS (\n  SELECT token, probability\n  FROM llm_output\n  ORDER BY probability DESC LIMIT 50\n),\nranked AS (\n  SELECT *, SUM(probability) OVER (ORDER BY probability DESC) as cum_p\n  FROM filtered\n)\nSELECT token FROM ranked WHERE cum_p <= 0.70;',
        showSampling: true,
        extraBtns: [
            { label: '🎲 Run Sampling Query', cb: 'runSamplingQuery', cls: 'btn-g' },
            { label: '➕ Re-Seed Points', cb: 'seedSamplingPoints', cls: 'btn-p' }
        ],
        init: () => { 
            vectors = []; 
            queryVector = { x: 0, y: 0 };
            window.seedSamplingPoints();
            render();
        },
        guidedTour: [
            { target: '#sampling-controls', title: 'Sampling Synergy', text: 'Combining Top-K and Top-P provides the ultimate balance of safety and diversity. Green tokens represent the "sweet spot" intersection.', onStart: () => { window.runSamplingQuery(); } }
        ],
        steps: [
            {
                label: 'Eligibility Layers',
                desc: '<span class="c-blue">Blue</span> bars pass Top-K, <span class="c-purple">purple</span> bars are inside the Top-P nucleus. <span class="c-green">Green</span> bars satisfy both gates — only green tokens are sampled.',
                action: () => {
                    paramK = 10;
                    paramP = 0.85;
                    const kSlider = $('param-k-2');
                    const pSlider = $('param-p');
                    if (kSlider) { kSlider.value = 10; $('val-k-2').textContent = 10; }
                    if (pSlider) { pSlider.value = 85; $('val-p').textContent = '0.85'; }
                    window.runSamplingQuery();
                    addLog('HYBRID', 'K=10, P=0.85: a wide blend. Most ranked tokens pass both gates.');
                }
            },
            {
                label: 'Tighten the Blend',
                desc: 'Drop K to 5 and P to 0.70 — the green intersection shrinks to only the highest-confidence tokens. This is the recommended starting point for factual generation tasks.',
                action: () => {
                    paramK = 5;
                    paramP = 0.70;
                    const kSlider = $('param-k-2');
                    const pSlider = $('param-p');
                    if (kSlider) { kSlider.value = 5; $('val-k-2').textContent = 5; }
                    if (pSlider) { pSlider.value = 70; $('val-p').textContent = '0.70'; }
                    window.runSamplingQuery();
                    window.setInteractiveSQL('-- Hybrid sampling: K=5, P=0.70\nWITH top_k AS (\n  SELECT token, probability\n  FROM llm_output ORDER BY probability DESC LIMIT 5\n),\nnucleus AS (\n  SELECT *, SUM(probability) OVER (ORDER BY probability DESC) AS cum_p\n  FROM top_k\n)\nSELECT token FROM nucleus WHERE cum_p <= 0.70;');
                    addLog('HYBRID', 'K=5, P=0.70: tight blend for factual tasks. Creative tasks: try K=50, P=0.95.');
                }
            }
        ]
    }
];
