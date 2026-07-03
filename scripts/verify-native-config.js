import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const capacitorConfigPath = resolve(process.cwd(), 'capacitor.config.json');
const capacitorConfig = JSON.parse(readFileSync(capacitorConfigPath, 'utf8'));
const generatedConfigPath = resolve(process.cwd(), 'android/app/src/main/assets/capacitor.config.json');
const generatedConfig = JSON.parse(readFileSync(generatedConfigPath, 'utf8'));
const expectedRemoteServer = capacitorConfig?.server?.url?.trim() || '';
const configuredRemoteServer = generatedConfig?.server?.url?.trim() || '';
const allowRemoteServer = process.env.CAPACITOR_ALLOW_REMOTE_SERVER === 'true';

if (configuredRemoteServer) {
  if (expectedRemoteServer) {
    if (configuredRemoteServer !== expectedRemoteServer) {
      console.error(
        `[native-config] Android server.url mismatch. Expected ${expectedRemoteServer} from ${capacitorConfigPath}, found ${configuredRemoteServer} in ${generatedConfigPath}`
      );
      process.exit(1);
    }

    console.log(`[native-config] Native app is configured to load ${configuredRemoteServer}.`);
    process.exit(0);
  }

  if (!allowRemoteServer) {
    console.error(
      `[native-config] Unexpected remote server.url found in ${generatedConfigPath}: ${configuredRemoteServer}`
    );
    process.exit(1);
  }

  console.warn('[native-config] Remote server.url allowed by CAPACITOR_ALLOW_REMOTE_SERVER=true');
} else {
  if (expectedRemoteServer) {
    console.error(
      `[native-config] Missing Android server.url in ${generatedConfigPath}. Expected ${expectedRemoteServer} from ${capacitorConfigPath}.`
    );
    process.exit(1);
  }

  console.log('[native-config] Native app is configured to load bundled assets.');
}
