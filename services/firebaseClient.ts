import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { runtimeConfig } from './runtimeConfig';

export type CompatSession = {
  user: {
    id: string;
    email?: string | null;
  };
  access_token: string;
};

const firebaseConfig = runtimeConfig.firebaseAuthAvailable ? {
  apiKey: runtimeConfig.firebaseApiKey!,
  authDomain: runtimeConfig.firebaseAuthDomain!,
  projectId: runtimeConfig.firebaseProjectId!,
  appId: runtimeConfig.firebaseAppId!,
  messagingSenderId: runtimeConfig.firebaseMessagingSenderId,
  storageBucket: runtimeConfig.firebaseStorageBucket,
  measurementId: runtimeConfig.firebaseMeasurementId,
} : null;

export const firebaseApp: FirebaseApp | null = firebaseConfig
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

const persistenceReadyPromise = firebaseAuth
  ? setPersistence(firebaseAuth, browserLocalPersistence).catch((error) => {
      console.warn('[FirebaseAuth] Failed to configure persistence:', error);
    })
  : Promise.resolve();

let initialAuthStateResolved = false;
let resolveInitialAuthState: (() => void) | null = null;
const initialAuthStatePromise = firebaseAuth
  ? new Promise<void>((resolve) => {
      resolveInitialAuthState = resolve;
      const unsubscribe = onIdTokenChanged(firebaseAuth, () => {
        if (!initialAuthStateResolved) {
          initialAuthStateResolved = true;
          resolve();
          unsubscribe();
        }
      });
    })
  : Promise.resolve();

const ensureAuthReady = async () => {
  await persistenceReadyPromise;
  await initialAuthStatePromise;
};

const buildCompatSession = async (user: User | null, forceRefresh = false): Promise<CompatSession | null> => {
  if (!user) {
    return null;
  }

  const accessToken = await user.getIdToken(forceRefresh);
  return {
    user: {
      id: user.uid,
      email: user.email,
    },
    access_token: accessToken,
  };
};

export const getCurrentSession = async (forceRefresh = false) => {
  await ensureAuthReady();
  return buildCompatSession(firebaseAuth?.currentUser || null, forceRefresh);
};

export const subscribeToAuthChanges = (
  callback: (event: 'SIGNED_IN' | 'SIGNED_OUT', session: CompatSession | null) => void,
) => {
  if (!firebaseAuth) {
    callback('SIGNED_OUT', null);
    return { unsubscribe() {} };
  }

  const unsubscribe = onIdTokenChanged(firebaseAuth, async (user) => {
    const session = await buildCompatSession(user);
    callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', session);
  });

  return { unsubscribe };
};

export const signInWithGooglePopup = async () => {
  if (!firebaseAuth) {
    throw new Error('Firebase auth is not configured.');
  }

  await ensureAuthReady();
  const provider = new GoogleAuthProvider();
  await signInWithPopup(firebaseAuth, provider);
  return getCurrentSession();
};

export const signInWithGoogleIdToken = async (idToken: string) => {
  if (!firebaseAuth) {
    throw new Error('Firebase auth is not configured.');
  }

  await ensureAuthReady();
  const credential = GoogleAuthProvider.credential(idToken);
  await signInWithCredential(firebaseAuth, credential);
  return getCurrentSession();
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!firebaseAuth) {
    throw new Error('Firebase auth is not configured.');
  }

  await ensureAuthReady();
  await createUserWithEmailAndPassword(firebaseAuth, email, password);
  return getCurrentSession();
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!firebaseAuth) {
    throw new Error('Firebase auth is not configured.');
  }

  await ensureAuthReady();
  await signInWithEmailAndPassword(firebaseAuth, email, password);
  return getCurrentSession();
};

export const signOutCurrentUser = async () => {
  if (!firebaseAuth) {
    return;
  }

  await ensureAuthReady();
  await signOut(firebaseAuth);
};
