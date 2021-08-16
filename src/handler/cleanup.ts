import { ScheduledHandler } from 'aws-lambda';
import 'source-map-support/register';
import { CleanupService } from '../service/cleanup';

export const handler: ScheduledHandler = async () => {
  await new CleanupService().run();
}
