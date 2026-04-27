const SCENARIOS = {
  "home": {
    group: "Home", icon: "🏠", title: "YugabyteDB Data Model Explorer", subtitle: "Interactive Architecture Visualizer",
    description: "Welcome to the Data Model Explorer! Select a module below or from the sidebar to understand how YugabyteDB's distributed DocDB storage engine distributes, indexes, and queries data across the cluster.",
    visual: { type: "home" },
    guidedTour: [
      { text: "Welcome! Explore how YugabyteDB handles data distribution and query execution.", element: "#home-view" },
      { text: "Use the sidebar to pick a scenario, or press <b>?</b> for keyboard shortcuts.", element: "aside" },
      { text: "Each scenario has interactive visualizations and live SQL snippets.", element: ".home-card" }
    ]
  },

  "hash-single": {
    group: "Hash Sharding", icon: "🆔", title: "Hash: Single Key", subtitle: "Simple hash distribution",
    description: "Single column PK is hash-sharded by default. Data distributes across tablets via MurmurHash2. Great for point lookups, but range scans hit all tablets.",
    inputPlaceholder: "Enter name (e.g. Alice Chen)...",
    scanDefault: "user_id = 'user-105'",
    legend: [
      { type: "sharding", label: "user_id", explain: "Sharding key — HASH(user_id) determines tablet placement" },
      { type: "data", label: "Other columns", explain: "Regular data columns stored with the row" }
    ],
    generateRow: (v) => [`user-${Math.floor(Math.random() * 999)}`, v, ["US", "EU", "APAC"][Math.floor(Math.random() * 3)], ["Active", "Pending"][Math.floor(Math.random() * 2)], "2024-0" + (Math.floor(Math.random() * 9) + 1) + "-15"],
    visual: {
      type: "sharding-view", shardingType: "HASH",
      sortConfig: [{ idx: 0, dir: "ASC" }],
      columns: [
        { label: "[hash]", role: "sys", dir: "ASC" }, { label: "user_id", role: "sh", dir: "ASC" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }, { label: "created_at", role: "" }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [{ data: ["0x49CE", "user-105", "Alice Chen", "US", "Active", "2024-01-15"] }, { data: ["0x4995", "user-120", "Dan Park", "EU", "Active", "2024-02-20"] }] },
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [{ data: ["0x79B0", "user-101", "Bob Martinez", "EU", "Pending", "2024-03-05"] }] },
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [{ data: ["0xCF06", "user-100", "Carol Singh", "APAC", "Active", "2024-04-10"] }, { data: ["0xCEE2", "user-115", "Eve Adams", "US", "Active", "2024-05-01"] }] }
      ]
    },
    callout: { type: "info", icon: "💡", text: "<b>Hash sharding</b> is the default in YugabyteDB. The PK value is hashed and mapped to one of the hash partitions (tablets). Ideal for point lookups (<code>WHERE user_id = ?</code>), but full table scans are needed for range queries." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="sh-key">user_id</span> <span class="sql-type">TEXT</span> <span class="sql-kw">PRIMARY KEY</span>,
    name    <span class="sql-type">TEXT</span>,
    region  <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>,
    created_at <span class="sql-type">DATE</span>
);

<span class="sql-comment">-- By default, single-column PK = HASH sharded</span>
<span class="sql-comment">-- Point lookup: HASH(user_id) → determines tablet → single RPC</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users <span class="sql-kw">WHERE</span> user_id = <span class="sql-str">'user-105'</span>;

<span class="sql-comment">-- ⚠ Range scan hits ALL tablets (scatter-gather)</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users <span class="sql-kw">WHERE</span> user_id > <span class="sql-str">'user-100'</span>;` },
    guidedTour: [
      { text: "Type a name in the input box below.", element: "#sim-input-val" },
      { text: "Click <b>Insert Row</b> to calculate its hash.", element: ".primary-btn" },
      { text: "Or click <b>Auto Generate</b> to quickly fill tablets with sample data.", element: ".secondary-btn" },
      { text: "Watch as rows are pinned to specific tablets based on their hash ranges.", element: "#visual-render-area" }
    ]
  },

  "hash-comp-ab": {
    group: "Hash Sharding", icon: "🧬", title: "Hash+Range: ASC", subtitle: "Hash shard, ascending clustering",
    description: "First column is the sharding key (hashed). Second column is the clustering key sorted ASC within each tablet. All rows for a given sharding key are co-located and sorted.",
    inputPlaceholder: "Enter log message...",
    scanDefault: "tenant_id = 'AcmeCorp'",
    legend: [
      { type: "sharding", label: "tenant_id", explain: "Sharding key — determines tablet placement via hash" },
      { type: "clustering", label: "log_time ASC", explain: "Clustering key — rows sorted ascending within tablet" }
    ],
    generateRow: (v) => [["AcmeCorp", "Globex", "Initech"][Math.floor(Math.random() * 3)], new Date().toISOString().slice(11, 19), ["INFO", "WARN", "ERROR"][Math.floor(Math.random() * 3)], v, "v2"],
    visual: {
      type: "sharding-view", shardingType: "HASH",
      sortConfig: [{ idx: 0, dir: "ASC" }, { idx: 1, dir: "ASC" }, { idx: 2, dir: "ASC" }],
      columns: [
        { label: "[hash]", role: "sys", dir: "ASC" }, { label: "tenant_id", role: "sh", dir: "ASC" }, { label: "log_time", role: "cl", dir: "ASC" }, { label: "level", role: "" }, { label: "message", role: "" }, { label: "version", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", range: "0x0000–0x5555", rows: [
            { data: ["0x4707", "Globex", "07:00:00", "INFO", "Batch job started", "v1"] },
            { data: ["0x4707", "Globex", "11:00:00", "ERROR", "Connection timeout", "v1"] }
          ]
        },
        {
          id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
            { data: ["0x9DA2", "Initech", "09:00:00", "INFO", "Login successful", "v3"] }
          ]
        },
        {
          id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { data: ["0xCC4D", "AcmeCorp", "08:00:00", "INFO", "Server started", "v2"] },
            { data: ["0xCC4D", "AcmeCorp", "09:15:00", "WARN", "High memory", "v2"] },
            { data: ["0xCC4D", "AcmeCorp", "10:30:00", "INFO", "Request processed", "v2"] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "📊", text: "<b>ASC clustering</b> stores oldest entries first. Efficient for <code>WHERE tenant_id = ? AND log_time > ?</code> range scans. Each tenant's data lives together on the same tablet." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> tenant_logs (
    <span class="sh-key">tenant_id</span> <span class="sql-type">TEXT</span>,
    <span class="cl-key">log_time</span>  <span class="sql-type">TIMESTAMP</span>,
    level     <span class="sql-type">TEXT</span>,
    message   <span class="sql-type">TEXT</span>,
    version   <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> (<span class="sh-key">tenant_id HASH</span>, <span class="cl-key">log_time ASC</span>)
);

<span class="sql-comment">-- Rows sorted ASC: oldest first within each tenant partition</span>
<span class="sql-comment">-- Efficient for time-range queries within a single tenant</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> tenant_logs
<span class="sql-kw">WHERE</span> tenant_id = <span class="sql-str">'AcmeCorp'</span>
  <span class="sql-kw">AND</span> log_time > <span class="sql-str">'2024-01-01 08:00:00'</span>;` },
    guidedTour: [
      { text: "Enter a reading value for the sensor.", element: "#sim-input-val" },
      { text: "Click <b>Insert Row</b>. Notice it always goes to the same tablet because the ID is fixed.", element: ".primary-btn" },
      { text: "Click <b>Auto Generate</b> to see how TS-sorted data packs into the tablet.", element: ".secondary-btn" },
      { text: "Inside the tablet, rows are automatically sorted by time (TS).", element: ".tablet-card" }
    ]
  },

  "hash-comp-desc": {
    group: "Hash Sharding", icon: "🔻", title: "Hash+Range: DESC", subtitle: "Hash shard, descending clustering",
    description: "Same as above but clustering key is DESC — newest entries first. Ideal for 'latest N' queries that avoid scanning from the beginning.",
    inputPlaceholder: "Enter event description...",
    scanDefault: "sensor_id = 'S-101'",
    legend: [
      { type: "sharding", label: "sensor_id", explain: "Sharded by sensor_id; data for each sensor is stored together in one tablet" },
      { type: "clustering", label: "ts DESC", explain: "Clustering key — newest readings stored first" }
    ],
    generateRow: (v) => [["S-101", "S-202", "S-303"][Math.floor(Math.random() * 3)], new Date().toISOString().slice(11, 19), (20 + Math.random() * 15).toFixed(1), "°C", v || "Normal"],
    visual: {
      type: "sharding-view", shardingType: "HASH",
      sortConfig: [{ idx: 0, dir: "ASC" }, { idx: 1, dir: "ASC" }, { idx: 2, dir: "DESC" }],
      columns: [
        { label: "[hash]", role: "sys", dir: "ASC" }, { label: "sensor_id", role: "sh", dir: "ASC" }, { label: "ts", role: "cl", dir: "DESC" }, { label: "value", role: "" }, { label: "unit", role: "" }, { label: "status", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", range: "0x0000–0x5555", rows: [
            { data: ["0x2142", "S-202", "11:00:00", "45.0", "°C", "WARNING"] }
          ]
        },
        {
          id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
            { data: ["0x80CA", "S-101", "12:00:00", "24.5", "°C", "Normal"] },
            { data: ["0x80CA", "S-101", "11:30:00", "23.8", "°C", "Normal"] },
            { data: ["0x80CA", "S-101", "10:00:00", "22.1", "°C", "Normal"] }
          ]
        },
        {
          id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { data: ["0xDDA3", "S-303", "09:00:00", "18.5", "°C", "Normal"] }
          ]
        }
      ]
    },
    callout: { type: "warn", icon: "⚡", text: "<b>DESC clustering</b> stores newest entries first — no sorting needed at read time. <code>SELECT * FROM readings WHERE sensor_id='S-101' LIMIT 5</code> returns the 5 most recent instantly." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> sensor_readings (
    <span class="sh-key">sensor_id</span> <span class="sql-type">TEXT</span>,
    <span class="cl-key">ts</span>        <span class="sql-type">TIMESTAMP</span>,
    value     <span class="sql-type">FLOAT</span>,
    unit      <span class="sql-type">TEXT</span>,
    status    <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> (<span class="sh-key">sensor_id HASH</span>, <span class="cl-key">ts DESC</span>)
);

<span class="sql-comment">-- DESC = newest first. No sorting required.</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> sensor_readings
<span class="sql-kw">WHERE</span> sensor_id = <span class="sql-str">'S-101'</span> <span class="sql-kw">LIMIT</span> 5;` },
    guidedTour: [
      { text: "Enter a status message for Sensor S-101.", element: "#sim-input-val" },
      { text: "Click <b>Insert Row</b>. Rows land in Tablet 2.", element: ".primary-btn" },
      { text: "Use <b>Auto Generate</b> to observe the 'Newest First' ordering in action.", element: ".secondary-btn" },
      { text: "Notice how the latest timestamp always appears at the top of the tablet list.", element: ".tablet-card" }
    ]
  },

  "hash-comp-multi": {
    group: "Hash Sharding", icon: "🔀", title: "Multi-Key Hash", subtitle: "Multi-column hash sharding",
    description: "Multiple columns form the sharding key together — hash is computed on the combination. Prevents hotspots when a single column has skewed cardinality.",
    inputPlaceholder: "Enter event name...",
    scanDefault: "tenant = 'Acme'",
    legend: [
      { type: "sharding", label: "(tenant, app_id)", explain: "Composite sharding key — HASH sharded by combination of (tenant and app_id) determines tablet" },
      { type: "clustering", label: "event_time ASC", explain: "Clustering key — events sorted within each partition" }
    ],
    generateRow: (v) => [["Acme", "Globex"][Math.floor(Math.random() * 2)], ["web", "api", "mobile"][Math.floor(Math.random() * 3)], new Date().toISOString().slice(11, 19), v || "Event", ["OK", "FAIL"][Math.floor(Math.random() * 2)]],
    visual: {
      type: "sharding-view", shardingType: "HASH",
      sortConfig: [{ idx: 0, dir: "ASC" }, { idx: 1, dir: "ASC" }, { idx: 2, dir: "ASC" }, { idx: 3, dir: "ASC" }],
      columns: [
        { label: "[hash]", role: "sys", dir: "ASC" }, { label: "tenant", role: "sh", dir: "ASC" }, { label: "app_id", role: "sh", dir: "ASC" }, { label: "event_time", role: "cl", dir: "ASC" }, { label: "event", role: "" }, { label: "status", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", range: "0x0000–0x5555", rows: [
            { data: ["0x34C2", "Acme", "web", "08:00:00", "Login", "OK"] },
            { data: ["0x34C2", "Acme", "web", "09:30:00", "Purchase", "OK"] }
          ]
        },
        {
          id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
            { data: ["0x7F1A", "Acme", "api", "07:00:00", "Sync", "FAIL"] },
            { data: ["0x7F1A", "Acme", "api", "10:00:00", "Healthcheck", "OK"] }
          ]
        },
        {
          id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { data: ["0xD4E5", "Globex", "mobile", "09:00:00", "Push sent", "OK"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> audit_events (
    <span class="sh-key">tenant</span>     <span class="sql-type">TEXT</span>,
    <span class="sh-key">app_id</span>     <span class="sql-type">TEXT</span>,
    <span class="cl-key">event_time</span> <span class="sql-type">TIMESTAMP</span>,
    event      <span class="sql-type">TEXT</span>,
    status     <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> ((<span class="sh-key">tenant, app_id</span>) <span class="sh-key">HASH</span>, <span class="cl-key">event_time ASC</span>)
);

<span class="sql-comment">-- Hash is on the COMBINATION of tenant + app_id</span>
<span class="sql-comment">-- Different (tenant, app_id) pairs go to different tablets</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> audit_events
<span class="sql-kw">WHERE</span> tenant = <span class="sql-str">'Acme'</span> <span class="sql-kw">AND</span> app_id = <span class="sql-str">'web'</span>;` },
    guidedTour: [
      { text: "Multi-column hashing: <code>(tenant, app_id)</code> together determine the tablet.", element: "#visual-render-area" },
      { text: "Try inserting rows with the same Tenant but different Apps.", element: "#sim-input-val" },
      { text: "Notice how they spread across tablets because the whole tuple is hashed.", element: ".tablet-card" }
    ]
  },



  "range-single": {
    group: "Range Sharding", icon: "📏", title: "Range: Single Key", subtitle: "Auto-splits as data grows",
    description: "Data is range-sharded on actual values. It starts as a single tablet and automatically splits based on the mid of the entire range key as data grows. Excellent for range queries.",
    inputPlaceholder: "Enter product code (A100, M200, Z300)...",
    scanDefault: "product_id BETWEEN 'B000' AND 'M999'",
    legend: [
      { type: "clustering", label: "product_id ASC", explain: "Range-sharded — value determines tablet, sorted globally across tablets" }
    ],
    generateRow: (v) => [v || "P" + Math.floor(Math.random() * 999), ["Electronics", "Books", "Home"][Math.floor(Math.random() * 3)], (Math.random() * 100).toFixed(2), ["In Stock", "Low", "Out"][Math.floor(Math.random() * 3)], ["TechCo", "PubCo", "HomeCo"][Math.floor(Math.random() * 3)]],
    visual: {
      type: "sharding-view", shardingType: "RANGE",
      sortConfig: [{ idx: 0, dir: "ASC" }],
      columns: [
        { label: "product_id", role: "cl", dir: "ASC" }, { label: "category", role: "" }, { label: "price", role: "" }, { label: "status", role: "" }, { label: "supplier", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", rows: [
            { data: ["A001", "Electronics", "29.99", "In Stock", "TechCo"] },
            { data: ["B050", "Books", "15.00", "In Stock", "PubCo"] },
            { data: ["G200", "Home", "45.50", "Low", "HomeCo"] },
            { data: ["M100", "Home", "22.00", "In Stock", "HomeCo"] },
            { data: ["R500", "Electronics", "89.99", "In Stock", "TechCo"] },
            { data: ["X999", "Books", "9.99", "Low", "PubCo"] }
          ]
        }
      ]
    },
    callout: { type: "warn", icon: "⚠️", text: "<b>Hotspot risk:</b> If keys are monotonically increasing (e.g. timestamps, serial IDs), all writes go to the last tablet. Use HASH sharding or synthetic shard keys for such columns." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
    <span class="cl-key">product_id</span> <span class="sql-type">TEXT PRIMARY KEY ASC</span>,
    category   <span class="sql-type">TEXT</span>,
    price      <span class="sql-type">DECIMAL</span>,
    status     <span class="sql-type">TEXT</span>,
    supplier   <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- ASC/DESC on PK → Range sharding in YugabyteDB</span>
<span class="sql-comment">-- Initially starts as 1 tablet and splits automatically</span>
<span class="sql-comment">-- Splits happen based on data size (e.g. at the midpoint)</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> products
<span class="sql-kw">WHERE</span> product_id <span class="sql-kw">BETWEEN</span> <span class="sql-str">'B000'</span> <span class="sql-kw">AND</span> <span class="sql-str">'G999'</span>;` },
    guidedTour: [
      { text: "Range sharding stores data in actual value order.", element: "#visual-render-area" },
      { text: "Type 'Z999' in the input box and click <b>Insert Row</b>.", element: "#sim-input-val" },
      { text: "Notice how it appends to the bottom of the list. This maintains global sorting.", element: ".tablet-card" },
      { text: "Try <b>Auto Generate</b> to see how range-scans remain contiguous across rows.", element: ".secondary-btn" }
    ]
  },

  "range-pre-split": {
    group: "Range Sharding", icon: "📐", title: "Range: Pre-split", subtitle: "SPLIT AT VALUES",
    description: "Range sharding with manually defined splits. Prevents initial write hotspots by pre-allocating tablets for specific ranges. Global order is maintained across tablets.",
    inputPlaceholder: "Enter product code (A100, M200, Z300)...",
    scanDefault: "product_id BETWEEN 'A001' AND 'J000'",
    legend: [
      { type: "clustering", label: "product_id ASC", explain: "Range-sharded — tablets pre-created using SPLIT AT" }
    ],
    generateRow: (v) => [v || "P" + Math.floor(Math.random() * 999), ["Electronics", "Books", "Home"][Math.floor(Math.random() * 3)], (Math.random() * 100).toFixed(2), ["In Stock", "Low", "Out"][Math.floor(Math.random() * 3)], ["TechCo", "PubCo", "HomeCo"][Math.floor(Math.random() * 3)]],
    visual: {
      type: "sharding-view", shardingType: "RANGE",
      sortConfig: [{ idx: 0, dir: "ASC" }],
      columns: [
        { label: "product_id", role: "cl", dir: "ASC" }, { label: "category", role: "" }, { label: "price", role: "" }, { label: "status", role: "" }, { label: "supplier", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", range: "[A, J)", rows: [
            { data: ["A001", "Electronics", "29.99", "In Stock", "TechCo"] },
            { data: ["B050", "Books", "15.00", "In Stock", "PubCo"] },
            { data: ["G200", "Home", "45.50", "Low", "HomeCo"] }
          ]
        },
        {
          id: "Tablet 2", range: "[J, R)", rows: [
            { data: ["M100", "Home", "22.00", "In Stock", "HomeCo"] }
          ]
        },
        {
          id: "Tablet 3", range: "[R, Z]", rows: [
            { data: ["R500", "Electronics", "89.99", "In Stock", "TechCo"] },
            { data: ["X999", "Books", "9.99", "Low", "PubCo"] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "✂️", text: "<b>Pre-splitting</b> allows you to distribute load immediately. Use <code>SPLIT AT VALUES</code> for Range sharding or <code>SPLIT INTO N TABLETS</code> for Hash sharding to avoid initial hotspots." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
    <span class="cl-key">product_id</span> <span class="sql-type">TEXT PRIMARY KEY ASC</span>,
    category   <span class="sql-type">TEXT</span>,
    price      <span class="sql-type">DECIMAL</span>,
    status     <span class="sql-type">TEXT</span>,
    supplier   <span class="sql-type">TEXT</span>
) <span class="sql-kw">SPLIT AT VALUES</span> ((<span class="sql-str">'J'</span>), (<span class="sql-str">'R'</span>));

<span class="sql-comment">-- Pre-creates 3 tablets: (-inf, 'J'), ['J', 'R'), ['R', inf)</span>
<span class="sql-comment">-- Prevents write hotspots for balanced key distributions</span>` },
    guidedTour: [
      { text: "Pre-splitting creates multiple tablets immediately, avoiding the 'all-writes-to-one' problem.", element: "#visual-render-area" },
      { text: "Try inserting 'K500' and 'U100'.", element: "#sim-input-val" },
      { text: "Watch how they route to different tablets based on their value ranges.", element: ".tablet-card" },
      { text: "Use <b>Auto Generate</b> to fill all three tablets instantly.", element: ".secondary-btn" }
    ]
  },

  "range-composite": {
    group: "Range Sharding", icon: "📊", title: "Range: Composite", subtitle: "Multi-column range sharding",
    description: "Both columns are range-sharded. Data starts in a single tablet and as it grows, it gets automatically split based on the mid of the entire range key. Globally sorted ASC by first column, then DESC by second.",
    inputPlaceholder: "Enter sensor ID (S-100, S-600)...",
    scanDefault: "sensor_id = 'S-100'",
    legend: [
      { type: "clustering", label: "sensor_id ASC", explain: "First range key — tablets split by sensor ID ranges" },
      { type: "clustering", label: "ts DESC", explain: "Second range key — newest readings first within each sensor" }
    ],
    generateRow: (v) => {
      const h = String(Math.floor(Math.random() * 24)).padStart(2, '0');
      const m = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const s = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      return [v || "S-" + String(Math.floor(Math.random() * 999)).padStart(3, '0'), `${h}:${m}:${s}`, (20 + Math.random() * 15).toFixed(1), "°C", "OK"];
    },
    visual: {
      type: "sharding-view", shardingType: "RANGE",
      sortConfig: [{ idx: 0, dir: "ASC" }, { idx: 1, dir: "DESC" }],
      columns: [
        { label: "sensor_id", role: "cl", dir: "ASC" }, { label: "ts", role: "cl", dir: "DESC" }, { label: "value", role: "" }, { label: "unit", role: "" }, { label: "check", role: "" }
      ]
    },
    initialState: {
      tablets: [
        {
          id: "Tablet 1", rows: [
            { data: ["S-100", "12:00:00", "24.5", "°C", "OK"] },
            { data: ["S-100", "11:30:00", "23.8", "°C", "OK"] },
            { data: ["S-200", "10:00:00", "25.1", "°C", "OK"] },
            { data: ["S-600", "11:00:00", "45.0", "°C", "WARN"] },
            { data: ["S-600", "09:00:00", "42.3", "°C", "OK"] },
            { data: ["S-800", "10:30:00", "33.2", "°C", "OK"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> metrics (
    <span class="cl-key">sensor_id</span> <span class="sql-type">TEXT</span>,
    <span class="cl-key">ts</span>        <span class="sql-type">TIMESTAMP</span>,
    value     <span class="sql-type">FLOAT</span>,
    unit      <span class="sql-type">TEXT</span>,
    check_status <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> (<span class="cl-key">sensor_id ASC</span>, <span class="cl-key">ts DESC</span>)
);

<span class="sql-comment">-- Initially starts as 1 tablet and splits automatically</span>
<span class="sql-comment">-- Splits happen based on data size (e.g. at the midpoint)</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> metrics
<span class="sql-kw">WHERE</span> sensor_id = <span class="sql-str">'S-100'</span>
<span class="sql-kw">ORDER BY</span> ts <span class="sql-kw">DESC</span> <span class="sql-kw">LIMIT</span> 10;` },
    guidedTour: [
      { text: "Composite range sharding sorts by the first column, then the second.", element: "#visual-render-area" },
      { text: "Insert 'S-100' with a new timestamp.", element: "#sim-input-val" },
      { text: "Observe how it clusters with existing 'S-100' data but follows the DESC time order.", element: ".tablet-card" },
      { text: "Click <b>Auto Generate</b> to see how sensor groups pack together across tablets.", element: ".secondary-btn" }
    ]
  },

  "hash-data-org": {
    group: "Range Sharding", icon: "📦", title: "Data Organization: ASC vs DESC", subtitle: "Physical storage order comparison",
    description: "Compare how changing clustering key order (ASC vs DESC) changes the physical row storage. DESC is ideal for 'latest N' queries — no re-sorting needed at read time.",
    legend: [
      { type: "sharding", label: "tenant_id", explain: "Sharding key — same in both blocks" },
      { type: "clustering", label: "log_time", explain: "Clustering key — ASC sorts low→high, DESC sorts high→low" }
    ],
    visual: { type: "data-org" },
    generateRow: (v) => {
      const t = new Date().toISOString().slice(11, 19);
      return [
        { blockIdx: 0, key: "Tenant-A", cl: t, vals: [v || "New log entry", "INFO"] },
        { blockIdx: 1, key: "Tenant-A", cl: t, vals: [v || "New log entry", "INFO"] }
      ];
    },
    inputPlaceholder: "Enter log message...",
    initialState: {
      blocks: [
        {
          id: "ASC Organization (Low → High)", dir: "ASC", desc: "PRIMARY KEY (tenant_id HASH, log_time ASC)", items: [
            { key: "Tenant-A", rows: [{ cl: "08:00:00", vals: ["Server start", "INFO"] }, { cl: "09:00:00", vals: ["Request handled", "INFO"] }, { cl: "10:00:00", vals: ["High memory", "WARN"] }] },
            { key: "Tenant-B", rows: [{ cl: "07:30:00", vals: ["Batch started", "INFO"] }, { cl: "08:45:00", vals: ["Batch done", "INFO"] }] }
          ]
        },
        {
          id: "DESC Organization (High → Low)", dir: "DESC", desc: "PRIMARY KEY (tenant_id HASH, log_time DESC)", items: [
            { key: "Tenant-A", rows: [{ cl: "10:00:00", vals: ["High memory", "WARN"] }, { cl: "09:00:00", vals: ["Request handled", "INFO"] }, { cl: "08:00:00", vals: ["Server start", "INFO"] }] },
            { key: "Tenant-B", rows: [{ cl: "08:45:00", vals: ["Batch done", "INFO"] }, { cl: "07:30:00", vals: ["Batch started", "INFO"] }] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "💡", text: "With <b>DESC</b>, the latest entries are at the top of the SSTable. <code>LIMIT 10</code> reads only the first 10 entries — zero sorting overhead." },
    guide: {
      richSql: `<span class="sql-comment">-- ASC: oldest entries first in storage</span>
<span class="sql-kw">CREATE TABLE</span> logs_asc (
    <span class="sh-key">tenant_id</span> <span class="sql-type">TEXT</span>,
    <span class="cl-key">log_time</span>  <span class="sql-type">TIMESTAMP</span>,
    message   <span class="sql-type">TEXT</span>,
    level     <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> (<span class="sh-key">tenant_id HASH</span>, <span class="cl-key">log_time ASC</span>)
);

<span class="sql-comment">-- DESC: newest entries first — ideal for "latest N"</span>
<span class="sql-kw">CREATE TABLE</span> logs_desc (
    <span class="sh-key">tenant_id</span> <span class="sql-type">TEXT</span>,
    <span class="cl-key">log_time</span>  <span class="sql-type">TIMESTAMP</span>,
    message   <span class="sql-type">TEXT</span>,
    level     <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> (<span class="sh-key">tenant_id HASH</span>, <span class="cl-key">log_time DESC</span>)
);

<span class="sql-comment">-- Fast: no sorting, just read first N rows</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> logs_desc
<span class="sql-kw">WHERE</span> tenant_id = <span class="sql-str">'Tenant-A'</span> <span class="sql-kw">LIMIT</span> 10;` },
    guidedTour: [
      { text: "Compare how data is physically stored in memory vs on disk.", element: "#visual-render-area" },
      { text: "ASC (left) puts oldest data first; DESC (right) puts newest data first.", element: ".tablet-card" },
      { text: "Try <b>Auto Generate</b> to see the contrasting pack patterns.", element: ".secondary-btn" }
    ]
  }
};


// Index scenarios — using tableTablets / indexTablets for multi-tablet view
Object.assign(SCENARIOS, {
  "idx-hash-single": {
    group: "Indexes", icon: "🔗", title: "Hash Index: Single Key", subtitle: "Secondary index → table lookup",
    description: "A hash-sharded secondary index on a single column. Index entries store the indexed column + PK pointer. Queries require 2 RPCs: index scan → main table fetch.",
    inputPlaceholder: "Enter email (e.g. alice@co.com)...",
    scanDefault: "email = 'alice@co.com'",
    legend: [
      { type: "sharding", label: "email (Index)", explain: "Hash-sharded index key — determines index tablet" },
      { type: "ptr", label: "user_id (Ptr)", explain: "Pointer back to the main table's primary key" },
      { type: "data", label: "Table data", explain: "Full row data in main table, fetched via 2nd RPC" }
    ],
    generateRow: (v) => {
      const pk = "user-" + Math.floor(Math.random() * 999);
      return {
        index: { fields: [v, pk] },
        table: { fields: [pk, v, v.split('@')[0], ["US", "EU", "APAC"][Math.floor(Math.random() * 3)], "Active"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "email", role: "sh", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "user_id (PK)", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["user-241", "alice@co.com", "Alice", "US", "Active"] },
            { fields: ["user-507", "dan@co.com", "Dan", "EU", "Active"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["user-892", "bob@co.com", "Bob", "EU", "Pending"] }
          ]
        },
        {
          id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["user-105", "carol@co.com", "Carol", "APAC", "Active"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["0x21F3", "alice@co.com", "user-241"] },
            { fields: ["0x4B12", "bob@co.com", "user-892"] }
          ]
        },
        {
          id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["0x7D3A", "carol@co.com", "user-105"] }
          ]
        },
        {
          id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["0xB321", "dan@co.com", "user-507"] }
          ]
        }
      ]
    },
    callout: { type: "warn", icon: "⚠️", text: "<b>2-step RPC:</b> 1) Query index tablet to find PK pointer. 2) Query main table tablet to fetch the full row. Use a <b>covering index</b> (INCLUDE) to avoid the 2nd RPC." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="sh-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    email   <span class="sql-type">TEXT</span>,
    name    <span class="sql-type">TEXT</span>,
    region  <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_users_email
  <span class="sql-kw">ON</span> users (<span class="sh-key">email HASH</span>);

<span class="sql-comment">-- Execution plan:</span>
<span class="sql-comment">-- 1. Index Scan → find user_id for email</span>
<span class="sql-comment">-- 2. Table Fetch → get full row by user_id</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'alice@co.com'</span>;` },
    guidedTour: [
      { text: "Notice the layout: Index Tablets (left) and Table Tablets (right).", element: ".index-mapping-container" },
      { text: "Insert a new email address.", element: "#sim-input-val" },
      { text: "Watch as <b>two rows</b> are created: one in the Index and one in the Table.", element: ".tablet-card" },
      { text: "The index row contains a 'Pointer' back to the table's Primary Key.", element: ".ptr-bubble" }
    ]
  },

  "idx-hash-composite": {
    group: "Indexes", icon: "🧩", title: "Hash+Range Index", subtitle: "Hash shard + range clustering",
    description: "Index with hash sharding key + range clustering key. Index data distributed by hash, sorted within each partition. Efficient for equality + range lookups.",
    inputPlaceholder: "Enter order total...",
    scanDefault: "customer_id = 'cust-1'",
    legend: [
      { type: "sharding", label: "customer_id (Hash)", explain: "Index sharding key — distributes index entries" },
      { type: "clustering", label: "order_date DESC", explain: "Index clustering key — sorted newest first" },
      { type: "ptr", label: "order_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "ord-" + Math.floor(Math.random() * 9999);
      const cust = "cust-" + Math.floor(Math.random() * 5 + 1);
      const dt = "2024-0" + (Math.floor(Math.random() * 9) + 1) + "-" + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      return {
        index: { fields: [cust, dt, pk] },
        table: { fields: [pk, cust, dt, v || String((Math.random() * 200).toFixed(2)), "shipped"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "customer_id", role: "sh", dir: "ASC" }, { label: "order_date", role: "cl", dir: "DESC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "order_id (PK)", role: "pk" }, { label: "customer_id", role: "" }, { label: "order_date", role: "" }, { label: "total", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["ord-4421", "cust-1", "2024-03-15", "129.99", "shipped"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["ord-1102", "cust-1", "2024-01-10", "49.99", "delivered"] },
            { fields: ["ord-3350", "cust-2", "2024-02-20", "89.50", "shipped"] }
          ]
        },
        {
          id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["ord-5501", "cust-3", "2024-03-01", "210.00", "pending"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["0x1A2B", "cust-1", "2024-03-15", "ord-4421"] },
            { fields: ["0x1A2B", "cust-1", "2024-01-10", "ord-1102"] }
          ]
        },
        {
          id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["0x6C7D", "cust-2", "2024-02-20", "ord-3350"] }
          ]
        },
        {
          id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["0xDF4E", "cust-3", "2024-03-01", "ord-5501"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
    <span class="pk-key">order_id</span>    <span class="sql-type">TEXT PRIMARY KEY</span>,
    customer_id <span class="sql-type">TEXT</span>,
    order_date  <span class="sql-type">DATE</span>,
    total       <span class="sql-type">DECIMAL</span>,
    status      <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_orders_cust_date
  <span class="sql-kw">ON</span> orders (
    <span class="sh-key">customer_id HASH</span>,
    <span class="cl-key">order_date DESC</span>
);

<span class="sql-comment">-- Equality on hash key + range on clustering key</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> customer_id = <span class="sql-str">'cust-1'</span>
  <span class="sql-kw">AND</span> order_date > <span class="sql-str">'2024-01-01'</span>;` },
    guidedTour: [
      { text: "Composite indexes shard by the first column and sort by the second.", element: ".index-area" },
      { text: "Insert a total value and observe the index placement.", element: "#sim-input-val" },
      { text: "Notice how all orders for the same customer land in the same tablet, but are sorted by date (DESC).", element: ".tablet-card" }
    ]
  },

  "idx-range-single": {
    group: "Indexes", icon: "📐", title: "Range Index: Single Key", subtitle: "Auto-splits as data grows",
    description: "Range-sharded index on a single column. Starts as a single tablet and automatically splits into more as data grows. Efficient for range scans and ORDER BY.",
    inputPlaceholder: "Enter price...",
    scanDefault: "price BETWEEN 20 AND 100",
    legend: [
      { type: "clustering", label: "price ASC", explain: "Range-sharded index key — sorted globally" },
      { type: "ptr", label: "product_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "prod-" + Math.floor(Math.random() * 999);
      const price = v || String((Math.random() * 200).toFixed(2));
      return {
        index: { fields: [price, pk] },
        table: { fields: [pk, "Gadget-" + Math.floor(Math.random() * 99), price, "In Stock"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "price", role: "cl", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "product_id (PK)", role: "pk" }, { label: "name", role: "" }, { label: "price", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x7FFF", rows: [
            { fields: ["prod-501", "Budget Widget", "9.99", "In Stock"] },
            { fields: ["prod-102", "Standard Kit", "29.99", "In Stock"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x8000–0xFFFF", rows: [
            { fields: ["prod-330", "Pro Suite", "89.99", "Low"] },
            { fields: ["prod-210", "Premium Pack", "149.99", "In Stock"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", rows: [
            { fields: ["9.99", "prod-501"] },
            { fields: ["29.99", "prod-102"] },
            { fields: ["89.99", "prod-330"] },
            { fields: ["149.99", "prod-210"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
    <span class="pk-key">product_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    name       <span class="sql-type">TEXT</span>,
    price      <span class="sql-type">DECIMAL</span>,
    status     <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_products_price
  <span class="sql-kw">ON</span> products (<span class="cl-key">price ASC</span>);

<span class="sql-comment">-- Initially starts as 1 tablet and splits automatically</span>` },
    guidedTour: [
      { text: "Range indexes are physically sorted by the indexed column.", element: ".index-area" },
      { text: "Type a price like '10.50' and watch the index placement.", element: "#sim-input-val" },
      { text: "Unlike Hash indexes, Range indexes start as a single tablet and split as they grow.", element: ".index-tablet" }
    ]
  },

  "idx-range-single-split": {
    group: "Indexes", icon: "✂️", title: "Range Index: Pre-split", subtitle: "SPLIT AT VALUES",
    description: "Range-sharded index with pre-defined split points. Distributes index write load immediately across multiple tablets. Ideal for preventing hotspots on monotonic data.",
    inputPlaceholder: "Enter price...",
    scanDefault: "price BETWEEN 20 AND 100",
    legend: [
      { type: "clustering", label: "price ASC", explain: "Range-sharded index key — pre-split across tablets" },
      { type: "ptr", label: "product_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "prod-" + Math.floor(Math.random() * 999);
      const price = v || String((Math.random() * 200).toFixed(2));
      return {
        index: { fields: [price, pk] },
        table: { fields: [pk, "Gadget-" + Math.floor(Math.random() * 99), price, "In Stock"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "price", role: "cl", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "product_id (PK)", role: "pk" }, { label: "name", role: "" }, { label: "price", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x7FFF", rows: [
            { fields: ["prod-501", "Budget Widget", "9.99", "In Stock"] },
            { fields: ["prod-102", "Standard Kit", "29.99", "In Stock"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x8000–0xFFFF", rows: [
            { fields: ["prod-330", "Pro Suite", "89.99", "Low"] },
            { fields: ["prod-210", "Premium Pack", "149.99", "In Stock"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", range: "(-∞, 50)", rows: [
            { fields: ["9.99", "prod-501"] },
            { fields: ["29.99", "prod-102"] }
          ]
        },
        {
          id: "Idx Tablet 2", range: "[50, 150)", rows: [
            { fields: ["89.99", "prod-330"] }
          ]
        },
        {
          id: "Idx Tablet 3", range: "[150, ∞)", rows: [
            { fields: ["149.99", "prod-210"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
    <span class="pk-key">product_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    name       <span class="sql-type">TEXT</span>,
    price      <span class="sql-type">DECIMAL</span>,
    status     <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_products_price
  <span class="sql-kw">ON</span> products (<span class="cl-key">price ASC</span>)
  <span class="sql-kw">SPLIT AT VALUES</span> ((50), (150));

<span class="sql-comment">-- Pre-creates tablets for ranges: (-∞, 50), [50, 150), [150, ∞)</span>` },
    guidedTour: [
      { text: "Use pre-splitting to distribute index write load across multiple nodes immediately.", element: ".index-area" },
      { text: "Insert a high price like '175.00'.", element: "#sim-input-val" },
      { text: "Watch it route to Idx Tablet 3 based on the pre-defined range boundaries.", element: ".index-tablet" }
    ]
  },

  "idx-range-composite": {
    group: "Indexes", icon: "📉", title: "Range Index: Composite", subtitle: "Multi-column range index",
    description: "Range index on multiple columns. Starts as a single tablet and automatically splits as it grows. First column determines global sort, second column sorts within groups. Good for multi-column range predicates.",
    inputPlaceholder: "Enter event type...",
    scanDefault: "region = 'US'",
    legend: [
      { type: "clustering", label: "region ASC", explain: "First range key in index" },
      { type: "clustering", label: "created_at DESC", explain: "Second range key — newest first within region" },
      { type: "ptr", label: "order_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "ord-" + Math.floor(Math.random() * 9999);
      const region = ["US", "EU", "APAC"][Math.floor(Math.random() * 3)];
      const dt = "2024-0" + (Math.floor(Math.random() * 9) + 1) + "-" + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      return {
        index: { fields: [region, dt, pk] },
        table: { fields: [pk, v || "Widget", "49.99", "shipped"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "region", role: "cl", dir: "ASC" }, { label: "created_at", role: "cl", dir: "DESC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "order_id (PK)", role: "pk" }, { label: "product", role: "" }, { label: "total", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x7FFF", rows: [
            { fields: ["ord-8812", "Laptop", "899.00", "shipped"] },
            { fields: ["ord-7701", "Monitor", "349.00", "delivered"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x8000–0xFFFF", rows: [
            { fields: ["ord-9903", "Keyboard", "79.99", "shipped"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", rows: [
            { fields: ["APAC", "2024-03-20", "ord-8812"] },
            { fields: ["EU", "2024-03-18", "ord-7701"] },
            { fields: ["US", "2024-03-25", "ord-9903"] }
          ]
        }
      ]
    },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
    <span class="pk-key">order_id</span>   <span class="sql-type">TEXT PRIMARY KEY</span>,
    product    <span class="sql-type">TEXT</span>,
    total      <span class="sql-type">DECIMAL</span>,
    status     <span class="sql-type">TEXT</span>,
    region     <span class="sql-type">TEXT</span>,
    created_at <span class="sql-type">TIMESTAMP</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_orders_region_date
  <span class="sql-kw">ON</span> orders (
    <span class="cl-key">region ASC</span>,
    <span class="cl-key">created_at DESC</span>
);

<span class="sql-comment">-- Multi-column range scan:</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> region = <span class="sql-str">'US'</span>
  <span class="sql-kw">AND</span> created_at > <span class="sql-str">'2024-01-01'</span>
<span class="sql-kw">ORDER BY</span> created_at <span class="sql-kw">DESC</span>;` },
    guidedTour: [
      { text: "Range composite indexes maintain strict global order across columns.", element: ".index-area" },
      { text: "Observe how 'US' orders are grouped together and sorted by date (DESC).", element: ".tablet-card" },
      { text: "This allows for extremely efficient range queries on both columns.", element: ".index-row" }
    ]
  },

  "idx-covering": {
    group: "Indexes", icon: "✨", title: "Covering Index (INCLUDE)", subtitle: "Index-only scan, no 2nd RPC",
    description: "INCLUDE columns are stored in the index but not used for sharding or sorting. Queries needing only indexed + included columns skip the 2nd RPC to the main table entirely.",
    inputPlaceholder: "Enter email...",
    scanDefault: "email = 'alice@co.com'",
    legend: [
      { type: "sharding", label: "email (Hash)", explain: "Index sharding key" },
      { type: "include", label: "name, region (INCLUDE)", explain: "Covering columns — stored in index, avoids table fetch" },
      { type: "ptr", label: "user_id (Ptr)", explain: "PK pointer (still stored, but no RPC needed)" }
    ],
    generateRow: (v) => {
      const pk = "user-" + Math.floor(Math.random() * 999);
      const name = v.split('@')[0] || v;
      const region = ["US", "EU", "APAC"][Math.floor(Math.random() * 3)];
      return {
        index: { fields: [v, name, region, pk] },
        table: { fields: [pk, v, name, region, "Active"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: true,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "email", role: "sh", dir: "ASC" }, { label: "name", role: "inc" }, { label: "region", role: "inc" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "user_id (PK)", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["user-241", "alice@co.com", "Alice", "US", "Active"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["user-507", "dan@co.com", "Dan", "EU", "Pending"] }
          ]
        },
        {
          id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["user-892", "bob@co.com", "Bob", "EU", "Active"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["0x21F3", "alice@co.com", "Alice", "US", "user-241"] },
            { fields: ["0x4B12", "bob@co.com", "Bob", "EU", "user-892"] }
          ]
        },
        {
          id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["0x7D3A", "dan@co.com", "Dan", "EU", "user-507"] }
          ]
        },
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [] }
      ]
    },
    callout: { type: "info", icon: "✅", text: "<b>Index-only scan!</b> Since name and region are INCLUDEd, <code>SELECT name, region FROM users WHERE email = ?</code> is satisfied entirely from the index. No 2nd RPC to the main table." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    email   <span class="sql-type">TEXT</span>,
    name    <span class="sql-type">TEXT</span>,
    region  <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_email_cover
  <span class="sql-kw">ON</span> users (<span class="sh-key">email HASH</span>)
  <span class="sql-kw">INCLUDE</span> (<span class="inc-key">name, region</span>);

<span class="sql-comment">-- Index-only scan: no main table access needed</span>
<span class="sql-kw">SELECT</span> name, region <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'alice@co.com'</span>;

<span class="sql-comment">-- ✅ Satisfied entirely from the index</span>
<span class="sql-comment">-- ❌ SELECT * still needs table fetch (status not in index)</span>` },
    guidedTour: [
      { text: "Look closely at the Index Tablets (left).", element: ".index-area" },
      { text: "The index now has extra columns (name, region) duplicated from the main table.", element: ".index-row" },
      { text: "This allows for <b>Index Only Scans</b> — no second RPC needed to the main table!", element: ".table-area" },
      { text: "Click <b>Auto Generate</b> to see the covering data distribution.", element: ".secondary-btn" }
    ]
  },

  "idx-partial": {
    group: "Indexes", icon: "✂️", title: "Partial Index", subtitle: "Conditional indexing (WHERE clause)",
    description: "Only indexes rows matching a WHERE condition. Reduces index size and avoids hotspots from dominant values. Ideal for soft-delete patterns and skewed columns.",
    inputPlaceholder: "Enter email...",
    scanDefault: "email = 'alice@co.com'",
    legend: [
      { type: "sharding", label: "email (Hash)", explain: "Index key for filtered rows only" },
      { type: "ptr", label: "user_id (Ptr)", explain: "PK pointer — only for rows matching WHERE clause" }
    ],
    generateRow: (v) => {
      const pk = "user-" + Math.floor(Math.random() * 999);
      const isActive = Math.random() > 0.35;
      const status = isActive ? "active" : "inactive";
      const name = v.split('@')[0] || v;
      return {
        index: { fields: [v, pk] },
        table: { fields: [pk, v, status, name], _excluded: !isActive }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      partialFilter: "status = 'active'",
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "email", role: "sh", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "user_id (PK)", role: "pk" }, { label: "email", role: "" }, { label: "status", role: "" }, { label: "name", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["user-241", "alice@co.com", "active", "Alice"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["user-892", "bob@co.com", "inactive", "Bob"], _excluded: true },
            { fields: ["user-400", "dave@co.com", "inactive", "Dave"], _excluded: true }
          ]
        },
        {
          id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["user-105", "carol@co.com", "active", "Carol"] },
            { fields: ["user-601", "eve@co.com", "active", "Eve"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["0x21F3", "alice@co.com", "user-241"] }
          ]
        },
        {
          id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["0x7D3A", "carol@co.com", "user-105"] }
          ]
        },
        {
          id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["0xD4E5", "eve@co.com", "user-601"] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "📏", text: "<b>Smaller index:</b> Only active users are indexed (solid rows). Rows with status='inactive' are in the TABLE (struck through) but excluded from the INDEX — smaller index, faster scans, no hotspot from dominant values." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    email   <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>,
    name    <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_active_users
  <span class="sql-kw">ON</span> users (<span class="sh-key">email HASH</span>)
  <span class="sql-kw">WHERE</span> <span class="sql-fn">status = 'active'</span>;

<span class="sql-comment">-- Only rows with status='active' are in this index</span>
<span class="sql-comment">-- Rows with status='inactive' are excluded entirely</span>

<span class="sql-comment">-- ✅ Uses the partial index (condition matches):</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'alice@co.com'</span>
  <span class="sql-kw">AND</span> status = <span class="sql-str">'active'</span>;

<span class="sql-comment">-- ❌ Cannot use this index (no status filter):</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'alice@co.com'</span>;` },
    guidedTour: [
      { text: "Partial indexes only store rows that match a specific <code>WHERE</code> condition.", element: ".index-area" },
      { text: "Click <b>Auto Generate</b> several times.", element: ".secondary-btn" },
      { text: "Notice that only 'Active' rows get an entry in the Index Tablets. 'Inactive' rows are skipped.", element: ".table-area" }
    ]
  },

  "idx-bucket": {
    group: "Indexes", icon: "🪣", title: "Bucket Index (Hot Key Mitigation)", subtitle: "Synthetic shard key for monotonic columns",
    description: "Prevents write hotspots on monotonically increasing columns (timestamps, serial IDs) by adding a synthetic hash prefix. Distributes writes across N buckets with SPLIT AT VALUES.",
    inputPlaceholder: "Enter event description...",
    scanDefault: "created_at BETWEEN '2024-03-22' AND '2024-03-25'",
    legend: [
      { type: "sharding", label: "bucket (Synthetic)", explain: "hex(hash(created_at)) % 3 — distributes writes evenly" },
      { type: "clustering", label: "created_at DESC", explain: "Clustering key — newest first within each bucket" },
      { type: "ptr", label: "order_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "ord-" + Math.floor(Math.random() * 9999);
      const ts = "2024-03-" + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const bucket = Math.floor(Math.random() * 3);
      return {
        index: { fields: [String(bucket), ts, pk] },
        table: { fields: [pk, ts, v || "Purchase", String((Math.random() * 200).toFixed(2))] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "bucket", role: "sh", dir: "ASC" }, { label: "created_at", role: "cl", dir: "DESC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "order_id (PK)", role: "pk" }, { label: "created_at", role: "" }, { label: "event", role: "" }, { label: "total", role: "" }]
    },
    initialState: {
      tableTablets: [
        {
          id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
            { fields: ["ord-9901", "2024-03-25", "Purchase", "149.99"] }
          ]
        },
        {
          id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
            { fields: ["ord-7703", "2024-03-23", "Purchase", "89.50"] },
            { fields: ["ord-8802", "2024-03-24", "Refund", "29.99"] }
          ]
        },
        {
          id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
            { fields: ["ord-6604", "2024-03-22", "Return", "45.00"] }
          ]
        }
      ],
      indexTablets: [
        {
          id: "Bucket 0", range: "-∞ to 1", rows: [
            { fields: ["0", "2024-03-25", "ord-9901"] },
            { fields: ["0", "2024-03-22", "ord-6604"] }
          ]
        },
        {
          id: "Bucket 1", range: "1 to 2", rows: [
            { fields: ["1", "2024-03-24", "ord-8802"] }
          ]
        },
        {
          id: "Bucket 2", range: "2 to ∞", rows: [
            { fields: ["2", "2024-03-23", "ord-7703"] }
          ]
        }
      ]
    },
    callout: { type: "warn", icon: "🪣", text: "<b>Bucket indexing:</b> Without this, a range index on <code>created_at</code> creates a hotspot (all new writes → last tablet). The synthetic <code>yb_hash_code() % N</code> prefix spreads writes across N tablets. Use <code>SPLIT AT VALUES</code> to pre-create tablets." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
    <span class="pk-key">order_id</span>   <span class="sql-type">TEXT PRIMARY KEY</span>,
    created_at <span class="sql-type">TIMESTAMP</span>,
    event      <span class="sql-type">TEXT</span>,
    total      <span class="sql-type">DECIMAL</span>
);

<span class="sql-comment">-- ❌ WRONG: Range index on timestamp → hotspot</span>
<span class="sql-kw">CREATE INDEX</span> idx_orders_date
  <span class="sql-kw">ON</span> orders (created_at <span class="sql-kw">DESC</span>);

<span class="sql-comment">-- ✅ Bucket index: synthetic prefix distributes writes</span>
<span class="sql-kw">CREATE INDEX</span> idx_orders_bucketed <span class="sql-kw">ON</span> orders (
    (<span class="sh-key">yb_hash_code(created_at) % 3</span>) <span class="sql-kw">ASC</span>,
    <span class="cl-key">created_at DESC</span>
) <span class="sql-kw">SPLIT AT VALUES</span> ((1), (2));

<span class="sql-comment">-- N=3 buckets → 2 split points → 3 tablets from day one</span>
<span class="sql-comment">-- Query fans out across all 3 buckets automatically:</span>
<span class="sql-kw">WHERE</span> created_at >= <span class="sql-str">NOW()</span> - <span class="sql-str">INTERVAL '7 days'</span>;` },
    guidedTour: [
      { text: "Monotonic keys (like timestamps) usually create hotspots in range indexes.", element: ".index-area" },
      { text: "Bucket indexing (Hash + Range) splits the 'hot' key into multiple hash buckets.", element: ".index-row" },
      { text: "Click <b>Auto Generate</b> to see how orders for the same date are spread across multiple tablets.", element: ".tablet-card" }
    ]
  },
  "idx-expression": {
    group: "Indexes", icon: "ƒ(x)", title: "Expression Index", subtitle: "Index on computed value",
    description: "Indexes a computed expression rather than a raw column value. The expression is evaluated at write time and stored in the index. Enables case-insensitive lookups and function-based searches without touching the stored data.",
    inputPlaceholder: "Enter email (any case, e.g. Alice@Initech.Co)...",
    scanDefault: "lower(email) = 'alice@initech.co'",
    legend: [
      { type: "sharding", label: "lower(email) Hash", explain: "Expression evaluated at write time — lowercase value is hashed and stored in index" },
      { type: "ptr", label: "user_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "user-" + Math.floor(Math.random() * 999);
      const rawEmail = v || "User@Example.COM";
      const exprVal = rawEmail.toLowerCase();
      return {
        index: { fields: [exprVal, pk] },
        table: { fields: [pk, rawEmail, rawEmail.split('@')[0] || rawEmail, ["US", "EU", "APAC"][Math.floor(Math.random() * 3)], "Active"] },
        _exprNote: `lower(<b>"${rawEmail}"</b>) = <code>"${exprVal}"</code>`
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "lower(email)", role: "sh", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "user_id (PK)", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["user-241", "Alice@Initech.Co", "Alice", "US", "Active"] },
          { fields: ["user-517", "CAROL@CO.COM", "Carol", "APAC", "Active"] }
        ]},
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["user-893", "Bob@Globex.IO", "Bob", "EU", "Active"] }
        ]},
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["user-673", "EVE@ACME.COM", "Eve", "US", "Pending"] }
        ]}
      ],
      indexTablets: [
        { id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x1C68", "alice@initech.co", "user-241"] },
          { fields: ["0x2A21", "eve@acme.com", "user-673"] }
        ]},
        { id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x81DA", "carol@co.com", "user-517"] }
        ]},
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xDEE3", "bob@globex.io", "user-893"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "ƒ", text: "<b>Expression indexes</b> store computed values — not raw column data. <code>WHERE lower(email) = 'alice@initech.co'</code> uses this index even if the stored email is <code>'Alice@Initech.Co'</code>. The expression is evaluated at write time and the result is what gets hashed and stored." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    email   <span class="sql-type">TEXT</span>,
    name    <span class="sql-type">TEXT</span>,
    region  <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- Expression index: lower(email) is stored, not the raw email</span>
<span class="sql-kw">CREATE INDEX</span> idx_lower_email
  <span class="sql-kw">ON</span> users (<span class="sh-key">lower(email) HASH</span>);

<span class="sql-comment">-- ✅ Uses the index (expression matches WHERE clause):</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> lower(email) = <span class="sql-str">'alice@initech.co'</span>;

<span class="sql-comment">-- ❌ Cannot use this index (raw column, not the expression):</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'Alice@Initech.Co'</span>;` },
    guidedTour: [
      { text: "The Table stores the original email (any case). The Index stores <code>lower(email)</code> — a different value.", element: ".index-area" },
      { text: "Try inserting a mixed-case email like 'Bob@GLOBEX.IO'.", element: "#sim-input-val" },
      { text: "Watch: the table row keeps the original casing, but the index key is fully lowercased.", element: ".tablet-card" },
      { text: "Click <b>Auto Generate</b> to see varied cases all normalised in the index.", element: ".secondary-btn" }
    ]
  },

  "idx-unique": {
    group: "Indexes", icon: "🔒", title: "Unique Index", subtitle: "Cross-tablet uniqueness enforcement",
    description: "UNIQUE indexes guarantee no two rows share the same key value across all tablets. Every write must verify uniqueness globally before committing. Try inserting a duplicate email to see the rejection in action.",
    scanDefault: "email = 'alice@co.com'",
    inputPlaceholder: "Enter email (try a duplicate: alice@co.com)...",
    legend: [
      { type: "sharding", label: "email (UNIQUE Hash)", explain: "Uniqueness enforced globally across all tablets on every write" },
      { type: "ptr", label: "user_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "user-" + Math.floor(Math.random() * 999);
      return {
        index: { fields: [v, pk] },
        table: { fields: [pk, v, v.split('@')[0] || v, ["US", "EU", "APAC"][Math.floor(Math.random() * 3)], "Active"] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false, isUnique: true,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "email (UNIQUE)", role: "sh", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "user_id (PK)", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    initialState: {
      usedEmails: ["alice@co.com", "bob@co.com", "carol@co.com"],
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["user-241", "alice@co.com", "Alice", "US", "Active"] },
          { fields: ["user-507", "carol@co.com", "Carol", "APAC", "Active"] }
        ]},
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["user-892", "bob@co.com", "Bob", "EU", "Active"] }
        ]},
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [] }
      ],
      indexTablets: [
        { id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x21F3", "alice@co.com", "user-241"] },
          { fields: ["0x4B12", "carol@co.com", "user-507"] }
        ]},
        { id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x7D3A", "bob@co.com", "user-892"] }
        ]},
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [] }
      ]
    },
    callout: { type: "info", icon: "🔒", text: "<b>Uniqueness cost:</b> Every write to a UNIQUE index requires YugabyteDB to verify no other tablet already holds that value. This involves a distributed check before committing — slightly higher write latency than a non-unique index, but guaranteed global consistency." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
    <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    email   <span class="sql-type">TEXT</span>,
    name    <span class="sql-type">TEXT</span>,
    region  <span class="sql-type">TEXT</span>,
    status  <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE UNIQUE INDEX</span> idx_unique_email
  <span class="sql-kw">ON</span> users (<span class="sh-key">email HASH</span>);

<span class="sql-comment">-- ✅ New email → insert succeeds</span>
<span class="sql-kw">INSERT INTO</span> users <span class="sql-kw">VALUES</span> (<span class="sql-str">'user-999'</span>, <span class="sql-str">'new@co.com'</span>, ...);

<span class="sql-comment">-- ❌ Duplicate email → rejected</span>
<span class="sql-kw">INSERT INTO</span> users <span class="sql-kw">VALUES</span> (<span class="sql-str">'user-000'</span>, <span class="sql-str">'alice@co.com'</span>, ...);
<span class="sql-comment">-- ERROR:  duplicate key value violates unique constraint</span>` },
    guidedTour: [
      { text: "This table has a UNIQUE index on email — no two users may share the same address.", element: ".index-area" },
      { text: "Insert a <b>new</b> email. It succeeds and appears in both Index and Table tablets.", element: "#sim-input-val" },
      { text: "Now type <b>alice@co.com</b> and insert again. The duplicate is rejected.", element: "#sim-input-val" },
      { text: "Every unique index write checks all tablets globally before committing — that's the coordination cost.", element: ".table-area" }
    ]
  },

  "idx-multi-hash": {
    group: "Indexes", icon: "🔑", title: "Multi-column Hash Index", subtitle: "(col_a, col_b) HASH together",
    description: "Both columns form a single compound hash sharding key. The hash is computed on the combined value — every (tenant_id, event_type) pair is treated as one atomic key. Contrast with Hash+Range composite indexes where the first column is the shard key and the second is a per-tablet sort order.",
    scanDefault: "tenant_id = 't-1'",
    inputPlaceholder: "Enter event type (click, view, purchase)...",
    legend: [
      { type: "sharding", label: "(tenant_id, event_type) HASH", explain: "Both columns hashed together — the full pair is the shard key, not individual columns" },
      { type: "ptr", label: "event_id (Ptr)", explain: "Pointer to main table PK" }
    ],
    generateRow: (v) => {
      const pk = "evt-" + Math.floor(Math.random() * 9999);
      const tenant = ["t-1", "t-2", "t-3"][Math.floor(Math.random() * 3)];
      const evtType = v || ["click", "view", "purchase", "login", "logout"][Math.floor(Math.random() * 5)];
      const ts = "2024-03-" + String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      return {
        index: { fields: [tenant, evtType, pk], _hashKey: `${tenant}|${evtType}` },
        table: { fields: [pk, tenant, evtType, "payload-" + Math.floor(Math.random() * 99), ts] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "tenant_id", role: "sh", dir: "ASC" }, { label: "event_type", role: "sh", dir: "ASC" }, { label: "Data Pointer Ref", role: "pk" }],
      tableColumns: [{ label: "event_id (PK)", role: "pk" }, { label: "tenant_id", role: "" }, { label: "event_type", role: "" }, { label: "payload", role: "" }, { label: "created_at", role: "" }]
    },
    initialState: {
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["evt-1101", "t-1", "click", "payload-12", "2024-03-10"] },
          { fields: ["evt-2203", "t-2", "view", "payload-34", "2024-03-11"] }
        ]},
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["evt-3305", "t-1", "purchase", "payload-56", "2024-03-12"] }
        ]},
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["evt-4407", "t-3", "login", "payload-78", "2024-03-13"] }
        ]}
      ],
      indexTablets: [
        { id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x1A2B", "t-1", "click", "evt-1101"] },
          { fields: ["0x3C4D", "t-3", "login", "evt-4407"] }
        ]},
        { id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x7E5F", "t-2", "view", "evt-2203"] }
        ]},
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xBB70", "t-1", "purchase", "evt-3305"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "🔑", text: "<b>Multi-column hash key:</b> <code>(tenant_id, event_type) HASH</code> treats both columns as one compound shard key. The same combination always lands on the same tablet. Compare with <code>customer_id HASH, order_date DESC</code> — there, hash is the shard key and date is an independent per-tablet sort order." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> events (
    <span class="pk-key">event_id</span>   <span class="sql-type">TEXT PRIMARY KEY</span>,
    tenant_id  <span class="sql-type">TEXT</span>,
    event_type <span class="sql-type">TEXT</span>,
    payload    <span class="sql-type">TEXT</span>,
    created_at <span class="sql-type">TIMESTAMP</span>
);

<span class="sql-comment">-- Compound hash key: both columns hashed together</span>
<span class="sql-kw">CREATE INDEX</span> idx_events_multi
  <span class="sql-kw">ON</span> events ((<span class="sh-key">tenant_id, event_type</span>) <span class="sh-key">HASH</span>);

<span class="sql-comment">-- ✅ Uses index: full compound key specified</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> events
<span class="sql-kw">WHERE</span> tenant_id = <span class="sql-str">'t-1'</span> <span class="sql-kw">AND</span> event_type = <span class="sql-str">'click'</span>;

<span class="sql-comment">-- ❌ Cannot use index: hash key must be fully specified</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> events <span class="sql-kw">WHERE</span> tenant_id = <span class="sql-str">'t-1'</span>;` },
    guidedTour: [
      { text: "The index shards on <b>both</b> tenant_id and event_type together — one hash for the full pair.", element: ".index-area" },
      { text: "Insert an event type like 'purchase'. Notice two sharding columns appear in the index.", element: "#sim-input-val" },
      { text: "The same tenant+type combination always routes to the same index tablet.", element: ".tablet-card" },
      { text: "Compare with the Hash+Range scenario — there, hash is the shard key and date is a per-tablet sort.", element: ".table-area" }
    ]
  },

  "partition-range": {
    group: "Table Partitioning", icon: "🍰", title: "Range Partitioning", subtitle: "Logical table → Physical partitions",
    description: "Declarative partitioning splits a logical table into separate physical child tables based on a range. Each child table is a real table that can be independently sharded, indexed, or even moved to different hardware/regions.",
    inputPlaceholder: "Enter date (YYYY-MM-DD)...",
    legend: [
      { type: "sharding", label: "order_date", explain: "Partition key — determines which physical child table stores the row" },
      { type: "data", label: "order_id, total", explain: "Regular data columns" }
    ],
    generateRow: (v) => {
      const pk = "ord-" + Math.floor(Math.random() * 9999);
      const cust = "cust-" + Math.floor(Math.random() * 500);
      const regions = ["US", "EU", "APAC"];
      const dates = ["2023-05-15", "2023-11-20", "2024-02-10", "2024-08-25", "2025-01-05"];
      const date = v || dates[Math.floor(Math.random() * dates.length)];
      return { fields: [pk, date, cust, regions[Math.floor(Math.random()*3)], String((Math.random() * 500).toFixed(2)), "active"] };
    },
    visual: {
      type: "partitioning",
      parentColumns: [
        { label: "[hash]", role: "sys", dir: "ASC" },
        { label: "order_id", role: "sh", dir: "ASC" },
        { label: "order_date", role: "cl", dir: "ASC" },
        { label: "customer_id", role: "" },
        { label: "region", role: "" },
        { label: "total", role: "" }
      ],
      partitionColumns: [
        { label: "[hash]", role: "sys", dir: "ASC" },
        { label: "order_id", role: "sh", dir: "ASC" },
        { label: "order_date", role: "cl", dir: "ASC" },
        { label: "customer_id", role: "" },
        { label: "region", role: "" },
        { label: "total", role: "" }
      ]
    },
    initialState: {
      parentRows: [
        { fields: ["0x21F3", "ord-1001", "2023-06-12", "cust-42", "US", "150.00"] },
        { fields: ["0x4B12", "ord-2005", "2024-01-15", "cust-88", "EU", "45.50"] },
        { fields: ["0x7D3A", "ord-3301", "2025-02-20", "cust-12", "APAC", "890.00"] }
      ],
      partitions: [
        {
          id: "orders_2023", range: "['2023-01-01', '2024-01-01')",
          tablets: [
            { id: "2023-Tablet-1", range: "0x0000–0x5555", rows: [{ fields: ["0x21F3", "ord-1001", "2023-06-12", "cust-42", "US", "150.00"] }] },
            { id: "2023-Tablet-2", range: "0x5556–0xAAAA", rows: [] },
            { id: "2023-Tablet-3", range: "0xAAAB–0xFFFF", rows: [] }
          ]
        },
        {
          id: "orders_2024", range: "['2024-01-01', '2025-01-01')",
          tablets: [
            { id: "2024-Tablet-1", range: "0x0000–0x5555", rows: [] },
            { id: "2024-Tablet-2", range: "0x5556–0xAAAA", rows: [{ fields: ["0x4B12", "ord-2005", "2024-01-15", "cust-88", "EU", "45.50"] }] },
            { id: "2024-Tablet-3", range: "0xAAAB–0xFFFF", rows: [] }
          ]
        },
        {
          id: "orders_default", range: "DEFAULT",
          tablets: [
            { id: "Def-Tablet-1", range: "0x0000–0x5555", rows: [] },
            { id: "Def-Tablet-2", range: "0x5556–0xAAAA", rows: [{ fields: ["0x7D3A", "ord-3301", "2025-02-20", "cust-12", "APAC", "890.00"] }] },
            { id: "Def-Tablet-3", range: "0xAAAB–0xFFFF", rows: [{ fields: ["0x9DA2", "ord-9999", "2026-05-12", "cust-101", "US", "125.00"] }] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "🍰", text: "<b>Partitioning vs Sharding:</b> Partitioning is a <i>logical</i> split into separate tables (PostgreSQL style). Each partition is then <i>sharded</i> into tablets across the cluster. Great for archiving old data or geo-partitioning by region." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
    order_id    <span class="sql-type">INT</span>,
    <span class="sh-key">order_date</span>  <span class="sql-type">DATE</span>,
    customer_id <span class="sql-type">TEXT</span>,
    region      <span class="sql-type">TEXT</span>,
    total       <span class="sql-type">DECIMAL</span>,
    <span class="sql-kw">PRIMARY KEY</span> (order_id, <span class="sh-key">order_date</span>)
) <span class="sql-kw">PARTITION BY RANGE</span> (<span class="sh-key">order_date</span>);

<span class="sql-comment">-- Create physical child tables (partitions)</span>
<span class="sql-kw">CREATE TABLE</span> orders_2023 <span class="sql-kw">PARTITION OF</span> orders
  <span class="sql-kw">FOR VALUES FROM</span> (<span class="sql-str">'2023-01-01'</span>) <span class="sql-kw">TO</span> (<span class="sql-str">'2024-01-01'</span>);

<span class="sql-kw">CREATE TABLE</span> orders_2024 <span class="sql-kw">PARTITION OF</span> orders
  <span class="sql-kw">FOR VALUES FROM</span> (<span class="sql-str">'2024-01-01'</span>) <span class="sql-kw">TO</span> (<span class="sql-str">'2025-01-01'</span>);

<span class="sql-kw">CREATE TABLE</span> orders_default <span class="sql-kw">PARTITION OF</span> orders
  <span class="sql-kw">DEFAULT</span>;` },
    guidedTour: [
      { text: "Table Partitioning splits one logical table into multiple physical tables.", element: ".partitioning-view" },
      { text: "Insert a date from 2023 and then one from 2024.", element: "#sim-input-val" },
      { text: "Watch them route to different child tables (partitions) based on the range.", element: ".partition-card" },
      { text: "This allows for easy data archiving by simply dropping a partition.", element: ".partition-header" }
    ]
  },
  "partition-index": {
    group: "Table Partitioning", icon: "🌐", title: "Secondary Index", subtitle: "Per-partition secondary index",
    description: "In YugabyteDB, creating an index on a partitioned table results in a 'Local Index' for each partition. The index is split exactly like the table data, ensuring index entries for a partition stay within that partition's tablets.",
    inputPlaceholder: "Enter customer ID (cust-101)...",
    legend: [
      { type: "sharding", label: "customer_id (Index)", explain: "Local index key — sharded within the partition" },
      { type: "sharding", label: "order_date (Table)", explain: "Partition key — determines which physical child table stores the actual row" }
    ],
    generateRow: (v) => {
      const pk = "ord-" + Math.floor(Math.random() * 9999);
      const cust = v || "cust-" + Math.floor(Math.random() * 500);
      const dates = ["2023-05-15", "2023-11-20", "2024-02-10", "2024-08-25", "2025-01-05"];
      const date = dates[Math.floor(Math.random() * dates.length)];
      return { fields: [pk, date, cust, ["US", "EU", "APAC"][Math.floor(Math.random()*3)], (Math.random() * 500).toFixed(2)] };
    },
    visual: {
      type: "partition-index",
      indexColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "customer_id", role: "sh", dir: "ASC" }, { label: "order_id (Ptr)", role: "pk" }, { label: "order_date (Ptr)", role: "pk" }],
      parentColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "order_id", role: "sh", dir: "ASC" }, { label: "order_date", role: "cl", dir: "ASC" }, { label: "customer_id", role: "" }, { label: "region", role: "" }, { label: "total", role: "" }],
      partitionColumns: [{ label: "[hash]", role: "sys", dir: "ASC" }, { label: "order_id", role: "sh", dir: "ASC" }, { label: "order_date", role: "cl", dir: "ASC" }, { label: "customer_id", role: "" }, { label: "region", role: "" }, { label: "total", role: "" }]
    },
    initialState: {
      parentRows: [
        { fields: ["0x21F3", "ord-1001", "2023-06-12", "cust-42", "US", "150.00"] },
        { fields: ["0x4B12", "ord-2005", "2024-01-15", "cust-88", "EU", "45.50"] }
      ],
      partitions: [
        { id: "orders_2023", range: "['2023-01-01', '2024-01-01')",
          indexTablets: [
            { id: "2023-Idx-T1", range: "0x0000–0x7FFF", rows: [{ fields: ["0x21F3", "cust-42", "ord-1001", "2023-06-12"] }] },
            { id: "2023-Idx-T2", range: "0x8000–0xFFFF", rows: [] }
          ],
          tablets: [
            { id: "2023-T1", range: "0x0000–0x5555", rows: [{ fields: ["0x21F3", "ord-1001", "2023-06-12", "cust-42", "US", "150.00"] }] },
            { id: "2023-T2", range: "0x5556–0xAAAA", rows: [] },
            { id: "2023-T3", range: "0xAAAB–0xFFFF", rows: [] }
          ]
        },
        { id: "orders_2024", range: "['2024-01-01', '2025-01-01')",
          indexTablets: [
            { id: "2024-Idx-T1", range: "0x0000–0x7FFF", rows: [] },
            { id: "2024-Idx-T2", range: "0x8000–0xFFFF", rows: [{ fields: ["0x9DA2", "cust-88", "ord-2005", "2024-01-15"] }] }
          ],
          tablets: [
            { id: "2024-T1", range: "0x0000–0x5555", rows: [] },
            { id: "2024-T2", range: "0x5556–0xAAAA", rows: [{ fields: ["0x4B12", "ord-2005", "2024-01-15", "cust-88", "EU", "45.50"] }] },
            { id: "2024-T3", range: "0xAAAB–0xFFFF", rows: [] }
          ]
        },
        { id: "orders_default", range: "DEFAULT",
          indexTablets: [
            { id: "Def-Idx-T1", range: "0x0000–0xFFFF", rows: [] }
          ],
          tablets: [
            { id: "Def-T1", range: "0x0000–0x7FFF", rows: [] },
            { id: "Def-T2", range: "0x8000–0xFFFF", rows: [] }
          ]
        }
      ]
    },
    callout: { type: "info", icon: "🌐", text: "<b>Local Partitioned Index:</b> When you create an index on the parent table, YugabyteDB automatically creates corresponding indexes on every child partition. Queries on <code>customer_id</code> will scan the local index within the relevant partitions." },
    guide: {
      richSql: `<span class="sql-kw">CREATE INDEX</span> idx_orders_cust
  <span class="sql-kw">ON</span> orders (<span class="sh-key">customer_id HASH</span>);

<span class="sql-comment">-- Percolates to child tables automatically:</span>
<span class="sql-comment">-- orders_2023_customer_id_idx</span>
<span class="sql-comment">-- orders_2024_customer_id_idx</span>
<span class="sql-comment">-- ...</span>

<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> order_date = <span class="sql-str">'2024-06-01'</span>
  <span class="sql-kw">AND</span> customer_id = <span class="sql-str">'cust-88'</span>;` },
    guidedTour: [
      { text: "In YugabyteDB, secondary indexes on partitioned tables are also partitioned.", element: ".partitioning-view" },
      { text: "Click <b>Auto Generate</b>.", element: ".secondary-btn" },
      { text: "Notice each child table has its own local index tablets.", element: ".partition-card" }
    ]
  },
  "colocated-tables": {
    group: "Colocation", icon: "📦", title: "Colocated Tables", subtitle: "Shared tablets for small tables",
    description: "In a colocated database, multiple small tables share the same underlying tablet. Unlike distributed tables, colocated tables do not use hash sharding; they are stored as ordered ranges within the shared tablet to optimize for scans and reduced metadata.",
    inputPlaceholder: "Enter name (e.g. 'Admin')...",
    legend: [
      { type: "sys", label: "[table]", explain: "Internal Table ID — used as a prefix to group rows from the same table together" },
      { type: "sharding", label: "id", explain: "Primary key — used to sort rows within the table's range" }
    ],
    generateRow: (v) => {
      const tables = ["users", "roles", "settings"];
      const tbl = tables[Math.floor(Math.random() * tables.length)];
      const id = Math.floor(Math.random() * 1000);
      return { fields: [tbl, id, v || "Item-" + id] };
    },
    visual: {
      type: "colocated",
      columns: [{ label: "[table]", role: "sys" }, { label: "id", role: "sh" }, { label: "value", role: "" }]
    },
    initialState: {
      tablet: {
        id: "Colocated Tablet (Shared)",
        rows: [
          { fields: ["roles", "10", "Admin"] },
          { fields: ["settings", "5", "DarkMode"] },
          { fields: ["users", "1", "Alice"] },
          { fields: ["users", "2", "Bob"] }
        ]
      }
    },
    callout: { type: "info", icon: "📦", text: "<b>Why Colocation?</b> By default, every table in YugabyteDB gets at least one tablet. For 1000 small tables, that's 1000+ tablets. Colocation puts them all in one, drastically reducing metadata overhead." },
    guide: {
      richSql: `<span class="sql-comment">-- Create a multi-tenant colocated database</span>
<span class="sql-kw">CREATE DATABASE</span> saas_multi_tenant_db <span class="sql-kw">COLOCATED</span> = <span class="sql-kw">true</span>;

<span class="sql-comment">-- These tables share the same physical tablet:</span>
<span class="sql-kw">CREATE TABLE</span> users (id <span class="sql-type">INT PRIMARY KEY</span>, name <span class="sql-type">TEXT</span>);
<span class="sql-kw">CREATE TABLE</span> roles (id <span class="sql-type">INT PRIMARY KEY</span>, role <span class="sql-type">TEXT</span>);
<span class="sql-kw">CREATE TABLE</span> settings (id <span class="sql-type">INT PRIMARY KEY</span>, val <span class="sql-type">TEXT</span>);` },
    guidedTour: [
      { text: "Colocation allows many small tables to share the same tablets.", element: ".colocated-view" },
      { text: "Notice how rows from <code>users</code>, <code>roles</code>, and <code>settings</code> all live together.", element: ".tablet-card" },
      { text: "This prevents 'Tablet Bloat' when you have thousands of small reference tables.", element: ".tablet-header" }
    ]
  },
  "geo-partitioning": {
    group: "Tablespaces", icon: "🌍", title: "Geo-Partitioning", subtitle: "Regional data pin to locations",
    description: "Geo-partitioning uses Table Partitioning to pin data to specific cloud regions. This ensures EU users' data stays in EU nodes, complying with GDPR and providing ultra-low latency.",
    inputPlaceholder: "Enter region (US, EU, APAC)...",
    legend: [
      { type: "sharding", label: "geo_region", explain: "Partition key — maps row to a specific regional tablespace" }
    ],
    generateRow: (v) => {
      const regions = ["US", "EU", "APAC"];
      const r = (v || regions[Math.floor(Math.random() * regions.length)]).toUpperCase();
      const id = "ord-" + Math.floor(Math.random() * 9999);
      return { fields: [id, r, (Math.random() * 500).toFixed(2)] };
    },
    visual: {
      type: "partitioning",
      parentColumns: [{ label: "[hash]", role: "sys" }, { label: "order_id", role: "sh" }, { label: "geo_region", role: "cl" }, { label: "total", role: "" }],
      partitionColumns: [{ label: "[hash]", role: "sys" }, { label: "order_id", role: "sh" }, { label: "geo_region", role: "cl" }, { label: "total", role: "" }]
    },
    initialState: {
      parentRows: [
        { fields: ["0x21F3", "ord-1001", "US", "150.00"] },
        { fields: ["0x4B12", "ord-2005", "EU", "45.50"] }
      ],
      partitions: [
        { id: "orders_us", range: "VALUES IN ('US')", region: "🇺🇸 US-East-1", placement: "Cloud: AWS | Nodes: 3 (Zone a,b,c)",
          tablets: [{ id: "US-Tablet-1", range: "0x0000–0xFFFF", rows: [{ fields: ["0x21F3", "ord-1001", "US", "150.00"] }] }]
        },
        { id: "orders_eu", range: "VALUES IN ('EU')", region: "🇪🇺 EU-Central-1", placement: "Cloud: AWS | Nodes: 3 (Zone a,b,c)",
          tablets: [{ id: "EU-Tablet-1", range: "0x0000–0xFFFF", rows: [{ fields: ["0x4B12", "ord-2005", "EU", "45.50"] }] }]
        },
        { id: "orders_apac", range: "VALUES IN ('APAC')", region: "🇸🇬 APAC-South-1", placement: "Cloud: GCP | Nodes: 3 (Zone a,b,c)",
          tablets: [{ id: "APAC-Tablet-1", range: "0x0000–0xFFFF", rows: [] }]
        }
      ]
    },
    callout: { type: "info", icon: "🌍", text: "<b>Data Sovereignty:</b> With Geo-Partitioning, you use <code>TABLESPACE</code> to map specific partitions to nodes in specific regions. The data never leaves the region, satisfying regulatory requirements." },
    guide: {
      richSql: `<span class="sql-comment">-- 1. Create regional tablespaces</span>
<span class="sql-kw">CREATE TABLESPACE</span> us_east_ts <span class="sql-kw">WITH</span> (
  replica_placement = <span class="sql-str">'{"num_replicas": 3, "placement_blocks": [
    {"cloud":"aws","region":"us-east-1","zone":"us-east-1a","min_num_replicas":1},
    {"cloud":"aws","region":"us-east-1","zone":"us-east-1b","min_num_replicas":1},
    {"cloud":"aws","region":"us-east-1","zone":"us-east-1c","min_num_replicas":1}
  ]}'</span>
);

<span class="sql-kw">CREATE TABLESPACE</span> eu_central_ts <span class="sql-kw">WITH</span> (
  replica_placement = <span class="sql-str">'{"num_replicas": 3, "placement_blocks": [
    {"cloud":"aws","region":"eu-central-1","zone":"eu-central-1a","min_num_replicas":1},
    {"cloud":"aws","region":"eu-central-1","zone":"eu-central-1b","min_num_replicas":1},
    {"cloud":"aws","region":"eu-central-1","zone":"eu-central-1c","min_num_replicas":1}
  ]}'</span>
);

<span class="sql-comment">-- 2. Create partitioned table</span>
<span class="sql-kw">CREATE TABLE</span> transactions (
  order_id   <span class="sql-type">INT</span>,
  geo_region <span class="sql-type">TEXT</span>,
  amount     <span class="sql-type">DECIMAL</span>,
  <span class="sql-kw">PRIMARY KEY</span> (order_id, geo_region)
) <span class="sql-kw">PARTITION BY LIST</span> (geo_region);

<span class="sql-comment">-- 3. Pin partitions to tablespaces</span>
<span class="sql-kw">CREATE TABLE</span> trans_us <span class="sql-kw">PARTITION OF</span> transactions
  <span class="sql-kw">FOR VALUES IN</span> (<span class="sql-str">'US'</span>) <span class="sql-kw">TABLESPACE</span> us_east_ts;

<span class="sql-kw">CREATE TABLE</span> trans_eu <span class="sql-kw">PARTITION OF</span> transactions
  <span class="sql-kw">FOR VALUES IN</span> (<span class="sql-str">'EU'</span>) <span class="sql-kw">TABLESPACE</span> eu_central_ts;` },
    guidedTour: [
      { text: "Geo-partitioning is the ultimate 'Data Sovereignty' pattern.", element: ".partitioning-view" },
      { text: "Try inserting a 'US' order and then an 'EU' order.", element: "#sim-input-val" },
      { text: "Notice how they are routed to completely different cloud regions and tablets.", element: ".partition-card" },
      { text: "This ensures low latency for local users and compliance with data residency laws.", element: ".region-label" }
    ]
  },

  /* ═══════════════════════════════════════════════════════════
     QUERY EXECUTION — DocDB Seek / Next Visualization
     ═══════════════════════════════════════════════════════════ */
  "qe-hash-point": {
    group: "Query Execution", icon: "🎯", title: "Hash Point Lookup", subtitle: "WHERE pk = value",
    description: "Hash the primary key, route to exactly one tablet, Seek directly to the row. The fastest possible lookup — O(1) with a single RPC.",
    legend: [
      { type: "sharding", label: "user_id", explain: "Hash-sharded PK — HASH(user_id) determines tablet" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "[hash]", role: "sys" }, { label: "user_id", role: "sh" },
        { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM users WHERE user_id = 'user-507'",
      targetKey: "user-507",
      steps: [
        { op: "hash", detail: "HASH('user-507') → 0x4B12", tablets: [], rows: [] },
        { op: "route", detail: "0x4B12 falls in Tablet 1 (0x0000–0x5555)", tablets: [{ id: 0, state: "active" }], dimOthers: true, rows: [] },
        { op: "seek", detail: "Seek(0x4B12) → cursor on user-507", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "cursor" }] },
        { op: "return", detail: "Row found — return to client", tablets: [{ id: 0, state: "done" }], rows: [{ tablet: 0, row: 1, state: "returned" }] },
        { op: "done", detail: "Complete: 1 tablet, 1 Seek, 0 Next = O(1)", tablets: [], rows: [], summary: { tablets: 1, seeks: 1, nexts: 0, rows: 1 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x21F3", "user-241", "Alice Chen", "US", "Active"] },
          { fields: ["0x4B12", "user-507", "Dan Park", "EU", "Active"] },
          { fields: ["0x5501", "user-610", "Fay Lee", "APAC", "Pending"] }
        ]},
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x7D3A", "user-892", "Bob Martinez", "EU", "Pending"] },
          { fields: ["0x8F11", "user-333", "Grace Kim", "US", "Active"] }
        ]},
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xB321", "user-105", "Carol Singh", "APAC", "Active"] },
          { fields: ["0xD4E5", "user-750", "Hank Zhou", "EU", "Active"] },
          { fields: ["0xF245", "user-999", "Eve Adams", "US", "Active"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "🎯", text: "<b>O(1) Point Lookup + Packed Rows:</b> Hash sharding enables constant-time lookups. The hash function maps the key directly to one tablet. Because YugabyteDB uses a <b>Packed Row</b> format internally, all columns are stored together in a single RocksDB key-value pair. Thus, one Seek jumps to the row, fetching all columns instantly with 0 Next calls." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
  user_id <span class="sql-type">TEXT</span> <span class="sql-kw">PRIMARY KEY</span>,
  name    <span class="sql-type">TEXT</span>,
  region  <span class="sql-type">TEXT</span>,
  status  <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- Hash point lookup: single RPC to one tablet</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> user_id = <span class="sql-str">'user-507'</span>;

<span class="sql-comment">-- DocDB internally:</span>
<span class="sql-comment">-- 1. HASH('user-507') → 0x4B12</span>
<span class="sql-comment">-- 2. Route to Tablet 1 (owns 0x0000–0x5555)</span>
<span class="sql-comment">-- 3. Seek(0x4B12) → direct jump to row</span>
<span class="sql-comment">-- 4. Return row</span>` },
    guidedTour: [
      { text: "This is the fastest lookup pattern in YugabyteDB.", element: ".query-exec-container" },
      { text: "Use <b>Next Step</b> to manually trigger each phase of the hashing and routing logic.", element: "#qe-next-btn" },
      { text: "Alternatively, click <b>Play All</b> to see the full O(1) flow automatically.", element: "#qe-play-btn" },
      { text: "Notice there is only <b>1 Seek</b> and <b>0 Next</b> calls needed to get the result.", element: ".exec-log" }
    ]
  },

  "qe-range-point": {
    group: "Query Execution", icon: "📍", title: "Range Point Lookup", subtitle: "Seek on sorted data",
    description: "On a range-sharded table, the sort order lets DocDB binary-search to the correct tablet and Seek directly to the matching row. No hash function needed.",
    legend: [
      { type: "clustering", label: "price ASC", explain: "Range-sharded key — globally sorted across tablets" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "price", role: "cl", dir: "ASC" }, { label: "product_id", role: "" },
        { label: "name", role: "" }, { label: "status", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM products WHERE price = 89.99",
      targetKey: "89.99",
      steps: [
        { op: "route", detail: "price=89.99 falls in Tablet 2 [50, 150)", tablets: [{ id: 1, state: "active" }], dimOthers: true, rows: [] },
        { op: "seek", detail: "Seek(89.99) → cursor on matching row", tablets: [{ id: 1, state: "active" }], rows: [{ tablet: 1, row: 1, state: "cursor" }] },
        { op: "return", detail: "Row matches — return to client", tablets: [{ id: 1, state: "active" }], rows: [{ tablet: 1, row: 1, state: "returned" }] },
        { op: "next", detail: "Next → price=129.00 ≠ 89.99 → stop", tablets: [{ id: 1, state: "done" }], rows: [{ tablet: 1, row: 1, state: "returned" }, { tablet: 1, row: 2, state: "scanned" }] },
        { op: "done", detail: "Complete: 1 tablet, 1 Seek, 1 Next = O(log N)", tablets: [], rows: [], summary: { tablets: 1, seeks: 1, nexts: 1, rows: 1 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "(-∞, 50)", rows: [
          { fields: ["9.99", "prod-501", "Budget Widget", "In Stock"] },
          { fields: ["19.99", "prod-220", "Basic Kit", "In Stock"] },
          { fields: ["29.99", "prod-102", "Standard Kit", "In Stock"] }
        ]},
        { id: "Tablet 2", range: "[50, 150)", rows: [
          { fields: ["59.99", "prod-441", "Pro Mouse", "In Stock"] },
          { fields: ["89.99", "prod-330", "Pro Suite", "Low"] },
          { fields: ["129.00", "prod-615", "Ultra Pack", "In Stock"] }
        ]},
        { id: "Tablet 3", range: "[150, ∞)", rows: [
          { fields: ["149.99", "prod-210", "Premium Pack", "In Stock"] },
          { fields: ["299.00", "prod-801", "Enterprise", "Pre-order"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "📍", text: "<b>Range Seek + Packed Rows:</b> Because data is globally sorted by price, DocDB knows exactly which tablet contains 89.99. It Seeks directly. Thanks to the <b>Packed Row</b> format, this single Seek retrieves all columns at once without needing additional Next calls for each column." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
  price      <span class="sql-type">DECIMAL</span>,
  product_id <span class="sql-type">TEXT</span>,
  name       <span class="sql-type">TEXT</span>,
  status     <span class="sql-type">TEXT</span>,
  <span class="sql-kw">PRIMARY KEY</span> (price <span class="sql-kw">ASC</span>, product_id)
);

<span class="sql-comment">-- Range point lookup:</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> products
<span class="sql-kw">WHERE</span> price = <span class="sql-str">89.99</span>;` },
    guidedTour: [
      { text: "In range-sharded tables, data is globally sorted.", element: ".query-exec-container" },
      { text: "Click <b>Next Step</b> to see how DocDB routes directly to the correct tablet without hashing.", element: "#qe-next-btn" },
      { text: "Or click <b>Play All</b> to automate the Seek and scan check.", element: "#qe-play-btn" },
      { text: "One Seek jumps to the matching price, and the next row is checked to confirm no more matches exist.", element: ".tablet-card" }
    ]
  },

  "qe-full-scan": {
    group: "Query Execution", icon: "🔍", title: "Full Table Scan", subtitle: "Sequential scan — all tablets",
    description: "When no index can satisfy the query, DocDB must scan every row in every tablet. All tablets are accessed in parallel, but every row is evaluated — the most expensive operation.",
    legend: [
      { type: "sharding", label: "user_id", explain: "Hash-sharded PK — no ordering, must check all tablets" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "[hash]", role: "sys" }, { label: "user_id", role: "sh" },
        { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM users WHERE name LIKE '%Park%'",
      targetKey: "%Park%",
      steps: [
        { op: "fanout", detail: "No index on 'name' — fan out to ALL tablets", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [] },
        { op: "seek", detail: "Seek(MIN) → cursor at start of each tablet", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "cursor" }, { tablet: 1, row: 0, state: "cursor" }, { tablet: 2, row: 0, state: "cursor" }] },
        { op: "next", detail: "Scan T1: 'Alice Chen' — no match", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 1, row: 0, state: "scanned" }, { tablet: 2, row: 0, state: "scanned" }] },
        { op: "next", detail: "Scan T1: 'Dan Park' — MATCH! Also scanning T2, T3...", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 0, row: 1, state: "returned" }, { tablet: 1, row: 0, state: "scanned" }, { tablet: 1, row: 1, state: "scanned" }, { tablet: 2, row: 0, state: "scanned" }, { tablet: 2, row: 1, state: "scanned" }] },
        { op: "next", detail: "Continue scanning all remaining rows...", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "scanned" }, { tablet: 1, row: 0, state: "scanned" }, { tablet: 1, row: 1, state: "scanned" }, { tablet: 2, row: 0, state: "scanned" }, { tablet: 2, row: 1, state: "scanned" }, { tablet: 2, row: 2, state: "scanned" }] },
        { op: "done", detail: "Complete: 3 tablets, 3 Seeks, 8 Next, 1 match — O(N) 💀", tablets: [], rows: [], summary: { tablets: 3, seeks: 3, nexts: 8, rows: 1 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x21F3", "user-241", "Alice Chen", "US", "Active"] },
          { fields: ["0x4B12", "user-507", "Dan Park", "EU", "Active"] },
          { fields: ["0x5501", "user-610", "Fay Lee", "APAC", "Pending"] }
        ]},
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x7D3A", "user-892", "Bob Martinez", "EU", "Pending"] },
          { fields: ["0x8F11", "user-333", "Grace Kim", "US", "Active"] }
        ]},
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xB321", "user-105", "Carol Singh", "APAC", "Active"] },
          { fields: ["0xD4E5", "user-750", "Hank Zhou", "EU", "Active"] },
          { fields: ["0xF245", "user-999", "Eve Adams", "US", "Active"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "🔍", text: "<b>Full Scan = O(N):</b> Without an index on <code>name</code>, every tablet must be scanned in parallel. Every single row is evaluated. This is the most expensive pattern — consider adding a GIN or expression index on the column." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
  user_id <span class="sql-type">TEXT</span> <span class="sql-kw">PRIMARY KEY</span>,
  name    <span class="sql-type">TEXT</span>,
  region  <span class="sql-type">TEXT</span>,
  status  <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- Full table scan: no index on 'name' column</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> name <span class="sql-kw">LIKE</span> <span class="sql-str">'%Park%'</span>;

<span class="sql-comment">-- DocDB must:</span>
<span class="sql-comment">-- 1. Fan out to ALL tablets (parallel)</span>
<span class="sql-comment">-- 2. Seek(MIN) → start of each tablet</span>
<span class="sql-comment">-- 3. Next through EVERY row</span>
<span class="sql-comment">-- 4. Evaluate LIKE predicate on each</span>

<span class="sql-comment">-- 💡 Fix: CREATE INDEX idx_name ON users (name);</span>` },
    guidedTour: [
      { text: "Click <b>Next Step</b> to manually witness the most expensive execution pattern.", element: "#qe-next-btn" },
      { text: "Click <b>Play All</b> to see the full fan-out scan automatically.", element: "#qe-play-btn" },
      { text: "Observe how DocDB is forced to scan <b>every tablet</b> and <b>every row</b> sequentially because there is no index.", element: ".query-exec-container" }
    ]
  },

  "qe-range-scan": {
    group: "Query Execution", icon: "📊", title: "Range Scan", subtitle: "BETWEEN with sequential Next",
    description: "Seek to the start of the range, then call Next repeatedly to walk through contiguous rows. May cross tablet boundaries. Efficient because data is physically sorted.",
    legend: [
      { type: "clustering", label: "price ASC", explain: "Range-sharded — contiguous scan within and across tablets" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "price", role: "cl", dir: "ASC" }, { label: "product_id", role: "" },
        { label: "name", role: "" }, { label: "status", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM products WHERE price BETWEEN 25 AND 100",
      targetKey: "25–100",
      steps: [
        { op: "route", detail: "Start key 25 falls in Tablet 1 (-∞, 50)", tablets: [{ id: 0, state: "active" }], dimOthers: true, rows: [] },
        { op: "seek", detail: "Seek(25) → cursor on first row ≥ 25", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 2, state: "cursor" }] },
        { op: "return", detail: "price=29.99 is in [25,100] → return", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 2, state: "returned" }] },
        { op: "next", detail: "Next → price=45.00 is in [25,100] → return", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 2, state: "returned" }, { tablet: 0, row: 3, state: "returned" }] },
        { op: "next", detail: "Next → end of Tablet 1 → cross to Tablet 2", tablets: [{ id: 0, state: "done" }, { id: 1, state: "active" }], rows: [{ tablet: 0, row: 2, state: "returned" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 1, row: 0, state: "cursor" }] },
        { op: "return", detail: "price=59.99 is in [25,100] → return", tablets: [{ id: 0, state: "done" }, { id: 1, state: "active" }], rows: [{ tablet: 0, row: 2, state: "returned" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 1, row: 0, state: "returned" }] },
        { op: "next", detail: "Next → price=89.99 is in [25,100] → return", tablets: [{ id: 0, state: "done" }, { id: 1, state: "active" }], rows: [{ tablet: 0, row: 2, state: "returned" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 1, row: 0, state: "returned" }, { tablet: 1, row: 1, state: "returned" }] },
        { op: "next", detail: "Next → price=129.00 > 100 → stop scan", tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }], rows: [{ tablet: 0, row: 2, state: "returned" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 1, row: 0, state: "returned" }, { tablet: 1, row: 1, state: "returned" }, { tablet: 1, row: 2, state: "scanned" }] },
        { op: "done", detail: "Complete: 2 tablets, 1 Seek, 5 Next, 4 rows returned", tablets: [], rows: [], summary: { tablets: 2, seeks: 1, nexts: 5, rows: 4 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "(-∞, 50)", rows: [
          { fields: ["9.99", "prod-501", "Budget Widget", "In Stock"] },
          { fields: ["19.99", "prod-220", "Basic Kit", "In Stock"] },
          { fields: ["29.99", "prod-102", "Standard Kit", "In Stock"] },
          { fields: ["45.00", "prod-315", "Mid-Range", "In Stock"] }
        ]},
        { id: "Tablet 2", range: "[50, 150)", rows: [
          { fields: ["59.99", "prod-441", "Pro Mouse", "In Stock"] },
          { fields: ["89.99", "prod-330", "Pro Suite", "Low"] },
          { fields: ["129.00", "prod-615", "Ultra Pack", "In Stock"] }
        ]},
        { id: "Tablet 3", range: "[150, ∞)", rows: [
          { fields: ["149.99", "prod-210", "Premium Pack", "In Stock"] },
          { fields: ["299.00", "prod-801", "Enterprise", "Pre-order"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "📊", text: "<b>Sequential Scan:</b> Range-sorted data means the scan is contiguous. Seek jumps to the start, then Next walks forward. When a value exceeds the upper bound, the scan stops immediately — no wasted I/O." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
  price      <span class="sql-type">DECIMAL</span>,
  product_id <span class="sql-type">TEXT</span>,
  name       <span class="sql-type">TEXT</span>,
  status     <span class="sql-type">TEXT</span>,
  <span class="sql-kw">PRIMARY KEY</span> (price <span class="sql-kw">ASC</span>, product_id)
);

<span class="sql-comment">-- Range scan: contiguous walk across tablets</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> products
<span class="sql-kw">WHERE</span> price <span class="sql-kw">BETWEEN</span> <span class="sql-str">25</span> <span class="sql-kw">AND</span> <span class="sql-str">100</span>;

<span class="sql-comment">-- DocDB execution:</span>
<span class="sql-comment">-- 1. Seek(25) in Tablet 1</span>
<span class="sql-comment">-- 2. Next, Next... across tablet boundary</span>
<span class="sql-comment">-- 3. Stop when price > 100</span>` },
    guidedTour: [
      { text: "Range scans are highly efficient on sorted data.", element: ".query-exec-container" },
      { text: "Use <b>Next Step</b> to watch the contiguous walk across tablets one row at a time.", element: "#qe-next-btn" },
      { text: "Click <b>Play All</b> to see the full scan flow cross tablet boundaries.", element: "#qe-play-btn" },
      { text: "Notice how it 'Seeks' once to the start, then 'Nexts' until it exceeds the range.", element: ".exec-log" }
    ]
  },

  "qe-skip-scan": {
    group: "Query Execution", icon: "⏭", title: "Skip Scan", subtitle: "Non-prefix column query",
    description: "When querying on the second column of a composite index, DocDB performs a Skip Scan: it Seeks into each distinct group of the first column, checks for a match, then skips to the next group.",
    legend: [
      { type: "clustering", label: "region ASC", explain: "First key in composite — groups data" },
      { type: "clustering", label: "created_at DESC", explain: "Second key — sorted within each group" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "region", role: "cl", dir: "ASC" }, { label: "created_at", role: "cl", dir: "DESC" },
        { label: "order_id", role: "" }, { label: "total", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM orders WHERE created_at = '2024-03-18'",
      targetKey: "2024-03-18",
      steps: [
        { op: "seek", detail: "Seek('APAC', '2024-03-18') → enter APAC group", tablets: [{ id: 0, state: "active" }], dimOthers: true, rows: [{ tablet: 0, row: 1, state: "cursor" }] },
        { op: "next", detail: "APAC/2024-03-18 → match found → return", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }] },
        { op: "skip", detail: "Skip past remaining APAC rows → Seek to EU group", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }] },
        { op: "seek", detail: "Seek('EU', '2024-03-18') → enter EU group", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }, { tablet: 0, row: 3, state: "cursor" }] },
        { op: "next", detail: "EU/2024-03-18 → match found → return", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }, { tablet: 0, row: 3, state: "returned" }] },
        { op: "skip", detail: "Skip past remaining EU rows → Seek to US group", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 0, row: 4, state: "skipped" }] },
        { op: "seek", detail: "Seek('US', '2024-03-18') → enter US group", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 0, row: 4, state: "skipped" }, { tablet: 0, row: 5, state: "cursor" }] },
        { op: "next", detail: "US/2024-03-18 → no match (2024-03-15) → done", tablets: [{ id: 0, state: "done" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "skipped" }, { tablet: 0, row: 3, state: "returned" }, { tablet: 0, row: 4, state: "skipped" }, { tablet: 0, row: 5, state: "scanned" }] },
        { op: "done", detail: "Complete: 1 tablet, 3 Seeks (skip), 3 Next, 2 rows", tablets: [], rows: [], summary: { tablets: 1, seeks: 3, nexts: 3, rows: 2 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "All Data", rows: [
          { fields: ["APAC", "2024-03-25", "ord-8812", "899.00"] },
          { fields: ["APAC", "2024-03-18", "ord-7244", "125.00"] },
          { fields: ["APAC", "2024-03-10", "ord-6601", "45.50"] },
          { fields: ["EU", "2024-03-20", "ord-9903", "349.00"] },
          { fields: ["EU", "2024-03-18", "ord-7701", "79.99"] },
          { fields: ["EU", "2024-03-05", "ord-5510", "220.00"] },
          { fields: ["US", "2024-03-25", "ord-4420", "159.00"] },
          { fields: ["US", "2024-03-15", "ord-3301", "89.00"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "⏭", text: "<b>Skip Scan + Packed Rows:</b> Instead of scanning every row, DocDB Seeks directly into each group of the first column, checks for a match on the second column, then <i>skips</i> to the next group. For matching rows, the Packed Row format ensures all other columns are retrieved without extra Next calls." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
  region     <span class="sql-type">TEXT</span>,
  created_at <span class="sql-type">DATE</span>,
  order_id   <span class="sql-type">TEXT</span>,
  total      <span class="sql-type">DECIMAL</span>,
  <span class="sql-kw">PRIMARY KEY</span> (region <span class="sql-kw">ASC</span>, created_at <span class="sql-kw">DESC</span>)
);

<span class="sql-comment">-- Query on 2nd column only → Skip Scan</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> created_at = <span class="sql-str">'2024-03-18'</span>;

<span class="sql-comment">-- DocDB: Seek(APAC, date) → check → Skip → Seek(EU, date) → ...</span>` },
    guidedTour: [
      { text: "Use <b>Next Step</b> to manually trace how DocDB 'skips' through the sorted data.", element: "#qe-next-btn" },
      { text: "Click <b>Play All</b> to see the full skipping logic in action.", element: "#qe-play-btn" },
      { text: "Notice how it only reads the rows matching the specific date, jumping over the rest.", element: ".tablet-card" }
    ]
  },

  "qe-index-lookup": {
    group: "Query Execution", icon: "🔗", title: "Index Scan", subtitle: "Index Scan + Table Fetch",
    description: "A query that uses a secondary index but needs columns not present in the index. DocDB must first query the index tablet to find the primary key, then perform a second RPC to fetch the full row from the main table.",
    visual: {
      type: "query-exec",
      indexColumns: [{ label: "[hash]", role: "sys" }, { label: "email", role: "sh" }, { label: "user_id (Ptr)", role: "pk" }],
      tableColumns: [{ label: "user_id", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    queryConfig: {
      sql: "SELECT name, region FROM users WHERE email = 'dan@co.com'",
      steps: [
        { op: "hash", detail: "Phase 1: HASH('dan@co.com') → 0xB321", tablets: [], rows: [] },
        { op: "route", detail: "Route to Index Tablet 3 (0xAAAB–0xFFFF)", tablets: [{ id: 2, state: "active" }], dimOthers: true, rows: [] },
        { op: "seek", detail: "Seek(0xB321) → cursor on index entry", tablets: [{ id: 2, state: "active" }], rows: [{ tablet: 2, row: 0, state: "cursor" }] },
        { op: "return", detail: "Found PK pointer: 'user-507'", tablets: [{ id: 2, state: "done" }], rows: [{ tablet: 2, row: 0, state: "returned" }] },
        { op: "route", detail: "Phase 2: Use PK to fetch main table row", tablets: [{ id: 4, state: "active" }], rows: [] },
        { op: "seek", detail: "Seek('user-507') in Table Tablet 2", tablets: [{ id: 4, state: "active" }], rows: [{ tablet: 4, row: 0, state: "cursor" }] },
        { op: "return", detail: "Full row fetched — extract 'name, region'", tablets: [{ id: 4, state: "done" }], rows: [{ tablet: 4, row: 0, state: "returned" }] },
        { op: "done", detail: "Complete: 2 RPCs, 2 Seeks", tablets: [], rows: [], summary: { tablets: 2, seeks: 2, nexts: 0, rows: 1 } }
      ]
    },
    initialState: {
      indexTablets: [
        { id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [{ fields: ["0x21F3", "alice@co.com", "user-241"] }, { fields: ["0x4B12", "bob@co.com", "user-892"] }] },
        { id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [{ fields: ["0x7D3A", "carol@co.com", "user-105"] }] },
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [{ fields: ["0xB321", "dan@co.com", "user-507"] }] }
      ],
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [{ fields: ["user-241", "alice@co.com", "Alice", "US", "Active"] }] },
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [{ fields: ["user-507", "dan@co.com", "Dan", "EU", "Active"] }, { fields: ["user-892", "bob@co.com", "Bob", "EU", "Pending"] }] },
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [{ fields: ["user-105", "carol@co.com", "Carol", "APAC", "Active"] }] }
      ]
    },
    callout: { type: "warn", icon: "⚠️", text: "<b>Secondary Index Penalty:</b> Because the query requested <code>name</code> and <code>region</code>, but the index only contains <code>email</code> and the PK pointer, DocDB is forced to make a second network hop (RPC) to the main table tablet to fetch the missing columns." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
  <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
  email   <span class="sql-type">TEXT</span>,
  name    <span class="sql-type">TEXT</span>,
  region  <span class="sql-type">TEXT</span>,
  status  <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE INDEX</span> idx_users_email
  <span class="sql-kw">ON</span> users (email);

<span class="sql-comment">-- Requires 2 RPCs (Index lookup + Main table fetch)</span>
<span class="sql-kw">SELECT</span> name, region <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'dan@co.com'</span>;` },
    guidedTour: [
      { text: "This is an interactive step-through. Click <b>Next Step</b> to manually advance the execution logic.", element: "#qe-next-btn" },
      { text: "Or click <b>Play All</b> to see the full multi-hop RPC flow automatically.", element: "#qe-play-btn" },
      { text: "Watch the 'Phase 1' lookup in the index tablet followed by the 'Phase 2' fetch in the main table.", element: ".query-exec-container" }
    ]
  },

  "qe-index-only": {
    group: "Query Execution", icon: "⚡", title: "Index-Only Scan", subtitle: "Covering Index",
    description: "A query where every requested column is present in the index itself (via INCLUDE clauses). The database returns the data directly from the index tablet, completely avoiding the expensive 2nd RPC to the main table.",
    visual: {
      type: "query-exec",
      indexColumns: [{ label: "[hash]", role: "sys" }, { label: "email", role: "sh" }, { label: "name", role: "inc" }, { label: "region", role: "inc" }, { label: "user_id (Ptr)", role: "pk" }],
      tableColumns: [{ label: "user_id", role: "pk" }, { label: "email", role: "" }, { label: "name", role: "" }, { label: "region", role: "" }, { label: "status", role: "" }]
    },
    queryConfig: {
      sql: "SELECT name, region FROM users WHERE email = 'dan@co.com'",
      steps: [
        { op: "hash", detail: "HASH('dan@co.com') → 0xB321", tablets: [], rows: [] },
        { op: "route", detail: "Route to Index Tablet 3", tablets: [{ id: 2, state: "active" }], dimOthers: true, rows: [] },
        { op: "seek", detail: "Seek(0xB321) → cursor on index entry", tablets: [{ id: 2, state: "active" }], rows: [{ tablet: 2, row: 0, state: "cursor" }] },
        { op: "return", detail: "All columns found in index! Return to client.", tablets: [{ id: 2, state: "done" }], rows: [{ tablet: 2, row: 0, state: "returned" }] },
        { op: "done", detail: "Complete: 1 RPC, 1 Seek. Extremely fast.", tablets: [], rows: [], summary: { tablets: 1, seeks: 1, nexts: 0, rows: 1 } }
      ]
    },
    initialState: {
      indexTablets: [
        { id: "Idx Tablet 1", range: "0x0000–0x5555", rows: [{ fields: ["0x21F3", "alice@co.com", "Alice", "US", "user-241"] }, { fields: ["0x4B12", "bob@co.com", "Bob", "EU", "user-892"] }] },
        { id: "Idx Tablet 2", range: "0x5556–0xAAAA", rows: [{ fields: ["0x7D3A", "carol@co.com", "Carol", "APAC", "user-105"] }] },
        { id: "Idx Tablet 3", range: "0xAAAB–0xFFFF", rows: [{ fields: ["0xB321", "dan@co.com", "Dan", "EU", "user-507"] }] }
      ],
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [{ fields: ["user-241", "alice@co.com", "Alice", "US", "Active"] }] },
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [{ fields: ["user-507", "dan@co.com", "Dan", "EU", "Active"] }, { fields: ["user-892", "bob@co.com", "Bob", "EU", "Pending"] }] },
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [{ fields: ["user-105", "carol@co.com", "Carol", "APAC", "Active"] }] }
      ]
    },
    callout: { type: "info", icon: "⚡", text: "<b>Covering Index:</b> By using the <code>INCLUDE (name, region)</code> clause, the index duplicates those columns. The query finds everything it needs in the index tablet, resulting in an <b>Index Only Scan</b>. The main table is never touched, halving latency." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
  <span class="pk-key">user_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
  email   <span class="sql-type">TEXT</span>,
  name    <span class="sql-type">TEXT</span>,
  region  <span class="sql-type">TEXT</span>,
  status  <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- Include additional columns to 'cover' queries</span>
<span class="sql-kw">CREATE INDEX</span> idx_users_email_covering
  <span class="sql-kw">ON</span> users (email)
  <span class="sql-kw">INCLUDE</span> (name, region);

<span class="sql-comment">-- Extremely fast! 1 RPC Index Only Scan</span>
<span class="sql-kw">SELECT</span> name, region <span class="sql-kw">FROM</span> users
<span class="sql-kw">WHERE</span> email = <span class="sql-str">'dan@co.com'</span>;` },
    guidedTour: [
      { text: "Click <b>Next Step</b> to manually observe why this is so much faster.", element: "#qe-next-btn" },
      { text: "Or click <b>Play All</b> to see the full covering index scan.", element: "#qe-play-btn" },
      { text: "Since the index covers all requested columns, notice there is <b>no second RPC</b> to the main table.", element: ".index-area" }
    ]
  },



  "qe-parallel-scan": {
    group: "Query Execution", icon: "⇄", title: "Parallel Range Scan", subtitle: "Secondary index — parallel RPCs + merge",
    description: "A range query on a secondary index spanning multiple tablets fires parallel RPCs to all relevant index tablets simultaneously. Each tablet performs its own Seek and scan concurrently — wall-clock time is roughly the slowest single tablet, not the sum. The YSQL layer merge-sorts the streams. With a covering index, no heap fetches are needed.",
    legend: [
      { type: "clustering", label: "price ASC (Index Key)", explain: "Secondary index key — range-sharded, determines index tablet boundaries" },
      { type: "include", label: "product, qty (INCLUDE)", explain: "Covering columns stored in the index — avoids heap fetch for these columns" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "price", role: "cl", dir: "ASC" }, { label: "product_id", role: "" },
        { label: "product", role: "" }, { label: "qty", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT product_id, product, qty FROM products WHERE price BETWEEN 30 AND 130",
      steps: [
        { op: "route", detail: "Analyze range [30, 130] on secondary index idx_products_price — overlaps all 3 index tablet boundaries: (-∞,60), [60,120), [120,∞)", ysqlStatus: "Analyzing query plan: range [30, 130] spans 3 index tablet boundaries — all 3 will be targeted", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [] },
        { op: "fanout", detail: "Fire parallel RPCs to all 3 index tablets simultaneously — covering index means no heap fetch needed for product_id, product, qty", ysqlStatus: "Dispatching parallel Seek RPCs to all 3 index tablets simultaneously (not sequentially)...", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [] },
        { op: "seek", detail: "T1: Seek(30)→35.00 | T2: Seek(60)→79.99 | T3: Seek(120)→122.00 — all 3 index cursors positioned in parallel", ysqlStatus: "Waiting… all 3 index tablets seeking to start positions in parallel (T1→35.00, T2→79.99, T3→122.00)", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 1, state: "cursor" }, { tablet: 1, row: 0, state: "cursor" }, { tablet: 2, row: 0, state: "cursor" }] },
        { op: "next", detail: "All 3 index tablets scan concurrently — T1: 35.00✓ 49.99✓ | T2: 79.99✓ 89.99✓ 115.00✓ | T3: 122.00✓ then 199.99>130 stop", ysqlStatus: "Receiving rows from 3 parallel streams — buffering for merge-sort (T1: 2 rows, T2: 3 rows, T3: 1 row)", tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }, { id: 2, state: "done" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 0, row: 2, state: "returned" }, { tablet: 1, row: 0, state: "returned" }, { tablet: 1, row: 1, state: "returned" }, { tablet: 1, row: 2, state: "returned" }, { tablet: 2, row: 0, state: "returned" }, { tablet: 2, row: 1, state: "scanned" }] },
        { op: "done", detail: "YSQL merge-sort → 6 rows in price order — covering index, zero heap fetches, 3 parallel RPCs, wall-clock ≈ slowest tablet", ysqlStatus: "✓ 6 rows in price order — merge-sorted from 3 parallel streams, zero heap fetches back to base table", tablets: [], rows: [], summary: { tablets: 3, seeks: 3, nexts: 7, rows: 6 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Idx Tablet 1", range: "(-∞, 60)", rows: [
          { fields: ["19.99", "prod-201", "Cable", "1"] },
          { fields: ["35.00", "prod-202", "Mouse", "2"] },
          { fields: ["49.99", "prod-203", "Keyboard", "1"] }
        ]},
        { id: "Idx Tablet 2", range: "[60, 120)", rows: [
          { fields: ["79.99", "prod-204", "Headset", "1"] },
          { fields: ["89.99", "prod-205", "Adapter", "3"] },
          { fields: ["115.00", "prod-206", "Webcam", "2"] }
        ]},
        { id: "Idx Tablet 3", range: "[120, ∞)", rows: [
          { fields: ["122.00", "prod-207", "Speaker", "1"] },
          { fields: ["199.99", "prod-208", "Monitor", "1"] },
          { fields: ["349.00", "prod-209", "Laptop", "1"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "⇄", text: "<b>Secondary Covering Index + Parallel Scan:</b> Base table PK is <code>product_id HASH</code>. The query hits <code>idx_products_price</code> (range-sharded by price) instead. All 3 index tablets receive parallel RPCs simultaneously. Because <code>product</code> and <code>qty</code> are INCLUDEd, there are zero heap fetches. Note how Idx Tablet 1 row 19.99 is never read — the Seek jumps directly to 30." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> products (
  product_id <span class="sql-type">TEXT PRIMARY KEY</span>,
  product    <span class="sql-type">TEXT</span>,
  price      <span class="sql-type">DECIMAL</span>,
  qty        <span class="sql-type">INT</span>
);

<span class="sql-comment">-- Covering secondary index, range-sharded by price</span>
<span class="sql-kw">CREATE INDEX</span> idx_products_price
  <span class="sql-kw">ON</span> products (<span class="cl-key">price ASC</span>)
  <span class="sql-kw">INCLUDE</span> (<span class="inc-key">product, qty</span>);
<span class="sql-comment">-- Idx T1: (-∞,60)  Idx T2: [60,120)  Idx T3: [120,∞)</span>

<span class="sql-comment">-- Covering index scan — no heap fetch needed</span>
<span class="sql-kw">SELECT</span> product_id, product, qty <span class="sql-kw">FROM</span> products
<span class="sql-kw">WHERE</span> price <span class="sql-kw">BETWEEN</span> <span class="sql-str">30</span> <span class="sql-kw">AND</span> <span class="sql-str">130</span>;

<span class="sql-comment">-- Wall-clock for parallel index scan:</span>
<span class="sql-comment">--   ≈ max(T1_time, T2_time, T3_time)  ← parallel</span>
<span class="sql-comment">--   ≠ T1_time + T2_time + T3_time     ← sequential</span>` },
    guidedTour: [
      { text: "The base table PK is <code>product_id</code> (hash-sharded). This scenario scans the <b>secondary index</b> <code>idx_products_price</code> instead.", element: ".tablet-card" },
      { text: "Click <b>Play All</b> to watch all 3 index tablets receive parallel RPCs and scan concurrently.", element: "#qe-play-btn" },
      { text: "The <b>FANOUT</b> step shows all 3 index tablets targeted at once — not sequentially.", element: ".exec-log" },
      { text: "INCLUDE columns (product, qty) are stored in the index — zero heap fetches back to the base table.", element: ".tablet-card" }
    ]
  },

  "qe-bucket-scan": {
    group: "Query Execution", icon: "🪣", title: "Bucket Index Scan",
    subtitle: "Merge Append across all bucket tablets",
    description: "A ts BETWEEN query on a bucket index always fans out to every bucket — there is no range-based pruning. Each bucket is an independent ts-sorted stream. YSQL performs a Merge Append: it holds a cursor at the head of each stream and repeatedly picks the next-largest ts, assembling the final ORDER BY ts DESC result without an extra sort step.",
    legend: [
      { type: "sharding", label: "bucket (Synthetic Key)", explain: "yb_hash_code(ts) % 3 — routes each ts to one of 3 tablets; all 3 are always scanned for any ts range query" },
      { type: "clustering", label: "ts DESC (Index Key)", explain: "Sorted newest-first within each bucket — Merge Append exploits this to avoid a post-scan sort" },
      { type: "include", label: "metric, value (INCLUDE)", explain: "Covering columns stored in the index — zero heap fetches needed" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "bucket", role: "sys" },
        { label: "ts", role: "cl", dir: "DESC" },
        { label: "event_id", role: "" },
        { label: "metric", role: "" },
        { label: "value", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT event_id, ts, metric, value FROM events WHERE ts BETWEEN '2024-01-01' AND '2024-04-01' ORDER BY ts DESC",
      steps: [
        {
          op: "route",
          detail: "Unlike a range-partitioned index, buckets cannot be pruned by ts range — every bucket contains timestamps from any date. All 3 must be scanned.",
          ysqlStatus: "Planner rewrites to 3 sub-scans: (bucket=0 ∧ ts BETWEEN), (bucket=1 ∧ ts BETWEEN), (bucket=2 ∧ ts BETWEEN) — all buckets always targeted",
          tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }],
          rows: []
        },
        {
          op: "fanout",
          detail: "3 parallel Index Scan RPCs dispatched — each sub-scan targets one bucket and carries the ts BETWEEN predicate inside the RPC",
          ysqlStatus: "Dispatching 3 parallel Index Scan RPCs — each targets one bucket with embedded ts BETWEEN '2024-01-01' AND '2024-04-01' predicate",
          tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }],
          rows: []
        },
        {
          op: "seek",
          detail: "Each bucket seeks to first ts ≤ '2024-04-01' (DESC order). B0→2024-03-22  B1→2024-02-20  B2→2024-02-08 — all 3 cursors positioned in parallel",
          ysqlStatus: "All 3 buckets seeking in parallel — B0→2024-03-22, B1→2024-02-20, B2→2024-02-08 (entries above range skipped by seek)",
          tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }],
          rows: [
            { tablet: 0, row: 0, state: "cursor" },
            { tablet: 1, row: 0, state: "cursor" },
            { tablet: 2, row: 0, state: "cursor" }
          ]
        },
        {
          op: "next",
          detail: "All 3 streams scan through their range — B0: 2024-03-22✓ 2024-01-03✓ | B1: 2024-02-20✓ 2024-01-15✓ | B2: 2024-02-08✓",
          ysqlStatus: "Streaming from 3 ts-sorted streams — B0: 2 rows, B1: 2 rows, B2: 1 row — buffering stream heads for Merge Append",
          tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }, { id: 2, state: "done" }],
          rows: [
            { tablet: 0, row: 0, state: "returned" },
            { tablet: 0, row: 1, state: "returned" },
            { tablet: 1, row: 0, state: "returned" },
            { tablet: 1, row: 1, state: "returned" },
            { tablet: 2, row: 0, state: "returned" }
          ]
        },
        {
          op: "return",
          detail: "Merge Append: YSQL holds 3 stream cursors and repeatedly picks the max ts — 2024-03-22 → 2024-02-20 → 2024-02-08 → 2024-01-15 → 2024-01-03",
          ysqlStatus: "Merge Append: pulling next-largest ts from 3 stream heads — 2024-03-22 → 2024-02-20 → 2024-02-08 → 2024-01-15 → 2024-01-03",
          tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }, { id: 2, state: "done" }],
          rows: [
            { tablet: 0, row: 0, state: "returned" },
            { tablet: 0, row: 1, state: "returned" },
            { tablet: 1, row: 0, state: "returned" },
            { tablet: 1, row: 1, state: "returned" },
            { tablet: 2, row: 0, state: "returned" }
          ]
        },
        {
          op: "done",
          detail: "5 rows in ts DESC order — 3 parallel bucket scans + Merge Append, no extra Sort node, zero heap fetches",
          ysqlStatus: "✓ 5 rows in ts DESC order — Merge Append from 3 parallel bucket streams, no post-sort needed (each bucket already ts-ordered)",
          tablets: [],
          rows: [],
          summary: { tablets: 3, seeks: 3, nexts: 5, rows: 5 }
        }
      ]
    },
    initialState: {
      tablets: [
        { id: "Bucket 0", range: "bucket = 0", rows: [
          { fields: ["0", "2024-03-22", "ev-3301", "disk_io",  "91.1"] },
          { fields: ["0", "2024-01-03", "ev-0512", "cpu_pct",  "55.0"] }
        ]},
        { id: "Bucket 1", range: "bucket = 1", rows: [
          { fields: ["1", "2024-02-20", "ev-2201", "net_rx",   "33.5"] },
          { fields: ["1", "2024-01-15", "ev-1001", "cpu_pct",  "73.2"] }
        ]},
        { id: "Bucket 2", range: "bucket = 2", rows: [
          { fields: ["2", "2024-02-08", "ev-2205", "mem_mb",   "45.8"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "🪣", text: "<b>Bucket scan vs Range scan:</b> A range-partitioned index can prune tablets — <code>WHERE price BETWEEN 30 AND 130</code> may skip some tablets entirely. A bucket index cannot prune — <em>every</em> bucket is always scanned because timestamps are hashed across all of them. The payoff is on the write side: 3× the write throughput, no hotspot. YSQL's Merge Append keeps reads efficient by exploiting the per-bucket ts ordering without a full re-sort." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> events (
    <span class="pk-key">event_id</span>  <span class="sql-type">TEXT PRIMARY KEY</span>,
    ts        <span class="sql-type">TIMESTAMPTZ</span>,
    metric    <span class="sql-type">TEXT</span>,
    value     <span class="sql-type">DECIMAL</span>
);

<span class="sql-comment">-- Bucket index: 3 tablets, ts-sorted within each</span>
<span class="sql-kw">CREATE INDEX</span> idx_events_ts <span class="sql-kw">ON</span> events (
    (<span class="sh-key">yb_hash_code(ts) % 3</span>) <span class="sql-kw">ASC</span>,
    <span class="cl-key">ts DESC</span>
) <span class="sql-kw">INCLUDE</span> (<span class="inc-key">metric, value</span>)
  <span class="sql-kw">SPLIT AT VALUES</span> ((1), (2));

<span class="sql-comment">-- EXPLAIN (Merge Append of 3 sub-scans):</span>
<span class="sql-comment">-- Merge Append  (Sort Key: ts DESC)</span>
<span class="sql-comment">--   -> Index Scan idx_events_ts (bucket=0 ∧ ts BETWEEN)</span>
<span class="sql-comment">--   -> Index Scan idx_events_ts (bucket=1 ∧ ts BETWEEN)</span>
<span class="sql-comment">--   -> Index Scan idx_events_ts (bucket=2 ∧ ts BETWEEN)</span>

<span class="sql-kw">SELECT</span> event_id, ts, metric, value
<span class="sql-kw">FROM</span>   events
<span class="sql-kw">WHERE</span>  ts <span class="sql-kw">BETWEEN</span> <span class="sql-str">'2024-01-01'</span> <span class="sql-kw">AND</span> <span class="sql-str">'2024-04-01'</span>
<span class="sql-kw">ORDER BY</span> ts <span class="sql-kw">DESC</span>;`
    },
    guidedTour: [
      { text: "Each bucket tablet holds a random subset of all timestamps, sorted ts DESC within the bucket. No time range maps to just one bucket.", element: ".tablet-card" },
      { text: "Click <b>Play All</b> — the ROUTE step explains why all 3 buckets are always targeted, unlike a range-partitioned index where some tablets can be skipped.", element: "#qe-play-btn" },
      { text: "The SEEK step positions a cursor in each bucket at the first ts ≤ '2024-04-01'. Entries above the range are skipped without being scanned.", element: ".exec-log" },
      { text: "The RETURN step shows the Merge Append — YSQL picks the max ts from 3 stream heads on each pull. No extra Sort node needed because each bucket is already ts-ordered.", element: "#ysql-layer" }
    ]
  },

  "qe-expr-pushdown": {
    group: "Query Execution", icon: "σ", title: "Expression Pushdown",
    subtitle: "Filter at DocDB, not YSQL",
    description: "WHERE clause predicates are pushed down into the DocDB RPC itself. Each tablet evaluates the predicate locally and returns only matching rows. Rows that fail the filter are discarded at the storage layer before they ever reach the network — eliminating unnecessary data transfer entirely.",
    legend: [
      { type: "sharding", label: "order_id (Hash)", explain: "Sharding key — determines tablet placement" },
      { type: "data", label: "status, total", explain: "Filter columns — predicate evaluated inside DocDB at each tablet" }
    ],
    visual: {
      type: "query-exec",
      columns: [
        { label: "[hash]", role: "sys" }, { label: "order_id", role: "sh" },
        { label: "region", role: "" }, { label: "status", role: "" }, { label: "total ($)", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT * FROM orders WHERE status = 'active' AND total > 100",
      steps: [
        { op: "route", detail: "Hash-sharded table → scatter-gather plan. Embedding predicate (status='active' AND total > 100) directly in the DocDB RPC payload — not as a post-transfer filter", ysqlStatus: "Planning query — predicate will travel with the RPC, evaluated at each tablet before any rows are sent", tablets: [{id:0,state:"active"},{id:1,state:"active"},{id:2,state:"active"}], rows: [] },
        { op: "fanout", detail: "Broadcast RPC+predicate to all 3 tablets simultaneously — each receives the filter and evaluates it locally against its own rows", ysqlStatus: "Dispatching RPCs with embedded filter — predicate travels to the data, not data to the filter", tablets: [{id:0,state:"active"},{id:1,state:"active"},{id:2,state:"active"}], rows: [] },
        { op: "filter", detail: "Tablet 1: ord-101✓ (active, $149.99) · ord-103✓ (active, $299.00) · ord-102✗ dropped (status≠active) — never leaves this tablet", ysqlStatus: "Tablet 1 evaluating predicate locally — 2 rows pass (green), 1 dropped at storage layer (strikethrough)", tablets: [{id:0,state:"active"},{id:1,state:"active"},{id:2,state:"active"}], rows: [{tablet:0,row:0,state:"returned"},{tablet:0,row:1,state:"skipped"},{tablet:0,row:2,state:"returned"}] },
        { op: "filter", detail: "Tablet 2: ord-106✓ (active, $249.00) · ord-104✗ (status≠active) · ord-105✗ (total=$89.99 < $100) — both dropped at DocDB", ysqlStatus: "Tablet 2 evaluating predicate locally — 1 row passes, 2 dropped (1 wrong status, 1 total < 100)", tablets: [{id:0,state:"done"},{id:1,state:"active"},{id:2,state:"active"}], rows: [{tablet:0,row:0,state:"returned"},{tablet:0,row:1,state:"skipped"},{tablet:0,row:2,state:"returned"},{tablet:1,row:0,state:"skipped"},{tablet:1,row:1,state:"skipped"},{tablet:1,row:2,state:"returned"}] },
        { op: "filter", detail: "Tablet 3: ord-108✓ (active, $119.99) · ord-107✗ (status≠active) · ord-109✗ (status≠active) — both dropped at DocDB", ysqlStatus: "Tablet 3 evaluating predicate locally — 1 row passes, 2 dropped (both inactive)", tablets: [{id:0,state:"done"},{id:1,state:"done"},{id:2,state:"active"}], rows: [{tablet:0,row:0,state:"returned"},{tablet:0,row:1,state:"skipped"},{tablet:0,row:2,state:"returned"},{tablet:1,row:0,state:"skipped"},{tablet:1,row:1,state:"skipped"},{tablet:1,row:2,state:"returned"},{tablet:2,row:0,state:"skipped"},{tablet:2,row:1,state:"returned"},{tablet:2,row:2,state:"skipped"}] },
        { op: "return", detail: "Only 4 matching rows cross the network — 5 rows discarded at tablet layer, zero unnecessary bytes transferred to YSQL", ysqlStatus: "Receiving 4 rows only — 5 of 9 dropped at DocDB (green = transferred ✓, strikethrough = dropped at tablet ✗)", tablets: [{id:0,state:"done"},{id:1,state:"done"},{id:2,state:"done"}], rows: [{tablet:0,row:0,state:"returned"},{tablet:0,row:1,state:"skipped"},{tablet:0,row:2,state:"returned"},{tablet:1,row:0,state:"skipped"},{tablet:1,row:1,state:"skipped"},{tablet:1,row:2,state:"returned"},{tablet:2,row:0,state:"skipped"},{tablet:2,row:1,state:"returned"},{tablet:2,row:2,state:"skipped"}] },
        { op: "done", detail: "Result: 4 rows — 9 total scanned, 5 filtered at DocDB. Without pushdown: all 9 rows would transfer to YSQL before filtering", ysqlStatus: "✓ 4 rows returned — 56% filtered at DocDB, never transferred (run EXPLAIN to see: Storage Filter: ...)", tablets: [], rows: [{tablet:0,row:0,state:"returned"},{tablet:0,row:1,state:"skipped"},{tablet:0,row:2,state:"returned"},{tablet:1,row:0,state:"skipped"},{tablet:1,row:1,state:"skipped"},{tablet:1,row:2,state:"returned"},{tablet:2,row:0,state:"skipped"},{tablet:2,row:1,state:"returned"},{tablet:2,row:2,state:"skipped"}], summary: { tablets: 3, seeks: 3, nexts: 9, rows: 4 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x1A23", "ord-101", "US", "active", "149.99"] },
          { fields: ["0x2B34", "ord-102", "EU", "inactive", "49.99"] },
          { fields: ["0x4C55", "ord-103", "APAC", "active", "299.00"] }
        ]},
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x6D66", "ord-104", "US", "inactive", "199.99"] },
          { fields: ["0x7E77", "ord-105", "EU", "active", "89.99"] },
          { fields: ["0x9F88", "ord-106", "US", "active", "249.00"] }
        ]},
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xBB99", "ord-107", "APAC", "inactive", "399.00"] },
          { fields: ["0xCC00", "ord-108", "EU", "active", "119.99"] },
          { fields: ["0xDD11", "ord-109", "US", "inactive", "59.99"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "σ", text: "<b>Expression Pushdown:</b> The WHERE predicate travels <i>inside</i> the DocDB RPC — evaluated at the tablet server, not at YSQL. Strikethrough rows were discarded at the storage layer and never touched the network. For tables with millions of rows and a highly selective filter, pushdown is the difference between a practical and an impractical query. Use <code>EXPLAIN</code> and look for <b>Storage Filter</b> to confirm pushdown is active." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
  order_id <span class="sql-type">TEXT PRIMARY KEY</span>,
  region   <span class="sql-type">TEXT</span>,
  status   <span class="sql-type">TEXT</span>,
  total    <span class="sql-type">DECIMAL</span>
);

<span class="sql-comment">-- Predicate pushed to DocDB — evaluated at each tablet</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> status = <span class="sql-str">'active'</span> <span class="sql-kw">AND</span> total > <span class="sql-str">100</span>;

<span class="sql-comment">-- Verify pushdown is active:</span>
<span class="sql-kw">EXPLAIN SELECT</span> * <span class="sql-kw">FROM</span> orders
<span class="sql-kw">WHERE</span> status = <span class="sql-str">'active'</span> <span class="sql-kw">AND</span> total > <span class="sql-str">100</span>;
<span class="sql-comment">-- ✓ Storage Filter: (status = 'active') AND (total > 100)</span>

<span class="sql-comment">-- Disable pushdown to compare (testing only):</span>
<span class="sql-comment">-- SET yb_enable_expression_pushdown = false;</span>

<span class="sql-comment">-- Cost comparison (9 rows, 4 match):</span>
<span class="sql-comment">--   With pushdown:    4 rows × row_size transferred ✓</span>
<span class="sql-comment">--   Without pushdown: 9 rows × row_size transferred ✗</span>` },
    guidedTour: [
      { text: "Watch the YSQL Layer banner — the predicate is <b>embedded in the RPC</b> payload before it leaves YSQL.", element: "#ysql-layer" },
      { text: "Click <b>Step</b> through the FILTER steps — each tablet evaluates the predicate independently.", element: "#qe-step-btn" },
      { text: "Green rows matched the predicate and will be transferred. Strikethrough rows were dropped <i>inside the tablet</i> — they never touch the network.", element: ".tablet-card" },
      { text: "Only 4 of 9 rows returned. For large tables, this ratio determines query feasibility.", element: ".exec-log" }
    ]
  },

  "qe-agg-pushdown": {
    group: "Query Execution", icon: "∑", title: "Aggregate Pushdown", subtitle: "COUNT & SUM pushed to tablets",
    description: "SELECT COUNT(*), SUM(total) FROM orders. YugabyteDB pushes the aggregation directly into each tablet server. Each tablet computes a local partial result independently and in parallel, returning only a tiny summary — not raw rows. The YSQL query layer then merges the partial aggregates into the final answer.",
    visual: {
      type: "query-exec",
      columns: [
        { label: "[hash]", role: "sys" }, { label: "order_id", role: "sh" },
        { label: "customer", role: "" }, { label: "total ($)", role: "" }, { label: "region", role: "" }
      ]
    },
    queryConfig: {
      sql: "SELECT COUNT(*), SUM(total) FROM orders",
      steps: [
        { op: "fanout", detail: "Pushdown: send partial-aggregate request to all 3 tablets in parallel — no raw rows will cross the network", ysqlStatus: "Dispatching partial-aggregate RPC to all 3 tablet servers in parallel...", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [] },
        { op: "agg", detail: "Tablet 1 (local): scan 3 rows → partial COUNT=3, SUM=$294.99", ysqlStatus: "Waiting… Tablet 1 computing local aggregate (scanning 3 rows)", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 0, row: 1, state: "scanned" }, { tablet: 0, row: 2, state: "scanned" }] },
        { op: "agg", detail: "Tablet 2 (local): scan 2 rows → partial COUNT=2, SUM=$229.99", ysqlStatus: "Waiting… Tablet 2 computing local aggregate (scanning 2 rows)", tablets: [{ id: 0, state: "done" }, { id: 1, state: "active" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 0, row: 1, state: "scanned" }, { tablet: 0, row: 2, state: "scanned" }, { tablet: 1, row: 0, state: "scanned" }, { tablet: 1, row: 1, state: "scanned" }] },
        { op: "agg", detail: "Tablet 3 (local): scan 3 rows → partial COUNT=3, SUM=$348.97", ysqlStatus: "Waiting… Tablet 3 computing local aggregate (scanning 3 rows)", tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }, { id: 2, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }, { tablet: 0, row: 1, state: "scanned" }, { tablet: 0, row: 2, state: "scanned" }, { tablet: 1, row: 0, state: "scanned" }, { tablet: 1, row: 1, state: "scanned" }, { tablet: 2, row: 0, state: "scanned" }, { tablet: 2, row: 1, state: "scanned" }, { tablet: 2, row: 2, state: "scanned" }] },
        { op: "return", detail: "Each tablet returns one tiny summary: (3,$294.99) | (2,$229.99) | (3,$348.97) — not 8 raw rows", ysqlStatus: "Receiving 3 partial summaries: (COUNT=3, SUM=$294.99) · (COUNT=2, SUM=$229.99) · (COUNT=3, SUM=$348.97)", tablets: [{ id: 0, state: "done" }, { id: 1, state: "done" }, { id: 2, state: "done" }], rows: [] },
        { op: "done", detail: "YSQL merges → COUNT=8, SUM=$873.95 — only 3 RPCs, zero raw row transfers", ysqlStatus: "✓ Final result: COUNT=8, SUM=$873.95 — merged from 3 partial aggregates, 0 raw rows transferred", tablets: [], rows: [], summary: { tablets: 3, seeks: 3, nexts: 8, rows: 1 } }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["0x1A23", "ord-101", "Alice", "99.99", "US"] },
          { fields: ["0x3B44", "ord-102", "Bob", "149.99", "EU"] },
          { fields: ["0x4C55", "ord-103", "Carol", "45.01", "APAC"] }
        ]},
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["0x6D66", "ord-104", "Dan", "79.99", "EU"] },
          { fields: ["0x8E77", "ord-105", "Eve", "150.00", "US"] }
        ]},
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["0xB188", "ord-106", "Frank", "199.99", "APAC"] },
          { fields: ["0xD299", "ord-107", "Grace", "119.99", "EU"] },
          { fields: ["0xF3AA", "ord-108", "Hank", "28.99", "US"] }
        ]}
      ]
    },
    callout: { type: "info", icon: "∑", text: "<b>Aggregate Pushdown:</b> Instead of streaming all 8 raw rows to YSQL, DocDB computes <code>COUNT</code> and <code>SUM</code> inside each tablet and returns just 3 tiny summaries. For a 1-billion-row table, the difference between sending 1B rows vs 3 numbers is the difference between a practical and an impractical query." },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> orders (
  order_id <span class="sql-type">TEXT</span> <span class="sql-kw">PRIMARY KEY</span>,
  customer <span class="sql-type">TEXT</span>,
  total    <span class="sql-type">DECIMAL</span>,
  region   <span class="sql-type">TEXT</span>
);

<span class="sql-comment">-- Aggregate is pushed down into each tablet server</span>
<span class="sql-kw">SELECT</span> <span class="sql-fn">COUNT</span>(*), <span class="sql-fn">SUM</span>(total) <span class="sql-kw">FROM</span> orders;

<span class="sql-comment">-- Per tablet, DocDB computes locally:</span>
<span class="sql-comment">--   Tablet 1 → (COUNT=3, SUM=294.99)</span>
<span class="sql-comment">--   Tablet 2 → (COUNT=2, SUM=229.99)</span>
<span class="sql-comment">--   Tablet 3 → (COUNT=3, SUM=348.97)</span>

<span class="sql-comment">-- YSQL merges partial results:</span>
<span class="sql-comment">--   COUNT = 3 + 2 + 3 = 8</span>
<span class="sql-comment">--   SUM   = 294.99 + 229.99 + 348.97 = $873.95</span>

<span class="sql-comment">-- ✓ 3 RPCs, 0 raw rows transferred over the network</span>` },
    guidedTour: [
      { text: "Click <b>Play All</b> to watch aggregation happen simultaneously across all tablets.", element: "#qe-play-btn" },
      { text: "Each <b>AGG</b> step in the log shows a tablet completing its local computation.", element: ".exec-log" },
      { text: "The final <b>DONE</b> step shows YSQL merging 3 partial sums — no rows were ever sent over the network.", element: ".exec-summary" }
    ]
  },

  "qe-join-nl": {
    group: "Query Execution", icon: "🤝", title: "Nested Loop Join", subtitle: "users ⨝ orders",
    description: "In a Nested Loop Join, the query layer scans the outer table (users) and for every row it finds, it issues a Seek to the inner table (orders) using the join key. This works well when the outer result set is small, but can be slow for large sets.",
    visual: {
      type: "query-exec",
      topTitle: "▸ users Table (Outer)", topColor: "var(--accent)",
      bottomTitle: "▸ orders Table (Inner)", bottomColor: "var(--green)",
      indexColumns: [{ label: "[hash]", role: "sys" }, { label: "user_id", role: "pk" }, { label: "name", role: "" }],
      tableColumns: [{ label: "[hash]", role: "sys" }, { label: "order_id", role: "pk" }, { label: "user_id", role: "sh" }, { label: "total", role: "" }]
    },
    queryConfig: {
      sql: `SELECT u.name, o.total
FROM users u JOIN orders o
ON u.user_id = o.user_id
WHERE u.name = 'Dan';`,
      steps: [
        { op: "route", detail: "Start Full Scan on Users table for name='Dan'", tablets: [{ id: 0, state: "active" }, { id: 1, state: "active" }], rows: [] },
        { op: "next", detail: "Users T1: Skip Alice (no match)", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 0, state: "scanned" }] },
        { op: "next", detail: "Users T1: Found Dan!", tablets: [{ id: 0, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }] },
        { op: "hash", detail: "Execute Inner Loop: HASH('user-507') → 0x8A11", tablets: [{ id: 0, state: "done" }], rows: [{ tablet: 0, row: 1, state: "returned" }] },
        { op: "seek", detail: "Seek(0x8A11) in Orders T2", tablets: [{ id: 0, state: "done" }, { id: 3, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 3, row: 0, state: "cursor" }] },
        { op: "return", detail: "Yield joined row: (Dan, 150.00)", tablets: [{ id: 0, state: "done" }, { id: 3, state: "done" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 3, row: 0, returned: true, state: "returned" }] },
        { op: "next", detail: "Continue outer scan... end of tables.", tablets: [{ id: 0, state: "done" }, { id: 1, state: "active" }], rows: [{ tablet: 0, row: 1, state: "returned" }, { tablet: 3, row: 0, state: "returned" }, { tablet: 1, row: 0, state: "scanned" }] },
        { op: "done", detail: "Complete: 1 Outer Scan + 1 Inner Seek", tablets: [], rows: [], summary: { tablets: 3, seeks: 2, nexts: 4, rows: 1 } }
      ]
    },
    initialState: {
      indexTablets: [
        { id: "Users Tablet 1", range: "0x0000–0x7FFF", rows: [{ fields: ["0x21F3", "user-241", "Alice"] }, { fields: ["0x4B12", "user-507", "Dan"] }] },
        { id: "Users Tablet 2", range: "0x8000–0xFFFF", rows: [{ fields: ["0xB321", "user-105", "Carol"] }] }
      ],
      tableTablets: [
        { id: "Orders Tablet 1", range: "0x0000–0x7FFF", rows: [{ fields: ["0x33F1", "ord-99", "user-241", "45.00"] }] },
        { id: "Orders Tablet 2", range: "0x8000–0xFFFF", rows: [{ fields: ["0x8A11", "ord-42", "user-507", "150.00"] }, { fields: ["0xC42A", "ord-88", "user-105", "99.00"] }] }
      ]
    },
    callout: { type: "info", icon: "🤝", text: "<b>Nested Loop Join:</b> YugabyteDB's query layer executes the join by taking rows from the outer table and issuing point lookups (Seeks) to the inner table. Notice how the inner table is accessed directly via Hash Seek, preventing a full table scan on orders!" },
    guide: {
      richSql: `<span class="sql-kw">CREATE TABLE</span> users (
  user_id <span class="sql-type">TEXT PRIMARY KEY</span>,
  name    <span class="sql-type">TEXT</span>
);

<span class="sql-kw">CREATE TABLE</span> orders (
  order_id <span class="sql-type">TEXT PRIMARY KEY</span>,
  user_id  <span class="sql-type">TEXT</span>,
  total    <span class="sql-type">DECIMAL</span>
);

<span class="sql-comment">-- Join executed at the query layer</span>
<span class="sql-kw">SELECT</span> u.name, o.total
<span class="sql-kw">FROM</span> users u
<span class="sql-kw">JOIN</span> orders o <span class="sql-kw">ON</span> u.user_id = o.user_id
<span class="sql-kw">WHERE</span> u.name = <span class="sql-str">'Dan'</span>;` },
    guidedTour: [
      { text: "Click <b>Play All</b> to see the join logic in action.", element: "#qe-play-btn" },
      { text: "Observe the <b>Outer Scan</b> on the Users table (blue) followed by the <b>Inner Seek</b> on the Orders table (green).", element: ".query-exec-container" }
    ]
  },

  /* ═══════════════════════════════════════════════════════════
     DATA MODELING PATTERNS — Production schema recipes
     ═══════════════════════════════════════════════════════════ */
  "pattern-timeseries": {
    group: "Data Modeling Patterns", icon: "📅", title: "Time-Series",
    subtitle: "Bucket index on ts — write-scalable",
    description: "A plain range index on a timestamp column creates a permanent write hotspot — every new row is 'now', so all writes pile onto the last tablet. The fix: a synthetic bucket prefix derived from the timestamp distributes writes across N tablets from the start. Reads fan out across all buckets and merge, but the write throughput scales linearly with N.",
    inputPlaceholder: "Enter a date (e.g. 2024-01-15, 2024-03-22)...",
    scanDefault: "ts BETWEEN '2024-03-01' AND '2024-04-30'",
    legend: [
      { type: "sharding", label: "bucket (Synthetic)", explain: "yb_hash_code(ts) % 3 — assigns each timestamp to one of 3 index tablets, preventing all concurrent writes from landing on the same one" },
      { type: "clustering", label: "ts DESC (Index)", explain: "Sorted newest-first within each bucket — recency-ordered scans stay sequential" },
      { type: "ptr", label: "event_id (Ptr)", explain: "Pointer back to the base table primary key" }
    ],
    generateRow: (v) => {
      const dates = ["2024-01-15", "2024-02-08", "2024-03-22", "2024-04-10", "2024-05-01"];
      const rawDate = (v || "").trim();
      const ts = rawDate.match(/^\d{4}-\d{2}-\d{2}/) ? rawDate.substring(0, 10) :
                 rawDate.match(/^\d{4}-\d{2}$/) ? rawDate + "-" + String(Math.floor(Math.random()*28)+1).padStart(2,'0') :
                 dates[Math.floor(Math.random() * dates.length)];
      const bucket = Math.floor(Math.random() * 3);
      const eventId = "ev-" + Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      const devices = ["dev-A1", "dev-B2", "dev-C3", "dev-D4", "dev-E5"];
      const metrics = ["cpu_pct", "mem_mb", "disk_io", "net_rx"];
      return {
        index: { fields: [String(bucket), ts, eventId] },
        table: { fields: [eventId, ts, devices[Math.floor(Math.random()*5)], metrics[Math.floor(Math.random()*4)], String((Math.random()*100).toFixed(1))] }
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [
        { label: "bucket", role: "sh", dir: "ASC" },
        { label: "ts", role: "cl", dir: "DESC" },
        { label: "event_id (Ptr)", role: "pk" }
      ],
      tableColumns: [
        { label: "event_id (PK)", role: "pk" },
        { label: "ts", role: "" },
        { label: "device_id", role: "" },
        { label: "metric", role: "" },
        { label: "value", role: "" }
      ]
    },
    initialState: {
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x5555", rows: [
          { fields: ["ev-1001", "2024-01-15", "dev-A1", "cpu_pct", "73.2"] },
          { fields: ["ev-3301", "2024-03-22", "dev-B2", "disk_io", "91.1"] }
        ]},
        { id: "Table Tablet 2", range: "0x5556–0xAAAA", rows: [
          { fields: ["ev-2205", "2024-02-08", "dev-C3", "mem_mb", "45.8"] },
          { fields: ["ev-4102", "2024-04-10", "dev-D4", "net_rx", "22.7"] }
        ]},
        { id: "Table Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { fields: ["ev-0512", "2024-01-03", "dev-E5", "cpu_pct", "55.0"] }
        ]}
      ],
      indexTablets: [
        { id: "Bucket 0", range: "bucket = 0", rows: [
          { fields: ["0", "2024-04-10", "ev-4102"] },
          { fields: ["0", "2024-01-03", "ev-0512"] }
        ]},
        { id: "Bucket 1", range: "bucket = 1", rows: [
          { fields: ["1", "2024-03-22", "ev-3301"] },
          { fields: ["1", "2024-01-15", "ev-1001"] }
        ]},
        { id: "Bucket 2", range: "bucket = 2", rows: [
          { fields: ["2", "2024-02-08", "ev-2205"] }
        ]}
      ]
    },
    callout: { type: "warn", icon: "📅", text: "<b>The hotspot trap:</b> <code>CREATE INDEX ON events (ts DESC)</code> creates a single range tablet that receives every new write. At high ingestion rates this tablet becomes the bottleneck for the entire cluster. The bucket prefix — <code>yb_hash_code(ts) % N</code> — spreads writes across N tablets from day one. A range query for a time window must fan out to all N buckets and merge results, but with parallel RPCs the wall-clock cost is just the slowest single bucket." },
    guide: {
      richSql: `<span class="sql-comment">-- Base table — hash-sharded by event_id</span>
<span class="sql-kw">CREATE TABLE</span> events (
    <span class="pk-key">event_id</span>  <span class="sql-type">TEXT PRIMARY KEY</span>,
    ts        <span class="sql-type">TIMESTAMPTZ</span>,
    device_id <span class="sql-type">TEXT</span>,
    metric    <span class="sql-type">TEXT</span>,
    value     <span class="sql-type">DECIMAL</span>
);

<span class="sql-comment">-- ❌ Wrong: plain ts index → permanent write hotspot</span>
<span class="sql-kw">CREATE INDEX</span> idx_bad <span class="sql-kw">ON</span> events (ts <span class="sql-kw">DESC</span>);

<span class="sql-comment">-- ✅ Bucket index: N=4 tablets, writes spread evenly</span>
<span class="sql-kw">CREATE INDEX</span> idx_events_ts <span class="sql-kw">ON</span> events (
    (<span class="sh-key">yb_hash_code(ts) % 3</span>) <span class="sql-kw">ASC</span>,
    <span class="cl-key">ts DESC</span>
) <span class="sql-kw">SPLIT AT VALUES</span> ((1), (2));

<span class="sql-comment">-- Range query: planner fans out across all 3 buckets</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> events
<span class="sql-kw">WHERE</span> ts >= <span class="sql-str">'2024-03-01'</span> <span class="sql-kw">AND</span> ts < <span class="sql-str">'2024-04-01'</span>
<span class="sql-kw">ORDER BY</span> ts <span class="sql-kw">DESC LIMIT</span> 100;

<span class="sql-comment">-- Each bucket returns its slice, merged by YSQL:</span>
<span class="sql-comment">-- Bucket 0: (0,'2024-03-28',ev-...) → (0,'2024-03-01',ev-...)</span>
<span class="sql-comment">-- Bucket 1: (1,'2024-03-25',ev-...) → (1,'2024-03-02',ev-...)</span>
<span class="sql-comment">-- ... merged and limited to 100 rows</span>`
    },
    guidedTour: [
      { text: "3 bucket index tablets replace a single range index tablet — each bucket handles ⅓ of all timestamp writes.", element: ".index-area" },
      { text: "Insert a few rows and watch them land in different buckets. The bucket is determined by <code>yb_hash_code(ts) % 3</code>, which distributes dates across the 3 tablets.", element: ".index-row" },
      { text: "Click <b>Auto Generate</b> quickly — notice no single bucket becomes a bottleneck even under fast concurrent inserts.", element: ".secondary-btn" },
      { text: "A <code>WHERE ts BETWEEN ... AND ...</code> scan fans out to all 3 buckets in parallel and merges. The trade: 3× read RPCs, but write throughput scales with N.", element: ".tablet-grid" }
    ]
  },

  "pattern-multitenant": {
    group: "Data Modeling Patterns", icon: "🏢", title: "Multi-Tenant",
    subtitle: "tenant_id HASH as first PK component",
    description: "In SaaS schemas, tenant_id must always be the first hash-sharded component of the primary key. This ensures every row for a tenant lands in a deterministic tablet — a query with WHERE tenant_id = 'acme' routes to exactly one tablet. Without this, a per-tenant query fans out to all tablets in the cluster, multiplying RPC cost by the tablet count.",
    inputPlaceholder: "Enter tenant_id (e.g. acme-corp, initech, umbrella)...",
    scanDefault: "tenant_id = 'acme-corp'",
    legend: [
      { type: "sharding", label: "tenant_id (HASH)", explain: "First PK component — HASH(tenant_id) pins all rows for a tenant to one tablet, enabling single-tablet per-tenant queries" },
      { type: "clustering", label: "user_id ASC", explain: "Clustering key — all rows for a user are contiguous within the tenant's range" },
      { type: "clustering", label: "event_time DESC", explain: "Secondary clustering — newest events first within each user, no sorting overhead for recency queries" }
    ],
    generateRow: (v) => {
      const tenants = ["acme-corp", "globex-inc", "initech", "umbrella", "waystar-royco"];
      const tenant = (v || "").trim() || tenants[Math.floor(Math.random() * tenants.length)];
      const userId = "u-" + String(Math.floor(Math.random() * 999)).padStart(3, '0');
      const hh = Math.floor(Math.random() * 24).toString().padStart(2, '0');
      const mm = Math.floor(Math.random() * 60).toString().padStart(2, '0');
      const eventTime = `2024-03-15 ${hh}:${mm}`;
      const actions = ["login", "view", "edit", "delete", "create", "export"];
      const resources = ["/dashboard", "/users", "/reports", "/settings", "/billing"];
      return [tenant, userId, eventTime, actions[Math.floor(Math.random()*6)], resources[Math.floor(Math.random()*5)]];
    },
    visual: {
      type: "sharding-view", shardingType: "HASH",
      sortConfig: [{ idx: 1, dir: "ASC" }, { idx: 2, dir: "ASC" }, { idx: 3, dir: "DESC" }],
      columns: [
        { label: "[hash]", role: "sys" },
        { label: "tenant_id", role: "sh" },
        { label: "user_id", role: "cl", dir: "ASC" },
        { label: "event_time", role: "cl", dir: "DESC" },
        { label: "action", role: "" },
        { label: "resource", role: "" }
      ]
    },
    initialState: {
      tablets: [
        { id: "Tablet 1", range: "0x0000–0x5555", rows: [
          { data: ["0x4FE6", "globex-inc",     "u-010", "2024-03-15 13:00", "edit",   "/users"] },
          { data: ["0x4FE6", "globex-inc",     "u-022", "2024-03-15 09:30", "view",   "/reports"] }
        ]},
        { id: "Tablet 2", range: "0x5556–0xAAAA", rows: [
          { data: ["0x8498", "acme-corp",      "u-001", "2024-03-15 14:32", "login",  "/dashboard"] },
          { data: ["0x8498", "acme-corp",      "u-001", "2024-03-15 11:05", "view",   "/reports"] },
          { data: ["0x6747", "initech",        "u-007", "2024-03-15 16:45", "create", "/settings"] },
          { data: ["0x6747", "initech",        "u-099", "2024-03-15 08:00", "login",  "/dashboard"] }
        ]},
        { id: "Tablet 3", range: "0xAAAB–0xFFFF", rows: [
          { data: ["0xFA70", "umbrella",       "u-003", "2024-03-15 15:20", "delete", "/users"] },
          { data: ["0xD3AA", "waystar-royco",  "u-011", "2024-03-15 12:10", "view",   "/billing"] },
          { data: ["0xD3AA", "waystar-royco",  "u-011", "2024-03-15 09:55", "login",  "/dashboard"] }
        ]}
      ]
    },
    callout: { type: "warn", icon: "🏢", text: "<b>The SaaS golden rule:</b> <code>PRIMARY KEY ((tenant_id) HASH, user_id, event_time DESC)</code> — tenant_id first, always. A query <code>WHERE tenant_id = 'acme'</code> computes one hash → targets one tablet → one RPC. Without tenant_id as the hash prefix, the same query fans out across every tablet. At 100 tablets and 1000 req/s per tenant, that's 100× the RPC load." },
    guide: {
      richSql: `<span class="sql-comment">-- ✅ Correct: tenant_id as the hash sharding key</span>
<span class="sql-kw">CREATE TABLE</span> user_activity (
    <span class="sh-key">tenant_id</span>  <span class="sql-type">TEXT</span>,
    <span class="cl-key">user_id</span>    <span class="sql-type">TEXT</span>,
    <span class="cl-key">event_time</span> <span class="sql-type">TIMESTAMPTZ</span>,
    action     <span class="sql-type">TEXT</span>,
    resource   <span class="sql-type">TEXT</span>,
    <span class="sql-kw">PRIMARY KEY</span> ((<span class="sh-key">tenant_id</span>) <span class="sql-kw">HASH</span>, <span class="cl-key">user_id</span> <span class="sql-kw">ASC</span>, <span class="cl-key">event_time</span> <span class="sql-kw">DESC</span>)
);

<span class="sql-comment">-- Single-tablet: hash(tenant_id) → 1 RPC</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> user_activity
<span class="sql-kw">WHERE</span> <span class="sh-key">tenant_id</span> = <span class="sql-str">'acme-corp'</span>
  <span class="sql-kw">AND</span> <span class="cl-key">user_id</span> = <span class="sql-str">'u-001'</span>
<span class="sql-kw">ORDER BY</span> <span class="cl-key">event_time</span> <span class="sql-kw">DESC LIMIT</span> 20;

<span class="sql-comment">-- ❌ Wrong: user_id as hash key — per-tenant query fans out</span>
<span class="sql-kw">CREATE TABLE</span> user_activity_bad (
    <span class="sh-key">user_id</span>    <span class="sql-type">TEXT</span>,
    tenant_id  <span class="sql-type">TEXT</span>,
    event_time <span class="sql-type">TIMESTAMPTZ</span>,
    <span class="sql-kw">PRIMARY KEY</span> ((<span class="sh-key">user_id</span>) <span class="sql-kw">HASH</span>, tenant_id, event_time <span class="sql-kw">DESC</span>)
);

<span class="sql-comment">-- ⚠ WHERE tenant_id = 'acme' hits ALL tablets (scatter-gather)</span>
<span class="sql-kw">SELECT</span> * <span class="sql-kw">FROM</span> user_activity_bad
<span class="sql-kw">WHERE</span> tenant_id = <span class="sql-str">'acme-corp'</span>;`
    },
    guidedTour: [
      { text: "Each tenant's rows are pinned to one tablet by HASH(tenant_id). No matter how many rows a tenant has, their data is in one place.", element: ".tablet-grid" },
      { text: "Within a tablet, rows from different tenants that hash to the same range are stored in (tenant_id, user_id) order — one tenant's rows are always contiguous.", element: ".tablet-card" },
      { text: "Type a tenant name like <b>acme-corp</b> or <b>initech</b> to see it route deterministically to the same tablet every time.", element: "#sim-input-val" },
      { text: "Notice that <b>acme-corp</b> always lands on Tablet 2 — a point query for this tenant never touches Tablet 1 or 3.", element: ".tablet-card" }
    ]
  },

  /* ── JSONB & GIN Index ──────────────────────────────────── */
  "pattern-jsonb": {
    group: "Data Modeling Patterns", icon: "🗄️", title: "JSONB & GIN Index",
    subtitle: "Opaque JSONB storage + inverted GIN index for @> queries",
    description: "JSONB columns are stored as a single opaque value in DocDB — the full JSON object lives in one cell, undecomposed. A GIN (Generalized Inverted Index) inverts this: it extracts every (key, value) pair from each row and creates a sorted index entry for each. A <code>metadata @> '{\"color\":\"red\"}'</code> query hits the GIN index directly — no sequential scan of the base table.",
    inputPlaceholder: "Enter a color (e.g. red, blue, green, black)...",
    scanDefault: "json_value = 'red'",
    legend: [
      { type: "sharding", label: "json_key (GIN)", explain: "The JSON key extracted from the document — GIN range-shards by (json_key, json_value) so all entries for a key are co-located and sorted" },
      { type: "clustering", label: "json_value (GIN)", explain: "The JSON value, sorted within each key — enables efficient equality and range predicates on attribute values" },
      { type: "ptr", label: "product_id (Ptr)", explain: "Pointer back to the base table row — required for a second lookup when the query needs columns not in the index" }
    ],
    generateRow: (v) => {
      const colors = ["red", "blue", "green", "black", "white", "yellow"];
      const cats   = ["apparel", "electronics", "furniture", "sports", "books"];
      const input  = (v || "").trim().toLowerCase();
      const color  = colors.includes(input) ? input : colors[Math.floor(Math.random() * colors.length)];
      const cat    = cats[Math.floor(Math.random() * cats.length)];
      const inStock = Math.random() > 0.4;
      const pid    = "prod-" + String(Math.floor(Math.random() * 900) + 100);
      const nameMap = { red: "Red Jacket", blue: "Blue Cap", green: "Green Bag", black: "Black Shoes", white: "White Tee", yellow: "Yellow Hat" };
      const name   = nameMap[color] || ("Item " + pid.slice(-3));
      return {
        table: { fields: [pid, name, `{"color":"${color}","cat":"${cat}","in_stock":${inStock}}`] },
        index: { fields: [] },
        _ginEntries: [
          { key: "category", val: cat,           ptr: pid },
          { key: "color",    val: color,          ptr: pid },
          { key: "in_stock", val: String(inStock), ptr: pid }
        ]
      };
    },
    visual: {
      type: "index-mapping", isCovering: false,
      indexColumns: [
        { label: "json_key",           role: "sh",  dir: "ASC" },
        { label: "json_value",         role: "cl",  dir: "ASC" },
        { label: "product_id (Ptr)",   role: "ptr" }
      ],
      tableColumns: [
        { label: "product_id (PK)",    role: "pk" },
        { label: "name",               role: "" },
        { label: "metadata (JSONB)",   role: "" }
      ]
    },
    callout: {
      type: "info", icon: "💡",
      text: "<b>One row → N GIN entries.</b> Each JSON key-value pair becomes its own sorted index entry. A <code>@&gt;</code> query seeks directly to matching GIN entries — DocDB never reads the opaque JSONB blobs in the base table. Multi-key filters intersect posting lists before fetching any rows."
    },
    initialState: {
      indexTablets: [
        { id: "GIN Tablet 1", range: "category … color", rows: [
          { fields: ["category", "apparel",     "prod-001"] },
          { fields: ["category", "apparel",     "prod-042"] },
          { fields: ["category", "electronics", "prod-007"] },
          { fields: ["color",    "blue",        "prod-007"] },
          { fields: ["color",    "red",         "prod-001"] },
          { fields: ["color",    "red",         "prod-042"] }
        ]},
        { id: "GIN Tablet 2", range: "in_stock … size", rows: [
          { fields: ["in_stock", "false", "prod-007"] },
          { fields: ["in_stock", "true",  "prod-001"] },
          { fields: ["size",     "M",     "prod-042"] }
        ]}
      ],
      tableTablets: [
        { id: "Table Tablet 1", range: "0x0000–0x7FFF", rows: [
          { fields: ["prod-001", "T-Shirt",    '{"color":"red","category":"apparel","in_stock":true}'] },
          { fields: ["prod-042", "Polo Shirt", '{"color":"red","category":"apparel","size":"M"}'] }
        ]},
        { id: "Table Tablet 2", range: "0x8000–0xFFFF", rows: [
          { fields: ["prod-007", "Headphones", '{"color":"blue","category":"electronics","in_stock":false}'] }
        ]}
      ]
    },
    guide: {
      richSql: `<span class="sql-comment">-- Product catalog with semi-structured attributes</span>
<span class="sql-kw">CREATE TABLE</span> products (
    <span class="pk-key">product_id</span> <span class="sql-type">TEXT PRIMARY KEY</span>,
    name       <span class="sql-type">TEXT NOT NULL</span>,
    metadata   <span class="sql-type">JSONB</span>
);

<span class="sql-comment">-- GIN index (jsonb_ops): indexes each key and key-value pair separately</span>
<span class="sql-comment">-- Readable (key, value) entries — supports @>, ?, ?|, ?&amp; operators</span>
<span class="sql-kw">CREATE INDEX</span> gin_products_metadata
    <span class="sql-kw">ON</span> products <span class="sql-kw">USING</span> gin (metadata <span class="sql-kw">jsonb_ops</span>);

<span class="sql-comment">-- DocDB stores the JSONB column as a single opaque blob:</span>
<span class="sql-comment">-- prod-001 → {"color":"red","category":"apparel","in_stock":true}</span>
<span class="sql-comment">-- The GIN index decomposes it into 3 sorted entries (one per key)</span>

<span class="sql-comment">-- @> (contains) query — uses GIN index, no base-table scan</span>
<span class="sql-kw">SELECT</span> product_id, name
<span class="sql-kw">FROM</span>   products
<span class="sql-kw">WHERE</span>  metadata <span class="sql-kw">@&gt;</span> <span class="sql-str">'{"color":"red"}'</span>;
<span class="sql-comment">-- GIN Tablet 1 → seek (key="color", val="red")</span>
<span class="sql-comment">-- Returns posting list: [prod-001, prod-042]</span>
<span class="sql-comment">-- 2nd RPC → Table Tablet 1 to fetch full rows</span>

<span class="sql-comment">-- Multi-key filter: GIN intersects posting lists before any table fetch</span>
<span class="sql-kw">SELECT</span> product_id, name
<span class="sql-kw">FROM</span>   products
<span class="sql-kw">WHERE</span>  metadata <span class="sql-kw">@&gt;</span> <span class="sql-str">'{"color":"red","category":"apparel"}'</span>;

<span class="sql-comment">-- Insert: 1 base row + 3 GIN entries across 2 index tablets</span>
<span class="sql-kw">INSERT INTO</span> products <span class="sql-kw">VALUES</span> (
    <span class="sql-str">'prod-099'</span>, <span class="sql-str">'Denim Jacket'</span>,
    <span class="sql-str">'{"color":"blue","category":"apparel","in_stock":true}'</span>
);
<span class="sql-comment">-- GIN Tablet 1: (category,apparel,prod-099), (color,blue,prod-099)</span>
<span class="sql-comment">-- GIN Tablet 2: (in_stock,true,prod-099)</span>

<span class="sql-comment">-- Alternative: jsonb_path_ops — hashes (path,value) pairs instead of</span>
<span class="sql-comment">-- storing readable keys. Smaller index, @> only, no ? / ?| / ?& support.</span>
<span class="sql-comment">-- CREATE INDEX ... USING gin (metadata jsonb_path_ops);</span>`
    },
    guidedTour: [
      { text: "The GIN index (top) shows each JSON key-value pair as its own sorted entry — <b>3 rows in the base table have generated 9 GIN index entries</b> across 2 range tablets.", element: ".idx-section" },
      { text: "The base table (bottom) stores the JSONB column as an opaque blob — DocDB never decomposes it at the storage layer. Searchability comes entirely from the GIN index.", element: ".tablet-grid" },
      { text: "GIN Tablet 1 holds all entries for keys <b>category</b> and <b>color</b> — sorted together so a <code>@&gt;</code> query can seek to any key-value pair in O(log n).", element: ".tablet-card" },
      { text: "Type a color like <b>red</b>, <b>blue</b>, or <b>green</b> — each insert adds 1 base-table row and 3 GIN index entries spread across the two index tablets.", element: "#sim-input-val" }
    ]
  }

});
