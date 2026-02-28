import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'kamyabi-cash-app',
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const firebaseAdmin = admin;

// Collection references
export const Collections = {
  USERS: 'users',
  DEVICES: 'devices',
  REFERRALS: 'referrals',
  TASKS: 'tasks',
  SPINS: 'spins',
  LEDGER: 'ledger',
  BANS: 'bans',
  CONFIG: 'config',
  REFERRAL_CODES: 'referralCodes',
  ADMIN_ACTIONS: 'adminActions',
  ADMINS: 'admins',
  WITHDRAWALS: 'withdrawals',
  SALARY_APPROVALS: 'salaryApprovals',
} as const;
