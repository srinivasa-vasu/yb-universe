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


---

### [AI & Vector Explorer](https://srinivasa-vasu.github.io/yb-universe/ai/index.html)

Interactive visualizer for AI vector search on YugabyteDB with pgvector — explore embeddings, similarity metrics, HNSW indexing, and RAG pipelines, with a built-in Getting Started guide.

| Module | Topics |
|---|---|
| **Fundamentals** | Vector embeddings, vector dimensions, normalization (unit-vector scaling) |
| **Similarity** | Distance metrics, L2 (Euclidean), cosine similarity, inner product |
| **HNSW Indexing** | Index construction mechanics, graph-navigation search |
| **AI Ecosystem** | MCP integration for AI tool use |
| **Architecture** | RAG pipeline (retriever + LLM), hybrid search (filters + vector), distributed HNSW across nodes |
| **Advanced Sampling** | Top-K sampling, Top-P (nucleus) sampling, hybrid sampling |


---

### [YugabyteDB Vanguard](https://github.com/srinivasa-vasu/ybdb-vanguard)

Hands-on YugabyteDB exercises with pre-configured cloud development environments — covering distributed SQL, data architecture, scalability, fault tolerance, multi-region distribution, disaster recovery, CDC, observability, security, and data migration.

| Module | Topics |
|---|---|
| **SQL Fundamentals** | Distributed SQL universe (sharding, YSQL/YCQL basics, tablets), query tuning tips & tricks, query plan management (QPM) with pg_hint_plan |
| **Data Placement & Architecture** | Colocation & distributed tables, tablespaces & online data migration (region-pinned tables, online ALTER TABLE) |
| **Scalability & High Availability** | Tablet-based distribution, automatic splitting, horizontal scale-out, chaos engineering, leader election, zero data loss |
| **Multi-Region & Disaster Recovery** | Geo-distribution & tablespaces, follower reads, xCluster replication, automatic DDL propagation, failover |
| **Data Protection & Recovery** | Point-in-time recovery (PITR), DB clone, time travel (`yb_read_time`) |
| **Streaming & CDC** | Change data capture (YugabyteDB → PostgreSQL via Debezium), CDC streaming (YSQL → YCQL microservices) |
| **Observability** | pg_stat_statements, Active Session History, EXPLAIN ANALYZE |
| **Security** | Encryption at rest (EAR) & key rotation, row level security & multi-tenancy, data privacy (column encryption, anonymization via pgcrypto) |
| **Search & Extensions** | Full-text search (tsvector/tsquery, ranking, highlighting), semantic search with pgvector (HNSW indexes) |
| **Migration** | YB Voyager support for MySQL, MariaDB, Oracle, PostgreSQL |
