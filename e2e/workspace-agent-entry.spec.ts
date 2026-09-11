import { test, expect } from '@playwright/test';
import { mockAuthSession } from './helpers/mock-api';

test('AC-01 / AC-15 unsent goal survives a reload without sending or generating', async ({ page }) => {
  await mockAuthSession(page);
  let writes = 0;
  await page.route('**/api/workspace/directions**', async route => {
    if (route.request().method() !== 'GET') writes++;
    await route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  await page.goto('/workspace');
  const goal = page.getByRole('textbox', { name: 'Message your creative goal' });
  await goal.fill('Keep the lighting, change the subject to a bicycle');
  await expect(page.getByText('Local draft', { exact: true })).toBeVisible();
  await page.reload();
  await expect(goal).toHaveValue('Keep the lighting, change the subject to a bicycle');
  expect(writes).toBe(0);
});

import { resolve } from 'path';
import { mockUploadPresign, mockAnalysisCreate, mockAnalysisPolling, loadFixture, mockCdnImages } from './helpers/mock-api';
const picture=resolve(__dirname,'fixtures/test-image.png');

test('AC-01 message without image stays editable and never creates a paid task',async({page})=>{
 await mockAuthSession(page);let calls=0;await page.route('**/api/analysis',async route=>{calls++;await route.fulfill({json:{}})});
 await page.goto('/workspace');const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.fill('Change the subject');await page.getByRole('button',{name:'Send',exact:true}).click();await expect(page.locator('p[role=' + JSON.stringify('alert') + ']').first()).toContainText('Attach one reference');await expect(goal).toHaveValue('Change the subject');expect(calls).toBe(0);
});

test('AC-01 / AC-19 upload binds the durable local Blob and goal before presign and analysis',async({page})=>{
 await mockAuthSession(page);await mockCdnImages(page);await mockUploadPresign(page);await mockAnalysisCreate(page);await mockAnalysisPolling(page,'mock-analysis-task-id',loadFixture('analysis-completed.json'));
 let persisted=false;let analysisBody:Record<string,unknown>|undefined;
 page.on('request',request=>{if(request.url().endsWith('/api/analysis')&&request.method()==='POST')analysisBody=request.postDataJSON()});
 await page.route('**/api/upload/presign',async route=>{
  persisted=await page.evaluate(async()=>new Promise<boolean>((resolve,reject)=>{const request=indexedDB.open('style-gen-workspace-drafts',1);request.onsuccess=()=>{const query=request.result.transaction('drafts').objectStore('drafts').getAll();query.onsuccess=()=>resolve(query.result.some(value=>value.text==='A bicycle in this lighting'&&value.attachment instanceof Blob));query.onerror=()=>reject(query.error)}}));
  await route.fulfill({json:{assetId:'mock-asset-id',fileUrl:'https://cdn.example.com/references/mock-asset-id/original.png',presignedUrl:'https://r2.example.com/presigned-upload-url'}});
 });
 await page.goto('/workspace');await page.getByRole('textbox',{name:'Message your creative goal'}).fill('A bicycle in this lighting');await page.getByTestId('reference-card').locator('input[type=file]').first().setInputFiles(picture);
 await expect.poll(()=>analysisBody?.directionId).toBeTruthy();expect(persisted).toBe(true);expect(analysisBody?.requestKey).toBeTruthy();await expect(page.getByRole('textbox',{name:'Message your creative goal'})).toHaveValue('A bicycle in this lighting');
});

test('AC-16 new direction preview cancellation performs zero server writes and restores focus',async({page})=>{
 await mockAuthSession(page);let writes=0;page.on('request',request=>{if(request.url().includes('/api/workspace/directions')&&request.method()!=='GET')writes++});
 await page.goto('/workspace');const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.fill('Keep this draft');await page.getByRole('button',{name:'New direction',exact:true}).click();await expect(page.getByRole('dialog',{name:'Preview direction change'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('textbox',{name:'Message your creative goal'}).focus();await expect(goal).toBeFocused();await expect(goal).toHaveValue('Keep this draft');expect(writes).toBe(0);
});

test('AC-21 local storage failure retains input and offers copy/export without uploading',async({page})=>{
 await mockAuthSession(page);await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw new Error('storage disabled')}}}));let uploads=0;page.on('request',request=>{if(request.url().endsWith('/api/upload/presign'))uploads++});
 await page.goto('/workspace');const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.fill('Keep my unsaved goal');await page.getByTestId('reference-card').locator('input[type=file]').first().setInputFiles(picture);await expect(page.getByText('Not saved',{exact:true})).toBeVisible();await expect(goal).toHaveValue('Keep my unsaved goal');await expect(page.getByRole('button',{name:'Export draft'})).toBeVisible();expect(uploads).toBe(0);
});

for(const viewport of [{width:1440,height:900}])test(`AC-15 entry focus and visual ${viewport.width}`,async({page},info)=>{
 await page.setViewportSize(viewport);await mockAuthSession(page);await page.goto('/workspace');const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.fill('Keep the light; change the subject.');await goal.focus();await expect(goal).toBeFocused();await expect(goal).toHaveCSS('outline-style','none');await expect(page.getByTestId('agent-composer')).toHaveCSS('box-shadow','none');await expect(page.getByText('Local draft',{exact:true})).toBeVisible();await expect(page.getByTestId('agent-composer')).toHaveScreenshot(`composer-${viewport.width}.png`,{animations:'disabled'});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Send',exact:true})).toBeInViewport();await page.screenshot({path:info.outputPath(`entry-${viewport.width}.png`),animations:'disabled'});
});

test('AC-15 restores an active task and loads older messages against a stable sequence without writes',async({page})=>{
 await mockAuthSession(page);let writes=0,taskReads=0;const eventQueries:string[]=[];
 const direction={id:'durable-direction',userId:'mock-user-id',draftRevision:0,analysisTaskId:null,sourceAssetId:null,sourceTemplateId:null,sourceIterationId:null,preferredIterationId:null,draft:{control:null,customPrompt:null,negativePromptText:'',params:{aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'},constraints:[],aspectRatioSource:'fallback'}};
 await page.route('**/api/workspace/directions/**',async route=>{
  if(route.request().method()!=='GET')writes++;
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/events')){eventQueries.push(url.search);const older=url.searchParams.get('page')==='2';await route.fulfill({json:{items:[{id:older?'early':'latest',sequence:older?1:25,kind:'turn',inputText:older?'Original earlier message':'Latest message',replyText:null}],throughSequence:25,hasMore:!older}});return;}
  await route.fulfill({json:{direction,source:{reference:null,recipe:null,variables:[],analysisStatus:null},activeTask:{id:'durable-active',status:'processing'},summaryToken:null}});
 });
 await page.route('**/api/generation/durable-active',async route=>{taskReads++;await route.fulfill({json:{id:'durable-active',status:'processing',dispatchState:'unknown',resultFileUrl:null}})});
 await page.goto('/workspace?directionId=durable-direction');await expect(page.getByRole('log',{name:'Direction messages'})).toContainText('Latest message');await page.getByRole('button',{name:'Load earlier messages'}).click();await expect(page.getByRole('log',{name:'Direction messages'})).toContainText('Original earlier message');expect(eventQueries.some(query=>query.includes('page=2')&&query.includes('throughSequence=25'))).toBe(true);
 await expect.poll(()=>taskReads).toBeGreaterThan(0);await page.reload();await expect(page.getByRole('log',{name:'Direction messages'})).toContainText('Latest message');expect(writes).toBe(0);
});

test('AC-21 an expired session keeps the local goal editable and reconnect never replays a write',async({page})=>{
 await mockAuthSession(page);let signedIn=false,writes=0;
 await page.route('**/api/workspace/directions/**',async route=>{if(route.request().method()!=='GET')writes++;if(!signedIn){await route.fulfill({status:401,json:{error:'Session expired'}});return;}if(route.request().url().includes('/events')){await route.fulfill({json:{items:[],throughSequence:0,hasMore:false}});return;}await route.fulfill({json:{direction:{id:'session-direction',userId:'mock-user-id',draftRevision:0,analysisTaskId:null,sourceAssetId:null,sourceTemplateId:null,sourceIterationId:null,preferredIterationId:null,draft:{control:null,customPrompt:null,negativePromptText:'',params:{model:'flux-2-dev',quality:'standard',aspectRatio:'1:1'},constraints:[],aspectRatioSource:'fallback'}},source:{reference:null,recipe:null,variables:[],analysisStatus:null},activeTask:null,summaryToken:null}})});
 await page.goto('/workspace?directionId=session-direction');const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.fill('Still editable after expiry');await expect(page.getByRole('button',{name:'Send',exact:true})).toBeDisabled();signedIn=true;await page.getByRole('button',{name:'Reconnect',exact:true}).click();await expect(goal).toHaveValue('Still editable after expiry');expect(writes).toBe(0);await expect(page).toHaveURL(/\/workspace/);
});

import {readFileSync} from 'node:fs';
const referenceFile=(name:string)=>({name,mimeType:'image/png',buffer:readFileSync(picture)});

for (const width of [1440,1280]) test(`three references upload, restore and send together at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await mockAuthSession(page);await mockCdnImages(page);await mockUploadPresign(page);await mockAnalysisCreate(page);await mockAnalysisPolling(page,'mock-analysis-task-id',loadFixture('analysis-completed.json'));
 let uploads=0;let analysisBody:Record<string,unknown>|undefined;
 await page.route('**/api/upload/presign',async route=>{const id=`reference-${++uploads}`;await route.fulfill({json:{assetId:id,fileUrl:`https://cdn.example.com/references/${id}/original.png`,presignedUrl:'https://r2.example.com/presigned-upload-url'}})});
 page.on('request',request=>{if(request.url().endsWith('/api/analysis')&&request.method()==='POST')analysisBody=request.postDataJSON()});
 await page.goto('/workspace');
 const composer=page.getByTestId('agent-composer'),input=page.getByLabel('Attach reference'),goal=page.getByRole('textbox',{name:'Message your creative goal'});
 await goal.fill('Combine the lighting, palette and texture of all three references');
 await input.setInputFiles([referenceFile('lighting.png'),referenceFile('palette.png')]);
 await expect(composer.getByRole('img')).toHaveCount(2);await expect(composer.getByText('2/2 uploaded - Analyze together')).toBeVisible();
 await input.setInputFiles(referenceFile('texture.png'));
 await expect(composer.getByRole('img')).toHaveCount(3);await expect(input).toBeDisabled();
 await expect(composer.getByText('3/3 uploaded - Analyze together')).toBeVisible();
 await page.reload();
 await expect(composer.getByRole('img')).toHaveCount(3);await expect(goal).toHaveValue('Combine the lighting, palette and texture of all three references');
 expect(uploads).toBe(3);
 await composer.getByRole('button',{name:'Remove reference 2'}).click();
 await expect(composer.getByRole('img')).toHaveCount(2);await expect(input).toBeEnabled();
 await input.setInputFiles(referenceFile('color.png'));
 await expect(composer.getByText('3/3 uploaded - Analyze together')).toBeVisible();
 await goal.focus();
 await expect(goal).toHaveCSS('outline-style','none');
 await expect(composer).toHaveCSS('box-shadow','none');
 await expect(composer).toHaveScreenshot(`composer-three-references-${width}.png`,{animations:'disabled'});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(composer.getByRole('button',{name:'Send',exact:true})).toBeInViewport();
 await goal.press('Enter');
 await expect.poll(()=>analysisBody?.referenceImages).toEqual([
  expect.objectContaining({assetId:'reference-1'}),expect.objectContaining({assetId:'reference-3'}),expect.objectContaining({assetId:'reference-4'})
 ]);
 expect(uploads).toBe(4);
 await expect(goal).toHaveValue('Combine the lighting, palette and texture of all three references');
});

test('partial reference upload failure preserves successful images and retries only the failed upload',async({page})=>{
 await mockAuthSession(page);await mockCdnImages(page);await mockUploadPresign(page);
 let presigns=0,puts=0;
 await page.route('**/api/upload/presign',async route=>{const id=`partial-${++presigns}`;await route.fulfill({json:{assetId:id,fileUrl:`https://cdn.example.com/references/${id}/original.png`,presignedUrl:'https://r2.example.com/presigned-upload-url'}})});
 await page.route('https://r2.example.com/presigned-upload-url',async route=>{puts++;await route.fulfill({status:puts===2?500:200,body:''})});
 await page.goto('/workspace');const composer=page.getByTestId('agent-composer');
 await page.getByLabel('Attach reference').setInputFiles([referenceFile('one.png'),referenceFile('two.png')]);
 await expect(composer.getByRole('img')).toHaveCount(1);await expect(composer.getByText('Not uploaded')).toBeVisible();
 await composer.getByRole('button',{name:'Retry upload'}).click();
 await expect(composer.getByRole('img')).toHaveCount(2);await expect(composer.getByText('2/2 uploaded - Analyze together')).toBeVisible();
 expect(puts).toBe(3);expect(presigns).toBe(3);
});


test('four references are rejected without uploading or losing the message',async({page})=>{
 await mockAuthSession(page);let uploads=0;
 page.on('request',request=>{if(request.url().endsWith('/api/upload/presign'))uploads++;});
 await page.goto('/workspace');const goal=page.getByRole('textbox',{name:'Message your creative goal'});
 await goal.fill('Preserve this direction');
 await page.getByLabel('Attach reference').setInputFiles(['one','two','three','four'].map(name=>referenceFile(`${name}.png`)));
 await expect(page.locator('p[role=alert]')).toContainText('Attach up to 3');
 await expect(page.getByTestId('agent-composer').getByRole('img')).toHaveCount(0);
 await expect(goal).toHaveValue('Preserve this direction');expect(uploads).toBe(0);
});

test('retry upload does not bypass unavailable local storage',async({page})=>{
 await mockAuthSession(page);await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{value:{open(){throw new Error('storage disabled')}}}));
 let uploads=0;page.on('request',request=>{if(request.url().endsWith('/api/upload/presign'))uploads++;});
 await page.goto('/workspace');await page.getByLabel('Attach reference').setInputFiles(referenceFile('one.png'));
 await expect(page.getByText('Not saved',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry upload'}).click();
 await expect(page.locator('p[role=alert]')).toContainText('preserved');
 expect(uploads).toBe(0);
});
