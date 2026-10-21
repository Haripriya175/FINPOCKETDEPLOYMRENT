# FinPocket Production Backup, Disaster Recovery & Restore Strategy

## 1. Objectives & SLAs
- **Recovery Point Objective (RPO)**: < 15 minutes (maximum acceptable data loss).
- **Recovery Time Objective (RTO)**: < 1 hour (maximum allowable downtime during full disaster recovery).

## 2. PostgreSQL Production Backup Architecture

### A. Continuous Write-Ahead Log (WAL) Archiving
- PostgreSQL WAL logs are continuously shipped to encrypted, versioned cloud object storage (e.g. AWS S3 with KMS / Google Cloud Storage).
- Enables Point-In-Time Recovery (PITR) down to the second of any operational incident.

### B. Daily Full Backups
- Automated daily logical and physical snapshots executed during off-peak hours (e.g. 02:00 UTC).
- Compressed using zstd and encrypted using AES-256-GCM.
- Retention policy:
  - Daily backups: Retained for 30 days.
  - Weekly backups: Retained for 12 weeks.
  - Monthly backups: Retained for 7 years (compliance & financial records).

## 3. SQLite Demo/Development Backup
For local development and demo instances, the SQLite database (`finpocket.db`) is protected by automated WAL-mode checkpointing and periodic file-level snapshots:
```bash
sqlite3 finpocket.db ".backup 'finpocket_backup_$(date +%Y%m%d_%H%M%S).db'"
```

## 4. Disaster Recovery Procedure (Step-by-Step)

1. **Incident Detection & Triage**:
   - Readiness probe `/health/ready` triggers alerting via PagerDuty/Slack.
   - On-call engineer initiates incident runbook.
2. **Infrastructure Provisioning**:
   - Spin up standby PostgreSQL instance via Terraform / cloud automation in secondary availability zone.
3. **Database Restore Execution**:
   ```bash
   # Download latest verified base backup
   aws s3 cp s3://finpocket-prod-backups/base_backup_latest.tar.gz /var/lib/postgresql/data/
   tar -xzf /var/lib/postgresql/data/base_backup_latest.tar.gz -C /var/lib/postgresql/data/
   
   # Apply WAL logs up to recovery target time
   echo "restore_command = 'aws s3 cp s3://finpocket-prod-wal/%f %p'" >> /var/lib/postgresql/data/postgresql.conf
   echo "recovery_target_time = '2026-09-19 12:00:00 UTC'" >> /var/lib/postgresql/data/postgresql.conf
   ```
4. **Data Integrity & Consistency Check**:
   - Run verification queries on accounts, transactions, and audit logs.
   - Verify that row counts and foreign keys are consistent.
5. **Traffic Rerouting**:
   - Update connection strings in Kubernetes/ECS task definitions.
   - Switch DNS / load balancer to new cluster.
6. **Post-Recovery Verification**:
   - Verify `/health/live` and `/health/ready`.
   - Run end-to-end synthetic health checks.

## 5. Backup Restore Verification Schedule
- Backups are automatically restored to an isolated staging environment weekly to prove non-corruption and measure actual RTO.
- A backup that has never been restored is considered unverified.
