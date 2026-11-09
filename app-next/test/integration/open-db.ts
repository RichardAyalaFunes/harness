// Helper process for the migration-race test: opens (and migrates) the database named in argv[2], prints the schema version.
import { openDb } from '../../lib/db/connection.ts';

const db = openDb(process.argv[2]);
console.log(`user_version=${db.prepare('PRAGMA user_version').get().user_version}`);
