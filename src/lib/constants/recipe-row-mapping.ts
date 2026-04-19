export const RECIPE_ROW_MAPPING = [
  { key: 'subject',     label: 'Subject',     fields: ['subject', 'scene'] },
  { key: 'style',       label: 'Style',       fields: ['styleTags', 'mood', 'texture'] },
  { key: 'lighting',    label: 'Lighting',    fields: ['lighting', 'color'] },
  { key: 'composition', label: 'Composition', fields: ['composition', 'cameraLanguage'] },
] as const

export const RECIPE_EXTRA_FIELDS = [
  'imageSummary', 'visualKeywords', 'mustKeep', 'replaceable'
] as const

export type RecipeRowKey = typeof RECIPE_ROW_MAPPING[number]['key']
