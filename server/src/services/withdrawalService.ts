import { db, Collections } from '../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { MIN_WITHDRAWAL_COINS, DEFAULT_EXCHANGE_RATE } from '../config/constants';

interface WithdrawalRequest {
  uid: string;
  method: 'easypaisa' | 'jazzcash' | 'usdt';
  coinAmount: number;
  accountNumber: string;
  accountName: string;
}

/**
 * Gets the current exchange rate from Firestore config.
 * Returns { coinsPerUnit, pkrPerUnit } e.g. { coinsPerUnit: 3000, pkrPerUnit: 100 }
 */
async function getExchangeRate(): Promise<{ coinsPerUnit: number; pkrPerUnit: number }> {
  const configDoc = await db.collection(Collections.CONFIG).doc('app').get();
  const config = configDoc.exists ? configDoc.data()! : {};
  return {
    coinsPerUnit: config.exchange_rate_coins || DEFAULT_EXCHANGE_RATE,
    pkrPerUnit: config.exchange_rate_pkr || 100,
  };
}

/**
 * Converts coins to PKR using the current exchange rate.
 */
function coinsToPkr(coins: number, rate: { coinsPerUnit: number; pkrPerUnit: number }): number {
  return Math.floor((coins / rate.coinsPerUnit) * rate.pkrPerUnit);
}

/**
 * Creates a withdrawal request (coins → PKR).
 * Validates balance, deducts coins, creates withdrawal record.
 */
export async function requestWithdrawal(req: WithdrawalRequest) {
  const { uid, method, coinAmount, accountNumber, accountName } = req;

  if (!['easypaisa', 'jazzcash', 'usdt'].includes(method)) {
    throw new Error('Invalid withdrawal method');
  }

  if (coinAmount < MIN_WITHDRAWAL_COINS) {
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_COINS} coins`);
  }

  if (!accountNumber || accountNumber.trim().length < 5) {
    throw new Error('Invalid account number');
  }

  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data()!;
  if (userData.status === 'banned') {
    throw new Error('Account is suspended');
  }

  const currentCoins = userData.coinBalance || 0;
  if (currentCoins < coinAmount) {
    throw new Error('Insufficient coin balance');
  }

  // Check for pending withdrawal
  const pendingQuery = await db.collection(Collections.WITHDRAWALS)
    .where('uid', '==', uid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!pendingQuery.empty) {
    throw new Error('You already have a pending withdrawal request');
  }

  // Calculate PKR value using exchange rate
  const rate = await getExchangeRate();
  const pkrAmount = coinsToPkr(coinAmount, rate);

  // Calculate fee (2% for USDT, free for local methods)
  const feeRate = method === 'usdt' ? 0.02 : 0;
  const feePkr = Math.floor(pkrAmount * feeRate);
  const netPkr = pkrAmount - feePkr;

  const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc();
  const batch = db.batch();

  // Deduct coins from user
  batch.update(userRef, {
    coinBalance: FieldValue.increment(-coinAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create withdrawal record
  batch.set(withdrawalRef, {
    uid,
    method,
    coinAmount,
    pkrAmount,
    fee: feePkr,
    netAmount: netPkr,
    exchangeRate: `${rate.coinsPerUnit} coins = ${rate.pkrPerUnit} PKR`,
    accountNumber: accountNumber.trim(),
    accountName: accountName.trim(),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'withdrawal',
      amount: -coinAmount,
      currency: 'coins',
      pkrAmount,
      withdrawalId: withdrawalRef.id,
      method,
      createdAt: FieldValue.serverTimestamp(),
    }
  );

  await batch.commit();

  return {
    withdrawalId: withdrawalRef.id,
    method,
    coinAmount,
    pkrAmount,
    fee: feePkr,
    netAmount: netPkr,
    status: 'pending',
  };
}

export async function getWithdrawalHistory(uid: string) {
  const snapshot = await db.collection(Collections.WITHDRAWALS)
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toMillis() || 0,
    updatedAt: doc.data().updatedAt?.toMillis() || 0,
  }));
}

export async function getPendingWithdrawals() {
  const snapshot = await db.collection(Collections.WITHDRAWALS)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toMillis() || 0,
    updatedAt: doc.data().updatedAt?.toMillis() || 0,
  }));
}

export async function getAllWithdrawals(status?: string, limit = 50) {
  let query = db.collection(Collections.WITHDRAWALS)
    .orderBy('createdAt', 'desc')
    .limit(limit) as FirebaseFirestore.Query;

  if (status && status !== 'all') {
    query = db.collection(Collections.WITHDRAWALS)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toMillis() || 0,
    updatedAt: doc.data().updatedAt?.toMillis() || 0,
  }));
}

export async function approveWithdrawal(withdrawalId: string, adminUid: string) {
  const ref = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);
  const doc = await ref.get();

  if (!doc.exists) throw new Error('Withdrawal not found');
  const data = doc.data()!;
  if (data.status !== 'pending') throw new Error(`Withdrawal is already ${data.status}`);

  const batch = db.batch();

  batch.update(ref, {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.collection(Collections.ADMIN_ACTIONS).doc(), {
    adminUid,
    action: 'approve_withdrawal',
    targetId: withdrawalId,
    targetUid: data.uid,
    details: { method: data.method, coinAmount: data.coinAmount, pkrAmount: data.pkrAmount },
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { success: true };
}

export async function rejectWithdrawal(withdrawalId: string, adminUid: string, reason: string) {
  const ref = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);
  const doc = await ref.get();

  if (!doc.exists) throw new Error('Withdrawal not found');
  const data = doc.data()!;
  if (data.status !== 'pending') throw new Error(`Withdrawal is already ${data.status}`);

  const batch = db.batch();

  batch.update(ref, {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: FieldValue.serverTimestamp(),
    rejectionReason: reason || 'Rejected by admin',
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Refund coins to user
  batch.update(db.collection(Collections.USERS).doc(data.uid), {
    coinBalance: FieldValue.increment(data.coinAmount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(
    db.collection(Collections.LEDGER).doc(data.uid).collection('entries').doc(),
    {
      uid: data.uid,
      type: 'withdrawal_refund',
      amount: data.coinAmount,
      currency: 'coins',
      withdrawalId,
      reason: reason || 'Withdrawal rejected',
      createdAt: FieldValue.serverTimestamp(),
    }
  );

  batch.set(db.collection(Collections.ADMIN_ACTIONS).doc(), {
    adminUid,
    action: 'reject_withdrawal',
    targetId: withdrawalId,
    targetUid: data.uid,
    details: { method: data.method, coinAmount: data.coinAmount, reason },
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { success: true };
}
