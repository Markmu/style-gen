// @vitest-environment jsdom
import {render,screen,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {AgentConversation} from '../agent-conversation';
import type {WorkspaceEvent} from '@/lib/workspace/contracts';
const event=(values:Partial<WorkspaceEvent>={})=>({id:'event',kind:'turn',state:'completed',inputText:'Keep my text',replyText:'An actual answer',changes:[],choices:[],references:[],...values}) as WorkspaceEvent;
const props=()=>({events:[event()],hasEarlier:false,onEarlier:vi.fn(),onRetry:vi.fn(),onCheck:vi.fn(),onResend:vi.fn(),busy:false,paused:false});
describe('Agent conversation',()=>{
 it('renders model HTML as text and never creates executable markup',()=>{render(<AgentConversation {...props()} events={[event({replyText:'<script>alert(1)</script>'})]}/>);expect(screen.getByRole('log')).toHaveTextContent('<script>alert(1)</script>');expect(document.querySelector('script')).toBeNull();});
 it('keeps failed input in place with explicit retry, disabled while paused',()=>{const p=props();const {rerender}=render(<AgentConversation {...p} events={[event({state:'failed',errorCode:'AGENT_OUTPUT_INVALID'})]}/>);fireEvent.click(screen.getByRole('button',{name:'Retry message'}));expect(p.onRetry).toHaveBeenCalledWith(expect.objectContaining({id:'event'}));expect(screen.getByRole('log')).toHaveTextContent('Keep my text');rerender(<AgentConversation {...p} paused events={[event({state:'failed'})]}/>);expect(screen.getByRole('button',{name:'Retry message'})).toBeDisabled();});
 it('unknown message exposes read-first recovery and processing has only actual phase',()=>{const p=props();render(<AgentConversation {...p} pendingText="Unconfirmed" events={[event({state:'processing',replyText:null})]}/>);fireEvent.click(screen.getByRole('button',{name:'Check message status'}));expect(p.onCheck).toHaveBeenCalledOnce();expect(screen.getByRole('log')).toHaveTextContent('Interpreting your message');expect(screen.queryByText(/thinking/i)).toBeNull();});
 it('shows stale proposal as historical and preserves choice text',()=>{render(<AgentConversation {...props()} events={[event({responseKind:'proposal',proposalState:'stale',choices:['Original choice']})]}/>);expect(screen.getByRole('log')).toHaveTextContent('earlier draft');expect(screen.getByRole('listitem')).toHaveTextContent('Original choice');});
});

it('AC-05 copy edit has no side effect until Apply; stale recovery retains event reference',async()=>{
 const onProposal=vi.fn().mockResolvedValue(undefined),onRepropose=vi.fn();const proposal=event({responseKind:'proposal',proposalState:'pending',baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:'before',after:'after'}]});
 const {rerender}=render(<AgentConversation {...props()} events={[proposal]} onProposal={onProposal} onRepropose={onRepropose} revision={0}/>);
 fireEvent.click(screen.getByRole('button',{name:'Edit draft'}));fireEvent.change(screen.getByRole('textbox',{name:'Proposed customPrompt'}),{target:{value:'edited copy'}});expect(onProposal).not.toHaveBeenCalled();expect(proposal.changes[0].after).toBe('after');fireEvent.click(screen.getByRole('button',{name:'Apply proposal'}));expect(onProposal).toHaveBeenCalledWith('apply',proposal,[expect.objectContaining({after:'edited copy'})]);
 rerender(<AgentConversation {...props()} events={[{...proposal,proposalState:'stale'}]} onProposal={onProposal} onRepropose={onRepropose} revision={1}/>);expect(screen.queryByRole('button',{name:'Apply proposal'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Request latest comparison'}));expect(onRepropose).toHaveBeenCalledWith(expect.objectContaining({id:'event'}));
});
