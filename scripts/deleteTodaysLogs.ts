import { firestore as db } from '../src/firebase';
import * as admin from 'firebase-admin';

function getTodayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function deleteTodaysLogs(): Promise<void> {
  const today = getTodayIsoDate();
  const projectId = (admin.app().options as any)?.projectId || (admin.app().options as any)?.credential?.projectId;
  console.log(`Running delete against project: ${projectId ?? 'unknown'}`);
  console.log(`Scanning //fitnessLogs by pages and filtering date == ${today} (no index needed)`);

  const idField = admin.firestore.FieldPath.documentId();
  const pageSize = 500;

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let totalScanned = 0;
  let totalDeleted = 0;

  while (true) {
    let query = db.collectionGroup('fitnessLogs').orderBy(idField).limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    totalScanned += snapshot.size;

    let batch = db.batch();
    let writesInBatch = 0;

    for (const doc of snapshot.docs) {
      lastDoc = doc; // advance cursor
      const logDate = (doc.get('date') as string | undefined) ?? '';
      if (logDate === today) {
        batch.delete(doc.ref);
        writesInBatch++;

        if (writesInBatch >= 450) {
          console.log('⚡ Committing a batch of 450 deletes...');
          await batch.commit();
          totalDeleted += writesInBatch;
          batch = db.batch();
          writesInBatch = 0;
        }
      }
    }

    if (writesInBatch > 0) {
      console.log('⚡ Committing final batch for this page...');
      await batch.commit();
      totalDeleted += writesInBatch;
    }

    console.log(`Scanned ${totalScanned} docs so far. Deleted ${totalDeleted} so far.`);
  }

  console.log(`Done. Scanned ${totalScanned}. Deleted ${totalDeleted} logs dated ${today}.`);
}

if (require.main === module) {
  deleteTodaysLogs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error while deleting logs:', err);
      process.exit(1);
    });
}
