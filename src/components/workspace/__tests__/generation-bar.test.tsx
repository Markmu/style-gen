// @vitest-environment jsdom
import { render,screen,fireEvent } from '@testing-library/react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { GenerationBar,type GenerationSummary } from '../generation-bar';
const summary:GenerationSummary={directionId:'direction',token:'display-token',revision:3,prompt:'Fixed content',negative:'no text',params:{model:'flux-2-dev',aspectRatio:'3:4',quality:'standard'}};
const props=()=>({params:summary.params,onParamsChange:vi.fn(),summary,reason:null,onRepair:vi.fn(),repairLabel:'Resolve required item',onGenerate:vi.fn(),busy:false,unknown:false,onCheck:vi.fn()});
beforeEach(()=>{vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})));vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});});
describe('generation bar',()=>{
 it('renders real ratios, only Standard and honest negative capability',()=>{render(<GenerationBar {...props()}/>);expect(screen.getByLabelText('Aspect ratio').querySelectorAll('option')).toHaveLength(5);expect(screen.getByText('HD - unsupported, select Standard')).toBeDisabled();expect(screen.queryByText(/not applied separately/)).toBeNull();});
 it('allows editing the next round during a task while blocking a second image',()=>{const p=props();render(<GenerationBar {...p} busy/>);expect(screen.getByRole('button',{name:'Generating 1 image'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Aspect ratio'),{target:{value:'16:9'}});expect(p.onParamsChange).toHaveBeenCalledWith({...summary.params,aspectRatio:'16:9'});});
 it('unknown exposes only check and blocks image actions',()=>{const p=props();render(<GenerationBar {...p} unknown/>);fireEvent.click(screen.getByRole('button',{name:'Check original submission'}));expect(p.onCheck).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:'Generate 1 image'})).toBeDisabled();});
 it('renders distinct fixed retry summary and current draft action',()=>{const p=props();render(<GenerationBar {...p} failed retrySummary={{...summary,prompt:'Original content'}} onRetryDisplayed={vi.fn()} onRetryOriginal={vi.fn()}/>);expect(screen.getByRole('button',{name:'Generate current draft'})).toBeVisible();expect(screen.getByRole('button',{name:'Retry original submission'})).toBeVisible();expect(screen.getByText('Original content')).toBeVisible();});
});
