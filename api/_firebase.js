import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const parseServiceAccount = () => {
  const raw = readEnv(
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'GCLOUD_SERVICE_ACCOUNT_JSON'
  );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[FirebaseAdmin] Failed to parse service account JSON from env:', error);
    return null;
  }
};

const projectId = readEnv('FIREBASE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT');
const serviceAccount = parseServiceAccount();

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
      projectId: projectId || undefined,
    });

export const firebaseAuthAdmin = getAuth(adminApp);

export const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
};

export const verifyFirebaseToken = async (token) => {
  const decoded = await firebaseAuthAdmin.verifyIdToken(token);
  return {
    id: decoded.uid,
    email: decoded.email || null,
    raw: decoded,
  };
};

export const getRequestAuth = async (req, { allowGuest = false } = {}) => {
  const token = getBearerToken(req);
  if (!token) {
    return { token: null, isGuest: false, user: null };
  }

  if (allowGuest && token === 'unauthenticated') {
    return {
      token,
      isGuest: true,
      user: {
        id: 'guest_user',
        email: null,
        raw: null,
      },
    };
  }

  const user = await verifyFirebaseToken(token);
  return { token, isGuest: false, user };
};
