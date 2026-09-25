import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Radio, Result, Space } from 'antd';
import { App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { HelperFeatureFlags } from '@cyoda/http-api-react';
import { createWorkflowEditorStore } from './workflowEditorStore';
import { WorkflowEditorStoreContext, useWorkflowEditorStore } from './storeContext';
import { useDirtyGuard } from './useDirtyGuard';
import { validateWorkflowDoc } from './validateWorkflowDoc';
import { getWorkflowGateway } from '../../gateways';
import { statemachineKeys } from '../../hooks/useStatemachine';
import { MustHaveActiveWorkflowError, WorkflowNotFoundError } from '../../gateways/errors';
import type { WorkflowDoc } from '../../gateways';
import { WorkflowSettingsForm } from './nodes/WorkflowSettingsForm';
import { TabularView } from './views/TabularView';
import { GraphicalView } from './views/GraphicalView';
import { ConfigView } from './views/ConfigView';
import { CYODA_GO_WORKFLOW_SCHEMA_VERSION } from '../../components/cloud-workflows/conditionCatalog';

// cyoda-go rejects schema version "1.0" at import (it accepts 1.1–1.4).
const scaffold = (): WorkflowDoc => ({
  version: HelperFeatureFlags.isCyodaGo() ? CYODA_GO_WORKFLOW_SCHEMA_VERSION : '1.0',
  name: '', initialState: 'draft',
  states: { draft: { transitions: [] } }, active: true,
});

export const WorkflowEditorCloud: React.FC = () => {
  const params = useParams<{ entityName: string; modelVersion: string; workflowName?: string }>();
  const store = useMemo(() => createWorkflowEditorStore(), []);

  const isBadRef = !params.entityName || Number.isNaN(Number(params.modelVersion));
  const modelRef = { entityName: params.entityName ?? '', modelVersion: Number(params.modelVersion) };
  const isNew = !params.workflowName || params.workflowName === 'new';

  const query = useQuery({
    queryKey: statemachineKeys.workflowDoc(modelRef, params.workflowName),
    queryFn: () => getWorkflowGateway().loadWorkflow(modelRef, params.workflowName!),
    enabled: !isBadRef && !isNew,
  });

  // Hydrate once when fresh data arrives or for /new.
  useEffect(() => {
    if (store.getState().pristine !== null) return;
    if (isNew && !isBadRef) store.getState().hydrate(scaffold());
    else if (query.data) store.getState().hydrate(query.data);
  }, [store, isNew, isBadRef, query.data]);

  if (isBadRef) {
    return <Result status="404" title="Bad workflow URL" subTitle="entityName or modelVersion missing or invalid." extra={<a href="/workflows">Back to workflows</a>} />;
  }

  return (
    <WorkflowEditorStoreContext.Provider value={store}>
      <PageBody
        isNew={isNew}
        entityName={modelRef.entityName}
        modelVersion={modelRef.modelVersion}
        workflowName={params.workflowName ?? ''}
      />
    </WorkflowEditorStoreContext.Provider>
  );
};

type ViewMode = 'tabular' | 'graphical' | 'config';

const PageBody: React.FC<{ isNew: boolean; entityName: string; modelVersion: number; workflowName: string }> = ({ isNew, entityName, modelVersion, workflowName }) => {
  const isDirty = useWorkflowEditorStore((s) => s.pristine !== null && s.current !== s.pristine);
  const ready = useWorkflowEditorStore((s) => s.pristine !== null);
  const [view, setView] = useState<ViewMode>('tabular');
  useDirtyGuard(isDirty);

  if (!ready) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <WorkflowSettingsForm />
          <Radio.Group
            value={view}
            onChange={(e) => setView(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: 'Tabular',   value: 'tabular' },
              { label: 'Graphical', value: 'graphical' },
              { label: 'Config',    value: 'config' },
            ]}
          />
          {view === 'tabular'   && <TabularView />}
          {view === 'graphical' && <GraphicalView modelRef={{ entityName, modelVersion }} workflowName={workflowName} />}
          {view === 'config'    && <ConfigView />}
        </Space>
      </div>
      <SaveBar isNew={isNew} entityName={entityName} modelVersion={modelVersion} />
    </div>
  );
};


const SaveBar: React.FC<{ isNew: boolean; entityName: string; modelVersion: number }> = ({ isNew, entityName, modelVersion }) => {
  const store = useContext(WorkflowEditorStoreContext)!;
  const isDirty = useWorkflowEditorStore((s) => s.pristine !== null && s.current !== s.pristine);
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const current = store.getState().current;
    if (!current) return;
    setSaving(true);
    try {
      const issues = validateWorkflowDoc(current, { cyodaGo: HelperFeatureFlags.isCyodaGo() });
      if (issues.length > 0) {
        store.getState().setErrors(issues);
        const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : '';
        message.error(`Validation failed at ${issues[0].path}: ${issues[0].message}${more}`);
        setSaving(false);
        return;
      }
      const modelRef = { entityName, modelVersion };
      await getWorkflowGateway().saveWorkflow(modelRef, current, 'MERGE');
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: statemachineKeys.workflowDoc(modelRef, current.name),
          queryFn: () => getWorkflowGateway().loadWorkflow(modelRef, current.name),
        });
        store.getState().hydrate(fresh);
        if (isNew) navigate(`/workflow/${entityName}/${modelVersion}/${current.name}`, { replace: true });
        message.success('Workflow saved');
      } catch (err: any) {
        if (err instanceof WorkflowNotFoundError) {
          message.warning('Save succeeded but the saved workflow could not be re-loaded by name. Refresh the workflows list.');
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      if (err instanceof MustHaveActiveWorkflowError) message.error('Cannot deactivate the only active workflow');
      else message.error(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => {
    modal.confirm({
      title: 'Discard all unsaved changes? This cannot be undone.',
      okText: 'Discard',
      cancelText: 'Keep editing',
      onOk: () => store.getState().resetToPristine(),
    });
  };

  return (
    <div style={{ borderTop: '1px solid #eee', padding: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button onClick={onDiscard} disabled={!isDirty || saving}>Discard changes</Button>
      <Button type="primary" loading={saving} disabled={!isDirty || saving} onClick={onSave}>Save</Button>
    </div>
  );
};

export default WorkflowEditorCloud;
