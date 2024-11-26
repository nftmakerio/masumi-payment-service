import type { Config } from '@jest/types';
// Sync object
const moduleNameMapper = {
  "@/(.*)": "<rootDir>/src/$1"
};


const config: Config.InitialOptions = {
  verbose: true,
  moduleNameMapper,
  roots: ["<rootDir>/src"],
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
};
export default config;