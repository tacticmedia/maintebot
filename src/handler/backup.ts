import { ScheduledHandler } from 'aws-lambda';
import 'source-map-support/register';
import { BackupService } from '../service/backup';

export const handler: ScheduledHandler = async () => {
  await new BackupService().run();
} 
