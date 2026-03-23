import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { Config } from './types';

const configPath = path.resolve(__dirname, '..', 'config.yaml');
const raw = fs.readFileSync(configPath, 'utf-8');
const config: Config = YAML.parse(raw);

// Resolve relative paths
config.browser.userDataDir = path.resolve(__dirname, '..', config.browser.userDataDir);
config.logging.file = path.resolve(__dirname, '..', config.logging.file);

export default config;
