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

  // Use Firestore transaction to prevent race conditions (double-spend)
  const fee = Math.floor(coinAmount * TRANSFER_FEE_RATE);
  const netAmount = coinAmount - fee;

  try {
    await db.runTransaction(async (tx) => {
      const senderRef = db.collection(Collections.USERS).doc(senderUid);
      const receiverRef = db.collection(Collections.USERS).doc(recipientUid);

      const [senderDoc, receiverDoc] = await Promise.all([
        tx.get(senderRef),
        tx.get(receiverRef),
      ]);

      if (!senderDoc.exists) throw new Error('Sender account not found');
      if (!receiverDoc.exists) throw new Error('Recipient account not found');

      const senderData = senderDoc.data()!;
      const receiverData = receiverDoc.data()!;

      if (senderData.status !== 'active') throw new Error('Your account is suspended');
      if (receiverData.status !== 'active') throw new Error('Recipient account is suspended');

      // Atomic balance check inside transaction — prevents double-spend
      if ((senderData.coinBalance || 0) < coinAmount) {
        throw new Error('Insufficient coin balance');
      }

      const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

      // Deduct from sender
      tx.update(senderRef, {
        coinBalance: firebaseAdmin.firestore.FieldValue.increment(-coinAmount),
        updatedAt: now,
      });

      // Credit to receiver
      tx.update(receiverRef, {
        coinBalance: firebaseAdmin.firestore.FieldValue.increment(netAmount),
        totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(netAmount),
        updatedAt: now,
      });

      // Ledger: sender
      tx.set(
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

      // Ledger: receiver
      tx.set(
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
    });
  } catch (err: any) {
    return { success: false, error: err.message || 'Transfer failed' };
  }

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
