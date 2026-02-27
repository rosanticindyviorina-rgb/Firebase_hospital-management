import { db, Collections } from '../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

const MIN_WITHDRAWAL_PKR = 500;

interface WithdrawalRequest {
  uid: string;
  method: 'easypaisa' | 'jazzcash' | 'usdt';
  amount: number;
  accountNumber: string;
  accountName: string;
}

/**
 * Creates a withdrawal request.
 * Validates balance, deducts amount, creates withdrawal record.
 */
export async function requestWithdrawal(req: WithdrawalRequest) {
  const { uid, method, amount, accountNumber, accountName } = req;

  if (!['easypaisa', 'jazzcash', 'usdt'].includes(method)) {
    throw new Error('Invalid withdrawal method');
  }

  if (amount < MIN_WITHDRAWAL_PKR) {
    throw new Error(`Minimum withdrawal is PKR ${MIN_WITHDRAWAL_PKR}`);
  }

  if (!accountNumber || accountNumber.trim().length < 5) {
    throw new Error('Invalid account number');
  }

  // Check user exists and has sufficient balance
  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data()!;
  if (userData.status === 'banned') {
    throw new Error('Account is suspended');
  }

  const currentBalance = userData.balance || 0;
  if (currentBalance < amount) {
    throw new Error('Insufficient balance');
  }

  // Check for pending withdrawal (only one at a time)
  const pendingQuery = await db.collection(Collections.WITHDRAWALS)
    .where('uid', '==', uid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  if (!pendingQuery.empty) {
    throw new Error('You already have a pending withdrawal request');
  }

  // Calculate fee (2% for USDT, free for local methods)
  const feeRate = method === 'usdt' ? 0.02 : 0;
  const fee = amount * feeRate;
  const netAmount = amount - fee;

  // Atomic: deduct balance and create withdrawal
  const withdrawalRef = db.collection(Collections.WITHDRAWALS).doc();
  const batch = db.batch();

  // Deduct from user balance
  batch.update(userRef, {
    balance: FieldValue.increment(-amount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create withdrawal record
  batch.set(withdrawalRef, {
    uid,
    method,
    amount,
    fee,
    netAmount,
    accountNumber: accountNumber.trim(),
    accountName: accountName.trim(),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Create ledger entry
  const ledgerRef = db.collection(Collections.LEDGER)
    .doc(uid)
    .collection('entries')
    .doc();

  batch.set(ledgerRef, {
    uid,
    type: 'withdrawal',
    amount: -amount,
    withdrawalId: withdrawalRef.id,
    method,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return {
    withdrawalId: withdrawalRef.id,
    method,
    amount,
    fee,
    netAmount,
    status: 'pending',
  };
}

/**
 * Gets withdrawal history for a user.
 */
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

/**
 * Admin: Get all pending withdrawals.
 */
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

/**
 * Admin: Get all withdrawals with optional status filter.
 */
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

/**
 * Admin: Approve a withdrawal.
 */
export async function approveWithdrawal(withdrawalId: string, adminUid: string) {
  const ref = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new Error('Withdrawal not found');
  }

  const data = doc.data()!;
  if (data.status !== 'pending') {
    throw new Error(`Withdrawal is already ${data.status}`);
  }

  const batch = db.batch();

  batch.update(ref, {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Log admin action
  const actionRef = db.collection(Collections.ADMIN_ACTIONS).doc();
  batch.set(actionRef, {
    adminUid,
    action: 'approve_withdrawal',
    targetId: withdrawalId,
    targetUid: data.uid,
    details: { method: data.method, amount: data.amount },
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return { success: true };
}

/**
 * Admin: Reject a withdrawal (refunds the balance).
 */
export async function rejectWithdrawal(withdrawalId: string, adminUid: string, reason: string) {
  const ref = db.collection(Collections.WITHDRAWALS).doc(withdrawalId);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new Error('Withdrawal not found');
  }

  const data = doc.data()!;
  if (data.status !== 'pending') {
    throw new Error(`Withdrawal is already ${data.status}`);
  }

  const batch = db.batch();

  // Update withdrawal status
  batch.update(ref, {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: FieldValue.serverTimestamp(),
    rejectionReason: reason || 'Rejected by admin',
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Refund balance to user
  const userRef = db.collection(Collections.USERS).doc(data.uid);
  batch.update(userRef, {
    balance: FieldValue.increment(data.amount),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Refund ledger entry
  const ledgerRef = db.collection(Collections.LEDGER)
    .doc(data.uid)
    .collection('entries')
    .doc();

  batch.set(ledgerRef, {
    uid: data.uid,
    type: 'withdrawal_refund',
    amount: data.amount,
    withdrawalId,
    reason: reason || 'Withdrawal rejected',
    createdAt: FieldValue.serverTimestamp(),
  });

  // Log admin action
  const actionRef = db.collection(Collections.ADMIN_ACTIONS).doc();
  batch.set(actionRef, {
    adminUid,
    action: 'reject_withdrawal',
    targetId: withdrawalId,
    targetUid: data.uid,
    details: { method: data.method, amount: data.amount, reason },
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return { success: true };
}
