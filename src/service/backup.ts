import { EC2 } from 'aws-sdk';
import { DescribeVolumesResult, Volume, Tag, Snapshot } from 'aws-sdk/clients/ec2';
import { BackupFrequency } from '../enum/backup-frequency.enum';

export class BackupService {

    private ec2: EC2 = new EC2();
    private today: Date = new Date();

    /**
     * The worker method that makes the backup happen.
     * 
     * It loads all the volumes and creates a snapshot of those needing it.
     *
     * @memberof BackupService
     */
    public async run() {
        let nextToken = null;
        do {
            const result = await this.findVolumes();
            nextToken = result.NextToken;

            for (const volume of result.Volumes) {
                if (!this.dueForBackup(volume)) {
                    console.log(`${volume.VolumeId} is fine.`);
                    continue;
                }

                console.log(`${volume.VolumeId} needs a backup.`);
                await this.makeSnapshot(volume);
                console.log(`${volume.VolumeId} snapshot created.`);
            }

        } while (nextToken);
    }

    /**
     * A shorthand method for testing whether the date object is today, or not.
     *
     * @private
     * @param {Date} date
     * @returns {boolean}
     * @memberof BackupService
     */
    private isToday(date: Date): boolean {
        return date.getFullYear() === this.today.getFullYear()
            && date.getDate() === this.today.getDate()
            && date.getMonth() === this.today.getMonth();
    }

    /**
     * Returns a "next month" date for the daily snapshot expiry
     *
     * @private
     * @returns {Date}
     * @memberof BackupService
     */
    private nextMonth(): Date {
        const date = new Date();
        var d = date.getDate();
        date.setMonth(date.getMonth() + 1);
        if (date.getDate() != d) {
            date.setDate(0);
        }
        return date;
    }

    /**
     * Returns a "next year" date for the monthly snapshot expiry
     *
     * @private
     * @returns {Date}
     * @memberof BackupService
     */
    private nextYear(): Date {
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        return date;
    }

    /**
     * A shorthand method for converting the string tag value into BackupFrequency type
     *
     * @private
     * @param {Volume} volume
     * @returns {BackupFrequency}
     * @memberof BackupService
     */
    private getBackupFrequency(volume: Volume): BackupFrequency {
        const tag = volume.Tags.find(t => t.Key === 'Backup');

        if (tag && tag.Value.toLowerCase() === 'monthly') {
            return BackupFrequency.Monthly;
        }

        return BackupFrequency.Daily;
    }

    /**
    * Loads all volumes in the current region with a "Backup" tag of value "daily" or "monthly"
    * 
    * @private
    * @param {string} [nextToken]
    * @returns {Promise<DescribeVolumesResult>}
    * @memberof BackupService
    */
    private async findVolumes(nextToken?: string): Promise<DescribeVolumesResult> {
        return await this.ec2.describeVolumes({
            Filters: [
                {
                    Name: "tag:Backup",
                    Values: [
                        "daily",
                        "monthly"
                    ]
                }
            ],
            NextToken: nextToken
        }).promise();
    }

    /**
    * Decides whether the specified Volume needs a backup
    *
    * @private
    * @param {Volume} volume
    * @returns {boolean}
    * @memberof BackupService
    */
    private dueForBackup(volume: Volume): boolean {
        const lastBackupTag: Tag = volume.Tags.find(t => t.Key === 'LastBackup') || { Key: 'LastBackup', Value: '1970-01-01' };
        const lastBackup: Date = new Date(lastBackupTag.Value);

        // Monthly backups can take place on the first day of the month only
        if (this.getBackupFrequency(volume) === BackupFrequency.Monthly && this.today.getDate() !== 1) {
            return false;
        }

        // And if the backup is a daily one, or it's the first day of the month,
        //  we only want a snapshot if the latest one is not from today
        return !this.isToday(lastBackup);
    }

    /**
     * Creates snapshots and updates tags of the EBS volume and the created snapshot
     *
     * @private
     * @param {Volume} volume
     * @returns {Promise<boolean>}
     * @memberof BackupService
     */
    private async makeSnapshot(volume: Volume): Promise<boolean> {

        var params = {
            Description: `Automated ${this.getBackupFrequency(volume)} snapshot.`,
            VolumeId: volume.VolumeId
        };

        let retries = 0;
        let snapshot: Snapshot;
        do {
            try {
                snapshot = await this.ec2.createSnapshot(params).promise();
            } catch (error) {
                if (error.code === 'SnapshotCreationPerVolumeRateExceeded') {
                    console.log(`${volume.VolumeId} snapshot request rate-limited. Waiting 5 seconds.`)
                    await new Promise(r => setTimeout(r, 5000));
                } else {
                    throw error;
                }
            }
        } while (!snapshot && ++retries < 5);

        // It might be handy to know what type of snapshot this is, so let's store that info.
        const tags: Tag[] = [
            {
                Key: 'Frequency',
                Value: this.getBackupFrequency(volume)
            }
        ];

        if (this.today.getDate() === 1 && this.today.getMonth() === 1) {
            // Do not add any expire date on images created on 1st January - we'll keep those forever.
        } else {
            // The Expires tag obviously carries the date after which the snapshot could be deleted
            if (tags[0].Value === BackupFrequency.Monthly || this.today.getDate() === 1) {
                // All [monthly snapshots] and all [daily snapshots taken on the first day of the month] are kept for a year
                tags.push({
                    Key: 'Expires',
                    Value: this.nextYear().toISOString()
                });
            } else {
                // And all others are kept for a month
                tags.push({
                    Key: 'Expires',
                    Value: this.nextMonth().toISOString()
                });
            }
        }

        // It's also good to name the snapshot so we can see immediately what volume it belongs to
        const nameTag: Tag = volume.Tags.find(t => t.Key === 'Name');
        if (nameTag) {
            tags.push(nameTag);
        }

        // Update the snapshot to make sure we delete things when needed
        await this.ec2.createTags({
            Resources: [
                snapshot.SnapshotId
            ],
            Tags: tags
        }).promise();

        // And update the volume to prevent creating another snapshot today
        await this.ec2.createTags({
            Resources: [
                volume.VolumeId
            ],
            Tags: [
                {
                    Key: 'LastBackup',
                    Value: new Date().toISOString()
                }
            ]
        }).promise();

        return true;
    }
}
