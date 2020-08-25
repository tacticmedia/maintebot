import { EC2 } from 'aws-sdk';
import { DescribeSnapshotsResult } from 'aws-sdk/clients/ec2';

export class CleanupService {
    
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
            const result = await this.findSnapshots();

            nextToken = result.NextToken;

            await Promise.all(result.Snapshots.map(snapshot => {
                const expires = snapshot.Tags.find(tag => tag.Key === 'Expires')

                // Invalid snapshot, no Expires tag - we'll ignore it
                if (!expires.hasOwnProperty('Value')) {
                    return;
                }
                
                // The expiry date is in the future
                if (new Date(expires.Value) > this.today) {
                    return;
                }

                return this.ec2.deleteSnapshot({
                    SnapshotId: snapshot.SnapshotId
                }).promise();
            })); 
        } while (nextToken);        
    }
    
    /**
    * Loads all volumes in the current region with a "Backup" tag of value "daily" or "monthly"
    * 
    * @private
    * @param {string} [nextToken]
    * @returns {Promise<DescribeVolumesResult>}
    * @memberof BackupService
    */
    private async findSnapshots(nextToken?: string): Promise<DescribeSnapshotsResult> {
        return this.ec2.describeSnapshots({
            OwnerIds: [
                "self"
            ],
            NextToken: nextToken
        }).promise();
    }
}
