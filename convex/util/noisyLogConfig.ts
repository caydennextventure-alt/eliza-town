import { setNoisyLoggingEnabled } from './noisyLog';

const raw = process.env.AITOWN_NOISY_LOGS ?? process.env.NOISY_LOGS ?? '';
setNoisyLoggingEnabled(/^(1|true|yes)$/i.test(raw));
