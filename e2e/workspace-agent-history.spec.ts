import {test,expect} from '@playwright/test';
import {resolve} from 'path';
import {mockAgentConversation,mockAuthSession,mockCdnImages,mockGenerationList,mockUploadPresign,mockAnalysisCreate,mockAnalysisPolling,mockDirectionFeedStateful,loadFixture} from './helpers/mock-api';
const item=(id:string)=>({id,errorMessage:null,status:'completed' as const,resultAssetId:'asset-'+id,resultFileUrl:'https://cdn.example.com/result.webp',promptSummary:id,params:{aspectRatio:'1:1',quality:'standard'},createdAt:'2026-09-01T00:00:00Z'});
for(const explicit of [true,false])test(`AC-13 ${explicit?'explicit':'default'} older result stays selected and focused when a new result completes`,async({page})=>{
 await mockAuthSession(page);await mockCdnImages(page);await mockGenerationList(page);const state=await mockAgentConversation(page,{source:{analysisStatus:'completed',...loadFixture('analysis-v2-completed.json')}});Object.assign(state.direction,{analysisTaskId:'history-analysis'});
 const feed=await mockDirectionFeedStateful(page,{completed:[item('old-result')],active:{...item('new-result'),status:'processing',resultAssetId:null,resultFileUrl:null},latestFailure:null});
 await page.goto('/workspace?directionId=conversation-direction');const old=page.getByRole('button',{name:'Select result old-result',exact:true});if(explicit)await old.click();else await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-selected-id','old-result');await old.focus();
 feed.set({completed:[item('new-result'),item('old-result')],active:null,latestFailure:null});await expect(page.getByRole('button',{name:'Select result new-result',exact:true})).toBeVisible();await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-selected-id','old-result');await expect(old).toBeFocused();await expect(page.getByRole('button',{name:'View latest result',exact:true})).toBeVisible();
});

import {mockAgentHistory} from './helpers/mock-api';
test('AC-14 two explicit results compare, deviation only prepares conversation and view choices persist',async({page})=>{
 const {mutations}=await mockAgentHistory(page);await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('button',{name:'Select result old-result',exact:true}).click();await page.getByRole('button',{name:'Compare viewed result'}).click();const panel=page.getByTestId('result-comparison-panel');await panel.getByLabel('Compare against').selectOption('other-result');await expect(panel).toHaveAttribute('data-first-id','other-result');await expect(panel).toHaveAttribute('data-second-id','old-result');await expect(panel.getByTestId('comparison-reference-image')).toHaveAttribute('src',/other-result/);
 await page.getByRole('textbox',{name:'Message your creative goal'}).fill('Keep my original thought');await panel.getByTestId('comparison-dimension-option').first().click();await panel.getByRole('button',{name:'Discuss this difference'}).click();await expect(page.getByRole('textbox',{name:'Message your creative goal'})).toHaveValue(/Keep my original thought\nReview the/);expect(mutations).toHaveLength(0);await page.getByRole('tab',{name:'Reference',exact:true}).click();await page.getByRole('tab',{name:'Compare',exact:true}).click();await expect(panel.getByLabel('Compare against')).toHaveValue('other-result');
});
test('AC-02 AC-16 viewing history shows frozen values, return and continue require preview; cancel writes nothing',async({page})=>{
 const {mutations}=await mockAgentHistory(page);await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('button',{name:'Select result old-result',exact:true}).click();await page.getByRole('button',{name:'Continue from this result',exact:true}).click();const detail=page.getByRole('dialog',{name:'History Detail'});await expect(detail).toContainText('Frozen prompt old-result');await expect(detail.getByRole('button',{name:'Return to this direction'})).toBeVisible();await detail.getByRole('button',{name:'Continue from this result',exact:true}).click();const preview=page.getByRole('dialog',{name:'Preview direction change'});await expect(preview).toContainText('Frozen prompt old-result');await expect(preview).toContainText('Current unsaved working prompt');await preview.getByRole('button',{name:'Cancel',exact:true}).click();expect(mutations).toHaveLength(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('AC-21 detail failure retries only reads and never restores partial data',async({page})=>{
 const {mutations,detailStates,details}=await mockAgentHistory(page);detailStates[0].fail();await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('button',{name:'Select result old-result',exact:true}).click();await page.getByRole('button',{name:'Continue from this result',exact:true}).click();await expect(page.getByRole('button',{name:'Retry loading result'})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);detailStates[0].set(details[0]);await page.getByRole('button',{name:'Retry loading result'}).click();await expect(page.getByRole('dialog',{name:'History Detail'})).toContainText('Frozen prompt old-result');expect(mutations).toHaveLength(0);
});
for(const width of [1440])test(`AC-14 history snapshot visual ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await mockAgentHistory(page);await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('button',{name:'Select result old-result',exact:true}).click();await page.getByRole('button',{name:'Continue from this result',exact:true}).click();const dialog=page.getByRole('dialog',{name:'History Detail'});await expect(dialog).toBeVisible();await dialog.getByAltText('History result').scrollIntoViewIfNeeded();await expect(dialog.getByAltText('History result')).toHaveCSS('object-fit','contain');expect((await dialog.getByAltText('History result').boundingBox())!.y).toBeGreaterThanOrEqual(0);await dialog.getByRole('button',{name:'Continue from this result',exact:true}).focus();await expect(dialog).toHaveScreenshot(`history-${width}.png`,{animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('AC-14 preferred result persists with an isolated PATCH and never verifies or submits draft edits',async({page})=>{
 const {mutations,state}=await mockAgentHistory(page);let legacyReads=0;await page.route('**/api/analysis/history-analysis',route=>{legacyReads++;return route.fulfill({status:401,json:{error:'Legacy endpoint unavailable'}});});await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('textbox',{name:'Message your creative goal'}).fill('Unsent comparison note');await page.locator('[data-iteration-id="old-result"]').getByRole('button',{name:'Set as preferred result'}).click();await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-preferred-id','old-result');expect(legacyReads).toBe(0);expect(mutations).toHaveLength(1);expect(mutations[0].method).toBe('PATCH');expect(mutations[0].body).toMatchObject({preferredIterationId:'old-result'});expect(mutations[0].body).not.toHaveProperty('changes');expect(state.direction.draft.customPrompt).toBe('Current unsaved working prompt');await expect(page.getByRole('textbox',{name:'Message your creative goal'})).toHaveValue('Unsent comparison note');
});
test('AC-13 saved view survives reload and missing result recovery performs no writes',async({page})=>{
 const {mutations,detailStates,details}=await mockAgentHistory(page);
 await page.goto('/workspace?directionId=conversation-direction');
 await page.getByRole('button',{name:'Select result old-result',exact:true}).click();
 await page.getByRole('button',{name:'Compare viewed result'}).click();
 await page.getByLabel('Compare against').selectOption('other-result');
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('style-gen-workspace-drafts',1);request.onsuccess=()=>{const read=request.result.transaction('drafts').objectStore('drafts').getAll();read.onsuccess=()=>resolve(read.result.find(value=>value.directionId==='conversation-direction')?.viewState);};}))).toEqual({selectedId:'old-result',compareId:'old-result',secondId:'other-result',mode:'compare'});
 await page.reload();
 await expect(page.getByRole('tab',{name:'Compare',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByLabel('Compare against')).toHaveValue('other-result');
 await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-selected-id','old-result');
 await page.getByRole('tab',{name:'Result',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('style-gen-workspace-drafts',1);request.onsuccess=()=>{const read=request.result.transaction('drafts').objectStore('drafts').getAll();read.onsuccess=()=>resolve(read.result.find(value=>value.directionId==='conversation-direction')?.viewState?.mode);};}))).toBe('result');
 detailStates[0].fail();await page.reload();
 await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-selected-id','old-result');
 const goal=page.getByRole('textbox',{name:'Message your creative goal'});await goal.focus();
 await expect(page.getByRole('button',{name:'Retry selected result'})).toBeVisible();await expect(goal).toBeFocused();
 await expect(page.getByTestId('direction-result-rail')).toHaveAttribute('data-selected-id','old-result');
 detailStates[0].set(details[0]);await page.getByRole('button',{name:'Retry selected result'}).click();
 await expect(page.getByRole('button',{name:'Retry selected result'})).toHaveCount(0);
 expect(mutations).toHaveLength(0);
});
test('AC-02 Return previews the existing structured direction actual prompt and cancel performs no writes',async({page})=>{
 const {mutations,details,detailStates}=await mockAgentHistory(page);
 detailStates[0].set({...details[0],directionId:'return-target'});
 const recipe=(loadFixture('analysis-v2-completed.json') as {recipe:{styleInvariants:{id:string;value:string}[];contentVariables:{name:string;defaultValue:string}[]}}).recipe;
 const draft={control:{schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:recipe.styleInvariants.map((r:{id:string})=>r.id),variableValues:Object.fromEntries(recipe.contentVariables.map((v:{name:string;defaultValue:string})=>[v.name,v.defaultValue])),enabledModifierNames:[],modifierValues:{},adjustments:[]},customPrompt:null,negativePromptText:'return negative',constraints:[],params:{aspectRatio:'1:1',model:'flux-2-dev',quality:'standard'},aspectRatioSource:'reference'};
 await page.route('**/api/workspace/directions/return-target',route=>route.fulfill({json:{direction:{id:'return-target',draft},source:{recipe,variables:recipe.contentVariables}}}));
 await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('button',{name:'Select result old-result',exact:true}).click();await page.getByRole('button',{name:'Continue from this result',exact:true}).click();await page.getByRole('button',{name:'Return to this direction'}).click();
 const preview=page.getByRole('dialog',{name:'Preview direction change'});await expect(preview).toContainText('Source direction: return-target');
 const prompt=preview.locator('details').filter({has:page.locator('summary').filter({hasText:/^Prompt$/})});await expect(prompt).toContainText(recipe.styleInvariants[0].value);await expect(prompt).not.toContainText('Not available');
 await preview.getByRole('button',{name:'Cancel',exact:true}).click();expect(mutations).toHaveLength(0);await expect(page).toHaveURL(/directionId=conversation-direction/);
});
