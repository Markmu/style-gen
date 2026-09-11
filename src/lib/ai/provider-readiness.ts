import type { ResolvedModelBinding } from './model-config';
import { WorkspaceServiceError } from '@/lib/workspace/validation';
export function requireImageProviderConfigured(binding:ResolvedModelBinding) {
 const key={replicate:'REPLICATE_API_TOKEN',fal:'FAL_KEY',gemini:'GEMINI_API_KEY'}[binding.provider];
 if(!key||!process.env[key])throw new WorkspaceServiceError('MODEL_UNAVAILABLE',503);
}
