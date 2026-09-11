// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  DraftInspectorPanel,
  WorkspaceAgentLayout,
  type WorkspaceAgentLayoutProps,
} from '../workspace-agent-layout';

function setup(overrides: Partial<WorkspaceAgentLayoutProps> = {}) {
  const props: WorkspaceAgentLayoutProps = {
    conversation: <div data-testid="conversation-log">Conversation log</div>,
    composer: <div data-testid="composer-stack">Composer and bar</div>,
    canvas: <div data-testid="canvas-stack">Canvas viewport</div>,
    inspectorPanel: 'evidence',
    onInspectorPanelChange: vi.fn(),
    inspectorPanels: {
      evidence: <div data-testid="inspector-evidence">Evidence content</div>,
      draft: <div data-testid="inspector-draft">Draft content</div>,
      prompt: <div data-testid="inspector-prompt">Prompt content</div>,
    },
    ...overrides,
  };
  render(<WorkspaceAgentLayout {...props} />);
  return props;
}

describe('workspace agent layout', () => {
  it('renders conversation and canvas panes with exactly one composer instance outside the panes', () => {
    setup();
    expect(screen.getByTestId('workspace-agent-layout')).toBeVisible();
    expect(screen.getByTestId('workspace-conversation-pane')).toBeVisible();
    expect(screen.getByTestId('workspace-canvas-pane')).toBeVisible();
    expect(screen.getAllByTestId('composer-stack')).toHaveLength(1);
    expect(screen.getByTestId('workspace-composer-area')).toContainElement(screen.getByTestId('composer-stack'));
    expect(screen.getByTestId('workspace-conversation-pane')).not.toContainElement(screen.getByTestId('composer-stack'));
    expect(screen.getByTestId('workspace-canvas-pane')).not.toContainElement(screen.getByTestId('composer-stack'));
  });

  it('keeps inactive inspector panels mounted but hidden', () => {
    setup({ inspectorPanel: 'prompt' });
    expect(screen.getByTestId('inspector-evidence')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-evidence').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
    expect(screen.getByTestId('inspector-prompt').closest('[role="tabpanel"]')).not.toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    expect(screen.getByRole('tab', { name: 'Draft' })).not.toHaveAttribute('aria-selected', 'true');
  });

  it('moves inspector focus and selection with arrow and end keys', () => {
    const props = setup();
    const evidence = screen.getByRole('tab', { name: 'Evidence' });
    evidence.focus();
    fireEvent.keyDown(evidence, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Draft' })).toHaveFocus();
    expect(props.onInspectorPanelChange).toHaveBeenCalledWith('draft');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Draft' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Prompt' })).toHaveFocus();
  });

  it('notifies the inspector switch intent through the callback', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }));
    expect(props.onInspectorPanelChange).toHaveBeenCalledWith('prompt');
  });
});

describe('draft inspector panel', () => {
  const draft = {
    revision: 3,
    saveState: 'saved',
    intent: 'Same style',
    detailLevel: 'Balanced',
    variables: [{ name: 'subject', value: 'A quiet studio' }],
    enabledRules: ['Soft glass highlights'],
    constraints: ['Keep negative space'],
    negativePrompt: 'no text',
    params: { model: 'flux-2-dev', aspectRatio: '3:4', quality: 'standard' },
    aspectRatioSource: 'reference',
  };

  it('shows variables first, then intent, rules and generation parameters', () => {
    render(<DraftInspectorPanel {...draft} />);
    const panel = screen.getByTestId('draft-inspector');
    const variablesIndex = panel.textContent!.indexOf('subject');
    const intentIndex = panel.textContent!.indexOf('Same style');
    const rulesIndex = panel.textContent!.indexOf('Keep negative space');
    const paramsIndex = panel.textContent!.indexOf('flux-2-dev');
    expect(variablesIndex).toBeGreaterThan(-1);
    expect(variablesIndex).toBeLessThan(intentIndex);
    expect(intentIndex).toBeLessThan(rulesIndex);
    expect(rulesIndex).toBeLessThan(paramsIndex);
    expect(panel).toHaveAttribute('data-revision', '3');
    expect(panel).toHaveAttribute('data-save-state', 'saved');
  });

  it('reports pending proposals without claiming they changed the draft', () => {
    render(<DraftInspectorPanel {...draft} proposalPending />);
    expect(screen.getByTestId('draft-inspector').textContent).toContain('A proposal is waiting for your review');
    expect(screen.getByTestId('draft-inspector')).toHaveAttribute('data-revision', '3');
  });

  it('states missing information instead of inventing values', () => {
    render(<DraftInspectorPanel {...draft} revision={null} variables={[]} enabledRules={[]} aspectRatioSource={null} />);
    const panel = screen.getByTestId('draft-inspector');
    expect(panel.textContent).toContain('No direction yet');
    expect(panel.textContent).toContain('Not available');
  });
});
