#!/usr/bin/env node

/**
 * Cyoda Backend Mock Server
 * Provides mock endpoints for Processing Manager and other Cyoda applications
 * Runs on port 8080 (unified server for saas-app)
 */

import express from 'express';
import cors from 'cors';

// Create unified Express app
const app = express();

const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Rewrite /api/platform-api/* to /platform-api/*
// This allows the frontend to call /api/platform-api/... which gets proxied to /api/platform-api/...
// and we rewrite it here to /platform-api/... to match our endpoint definitions
app.use((req, res, next) => {
  if (req.url.startsWith('/api/platform-api/')) {
    req.url = req.url.replace('/api/platform-api/', '/platform-api/');
  }
  next();
});

// ============================================================================
// Authentication Endpoints
// ============================================================================

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  console.log(`🔐 Login attempt: ${username}`);

  // Mock authentication - accept any username/password
  res.json({
    token: 'mock-jwt-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now(),
    username: username || 'admin',
    userId: 'user-' + Date.now(),
    legalEntityId: 'legal-entity-001'
  });
});

// Token refresh endpoint
app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  console.log(`🔄 Token refresh attempt`);

  // Mock token refresh
  res.json({
    token: 'mock-jwt-token-refreshed-' + Date.now(),
    refreshToken: 'mock-refresh-token-refreshed-' + Date.now()
  });
});

// ============================================================================
// Mock Data
// ============================================================================

// SQL Schemas
let mockSchemas = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    schemaName: 'customer_analytics',
    timestamp: Date.now(),
    tables: [
      {
        metadataClassId: 'customer-class-001',
        tableName: 'customers',
        uniformedPath: 'data.customers',
        hidden: false,
        fields: [
          { fieldName: 'customer_id', fieldKey: 'customer_id', fieldType: 'bigint', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'first_name', fieldKey: 'first_name', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'last_name', fieldKey: 'last_name', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'email', fieldKey: 'email', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'phone', fieldKey: 'phone', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'created_at', fieldKey: 'created_at', fieldType: 'timestamp', fieldCategory: 'DATA', hidden: false, flatten: false }
        ]
      },
      {
        metadataClassId: 'order-class-001',
        tableName: 'orders',
        uniformedPath: 'data.orders',
        hidden: false,
        fields: [
          { fieldName: 'order_id', fieldKey: 'order_id', fieldType: 'bigint', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'customer_id', fieldKey: 'customer_id', fieldType: 'bigint', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'order_date', fieldKey: 'order_date', fieldType: 'timestamp', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'total_amount', fieldKey: 'total_amount', fieldType: 'decimal', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'status', fieldKey: 'status', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false }
        ]
      }
    ]
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    schemaName: 'product_inventory',
    timestamp: Date.now(),
    tables: [
      {
        metadataClassId: 'product-class-001',
        tableName: 'products',
        uniformedPath: 'data.products',
        hidden: false,
        fields: [
          { fieldName: 'product_id', fieldKey: 'product_id', fieldType: 'bigint', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'product_name', fieldKey: 'product_name', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'category', fieldKey: 'category', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'price', fieldKey: 'price', fieldType: 'decimal', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'stock_quantity', fieldKey: 'stock_quantity', fieldType: 'integer', fieldCategory: 'DATA', hidden: false, flatten: false }
        ]
      }
    ]
  }
];

// Entity Models
const mockEntityModels = [
  { id: 'model-001', name: 'Customer', className: 'com.cyoda.model.Customer' },
  { id: 'model-002', name: 'Order', className: 'com.cyoda.model.Order' },
  { id: 'model-003', name: 'Product', className: 'com.cyoda.model.Product' },
  { id: 'model-004', name: 'Transaction', className: 'com.cyoda.model.Transaction' }
];

// Report Types
const mockReportTypes = [
  {
    content: 'com.cyoda.model.Customer',
    _links: {
      '/history': {
        href: '/platform-api/history?type=com.cyoda.model.Customer',
        templated: false,
        title: 'Customer Reports',
        type: 'Customer'
      }
    }
  },
  {
    content: 'com.cyoda.model.Order',
    _links: {
      '/history': {
        href: '/platform-api/history?type=com.cyoda.model.Order',
        templated: false,
        title: 'Order Reports',
        type: 'Order'
      }
    }
  },
  {
    content: 'com.cyoda.model.Product',
    _links: {
      '/history': {
        href: '/platform-api/history?type=com.cyoda.model.Product',
        templated: false,
        title: 'Product Reports',
        type: 'Product'
      }
    }
  }
];

// Report Definitions
let mockReportDefinitions = [
  {
    '@bean': 'com.cyoda.core.reporting.ReportDefinition',
    id: 'report-def-001',
    description: 'Customer Analytics Report',
    name: 'Customer Analytics',
    requestClass: 'com.cyoda.model.Customer',
    entityClass: 'com.cyoda.model.Customer',
    columns: [],
    colDefs: [],
    aliasDefs: [],
    sorting: [],
    grouping: [],
    summary: [],
    condition: { '@bean': 'com.cyoda.core.reporting.Condition', operator: 'AND', conditions: [] },
    hierarhyEnable: false,
    reportVersion: 1,
    singletonReport: false,
    pointTime: null,
    userId: 'admin',
    creationDate: Date.now() - 86400000 * 7
  },
  {
    '@bean': 'com.cyoda.core.reporting.ReportDefinition',
    id: 'report-def-002',
    description: 'Monthly Sales Report',
    name: 'Monthly Sales',
    requestClass: 'com.cyoda.model.Order',
    entityClass: 'com.cyoda.model.Order',
    columns: [],
    colDefs: [],
    aliasDefs: [],
    sorting: [],
    grouping: [],
    summary: [],
    condition: { '@bean': 'com.cyoda.core.reporting.Condition', operator: 'AND', conditions: [] },
    hierarhyEnable: false,
    reportVersion: 1,
    singletonReport: false,
    pointTime: null,
    userId: 'admin',
    creationDate: Date.now() - 86400000 * 3
  },
  {
    '@bean': 'com.cyoda.core.reporting.ReportDefinition',
    id: 'report-def-003',
    description: 'Product Inventory Report',
    name: 'Product Inventory',
    requestClass: 'com.cyoda.model.Product',
    entityClass: 'com.cyoda.model.Product',
    columns: [],
    colDefs: [],
    aliasDefs: [],
    sorting: [],
    grouping: [],
    summary: [],
    condition: { '@bean': 'com.cyoda.core.reporting.Condition', operator: 'AND', conditions: [] },
    hierarhyEnable: false,
    reportVersion: 1,
    singletonReport: false,
    pointTime: null,
    userId: 'john.doe',
    creationDate: Date.now() - 86400000 * 1
  }
];

// Report History
const mockReportHistory = [
  {
    id: 'report-hist-001',
    configName: 'Customer Analytics',
    reportFailed: false,
    finishTime: Date.now() - 3600000,
    startTime: Date.now() - 3660000,
    type: 'com.cyoda.model.Customer',
    username: 'admin',
    status: 'COMPLETED',
    rowsCount: 1250
  },
  {
    id: 'report-hist-002',
    configName: 'Monthly Sales',
    reportFailed: false,
    finishTime: Date.now() - 7200000,
    startTime: Date.now() - 7260000,
    type: 'com.cyoda.model.Order',
    username: 'admin',
    status: 'COMPLETED',
    rowsCount: 3420
  },
  {
    id: 'report-hist-003',
    configName: 'Product Inventory',
    reportFailed: true,
    finishTime: Date.now() - 10800000,
    startTime: Date.now() - 10860000,
    type: 'com.cyoda.model.Product',
    username: 'john.doe',
    status: 'FAILED',
    rowsCount: 0,
    errorMessage: 'Connection timeout'
  }
];

// Stream Report Definitions
let mockStreamDefinitions = [
  {
    '@bean': 'com.cyoda.core.streamdata.StreamDataDefinition',
    id: 'stream-def-001',
    name: 'Real-time Customer Stream',
    description: 'Live customer data stream',
    owner: 'admin',
    createDate: new Date(Date.now() - 86400000 * 5).toISOString(),
    streamDataDef: {
      '@bean': 'com.cyoda.core.streamdata.StreamDataDef',
      requestClass: 'com.cyoda.model.Customer',
      columns: []
    }
  },
  {
    '@bean': 'com.cyoda.core.streamdata.StreamDataDefinition',
    id: 'stream-def-002',
    name: 'Order Processing Stream',
    description: 'Real-time order processing',
    owner: 'admin',
    createDate: new Date(Date.now() - 86400000 * 2).toISOString(),
    streamDataDef: {
      '@bean': 'com.cyoda.core.streamdata.StreamDataDef',
      requestClass: 'com.cyoda.model.Order',
      columns: []
    }
  },
  {
    '@bean': 'com.cyoda.core.streamdata.StreamDataDefinition',
    id: 'stream-def-003',
    name: 'Product Updates Stream',
    description: 'Real-time product updates',
    owner: 'john.doe',
    createDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    streamDataDef: {
      '@bean': 'com.cyoda.core.streamdata.StreamDataDef',
      requestClass: 'com.cyoda.model.Product',
      columns: []
    }
  }
];

// Catalog Items (Aliases)
let mockCatalogItems = [
  {
    '@bean': 'com.cyoda.core.catalog.CatalogItem',
    id: 'catalog-001',
    name: 'Customer Full Name',
    desc: 'Concatenated first and last name',
    entityClass: 'com.cyoda.model.Customer',
    state: 'ACTIVE',
    user: 'admin',
    createDate: new Date(Date.now() - 86400000 * 10).toISOString(),
    aliasDef: {
      name: 'Customer Full Name',
      aliasType: 'SIMPLE',
      aliasPaths: {
        '@meta': 'com.cyoda.core.reports.columns.AliasPaths',
        value: [
          {
            colDef: {
              fullPath: 'firstName',
              parts: {
                '@meta': 'com.cyoda.core.reports.columns.ColDef',
                value: [
                  {
                    rootClass: 'com.cyoda.model.Customer',
                    path: 'firstName',
                    type: 'LEAF'
                  }
                ]
              },
              colType: 'LEAF'
            },
            mapperClass: 'com.cyoda.mapper.StringConcatMapper',
            mapperParameters: ''
          }
        ]
      }
    }
  },
  {
    '@bean': 'com.cyoda.core.catalog.CatalogItem',
    id: 'catalog-002',
    name: 'Order Total Amount',
    desc: 'Total order amount with tax',
    entityClass: 'com.cyoda.model.Order',
    state: 'ACTIVE',
    user: 'admin',
    createDate: new Date(Date.now() - 86400000 * 8).toISOString(),
    aliasDef: {
      name: 'Order Total Amount',
      aliasType: 'SIMPLE',
      aliasPaths: {
        '@meta': 'com.cyoda.core.reports.columns.AliasPaths',
        value: [
          {
            colDef: {
              fullPath: 'totalAmount',
              parts: {
                '@meta': 'com.cyoda.core.reports.columns.ColDef',
                value: [
                  {
                    rootClass: 'com.cyoda.model.Order',
                    path: 'totalAmount',
                    type: 'LEAF'
                  }
                ]
              },
              colType: 'LEAF'
            },
            mapperClass: 'com.cyoda.mapper.SumMapper',
            mapperParameters: ''
          }
        ]
      }
    }
  },
  {
    '@bean': 'com.cyoda.core.catalog.CatalogItem',
    id: 'catalog-003',
    name: 'Product Price with Discount',
    desc: 'Product price after discount',
    entityClass: 'com.cyoda.model.Product',
    state: 'DRAFT',
    user: 'john.doe',
    createDate: new Date(Date.now() - 86400000 * 3).toISOString(),
    aliasDef: {
      name: 'Product Price with Discount',
      aliasType: 'SIMPLE',
      aliasPaths: {
        '@meta': 'com.cyoda.core.reports.columns.AliasPaths',
        value: [
          {
            colDef: {
              fullPath: 'price',
              parts: {
                '@meta': 'com.cyoda.core.reports.columns.ColDef',
                value: [
                  {
                    rootClass: 'com.cyoda.model.Product',
                    path: 'price',
                    type: 'LEAF'
                  }
                ]
              },
              colType: 'LEAF'
            },
            mapperClass: 'com.cyoda.mapper.DiscountMapper',
            mapperParameters: '10'
          }
        ]
      }
    }
  }
];

const mockNodes = [
  {
    id: 'node-1',
    name: 'Processing Node 1',
    host: 'localhost',
    port: 8081,
    status: 'ONLINE',
    cpuUsage: 45.2,
    memoryUsage: 62.8,
    diskUsage: 38.5,
    uptime: 86400000, // 1 day in ms
    lastHeartbeat: new Date().toISOString(),
    version: '1.0.0',
    capabilities: ['PROCESSING', 'STORAGE'],
    activeTasksCount: 3,
    completedTasksCount: 127,
    failedTasksCount: 2
  },
  {
    id: 'node-2',
    name: 'Processing Node 2',
    host: 'localhost',
    port: 8082,
    status: 'ONLINE',
    cpuUsage: 32.1,
    memoryUsage: 54.3,
    diskUsage: 42.1,
    uptime: 172800000, // 2 days in ms
    lastHeartbeat: new Date().toISOString(),
    version: '1.0.0',
    capabilities: ['PROCESSING', 'ANALYTICS'],
    activeTasksCount: 5,
    completedTasksCount: 243,
    failedTasksCount: 1
  },
  {
    id: 'node-3',
    name: 'Processing Node 3',
    host: 'localhost',
    port: 8083,
    status: 'OFFLINE',
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,
    uptime: 0,
    lastHeartbeat: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    version: '1.0.0',
    capabilities: ['PROCESSING'],
    activeTasksCount: 0,
    completedTasksCount: 89,
    failedTasksCount: 5
  }
];

const mockEvents = [];
const mockTasks = [];

// Generate some mock events
for (let i = 0; i < 50; i++) {
  const eventTypes = ['TASK_STARTED', 'TASK_COMPLETED', 'TASK_FAILED', 'NODE_ONLINE', 'NODE_OFFLINE', 'DATA_PROCESSED'];
  const severities = ['INFO', 'WARNING', 'ERROR'];
  
  mockEvents.push({
    id: `event-${i + 1}`,
    type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
    severity: severities[Math.floor(Math.random() * severities.length)],
    message: `Mock event ${i + 1} - ${eventTypes[Math.floor(Math.random() * eventTypes.length)]}`,
    timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
    nodeId: mockNodes[Math.floor(Math.random() * mockNodes.length)].id,
    metadata: {
      source: 'mock-server',
      version: '1.0.0'
    }
  });
}

// Generate some mock tasks
for (let i = 0; i < 20; i++) {
  const statuses = ['RUNNING', 'COMPLETED', 'FAILED', 'PENDING'];
  const taskTypes = ['DATA_IMPORT', 'DATA_EXPORT', 'TRANSFORMATION', 'VALIDATION', 'ANALYTICS'];
  
  mockTasks.push({
    id: `task-${i + 1}`,
    name: `Task ${i + 1}`,
    type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    progress: Math.floor(Math.random() * 100),
    startTime: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    endTime: Math.random() > 0.5 ? new Date().toISOString() : null,
    nodeId: mockNodes[Math.floor(Math.random() * 2)].id, // Only online nodes
    priority: Math.floor(Math.random() * 10),
    metadata: {
      recordsProcessed: Math.floor(Math.random() * 10000),
      recordsTotal: 10000
    }
  });
}

// ============================================================================
// API Endpoints (Port 8082)
// ============================================================================

// Health check
app.get('/actuator/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Cyoda API Mock Server',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/nodes',
      '/api/events',
      '/api/tasks'
    ]
  });
});

// Get all nodes
app.get('/api/nodes', (req, res) => {
  res.json(mockNodes);
});

// Get node by ID
app.get('/api/nodes/:id', (req, res) => {
  const node = mockNodes.find(n => n.id === req.params.id);
  if (node) {
    res.json(node);
  } else {
    res.status(404).json({ error: 'Node not found' });
  }
});

// Get all events
app.get('/api/events', (req, res) => {
  const { page = 0, size = 20, sort = 'timestamp,desc' } = req.query;
  const start = page * size;
  const end = start + parseInt(size);
  const sortedEvents = [...mockEvents].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  
  res.json({
    content: sortedEvents.slice(start, end),
    page: {
      size: parseInt(size),
      totalElements: mockEvents.length,
      totalPages: Math.ceil(mockEvents.length / size),
      number: parseInt(page)
    }
  });
});

// Get all tasks
app.get('/api/tasks', (req, res) => {
  const { page = 0, size = 20 } = req.query;
  const start = page * size;
  const end = start + parseInt(size);
  
  res.json({
    content: mockTasks.slice(start, end),
    page: {
      size: parseInt(size),
      totalElements: mockTasks.length,
      totalPages: Math.ceil(mockTasks.length / size),
      number: parseInt(page)
    }
  });
});

// ============================================================================
// SQL Schema Endpoints
// ============================================================================

// Get all SQL schemas
app.get('/platform-api/sql/schema/listAll', (req, res) => {
  res.json(mockSchemas);
});

// Get schema by ID
app.get('/platform-api/sql/schema/:id', (req, res) => {
  const schema = mockSchemas.find(s => s.id === req.params.id);
  if (schema) {
    res.json(schema);
  } else {
    res.status(404).json({ error: 'Schema not found' });
  }
});

// Create or update schema
app.post('/platform-api/sql/schema/', (req, res) => {
  const schema = req.body;

  if (schema.id) {
    // Update existing
    const index = mockSchemas.findIndex(s => s.id === schema.id);
    if (index >= 0) {
      mockSchemas[index] = { ...schema, timestamp: Date.now() };
      res.json(mockSchemas[index]);
    } else {
      res.status(404).json({ error: 'Schema not found' });
    }
  } else {
    // Create new
    const newSchema = {
      ...schema,
      id: `550e8400-e29b-41d4-a716-${Date.now()}`,
      timestamp: Date.now()
    };
    mockSchemas.push(newSchema);
    res.json(newSchema);
  }
});

// Delete schema
app.delete('/platform-api/sql/schema/:id', (req, res) => {
  const index = mockSchemas.findIndex(s => s.id === req.params.id);
  if (index >= 0) {
    mockSchemas.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Schema not found' });
  }
});

// Get entity models
app.get('/platform-api/model/', (req, res) => {
  res.json(mockEntityModels);
});

// Generate tables from entity model
app.get('/platform-api/sql/schema/genTables/:id', (req, res) => {
  const model = mockEntityModels.find(m => m.id === req.params.id);
  if (model) {
    // Generate mock tables based on model
    const tables = [
      {
        metadataClassId: model.id,
        tableName: model.name.toLowerCase(),
        uniformedPath: `data.${model.name.toLowerCase()}`,
        hidden: false,
        fields: [
          { fieldName: 'id', fieldKey: 'id', fieldType: 'bigint', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'name', fieldKey: 'name', fieldType: 'varchar', fieldCategory: 'DATA', hidden: false, flatten: false },
          { fieldName: 'created_at', fieldKey: 'created_at', fieldType: 'timestamp', fieldCategory: 'DATA', hidden: false, flatten: false }
        ]
      }
    ];
    res.json(tables);
  } else {
    res.status(404).json({ error: 'Model not found' });
  }
});

// Update tables for a schema
app.post('/platform-api/sql/schema/updateTables/:metaId', (req, res) => {
  const tables = req.body;
  res.json(tables);
});

// Import sample data
app.post('/platform-api/model/import/:format/:dataset/:entity/:version', (req, res) => {
  res.json({ success: true, imported: 1, message: 'Sample data imported successfully' });
});

// ============================================================================
// Tableau Reporting Endpoints
// ============================================================================

// Get report types
app.get('/platform-api/reporting/types', (req, res) => {
  const { size = 20, page = 0 } = req.query;
  const start = page * size;
  const end = start + parseInt(size);

  res.json({
    _embedded: {
      reportingTypesEmbeddedStrings: mockReportTypes.slice(start, end)
    },
    page: {
      size: parseInt(size),
      totalElements: mockReportTypes.length,
      totalPages: Math.ceil(mockReportTypes.length / size),
      number: parseInt(page)
    }
  });
});

// Get report types with fetch
app.get('/platform-api/reporting/types/fetch', (req, res) => {
  const { withModels } = req.query;

  // Return entity classes in the format expected by CreateReportDialog
  const entityClasses = [
    { name: 'com.cyoda.model.Customer', label: 'Customer', type: 'BUSINESS' },
    { name: 'com.cyoda.model.Order', label: 'Order', type: 'BUSINESS' },
    { name: 'com.cyoda.model.Product', label: 'Product', type: 'BUSINESS' },
    { name: 'com.cyoda.model.Transaction', label: 'Transaction', type: 'BUSINESS' },
    { name: 'com.cyoda.model.Invoice', label: 'Invoice', type: 'BUSINESS' },
    { name: 'com.cyoda.model.Payment', label: 'Payment', type: 'BUSINESS' },
    { name: 'com.cyoda.technical.SystemLog', label: 'System Log', type: 'TECHNICAL' },
    { name: 'com.cyoda.technical.AuditTrail', label: 'Audit Trail', type: 'TECHNICAL' },
  ];

  res.json(entityClasses);
});

// Get report definitions (both paths for compatibility)
app.get('/platform-api/reporting/definitions', (req, res) => {
  const { size = 20, page = 0, fields } = req.query;
  const start = page * size;
  const end = start + parseInt(size);

  // Format response to match what frontend expects
  const gridConfigFieldsViews = mockReportDefinitions.slice(start, end).map(def => ({
    gridConfigFields: {
      id: def.id,
      name: def.name,
      description: def.description,
      type: def.entityClass,
      userId: def.userId,
      creationDate: def.creationDate,
      modificationDate: def.creationDate,
      entityClass: def.entityClass,
      columns: def.columns || [],
    }
  }));

  res.json({
    _embedded: {
      gridConfigFieldsViews: gridConfigFieldsViews
    },
    page: {
      size: parseInt(size),
      totalElements: mockReportDefinitions.length,
      totalPages: Math.ceil(mockReportDefinitions.length / size),
      number: parseInt(page)
    }
  });
});

app.get('/platform-api/definitions', (req, res) => {
  const { size = 20, page = 0, fields } = req.query;
  const start = page * size;
  const end = start + parseInt(size);

  res.json({
    _embedded: {
      definitions: mockReportDefinitions.slice(start, end)
    },
    page: {
      size: parseInt(size),
      totalElements: mockReportDefinitions.length,
      totalPages: Math.ceil(mockReportDefinitions.length / size),
      number: parseInt(page)
    }
  });
});

// Get specific definition
app.get('/platform-api/definitions/:id', (req, res) => {
  const definition = mockReportDefinitions.find(d => d.id === req.params.id);
  if (definition) {
    res.json(definition);
  } else {
    res.status(404).json({ error: 'Definition not found' });
  }
});

// Get specific report definition (alternative path)
app.get('/platform-api/reporting/definitions/:id', (req, res) => {
  const definition = mockReportDefinitions.find(d => d.id === req.params.id);
  if (definition) {
    console.log(`📖 Fetching report definition: ${req.params.id}`);
    console.log(`   Name: ${definition.name}`);
    console.log(`   Entity Class: ${definition.requestClass}`);
    res.json(definition);
  } else {
    res.status(404).json({ error: 'Definition not found' });
  }
});

// Create new report definition
app.post('/platform-api/reporting/definitions', (req, res) => {
  const { name } = req.query;
  const configDefinition = req.body;

  // Generate a new ID
  const newId = `report-def-${String(mockReportDefinitions.length + 1).padStart(3, '0')}`;

  // Create new report definition
  const newDefinition = {
    '@bean': 'com.cyoda.core.reporting.ReportDefinition',
    id: newId,
    name: name || 'New Report',
    description: configDefinition.description || '',
    requestClass: configDefinition.requestClass || '',
    entityClass: configDefinition.requestClass || '',
    userId: 'admin',
    creationDate: new Date().toISOString(),
    columns: configDefinition.columns || [],
    colDefs: configDefinition.colDefs || [],
    aliasDefs: configDefinition.aliasDefs || [],
    sorting: configDefinition.sorting || [],
    grouping: configDefinition.grouping || [],
    summary: configDefinition.summary || [],
    condition: configDefinition.condition || {
      '@bean': 'com.cyoda.core.conditions.GroupCondition',
      operator: 'OR',
      conditions: [],
    },
    filterBuilder: configDefinition.filterBuilder || null,
  };

  // Add to mock data
  mockReportDefinitions.push(newDefinition);

  console.log(`✅ Created new report definition:`);
  console.log(`   Name: ${name}`);
  console.log(`   ID: ${newId}`);
  console.log(`   Entity Class: ${configDefinition.requestClass}`);

  // Return response in the format expected by frontend
  res.json({
    content: newId,
    message: 'Report definition created successfully'
  });
});

// Create definition
app.post('/platform-api/definitions', (req, res) => {
  const newDefinition = {
    ...req.body,
    id: `report-def-${Date.now()}`,
    creationDate: Date.now(),
    userId: 'admin'
  };
  mockReportDefinitions.push(newDefinition);
  res.json(newDefinition);
});

// Update definition
app.put('/platform-api/definitions/:id', (req, res) => {
  const index = mockReportDefinitions.findIndex(d => d.id === req.params.id);
  if (index >= 0) {
    mockReportDefinitions[index] = { ...mockReportDefinitions[index], ...req.body };
    res.json(mockReportDefinitions[index]);
  } else {
    res.status(404).json({ error: 'Definition not found' });
  }
});

// Update report definition (alternative path)
app.put('/platform-api/reporting/definitions/:id', (req, res) => {
  const index = mockReportDefinitions.findIndex(d => d.id === req.params.id);
  if (index >= 0) {
    mockReportDefinitions[index] = { ...mockReportDefinitions[index], ...req.body };
    console.log(`✅ Updated report definition: ${req.params.id}`);
    res.json(mockReportDefinitions[index]);
  } else {
    res.status(404).json({ error: 'Definition not found' });
  }
});

// Delete definition
app.delete('/platform-api/definitions/:id', (req, res) => {
  const index = mockReportDefinitions.findIndex(d => d.id === req.params.id);
  if (index >= 0) {
    mockReportDefinitions.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Definition not found' });
  }
});

// Run report
app.post('/platform-api/reporting/report/:id/run', (req, res) => {
  const reportId = `report-run-${Date.now()}`;
  console.log(`✅ Running report: ${req.params.id} (Run ID: ${reportId})`);

  // Return a mock report run response
  res.json({
    id: reportId,
    definitionId: req.params.id,
    status: 'RUNNING',
    startTime: new Date().toISOString(),
    message: 'Report execution started'
  });
});

// Get report history (both paths for compatibility)
app.get('/platform-api/reporting/history', (req, res) => {
  const { size = 20, page = 0, username, type, entityType } = req.query;
  let filtered = mockReportHistory;

  if (username) {
    filtered = filtered.filter(h => h.username === username);
  }
  if (type) {
    filtered = filtered.filter(h => h.type === type);
  }

  const start = page * size;
  const end = start + parseInt(size);

  res.json({
    _embedded: {
      reportHistories: filtered.slice(start, end)
    },
    page: {
      size: parseInt(size),
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size),
      number: parseInt(page)
    }
  });
});

app.get('/platform-api/history', (req, res) => {
  const { size = 20, page = 0, username, type } = req.query;
  let filtered = mockReportHistory;

  if (username) {
    filtered = filtered.filter(h => h.username === username);
  }
  if (type) {
    filtered = filtered.filter(h => h.type === type);
  }

  const start = page * size;
  const end = start + parseInt(size);

  res.json({
    _embedded: {
      reportHistories: filtered.slice(start, end)
    },
    page: {
      size: parseInt(size),
      totalElements: filtered.length,
      totalPages: Math.ceil(filtered.length / size),
      number: parseInt(page)
    }
  });
});

// Create/run report
app.post('/platform-api/report', (req, res) => {
  const newReport = {
    id: `report-hist-${Date.now()}`,
    configName: req.body.description || 'New Report',
    reportFailed: false,
    finishTime: null,
    startTime: Date.now(),
    type: req.body.requestClass || 'com.cyoda.model.Customer',
    username: 'admin',
    status: 'RUNNING',
    rowsCount: 0
  };
  mockReportHistory.unshift(newReport);
  res.json(newReport);
});

// Get report status
app.get('/platform-api/report/:id/status', (req, res) => {
  const report = mockReportHistory.find(h => h.id === req.params.id);
  if (report) {
    res.json({
      status: report.status,
      failed: report.reportFailed,
      rowsCount: report.rowsCount
    });
  } else {
    res.status(404).json({ error: 'Report not found' });
  }
});

// Delete report
app.delete('/platform-api/report/:id', (req, res) => {
  const index = mockReportHistory.findIndex(h => h.id === req.params.id);
  if (index >= 0) {
    mockReportHistory.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Report not found' });
  }
});

// Cancel report
app.post('/platform-api/report/:id/cancel', (req, res) => {
  const report = mockReportHistory.find(h => h.id === req.params.id);
  if (report) {
    report.status = 'CANCELLED';
    report.finishTime = Date.now();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Report not found' });
  }
});

// Export reports by IDs
app.get('/platform-api/reporting/export-by-ids', (req, res) => {
  const { includeIds } = req.query;
  const ids = includeIds ? includeIds.split(',') : [];
  const exported = mockReportDefinitions.filter(d => ids.includes(d.id));
  res.json({
    data: {
      value: exported
    }
  });
});

// Import reports
app.post('/platform-api/reporting/import', (req, res) => {
  const imported = req.body;
  res.json({
    success: true,
    imported: Array.isArray(imported) ? imported.length : 1,
    failed: 0,
    errors: [],
    message: `Successfully imported ${Array.isArray(imported) ? imported.length : 1} report definition(s)`
  });
});

// ============================================================================
// Stream Reports Endpoints
// ============================================================================

// Get stream definitions (new endpoint for React app)
app.get('/platform-api/reporting/stream-definitions', (req, res) => {
  console.log('📊 Fetching stream report definitions');
  res.json(mockStreamDefinitions);
});

// Get stream definitions (legacy endpoint)
app.get('/platform-api/streams', (req, res) => {
  const { size = 20, page = 0 } = req.query;
  const start = page * size;
  const end = start + parseInt(size);

  res.json({
    _embedded: {
      streams: mockStreamDefinitions.slice(start, end)
    },
    page: {
      size: parseInt(size),
      totalElements: mockStreamDefinitions.length,
      totalPages: Math.ceil(mockStreamDefinitions.length / size),
      number: parseInt(page)
    }
  });
});

// Get specific stream definition
app.get('/platform-api/streams/:id', (req, res) => {
  const stream = mockStreamDefinitions.find(s => s.id === req.params.id);
  if (stream) {
    res.json(stream);
  } else {
    res.status(404).json({ error: 'Stream definition not found' });
  }
});

// Create stream definition
app.post('/platform-api/streams', (req, res) => {
  const newStream = {
    ...req.body,
    id: `stream-def-${Date.now()}`,
    creationDate: Date.now(),
    userId: 'admin'
  };
  mockStreamDefinitions.push(newStream);
  res.json(newStream);
});

// Update stream definition
app.put('/platform-api/streams/:id', (req, res) => {
  const index = mockStreamDefinitions.findIndex(s => s.id === req.params.id);
  if (index >= 0) {
    mockStreamDefinitions[index] = { ...mockStreamDefinitions[index], ...req.body };
    res.json(mockStreamDefinitions[index]);
  } else {
    res.status(404).json({ error: 'Stream definition not found' });
  }
});

// Delete stream definition
app.delete('/platform-api/streams/:id', (req, res) => {
  const index = mockStreamDefinitions.findIndex(s => s.id === req.params.id);
  if (index >= 0) {
    mockStreamDefinitions.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Stream definition not found' });
  }
});

// Delete stream definition (new endpoint for React app)
app.delete('/platform-api/reporting/stream-definitions/:id', (req, res) => {
  const index = mockStreamDefinitions.findIndex(s => s.id === req.params.id);
  if (index >= 0) {
    const deleted = mockStreamDefinitions.splice(index, 1)[0];
    console.log(`🗑️  Deleted stream definition: ${deleted.name} (${req.params.id})`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Stream definition not found' });
  }
});

// Get stream data
app.post('/platform-api/streamdata/data', (req, res) => {
  res.json({
    _embedded: {
      rows: [
        { id: 1, name: 'Sample Data 1', value: 100 },
        { id: 2, name: 'Sample Data 2', value: 200 },
        { id: 3, name: 'Sample Data 3', value: 300 }
      ]
    },
    page: {
      size: 100,
      totalElements: 3,
      totalPages: 1,
      number: 0
    }
  });
});

// ============================================================================
// Catalog of Aliases Endpoints
// ============================================================================

// Get all catalog items
app.get('/platform-api/catalog/item/all', (req, res) => {
  res.json(mockCatalogItems);
});

// Get catalog items by entity class
app.get('/platform-api/catalog/item/class', (req, res) => {
  const { entityClass } = req.query;
  const filtered = entityClass
    ? mockCatalogItems.filter(item => item.entityClass === entityClass)
    : mockCatalogItems;
  res.json(filtered);
});

// Get specific catalog item
app.get('/platform-api/catalog/item', (req, res) => {
  const { itemId } = req.query;
  const item = mockCatalogItems.find(i => i.id === itemId);
  if (item) {
    res.json(item);
  } else {
    res.status(404).json({ error: 'Catalog item not found' });
  }
});

// Create catalog item
app.post('/platform-api/catalog/item', (req, res) => {
  const newItem = {
    ...req.body,
    id: `catalog-${Date.now()}`,
    creationDate: Date.now(),
    userId: 'admin'
  };
  mockCatalogItems.push(newItem);
  res.json(newItem.id);
});

// Update catalog item
app.put('/platform-api/catalog/item', (req, res) => {
  const { itemId } = req.query;
  const index = mockCatalogItems.findIndex(i => i.id === itemId);
  if (index >= 0) {
    mockCatalogItems[index] = { ...mockCatalogItems[index], ...req.body };
    res.json(mockCatalogItems[index]);
  } else {
    res.status(404).json({ error: 'Catalog item not found' });
  }
});

// Delete catalog item
app.delete('/platform-api/catalog/item', (req, res) => {
  const { itemId } = req.query;
  const index = mockCatalogItems.findIndex(i => i.id === itemId);
  if (index >= 0) {
    mockCatalogItems.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Catalog item not found' });
  }
});

// Export catalog items
app.get('/platform-api/catalog/item/export-by-ids', (req, res) => {
  const { ids, isSingleFile = true } = req.query;
  const idList = ids ? ids.split(',') : [];
  const exported = mockCatalogItems.filter(item => idList.includes(item.id));
  res.json({
    items: exported,
    isSingleFile: isSingleFile === 'true'
  });
});

// Import catalog items
app.post('/platform-api/catalog/item/import', (req, res) => {
  const { needRewrite = true } = req.query;
  const imported = req.body;
  res.json({
    success: true,
    imported: imported.items ? imported.items.length : 0,
    message: `Successfully imported ${imported.items ? imported.items.length : 0} catalog item(s)`
  });
});

// Get mappers
app.get('/platform-api/entity-info/fetch/mappers', (req, res) => {
  res.json([
    {
      shortName: 'StringConcat',
      mapperClass: 'com.cyoda.mapper.StringConcatMapper',
      inType: 'String',
      outType: 'String',
      entityClass: 'com.cyoda.model.Customer',
      parametrized: true,
      decision: 'MAPPER'
    },
    {
      shortName: 'Sum',
      mapperClass: 'com.cyoda.mapper.SumMapper',
      inType: 'Number',
      outType: 'Number',
      entityClass: 'com.cyoda.model.Order',
      parametrized: false,
      decision: 'MAPPER'
    }
  ]);
});

// Get users list
app.post('/platform-api/users/list', (req, res) => {
  const userIds = req.body;
  const users = userIds.map(userId => ({
    userId: userId,
    username: userId,
    firstName: userId === 'admin' ? 'Admin' : 'John',
    lastName: userId === 'admin' ? 'User' : 'Doe',
    email: `${userId}@example.com`
  }));
  res.json(users);
});

// ============================================================================
// Processing Endpoints (Port 8081)
// ============================================================================

// Health check
app.get('/actuator/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/processing/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/processing', (req, res) => {
  res.json({
    message: 'Cyoda Processing Mock Server',
    version: '1.0.0',
    endpoints: [
      '/processing/health',
      '/processing/nodes',
      '/processing/events',
      '/processing/tasks',
      '/processing/metrics'
    ]
  });
});

// Get all processing nodes
app.get('/processing/nodes', (req, res) => {
  res.json(mockNodes);
});

// Get node by ID
app.get('/processing/nodes/:id', (req, res) => {
  const node = mockNodes.find(n => n.id === req.params.id);
  if (node) {
    res.json(node);
  } else {
    res.status(404).json({ error: 'Node not found' });
  }
});

// Get node metrics
app.get('/processing/nodes/:id/metrics', (req, res) => {
  const node = mockNodes.find(n => n.id === req.params.id);
  if (node) {
    res.json({
      nodeId: node.id,
      timestamp: new Date().toISOString(),
      cpu: node.cpuUsage,
      memory: node.memoryUsage,
      disk: node.diskUsage,
      network: {
        bytesIn: Math.floor(Math.random() * 1000000),
        bytesOut: Math.floor(Math.random() * 1000000)
      }
    });
  } else {
    res.status(404).json({ error: 'Node not found' });
  }
});

// Get processing events
app.get('/processing/events', (req, res) => {
  const { page = 0, size = 20, sort = 'timestamp,desc' } = req.query;
  const start = page * size;
  const end = start + parseInt(size);
  const sortedEvents = [...mockEvents].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  
  res.json({
    content: sortedEvents.slice(start, end),
    page: {
      size: parseInt(size),
      totalElements: mockEvents.length,
      totalPages: Math.ceil(mockEvents.length / size),
      number: parseInt(page)
    }
  });
});

// Get processing tasks
app.get('/processing/tasks', (req, res) => {
  const { page = 0, size = 20, status } = req.query;
  let filteredTasks = mockTasks;
  
  if (status) {
    filteredTasks = mockTasks.filter(t => t.status === status);
  }
  
  const start = page * size;
  const end = start + parseInt(size);
  
  res.json({
    content: filteredTasks.slice(start, end),
    page: {
      size: parseInt(size),
      totalElements: filteredTasks.length,
      totalPages: Math.ceil(filteredTasks.length / size),
      number: parseInt(page)
    }
  });
});

// Get system metrics
app.get('/processing/metrics', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    totalNodes: mockNodes.length,
    onlineNodes: mockNodes.filter(n => n.status === 'ONLINE').length,
    offlineNodes: mockNodes.filter(n => n.status === 'OFFLINE').length,
    activeTasks: mockTasks.filter(t => t.status === 'RUNNING').length,
    completedTasks: mockTasks.filter(t => t.status === 'COMPLETED').length,
    failedTasks: mockTasks.filter(t => t.status === 'FAILED').length,
    averageCpuUsage: mockNodes.reduce((sum, n) => sum + n.cpuUsage, 0) / mockNodes.length,
    averageMemoryUsage: mockNodes.reduce((sum, n) => sum + n.memoryUsage, 0) / mockNodes.length
  });
});

// ============================================================================
// Platform API Endpoints (for SaaS App)
// ============================================================================

// Entity types
app.get('/platform-api/entity-info/fetch/types', (req, res) => {
  const { onlyDynamic } = req.query;
  const allTypes = [
    { id: 'entity-type-1', name: 'Customer', description: 'Customer entity type', dynamic: true },
    { id: 'entity-type-2', name: 'Order', description: 'Order entity type', dynamic: true },
    { id: 'entity-type-3', name: 'Product', description: 'Product entity type', dynamic: false }
  ];

  if (onlyDynamic === 'true') {
    res.json(allTypes.filter(t => t.dynamic));
  } else {
    res.json(allTypes);
  }
});

// Entity classes
app.get('/platform-api/entity/classes', (req, res) => {
  res.json([
    'com.cyoda.model.Customer',
    'com.cyoda.model.Order',
    'com.cyoda.model.Product',
    'com.cyoda.model.Transaction',
    'com.cyoda.model.Invoice',
    'com.cyoda.model.Payment'
  ]);
});

// Mappers
app.get('/platform-api/entity-info/fetch/mappers', (req, res) => {
  res.json([
    { id: 'mapper-1', name: 'CustomerMapper', sourceType: 'CSV', targetType: 'Customer' },
    { id: 'mapper-2', name: 'OrderMapper', sourceType: 'JSON', targetType: 'Order' }
  ]);
});

// Catalog items
app.get('/platform-api/catalog/item/all', (req, res) => {
  res.json([
    { id: 'catalog-1', name: 'Customer Data', type: 'Dataset', status: 'Active' },
    { id: 'catalog-2', name: 'Order History', type: 'Dataset', status: 'Active' },
    { id: 'catalog-3', name: 'Product Catalog', type: 'Dataset', status: 'Active' }
  ]);
});

// Report types
app.get('/platform-api/reporting/types', (req, res) => {
  res.json([
    { id: 'report-type-1', name: 'Sales Report', category: 'Financial' },
    { id: 'report-type-2', name: 'Customer Analytics', category: 'Analytics' },
    { id: 'report-type-3', name: 'Inventory Report', category: 'Operations' }
  ]);
});

// Report definitions
app.get('/platform-api/reporting/definitions', (req, res) => {
  res.json([
    { id: 'report-def-1', name: 'Monthly Sales', typeId: 'report-type-1', schedule: 'Monthly' },
    { id: 'report-def-2', name: 'Customer Segmentation', typeId: 'report-type-2', schedule: 'Weekly' },
    { id: 'report-def-3', name: 'Stock Levels', typeId: 'report-type-3', schedule: 'Daily' }
  ]);
});

// Mock data for statemachine
const mockWorkflows = [
  {
    id: 'workflow-1',
    name: 'default-tdb-workflow',
    entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 30
  },
  {
    id: 'workflow-2',
    name: 'default-workflow',
    entityClassName: 'com.cyoda.core.model.blob.CyodaBlobEntity',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 25
  },
  {
    id: 'workflow-3',
    name: 'default-workflow',
    entityClassName: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 20
  },
  {
    id: 'workflow-4',
    name: 'default-workflow',
    entityClassName: 'net.cyoda.saas.model.LegalEntity',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 15
  },
  {
    id: 'workflow-5',
    name: 'default-workflow',
    entityClassName: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 10
  },
  {
    id: 'workflow-6',
    name: 'default-workflow',
    entityClassName: 'net.cyoda.saas.model.TrinoViewDefinitionEntity',
    active: true,
    persisted: true,
    creationDate: Date.now() - 86400000 * 5
  }
];

const mockStates = [
  // Workflow 1 states
  { id: 'state-001', name: 'CREATED', workflowId: 'workflow-1', isInitial: true, isFinal: false },
  { id: 'state-002', name: 'PROCESSING', workflowId: 'workflow-1', isInitial: false, isFinal: false },
  { id: 'state-003', name: 'COMPLETED', workflowId: 'workflow-1', isInitial: false, isFinal: true },
  // Workflow 2 states
  { id: 'state-004', name: 'PENDING', workflowId: 'workflow-2', isInitial: true, isFinal: false },
  { id: 'state-005', name: 'ACTIVE', workflowId: 'workflow-2', isInitial: false, isFinal: false },
  { id: 'state-006', name: 'ARCHIVED', workflowId: 'workflow-2', isInitial: false, isFinal: true },
];

const mockTransitions = [
  // Workflow 1 transitions
  {
    id: 'trans-001',
    name: 'Start Processing',
    startStateId: 'state-001',
    endStateId: 'state-002',
    startStateName: 'CREATED',
    endStateName: 'PROCESSING',
    automated: true,
    active: true,
    persisted: true,
    workflowId: 'workflow-1',
    criteriaIds: ['criteria-001'],
    endProcessesIds: ['process-001'],
  },
  {
    id: 'trans-002',
    name: 'Complete',
    startStateId: 'state-002',
    endStateId: 'state-003',
    startStateName: 'PROCESSING',
    endStateName: 'COMPLETED',
    automated: true,
    active: true,
    persisted: true,
    workflowId: 'workflow-1',
    criteriaIds: [],
    endProcessesIds: ['process-002'],
  },
  // Workflow 2 transitions
  {
    id: 'trans-003',
    name: 'Activate',
    startStateId: 'state-004',
    endStateId: 'state-005',
    startStateName: 'PENDING',
    endStateName: 'ACTIVE',
    automated: false,
    active: true,
    persisted: true,
    workflowId: 'workflow-2',
    criteriaIds: ['criteria-002'],
    endProcessesIds: [],
  },
  {
    id: 'trans-004',
    name: 'Archive',
    startStateId: 'state-005',
    endStateId: 'state-006',
    startStateName: 'ACTIVE',
    endStateName: 'ARCHIVED',
    automated: false,
    active: true,
    persisted: true,
    workflowId: 'workflow-2',
    criteriaIds: [],
    endProcessesIds: ['process-003'],
  },
];

const mockCriteria = [
  { id: 'criteria-001', name: 'Data Valid', description: 'Check if data is valid', entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity' },
  { id: 'criteria-002', name: 'User Verified', description: 'Check if user is verified', entityClassName: 'com.cyoda.core.model.blob.CyodaBlobEntity' },
];

const mockProcesses = [
  { id: 'process-001', name: 'Initialize Processing', description: 'Initialize data processing', entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity' },
  { id: 'process-002', name: 'Send Notification', description: 'Send completion notification', entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity' },
  { id: 'process-003', name: 'Cleanup Resources', description: 'Clean up allocated resources', entityClassName: 'com.cyoda.core.model.blob.CyodaBlobEntity' },
];

// Workflows
app.get('/platform-api/statemachine/workflows', (req, res) => {
  res.json(mockWorkflows);
});

// Export workflows
app.get('/platform-api/statemachine/export', (req, res) => {
  console.log('📤 Export request received');

  // Parse includeIds from query string
  const includeIds = req.query.includeIds;
  const ids = Array.isArray(includeIds) ? includeIds : (includeIds ? [includeIds] : []);
  console.log('   includeIds:', ids);

  // Filter workflows by IDs
  const workflowsToExport = ids.length > 0
    ? mockWorkflows.filter(w => ids.includes(w.id))
    : mockWorkflows;
  console.log(`   Exporting ${workflowsToExport.length} workflows:`, workflowsToExport.map(w => w.name));

  // Get related states and transitions
  const workflowIds = workflowsToExport.map(w => w.id);
  const statesToExport = mockStates.filter(s => workflowIds.includes(s.workflowId));
  const transitionsToExport = mockTransitions.filter(t => workflowIds.includes(t.workflowId));

  // Get related criteria and processes from transitions
  const criteriaIds = new Set();
  const processIds = new Set();

  transitionsToExport.forEach(t => {
    t.criteriaIds?.forEach(id => criteriaIds.add(id));
    t.endProcessesIds?.forEach(id => processIds.add(id));
  });

  const criteriaToExport = mockCriteria.filter(c => criteriaIds.has(c.id));
  const processesToExport = mockProcesses.filter(p => processIds.has(p.id));

  console.log(`   Export summary:`);
  console.log(`     - Workflows: ${workflowsToExport.length}`);
  console.log(`     - States: ${statesToExport.length}`);
  console.log(`     - Transitions: ${transitionsToExport.length}`);
  console.log(`     - Criteria: ${criteriaToExport.length}`);
  console.log(`     - Processes: ${processesToExport.length}`);

  // Return in the expected format
  const exportData = {
    workflow: workflowsToExport,
    state: statesToExport,
    transition: transitionsToExport,
    criteria: criteriaToExport,
    process: processesToExport,
  };

  res.json(exportData);
});

// Import workflows
app.post('/platform-api/statemachine/import', (req, res) => {
  console.log('📥 Import request received');
  const { needRewrite } = req.query;
  const importData = req.body;

  console.log('   needRewrite:', needRewrite);
  console.log('   Workflows to import:', importData.workflow?.length || 0);
  console.log('   States to import:', importData.state?.length || 0);
  console.log('   Transitions to import:', importData.transition?.length || 0);
  console.log('   Criteria to import:', importData.criteria?.length || 0);
  console.log('   Processes to import:', importData.process?.length || 0);

  // Mock import - just return success
  res.json({
    success: true,
    imported: {
      workflows: importData.workflow?.length || 0,
      states: importData.state?.length || 0,
      transitions: importData.transition?.length || 0,
      criteria: importData.criteria?.length || 0,
      processes: importData.process?.length || 0,
    },
    message: 'Import successful'
  });
});

// Workflow enabled types (basic endpoint - returns objects with type info)
app.get('/platform-api/statemachine/workflow-enabled-types', (req, res) => {
  res.json([
    {
      name: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      value: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      label: 'TreeNodeEntity',
      type: 'PERSISTENCE'
    },
    {
      name: 'com.cyoda.core.model.blob.CyodaBlobEntity',
      value: 'com.cyoda.core.model.blob.CyodaBlobEntity',
      label: 'CyodaBlobEntity',
      type: 'PERSISTENCE'
    },
    {
      name: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
      value: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
      label: 'LegalEntityExtKey',
      type: 'BUSINESS'
    },
    {
      name: 'net.cyoda.saas.model.LegalEntity',
      value: 'net.cyoda.saas.model.LegalEntity',
      label: 'LegalEntity',
      type: 'BUSINESS'
    },
    {
      name: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
      value: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
      label: 'TrinoSchemaDefinitionEntity',
      type: 'BUSINESS'
    }
  ]);
});

// Models info endpoint (feature flag enabled - returns entity type info)
app.get('/platform-api/entity-info/fetch/models-info', (req, res) => {
  const stateEnabled = req.query.stateEnabled === 'true';

  // Return all entities with type information
  const allEntities = [
    {
      name: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      value: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      label: 'TreeNodeEntity',
      type: 'PERSISTENCE',
      stateEnabled: true
    },
    {
      name: 'com.cyoda.core.model.blob.CyodaBlobEntity',
      value: 'com.cyoda.core.model.blob.CyodaBlobEntity',
      label: 'CyodaBlobEntity',
      type: 'PERSISTENCE',
      stateEnabled: true
    },
    {
      name: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
      value: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
      label: 'LegalEntityExtKey',
      type: 'BUSINESS',
      stateEnabled: true
    },
    {
      name: 'net.cyoda.saas.model.LegalEntity',
      value: 'net.cyoda.saas.model.LegalEntity',
      label: 'LegalEntity',
      type: 'BUSINESS',
      stateEnabled: true
    },
    {
      name: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
      value: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
      label: 'TrinoSchemaDefinitionEntity',
      type: 'BUSINESS',
      stateEnabled: true
    },
    {
      name: 'net.cyoda.saas.model.TrinoViewDefinitionEntity',
      value: 'net.cyoda.saas.model.TrinoViewDefinitionEntity',
      label: 'TrinoViewDefinitionEntity',
      type: 'BUSINESS',
      stateEnabled: true
    }
  ];

  // Filter by stateEnabled if requested
  if (stateEnabled) {
    res.json(allEntities.filter(e => e.stateEnabled));
  } else {
    res.json(allEntities);
  }
});

// Instances endpoint
app.post('/platform-api/statemachine/instances', (req, res) => {
  const { entityClassName, entityIds, paging, rangeOrder, rangeCondition } = req.body;

  console.log('📋 Fetching instances for:', entityClassName);

  // Mock instances data
  const mockInstances = [
    {
      entityId: 'inst-001',
      entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      currentWorkflowId: 'workflow-1',
      state: 'ACTIVE',
      creationDate: Date.now() - 86400000 * 10,
      lastUpdateTime: Date.now() - 3600000,
      deleted: false
    },
    {
      entityId: 'inst-002',
      entityClassName: 'com.cyoda.tdb.model.treenode.TreeNodeEntity',
      currentWorkflowId: 'workflow-1',
      state: 'PENDING',
      creationDate: Date.now() - 86400000 * 5,
      lastUpdateTime: Date.now() - 7200000,
      deleted: false
    },
    {
      entityId: 'inst-003',
      entityClassName: 'com.cyoda.core.model.blob.CyodaBlobEntity',
      currentWorkflowId: 'workflow-2',
      state: 'COMPLETED',
      creationDate: Date.now() - 86400000 * 15,
      lastUpdateTime: Date.now() - 86400000,
      deleted: false
    },
    {
      entityId: 'inst-004',
      entityClassName: 'com.cyoda.plugins.iam.model.entity.LegalEntityExtKey',
      currentWorkflowId: 'workflow-3',
      state: 'ACTIVE',
      creationDate: Date.now() - 86400000 * 20,
      lastUpdateTime: Date.now() - 1800000,
      deleted: false
    },
    {
      entityId: 'inst-005',
      entityClassName: 'net.cyoda.saas.model.LegalEntity',
      currentWorkflowId: 'workflow-4',
      state: 'ACTIVE',
      creationDate: Date.now() - 86400000 * 25,
      lastUpdateTime: Date.now() - 900000,
      deleted: false
    },
    {
      entityId: 'inst-006',
      entityClassName: 'net.cyoda.saas.model.TrinoSchemaDefinitionEntity',
      currentWorkflowId: 'workflow-5',
      state: 'PENDING',
      creationDate: Date.now() - 86400000 * 30,
      lastUpdateTime: Date.now() - 450000,
      deleted: false
    }
  ];

  // Filter by entity class name
  let filteredInstances = entityClassName
    ? mockInstances.filter(inst => inst.entityClassName === entityClassName)
    : mockInstances;

  // Filter by entity IDs if provided
  if (entityIds && entityIds.length > 0) {
    filteredInstances = filteredInstances.filter(inst => entityIds.includes(inst.entityId));
  }

  // Apply paging
  const offset = paging?.offset || 0;
  const maxResults = paging?.maxResults || 20;
  const paginatedInstances = filteredInstances.slice(offset, offset + maxResults);

  res.json({
    '@bean': 'com.cyoda.core.model.PartialResultsListDto',
    hasMore: offset + maxResults < filteredInstances.length,
    items: paginatedInstances,
    instances: paginatedInstances, // Some APIs use 'instances' instead of 'items'
    rangeOrder: rangeOrder || 'ASC',
    pagingFilter: {
      offset: offset,
      maxResults: maxResults
    }
  });
});

// ============================================================================
// Platform Processing Endpoints
// ============================================================================

// Cluster stats full
app.get('/platform-processing/pm-cluster-stats-full.do', (req, res) => {
  res.json({
    pmNodes: [
      {
        hostname: 'processing-node-1',
        baseUrl: 'http://localhost:8081',
        status: 'ONLINE',
        cpuUsage: 45.2,
        memoryUsage: 62.8,
        diskUsage: 38.5,
        uptime: 86400000,
        version: '1.0.0',
        grafana: null
      },
      {
        hostname: 'processing-node-2',
        baseUrl: 'http://localhost:8082',
        status: 'ONLINE',
        cpuUsage: 32.1,
        memoryUsage: 54.3,
        diskUsage: 42.1,
        uptime: 172800000,
        version: '1.0.0',
        grafana: null
      },
      {
        hostname: 'processing-node-3',
        baseUrl: 'http://localhost:8083',
        status: 'OFFLINE',
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        uptime: 0,
        version: '1.0.0',
        grafana: null
      }
    ],
    totalNodes: 3,
    onlineNodes: 2,
    offlineNodes: 1,
    totalCpuUsage: 77.3,
    totalMemoryUsage: 117.1,
    totalDiskUsage: 80.6
  });
});

// ============================================================================
// Processing UI Config
// ============================================================================

// Config.json for processing-manager-react
app.get('/processing-ui/config.json', (req, res) => {
  res.json({
    apiBaseUrl: 'http://localhost:8080',
    grafanaUrl: 'http://localhost:3000',
    enableSSH: false,
    pollingInterval: 30000
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Cyoda Backend Mock Server - STARTED               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`✅ Server running on:            http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`   - http://localhost:${PORT}/api/*`);
  console.log(`   - http://localhost:${PORT}/processing/*`);
  console.log(`   - http://localhost:${PORT}/platform-api/*`);
  console.log('');
  console.log('📊 Mock Data:');
  console.log(`   - ${mockNodes.length} processing nodes`);
  console.log(`   - ${mockEvents.length} events`);
  console.log(`   - ${mockTasks.length} tasks`);
  console.log('');
  console.log('🎯 Ready for SaaS App on http://localhost:3000');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
});

