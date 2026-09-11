import {describe,it,expect} from 'vitest';
import {validateBody,validatePromptControlSnapshotShape,validatePromptControlSnapshotReferences} from '../legacy-request';
import type {PromptControlSnapshot} from '@/types/models';
const completedAnalysisTask={id:'analysis-1'};
const v2RecipeAnalysisTask = {
  ...completedAnalysisTask,
  recipe: {
    schemaVersion: 2,
    extractionStatus: "ready",
    extractionReasons: [],
    contentDescription: {
      summary: "Glass flower study",
      subjectAttributes: [],
      supportingElements: [],
    },
    styleProfile: {},
    styleInvariants: [
      {
        id: "inv_color_1",
        value: "cool blue palette",
        evidence: ["img-01"],
        confidence: 0.9,
        kind: "hard",
        dimension: "color",
        sourceObservationIds: [],
      },
      {
        id: "inv_camera_1",
        value: "macro lens",
        evidence: ["img-02"],
        confidence: 0.8,
        kind: "soft",
        dimension: "camera",
        sourceObservationIds: [],
      },
    ],
    contentVariables: [
      {
        name: "subject",
        label: "Subject",
        defaultValue: "Glass flower",
        sourceField: "subject",
      },
    ],
    optionalModifiers: [],
    negativeConstraints: [],
    styleFingerprint: { tokens: [], scores: {} },
    promptOutputs: {
      reconstructionPrompt: "reconstruct",
      conciseTemplate: "concise",
      standardTemplate: "standard",
      professionalTemplate: "professional",
    },
  },
};

const validPromptControlSnapshot = {
  schemaVersion: 1,
  trigger: "quick_recreate" as const,
  intent: "reconstruction" as const,
  detailLevel: "standard" as const,
  editorMode: "variables" as const,
  customPromptDirty: false,
  enabledInvariantIds: ["inv_color_1", "inv_camera_1"],
  variableValues: { subject: "Crystal peony" },
  enabledModifierNames: [] as string[],
  modifierValues: {} as Record<string, string>,
  adjustments: [
    { invariantId: "inv_color_1", action: "strengthen" as const },
  ],
};


const body={analysisTaskId:'a',promptText:'p',negativePromptText:'',params:{aspectRatio:'1:1',quality:'high'}};
describe('legacy request validations retained after service extraction',()=>{
 it('keeps legacy quality and optional controls compatible',()=>{expect(validateBody(body)).toEqual(body);expect(validatePromptControlSnapshotShape(validPromptControlSnapshot)).toBe(validPromptControlSnapshot);});
 for(const key of ['analysisTaskId','promptText','negativePromptText','params'])it(`rejects missing ${key}`,()=>{const value={...body};delete value[key as keyof typeof value];expect(validateBody(value)).toBeNull();});
 for(const override of [{promptText:''},{negativePromptText:3},{params:{}},{params:{aspectRatio:'1:1'}},{params:{quality:'standard'}},{params:{aspectRatio:'4:5',quality:'standard'}},{params:{aspectRatio:'1:1',quality:'standard',model:'evil/model'}},{sourceTemplateId:3},{promptControlSnapshot:[]}])it(`rejects malformed body ${JSON.stringify(override)}`,()=>expect(validateBody({...body,...override})).toBeNull());
 for(const key of ['intent','trigger','detailLevel','editorMode'])it(`rejects snapshot ${key} invalid enum`,()=>expect(validatePromptControlSnapshotShape({...validPromptControlSnapshot,[key]:'invalid'})).toBeNull());
 for(const override of [{variableValues:Object.fromEntries(Array.from({length:21},(_,i)=>['v'+i,'a']))},{adjustments:Array.from({length:11},()=>({invariantId:'x',action:'strengthen'}))},{variableValues:{subject:'a'.repeat(201)}},{customTemplate:'a'.repeat(6001)}])it(`enforces snapshot bounded inputs ${Object.keys(override)}`,()=>expect(validatePromptControlSnapshotShape({...validPromptControlSnapshot,...override})).toBeNull());
 for(const override of [{enabledInvariantIds:['foreign']},{adjustments:[{invariantId:'foreign',action:'disable'}]},{variableValues:{foreign:'value'}}])it(`rejects nonrecipe reference ${Object.keys(override)}`,()=>expect(validatePromptControlSnapshotReferences({...validPromptControlSnapshot,...override} as PromptControlSnapshot,v2RecipeAnalysisTask.recipe,[])).toBe(false));
});
