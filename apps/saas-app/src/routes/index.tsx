import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { HelperFeatureFlags } from '@cyoda/http-api-react';

// Lazy load package components for better performance
const TrinoIndex = React.lazy(() => import('@cyoda/cyoda-sass-react').then(m => ({ default: m.TrinoIndex })));
const TrinoEdit = React.lazy(() => import('@cyoda/cyoda-sass-react').then(m => ({ default: m.TrinoEdit })));

const Reports = React.lazy(() => import('@cyoda/reporting-react').then(m => ({ default: m.Reports })));
const ReportEditor = React.lazy(() => import('@cyoda/reporting-react').then(m => ({ default: m.ReportEditor })));
const ReportConfigsStream = React.lazy(() => import('@cyoda/reporting-react').then(m => ({ default: m.ReportConfigsStream })));
const ReportEditorStream = React.lazy(() => import('@cyoda/reporting-react').then(m => ({ default: m.ReportEditorStream })));
const CatalogueOfAliases = React.lazy(() => import('@cyoda/reporting-react').then(m => ({ default: m.CatalogueOfAliases })));

const Workflows = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.Workflows })));
const WorkflowEditorCloud = React.lazy(() =>
  import('@cyoda/statemachine-react').then((m) => ({ default: m.WorkflowEditorCloud }))
);
const WorkflowDetail = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.WorkflowDetail })));
const Instances = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.Instances })));
const InstanceDetail = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.InstanceDetail })));
const State = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.State })));
const Transition = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.Transition })));
const Criteria = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.Criteria })));
const Process = React.lazy(() => import('@cyoda/statemachine-react').then(m => ({ default: m.Process })));

const Tasks = React.lazy(() => import('@cyoda/tasks-react').then(m => ({ default: m.Tasks })));
const TaskDetail = React.lazy(() => import('@cyoda/tasks-react').then(m => ({ default: m.TaskDetail })));

const PageEntityViewer = React.lazy(() => import('@cyoda/ui-lib-react').then(m => ({ default: m.PageEntityViewer })));

const ProcessingHome = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.Home })));
const ProcessingNodes = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.Nodes })));
const ProcessingNodesDetail = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.NodesDetail })));
const TransactionDetail = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.TransactionDetail })));
const TransitionVersions = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.TransitionVersions })));
const TransitionChanges = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.TransitionChanges })));
const TransitionEntityStateMachine = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.TransitionEntityStateMachine })));
const EventView = React.lazy(() => import('@cyoda/processing-manager-react').then(m => ({ default: m.EventView })));

// Login page - not lazy-loaded to avoid flash on initial load
import Login from '../pages/Login';
import { OidcCallback } from '../auth/OidcCallback';

export const AppRoutes: React.FC = () => {
  const isTrinoEnabled = HelperFeatureFlags.isTrinoSqlSchemaEnabled();
  const isTasksAvailable = HelperFeatureFlags.isTasksAvailable();
  const isReportingAvailable = HelperFeatureFlags.isReportingAvailable();
  const isProcessingManagerAvailable = HelperFeatureFlags.isProcessingManagerAvailable();
  const defaultRoute = '/workflows';

  return (
    <Routes>
      {/* Login Route */}
      <Route path="/login" element={<Login />} />
      <Route path="/oidc/callback" element={<OidcCallback />} />

      {/* Main App Routes with Layout */}
      <Route path="/" element={<AppLayout />}>
        {/* Default redirect */}
        <Route index element={<Navigate to={defaultRoute} replace />} />

        {/* Trino SQL Schemas - conditionally rendered based on feature flag */}
        {isTrinoEnabled && (
          <>
            <Route path="trino" element={<TrinoIndex />} />
            <Route path="trino/schema" element={<TrinoEdit />} />
            <Route path="trino/schema/:id" element={<TrinoEdit />} />
          </>
        )}

        {/* Reporting - hidden under cyoda-go (uses /platform-* endpoints) */}
        {isReportingAvailable && (
          <>
            <Route path="reporting/reports" element={<Reports />} />
            <Route path="reporting/report-editor/:id" element={<ReportEditor />} />
            <Route path="reporting/reports/stream" element={<ReportConfigsStream />} />
            <Route path="reporting/reports/stream/:id" element={<ReportEditorStream />} />
            <Route path="reporting/catalogue-of-aliases" element={<CatalogueOfAliases />} />
          </>
        )}

        {/* Lifecycle - Statemachine */}
        <Route path="workflows" element={<Workflows />} />
        <Route path="workflow/new" element={<WorkflowDetail />} />
        <Route path="workflow/:workflowId" element={<WorkflowDetail />} />

        {/* Cloud workflow editor (real editor in sub-branch 4) */}
        {/* isCyodaCloud() returns true under cyoda-cloud AND cyoda-go; legacy mode falls through to /workflows */}
        {HelperFeatureFlags.isCyodaCloud() && (
          <>
            <Route
              path="workflow/:entityName/:modelVersion/new"
              element={<WorkflowEditorCloud />}
            />
            <Route
              path="workflow/:entityName/:modelVersion/:workflowName"
              element={<WorkflowEditorCloud />}
            />
          </>
        )}

        <Route path="instances" element={<Instances />} />
        <Route path="instances/:instanceId" element={<InstanceDetail />} />
        <Route path="state/:stateId" element={<State />} />
        <Route path="transition/:transitionId" element={<Transition />} />
        <Route path="criteria/:criteriaId" element={<Criteria />} />
        <Route path="process/:processId" element={<Process />} />

        {/* Tasks - hidden under cyoda-go and gated by VITE_FEATURE_FLAG_TASKS */}
        {isTasksAvailable && (
          <>
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
          </>
        )}

        {/* Entity Viewer */}
        <Route path="entity-viewer" element={<PageEntityViewer />} />

        {/* Processing Manager - hidden under cyoda-go (uses /platform-processing endpoints) */}
        {isProcessingManagerAvailable && (
          <>
            <Route path="processing" element={<Navigate to="/processing-ui" replace />} />
            <Route path="processing-ui" element={<ProcessingHome />} />
            <Route path="processing-ui/nodes" element={<ProcessingNodes />} />
            <Route path="processing-ui/nodes/:name" element={<ProcessingNodesDetail />} />
            <Route path="processing-ui/nodes/:name/transaction/:transactionId" element={<TransactionDetail />} />
            <Route path="processing-ui/nodes/:name/versions" element={<TransitionVersions />} />
            <Route path="processing-ui/nodes/:name/changes" element={<TransitionChanges />} />
            <Route path="processing-ui/nodes/:name/entity-state-machine" element={<TransitionEntityStateMachine />} />
            <Route path="processing-ui/nodes/:name/event-view" element={<EventView />} />
          </>
        )}

        {/* Catch all - redirect to default route */}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  );
};

