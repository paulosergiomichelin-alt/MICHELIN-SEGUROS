import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const FIREBASE_PROJECT_ID = 'gen-lang-client-0929974546'; // mesmo PROJECT_ID de _api/lib/adminFirebase.ts

export async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string }> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  if (!payload.sub) throw new Error('Token sem subject (uid)');
  return { uid: payload.sub, email: payload.email as string | undefined };
}
