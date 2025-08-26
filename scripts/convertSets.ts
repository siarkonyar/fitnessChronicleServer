import { firestore as db } from '../src/firebase';
import * as admin from 'firebase-admin';

type LegacySet = {
  setType?: string | null;
  value?: string | number | null;
  reps?: string | number | null;
};

type MigratedSet = {
  setType: 'normal' | 'warmup' | 'drop' | string;
  measure: 'kg' | 'lbs' | 'sec' | 'distance' | 'step' | string;
  value: string | null;
  reps: string | null;
};

async function migrateExerciseLogs(): Promise<void> {
  const projectId = (admin.app().options as any)?.projectId || (admin.app().options as any)?.credential?.projectId;
  console.log(`Running migration against project: ${projectId ?? 'unknown'}`);
  console.log(`FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST ?? 'unset'}`);
  console.log(`FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'unset'}`);

  const rootCollections = await db.listCollections();
  console.log('Root collections:', rootCollections.map(c => c.id));

  // Try aggregation count on users
  try {
    const usersCountAgg: any = await (db as any).collection('users').count().get();
    console.log(`Aggregation count(users) =>`, usersCountAgg.data().count);
  } catch (e) {
    console.log('Aggregation count(users) failed:', e);
  }

  // Try collection group count of fitnessLogs
  try {
    const logsCountAgg: any = await (db as any).collectionGroup('fitnessLogs').count().get();
    console.log(`Aggregation count(//fitnessLogs) =>`, logsCountAgg.data().count);
  } catch (e) {
    console.log('Aggregation count(//fitnessLogs) failed:', e);
  }

  const usersSnapshot = await db.collection('users').limit(5).get();
  console.log(`Found ${usersSnapshot.size} users.`);
  if (usersSnapshot.size > 0) {
    console.log('Sample user IDs:', usersSnapshot.docs.map(d => d.id));
  }

  // Inspect a few fitnessLogs to understand the actual parent paths
  const sampleLogsSnapshot = await db.collectionGroup('fitnessLogs').limit(5).get();
  if (!sampleLogsSnapshot.empty) {
    console.log('Sample fitnessLogs paths:');
    sampleLogsSnapshot.docs.forEach(doc => {
      const parentDocPath = doc.ref.parent.parent ? doc.ref.parent.parent.path : '(no parent doc)';
      console.log(` - ${doc.ref.path} (parent: ${parentDocPath})`);
    });
  }

  let batch = db.batch();
  let writesInBatch = 0;
  let totalLogsScanned = 0;
  let totalDocsQueued = 0;

  // Migrate using a collection group query to catch all fitnessLogs regardless of parent path
  const allLogsSnapshot = await db.collectionGroup('fitnessLogs').get();
  console.log(`Discovered ${allLogsSnapshot.size} fitnessLogs via collection group.`);

  for (const logDoc of allLogsSnapshot.docs) {
    const logData = logDoc.data();
    totalLogsScanned++;
    const updatedSets: MigratedSet[] = ((logData.sets as LegacySet[] | undefined) ?? []).map(
      (set) => {
        let measure: MigratedSet['measure'] = 'kg';
        let setType: MigratedSet['setType'] = 'normal';

        switch (set.setType) {
          case 'kg':
          case 'lbs':
            measure = set.setType;
            break;
          case 'time':
            measure = 'sec';
            break;
          case 'distance':
            measure = 'distance';
            break;
          case 'steps':
            measure = 'step';
            break;
        }

        const migrated: MigratedSet = {
          setType,
          measure,
          value: (set as any).value != null ? String((set as any).value) : null,
          reps: "8-9",
        };

        return migrated;
      }
    );

    if (updatedSets.length > 0) {
      batch.set(logDoc.ref, { sets: updatedSets }, { merge: true });
      writesInBatch++;
      totalDocsQueued++;

      if (writesInBatch >= 450) {
        console.log("⚡ Committing a batch of 450 writes...");
        await batch.commit();
        batch = db.batch();
        writesInBatch = 0;
      }
    }
  }

  if (writesInBatch > 0) {
    console.log("⚡ Committing final batch...");
    await batch.commit();
  }

  console.log(`Scanned ${totalLogsScanned} logs. Queued ${totalDocsQueued} docs for update.`);
  console.log('✅ Migration complete!');
}

if (require.main === module) {
  migrateExerciseLogs().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
