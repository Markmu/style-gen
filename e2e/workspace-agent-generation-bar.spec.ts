import { mockGenerationCreateSequence, mockDirectionFeedStateful, mockGenerationCreateCapture, loadFixture, mockGenerationList, mockCdnImages, mockUploadPresign, mockAnalysisCreate, mockAnalysisPolling, mockGenerationPolling } from './helpers/mock-api';
import { generateCurrentDraft } from './helpers/workspace-actions';
import { test, expect } from '@playwright/test';
import { mockAuthSession, mockAgentConversation } from './helpers/mock-api';

test('AC-07 Send stays inside composer and all image execution stays below with settings',async({page})=>{
 await mockAuthSession(page);await mockAgentConversation(page);await page.goto('/workspace?directionId=conversation-direction');
 const composer=page.getByTestId('agent-composer'),bar=page.getByRole('region',{name:'Generation settings and actions'});
 await expect(page.getByRole('textbox',{name:'Message your creative goal'})).toBeVisible();
 await expect(bar).toBeVisible();await expect(composer.getByRole('button',{name:'Send',exact:true})).toBeDisabled();
 await expect(bar.getByRole('combobox',{name:'Model',exact:true})).toBeVisible();await expect(bar.getByRole('combobox',{name:'Aspect ratio',exact:true})).toBeVisible();await expect(bar.getByRole('combobox',{name:'Quality',exact:true})).toBeVisible();
 await expect(bar.getByRole('button',{name:'Generate 1 image',exact:true})).toBeVisible();
 expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual((await composer.boundingBox())!.y+(await composer.boundingBox())!.height);
 await expect(page.getByRole('log').getByRole('button',{name:/Generate|Retry original submission/})).toHaveCount(0);
});

test('AC-08 unsent text blocks image creation, IME Enter does not send and desktop Enter does',async({page})=>{
 await mockAuthSession(page);const state=await mockAgentConversation(page);await page.goto('/workspace?directionId=conversation-direction');const input=page.getByRole('textbox',{name:'Message your creative goal'}),bar=page.getByTestId('generation-bar');await input.fill('Explain the evidence');await expect(bar).not.toContainText('Send or remove your unsent');await expect(bar.getByRole('button',{name:'Generate 1 image',exact:true})).toHaveAttribute('title',/Send or remove your unsent/);await expect(bar.getByRole('button',{name:'Generate 1 image',exact:true})).toBeDisabled();await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});expect(state.turns).toHaveLength(0);await input.press('Shift+Enter');expect(state.turns).toHaveLength(0);await input.press('Enter');await expect.poll(()=>state.turns.length).toBe(1);
});
test('AC-10 language turn carries only actually visible current summary, mixed edit stays a proposal',async({page})=>{
 await mockAuthSession(page);const state=await mockAgentConversation(page,{draft:{control:null,customPrompt:'A quiet studio',negativePromptText:'no text',params:{model:'flux-2-dev',quality:'standard',aspectRatio:'3:4'},constraints:[],aspectRatioSource:'user'},source:{analysisStatus:'completed'},replies:[{responseKind:'proposal',proposalState:'pending',replyText:'Review the scene change first.',changes:[{target:'customPrompt',key:'',action:'set',before:'A quiet studio',after:'A bright studio'}]}]});await page.goto('/workspace?directionId=conversation-direction');await page.getByRole('textbox',{name:'Message your creative goal'}).fill('Change to a bright studio and generate');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>state.turns.length).toBe(1);expect(state.turns[0].summaryToken).toBeNull();await expect(page.getByRole('log')).toContainText('Review the scene change first');await expect(page.getByTestId('generation-bar').getByRole('button',{name:'Generate 1 image',exact:true})).toBeDisabled();
});
for(const width of [1440])test(`AC-07 generation bar visual and keyboard focus ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await mockAuthSession(page);await mockAgentConversation(page);await page.goto('/workspace?directionId=conversation-direction');const bar=page.getByTestId('generation-bar');await bar.scrollIntoViewIfNeeded();await bar.getByLabel('Model',{exact:true}).focus();await expect(bar.getByLabel('Model',{exact:true})).toBeFocused();await expect(bar).toHaveScreenshot(`generation-bar-${width}.png`,{animations:'disabled'});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`generation-bar-${width}.png`)});
});
