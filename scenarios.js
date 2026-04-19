    const SCENARIOS = [
      // 0: Overview
      {
        name: 'Cluster Overview', steps: [], latencies: [],
        desc: 'YugabyteDB distributes data across TServers using tablet-based sharding. Each table is split into multiple tablets, each of which is a Raft group replicated across nodes. This architecture ensures high availability, scalability, and strong consistency.'
      },

      // 1: Hash Sharding
      {
        name: 'Hash Sharding', filterTable: 'users',
        desc: 'The Primary Key is hashed to determine tablet placement. This provides uniform distribution across the cluster, preventing hotspots.',
        latencies: [{ lbl: 'Hash Calculation', cls: 'll', max: 1 }, { lbl: 'Tablet Lookup', cls: 'll', max: 2 }, { lbl: 'Write RPC', cls: 'lm', max: 50 }],
        extraBtns: [{ id: 'btn-hash', label: '➕ Insert Random User', cls: 'btn-p', cb: 'insertHashUser' }, { id: 'btn-locate', label: '🔍 Locate Quorum', cls: 'btn-g', cb: 'locateHashRows' }],
        init: (ctx) => {
          showDataPanel(true);
          renderDataTable('users');
          ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY HASH,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
        },
        steps: [
          { label: 'Hash Mapping', desc: 'Keys map to 0x0000-0xFFFF hash space. Each tablet covers a slice of this space.', action: async (ctx) => { 
            for (const g of S.groups.filter(x => x.table === 'users')) {
              ctx.hlTablet(g.id, g.leaderNode, 't-hl');
              await ctx.delay(400);
            }
          } }
        ]
      },

      // 2: Range (Default)
      {
        name: 'Range (Default)', filterTable: 'users',
        desc: 'By default, range-sharded tables start with a single tablet. Data is ordered by Primary Key.',
        latencies: [{ lbl: 'Key Compare', cls: 'll', max: 1 }, { lbl: 'Single Tablet', cls: 'lh', max: 200 }],
        extraBtns: [{ id: 'btn-range', label: '➕ Insert Row', cls: 'btn-p', cb: 'insertHashUser' }],
        init: (ctx) => {
          showDataPanel(true);
          renderDataTable('users');
          // Consolidate all users into a single tablet
          const allData = S.groups.filter(g => g.table === 'users').reduce((a, g) => a.concat(g.data), []);
          S.groups = S.groups.filter(g => g.table !== 'users');
          S.groups.push({ 
            id: 'tg1', table: 'users', tnum: 1, range: '0 — 999', leaderNode: 1, term: 4, replicas: [1, 2, 3], 
            data: allData.sort((a, b) => a[0] - b[0]) 
          });
          ctx.rebuildReplicaState();
          ctx.setDDL('CREATE TABLE users (\n  id INT PRIMARY KEY ASC,\n  name TEXT,\n  city TEXT,\n  score INT\n);');
        },
        steps: [
          { label: 'Initial State', desc: 'New tables start on a single tablet (TServer-1). This can cause hotspots if writes are sequential.', action: async (ctx) => { ctx.hlTablet('tg1', 1, 't-hl2'); } }
        ]
      },

      // 3: Range (Pre-split)
      {
        name: 'Range (Pre-split)', filterTable: 'users',
        desc: 'Optimize range sharding by pre-splitting the table into multiple tablets during creation.',
        latencies: [{ lbl: 'Split Lookup', cls: 'll', max: 5 }, { lbl: 'Parallel Write', cls: 'll', max: 15 }],
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
        },
        steps: [
          { label: 'Multi-Tablet', desc: 'Table is pre-split into 3 tablets: 0–99, 100–199, 200–999. Distributes load from day one.', action: async (ctx) => { 
            for (const g of S.groups.filter(x => x.table === 'users')) {
              ctx.hlTablet(g.id, g.leaderNode, 't-hl');
              await ctx.delay(400);
            }
          } }
        ]
      },

      // 4: Fast Path Write (Fast Path)
      {
        name: 'Fast Path Write', filterTable: 'users',
        desc: 'YSQL INSERT flows to Raft LEADER → WAL append → replicate to followers → majority ACK → commit. Near follower (TServer-2, ~0.8ms) enables fast majority. If near follower is down, must wait for far follower (TServer-3, ~2.5ms).',
        latencies: [{ lbl: 'Leader WAL', cls: 'll', max: 2 }, { lbl: 'Near Follower', cls: 'll', max: 3 }, { lbl: 'Far Follower', cls: 'lm', max: 12 }, { lbl: 'Majority ACK', cls: 'll', max: 1 }, { lbl: 'Total Latency', cls: 'lm', max: 15 }],
        extraBtns: [{ id: 'btn-tn', label: '💀 Kill Near Follower', cls: 'btn-d', cb: 'toggleNearFollower' }],
        steps: [
          { label: 'Client INSERT', desc: 'Client sends INSERT to gateway TServer.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 1, 'pk-write', 500); } },
          { label: 'Leader WAL & Replicate', desc: 'Leader appends to WAL then fans out AppendEntries to both followers simultaneously.', action: async (ctx) => { ctx.setLat(0, 0.8); ctx.pktTabletToTablet('tg1', 1, 'tg1', 2, 'pk-raft', 300); ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-raft', 1000); await ctx.delay(800); } },
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
          { label: 'Commit & ACK Client', desc: 'Write committed to MemTable. ACK returned to client.', action: async (ctx) => {
            if (S.nodes[1].alive) { ctx.hlLatRow(0); ctx.hlLatRow(1); ctx.hlLatRow(3); ctx.hlLatRow(4); }
            else { ctx.hlLatRow(0); ctx.hlLatRow(2); ctx.hlLatRow(3); ctx.hlLatRow(4); }
            ctx.reRenderTablet('tg1', 1, true); ctx.reRenderTablet('tg1', 2, true); ctx.reRenderTablet('tg1', 3, true);
            await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400); ctx.activateClient(false);
          } }
        ]
      },

      // 5: Distributed Transactions (2PC)
      {
        name: 'Distributed Transactions', filterTable: ['users', 'transactions'],
        desc: 'Transactions spanning multiple tablets (e.g. updating users in different shards) use a high-performance 2-Phase Commit protocol (2PC). Visibility is atomic across all shards.',
        latencies: [{ lbl: 'TX Init', cls: 'll', max: 10 }, { lbl: 'Prov Write', cls: 'lm', max: 50 }, { lbl: 'TX Commit', cls: 'll', max: 10 }, { lbl: 'Commit Latency', cls: 'lm', max: 80 }, { lbl: 'Visible to All', cls: 'li', max: 5 }],
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
              ctx.setLat(3, total);
              
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
              ctx.setLat(4, 1.2);
              await ctx.delay(800);
              S.transactions = []; renderTxPanel();
              addLog('Cleanup complete. Status record will be purged.', 'ls');
            }
          }
        ]
      },

      // 6: Index Data Write
      {
        name: 'Index Data Write', filterTable: ['users', 'users_email_idx', 'transactions'],
        desc: 'Secondary indexes are stored in separate tablets. Updating a row with an index requires a distributed transaction to ensure both are updated atomically.',
        latencies: [{ lbl: 'TX Init', cls: 'll', max: 10 }, { lbl: 'Prov Write', cls: 'lm', max: 50 }, { lbl: 'TX Commit', cls: 'll', max: 10 }, { lbl: 'Commit Latency', cls: 'lm', max: 80 }, { lbl: 'Visible to All', cls: 'li', max: 5 }],
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
              ctx.setLat(3, total); 
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
              ctx.setLat(4, 1.5);
              await ctx.delay(600);
              S.transactions = []; renderTxPanel();
              addLog('Transaction finalized and cleaned up ✓', 'ls');
            }
          }
        ]
      },

      // 7: Consistent Read
      {
        name: 'Consistent Read', filterTable: 'users',
        desc: 'Strong-consistency reads always go to the Raft LEADER. If request lands on a follower, it transparently redirects to the leader.',
        latencies: [{ lbl: 'Gateway Hop', cls: 'll', max: 2 }, { lbl: 'Remote Redir', cls: 'll', max: 2 }, { lbl: 'Leader Read', cls: 'll', max: 2 }, { lbl: 'Total', cls: 'll', max: 6 }],
        steps: [
          { label: 'Local Read (Fast)', desc: 'Request lands directly on the leader (TServer-1) — no redirect needed.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 1, 'pk-read', 400); ctx.setLat(0, 0.5); ctx.setLat(2, 0.8); ctx.setLat(3, 1.3); ctx.hlLatRow(0); ctx.hlLatRow(2); ctx.hlLatRow(3); await ctx.pktTabletToClient('tg1', 1, 'pk-ack', 400); ctx.activateClient(false); } },
          { label: 'Remote Read (Request)', desc: 'Request lands on TServer-3 (follower). It detects this is not the leader.', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.hlTablet('tg1', 3, 't-hl2'); addLog('TS-3: Received request — redirecting to leader', 'lw'); } },
          { label: 'Remote Read (Redirect)', desc: 'TServer-3 redirects the client to TServer-1 (leader). TServer-1 processes the read request.', action: async (ctx) => { ctx.pktTabletToTablet('tg1', 3, 'tg1', 1, 'pk-read', 500); await ctx.delay(600); ctx.setLat(3, 3.4); ctx.hlLatRow(3); await ctx.pktTabletToTablet('tg1', 1, 'tg1', 3, 'pk-ack', 400); await ctx.pktTabletToClient('tg1', 3, 'pk-ack', 400); ctx.activateClient(false); } }
        ]
      },

      // 8: Follower Reads
      {
        name: 'Follower Reads', filterTable: 'users',
        desc: 'SET yb_read_from_followers=TRUE allows reads from nearest replica, skipping the leader. Data may be bounded-stale (default 10ms).',
        latencies: [{ lbl: 'Route to Follower', cls: 'll', max: 1 }, { lbl: 'Staleness Check', cls: 'll', max: 1 }, { lbl: 'Local Read', cls: 'll', max: 1 }, { lbl: 'Total', cls: 'll', max: 3 }],
        steps: [
          { label: 'Read from Nearest', desc: 'Routes to TServer-3 (follower, nearest to client), bypassing TServer-1 (leader, far).', action: async (ctx) => { ctx.activateClient(true); await ctx.pktClientToTablet('tg1', 3, 'pk-read', 400); ctx.setLat(0, 0.6); ctx.hlLatRow(0); } },
          { label: 'Check & Serve', desc: 'Follower confirms HybridTime within staleness window, serves locally.', action: async (ctx) => { ctx.setLat(1, 0.5); ctx.hlRow('tg1', 3, 0); await ctx.delay(400); ctx.setLat(3, 1.8); ctx.hlLatRow(1); ctx.hlLatRow(2); ctx.hlLatRow(3); await ctx.pktTabletToClient('tg1', 3, 'pk-read', 400); ctx.activateClient(false); } }
        ]
      },

      // 9: Geo-Partitioning
      {
        name: 'Geo-Partitioning', filterTable: 'users',
        desc: 'YugabyteDB pins tablet leaders and followers to specific regions. Each region has its own Raft group with 3 local replicas. Client is in APAC — local requests are fast, cross-region requests show increasing latency.',
        latencies: [
          { lbl: 'APAC Read', cls: 'll', max: 10 },
          { lbl: 'APAC Write', cls: 'll', max: 10 },
          { lbl: 'EU Read', cls: 'lm', max: 200 },
          { lbl: 'EU Write', cls: 'lm', max: 200 },
          { lbl: 'US Read', cls: 'lh', max: 300 },
          { lbl: 'US Write', cls: 'lh', max: 300 }
        ],
        init: (ctx) => {
          ctx.setCanvasGeoMode(true);
          // Show 3 nodes per region
          for(let n=1; n<=9; n++) ctx.setNodeVisibility(n, true);
          // Set proper region labels & zone names
          ctx.setNodeRegion(1, 'us', 'US-East'); ctx.setNodeRegion(2, 'us', 'US-East'); ctx.setNodeRegion(3, 'us', 'US-East');
          ctx.setNodeRegion(4, 'eu', 'Europe'); ctx.setNodeRegion(5, 'eu', 'Europe'); ctx.setNodeRegion(6, 'eu', 'Europe');
          ctx.setNodeRegion(7, 'apac', 'APAC'); ctx.setNodeRegion(8, 'apac', 'APAC'); ctx.setNodeRegion(9, 'apac', 'APAC');
          // Use GEO_GROUPS
          S.groups = JSON.parse(JSON.stringify(GEO_GROUPS));
          S.replicaState = buildRS(S.groups);
          // Client is in APAC
          document.getElementById('client-box').textContent = '⬡ APAC Client Gateway';
          // Render tablets for geo groups (selectScenario rendered with INITIAL_GROUPS before init ran)
          renderAllTablets();
          setTimeout(renderConnections, 100);
        },
        steps: [
          {
            label: 'APAC — Local Read + Write',
            desc: 'Client in APAC reads and writes to the local tg-apac Raft group (Nodes 7, 8, 9). All operations stay within ap-south-1 with ~2ms latency.',
            action: async (ctx) => {
              // SELECT
              addLog('APAC Client: SELECT * FROM users WHERE region=\'SG\'', 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet('tg-apac', 7, 'pk-read', 400);
              ctx.hlTablet('tg-apac', 7, 't-hl');
              ctx.setLat(0, 1.8);
              ctx.hlLatRow(0);
              addLog('Local read from tg-apac LEADER (Node 7) — 1.8ms ✓', 'ls');
              await ctx.pktTabletToClient('tg-apac', 7, 'pk-ack', 400);

              await ctx.delay(400);

              // INSERT + replication
              addLog('APAC Client: INSERT INTO users VALUES (10, \'Raj\', \'SG\', 85)', 'li');
              await ctx.pktClientToTablet('tg-apac', 7, 'pk-write', 400);
              addLog('Leader WAL → replicate to local followers (Node 8, 9)', 'li');
              const p1 = ctx.pktTabletToTablet('tg-apac', 7, 'tg-apac', 8, 'pk-raft', 400);
              const p2 = ctx.pktTabletToTablet('tg-apac', 7, 'tg-apac', 9, 'pk-raft', 400);
              await Promise.all([p1, p2]);
              ctx.setLat(1, 2.5);
              ctx.hlLatRow(1);
              S.groups.find(g => g.id === 'tg-apac').data.push([10, 'Raj', 'SG', 85, performance.now() / 1000]);
              for (const nid of [7, 8, 9]) ctx.reRenderTablet('tg-apac', nid, true);
              addLog('Intra-region quorum (3/3 in APAC) — 2.5ms ✓', 'ls');
              await ctx.pktTabletToClient('tg-apac', 7, 'pk-ack', 400);
              ctx.activateClient(false);
            }
          },
          {
            label: 'EU — Cross-Region Read + Write',
            desc: 'Client in APAC accesses EU data. Requests cross from ap-south-1 to eu-central-1 (~80ms RTT). Write still replicates locally within EU, but the cross-region client hop adds latency.',
            action: async (ctx) => {
              // SELECT
              addLog('APAC Client: SELECT * FROM users WHERE region=\'DE\'', 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet('tg-eu', 4, 'pk-read', 900);
              ctx.hlTablet('tg-eu', 4, 't-hl');
              ctx.setLat(2, 80);
              ctx.hlLatRow(2);
              addLog('Cross-region read: APAC → EU (Node 4) — 80ms ⚠', 'lw');
              await ctx.pktTabletToClient('tg-eu', 4, 'pk-ack', 900);

              await ctx.delay(400);

              // INSERT + replication
              addLog('APAC Client: INSERT INTO users VALUES (11, \'Anna\', \'DE\', 90)', 'li');
              await ctx.pktClientToTablet('tg-eu', 4, 'pk-write', 900);
              addLog('EU Leader WAL → replicate to EU followers (Node 5, 6)', 'li');
              const p1 = ctx.pktTabletToTablet('tg-eu', 4, 'tg-eu', 5, 'pk-raft', 400);
              const p2 = ctx.pktTabletToTablet('tg-eu', 4, 'tg-eu', 6, 'pk-raft', 400);
              await Promise.all([p1, p2]);
              ctx.setLat(3, 85);
              ctx.hlLatRow(3);
              S.groups.find(g => g.id === 'tg-eu').data.push([11, 'Anna', 'DE', 90, performance.now() / 1000]);
              for (const nid of [4, 5, 6]) ctx.reRenderTablet('tg-eu', nid, true);
              addLog('Cross-region write: APAC → EU + EU quorum — 85ms ⚠', 'lw');
              await ctx.pktTabletToClient('tg-eu', 4, 'pk-ack', 900);
              ctx.activateClient(false);
            }
          },
          {
            label: 'US — Cross-Region Read + Write',
            desc: 'Client in APAC accesses US data — maximum cross-region penalty (~145ms RTT). This demonstrates why geo-partitioning keeps data local to users.',
            action: async (ctx) => {
              // SELECT
              addLog('APAC Client: SELECT * FROM users WHERE region=\'US\'', 'li');
              ctx.activateClient(true);
              await ctx.pktClientToTablet('tg-us', 1, 'pk-read', 1200);
              ctx.hlTablet('tg-us', 1, 't-hl');
              ctx.setLat(4, 145);
              ctx.hlLatRow(4);
              addLog('Cross-region read: APAC → US (Node 1) — 145ms ⚠', 'lw');
              await ctx.pktTabletToClient('tg-us', 1, 'pk-ack', 1200);

              await ctx.delay(400);

              // INSERT + replication
              addLog('APAC Client: INSERT INTO users VALUES (12, \'Mike\', \'US\', 79)', 'li');
              await ctx.pktClientToTablet('tg-us', 1, 'pk-write', 1200);
              addLog('US Leader WAL → replicate to US followers (Node 2, 3)', 'li');
              const p1 = ctx.pktTabletToTablet('tg-us', 1, 'tg-us', 2, 'pk-raft', 400);
              const p2 = ctx.pktTabletToTablet('tg-us', 1, 'tg-us', 3, 'pk-raft', 400);
              await Promise.all([p1, p2]);
              ctx.setLat(5, 150);
              ctx.hlLatRow(5);
              S.groups.find(g => g.id === 'tg-us').data.push([12, 'Mike', 'US', 79, performance.now() / 1000]);
              for (const nid of [1, 2, 3]) ctx.reRenderTablet('tg-us', nid, true);
              addLog('Cross-region write: APAC → US + US quorum — 150ms ⚠', 'lw');
              addLog('Geo-partitioning keeps data local to avoid these penalties ✓', 'ls');
              await ctx.pktTabletToClient('tg-us', 1, 'pk-ack', 1200);
              ctx.activateClient(false);
            }
          }
        ]
      },

      // 10: Leader Election
      {
        name: 'Leader Election',
        desc: 'Full Raft lifecycle: 6 consecutive heartbeat failures → node declared dead → election timeout → Follower→Candidate→Leader. Leaders are distributed fairly across surviving peers. Also supports graceful Blacklist/Drain for planned maintenance.',
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
      // 11: Node Failure
      {
        name: 'Node Failure',
        desc: 'TServer-3 crashes. Raft re-election gives new leaders for tg3 (users.t3) & tg6 (products.t2). Auto-writes continue during outage. On recovery, TServer-3 catches up all missed writes and leaders are rebalanced back to it.',
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
      // 12: Network Partition
      {
        name: 'Network Partition',
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

      // 13: Horizontal Scaling
      {
        name: 'Horizontal Scaling',
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

      // 14: Tablet Split
      {
        name: 'Tablet Split', filterTable: 'users',
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

      // 15: LSM Compaction
      {
        name: 'LSM Compaction',
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

      // 16: Colocated Tables
      {
        name: 'Colocated Tables', filterTable: 'colocated',
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
      }
    ];
