import { Request, Response, NextFunction } from 'express';
import { auth, db, Collections } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  uid?: string;
  userRecord?: FirebaseFirestore.DocumentData;
}

/**
 * Verifies Firebase ID token from Authorization header.
 * Attaches uid to request object.
 */
export async function verifyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verifies user is an admin (super_admin or moderator).
 * Must be used AFTER verifyAuth.
 */
export async function verifyAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const adminDoc = await db.collection(Collections.ADMINS).doc(req.uid).get();

    if (!adminDoc.exists) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const adminData = adminDoc.data();
    if (!adminData || !['super_admin', 'moderator'].includes(adminData.role)) {
      res.status(403).json({ error: 'Insufficient admin role' });
      return;
    }

    req.userRecord = adminData;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

/**
 * Verifies user is a super_admin.
 * Must be used AFTER verifyAuth.
 */
export async function verifySuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.uid) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const adminDoc = await db.collection(Collections.ADMINS).doc(req.uid).get();

    if (!adminDoc.exists) {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }

    const adminData = adminDoc.data();
    if (!adminData || adminData.role !== 'super_admin') {
      res.status(403).json({ error: 'Super admin role required' });
      return;
    }

    req.userRecord = adminData;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
