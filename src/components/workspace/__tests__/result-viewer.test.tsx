// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
import {ResultViewer} from '../result-viewer';
afterEach(()=>vi.unstubAllGlobals());
it('reloads only the failed image and retries only the same download',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response('',{status:503}));vi.stubGlobal('fetch',fetch);const onContinue=vi.fn();render(<ResultViewer id="old" url="https://cdn.example.test/old.png" draftRevision={4} onContinue={onContinue} onCompare={vi.fn()}/>);
 fireEvent.error(screen.getByAltText('Viewed result old'));await userEvent.click(screen.getByRole('button',{name:'Reload image'}));expect(screen.getByAltText('Viewed result old')).toHaveAttribute('src','https://cdn.example.test/old.png');expect(fetch).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'Download result'}));await userEvent.click(await screen.findByRole('button',{name:'Retry download'}));expect(fetch.mock.calls).toEqual([['https://cdn.example.test/old.png'],['https://cdn.example.test/old.png']]);expect(onContinue).not.toHaveBeenCalled();
});
