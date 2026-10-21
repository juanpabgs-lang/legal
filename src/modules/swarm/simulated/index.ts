import type { SwarmProvider } from '../contracts';
import { CONTRACT_VERSION, type FeedbackInput, type FeedbackOutput } from '../contracts';
import { detectSimulated } from './detect';
import { draftSimulated } from './draft';
import { predictSimulated } from './predict';

export const simulatedSwarm: SwarmProvider = {
  name: 'simulated',
  async detect(input) {
    return detectSimulated(input);
  },
  async predict(input) {
    return predictSimulated(input);
  },
  async draft(input) {
    return draftSimulated(input);
  },
  async feedback(_input: FeedbackInput): Promise<FeedbackOutput> {
    return { version: CONTRACT_VERSION, task: 'feedback', accepted: true };
  },
};
