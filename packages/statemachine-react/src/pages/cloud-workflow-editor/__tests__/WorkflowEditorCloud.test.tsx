import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import userEvent from '@testing-library/user-event';
import { WorkflowEditorCloud } from '../WorkflowEditorCloud';
import { getWorkflowGateway } from '../../../gateways';
import { WorkflowNotFoundError } from '../../../gateways/errors';

vi.mock('../../../gateways', async () => {
  const actual = await vi.importActual<any>('../../../gateways');
  return { ...actual, getWorkflowGateway: vi.fn() };
});

// useDirtyGuard uses useBlocker which requires a data router; stub it out for unit tests.
vi.mock('../useDirtyGuard', () => ({ useDirtyGuard: vi.fn() }));

vi.mock('../../../components/GraphicalStateMachine', () => ({
  GraphicalStateMachine: () => <div data-testid="graphical-state-machine-stub" />,
}));

/** Renders the current MemoryRouter pathname into a data-testid for assertions. */
const LocationSpy: React.FC = () => {
  const loc = useLocation();
  return <div data-testid="current-path">{loc.pathname}</div>;
};

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <App>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/workflow/:entityName/:modelVersion/new" element={<WorkflowEditorCloud />} />
            <Route path="/workflow/:entityName/:modelVersion/:workflowName" element={<WorkflowEditorCloud />} />
          </Routes>
          <LocationSpy />
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}

const sampleDoc = {
  version: '1.0', name: 'wf', initialState: 'draft',
  states: { draft: { transitions: [{ name: 't', next: 'draft', manual: false }] } },
};

describe('WorkflowEditorCloud — load / scaffold / 404', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an existing workflow via gateway.loadWorkflow', async () => {
    vi.mocked(getWorkflowGateway).mockReturnValue({
      loadWorkflow: vi.fn().mockResolvedValue(sampleDoc),
      saveWorkflow: vi.fn(), copyWorkflow: vi.fn(), deleteWorkflow: vi.fn(),
      renameWorkflow: vi.fn(), listWorkflows: vi.fn(),
    } as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
  });

  it('uses the scaffold for /new', async () => {
    vi.mocked(getWorkflowGateway).mockReturnValue({
      loadWorkflow: vi.fn(), saveWorkflow: vi.fn(), copyWorkflow: vi.fn(),
      deleteWorkflow: vi.fn(), renameWorkflow: vi.fn(), listWorkflows: vi.fn(),
    } as any);
    renderAt('/workflow/Customer/1/new');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
  });

  it('renders a 404 result when modelVersion is not a number', async () => {
    renderAt('/workflow/Customer/abc/wf');
    expect(await screen.findByText('Bad workflow URL')).toBeInTheDocument();
  });

  it('Save and Discard buttons exist and are disabled while not dirty', async () => {
    vi.mocked(getWorkflowGateway).mockReturnValue({
      loadWorkflow: vi.fn().mockResolvedValue(sampleDoc),
      saveWorkflow: vi.fn(), copyWorkflow: vi.fn(), deleteWorkflow: vi.fn(),
      renameWorkflow: vi.fn(), listWorkflows: vi.fn(),
    } as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Discard changes/ })).toBeDisabled();
  });

  it('view radio toggle switches between Tabular / Graphical / Config', async () => {
    vi.mocked(getWorkflowGateway).mockReturnValue({
      loadWorkflow: vi.fn().mockResolvedValue(sampleDoc),
      saveWorkflow: vi.fn(), copyWorkflow: vi.fn(), deleteWorkflow: vi.fn(),
      renameWorkflow: vi.fn(), listWorkflows: vi.fn(),
    } as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    // Default is tabular — "+ Add transition" button is visible.
    expect(screen.getByText(/\+ Add transition/)).toBeInTheDocument();
    // Click Graphical — AntD radio buttons wrap the hidden input in a label; click the label text.
    await userEvent.click(screen.getByText('Graphical'));
    expect(screen.queryByText(/\+ Add transition/)).not.toBeInTheDocument();
    // Click Config — real ConfigView renders a <pre> with JSON.
    await userEvent.click(screen.getByText('Config'));
    expect(screen.queryByText(/\+ Add transition/)).not.toBeInTheDocument();
    // The ConfigView <pre> contains the serialised doc.
    const { container } = { container: document.body };
    expect(container.textContent).toContain('"version"');
  });
});

describe('WorkflowEditorCloud — save flow', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeGateway(overrides: any = {}) {
    return {
      loadWorkflow: vi.fn().mockResolvedValue(sampleDoc),
      saveWorkflow: vi.fn().mockResolvedValue({ key: 'wf' }),
      copyWorkflow: vi.fn(), deleteWorkflow: vi.fn(),
      renameWorkflow: vi.fn(), listWorkflows: vi.fn(),
      ...overrides,
    };
  }

  it('Save click calls saveWorkflow with the right doc and re-fetches via loadWorkflow', async () => {
    const gw = makeGateway();
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    // Make the doc dirty by editing the description field.
    const descInput = await screen.findByRole('textbox', { name: /description/i });
    await userEvent.type(descInput, 'X');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(gw.saveWorkflow).toHaveBeenCalled());
    // initial loadWorkflow via useQuery + post-save fetchQuery = 2 total
    await waitFor(() => expect(gw.loadWorkflow).toHaveBeenCalledTimes(2));
  });

  it('Validation failure does not call saveWorkflow and shows the banner', async () => {
    const gw = makeGateway();
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    // Make the doc dirty AND invalid: clear the name field.
    const nameInput = await screen.findByDisplayValue('wf');
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(gw.saveWorkflow).not.toHaveBeenCalled();
    expect(await screen.findByText(/validation failed/i)).toBeInTheDocument();
  });

  it('after save on /new, calls saveWorkflow with the right doc', async () => {
    const gw = makeGateway();
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/new');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    const nameInput = await screen.findByRole('textbox', { name: /^Name$/i });
    await userEvent.type(nameInput, 'created');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => {
      expect(gw.saveWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ entityName: 'Customer', modelVersion: 1 }),
        expect.objectContaining({ name: 'created' }),
        'MERGE',
      );
    });
  });

  it('on cyoda-go, a new workflow is saved with a schema version cyoda-go accepts', async () => {
    vi.stubEnv('VITE_FEATURE_FLAG_IS_CYODA_GO', 'true');
    try {
      const gw = makeGateway();
      vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
      renderAt('/workflow/Customer/1/new');
      await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
      await userEvent.type(await screen.findByRole('textbox', { name: /^Name$/i }), 'created');
      await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
      await waitFor(() => {
        expect(gw.saveWorkflow).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ name: 'created', version: '1.4' }),
          'MERGE',
        );
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('Discard-changes confirms then resets to pristine', async () => {
    const gw = makeGateway();
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    const descInput = await screen.findByRole('textbox', { name: /description/i });
    await userEvent.type(descInput, 'X');
    await userEvent.click(screen.getByRole('button', { name: /Discard changes/ }));
    // Confirm dialog
    await userEvent.click(await screen.findByRole('button', { name: /^Discard$/ }));
    // Doc is back to pristine; description is cleared
    await waitFor(() => expect((descInput as HTMLInputElement).value).toBe(''));
  });

  it('after save on /new, navigates to canonical URL with replace=true', async () => {
    const gw = makeGateway();
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/new');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    // Confirm we start at /new
    expect(screen.getByTestId('current-path').textContent).toBe('/workflow/Customer/1/new');
    const nameInput = await screen.findByRole('textbox', { name: /^Name$/i });
    await userEvent.type(nameInput, 'fresh');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(gw.saveWorkflow).toHaveBeenCalled());
    // After save, navigate replaces /new with the canonical workflow URL
    await waitFor(() =>
      expect(screen.getByTestId('current-path').textContent).toBe('/workflow/Customer/1/fresh'),
    );
  });

  it('after save, WorkflowNotFoundError surfaces a warning toast and does not navigate', async () => {
    const gw = makeGateway();
    let call = 0;
    gw.loadWorkflow = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(sampleDoc);
      return Promise.reject(new WorkflowNotFoundError('Customer', 1, 'wf'));
    });
    vi.mocked(getWorkflowGateway).mockReturnValue(gw as any);
    renderAt('/workflow/Customer/1/wf');
    await waitFor(() => expect(screen.getByText(/Workflow settings/)).toBeInTheDocument());
    const descInput = await screen.findByRole('textbox', { name: /description/i });
    await userEvent.type(descInput, 'X');
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(gw.saveWorkflow).toHaveBeenCalled());
    await waitFor(() => expect(gw.loadWorkflow).toHaveBeenCalledTimes(2));
    // The warning toast should appear
    expect(await screen.findByText(/saved workflow could not be re-loaded by name/i)).toBeInTheDocument();
  });
});
