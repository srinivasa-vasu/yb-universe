# yb-universe
![WIP](https://img.shields.io/badge/status-WIP-yellow)

Interactive browser-based visualizers for learning how YugabyteDB works — from distributed storage internals to data modeling patterns.

---

## Tools

### [Architecture Explorer](https://srinivasa-vasu.github.io/yb-universe/explorer/index.html)

Animated, step-by-step visualizations of how YugabyteDB distributes and replicates data across a cluster.

| Chapter | Topics |
|---|---|
| **Foundations** | Raft consensus, tablet management, DocDB storage, master/TServer roles, tablet maps |
| **Deployment Architectures** | Multi-region clusters, read replicas, xCluster async replication |
| **Data Distribution** | Hash sharding, range sharding, pre-splitting, tablet splitting, compaction |
| **Read & Write Paths** | Write path through Raft, read consistency levels, follower reads, CDC |
| **Consistency & High Availability** | Leader election, node failure, region failure, automatic failover |
| **Scalability** | Elastic scale-out, auto tablet splitting |
| **System Internals** | DocDB LSM-tree, MVCC, hybrid logical clocks, master control plane |
| **xCluster** | Bidirectional and unidirectional cross-cluster replication |
| **Global Universe** | Global-scale multi-region topologies, geo-partitioning, latency trade-offs |


---

### [Data Model Explorer](https://srinivasa-vasu.github.io/yb-universe/model/index.html)

Interactive visualizer for YugabyteDB's YSQL data model — insert rows, watch them land in tablets, and explore how indexes and query plans work.

| Module | Topics |
|---|---|
| **Hash Sharding** | Single-key hash, hash+range (ASC/DESC), multi-column hash, physical storage layout |
| **Range Sharding** | Single-key range, composite range, storage comparison |
| **Indexes** | Hash index, hash+range index, range index, covering index, partial index, bucket index (hot-key mitigation), expression index, unique index, multi-column hash index |
| **Table Partitioning** | Range partitioning, per-partition secondary indexes |
| **Colocation** | Shared tablet for small tables |
| **Tablespaces** | Geo-partitioning with regional tablespaces |
| **Query Execution** | Hash/range point lookups, full table scan, range scan, skip scan, index scan, index-only scan, parallel range scan, bucket index scan, hash global sort, range ordered scan, expression pushdown, aggregate pushdown, nested loop join |
| **Data Modeling Patterns** | Time-series, multi-tenant, JSONB & GIN indexes |
