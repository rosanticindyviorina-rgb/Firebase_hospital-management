import { db, Collections, firebaseAdmin } from '../config/firebase';

const MIN_TRANSFER_COINS = 3000;
const TRANSFER_FEE_RATE = 0.10; // 10%

/**
 * Transfer coins from one user to another.
 * recipientIdentifier can be a uid OR a referral code.
 */
export async function transferCoins(
  senderUid: string,
  recipientIdentifier: string,
  coinAmount: number
): Promise<{
  success: boolean;
  error?: string;
  fee?: number;
  netAmount?: number;
  recipientUid?: string;
}> {
  // Validate amount
  if (!Number.isInteger(coinAmount) || coinAmount < MIN_TRANSFER_COINS) {
    return { success: false, error: `Minimum transfer is ${MIN_TRANSFER_COINS} coins` };
  }

  // Resolve recipient: try uid first, then referral code
  let recipientUid: string | null = null;

  const recipientByUid = await db.collection(Collections.USERS).doc(recipientIdentifier).get();
  if (recipientByUid.exists) {
    recipientUid = recipientIdentifier;
  } else {
    // Try lookup by referral code (doc ID = code)
    const codeDoc = await db.collection(Collections.REFERRAL_CODES)
      .doc(recipientIdentifier.toUpperCase())
      .get();

    if (codeDoc.exists) {
      recipientUid = codeDoc.data()!.ownerUid;
    }
  }

  if (!recipientUid) {
    return { success: false, error: 'Recipient not found' };
  }

  // Cannot transfer to yourself
  if (senderUid === recipientUid) {
    return { success: false, error: 'Cannot transfer coins to yourself' };
  }

  // Fetch both users
  const [senderDoc, receiverDoc] = await Promise.all([
    db.collection(Collections.USERS).doc(senderUid).get(),
    db.collection(Collections.USERS).doc(recipientUid).get(),
  ]);

  if (!senderDoc.exists) {
    return { success: false, error: 'Sender account not found' };
  }
  if (!receiverDoc.exists) {
    return { success: false, error: 'Recipient account not found' };
  }

  const senderData = senderDoc.data()!;
  const receiverData = receiverDoc.data()!;

  // Check both users are active (not banned)
  if (senderData.status !== 'active') {
    return { success: false, error: 'Your account is suspended' };
  }
  if (receiverData.status !== 'active') {
    return { success: false, error: 'Recipient account is suspended' };
  }

  // Check sender balance
  if ((senderData.coinBalance || 0) < coinAmount) {
    return { success: false, error: 'Insufficient coin balance' };
  }

  // Calculate fee and net amount
  const fee = Math.floor(coinAmount * TRANSFER_FEE_RATE);
  const netAmount = coinAmount - fee;

  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Deduct full amount from sender
  batch.update(db.collection(Collections.USERS).doc(senderUid), {
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(-coinAmount),
    updatedAt: now,
  });

  // Credit net amount to receiver
  batch.update(db.collection(Collections.USERS).doc(recipientUid), {
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(netAmount),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(netAmount),
    updatedAt: now,
  });

  // Ledger entry for sender (negative)
  batch.set(
    db.collection(Collections.LEDGER).doc(senderUid).collection('entries').doc(),
    {
      uid: senderUid,
      type: 'transfer_sent',
      amount: -coinAmount,
      fee,
      netAmount,
      currency: 'coins',
      recipientUid,
      createdAt: now,
    }
  );

  // Ledger entry for receiver (positive)
  batch.set(
    db.collection(Collections.LEDGER).doc(recipientUid).collection('entries').doc(),
    {
      uid: recipientUid,
      type: 'transfer_received',
      amount: netAmount,
      fee,
      currency: 'coins',
      senderUid,
      createdAt: now,
    }
  );

  await batch.commit();

  return { success: true, fee, netAmount, recipientUid };
}

/**
 * Get transfer history (sent and received) for a user.
 */
export async function getTransferHistory(
  uid: string,
  limit = 20
): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await db.collection(Collections.LEDGER)
    .doc(uid)
    .collection('entries')
    .where('type', 'in', ['transfer_sent', 'transfer_received'])
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
