import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stringsPath = resolve(process.cwd(), 'android/app/src/main/res/values/strings.xml');
const contents = readFileSync(stringsPath, 'utf8');
const allowRemoteServer = process.env.CAPACITOR_ALLOW_REMOTE_SERVER === 'true';
const remoteServerMatch = contents.match(/<string name="server_url">(.*?)<\/string>/);

if (remoteServerMatch && remoteServerMatch[1].trim()) {
  if (!allowRemoteServer) {
    console.error(
      `[native-config] Unexpected remote server_url found in ${stringsPath}: ${remoteServerMatch[1].trim()}`
    );
    process.exit(1);
  }

  console.warn(`[native-config] Remote server_url allowed by CAPACITOR_ALLOW_REMOTE_SERVER=true`);
} else {
  console.log('[native-config] Native app is configured to load bundled assets.');
}
