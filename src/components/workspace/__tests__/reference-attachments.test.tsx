// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {ReferenceAttachments} from '../reference-attachments';
import type {ReferenceAttachment} from '@/lib/workspace/draft-store';
afterEach(cleanup);
const reference=(name:string):ReferenceAttachment=>({file:new Blob(['pixels'],{type:'image/png'}),name,uploaded:{assetId:name,fileUrl:`https://example.test/${name}`,width:20,height:20,mimeType:'image/png'}});
it('shows all uploaded thumbnails with individual removal',()=>{
 const references=[reference('one.png'),reference('two.png'),reference('three.png')],remove=vi.fn();
 render(<ReferenceAttachments references={references} busy={false} onRemove={remove} onRetry={vi.fn()}/>);
 expect(screen.getAllByRole('img')).toHaveLength(3);
 expect(screen.getByRole('img',{name:'Reference 2: two.png'})).toHaveAttribute('src','https://example.test/two.png');
 expect(screen.getByRole('status')).toHaveTextContent('3/3 uploaded');
 fireEvent.click(screen.getByRole('button',{name:'Remove reference 2'}));
 expect(remove).toHaveBeenCalledWith(references[1].file);
});
it('keeps completed previews during a partial failure and allows retry',()=>{
 const retry=vi.fn(),references=[reference('one.png'),{file:new Blob(['pixels']),name:'two.png'}];
 const {rerender}=render(<ReferenceAttachments references={references} busy onRemove={vi.fn()} onRetry={retry}/>);
 expect(screen.getAllByRole('img')).toHaveLength(1);
 expect(screen.getByText('Uploading…')).toBeVisible();
 expect(screen.getByRole('button',{name:'Remove reference 1'})).toBeDisabled();
 rerender(<ReferenceAttachments references={references} busy={false} onRemove={vi.fn()} onRetry={retry}/>);
 expect(screen.getByText('Not uploaded')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Retry upload'}));
 expect(retry).toHaveBeenCalledOnce();
 expect(screen.getByRole('status')).toHaveTextContent('1/2 uploaded');
});
