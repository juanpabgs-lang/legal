/**
 * Translate between Norfront's swarm contract and the Deep Swarm HTTP API.
 *
 * Fill this file in once the Deep Swarm API is published. Until then every
 * function throws so a misconfigured `SWARM_*=deepswarm` fails loudly instead
 * of silently sending the wrong shape.
 *
 * See docs/deep-swarm.md for the fields we send and the fields we need back.
 */
import {
  detectOutputSchema,
  draftOutputSchema,
  predictOutputSchema,
  type DetectInput,
  type DetectOutput,
  type DraftInput,
  type DraftOutput,
  type PredictInput,
  type PredictOutput,
} from '../contracts';

export class DeepSwarmMappingPendingError extends Error {
  constructor() {
    super(
      'Deep Swarm mapping is not configured. Set SWARM_DETECT/PREDICT/DRAFT=simulated or implement src/modules/swarm/deepswarm/mapping.ts',
    );
    this.name = 'DeepSwarmMappingPendingError';
  }
}

function identityMode(): boolean {
  return process.env.DEEP_SWARM_CONTRACT_MODE === 'identity';
}

export function toDetectRequest(input: DetectInput): unknown {
  if (identityMode()) return input;
  throw new DeepSwarmMappingPendingError();
}

export function fromDetectResponse(payload: unknown): DetectOutput {
  if (identityMode()) return detectOutputSchema.parse(payload);
  throw new DeepSwarmMappingPendingError();
}

export function toPredictRequest(input: PredictInput): unknown {
  if (identityMode()) return input;
  throw new DeepSwarmMappingPendingError();
}

export function fromPredictResponse(payload: unknown): PredictOutput {
  if (identityMode()) return predictOutputSchema.parse(payload);
  throw new DeepSwarmMappingPendingError();
}

export function toDraftRequest(input: DraftInput): unknown {
  if (identityMode()) return input;
  throw new DeepSwarmMappingPendingError();
}

export function fromDraftResponse(payload: unknown): DraftOutput {
  if (identityMode()) return draftOutputSchema.parse(payload);
  throw new DeepSwarmMappingPendingError();
}

/** Override in tests or after the real mapping lands. */
export const mapping = {
  toDetectRequest,
  fromDetectResponse,
  toPredictRequest,
  fromPredictResponse,
  toDraftRequest,
  fromDraftResponse,
};
