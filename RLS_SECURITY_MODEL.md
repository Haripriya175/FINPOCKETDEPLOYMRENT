# PostgreSQL Row-Level Security (RLS) & Multi-Tenant Isolation Model

## 1. Executive Summary & Principles
FinPocket implements defense-in-depth data isolation using **PostgreSQL Row-Level Security (RLS)**. Even if an application route has an authorization bug or an attacker manipulates JSON payload identifiers (`userId`), the database engine strictly rejects cross-tenant queries and mutations.

---

## 2. Server-Side Context Injection

> [!IMPORTANT]
> The database session context is NEVER established from client-supplied request bodies or URL parameters. It is derived exclusively from the cryptographically verified JWT access token in `authMiddleware`.

### PostgreSQL Context Propagation
When a connection is checked out from the pool for an authenticated request, the server executes:
```sql
SET LOCAL app.current_user_id = 'usr_authenticated_id';
```
Using `SET LOCAL` ensures the variable is scoped strictly to the current database transaction and automatically cleared when returned to the connection pool.

---

## 3. Comprehensive Table Policies

### 3.1 `bank_accounts`
```sql
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_isolation ON bank_accounts
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true))
    WITH CHECK (user_id = current_setting('app.current_user_id', true));
```

### 3.2 `transactions`
```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_isolation ON transactions
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true))
    WITH CHECK (user_id = current_setting('app.current_user_id', true));
```

### 3.3 `account_consents`
```sql
ALTER TABLE account_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_consents_isolation ON account_consents
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true))
    WITH CHECK (user_id = current_setting('app.current_user_id', true));
```

### 3.4 `provider_connections`
```sql
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_connections_isolation ON provider_connections
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true))
    WITH CHECK (user_id = current_setting('app.current_user_id', true));
```

---

## 4. RLS Verification Matrix

| Test Scenario | Acting User | Target Record Owner | Operation | Expected Database Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Select Own Accounts** | User A | User A | `SELECT` | Returns User A records | **ALLOWED** |
| **Select Cross-Tenant Accounts** | User A | User B | `SELECT` | Returns 0 rows (Empty Set) | **DENIED** |
| **Insert for Other Tenant** | User A | User B | `INSERT` | RLS WITH CHECK policy violation | **DENIED** |
| **Update Cross-Tenant Balance** | User A | User B | `UPDATE` | 0 rows affected | **DENIED** |
| **Delete Cross-Tenant Consents** | User A | User B | `DELETE` | 0 rows affected | **DENIED** |
