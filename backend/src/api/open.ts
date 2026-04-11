// Thin shim over ../llm/hermesClient, kept so in-tree imports like
// `import { hermesChatCompletion } from './open'` still resolve.
// New code should import from '../llm/hermesClient' directly.
export {
  hermesChatCompletion,
  hermesChat,
  hermesChatStream,
  isConfigured,
  HERMES_MODEL,
  HERMES_BASE_URL,
} from '../llm/hermesClient';

import { hermesChatCompletion } from '../llm/hermesClient';

// Legacy alias from the "open personality" era — some callers may still use it.
export async function openChatCompletion(personaPrompt: string, message: string): Promise<string> {
  return hermesChatCompletion(personaPrompt, message);
}
