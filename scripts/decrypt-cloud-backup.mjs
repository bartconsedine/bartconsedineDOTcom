// Recovery inspection only. This decrypts files; it never restores a database.
import { resolve } from 'node:path';
import { backupKey, decryptBackup } from './cloud-backup.mjs';
try {
  if(process.argv.length!==4) throw new Error('Arguments required');
  const key=backupKey(process.env.CLOUD_BACKUP_KEY);
  try {await decryptBackup(resolve(process.argv[2]),resolve(process.argv[3]),key);} finally {key.fill(0);}
  console.log('Backup decrypted and checksum verified. No database restore ran.');
} catch {console.error('Backup decryption failed. Check the protected key and encrypted artifact privately.');process.exitCode=1;}
