    //  DATA MODEL
    // ════════════════════════════════════════════

    const TABLES = {
      users: { name: 'users', color: '#f59e0b', cols: ['id', 'name', 'city', 'score'] },
      categories: { name: 'categories', color: '#34d399', cols: ['id', 'name', 'desc'] },
      products: { name: 'products', color: '#60a5fa', cols: ['id', 'name', 'price'] },
      customers: { name: 'customers', color: '#fb7185', cols: ['id', 'name', 'email'] },
      users_email_idx: { name: 'users_email_idx', color: '#e879f9', cols: ['email', 'ptr:user_id'] },
      transactions: { name: 'system.transactions', color: '#6366f1', cols: ['txid', 'status'] },
      orders: { name: 'orders', color: '#a78bfa', cols: ['id', 'cid', 'item', 'status'] }
    };
    const INITIAL_GROUPS = [
      {
        id: 'tg1', table: 'users', tnum: 1, range: '0x0000–0x54FF', leaderNode: 1, term: 4, replicas: [1, 2, 3],
        data: [[1, 'Alice Chen', 'New York', 87, 1713289000.1], [4, 'David Park', 'Phoenix', 95, 1713289000.4], [7, 'Grace Wilson', 'Austin', 88, 1713289000.7]]
      },
      {
        id: 'tg2', table: 'users', tnum: 2, range: '0x5500–0xA9FF', leaderNode: 2, term: 4, replicas: [1, 2, 3],
        data: [[2, 'Bob Martinez', 'Chicago', 92, 1713289000.2], [5, 'Eva Johnson', 'Seattle', 83, 1713289000.5], [8, 'Hank Brown', 'Denver', 76, 1713289000.8]]
      },
      {
        id: 'tg3', table: 'users', tnum: 3, range: '0xAA00–0xFFFF', leaderNode: 3, term: 4, replicas: [1, 2, 3],
        data: [[3, 'Carol Singh', 'Houston', 78, 1713289000.3], [6, 'Frank Liu', 'Boston', 91, 1713289000.6], [9, 'Iris Taylor', 'Miami', 94, 1713289000.9]]
      },
      {
        id: 'tg4', table: 'categories', tnum: 1, range: 'A — Z', leaderNode: 2, term: 4, replicas: [1, 2, 3],
        data: [[1, 'Electronics', 'Gadgets and devices', '', 1713289001.1], [2, 'Home & Garden', 'Furniture and decor', '', 1713289001.2]]
      },
      {
        id: 'tg5', table: 'products', tnum: 1, range: 'A — M', leaderNode: 1, term: 4, replicas: [1, 2, 3],
        data: [[101, 'Apple iPhone', '$999', '', 1713289002.1], [102, 'Bose QC45', '$329', '', 1713289002.2]]
      },
      {
        id: 'tg6', table: 'products', tnum: 2, range: 'N — Z', leaderNode: 3, term: 4, replicas: [1, 2, 3],
        data: [[104, 'Sony PS5', '$499', '', 1713289002.4], [105, 'Tesla Wall', '$5500', '', 1713289002.5]]
      },
      {
        id: 'tg8', table: 'users_email_idx', tnum: 1, range: 'A–Z', leaderNode: 2, term: 4, replicas: [1, 2, 3],
        data: [['alice@gmail.com', 1, 1713289000.1], ['carol@gmail.com', 3, 1713289000.3], ['david@gmail.com', 4, 1713289000.4]]
      },
      {
        id: 'ts1', table: 'transactions', tnum: 1, range: 'System', leaderNode: 3, term: 4, replicas: [1, 2, 3],
        data: []
      }
    ];

    const GEO_GROUPS = [
      {
        id: 'tg-us', table: 'users', tnum: 1, range: 'USA Pinned', leaderNode: 1, term: 4, replicas: [1, 2, 3],
        data: [[1, 'Alice', 'US', 87, 1713289000.1], [4, 'David', 'US', 95, 1713289000.4], [7, 'Grace', 'US', 88, 1713289000.7]]
      },
      {
        id: 'tg-eu', table: 'users', tnum: 2, range: 'EU Pinned', leaderNode: 4, term: 4, replicas: [4, 5, 6],
        data: [[2, 'Bob', 'DE', 92, 1713289000.2], [5, 'Eva', 'DE', 83, 1713289000.5], [8, 'Hans', 'DE', 76, 1713289000.8]]
      },
      {
        id: 'tg-apac', table: 'users', tnum: 3, range: 'APAC Pinned', leaderNode: 7, term: 4, replicas: [7, 8, 9],
        data: [[3, 'Carol', 'SG', 78, 1713289000.3], [6, 'Frank', 'SG', 91, 1713289000.6], [9, 'Iris', 'SG', 94, 1713289000.9]]
      }
    ];
